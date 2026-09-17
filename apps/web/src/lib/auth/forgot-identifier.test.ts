import { describe, expect, it } from "vitest";
import { forgotStartBody, readForgotIdentifier } from "./forgot-identifier";

/**
 * ONE FIELD, EMAIL OR PHONE — decided by shape (owner, 17 Sep 2026: forgot
 * password by the email OR the phone the person remembers).
 *
 * Why a unit test: a wrong reading is SILENT. The server answers every
 * well-formed identifier with the same neutral 200, so a phone number read as
 * an email, or normalised to a different line, looks exactly like a code that
 * simply never arrived.
 */
describe("readForgotIdentifier", () => {
	it("reads an @ as an email, trimmed and lower-cased", () => {
		expect(readForgotIdentifier("  Owner@Atlas-Agency.MY ")).toEqual({
			ok: true,
			identifier: { kind: "email", value: "owner@atlas-agency.my" },
		});
	});

	it("refuses an @ that is not an address", () => {
		expect(readForgotIdentifier("owner@atlas")).toEqual({
			ok: false,
			problem: "invalidEmail",
		});
		expect(readForgotIdentifier("@")).toEqual({
			ok: false,
			problem: "invalidEmail",
		});
	});

	it("reads digits as a phone, normalised like every other web lane", () => {
		for (const typed of [
			"0123456789",
			"012-345 6789",
			"+60 12-345 6789",
			"60123456789",
			"+60 0123456789",
			"(012) 345-6789",
		]) {
			expect(readForgotIdentifier(typed), typed).toEqual({
				ok: true,
				identifier: { kind: "phone", value: "+60123456789" },
			});
		}
	});

	it("keeps a foreign number written with a +", () => {
		expect(readForgotIdentifier("+65 8123 4567")).toEqual({
			ok: true,
			identifier: { kind: "phone", value: "+6581234567" },
		});
	});

	it("names a phone that is too short or too long", () => {
		expect(readForgotIdentifier("0123")).toEqual({
			ok: false,
			problem: "phoneTooShort",
		});
		expect(readForgotIdentifier("0123456789012345")).toEqual({
			ok: false,
			problem: "phoneTooLong",
		});
	});

	it("refuses letters without an @ — neither an email nor a number", () => {
		expect(readForgotIdentifier("owner.atlas-agency.my")).toEqual({
			ok: false,
			problem: "invalidIdentifier",
		});
		expect(readForgotIdentifier("vicky")).toEqual({
			ok: false,
			problem: "invalidIdentifier",
		});
		// Punctuation a phone may carry, but no digits at all.
		expect(readForgotIdentifier("( - )")).toEqual({
			ok: false,
			problem: "invalidIdentifier",
		});
	});

	it("says empty for nothing typed", () => {
		expect(readForgotIdentifier("   ")).toEqual({
			ok: false,
			problem: "empty",
		});
	});
});

describe("forgotStartBody", () => {
	it("carries exactly one key — the server refuses a body with both", () => {
		expect(forgotStartBody({ kind: "email", value: " A@B.co " })).toStrictEqual(
			{ email: "a@b.co" },
		);
		expect(
			forgotStartBody({ kind: "phone", value: "+60123456789" }),
		).toStrictEqual({ phoneNum: "+60123456789" });
	});
});
