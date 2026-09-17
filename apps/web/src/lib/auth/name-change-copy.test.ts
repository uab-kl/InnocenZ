import {
	AxiosError,
	type AxiosResponse,
	type InternalAxiosRequestConfig,
} from "axios";
import { describe, expect, it } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import { nameChangeErrorText } from "./name-change-copy";

/**
 * The name lane toasted axios's "Request failed with status code 400" — English
 * on a 中文 session, and not the reason. The sentences below are the server's
 * own (user.controller.ts `updateProfile`, 17 Sep 2026).
 */
const HAS_CJK = /[㐀-鿿]/;

function refusal(status: number, message?: string): AxiosError {
	const config = { headers: {} } as InternalAxiosRequestConfig;
	const response: AxiosResponse = {
		data: message === undefined ? {} : { success: false, message, data: null },
		status,
		statusText: String(status),
		headers: {},
		config,
		request: {},
	};
	return new AxiosError(
		`Request failed with status code ${status}`,
		AxiosError.ERR_BAD_REQUEST,
		config,
		{},
		response,
	);
}

describe("nameChangeErrorText", () => {
	it("reads the display-name bounds out of the server's sentence", () => {
		const error = refusal(
			400,
			"Display name must be between 2 and 100 characters",
		);
		const en = nameChangeErrorText(error, translations.en);
		expect(en).toContain("2");
		expect(en).toContain("100");
		expect(en).not.toMatch(/status code/);
		const zh = nameChangeErrorText(error, translations.zh);
		expect(zh).toMatch(HAS_CJK);
		expect(zh).toContain("2");
		expect(zh).toContain("100");
	});

	it("reads the legal-name bounds too", () => {
		const zh = nameChangeErrorText(
			refusal(400, "Legal full name must be between 1 and 255 characters"),
			translations.zh,
		);
		expect(zh).toMatch(HAS_CJK);
		expect(zh).toContain("255");
	});

	it("a 403 is somebody else's id, not a signed-out session", () => {
		expect(
			nameChangeErrorText(refusal(403, "Unauthorized"), translations.en),
		).toBe(translations.en.profile.nameUpdateNotYours);
		expect(
			nameChangeErrorText(refusal(403, "Unauthorized"), translations.zh),
		).toBe(translations.zh.profile.nameUpdateNotYours);
	});

	it("the catch-all 500 goes through the auth localiser", () => {
		expect(
			nameChangeErrorText(
				refusal(500, "Internal Server Error"),
				translations.zh,
			),
		).toBe(translations.zh.authCodes.serverInternalError);
	});

	it("no sentence, no response, or not an axios error: the fallback, never axios's English", () => {
		expect(nameChangeErrorText(refusal(400), translations.zh)).toBe(
			translations.zh.profile.nameUpdateFailed,
		);
		expect(
			nameChangeErrorText(refusal(404, "Not Found"), translations.en),
		).toBe(translations.en.profile.nameUpdateFailed);
		const network = new AxiosError("Network Error", AxiosError.ERR_NETWORK);
		expect(nameChangeErrorText(network, translations.zh)).toBe(
			translations.zh.profile.nameUpdateFailed,
		);
		expect(nameChangeErrorText(new Error("boom"), translations.en)).toBe(
			translations.en.profile.nameUpdateFailed,
		);
	});

	it("an unknown sentence is shown as the server wrote it", () => {
		const unknown = "Too many requests, please try again later.";
		expect(nameChangeErrorText(refusal(429, unknown), translations.zh)).toBe(
			unknown,
		);
	});
});
