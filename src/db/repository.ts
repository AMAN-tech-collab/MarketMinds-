import crypto from 'crypto';
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  analysisHistory,
  apiLogs,
  portfolioHoldings,
  predictionHistory,
  savedScreenerFilters,
  searchHistory,
  users,
  watchlistItems,
} from './schema.ts';
import { env } from '../server/config/env.ts';

export type DbUser = typeof users.$inferSelect;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export async function upsertFirebaseUser(uid: string, email: string, name?: string): Promise<DbUser> {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const displayName = (name || cleanEmail.split('@')[0] || 'Investor').trim();
    const isOwner = cleanEmail === env.ownerAdminEmail.toLowerCase();

    const existing = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    if (existing.length > 0) {
      const updated = await db
        .update(users)
        .set({
          email: cleanEmail,
          name: existing[0].name || displayName,
          role: isOwner ? 'admin' : existing[0].role,
          updatedAt: new Date(),
        })
        .where(eq(users.uid, uid))
        .returning();
      return updated[0];
    }

    // Check if an account with the same email already exists (link UID cleanly)
    const byEmail = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
    if (byEmail.length > 0) {
      const linked = await db
        .update(users)
        .set({
          uid,
          authProvider: 'google',
          role: isOwner ? 'admin' : byEmail[0].role,
          updatedAt: new Date(),
        })
        .where(eq(users.id, byEmail[0].id))
        .returning();
      return linked[0];
    }

    const inserted = await db
      .insert(users)
      .values({
        uid,
        email: cleanEmail,
        name: displayName,
        role: isOwner ? 'admin' : 'user',
        authProvider: 'google',
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: { email: cleanEmail, updatedAt: new Date() },
      })
      .returning();

    return inserted[0];
  } catch (error) {
    console.error('Database error upserting Firebase user:', error);
    throw new Error('Unable to synchronize user account.', { cause: error });
  }
}

export async function createLocalUser(email: string, name: string, password: string): Promise<DbUser> {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const existing = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
    if (existing.length > 0) {
      throw new Error('EMAIL_EXISTS');
    }

    const uid = `local_${crypto.randomUUID()}`;
    const isOwner = cleanEmail === env.ownerAdminEmail.toLowerCase();
    const passwordHash = hashPassword(password);

    const inserted = await db
      .insert(users)
      .values({
        uid,
        email: cleanEmail,
        name: name.trim(),
        passwordHash,
        role: isOwner ? 'admin' : 'user',
        authProvider: 'local',
      })
      .returning();

    return inserted[0];
  } catch (error: any) {
    if (error?.message === 'EMAIL_EXISTS') throw error;
    console.error('Database error creating local user:', error);
    throw new Error('Unable to create user account.', { cause: error });
  }
}

export async function findUserByEmail(email: string): Promise<DbUser | null> {
  try {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email.trim().toLowerCase()))
      .limit(1);
    return rows[0] || null;
  } catch (error) {
    console.error('Database error finding user by email:', error);
    throw new Error('Unable to query user account.', { cause: error });
  }
}

export async function findUserById(id: number): Promise<DbUser | null> {
  try {
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] || null;
  } catch (error) {
    console.error('Database error finding user by id:', error);
    throw new Error('Unable to query user account.', { cause: error });
  }
}

export async function updateUserProfile(userId: number, name: string): Promise<DbUser> {
  try {
    const rows = await db
      .update(users)
      .set({ name: name.trim(), updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return rows[0];
  } catch (error) {
    console.error('Database error updating user profile:', error);
    throw new Error('Unable to update profile.', { cause: error });
  }
}

export async function updateUserPassword(userId: number, newPassword: string): Promise<void> {
  try {
    const passwordHash = hashPassword(newPassword);
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));
  } catch (error) {
    console.error('Database error updating password:', error);
    throw new Error('Unable to update password.', { cause: error });
  }
}

