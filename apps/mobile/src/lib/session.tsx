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
  fetchMyAgencyLinks,
  login,
  phoneCandidates,
  updateUserProfile,
  uploadUserProfileImage,
  uploadUserPortfolioPhoto,
  uploadUserComcardImage,
  generateUserComcard,
  uploadUserIdDoc,
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
  /** Approved agency_pr links for this PR (mapped to the old membership shape). */
  agencies: AgencyMembership[];
  booting: boolean;
  signIn: (
    identifier: string,
    password: string,
  ) => Promise<{ user: Me; accessToken: string }>;
  signOut: () => void;
  updateProfile: (patch: ProfileUpdate) => Promise<Me>;
  uploadAvatar: (file: Blob, filename?: string) => Promise<void>;
  uploadPortfolioPhoto: (slot: number, file: Blob, filename?: string) => Promise<Me>;
  uploadComcardImage: (file: Blob, filename?: string) => Promise<Me>;
  /** Auto-build comcard from saved portfolio (server-side). */
  generateComcard: () => Promise<Me>;
  uploadIdDoc: (side: 'front' | 'back', file: Blob, filename?: string) => Promise<Me>;
  refreshMe: (accessTokenOverride?: string) => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [agencies, setAgencies] = useState<AgencyMembership[]>([]);
  const [booting, setBooting] = useState(true);

  // agency_pr links (not agency_user — that table is portal operators only).
  useEffect(() => {
    if (!token || !me) {
      setAgencies([]);
      return;
    }
    let cancelled = false;
    fetchMyAgencyLinks(token, me.id)
      .then((rows) => {
        if (cancelled) return;
        setAgencies(
          rows
            .filter((r) => r.approveStatus === 'approved')
            .map((r) => ({
              membershipId: `${r.agencyId}:${r.userId}`,
              userId: r.userId,
              agencyId: r.agencyId,
              agencyName: r.agencyName,
              agencyCode: r.agencyCode,
              subRole: 'pr',
              status: 'active',
            })),
        );
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
        return { user, accessToken: result.accessToken };
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

  const refreshMe = useCallback(async (accessTokenOverride?: string) => {
    // Override required right after signIn — React state `token` is still null
    // until the next render, so a bare refreshMe() would no-op and leave
    // profileImage / portfolio / comcard blank after signup uploads.
    const t = accessTokenOverride ?? token;
    if (!t) return;
    const user = await fetchMe(t);
    setMe(user);
  }, [token]);

  const updateProfile = useCallback(
    async (patch: ProfileUpdate) => {
      if (!token || !me) throw new ApiError('Not signed in', 401);
      const updated = await updateUserProfile(token, me.id, patch);
      setMe(updated);
      // Returned as well as stored: the server re-renders the comcard inside
      // this same request when a printed field moves, so the caller needs the
      // fresh row to tell whether the card actually changed. Reading `me`
      // afterwards would see the stale closure value.
      return updated;
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

  const generateComcard = useCallback(async () => {
    if (!token || !me) throw new ApiError('Not signed in', 401);
    const updated = await generateUserComcard(token, me.id);
    setMe(updated);
    return updated;
  }, [token, me]);

  const uploadIdDoc = useCallback(
    async (side: 'front' | 'back', file: Blob, filename = 'id.jpg') => {
      if (!token || !me) throw new ApiError('Not signed in', 401);
      const updated = await uploadUserIdDoc(token, me.id, side, file, filename);
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
      generateComcard,
      uploadIdDoc,
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
      generateComcard,
      uploadIdDoc,
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
