import axios, {
	type AxiosError,
	type AxiosInstance,
	type InternalAxiosRequestConfig,
} from "axios";
import { env } from "@/env";
import { getActiveOrg } from "@/lib/active-org";
import { getAccessToken } from "@/lib/auth/auth-storage";
import {
	accessTokenForRetry,
	isSessionRefusal,
} from "@/lib/auth/token-refresh";

let browserClient: AxiosInstance | null = null;

/** A request already replayed once after a refresh is never replayed again. */
type ReplayableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

/** The bearer token a request actually went out with, if any. */
function sentToken(config: InternalAxiosRequestConfig): string | null {
	const header = config.headers?.Authorization;
	return typeof header === "string" && header.startsWith("Bearer ")
		? header.slice("Bearer ".length)
		: null;
}

function createClient(onRefreshFail: () => void): AxiosInstance {
	const instance = axios.create({
		baseURL: `${env.VITE_API_URL}/v1`,
		headers: { "Content-Type": "application/json" },
	});

	instance.interceptors.request.use(
		(config: InternalAxiosRequestConfig) => {
			const token = getAccessToken();
			if (token && config.headers) {
				config.headers.Authorization = `Bearer ${token}`;
			}
			/*
			 * The organisation this browser is working in, when the person has
			 * chosen one. Sent on EVERY request rather than threaded through
			 * each call site: the scope is a property of the session, and one
			 * hook forgetting to pass it is how a screen ends up showing another
			 * organisation's data. The server verifies it against the caller's
			 * own active memberships and ignores anything else.
			 */
			const org = getActiveOrg();
			if (org && config.headers) {
				config.headers["x-org-id"] = org.id;
				/*
				 * ⚠️ THE KIND TRAVELS WITH THE ID.
				 *
				 * An id alone cannot say whether it names an agency or a venue, so
				 * the server had to guess by looking it up in both membership
				 * tables — and a PIN LEFT ON A VENUE then answered for requests
				 * made from the AGENCY console. For somebody who owns a venue and
				 * staffs an agency, that put the venue's saved card on the agency's
				 * subscription screen, where saving would have replaced it.
				 *
				 * The chooser has always stored both halves (`ActiveOrg`); only the
				 * id was being sent. The server still verifies the id against the
				 * caller's own active memberships — this says which table to look
				 * in, never that the claim is true.
				 */
				config.headers["x-org-kind"] = org.kind;
			}
			return config;
		},
		(error) => Promise.reject(error),
	);

	/*
	 * A SESSION 401 IS REFRESHED AND REPLAYED ONCE — it no longer signs out.
	 *
	 * This handler used to call `onRefreshFail()` on ANY 401, and with a
	 * 15-minute access token in production that signed every person out a
	 * quarter of an hour after they signed in, whatever their 7-day refresh
	 * token said. Now:
	 *
	 *  • only a 401 that means "the session is over" is touched —
	 *    `isSessionRefusal` holds the research on which ones those are; any
	 *    other failure, including a 401 judging a password in the body, reaches
	 *    the caller untouched;
	 *  • it is replayed ONCE with a fresh token (one refresh shared by every
	 *    concurrent 401 — see `refreshAccessToken`);
	 *  • the person is signed out only when the session really is over: the
	 *    server refused the refresh token, or refused the fresh access token too;
	 *  • a refresh that could not be decided (offline, 429, 5xx) fails the
	 *    request as itself and signs nobody out.
	 */
	instance.interceptors.response.use(
		(response) => response,
		async (error: AxiosError) => {
			if (!isSessionRefusal(error.response?.status, error.config?.url)) {
				return Promise.reject(error);
			}
			const config = error.config as ReplayableConfig | undefined;
			/*
			 * Refused AGAIN on a fresh token, or not replayable at all: the
			 * session is over even though the refresh token was accepted. A
			 * suspended organisation is the real case — `/auth/refresh` does not
			 * check one, while the API guard does — and replaying again would
			 * loop forever, one refresh per request.
			 */
			if (!config || config._retry) {
				onRefreshFail();
				return Promise.reject(error);
			}
			config._retry = true;

			let token: string | null;
			try {
				token = await accessTokenForRetry(sentToken(config));
			} catch {
				// Could not be decided — NOT a dead session. See above.
				return Promise.reject(error);
			}
			if (!token) {
				onRefreshFail();
				return Promise.reject(error);
			}
			config.headers.Authorization = `Bearer ${token}`;
			return instance(config);
		},
	);

	return instance;
}

export function getClient(onRefreshFail: () => void): AxiosInstance {
	if (!browserClient) {
		browserClient = createClient(onRefreshFail);
	}
	return browserClient;
}

let publicClient: AxiosInstance | null = null;

function createPublicClient(): AxiosInstance {
	return axios.create({
		baseURL: `${env.VITE_API_URL}/v1`,
		headers: { "Content-Type": "application/json" },
	});
}

export function getPublicClient(): AxiosInstance {
	if (!publicClient) {
		publicClient = createPublicClient();
	}
	return publicClient;
}
