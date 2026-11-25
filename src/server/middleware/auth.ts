import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { adminAuth } from '../../lib/firebase-admin.ts';
import { findUserById, upsertFirebaseUser, type DbUser } from '../../db/repository.ts';
import { env } from '../config/env.ts';

export interface AuthRequest extends Request {
  user?: DbUser;
}

interface LocalJwtPayload {
  userId: number;
  uid: string;
  email: string;
  role: string;
}

export function signLocalJwt(user: DbUser): string {
  const payload: LocalJwtPayload = {
    userId: user.id,
    uid: user.uid,
    email: user.email,
    role: user.role,
  };
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '24h' });
}

async function resolveUserFromToken(token: string): Promise<DbUser | null> {
  // 1. Try local JWT first (fast, offline verification)
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as LocalJwtPayload;
    if (decoded && typeof decoded.userId === 'number') {
      const user = await findUserById(decoded.userId);
      if (user) return user;
    }
  } catch {
    // Not a local JWT; attempt Firebase ID token verification
  }

  // 2. Try Firebase ID token verification
  try {
    const decodedFirebase = await adminAuth.verifyIdToken(token);
    const email = decodedFirebase.email || `${decodedFirebase.uid}@users.local`;
    const user = await upsertFirebaseUser(
      decodedFirebase.uid,
      email,
      decodedFirebase.name || decodedFirebase.email?.split('@')[0]
    );
    return user;
  } catch {
    return null;
  }
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in to continue.' });
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({ error: 'Missing authentication token.' });
  }

  try {
    const user = await resolveUserFromToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Session expired or invalid token. Please sign in again.' });
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication service temporarily unavailable.' });
  }
}

export async function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token) {
      try {
        const user = await resolveUserFromToken(token);
        if (user) req.user = user;
      } catch {
        // Proceed as unauthenticated guest
      }
    }
  }
  next();
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator privileges required to access this resource.' });
  }
  next();
}

export function sanitizeUser(user: DbUser) {
  return {
    id: user.id,
    uid: user.uid,
    email: user.email,
    name: user.name,
    role: user.role,
    authProvider: user.authProvider,
    createdAt: user.createdAt,
  };
}
