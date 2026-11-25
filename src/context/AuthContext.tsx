import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { apiClient, extractApiError, setApiAuthToken } from '../lib/api.ts';

export interface AuthUser {
  id: number;
  uid: string;
  email: string;
  name: string;
  role: string;
  authProvider: string;
  createdAt: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  loginWithGoogle: () => Promise<AuthUser>;
  loginWithEmail: (email: string, password: string) => Promise<AuthUser>;
  registerWithEmail: (name: string, email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const syncMe = useCallback(async (token: string): Promise<AuthUser | null> => {
    setApiAuthToken(token);
    try {
      const { data } = await apiClient.get('/auth/me');
      setUser(data.user);
      return data.user;
    } catch {
      setApiAuthToken(null);
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const idToken = await fbUser.getIdToken();
          await syncMe(idToken);
        } catch {
          setUser(null);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [syncMe]);

  const loginWithGoogle = useCallback(async (): Promise<AuthUser> => {
    const cred = await signInWithPopup(auth, googleAuthProvider);
    const idToken = await cred.user.getIdToken(true);
    const synced = await syncMe(idToken);
    if (!synced) throw new Error('Unable to synchronize Google account with server.');
    return synced;
  }, [syncMe]);

  const loginWithEmail = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    try {
      const { data } = await apiClient.post('/auth/login', { email, password });
      setApiAuthToken(data.token);
      setUser(data.user);
      return data.user;
    } catch (err) {
      throw new Error(extractApiError(err, 'Login failed.'));
    }
  }, []);

  const registerWithEmail = useCallback(
    async (name: string, email: string, password: string): Promise<AuthUser> => {
      try {
        const { data } = await apiClient.post('/auth/register', { name, email, password });
        setApiAuthToken(data.token);
        setUser(data.user);
        return data.user;
      } catch (err) {
        throw new Error(extractApiError(err, 'Registration failed.'));
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
    } finally {
      setApiAuthToken(null);
      setUser(null);
    }
  }, []);

  const refreshUser = useCallback(async (): Promise<AuthUser | null> => {
    try {
      if (auth.currentUser) {
        const fresh = await auth.currentUser.getIdToken(true);
        setApiAuthToken(fresh);
      }
      const { data } = await apiClient.get('/auth/me');
      setUser(data.user);
      return data.user;
    } catch {
      return null;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
