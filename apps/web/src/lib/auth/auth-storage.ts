/**
 * Auth tokens are PER-TAB (sessionStorage), with localStorage as a seed for
 * brand-new tabs only.
 *
 * One shared localStorage slot was the "my agency tab suddenly became the
 * outlet" bug: logging into a second portal in another tab overwrote the only
 * token, so the first tab's next request carried the wrong identity — the
 * role guards then bounced it to the other portal or to the login page
 * ("suddenly signed out"). A tab now copies the seed ONCE and stays pinned —
 * static — to whoever signed in on it: only a login or sign-out performed in
 * that tab can change what it holds.
 */
import { clearActiveOrg } from "@/lib/active-org";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const TOKEN_EXPIRY_KEY = "token_expiry";
/** Set after the one-time copy so a cleared seed can never "unpin" a tab. */
const SEEDED_FLAG = "auth_seeded";

const AUTH_KEYS = [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, TOKEN_EXPIRY_KEY];

function tabStore(): Storage | null {
	return typeof window === "undefined" ? null : window.sessionStorage;
}

function seedStore(): Storage | null {
	return typeof window === "undefined" ? null : window.localStorage;
}

/** Copies the shared seed into this tab exactly once, then pins the tab. */
function ensureSeeded(tab: Storage): void {
	if (tab.getItem(SEEDED_FLAG)) return;
	const seed = seedStore();
	if (seed) {
		for (const key of AUTH_KEYS) {
			const value = seed.getItem(key);
			if (value !== null && tab.getItem(key) === null) tab.setItem(key, value);
		}
	}
	tab.setItem(SEEDED_FLAG, "1");
}

function readKey(key: string): string | null {
	const tab = tabStore();
	if (!tab) return null;
	ensureSeeded(tab);
	return tab.getItem(key);
}

function writeKey(key: string, value: string): void {
	const tab = tabStore();
	if (tab) {
		// A login in this tab IS the pin — never re-seed over it.
		tab.setItem(SEEDED_FLAG, "1");
		tab.setItem(key, value);
	}
	// New tabs opened after this login inherit it via the seed.
	seedStore()?.setItem(key, value);
}

function removeKey(key: string): void {
	tabStore()?.removeItem(key);
	seedStore()?.removeItem(key);
}

export function getAccessToken(): string | null {
	return readKey(ACCESS_TOKEN_KEY);
}

export function saveAccessToken(token: string): void {
	writeKey(ACCESS_TOKEN_KEY, token);
}

export function removeAccessToken(): void {
	removeKey(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
	return readKey(REFRESH_TOKEN_KEY);
}

export function saveRefreshToken(token: string): void {
	writeKey(REFRESH_TOKEN_KEY, token);
}

export function removeRefreshToken(): void {
	removeKey(REFRESH_TOKEN_KEY);
}

export function getTokenExpiry(): number | null {
	const expiry = readKey(TOKEN_EXPIRY_KEY);
	return expiry ? Number.parseInt(expiry, 10) : null;
}

export function saveTokenExpiry(expiry: number): void {
	writeKey(TOKEN_EXPIRY_KEY, expiry.toString());
}

export function removeTokenExpiry(): void {
	removeKey(TOKEN_EXPIRY_KEY);
}

export function isTokenExpired(): boolean {
	const expiry = getTokenExpiry();
	if (!expiry) return true;
	return Date.now() >= expiry;
}

export function clearAuthTokens(): void {
	removeAccessToken();
	removeRefreshToken();
	removeTokenExpiry();
	/*
	 * The chosen organisation goes with them.
	 *
	 * This is the ONE place sign-out and every forced kick funnel through, which
	 * is why it lives here rather than beside each of them: a choice that
	 * outlived its session would greet the next person on this machine with
	 * someone else's agency name in the header.
	 */
	clearActiveOrg();
}

export function saveAuthTokens(
	accessToken: string,
	refreshToken: string,
	expiredAt: number,
): void {
	saveAccessToken(accessToken);
	saveRefreshToken(refreshToken);
	saveTokenExpiry(expiredAt);
}

/**
 * Both tokens AND an access token whose clock has not run out.
 *
 * ⚠️ "Has the access token's clock run out" is NOT "is this person signed
 * out". Production mints a 15-minute access token beside a 7-day refresh
 * token, so somebody back from lunch fails this test while holding a perfectly
 * good session — and the gates that used it as a sign-in check sent them to
 * /login. To ask whether there is a session at all, use `hasSessionTokens()`;
 * to bring an expired one back before acting, `resumeSession()` in
 * `token-refresh.ts`.
 */
export function hasValidTokens(): boolean {
	const accessToken = getAccessToken();
	const refreshToken = getRefreshToken();
	return !!accessToken && !!refreshToken && !isTokenExpired();
}

/**
 * Does this tab hold a session at all — access AND refresh token — whatever the
 * access token's clock says?
 *
 * The right gate for "may this screen ask the server": past the access token's
 * 15 minutes the request still goes out, collects a 401, and the client
 * refreshes and replays it (`token-refresh.ts`). Only a refused refresh ends
 * the session.
 */
export function hasSessionTokens(): boolean {
	return !!getAccessToken() && !!getRefreshToken();
}

/**
 * Store the access token `/auth/refresh` just minted from `spentRefreshToken` —
 * in THIS TAB ONLY, and only while this tab still holds that refresh token.
 * Returns whether it was stored.
 *
 * Two ways the ordinary `saveAccessToken` would be wrong here:
 *
 *  • THE TAB MAY HAVE MOVED ON while the refresh was in flight — signed out, or
 *    signed in as somebody else. Writing then would put an access token back
 *    into a tab whose person had just ended that session. So nothing is written
 *    unless the refresh token spent is still this tab's.
 *  • THE SEED MAY NOT BE OURS. `writeKey` also writes the shared localStorage
 *    seed, and a later sign-in in another tab owns that seed now. Writing this
 *    session's access token beside that session's refresh token would hand the
 *    next new tab one identity that turns into another at its first refresh —
 *    the "my agency tab became the outlet" bug this file exists to prevent. A
 *    new tab that seeds an expired access token simply refreshes it itself.
 *
 * `expiresAt` null = the server did not say, so no clock is kept rather than a
 * stale one: `hasValidTokens()` then reads false, which only costs a refresh.
 */
export function saveRefreshedAccessToken(
	spentRefreshToken: string,
	accessToken: string,
	expiresAt: number | null,
): boolean {
	const tab = tabStore();
	if (!tab || readKey(REFRESH_TOKEN_KEY) !== spentRefreshToken) return false;
	tab.setItem(ACCESS_TOKEN_KEY, accessToken);
	if (expiresAt === null) tab.removeItem(TOKEN_EXPIRY_KEY);
	else tab.setItem(TOKEN_EXPIRY_KEY, expiresAt.toString());
	return true;
}
