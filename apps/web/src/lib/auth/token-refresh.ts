/**
 * KEEPING A SIGNED-IN PERSON SIGNED IN PAST THE ACCESS TOKEN'S 15 MINUTES.
 *
 * Production mints a 15-minute access token beside a 7-day refresh token
 * (`JWT_ACCESS_TOKEN_EXPIRATION` / `JWT_REFRESH_TOKEN_EXPIRATION` in
 * tools/deploy/.env.backend.example). The web client stored the refresh token
 * and never spent it: the first request after minute 15 collected a 401, the
 * interceptor read every 401 as the end of the session, and everybody was
 * thrown to /login a quarter of an hour after signing in. The local `.env`
 * sets the access token to 15 DAYS, which is why only production saw it.
 *
 * `POST /auth/refresh` takes `{ refreshToken }` and answers a new ACCESS token
 * with its `expiredAt`. It does NOT rotate the refresh token — the one from
 * sign-in is kept until it expires or a password / contact change retires it.
 *
 * ⚠️ A LEAF as far as the HTTP clients go: this imports bare `axios`, never
 * `axios-v1`, because `axios-v1` imports this — a cycle between the two is the
 * shape that once took the whole agency portal down. Bare axios also carries
 * no interceptors (nothing in this app registers one on the global instance),
 * so the refresh call's own 401 can never re-enter the 401 handler.
 */
import axios from "axios";
import { env } from "@/env";
import { jwtExpiryMs } from "@/lib/auth/auth-flow-client";
import {
	getAccessToken,
	getRefreshToken,
	hasValidTokens,
	saveRefreshedAccessToken,
} from "@/lib/auth/auth-storage";

/**
 * Endpoints whose 401 is a verdict on a credential carried in the request BODY
 * — a password, a code, the refresh token itself — which a new access token
 * cannot change. See `isSessionRefusal`.
 */
const BODY_CREDENTIAL_401: readonly RegExp[] = [
	/(^|\/)auth\/login$/,
	/(^|\/)auth\/refresh$/,
	/(^|\/)user\/[^/]+\/delete$/,
];

/**
 * WHICH 401s MEAN "THE SESSION IS OVER" — the only ones a refresh can fix, and
 * so the only ones the clients refresh and replay.
 *
 * Decided against every 401 the backend can send (28 Sep 2026):
 *
 *  SESSION — the bearer token was missing or refused.
 *   • `authenticateJWT` answers ALL of these with `{ message: "Unauthorized" }`:
 *     an expired token, a refresh token presented as an access token, a token
 *     older than the account's last password / contact change, a disabled
 *     account, a suspended organisation. Everything under `/api/v1` except the
 *     public `/auth` routes and the webhooks sits behind it.
 *   • The same "Unauthorized" from every `!req.user` check behind it — the
 *     role / portal / permission / sub-role guards, the handlers, the
 *     account-code controllers, the audit trail.
 *   • The optional-auth routes read an expired token as "anonymous", so the
 *     invite accept says the same thing in its own words ("Sign in to accept
 *     this invitation…"), as does `org-join-request` ("Sign in first…").
 *   • GraphQL's `@auth` answers it as HTTP 401 `UNAUTHENTICATED`.
 *
 *  NOT SESSION — the three endpoints above, whose 401 judges the BODY:
 *   • POST /auth/login — wrong password, the MFA prompt, an unknown or inactive
 *     account, a suspended organisation. (The web signs in through the
 *     interceptor-free public client, so this is a guard, not a live path.)
 *   • POST /auth/refresh — "Please sign in again." Reading that as a session
 *     401 would answer a refused refresh with another refresh.
 *   • POST /user/:id/delete — "Incorrect password" (the phone app's
 *     self-delete; the web does not call it today).
 *  The webhooks' "Invalid signature" never reaches a browser.
 *
 * ⚠️ Anything ELSE is read as a session 401 — which is what EVERY 401 meant to
 * this client before, so an unrecognised one keeps today's behaviour: refresh,
 * replay once, sign out only if that fails too. The backend's own contract
 * points the same way — a wrong password or code is a 400, "never 401: the web
 * client signs a person out on any 401" (account-code/shared.ts) — which makes
 * the three above named exceptions rather than a pattern to guess at.
 */
