import axios, {
	AxiosError,
	type AxiosResponse,
	type InternalAxiosRequestConfig,
} from "axios";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SIGNED OUT A QUARTER OF AN HOUR AFTER SIGNING IN — the production bug.
 *
 * Production mints a 15-minute access token and a 7-day refresh token, and the
 * web client signed out on ANY 401 without ever spending the refresh token.
 * These tests hold the fix to its contract:
 *
 *  • a session 401 is refreshed ONCE and replayed; concurrent 401s share one
 *    refresh;
 *  • only a session that is really over signs out — the refresh refused, or
 *    the fresh token refused too — and then exactly once;
 *  • a refresh that cannot be decided (429 — it shares login's limiter —, 5xx,
 *    offline) signs NOBODY out;
 *  • a 401 that judges a password in the body is not the session's and is
 *    never refreshed.
 *
 * Same instrument as `contact-change-api.test.ts`: the REAL client from
 * `axios-v1`, interceptors and all, with only the transport replaced. The
 * refresh call itself goes through bare axios (see token-refresh.ts for why),
 * so the global adapter is replaced too. The fake server routes on URL and
 * bearer rather than replaying a script, so the order concurrent requests
 * happen to reach it in cannot make a test pass or fail.
 */

const kickToLogin = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
	kickToLogin: () => kickToLogin(),
}));

import {
	clearAuthTokens,
	getAccessToken,
	getRefreshToken,
	getTokenExpiry,
	hasSessionTokens,
	hasValidTokens,
	removeRefreshToken,
	saveAuthTokens,
	saveRefreshedAccessToken,
} from "@/lib/auth/auth-storage";
import { getClient } from "@/lib/axios-v1";
import {
	isSessionRefusal,
	refreshAccessToken,
	resumeSession,
} from "./token-refresh";

type Reply = { status: number; body?: unknown } | "network";

interface Seen {
	url: string | undefined;
	authorization: string | undefined;
	body: Record<string, unknown>;
}

/** Far enough ahead that no test run reaches it (1 Jan 2100). */
const FUTURE = 4_102_444_800_000;
const UNAUTHORIZED: Reply = { status: 401, body: { message: "Unauthorized" } };
const REFRESH_REFUSED: Reply = {
	status: 401,
	body: { success: false, message: "Please sign in again.", data: null },
};

let seen: Seen[] = [];
/** How the fake server answers — every test sets its own. */
let server: (request: Seen) => Reply | Promise<Reply> = () => {
	throw new Error("no server set for this test");
};

async function fakeAdapter(
	config: InternalAxiosRequestConfig,
): Promise<AxiosResponse> {
	const authorization = config.headers?.Authorization;
	const request: Seen = {
		url: config.url,
		authorization:
			typeof authorization === "string" ? authorization : undefined,
		body:
			typeof config.data === "string"
				? (JSON.parse(config.data) as Record<string, unknown>)
				: {},
	};
	seen.push(request);
	const reply = await server(request);
	if (reply === "network") {
		throw new AxiosError("Network Error", AxiosError.ERR_NETWORK, config, {});
	}
	const response: AxiosResponse = {
		data: reply.body ?? null,
		status: reply.status,
		statusText: String(reply.status),
		headers: {},
		config,
		request: {},
	};
	if (reply.status >= 400) {
		throw new AxiosError(
			`Request failed with status code ${reply.status}`,
			AxiosError.ERR_BAD_REQUEST,
			config,
			{},
			response,
		);
	}
	return response;
}

function okRefresh(
	accessToken: string,
	expiredAt: number | null = FUTURE,
): Reply {
	return {
		status: 200,
		body: {
			success: true,
			message: "Session refreshed",
			data: { accessToken, expiredAt },
		},
	};
}

/**
 * The API as authenticateJWT runs it: only `good` gets in. `/auth/refresh`
 * mints `good` unless the test says otherwise.
 */
function apiAccepting(good: string, refresh: Reply = okRefresh(good)) {
	return (request: Seen): Reply => {
		if (request.url === "/auth/refresh") return refresh;
		return request.authorization === `Bearer ${good}`
			? { status: 200, body: { success: true, message: "OK", data: [] } }
			: UNAUTHORIZED;
	};
}

/** A gate the fake server can hold a reply behind. */
function gate(): { open: () => void; wait: Promise<void> } {
	let open = () => {};
	const wait = new Promise<void>((resolve) => {
		open = resolve;
	});
	return { open, wait };
}

