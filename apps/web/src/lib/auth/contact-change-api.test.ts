import {
	AxiosError,
	type AxiosResponse,
	type InternalAxiosRequestConfig,
} from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE TWO THINGS THAT, GOT WRONG, SIGN A PERSON OUT OF THE ACCOUNT THEY JUST
 * SECURED.
 *
 *  1. A password / email / phone change stamps `sessions_valid_from`, retiring
 *     the token this tab holds. The api call must STORE the re-issued pair
 *     before it resolves, or the next request is a 401 and the client ejects
 *     the session.
 *  2. A wrong code is HTTP 400 by contract. The authenticated client signs out
 *     on ANY 401, so a refusal must travel as an `AuthFlowError` that leaves
 *     the session — and the tokens — alone.
 *
 * The HTTP layer is the REAL axios client from `axios-v1`, interceptors and
 * all, with only its transport replaced. Mocking `getClient` instead would
 * also mock away the 401 interceptor — the very thing the "does not sign out"
 * assertions are about. And because a test that never sees a kick proves
 * nothing about kicks, one control case sends a 401 and asserts the kick DOES
 * fire through the same instrument.
 */

const kickToLogin = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
	kickToLogin: () => kickToLogin(),
}));

import { AuthFlowError } from "@/lib/auth/auth-flow-client";
import {
	getAccessToken,
	getRefreshToken,
	getTokenExpiry,
	saveAccessToken,
	saveRefreshToken,
} from "@/lib/auth/auth-storage";
import { getClient, getPublicClient } from "@/lib/axios-v1";
import {
	confirmContactChange,
	resendContactChangeNewCode,
	startContactChange,
} from "./contact-change-api";
import { readForgotIdentifier } from "./forgot-identifier";
import {
	changeMyPassword,
	completeForgotPassword,
	startForgotPassword,
} from "./password-api";

type Reply = {
	status: number;
	body: unknown;
	headers?: Record<string, string>;
};

interface Seen {
	url: string | undefined;
	body: Record<string, unknown>;
	authorization: string | undefined;
}

let replies: Reply[] = [];
let seen: Seen[] = [];

function fakeAdapter(config: InternalAxiosRequestConfig) {
	const reply = replies.shift();
	if (!reply) throw new Error(`No scripted reply for ${config.url}`);
	seen.push({
		url: config.url,
		body:
			typeof config.data === "string"
				? (JSON.parse(config.data) as Record<string, unknown>)
				: {},
		authorization: config.headers?.Authorization as string | undefined,
	});
	const response: AxiosResponse = {
		data: reply.body,
		status: reply.status,
		statusText: String(reply.status),
		headers: reply.headers ?? {},
		config,
		request: {},
	};
	if (reply.status >= 400) {
		return Promise.reject(
			new AxiosError(
				`Request failed with status code ${reply.status}`,
				AxiosError.ERR_BAD_REQUEST,
				config,
				{},
				response,
			),
		);
	}
	return Promise.resolve(response);
}

