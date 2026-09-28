/**
 * PR session state — signs in against the backend auth API and exposes the
 * logged-in user (`/auth/me`) to the app.
 *
 * A session is the PAIR the server issues — a 15-minute access token and a
 * 7-day refresh token — plus the access token's expiry. `saved-session` keeps
 * it between launches (SecureStore on a phone, session/localStorage on web), and
 * `token-refresh` renews the access token in place whenever the server refuses
 * it, reading the pair through the provider this component registers.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ApiError,
  fetchMe,
  fetchMyAgencyLinks,
  login,
  phoneCandidates,
  refreshAccessToken,
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
import { savedSession } from './saved-session';
import { resumeSession } from './session-resume';
import {
  forgetSupersededTokens,
  noteSupersededToken,
  registerTokenProvider,
  renewSession,
  type SessionTokens,
} from './token-refresh';

type SessionState = {
  me: Me | null;
  token: string | null;
  /** Approved agency_pr links for this PR (mapped to the old membership shape). */
  agencies: AgencyMembership[];
  booting: boolean;
  /**
   * A saved session is held but could not be confirmed — no connection, or the
   * server failed us. She is NOT signed out: the session is still saved, and
   * `resume` tries again.
   */
  offline: boolean;
  /** Open the saved session again — what boot does, and what Retry does. */
  resume: () => Promise<void>;
  signIn: (
    identifier: string,
    password: string,
  ) => Promise<{ user: Me; accessToken: string }>;
  signOut: () => void;
  /**
   * Replace the session with the pair the SERVER just re-issued.
   *
   * ⚠️ Needed because a JWT here carries only `{loginMethod, loginCriteria}` —
   * no user id — so every request resolves the account by looking that
   * criteria up. Change the phone number and a phone-keyed token points at a
   * number nobody holds: the next call answers 401 `Unauthorized`, which is
   * exactly what the Security screen was showing after a change that had in
   * fact SUCCEEDED. `/auth/contact-change/confirm` returns a fresh pair
   * (`reissueTokens` in contact-change.controller.ts); this is how it gets
   * kept. It replaced `/auth/phone/change`, deleted 21 Sep 2026.
   *
   * ⚠️ Take the REFRESH token too. The change stamps a cutoff that kills the old
   * refresh token along with the old access token, so keeping only the new
   * access token would end the session 15 minutes later.
   */
  adoptToken: (accessToken: string, refreshToken: string | null) => void;
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
  const [offline, setOffline] = useState(false);
  /**
   * The pair itself. api.ts reads it through the token provider, so it changes
   * SYNCHRONOUSLY with every sign-in, refresh and sign-out — React state only
   * reaches a request on the next render, and one sent in between would carry a
   * token that is already gone.
   */
  const sessionRef = useRef<SessionTokens | null>(null);

  const hold = useCallback((next: SessionTokens | null) => {
    sessionRef.current = next;
    setToken(next?.accessToken ?? null);
  }, []);

  /**
   * Sign-out, or a refresh the server refused: forget the session everywhere.
   *
   * Local only — the server has no logout, so the refresh token stays valid
   * there until it expires. Forgetting it here is all a sign-out can do.
   */
  const endSession = useCallback(() => {
    forgetSupersededTokens();
    hold(null);
    setMe(null);
    setOffline(false);
    void savedSession.clear();
  }, [hold]);

  /** A pair the server just issued. `sameAccount`: re-issued after a credential change. */
  const beginSession = useCallback(
    (next: SessionTokens, sameAccount: boolean) => {
      const previous = sessionRef.current;
      if (sameAccount && previous) noteSupersededToken(previous.accessToken);
      else forgetSupersededTokens();
      hold(next);
      setOffline(false);
      void savedSession.save(next, 'signIn');
    },
    [hold],
  );

  // Lend the pair to api.ts. Registered before the boot effect below runs (same
  // commit, declaration order), so boot's own `/auth/me` can already renew.
  useEffect(
    () =>
      registerTokenProvider({
        current: () => sessionRef.current,
        renewed: (next) => {
          hold(next);
          void savedSession.save(next, 'refresh');
        },
        dead: endSession,
      }),
    [hold, endSession],
  );

  const resume = useCallback(async () => {
    setBooting(true);
    setOffline(false);
    const saved = await savedSession.load();
    if (!saved) {
      // Memory only — never `endSession` here, which would also clear storage:
      // a read can fail for a moment (a keychain still locked) with a perfectly
      // good session behind it, and the next launch must still find it.
      hold(null);
      setBooting(false);
      return;
    }
    hold(saved);
    const result = await resumeSession(saved, {
      fetchMe,
      renew: (stale) => renewSession(stale, refreshAccessToken),
      held: () => sessionRef.current,
      now: () => Date.now(),
    });
    if (result.kind === 'signedIn') setMe(result.me);
    else if (result.kind === 'offline') setOffline(true);
    else endSession();
    setBooting(false);
  }, [hold, endSession]);

  useEffect(() => {
    void resume();
  }, [resume]);

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
            // A PR awaiting DEPARTURE approval is still under the agency —
            // shifts, vouchers and notifications keep flowing until the
            // agency says yes. Only 'left' / 'rejected' / 'pending' are out.
            .filter((r) => r.approveStatus === 'approved' || r.approveStatus === 'leave_pending')
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

  const adoptToken = useCallback(
    (accessToken: string, refreshToken: string | null) => {
      // The re-issued pair carries no expiry. Unknown is safe: a refusal renews
      // it the ordinary way, and the next refresh records one.
      beginSession({ accessToken, refreshToken, expiredAt: null }, true);
    },
    [beginSession],
  );

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      const candidates = phoneCandidates(identifier);
      // English on purpose — see the ApiError note in ./api. A seed value only:
      // `phoneCandidates` never returns an empty list, so the loop below always
      // replaces it with the real failure before anything is thrown.
      let lastError: unknown = new ApiError('Invalid credentials', 401);
      for (const candidate of candidates) {
        try {
          const result = await login(candidate, password);
          const user = await fetchMe(result.accessToken);
          beginSession(
            {
              accessToken: result.accessToken,
              // Kept, not dropped: it is what renews the 15-minute access token.
              refreshToken: result.refreshToken || null,
              expiredAt: typeof result.expiredAt === 'number' ? result.expiredAt : null,
            },
            false,
          );
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
    },
    [beginSession],
  );

  const signOut = endSession;

  const refreshMe = useCallback(async (accessTokenOverride?: string) => {
    // The override is what a caller holding a token it JUST received passes;
    // the ref already has it as well, since sign-in and adoptToken set it
    // synchronously — the React `token` would not have it until the next render.
    const t = accessTokenOverride ?? sessionRef.current?.accessToken;
    if (!t) return;
    const user = await fetchMe(t);
    setMe(user);
  }, []);

  const updateProfile = useCallback(
    async (patch: ProfileUpdate) => {
      // 'Not signed in' DOES reach the screen — Profile renders `e.message` on
      // every one of these. Kept English here and localised at the render site
      // by `localizeApiError` (lib/api-error-copy.ts); do not translate it in
      // place, a thrown message is also what a log and a bug report carry.
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
      offline,
      resume,
      signIn,
      signOut,
      adoptToken,
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
      offline,
      resume,
      signIn,
      signOut,
      adoptToken,
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
