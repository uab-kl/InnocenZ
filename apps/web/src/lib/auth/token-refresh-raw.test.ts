import axios, {
	AxiosError,
	type AxiosResponse,
	type InternalAxiosRequestConfig,
} from "axios";
import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

/**
 * THE TWO TOKEN USERS OUTSIDE THE AXIOS CLIENT — they get the same refresh.
 *
 *  • `graphqlRequest` (the audit log) posts through bare axios, and `@auth`
 *    answers an expired session with HTTP 401 UNAUTHENTICATED.
 *  • `profile-api` uses raw `fetch` for the avatar: a multipart upload needs
 *    the browser to write its own boundary.
 *
 * Both used to fail — the upload by signing out — once the access token's 15
 * minutes were up. The refresh call itself goes through bare axios, so the
 * global adapter is faked here; `fetch` is stubbed for the avatar.
 */

const kickToLogin = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
	kickToLogin: () => kickToLogin(),
}));

import { apiErrorCopy } from "@/lib/auth/api-error-copy";
import { getAccessToken, saveAuthTokens } from "@/lib/auth/auth-storage";
import { graphqlRequest } from "@/lib/graphql-request";
import { fetchMyProfileImageSource, uploadMyProfileImage } from "./profile-api";

type Reply = { status: number; body?: unknown };

/** Far enough ahead that no test run reaches it (1 Jan 2100). */
const FUTURE = 4_102_444_800_000;

let seen: { url: string; authorization: string | null }[] = [];
let refreshReply: Reply;
/** The API: only the refreshed token gets in. */
const api = (authorization: string | null, body: unknown): Reply =>
	authorization === "Bearer new-access"
		? { status: 200, body }
		: { status: 401, body: { message: "Unauthorized" } };

async function axiosAdapter(
	config: InternalAxiosRequestConfig,
): Promise<AxiosResponse> {
	const header = config.headers?.Authorization;
	const authorization = typeof header === "string" ? header : null;
	const url = config.url ?? "";
	seen.push({ url, authorization });
	const reply: Reply =
		url === "/auth/refresh"
			? refreshReply
			: authorization === "Bearer new-access"
				? { status: 200, body: { data: { auditLogActions: ["LOGIN"] } } }
				: {
						status: 401,
						body: {
							errors: [
								{
									message: "You must be logged in to access this resource",
									extensions: { code: "UNAUTHENTICATED" },
								},
							],
							data: null,
						},
					};
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

/** `fetch` as the avatar routes answer it. */
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
	const authorization = new Headers(init?.headers).get("Authorization");
	seen.push({ url, authorization });
	const reply = api(authorization, {
		success: true,
		message: "OK",
		data: { id: "u1", fallback: false },
	});
	return {
		status: reply.status,
		ok: reply.status >= 200 && reply.status < 300,
		json: async () => reply.body,
	} as Response;
});

const REFRESHED: Reply = {
	status: 200,
	body: {
		success: true,
		message: "Session refreshed",
		data: { accessToken: "new-access", expiredAt: FUTURE },
	},
};
const REFUSED: Reply = {
	status: 401,
	body: { success: false, message: "Please sign in again.", data: null },
};
const THROTTLED: Reply = {
	status: 429,
	body: { message: "Too many requests" },
};

const originalAdapter = axios.defaults.adapter;
const refreshes = () => seen.filter((s) => s.url === "/auth/refresh").length;

beforeEach(() => {
	sessionStorage.clear();
	localStorage.clear();
	seen = [];
	kickToLogin.mockClear();
	fetchMock.mockClear();
	axios.defaults.adapter = axiosAdapter;
	vi.stubGlobal("fetch", fetchMock);
	// The access token's 15 minutes are up; the refresh token is good.
	saveAuthTokens("old-access", "the-refresh", Date.now() - 5 * 60_000);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

afterAll(() => {
	axios.defaults.adapter = originalAdapter;
});

describe("graphqlRequest — the audit log", () => {
	it("an expired session is refreshed and the query replayed", async () => {
		refreshReply = REFRESHED;

		const data = await graphqlRequest<{ auditLogActions: string[] }>(
			"query { auditLogActions }",
		);

		expect(data).toEqual({ auditLogActions: ["LOGIN"] });
		expect(seen.map((s) => s.authorization)).toEqual([
			"Bearer old-access",
			null, // the refresh call carries no bearer
			"Bearer new-access",
		]);
		expect(refreshes()).toBe(1);
		expect(getAccessToken()).toBe("new-access");
	});

	it("a refused refresh rethrows the original 401 — this path never signed out", async () => {
		refreshReply = REFUSED;

		await expect(
			graphqlRequest("query { auditLogActions }"),
		).rejects.toMatchObject({ response: { status: 401 } });

		expect(refreshes()).toBe(1);
		expect(seen).toHaveLength(2); // no replay
		expect(kickToLogin).not.toHaveBeenCalled();
	});
});

describe("profile-api — the avatar's raw fetch", () => {
	const file = () => new File(["x"], "me.png", { type: "image/png" });

	it("upload: a 401 is refreshed and the SAME form sent once more", async () => {
		refreshReply = REFRESHED;

		await expect(uploadMyProfileImage("u1", file())).resolves.toMatchObject({
			id: "u1",
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		const [first, second] = fetchMock.mock.calls;
		expect(second[1]?.body).toBe(first[1]?.body);
		expect(second[1]?.method).toBe("POST");
		expect(seen.map((s) => s.authorization)).toEqual([
			"Bearer old-access",
			null,
			"Bearer new-access",
		]);
		expect(kickToLogin).not.toHaveBeenCalled();
	});

	it("upload: a refused refresh ends the session, as a 401 always did", async () => {
		refreshReply = REFUSED;

		await expect(uploadMyProfileImage("u1", file())).rejects.toThrow(
			apiErrorCopy().webLib.sessionExpired,
		);

		expect(kickToLogin).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("upload: an undecidable refresh (429) fails the upload and signs nobody out", async () => {
		refreshReply = THROTTLED;

		await expect(uploadMyProfileImage("u1", file())).rejects.toThrow(
			apiErrorCopy().profile.couldNotUploadPhoto,
		);

		expect(kickToLogin).not.toHaveBeenCalled();
		expect(getAccessToken()).toBe("old-access");
	});

	it("the stored crop source: a 401 is refreshed and the read replayed", async () => {
		refreshReply = REFRESHED;

		await expect(fetchMyProfileImageSource("u1")).resolves.toEqual({
			id: "u1",
			fallback: false,
		});

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(refreshes()).toBe(1);
	});

	it("the stored crop source: an undecidable refresh is just 'no source'", async () => {
		refreshReply = THROTTLED;

		await expect(fetchMyProfileImageSource("u1")).resolves.toBeNull();

		expect(kickToLogin).not.toHaveBeenCalled();
	});
});