const urls = () => seen.map((s) => s.url);
const refreshCount = () => urls().filter((u) => u === "/auth/refresh").length;
const client = () => getClient(kickToLogin);

/** An unsigned JWT-shaped token carrying `exp` — the client never verifies. */
function fakeJwt(exp: number): string {
	const part = (value: object) =>
		btoa(JSON.stringify(value))
			.replace(/=+$/, "")
			.replace(/\+/g, "-")
			.replace(/\//g, "_");
	return `${part({ alg: "RS256" })}.${part({ loginMethod: "email", loginCriteria: "o@x.my", exp })}.sig`;
}

const originalAdapter = axios.defaults.adapter;

beforeEach(() => {
	sessionStorage.clear();
	localStorage.clear();
	seen = [];
	kickToLogin.mockClear();
	client().defaults.adapter = fakeAdapter;
	axios.defaults.adapter = fakeAdapter;
	// Signed in 20 minutes ago: the 15-minute access token's clock has run out,
	// the 7-day refresh token has not.
	saveAuthTokens("old-access", "the-refresh", Date.now() - 5 * 60_000);
});

afterAll(() => {
	axios.defaults.adapter = originalAdapter;
});

describe("a session 401 is refreshed and replayed — not signed out", () => {
	it("refreshes the expired access token and replays the request with it", async () => {
		server = apiAccepting("new-access");

		const response = await client().get("/notification");

		expect(response.status).toBe(200);
		expect(urls()).toEqual(["/notification", "/auth/refresh", "/notification"]);
		expect(seen[0].authorization).toBe("Bearer old-access");
		// The refresh token travels in the BODY; the call carries no bearer.
		expect(seen[1].body).toEqual({ refreshToken: "the-refresh" });
		expect(seen[1].authorization).toBeUndefined();
		expect(seen[2].authorization).toBe("Bearer new-access");

		expect(getAccessToken()).toBe("new-access");
		// Not rotated — the server answers an access token only.
		expect(getRefreshToken()).toBe("the-refresh");
		expect(getTokenExpiry()).toBe(FUTURE);
		expect(hasValidTokens()).toBe(true);
		expect(kickToLogin).not.toHaveBeenCalled();
	});

	it("replays a POST with its body intact", async () => {
		server = apiAccepting("new-access");

		await client().post("/auth/org-join-request", { orgId: "o1" });

		expect(urls()).toEqual([
			"/auth/org-join-request",
			"/auth/refresh",
			"/auth/org-join-request",
		]);
		expect(seen[2].body).toEqual({ orgId: "o1" });
	});

	it("concurrent 401s share ONE refresh", async () => {
		const held = gate();
		const api = apiAccepting("new-access");
		server = async (request) => {
			if (request.url === "/auth/refresh") await held.wait;
			return api(request);
		};

		const calls = Promise.all([
			client().get("/notification"),
			client().get("/notification/unread-count"),
			client().get("/auth/me"),
		]);
		// All three collect their 401 and wait on the one refresh held open.
		await vi.waitFor(() => {
			expect(
				seen.filter((s) => s.authorization === "Bearer old-access"),
			).toHaveLength(3);
			expect(refreshCount()).toBe(1);
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		held.open();

		const responses = await calls;
		expect(responses.map((r) => r.status)).toEqual([200, 200, 200]);
		expect(refreshCount()).toBe(1);
		expect(
			seen.filter((s) => s.authorization === "Bearer new-access"),
		).toHaveLength(3);
		expect(kickToLogin).not.toHaveBeenCalled();
	});

	it("a request that raced another's refresh replays on the new token — no second refresh", async () => {
		const api = apiAccepting("new-access");
		server = (request) => {
			if (
				request.url === "/notification" &&
				request.authorization === "Bearer old-access"
			) {
				// Another request refreshed while this one was on the wire.
				saveRefreshedAccessToken("the-refresh", "new-access", FUTURE);
				return UNAUTHORIZED;
			}
			return api(request);
		};

		await client().get("/notification");

		expect(urls()).toEqual(["/notification", "/notification"]);
		expect(seen[1].authorization).toBe("Bearer new-access");
	});

	it("refreshAccessToken is single-flight, and a later call starts afresh", async () => {
		const held = gate();
		const api = apiAccepting("new-access");
		server = async (request) => {
			await held.wait;
			return api(request);
		};

		const first = refreshAccessToken();
		const second = refreshAccessToken();
		expect(second).toBe(first);
		held.open();
		await expect(first).resolves.toBe("new-access");
		expect(refreshCount()).toBe(1);

		await refreshAccessToken();
		expect(refreshCount()).toBe(2);
	});

	it("reads the clock off the token itself when the answer carries no expiredAt", async () => {
		const exp = 2_000_000_000;
		const minted = fakeJwt(exp);
		server = apiAccepting(minted, okRefresh(minted, null));

		await client().get("/notification");

		expect(getAccessToken()).toBe(minted);
		expect(getTokenExpiry()).toBe(exp * 1000);
	});
});

describe("a session that is really over signs out — exactly once", () => {
	it("the server refuses the refresh token: sign out, no replay", async () => {
		server = apiAccepting("new-access", REFRESH_REFUSED);

		await expect(client().get("/notification")).rejects.toMatchObject({
			response: { status: 401 },
		});

		expect(kickToLogin).toHaveBeenCalledTimes(1);
		expect(urls()).toEqual(["/notification", "/auth/refresh"]);
	});

	it("no refresh token at all: sign out without asking the server", async () => {
		removeRefreshToken();
		server = apiAccepting("new-access");

		await expect(client().get("/notification")).rejects.toMatchObject({
			response: { status: 401 },
		});

		expect(kickToLogin).toHaveBeenCalledTimes(1);
		expect(urls()).toEqual(["/notification"]);
	});

	/*
	 * `/auth/refresh` does not check a suspended organisation; the API guard
	 * does. So the refresh succeeds and the fresh token is refused — which must
	 * end the session, not refresh again on every request forever.
	 */
	it("refused AGAIN on the fresh token: sign out once, never loop", async () => {
		server = (request) =>
			request.url === "/auth/refresh" ? okRefresh("new-access") : UNAUTHORIZED;

		await expect(client().get("/notification")).rejects.toMatchObject({
			response: { status: 401 },
		});

		expect(urls()).toEqual(["/notification", "/auth/refresh", "/notification"]);
		expect(kickToLogin).toHaveBeenCalledTimes(1);
	});
});

describe("a refresh that cannot be decided signs NOBODY out", () => {
	it.each<[string, Reply]>([
		[
			"rate-limited (429)",
			{ status: 429, body: { message: "Too many requests" } },
		],
		[
			"a server error (500)",
			{
				status: 500,
				body: { success: false, message: "Internal Server Error", data: null },
			},
		],
		["unreachable", "network"],
		[
			"answered without a token",
			{
				status: 200,
				body: { success: true, message: "Session refreshed", data: null },
			},
		],
	])(
		"%s: the request fails as itself and the tokens stay",
		async (_label, refreshReply) => {
			server = apiAccepting("new-access", refreshReply);

			await expect(client().get("/notification")).rejects.toMatchObject({
				response: { status: 401 },
			});

			expect(kickToLogin).not.toHaveBeenCalled();
			expect(urls()).toEqual(["/notification", "/auth/refresh"]);
			expect(getAccessToken()).toBe("old-access");
			expect(getRefreshToken()).toBe("the-refresh");
		},
	);

	it("a sign-out while the refresh is in flight is not undone by its answer", async () => {
		const held = gate();
		server = async (request) => {
			if (request.url !== "/auth/refresh") return UNAUTHORIZED;
			await held.wait;
			return okRefresh("new-access");
		};

		const call = client().get("/notification");
		await vi.waitFor(() => expect(refreshCount()).toBe(1));
		clearAuthTokens(); // the person signs out meanwhile
		held.open();

		await expect(call).rejects.toMatchObject({ response: { status: 401 } });
		expect(getAccessToken()).toBeNull();
		expect(localStorage.getItem("access_token")).toBeNull();
		expect(urls()).toEqual(["/notification", "/auth/refresh"]);
		// The sign-out already left; the stale answer must not kick again.
		expect(kickToLogin).not.toHaveBeenCalled();
	});

	/*
	 * A password change re-issues the pair and retires the old one. A refresh
	 * of the OLD refresh token still in flight is then refused — about a
	 * session this tab no longer holds. Reading that as "signed out" would
	 * throw the person out of the session they just secured.
	 */
	it("a refusal of a refresh token the tab has since replaced signs nobody out", async () => {
		const held = gate();
		server = async (request) => {
			if (request.url !== "/auth/refresh") return UNAUTHORIZED;
			await held.wait;
			return REFRESH_REFUSED;
		};

		const call = client().get("/notification");
		await vi.waitFor(() => expect(refreshCount()).toBe(1));
		saveAuthTokens("pw-access", "pw-refresh", FUTURE); // the re-issued pair
		held.open();

		await expect(call).rejects.toMatchObject({ response: { status: 401 } });
		expect(kickToLogin).not.toHaveBeenCalled();
		expect(getAccessToken()).toBe("pw-access");
		expect(getRefreshToken()).toBe("pw-refresh");
	});
});

describe("a 401 that judges the BODY is not the session's", () => {
	it.each([
		["/auth/login", "Wrong email or password"],
		["/user/u1/delete", "Incorrect password"],
	])(
		"%s — reaches the caller untouched: no refresh, no sign-out",
		async (url, message) => {
			server = () => ({
				status: 401,
				body: { success: false, message, data: null },
			});

			await expect(
				client().post(url, { password: "typo" }),
			).rejects.toMatchObject({
				response: { status: 401, data: { message } },
			});

			expect(urls()).toEqual([url]);
			expect(kickToLogin).not.toHaveBeenCalled();
			expect(getAccessToken()).toBe("old-access");
		},
	);

	it("any other failure passes straight through", async () => {
		server = () => ({
			status: 403,
			body: { success: false, message: "Forbidden", data: null },
		});

		await expect(client().get("/agency/a1")).rejects.toMatchObject({
			response: { status: 403 },
		});

		expect(urls()).toEqual(["/agency/a1"]);
		expect(kickToLogin).not.toHaveBeenCalled();
	});

	it("isSessionRefusal: only a 401, and never from a body-credential endpoint", () => {
		expect(isSessionRefusal(401, "/notification")).toBe(true);
		expect(isSessionRefusal(401, "/auth/me")).toBe(true);
		expect(isSessionRefusal(401, "/auth/org-member-invite/accept")).toBe(true);
		expect(isSessionRefusal(401, "http://h/graphql")).toBe(true);
		expect(isSessionRefusal(401, "/auth/login")).toBe(false);
		expect(isSessionRefusal(401, "http://h/api/v1/auth/refresh?x=1")).toBe(
			false,
		);
		expect(isSessionRefusal(401, "/user/abc/delete/")).toBe(false);
		expect(isSessionRefusal(403, "/notification")).toBe(false);
		expect(isSessionRefusal(undefined, "/notification")).toBe(false);
	});
});

describe("the shared localStorage seed", () => {
	it("a refreshed token is kept to THIS tab — the seed may be another sign-in's", async () => {
		// Another tab has since signed in as somebody else and owns the seed.
		localStorage.setItem("access_token", "other-access");
		localStorage.setItem("refresh_token", "other-refresh");
		server = apiAccepting("new-access");

		await client().get("/notification");

		expect(getAccessToken()).toBe("new-access");
		expect(localStorage.getItem("access_token")).toBe("other-access");
		expect(localStorage.getItem("refresh_token")).toBe("other-refresh");
	});
});

describe("resumeSession — the gates that judge before any request goes out", () => {
	it("an access token still inside its clock: true, and the server is not asked", async () => {
		saveAuthTokens("a", "r", FUTURE);
		await expect(resumeSession()).resolves.toBe(true);
		expect(seen).toHaveLength(0);
	});

	it("an expired clock with a live refresh token: refreshed, true", async () => {
		// The case the old `hasValidTokens()` gate sent to /login.
		expect(hasValidTokens()).toBe(false);
		expect(hasSessionTokens()).toBe(true);
		server = apiAccepting("new-access");

		await expect(resumeSession()).resolves.toBe(true);

		expect(urls()).toEqual(["/auth/refresh"]);
		expect(getAccessToken()).toBe("new-access");
	});

	it("a refused refresh token: false", async () => {
		server = apiAccepting("new-access", REFRESH_REFUSED);
		await expect(resumeSession()).resolves.toBe(false);
	});

	it("a refresh that cannot be decided: true — the session is not known to be over", async () => {
		server = apiAccepting("new-access", {
			status: 429,
			body: { message: "Too many requests" },
		});

		await expect(resumeSession()).resolves.toBe(true);

		expect(getAccessToken()).toBe("old-access");
		expect(getRefreshToken()).toBe("the-refresh");
	});

	it("no session at all: false, without a request", async () => {
		clearAuthTokens();
		await expect(resumeSession()).resolves.toBe(false);
		expect(seen).toHaveLength(0);
	});
});