export async function countAdmins(): Promise<number> {
  try {
    const rows = await db
      .select({ value: count() })
      .from(users)
      .where(eq(users.role, 'admin'));
    return Number(rows[0]?.value ?? 0);
  } catch (error) {
    console.error('Database error counting admins:', error);
    throw new Error('Unable to check admin status.', { cause: error });
  }
}

export async function promoteUserToAdmin(userId: number): Promise<DbUser> {
  try {
    const rows = await db
      .update(users)
      .set({ role: 'admin', updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return rows[0];
  } catch (error) {
    console.error('Database error promoting admin:', error);
    throw new Error('Unable to grant admin privileges.', { cause: error });
  }
}

// Portfolio CRUD
export async function getUserPortfolio(userId: number) {
  try {
    return await db
      .select()
      .from(portfolioHoldings)
      .where(eq(portfolioHoldings.userId, userId))
      .orderBy(desc(portfolioHoldings.createdAt));
  } catch (error) {
    console.error('Database error fetching portfolio:', error);
    throw new Error('Unable to load portfolio holdings.', { cause: error });
  }
}

export async function addPortfolioHolding(input: {
  userId: number;
  symbol: string;
  exchange: string;
  country?: string;
  currency?: string;
  companyName: string;
  sector: string;
  quantity: number;
  avgBuyPrice: number;
  purchaseDate: string;
  notes?: string;
}) {
  try {
    const rows = await db
      .insert(portfolioHoldings)
      .values({
        ...input,
        country: input.country || 'India',
        currency: input.currency || 'INR',
      })
      .returning();
    return rows[0];
  } catch (error) {
    console.error('Database error adding holding:', error);
    throw new Error('Unable to save holding.', { cause: error });
  }
}

export async function updatePortfolioHolding(
  userId: number,
  holdingId: number,
  updates: { quantity: number; avgBuyPrice: number; purchaseDate: string; notes?: string }
) {
  try {
    const rows = await db
      .update(portfolioHoldings)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(portfolioHoldings.id, holdingId), eq(portfolioHoldings.userId, userId)))
      .returning();
    return rows[0] || null;
  } catch (error) {
    console.error('Database error updating holding:', error);
    throw new Error('Unable to update holding.', { cause: error });
  }
}

export async function deletePortfolioHolding(userId: number, holdingId: number) {
  try {
    const rows = await db
      .delete(portfolioHoldings)
      .where(and(eq(portfolioHoldings.id, holdingId), eq(portfolioHoldings.userId, userId)))
      .returning();
    return rows[0] || null;
  } catch (error) {
    console.error('Database error deleting holding:', error);
    throw new Error('Unable to delete holding.', { cause: error });
  }
}

// Watchlist CRUD (supports multiple named watchlists & international stocks)
export async function getUserWatchlist(userId: number, listName?: string) {
  try {
    if (listName && listName !== 'ALL') {
      return await db
        .select()
        .from(watchlistItems)
        .where(and(eq(watchlistItems.userId, userId), eq(watchlistItems.listName, listName)))
        .orderBy(desc(watchlistItems.createdAt));
    }
    return await db
      .select()
      .from(watchlistItems)
      .where(eq(watchlistItems.userId, userId))
      .orderBy(desc(watchlistItems.createdAt));
  } catch (error) {
    console.error('Database error fetching watchlist:', error);
    throw new Error('Unable to load watchlist.', { cause: error });
  }
}

