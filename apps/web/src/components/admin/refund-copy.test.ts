import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import {
	isRefundDue,
	REFUND_DUE_PREFIXES,
} from "@/services/subscription-payment";
import { localiseRefundMessage, REFUND_RULES } from "./refund-copy";

/**
 * "Mark refunded" confirms and refuses in the SERVER's words (30 Sep 2026), and
 * those words are English. Every sentence below is copied from its producer —
 * apps/backend/src/features/subscription-payment/refund-message.ts, and the
 * controller's plain "Not Found" — never from the rules, so a rule that stops
 * matching its producer fails here instead of showing English to a 中文 admin.
 */
const BACKEND = {
	refunded:
		"INV-000049: RM 125.00 marked refunded — reference MBB-20260930-0001",
	referenceMissing:
		"Enter the refund reference — the bank or gateway reference of the money sent back",
	referenceTooLong: "The refund reference is too long — 60 characters at most",
	alreadyRefunded: "This payment is already marked refunded",
	notOwedBack:
		"Only a payment owed back can be marked refunded — this one did not land on a voided or already-paid bill",
	noRoom:
		"That refund reference is too long to keep beside this payment's own reference — use a shorter one",
	notFound: "Not Found",
} as const;

const HAS_CJK = /[㐀-鿿]/;
const zh = (message: string) => localiseRefundMessage(message, translations.zh);
const en = (message: string) => localiseRefundMessage(message, translations.en);

describe("localiseRefundMessage", () => {
	it("knows every sentence the server sends — one rule each", () => {
		for (const sentence of Object.values(BACKEND)) {
			const matching = REFUND_RULES.filter((rule) =>
				rule.pattern.test(sentence),
			);
			expect(matching).toHaveLength(1);
		}
		expect(REFUND_RULES).toHaveLength(Object.keys(BACKEND).length);
	});

	it("English reads exactly as the server wrote it", () => {
		const { notFound, ...sentences } = BACKEND;
		for (const sentence of Object.values(sentences)) {
			expect(en(sentence)).toBe(sentence);
		}
		// The bare status word becomes a sentence about the payment.
		expect(en(notFound)).toBe(
			translations.en.adminService.serverRefundPaymentGone,
		);
	});

	it("中文: every sentence is translated, none left half-filled", () => {
		for (const sentence of Object.values(BACKEND)) {
			const out = zh(sentence);
			expect(out).not.toBe(sentence);
			expect(out).toMatch(HAS_CJK);
			expect(out).not.toContain("{");
		}
	});

	it("中文: the bill, the amount and the reference are values and pass through", () => {
		const out = zh(BACKEND.refunded);
		for (const value of ["INV-000049", "RM 125.00", "MBB-20260930-0001"]) {
			expect(out).toContain(value);
		}
		expect(out).toBe(
			translations.zh.adminService.serverRefunded
				.replace("{invoice}", "INV-000049")
				.replace("{amount}", "RM 125.00")
				.replace("{reference}", "MBB-20260930-0001"),
		);
		expect(zh(BACKEND.referenceTooLong)).toContain("60");
	});

	it("a reference ending in a full stop keeps it — it is a value, not punctuation", () => {
		expect(
			zh("INV-000049: RM 125.00 marked refunded — reference REF-7."),
		).toContain("REF-7.");
	});

	it("a sentence it does not know is shown exactly as the server wrote it", () => {
		const newer = "Refund recorded against a newer rule";
		expect(zh(newer)).toBe(newer);
		expect(en(newer)).toBe(newer);
	});
});

/**
 * The payment panel badges an attempt "Refund due" off the two markers the
 * server writes. The web cannot import them, so this reads the BACKEND FILE
 * that spells them: move the words there and this fails here.
 */
describe("the refund-due markers the payment panel reads", () => {
	it("are spelled exactly as the backend spells them", () => {
		// From apps/web (npx vitest) or the repo root (nx) — never a silent skip.
		const file =
			"backend/src/features/subscription-payment/refund-due.repository.ts";
		const path = [
			resolve(process.cwd(), "..", file),
			resolve(process.cwd(), "apps", file),
		].find((candidate) => existsSync(candidate));
		expect(path).toBeDefined();
		const backend = readFileSync(path ?? "", "utf8");
		expect(backend).toContain(
			`export const REFUND_DUE_VOIDED_BILL_PREFIX = '${REFUND_DUE_PREFIXES[0]}';`,
		);
		expect(backend).toContain(
			`export const REFUND_DUE_PAID_TWICE_PREFIX = '${REFUND_DUE_PREFIXES[1]}';`,
		);
	});

	it("mark money owed back until it is refunded — and nothing else", () => {
		const voided =
			"PAID FOR A VOIDED BILL — money taken for INV-000049, which was voided; refund due";
		const twice =
			"PAID TWICE — money taken but INV-000049 was already paid; refund due";
		expect(isRefundDue({ status: "pending", failureReason: voided })).toBe(
			true,
		);
		expect(isRefundDue({ status: "initiated", failureReason: twice })).toBe(
			true,
		);
		expect(isRefundDue({ status: "refunded", failureReason: voided })).toBe(
			false,
		);
		expect(isRefundDue({ status: "pending", failureReason: null })).toBe(false);
		// A gateway's decline that merely LOOKS like a marker is stored labelled.
		expect(
			isRefundDue({
				status: "failed",
				failureReason: "Gateway: PAID TWICE — x",
			}),
		).toBe(false);
	});
});
