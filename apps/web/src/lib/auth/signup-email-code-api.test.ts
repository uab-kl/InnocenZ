import {
	AxiosError,
	type AxiosResponse,
	type InternalAxiosRequestConfig,
} from "axios";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthFlowError } from "@/lib/auth/auth-flow-client";
import { getPublicClient } from "@/lib/axios-v1";
import { requestSignupEmailCode } from "./signup-email-code-api";

/**
 * `POST /auth/signup-email-code` — WHAT GOES UP, AND WHAT A REFUSAL CARRIES.
 *
 * The REAL public axios client with only its transport replaced, so nothing
 * leaves the test (the base URL is a dead address anyway — vitest.config.ts).
 * No code is ever sent to anyone from here.
 */

type Reply = {
	status: number;
	body: unknown;
	headers?: Record<string, string>;
};

let replies: Reply[] = [];
let seen: Array<{ url: string | undefined; body: unknown; auth: unknown }> = [];

function fakeAdapter(config: InternalAxiosRequestConfig) {
	const reply = replies.shift();
	if (!reply) throw new Error(`No scripted reply for ${config.url}`);
	seen.push({
		url: config.url,
		body: typeof config.data === "string" ? JSON.parse(config.data) : null,
		auth: config.headers?.Authorization,
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

const CODE_ID = "0b0c8d62-7a64-4d3e-9d8f-3c0b4b1f2a11";
const SENT = "We sent a 6-digit code to that email — it expires in 10 minutes";

beforeEach(() => {
	replies = [];
	seen = [];
	getPublicClient().defaults.adapter = fakeAdapter;
});

afterEach(() => {
	expect(replies).toHaveLength(0); // every scripted reply was consumed
});

describe("requestSignupEmailCode", () => {
	it("posts the typed email, trimmed, with no session attached", async () => {
		replies.push({
			status: 200,
			body: {
				success: true,
				message: SENT,
				data: { codeId: CODE_ID, expiresInSec: 600, resendAfterSec: 60 },
			},
		});

		const sent = await requestSignupEmailCode("  Owner@Venue.com ");

		expect(seen).toEqual([
			{
				url: "/auth/signup-email-code",
				body: { email: "Owner@Venue.com" },
				auth: undefined,
			},
		]);
		expect(sent).toEqual({
			codeId: CODE_ID,
			expiresInSec: 600,
			resendAfterSec: 60,
			message: SENT,
		});
	});

	it("falls back to the contract's timings when the body leaves them out", async () => {
		replies.push({
			status: 200,
			body: { success: true, message: SENT, data: { codeId: CODE_ID } },
		});
		const sent = await requestSignupEmailCode("owner@venue.com");
		expect(sent.expiresInSec).toBe(600);
		expect(sent.resendAfterSec).toBe(60);
	});

	it("a 200 without a code id is a refusal, not a code", async () => {
		replies.push({
			status: 200,
			body: { success: false, message: "Something odd", data: null },
		});
		const error = await requestSignupEmailCode("owner@venue.com").catch(
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(AuthFlowError);
		expect(error).toMatchObject({ message: "Something odd", status: 200 });
	});

	it("the resend window carries the server's sentence and its seconds", async () => {
		replies.push({
			status: 429,
			body: {
				success: false,
				message: "Wait 42s before requesting another code",
				data: null,
			},
		});
		const error = await requestSignupEmailCode("owner@venue.com").catch(
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(AuthFlowError);
		expect(error).toMatchObject({
			message: "Wait 42s before requesting another code",
			status: 429,
			retryAfterSec: 42,
		});
	});

	it.each([
		[400, "Enter a valid email address"],
		[429, "Too many verification codes requested. Please try again later."],
		[
			429,
			"Too many verification codes requested for that email. Please try again later.",
		],
		[503, "Could not send the code — try again in a few minutes"],
	])("a %i keeps the server's own sentence: %s", async (status, message) => {
		replies.push({ status, body: { success: false, message, data: null } });
		await expect(
			requestSignupEmailCode("owner@venue.com"),
		).rejects.toMatchObject({ message, status });
	});

	it("no sentence at all (the request never arrived) is an empty message", async () => {
		getPublicClient().defaults.adapter = () =>
			Promise.reject(new AxiosError("Network Error", AxiosError.ERR_NETWORK));
		const error = await requestSignupEmailCode("owner@venue.com").catch(
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(AuthFlowError);
		expect(error).toMatchObject({ message: "", status: null });
	});
});
