import { describe, expect, it } from "vitest";
import { phoneNumberProblem, toWhatsAppNumber } from "./phone-api";

/**
 * THE NUMBER WHATSAPP IS ASKED TO DELIVER TO.
 *
 * Owner, 11 Sep 2026: "the otp my phone can't receive", then "need the format
 * then only can receive otp?" and "no need start with 60+, also can key in
 * normal like for e.g 0123456789 can".
 *
 * ⚠️ EVERY FAILURE HERE IS SILENT. The server's only cleaning is
 * `value.replace(/\D/g,'')`, so a malformed number is accepted, a code is
 * genuinely sent, and it goes nowhere — the person waits for a message that
 * cannot arrive and there is nothing on screen to explain it. That is why this
 * is unit-tested rather than left to a browser check: the bug looks exactly
 * like a working flow.
 */
describe("toWhatsAppNumber", () => {
	it("accepts the way a Malaysian number is actually written", () => {
		// The original bug: `0123456789` was sent verbatim and is not E.164.
		expect(toWhatsAppNumber("0123456789")).toBe("60123456789");
		expect(toWhatsAppNumber("012-345 6789")).toBe("60123456789");
		expect(toWhatsAppNumber(" 0123456789 ")).toBe("60123456789");
	});

	it("accepts the same number written with the country code", () => {
		expect(toWhatsAppNumber("+60 12-345 6789")).toBe("60123456789");
		expect(toWhatsAppNumber("60123456789")).toBe("60123456789");
		expect(toWhatsAppNumber("+60123456789")).toBe("60123456789");
	});

	it("does not double the zero when the dial code is typed WITH the local form", () => {
		// "60" + "0123456789" — dial code followed by the local number, zero and
		// all. This produced `600123456789`: one digit too long, undeliverable,
		// and long enough to pass the server's length check.
		expect(toWhatsAppNumber("60 0123456789")).toBe("60123456789");
		expect(toWhatsAppNumber("+60 0123456789")).toBe("60123456789");
	});

	it("leaves a foreign number alone when it is written with a +", () => {
		// Singapore and the UK were being mangled into `606581234567` and
		// `60447911123456` — the dial code prepended to a number that already had
		// one, with no way to enter a foreign handset at all.
		expect(toWhatsAppNumber("+65 8123 4567")).toBe("6581234567");
		expect(toWhatsAppNumber("+44 7911 123456")).toBe("447911123456");
	});

	it("returns empty for nothing, rather than a bare dial code", () => {
		// `"60"` would be a number the server accepts and WhatsApp cannot reach.
		expect(toWhatsAppNumber("")).toBe("");
		expect(toWhatsAppNumber("   ")).toBe("");
		expect(toWhatsAppNumber("abc")).toBe("");
	});
});

describe("phoneNumberProblem", () => {
	const copy = { empty: "EMPTY", tooShort: "SHORT", tooLong: "LONG" };

	it("passes every real Malaysian mobile length", () => {
		// 9 local digits (01x-xxx xxxx) and 10 (011-xxxx xxxx) both exist.
		expect(phoneNumberProblem("0123456789", copy)).toBeNull();
		expect(phoneNumberProblem("01123456789", copy)).toBeNull();
		expect(phoneNumberProblem("+60 12-345 6789", copy)).toBeNull();
	});

	it("names the problem instead of sending a code nowhere", () => {
		expect(phoneNumberProblem("", copy)).toBe("EMPTY");
		expect(phoneNumberProblem("123", copy)).toBe("SHORT");
		expect(phoneNumberProblem("0123456789012345", copy)).toBe("LONG");
	});
});