export function isSessionRefusal(
	status: number | undefined,
	url: string | undefined,
): boolean {
	if (status !== 401) return false;
	const path = (url ?? "").split(/[?#]/)[0].replace(/\/+$/, "");
	return !BODY_CREDENTIAL_401.some((pattern) => pattern.test(path));
}

/**
 * The refresh could not be DECIDED — offline, rate-limited, a server error, an
 * answer with no token in it, or the tab's session changed while it ran.
 *
 * ⚠️ Not a dead session, and never a reason to sign anybody out.
 * `/auth/refresh` is rate-limited per IP address (its own `refreshLimiter`,
 * 300 a quarter-hour since 28 Sep 2026 — it used to share login's 60), and a
 * venue's staff share one address, so a 429 here is ordinary — ending the
 * session over it would sign a whole bar out at once.
 */
export class RefreshUnavailableError extends Error {
	constructor(message: string, cause?: unknown) {
		super(message, { cause });
		this.name = "RefreshUnavailableError";
	}
}

interface RefreshEnvelope {
	success?: boolean;
	message?: string;
	data?: { accessToken?: unknown; expiredAt?: unknown } | null;
}

/** The one refresh in flight — every concurrent 401 waits on this. */
let inFlight: Promise<string | null> | null = null;

/**
 * Trade the stored refresh token for a new access token. SINGLE FLIGHT: while
 * one runs, every caller gets the same promise, so a burst of 401s (the
 * notification poll, the unread count and a page load landing together) spends
 * one refresh, not one each.
 *
 *  • resolves the new access token — already stored for this tab;
 *  • resolves `null` when the session is over: there is no refresh token, or
 *    the server refused it (expired, retired by a password change, account
 *    disabled — all "Please sign in again.");
 *  • REJECTS with `RefreshUnavailableError` when neither could be decided.
 */
export function refreshAccessToken(): Promise<string | null> {
	if (!inFlight) {
		inFlight = spendRefreshToken().finally(() => {
			inFlight = null;
		});
	}
	return inFlight;
}

async function spendRefreshToken(): Promise<string | null> {
	const refreshToken = getRefreshToken();
	if (!refreshToken) return null;

	let answer: RefreshEnvelope | undefined;
	try {
		const response = await axios.post<RefreshEnvelope>(
			"/auth/refresh",
			{ refreshToken },
			{
				baseURL: `${env.VITE_API_URL}/v1`,
				headers: { "Content-Type": "application/json" },
			},
		);
		answer = response.data;
	} catch (error) {
		/*
		 * A refusal ends the session only while this tab still holds the token
		 * that was refused. A password or contact change re-issues the pair —
		 * and retires the old one — while a refresh of the old one may be in
		 * flight; reporting THAT refusal as the end of the session would sign
		 * the person out of the session they just secured.
		 */
		if (refusedByServer(error) && getRefreshToken() === refreshToken) {
			return null;
		}
		throw new RefreshUnavailableError("Could not refresh the session", error);
	}

	const accessToken = answer?.data?.accessToken;
	if (typeof accessToken !== "string" || !accessToken) {
		throw new RefreshUnavailableError(
			"The refresh answer carried no access token",
		);
	}
	const expiresAt =
		msEpoch(answer?.data?.expiredAt) ?? jwtExpiryMs(accessToken);
	if (!saveRefreshedAccessToken(refreshToken, accessToken, expiresAt)) {
		/*
		 * This tab signed out, or signed in as somebody else, while the refresh
		 * was in flight. The token belongs to a session that is no longer here,
		 * so it is dropped — and the session is not reported as over either,
		 * which would sign out whoever is in the tab now.
		 */
		throw new RefreshUnavailableError(
			"The session changed while it was being refreshed",
		);
	}
	return accessToken;
}

/**
 * The server read the refresh token and said no: any 4xx except a timeout
 * (408) or the limiter (429). 401 is the one it sends today. A 400, 403 or 404
 * (a server without this endpoint) is no more refreshable, and reading it as
 * "try again later" would leave a dead session on screen with nothing to end
 * it — today's sign-out is the honest answer to those.
 */
function refusedByServer(error: unknown): boolean {
	const status = axios.isAxiosError(error) ? error.response?.status : undefined;
	return (
		status !== undefined &&
		status >= 400 &&
		status < 500 &&
		status !== 408 &&
		status !== 429
	);
}

function msEpoch(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: null;
}

/**
 * The token to replay a refused request with.
 *
 * If the stored token is no longer the one the request went out with, another
 * request refreshed it while this one was in flight — replay with that rather
 * than spend the refresh token again (see the limiter note on
 * `RefreshUnavailableError`). Otherwise refresh, with the same contract as
 * `refreshAccessToken`.
 */
export function accessTokenForRetry(
	sentToken: string | null | undefined,
): Promise<string | null> {
	const current = getAccessToken();
	if (current && current !== sentToken) return Promise.resolve(current);
	return refreshAccessToken();
}

/**
 * Bring this tab's session back before acting on it — for the gates that judge
 * the session BEFORE any request goes out (the auth context on mount, the
 * organisation chooser, the invite page), where there is no 401 yet for the
 * interceptor to answer.
 *
 * Resolves `false` ONLY when there is no session to resume: no refresh token,
 * or the server refused it. A refresh that could not be decided resolves
 * `true` — the session is not known to be over, and the next request's 401
 * tries again. Reading a 429 as "signed out" is the failure this file ends.
 */
export async function resumeSession(): Promise<boolean> {
	if (hasValidTokens()) return true;
	if (!getRefreshToken()) return false;
	try {
		return (await refreshAccessToken()) !== null;
	} catch {
		return true;
	}
}

/**
 * `fetch` with this tab's bearer token, refreshed and sent ONCE more on a
 * session 401 — for the calls that cannot use the axios client (a multipart
 * upload needs the browser to write its own boundary).
 *
 * A 401 in the answer means the session is over: the refresh was refused, or
 * the fresh token was refused too. Rejects with `RefreshUnavailableError` when
 * the refresh could not be decided — the caller must not sign anybody out for
 * that.
 */
export async function fetchWithSession(
	url: string,
	init: RequestInit = {},
): Promise<Response> {
	const send = (token: string | null) => {
		const headers = new Headers(init.headers);
		if (token) headers.set("Authorization", `Bearer ${token}`);
		return fetch(url, { ...init, headers });
	};
	const sentToken = getAccessToken();
	const first = await send(sentToken);
	if (!isSessionRefusal(first.status, url)) return first;
	const token = await accessTokenForRetry(sentToken);
	return token ? send(token) : first;
}
