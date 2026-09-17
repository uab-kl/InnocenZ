import {
	AxiosError,
	type AxiosResponse,
	type InternalAxiosRequestConfig,
} from "axios";
import { describe, expect, it } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import { PR_WRITE_SENTENCES, prWriteRefusalText } from "./pr-write-refusal";

/**
 * The sentences are copied from pr.controller.ts / pr.schema.ts (17 Sep 2026),
 * not from the module's map — iterating the map would pass on a map that had
 * forgotten one.
 */
const PR_ROUTE_SENTENCES = [
	"Only an admin can add an existing account by its id",
	"No agency associated with this account",
	"This PR has no linked user account, so profile details cannot be saved",
	"Invalid email",
	"Name is required",
];

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

describe("prWriteRefusalText", () => {
	it.each(PR_ROUTE_SENTENCES)("translates %s", (sentence) => {
		const zh = prWriteRefusalText(refusal(400, sentence), translations.zh, "x");
		expect(zh).not.toBe(sentence);
		expect(zh).toMatch(HAS_CJK);
		const en = prWriteRefusalText(refusal(400, sentence), translations.en, "x");
		expect(en.trim()).not.toBe("");
	});

	it("the map holds exactly the route's sentences", () => {
		expect(Object.keys(PR_WRITE_SENTENCES).sort()).toEqual(
			[...PR_ROUTE_SENTENCES].sort(),
		);
	});

	it("the sign-in contact refusals reuse the auth translations", () => {
		expect(
			prWriteRefusalText(
				refusal(403, "Only the PR can change their sign-in email or phone"),
				translations.zh,
				"x",
			),
		).toBe(translations.zh.authCodes.serverOnlyPrChangesSignIn);
		expect(
			prWriteRefusalText(
				refusal(409, "That email is already used by another account."),
				translations.zh,
				"x",
			),
		).toBe(translations.zh.authCodes.serverEmailTaken);
	});

	it("a generic or missing sentence reads the caller's fallback", () => {
		const fallback = translations.zh.managePr.couldNotSaveProfile;
		for (const error of [
			refusal(404, "Not Found"),
			refusal(500, "Internal Server Error"),
			refusal(400),
			new AxiosError("Network Error", AxiosError.ERR_NETWORK),
			new Error("boom"),
		]) {
			expect(prWriteRefusalText(error, translations.zh, fallback)).toBe(
				fallback,
			);
		}
	});

	it("an unknown sentence is shown as the server wrote it", () => {
		const unknown =
			"This PR is on more than one agency roster — pass agencyId to say which membership to change";
		expect(
			prWriteRefusalText(refusal(409, unknown), translations.zh, "x"),
		).toBe(unknown);
	});
});
