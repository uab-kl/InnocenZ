import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hardNavigate = vi.fn();
vi.mock("@/lib/hard-navigate", () => ({
	hardNavigate: (path: string) => hardNavigate(path),
}));
vi.mock("@/paraglide/runtime", () => ({
	deLocalizeHref: (href: string) => href,
	localizeHref: (href: string) => href,
}));
const fetchWithSession = vi.fn();
vi.mock("@/lib/auth/token-refresh", async (importOriginal) => ({
	...(await importOriginal<typeof import("./token-refresh")>()),
	fetchWithSession: (url: string) => fetchWithSession(url),
}));

import {
	clearAuthTokens,
	getAccessToken,
	saveAuthTokens,
} from "@/lib/auth/auth-storage";
import {
	clearPortalCache,
	ensureAdminPortal,
	ensurePortal,
	guardPortalClient,
} from "./guards";
import { RefreshUnavailableError } from "./token-refresh";

/**
 * SIGNED OUT BY A 429 (28 Sep 2026 follow-up): `signedInPortals()` cleared the
 * tokens and sent the tab to /login on ANY failure of `/auth/me` — the refresh
 * limiter's 429, a 5xx, a moment offline. That is what emptied the browser
 * sessions on 28 Sep. Now only a session REFUSAL signs out; anything that could
 * not be decided leaves the person signed in.
 */

const FUTURE = 4_102_444_800_000;

function me(roles: { roleName: string; portalCode?: string }[]): Response {
	return new Response(
		JSON.stringify({ success: true, data: { roles, portals: [] } }),
		{ status: 200, headers: { "Content-Type": "application/json" } },
	);
}

const status = (code: number) => new Response("{}", { status: code });

/** Where a thrown TanStack redirect points, or null for anything else. */
function redirectTarget(error: unknown): string | null {
	const e = error as { options?: { to?: string }; to?: string } | null;
	return e?.options?.to ?? e?.to ?? null;
}

async function outcome(run: () => Promise<unknown>): Promise<string> {
	try {
		await run();
		return "allowed";
	} catch (error) {
		return redirectTarget(error) ?? "threw";
	}
}

describe("the portal gates sign out ONLY on a session refusal", () => {
	beforeEach(() => {
		sessionStorage.clear();
		localStorage.clear();
		clearPortalCache();
		hardNavigate.mockReset();
		fetchWithSession.mockReset();
		saveAuthTokens("access-1", "refresh-1", FUTURE);
	});
	afterEach(() => {
		vi.useRealTimers();
		clearAuthTokens();
	});

	it("an admin passes the admin gate", async () => {
		fetchWithSession.mockResolvedValue(
			me([{ roleName: "admin", portalCode: "admin" }]),
		);
		expect(await outcome(() => ensureAdminPortal())).toBe("allowed");
		expect(await guardPortalClient("admin")).toBe(true);
	});

	it("a REFUSED session (401 after the refresh) signs out and goes to /login", async () => {
		fetchWithSession.mockResolvedValue(status(401));
		expect(await outcome(() => ensurePortal("agency"))).toBe("/login");
		expect(getAccessToken()).toBeNull();
	});

	it.each([
		[
			"the refresh was rate-limited",
			() => Promise.reject(new RefreshUnavailableError("429")),
		],
		[
			"the network is down",
			() => Promise.reject(new TypeError("Failed to fetch")),
		],
		["/auth/me answered 429", () => Promise.resolve(status(429))],
		["/auth/me answered 503", () => Promise.resolve(status(503))],
	])("%s: the route gate lets it through and nobody is signed out", async (_why, reply) => {
		fetchWithSession.mockImplementation(reply);
		expect(await outcome(() => ensurePortal("agency"))).toBe("allowed");
		expect(await outcome(() => ensureAdminPortal())).toBe("allowed");
		expect(getAccessToken()).toBe("access-1");
		expect(hardNavigate).not.toHaveBeenCalled();
	});

	it("the layout gate asks again while undecided, and admits once /auth/me answers", async () => {
		vi.useFakeTimers();
		fetchWithSession
			.mockRejectedValueOnce(new RefreshUnavailableError("429"))
			.mockResolvedValueOnce(status(503))
			.mockResolvedValue(me([{ roleName: "admin", portalCode: "admin" }]));

		const allowed = guardPortalClient("admin");
		await vi.advanceTimersByTimeAsync(10_000);

		expect(await allowed).toBe(true);
		expect(fetchWithSession).toHaveBeenCalledTimes(3);
		expect(getAccessToken()).toBe("access-1");
		expect(hardNavigate).not.toHaveBeenCalled();
	});

	it("the layout gate gives up WITHOUT signing out when /auth/me never answers", async () => {
		vi.useFakeTimers();
		fetchWithSession.mockRejectedValue(new RefreshUnavailableError("429"));

		const allowed = guardPortalClient("agency");
		await vi.advanceTimersByTimeAsync(60_000);

		expect(await allowed).toBe(false);
		expect(getAccessToken()).toBe("access-1");
		expect(hardNavigate).not.toHaveBeenCalled();
	});

	it("the layout gate still sends a refused session to /login", async () => {
		fetchWithSession.mockResolvedValue(status(401));
		expect(await guardPortalClient("outlet")).toBe(false);
		expect(hardNavigate).toHaveBeenCalledWith(
			expect.stringMatching(/^\/login/),
		);
		expect(getAccessToken()).toBeNull();
	});

	it("a wrong portal is still refused — to /no-access, signed in", async () => {
		fetchWithSession.mockResolvedValue(
			me([{ roleName: "Owner", portalCode: "agency" }]),
		);
		expect(await outcome(() => ensurePortal("outlet"))).toBe("/no-access");
		expect(getAccessToken()).toBe("access-1");
	});
});
