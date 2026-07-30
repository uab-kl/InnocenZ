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

export function hasValidTokens(): boolean {
	const accessToken = getAccessToken();
	const refreshToken = getRefreshToken();
	return !!accessToken && !!refreshToken && !isTokenExpired();
}