/** An unsigned JWT-shaped token carrying `exp` — the client never verifies. */
function fakeJwt(exp: number, marker: string): string {
	const part = (value: object) =>
		btoa(JSON.stringify(value))
			.replace(/=+$/, "")
			.replace(/\+/g, "-")
			.replace(/\//g, "_");
	return `${part({ alg: "HS256" })}.${part({ loginMethod: "email", loginCriteria: marker, exp })}.sig`;
}

beforeEach(() => {
	sessionStorage.clear();
	localStorage.clear();
	replies = [];
	seen = [];
	kickToLogin.mockClear();
	getClient(kickToLogin).defaults.adapter = fakeAdapter;
	getPublicClient().defaults.adapter = fakeAdapter;
	saveAccessToken("old-access");
	saveRefreshToken("old-refresh");
});

afterEach(() => {
	expect(replies).toHaveLength(0); // every scripted reply was consumed
});

describe("contact change — tokens", () => {
	it("stores the re-issued pair (and its expiry) before confirm resolves", async () => {
		const exp = 2_000_000_000;
		const access = fakeJwt(exp, "new@atlas-agency.my");
		replies.push({
			status: 200,
			body: {
				success: true,
				message: "Email updated",
				data: {
					accessToken: access,
					refreshToken: "new-refresh",
					email: "new@atlas-agency.my",
					phoneNum: "+60123456789",
				},
			},
		});

		const result = await confirmContactChange({
			requestId: "11111111-1111-4111-8111-111111111111",
			kind: "email",
			value: "  New@Atlas-Agency.MY ",
			code: "123456",
		});

		expect(result).toEqual({
			message: "Email updated",
			email: "new@atlas-agency.my",
			phoneNum: "+60123456789",
			tokensStored: true,
		});
		expect(getAccessToken()).toBe(access);
		expect(getRefreshToken()).toBe("new-refresh");
		expect(getTokenExpiry()).toBe(exp * 1000);
		// Sent on the OLD token — the new one only exists in the answer.
		expect(seen[0].authorization).toBe("Bearer old-access");
		expect(seen[0].url).toBe("/auth/contact-change/confirm");
		expect(seen[0].body.value).toBe("new@atlas-agency.my");
		expect(kickToLogin).not.toHaveBeenCalled();
	});

	it("change password stores the re-issued pair too", async () => {
		replies.push({
			status: 200,
			body: {
				success: true,
				message: "Password updated",
				data: { accessToken: "pw-access", refreshToken: "pw-refresh" },
			},
		});

		const changed = await changeMyPassword({
			currentPassword: "old-pw",
			newPassword: "new-pw",
		});

		expect(changed).toEqual({ tokensStored: true });
		expect(seen[0].url).toBe("/auth/password/change");
		expect(getAccessToken()).toBe("pw-access");
		expect(getRefreshToken()).toBe("pw-refresh");
		expect(kickToLogin).not.toHaveBeenCalled();
	});

	/*
	 * SAVED, BUT NO TOKENS. The server writes first and re-issues second, and a
	 * failed re-issue answers 200 with null tokens rather than an error. The
	 * screens must learn that from the call — it is the only signal that the
	 * token in this tab is already dead.
	 */
	it("confirm with null tokens says so, and leaves the old pair untouched", async () => {
		replies.push({
			status: 200,
			body: {
				success: true,
				message: "Phone number updated",
				data: {
					accessToken: null,
					refreshToken: null,
					email: null,
					phoneNum: "+60123456789",
				},
			},
		});

		const result = await confirmContactChange({
			requestId: "11111111-1111-4111-8111-111111111111",
			kind: "phone",
			value: "0123456789",
			code: "123456",
		});

		expect(result.tokensStored).toBe(false);
		expect(result.message).toBe("Phone number updated");
		expect(getAccessToken()).toBe("old-access");
		expect(kickToLogin).not.toHaveBeenCalled();
	});

	it("change password with null tokens reports tokensStored: false", async () => {
		replies.push({
			status: 200,
			body: {
				success: true,
				message: "Password updated",
				data: { accessToken: null, refreshToken: null },
			},
		});

		await expect(
			changeMyPassword({ currentPassword: "old-pw", newPassword: "new-pw" }),
		).resolves.toEqual({ tokensStored: false });
		expect(getAccessToken()).toBe("old-access");
	});
});

describe("contact change — a refusal does not sign out", () => {
	it("a wrong code (400) throws AuthFlowError and keeps the session", async () => {
		replies.push({
			status: 400,
			body: { success: false, message: "Invalid code", data: null },
		});

		const error = await confirmContactChange({
			requestId: "11111111-1111-4111-8111-111111111111",
			kind: "phone",
			value: "0123456789",
			code: "000000",
		}).catch((e: unknown) => e);

		expect(error).toBeInstanceOf(AuthFlowError);
		expect((error as AuthFlowError).status).toBe(400);
		expect((error as AuthFlowError).message).toBe("Invalid code");
		expect(kickToLogin).not.toHaveBeenCalled();
		expect(getAccessToken()).toBe("old-access");
		expect(getRefreshToken()).toBe("old-refresh");
	});

	it("a wrong current password (400) does not sign out either", async () => {
		replies.push({
			status: 400,
			body: {
				success: false,
				message: "Current password is incorrect",
				data: null,
			},
		});

		await expect(
			changeMyPassword({ currentPassword: "nope", newPassword: "new-pw" }),
		).rejects.toMatchObject({
			name: "AuthFlowError",
			status: 400,
			message: "Current password is incorrect",
		});
		expect(kickToLogin).not.toHaveBeenCalled();
		expect(getAccessToken()).toBe("old-access");
	});

	it("CONTROL: a 401 through the same client DOES kick — the instrument can see one", async () => {
		replies.push({
			status: 401,
			body: { success: false, message: "Unauthorized", data: null },
		});

		await expect(
			startContactChange({
				kind: "email",
				value: "a@b.co",
				currentPassword: "pw",
			}),
		).rejects.toBeInstanceOf(AuthFlowError);
		expect(kickToLogin).toHaveBeenCalledTimes(1);
	});

	/*
	 * A WRONG CURRENT PASSWORD IS 400, NEVER 401 (contract, 21 Sep 2026). The
	 * password now stands where the code to the old contacts used to, so this
	 * is the refusal a person is most likely to collect — and a 401 here would
	 * throw them out of the session they are trying to secure.
	 */
	it("a wrong current password on start (400) does not sign out", async () => {
		replies.push({
			status: 400,
			body: {
				success: false,
				message: "Current password is incorrect",
				data: null,
			},
		});

		await expect(
			startContactChange({
				kind: "email",
				value: "new@atlas-agency.my",
				currentPassword: "nope",
			}),
		).rejects.toMatchObject({
			name: "AuthFlowError",
			status: 400,
			message: "Current password is incorrect",
		});
		expect(seen[0].url).toBe("/auth/contact-change/start");
		expect(kickToLogin).not.toHaveBeenCalled();
		expect(getAccessToken()).toBe("old-access");
		expect(getRefreshToken()).toBe("old-refresh");
	});

	it("a cooldown (429) carries retryAfterSec for the Resend countdown", async () => {
		replies.push({
			status: 429,
			body: {
				success: false,
				message: "Wait 42s before requesting another code",
				data: { retryAfterSec: 42 },
			},
		});

		await expect(
			startContactChange({
				kind: "phone",
				value: "0123456789",
				currentPassword: "pw",
			}),
		).rejects.toMatchObject({ status: 429, retryAfterSec: 42 });
		expect(kickToLogin).not.toHaveBeenCalled();
	});
});

describe("contact change — one spelling of the value on every call", () => {
	const sentTo = [
		{ channel: "whatsapp", to: "+60 ••••• 6789", status: "sent" },
	];

	const codeSent = (requestId: string) => ({
		status: 200,
		body: {
			success: true,
			message: "Code sent",
			data: {
				requestId,
				sentTo,
				expiresInSec: 600,
				resendAfterSec: 60,
				pendingInvitesToCurrentEmail: 0,
			},
		},
	});

	it("sends the phone normalised identically to start, resend and confirm", async () => {
		replies.push(codeSent("r1"), codeSent("r2"), {
			status: 200,
			body: {
				success: true,
				message: "Phone number updated",
				data: {
					accessToken: "a",
					refreshToken: "r",
					email: null,
					phoneNum: "+60123456789",
				},
			},
		});

		const started = await startContactChange({
			kind: "phone",
			value: "012-345 6789",
			currentPassword: "s3cret",
		});
		expect(started.requestId).toBe("r1");
		expect(started.sentTo).toEqual(sentTo);

		// ⚠️ Resend answers its OWN requestId — the caller must carry that one
		// forward, not the id it started with.
		const resent = await resendContactChangeNewCode({
			requestId: "r1",
			kind: "phone",
			value: "+60 0123456789",
		});
		expect(resent.requestId).toBe("r2");

		await confirmContactChange({
			requestId: resent.requestId,
			kind: "phone",
			value: "0123456789",
			code: "654321",
		});

		expect(seen.map((s) => s.url)).toEqual([
			"/auth/contact-change/start",
			"/auth/contact-change/resend",
			"/auth/contact-change/confirm",
		]);
		expect(seen.map((s) => s.body.value)).toEqual([
			"+60123456789",
			"+60123456789",
			"+60123456789",
		]);
		expect(seen[2].body.requestId).toBe("r2");
	});

	/*
	 * THE PASSWORD IS ON START AND NOWHERE ELSE (owner, 21 Sep 2026). Sending it
	 * again on resend or confirm would mean this client holding it in memory
	 * behind the code sheet for the whole flow — the server's schema refuses it
	 * there for exactly that reason.
	 */
	it("start carries currentPassword; resend and confirm never do", async () => {
		replies.push(codeSent("r1"), codeSent("r2"), {
			status: 200,
			body: {
				success: true,
				message: "Email updated",
				data: {
					accessToken: "a",
					refreshToken: "r",
					email: "new@atlas-agency.my",
					phoneNum: null,
				},
			},
		});

		await startContactChange({
			kind: "email",
			value: "New@Atlas-Agency.MY",
			currentPassword: "s3cret",
		});
		await resendContactChangeNewCode({
			requestId: "r1",
			kind: "email",
			value: "new@atlas-agency.my",
		});
		await confirmContactChange({
			requestId: "r2",
			kind: "email",
			value: "new@atlas-agency.my",
			code: "123456",
		});

		expect(seen[0].body).toEqual({
			kind: "email",
			value: "new@atlas-agency.my",
			currentPassword: "s3cret",
		});
		expect(seen[1].body).not.toHaveProperty("currentPassword");
		expect(seen[2].body).not.toHaveProperty("currentPassword");
		// And nothing carries the retired second id.
		for (const call of seen)
			expect(call.body).not.toHaveProperty("newRequestId");
	});
});

describe("forgot password — signed out", () => {
	it("start goes out WITHOUT a bearer token and returns the request", async () => {
		replies.push({
			status: 200,
			body: {
				success: true,
				message:
					"If that account exists, we sent a code by WhatsApp, SMS and email.",
				data: { requestId: "fp1", expiresInSec: 600, resendAfterSec: 60 },
			},
		});

		const started = await startForgotPassword({
			kind: "email",
			value: "  Owner@Atlas-Agency.my ",
		});

		expect(started).toEqual({
			requestId: "fp1",
			expiresInSec: 600,
			resendAfterSec: 60,
		});
		expect(seen[0].url).toBe("/auth/password/forgot/start");
		expect(seen[0].authorization).toBeUndefined();
		expect(seen[0].body).toEqual({ email: "owner@atlas-agency.my" });
	});

	it("start by PHONE sends { phoneNum } only — never an email key beside it", async () => {
		replies.push({
			status: 200,
			body: {
				success: true,
				message:
					"If that account exists, we sent a code by WhatsApp, SMS and email.",
				data: { requestId: "fp2", expiresInSec: 600, resendAfterSec: 60 },
			},
		});

		// The server's schema refuses a body carrying BOTH keys ("Enter your
		// email or your phone number"), so the other key must be absent, not "".
		const reading = readForgotIdentifier("012-345 6789");
		if (!reading.ok) throw new Error("expected a phone reading");
		await startForgotPassword(reading.identifier);

		expect(seen[0].url).toBe("/auth/password/forgot/start");
		expect(seen[0].authorization).toBeUndefined();
		expect(seen[0].body).toEqual({ phoneNum: "+60123456789" });
	});

	it("complete with a wrong code throws, and never touches the kick", async () => {
		replies.push({
			status: 400,
			body: { success: false, message: "Invalid code", data: null },
		});

		await expect(
			completeForgotPassword({
				requestId: "fp1",
				code: "000000",
				password: "new-pw",
			}),
		).rejects.toMatchObject({ status: 400, message: "Invalid code" });
		expect(kickToLogin).not.toHaveBeenCalled();
	});
});