export async function addWatchlistItem(input: {
  userId: number;
  listName?: string;
  symbol: string;
  exchange: string;
  country?: string;
  currency?: string;
  companyName: string;
  sector: string;
  targetPrice?: number | null;
  notes?: string;
}) {
  try {
    const targetList = (input.listName || 'Core Watchlist').trim() || 'Core Watchlist';
    const existing = await db
      .select()
      .from(watchlistItems)
      .where(
        and(
          eq(watchlistItems.userId, input.userId),
          eq(watchlistItems.listName, targetList),
          eq(watchlistItems.symbol, input.symbol),
          eq(watchlistItems.exchange, input.exchange)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    const rows = await db
      .insert(watchlistItems)
      .values({
        ...input,
        listName: targetList,
        country: input.country || 'India',
        currency: input.currency || 'INR',
      })
      .returning();
    return rows[0];
  } catch (error) {
    console.error('Database error adding watchlist item:', error);
    throw new Error('Unable to add stock to watchlist.', { cause: error });
  }
}

export async function deleteWatchlistItem(userId: number, itemId: number) {
  try {
    const rows = await db
      .delete(watchlistItems)
      .where(and(eq(watchlistItems.id, itemId), eq(watchlistItems.userId, userId)))
      .returning();
    return rows[0] || null;
  } catch (error) {
    console.error('Database error deleting watchlist item:', error);
    throw new Error('Unable to remove stock from watchlist.', { cause: error });
  }
}

// Saved Screener Filters
export async function getUserScreenerFilters(userId: number) {
  try {
    return await db
      .select()
      .from(savedScreenerFilters)
      .where(eq(savedScreenerFilters.userId, userId))
      .orderBy(desc(savedScreenerFilters.createdAt));
  } catch (error) {
    console.error('Database error fetching screener filters:', error);
    throw new Error('Unable to load saved screener filters.', { cause: error });
  }
}

export async function saveUserScreenerFilter(userId: number, name: string, filtersJson: string) {
  try {
    const rows = await db
      .insert(savedScreenerFilters)
      .values({ userId, name: name.trim(), filtersJson })
      .returning();
    return rows[0];
  } catch (error) {
    console.error('Database error saving screener filter:', error);
    throw new Error('Unable to save screener filter.', { cause: error });
  }
}

export async function deleteUserScreenerFilter(userId: number, filterId: number) {
  try {
    const rows = await db
      .delete(savedScreenerFilters)
      .where(and(eq(savedScreenerFilters.id, filterId), eq(savedScreenerFilters.userId, userId)))
      .returning();
    return rows[0] || null;
  } catch (error) {
    console.error('Database error deleting screener filter:', error);
    throw new Error('Unable to delete screener filter.', { cause: error });
  }
}

// Search History
export async function recordUserSearch(input: {
  userId: number;
  symbol: string;
  exchange: string;
  companyName: string;
  country: string;
  currency: string;
}) {
  try {
    await db
      .delete(searchHistory)
      .where(
        and(
          eq(searchHistory.userId, input.userId),
          eq(searchHistory.symbol, input.symbol),
          eq(searchHistory.exchange, input.exchange)
        )
      );
    const rows = await db.insert(searchHistory).values(input).returning();
    return rows[0];
  } catch (error) {
    console.error('Database error recording search history:', error);
    return null;
  }
}

export async function getUserSearchHistory(userId: number, limit = 12) {
  try {
    return await db
      .select()
      .from(searchHistory)
      .where(eq(searchHistory.userId, userId))
      .orderBy(desc(searchHistory.searchedAt))
      .limit(limit);
  } catch (error) {
    console.error('Database error loading search history:', error);
    return [];
  }
}

export async function getLatestAnalysisBySymbolMap(limit = 100) {
  try {
    const rows = await db
      .select({
        symbol: analysisHistory.symbol,
        exchange: analysisHistory.exchange,
        decision: analysisHistory.decision,
        confidenceScore: analysisHistory.confidenceScore,
        riskLevel: analysisHistory.riskLevel,
        createdAt: analysisHistory.createdAt,
      })
      .from(analysisHistory)
      .orderBy(desc(analysisHistory.createdAt))
      .limit(limit);

    const map = new Map<string, typeof rows[0]>();
    for (const r of rows) {
      const key = `${r.symbol}:${r.exchange}`;
      if (!map.has(key)) map.set(key, r);
    }
    return map;
  } catch {
    return new Map();
  }
}

// Analysis History
export async function saveAnalysisRecord(input: typeof analysisHistory.$inferInsert) {
  try {
    const rows = await db.insert(analysisHistory).values(input).returning();
    return rows[0];
  } catch (error) {
    console.error('Database error saving analysis record:', error);
    throw new Error('Unable to save analysis history.', { cause: error });
  }
}

export async function getUserAnalysisHistory(userId: number, limit = 25) {
  try {
    return await db
      .select()
      .from(analysisHistory)
      .where(eq(analysisHistory.userId, userId))
      .orderBy(desc(analysisHistory.createdAt))
      .limit(limit);
  } catch (error) {
    console.error('Database error loading analysis history:', error);
    throw new Error('Unable to load analysis history.', { cause: error });
  }
}

// Prediction History
export async function savePredictionRecord(input: typeof predictionHistory.$inferInsert) {
  try {
    const rows = await db.insert(predictionHistory).values(input).returning();
    return rows[0];
  } catch (error) {
    console.error('Database error saving prediction record:', error);
    throw new Error('Unable to save prediction record.', { cause: error });
  }
}

export async function getUserPredictionHistory(userId?: number, limit = 30) {
  try {
    if (userId) {
      return await db
        .select()
        .from(predictionHistory)
        .where(eq(predictionHistory.userId, userId))
        .orderBy(desc(predictionHistory.createdAt))
        .limit(limit);
    }
    return await db
      .select()
      .from(predictionHistory)
      .orderBy(desc(predictionHistory.createdAt))
      .limit(limit);
  } catch (error) {
    console.error('Database error loading prediction history:', error);
    throw new Error('Unable to load prediction history.', { cause: error });
  }
}

// API Telemetry Logs (for Admin Dashboard)
export async function recordApiLog(entry: {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  errorMessage?: string | null;
}) {
  try {
    await db.insert(apiLogs).values(entry);
  } catch {
    // Non-fatal telemetry write
  }
}

export async function getAdminStats() {
  try {
    const start = Date.now();
    const [
      userCountRows,
      holdingCountRows,
      watchlistCountRows,
      analysisCountRows,
      predictionCountRows,
      logCountRows,
      errorCountRows,
      avgDurationRows,
      recentUsers,
      recentErrors,
    ] = await Promise.all([
      db.select({ value: count() }).from(users),
      db.select({ value: count() }).from(portfolioHoldings),
      db.select({ value: count() }).from(watchlistItems),
      db.select({ value: count() }).from(analysisHistory),
      db.select({ value: count() }).from(predictionHistory),
      db.select({ value: count() }).from(apiLogs),
      db.select({ value: count() }).from(apiLogs).where(gte(apiLogs.statusCode, 400)),
      db.select({ avg: sql<number>`COALESCE(ROUND(AVG(${apiLogs.durationMs})), 0)` }).from(apiLogs),
      db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          authProvider: users.authProvider,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(15),
      db
        .select()
        .from(apiLogs)
        .where(gte(apiLogs.statusCode, 400))
        .orderBy(desc(apiLogs.createdAt))
        .limit(25),
    ]);

    const dbLatencyMs = Date.now() - start;

    return {
      dbStatus: 'connected',
      dbLatencyMs,
      counts: {
        users: Number(userCountRows[0]?.value ?? 0),
        portfolioHoldings: Number(holdingCountRows[0]?.value ?? 0),
        watchlistItems: Number(watchlistCountRows[0]?.value ?? 0),
        analyses: Number(analysisCountRows[0]?.value ?? 0),
        predictions: Number(predictionCountRows[0]?.value ?? 0),
      },
      requests: {
        totalLogged: Number(logCountRows[0]?.value ?? 0),
        errorCount: Number(errorCountRows[0]?.value ?? 0),
        avgDurationMs: Number(avgDurationRows[0]?.avg ?? 0),
      },
      recentUsers,
      recentErrors,
    };
  } catch (error) {
    console.error('Database error fetching admin stats:', error);
    throw new Error('Unable to retrieve admin telemetry from PostgreSQL.', { cause: error });
  }
}

export async function checkDatabaseHealth(): Promise<{ status: 'connected' | 'error'; latencyMs: number; message?: string }> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { status: 'connected', latencyMs: Date.now() - start };
  } catch (error: any) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      message: 'PostgreSQL connection unavailable.',
    };
  }
}
