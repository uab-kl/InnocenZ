/**
 * PR session state — signs in against the backend auth API and exposes the
 * logged-in user (`/auth/me`) to the app. Token persists across reloads on
 * web via localStorage; native keeps it in memory for the dev session.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import {
  ApiError,
  fetchMe,
  fetchMemberships,
  login,
  phoneCandidates,
  updateUserProfile,
  uploadUserProfileImage,
  uploadUserPortfolioPhoto,
  uploadUserComcardImage,
  type AgencyMembership,
  type Me,
  type ProfileUpdate,
} from './api';

const TOKEN_KEY = 'iz-pr-token';

/** Minimal web storage surface — the RN tsconfig has no `dom` lib. */
type WebStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/**
 * Web keeps the token in BOTH storages. sessionStorage is per-tab, so two PR
 * tabs side by side each keep their OWN identity across refresh — signing in
 * as a second PR used to overwrite the first tab's session, and a refresh
 * would "jump" to the other PR. localStorage only seeds brand-new tabs with
 * the most recent login.
 */
function webTabStorage(): WebStorage | null {
  if (Platform.OS !== 'web') return null;
  return (globalThis as { sessionStorage?: WebStorage }).sessionStorage ?? null;
}

function webSharedStorage(): WebStorage | null {
  if (Platform.OS !== 'web') return null;
  return (globalThis as { localStorage?: WebStorage }).localStorage ?? null;
}

function readStoredToken(): string | null {
  try {
    const own = webTabStorage()?.getItem(TOKEN_KEY) ?? null;
    if (own) return own;
    // Fresh tab: adopt the most recent login once, then live per-tab.
    const shared = webSharedStorage()?.getItem(TOKEN_KEY) ?? null;
    if (shared) webTabStorage()?.setItem(TOKEN_KEY, shared);
    return shared;
  } catch {
    return null;
  }
}

function writeStoredToken(token: string | null) {
  try {
    if (token) {
      webTabStorage()?.setItem(TOKEN_KEY, token);
      webSharedStorage()?.setItem(TOKEN_KEY, token);
    } else {
      webTabStorage()?.removeItem(TOKEN_KEY);
      webSharedStorage()?.removeItem(TOKEN_KEY);
    }
  } catch {
    /* storage unavailable — in-memory session only */
  }
}

type SessionState = {
  me: Me | null;
  token: string | null;
  /** Active PR agency memberships from /agency/memberships (admin data). */
  agencies: AgencyMembership[];
  booting: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => void;
  updateProfile: (patch: ProfileUpdate) => Promise<void>;
  uploadAvatar: (file: Blob, filename?: string) => Promise<void>;
  uploadPortfolioPhoto: (slot: number, file: Blob, filename?: string) => Promise<Me>;
  uploadComcardImage: (file: Blob, filename?: string) => Promise<Me>;
  refreshMe: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [agencies, setAgencies] = useState<AgencyMembership[]>([]);
  const [booting, setBooting] = useState(true);

  // Agencies come from the same membership rows the admin PR list shows.
  useEffect(() => {
    if (!token || !me) {
      setAgencies([]);
      return;
    }
    let cancelled = false;
    fetchMemberships(token, me.id)
      .then((rows) => {
        if (!cancelled) setAgencies(rows.filter((r) => r.status === 'active'));
      })
      .catch(() => {
        /* non-fatal — profile falls back to the agency-tie flag */
      });
    return () => {
      cancelled = true;
    };
  }, [token, me]);

  useEffect(() => {
    const stored = readStoredToken();
    if (!stored) {
      setBooting(false);
      return;
    }
    setToken(stored);
    fetchMe(stored)
      .then(setMe)
      .catch(() => {
        writeStoredToken(null);
        setToken(null);
      })
      .finally(() => setBooting(false));
  }, []);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const candidates = phoneCandidates(identifier);
    let lastError: unknown = new ApiError('Invalid credentials', 401);
    for (const candidate of candidates) {
      try {
        const result = await login(candidate, password);
        const user = await fetchMe(result.accessToken);
        writeStoredToken(result.accessToken);
        setToken(result.accessToken);
        setMe(user);
        return;
      } catch (error) {
        lastError = error;
        if (!(error instanceof ApiError) || (error.status !== 400 && error.status !== 401)) {
          throw error;
        }
      }
    }
    throw lastError;
  }, []);

  const signOut = useCallback(() => {
    writeStoredToken(null);
    setToken(null);
    setMe(null);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!token) return;
    const user = await fetchMe(token);
    setMe(user);
  }, [token]);

  const updateProfile = useCallback(
    async (patch: ProfileUpdate) => {
      if (!token || !me) throw new ApiError('Not signed in', 401);
      const updated = await updateUserProfile(token, me.id, patch);
      setMe(updated);
    },
    [token, me],
  );

  const uploadAvatar = useCallback(
    async (file: Blob, filename = 'avatar.jpg') => {
      if (!token || !me) throw new ApiError('Not signed in', 401);
      const updated = await uploadUserProfileImage(token, me.id, file, filename);
      setMe(updated);
    },
    [token, me],
  );

  const uploadPortfolioPhoto = useCallback(
    async (slot: number, file: Blob, filename = 'portfolio.jpg') => {
      if (!token || !me) throw new ApiError('Not signed in', 401);
      const updated = await uploadUserPortfolioPhoto(token, me.id, slot, file, filename);
      setMe(updated);
      return updated;
    },
    [token, me],
  );

  const uploadComcardImage = useCallback(
    async (file: Blob, filename = 'comcard.png') => {
      if (!token || !me) throw new ApiError('Not signed in', 401);
      const updated = await uploadUserComcardImage(token, me.id, file, filename);
      setMe(updated);
      return updated;
    },
    [token, me],
  );

  const value = useMemo(
    () => ({
      me,
      token,
      agencies,
      booting,
      signIn,
      signOut,
      updateProfile,
      uploadAvatar,
      uploadPortfolioPhoto,
      uploadComcardImage,
      refreshMe,
    }),
    [
      me,
      token,
      agencies,
      booting,
      signIn,
      signOut,
      updateProfile,
      uploadAvatar,
      uploadPortfolioPhoto,
      uploadComcardImage,
      refreshMe,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
