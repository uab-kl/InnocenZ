import { describe, expect, test } from "vitest";
import type {
	AgencyReceipt,
	PaymentVoucherDispute,
} from "@/services/payment-voucher";
import {
	isDisputed,
	openDisputesFor,
	receiptsForDispute,
} from "./receipt-disputes";

/**
 * Only the fields these rules read. Cast at the edge rather than filling in
 * thirty irrelevant columns — a fixture mirroring the whole DTO invites the
 * next reader to believe the rule depends on all of it.
 */
const receipt = (over: Partial<AgencyReceipt>): AgencyReceipt =>
	({
		id: "rcp-1",
		voucherId: "pv-1",
		status: "verified",
		source: "scan",
		lines: [],
		...over,
	}) as AgencyReceipt;

const claim = (over: Partial<PaymentVoucherDispute>): PaymentVoucherDispute =>
	({
		id: "d-1",
		voucherId: "pv-1",
		receiptId: null,
		disputeDate: "2026-08-26",
		component: "drinks",
		outcome: null,
		...over,
	}) as PaymentVoucherDispute;

describe("openDisputesFor", () => {
	test("an undecided claim is open", () => {
		const r = receipt({
			disputes: [{ id: "d-1", outcome: null }] as AgencyReceipt["disputes"],
		});
		expect(openDisputesFor(r)).toHaveLength(1);
		expect(isDisputed(r)).toBe(true);
	});

	test("a settled claim is history, not a live badge", () => {
		for (const outcome of ["accepted", "rejected", "withdrawn"] as const) {
			const r = receipt({
				disputes: [{ id: "d-1", outcome }] as AgencyReceipt["disputes"],
			});
			expect(openDisputesFor(r)).toHaveLength(0);
			expect(isDisputed(r)).toBe(false);
		}
	});

	test("no claims and a backend that omits the field both read as not disputed", () => {
		expect(isDisputed(receipt({ disputes: [] }))).toBe(false);
		expect(isDisputed(receipt({}))).toBe(false);
	});
});

describe("receiptsForDispute", () => {
	const tagged = receipt({
		id: "rcp-tagged",
		disputes: [{ id: "d-1", outcome: null }] as AgencyReceipt["disputes"],
	});
	const untagged = receipt({ id: "rcp-untagged", disputes: [] });

	test("returns the receipts the server linked to this claim", () => {
		expect(
			receiptsForDispute(claim({ id: "d-1" }), [tagged, untagged]).map(
				(r) => r.id,
			),
		).toEqual(["rcp-tagged"]);
	});

	test("a claim linked to nothing returns nothing, once the server has spoken", () => {
		// An empty array is the server SAYING none — not the absence of an answer,
		// which is the next test.
		expect(
			receiptsForDispute(claim({ id: "d-other" }), [tagged, untagged]),
		).toEqual([]);
	});

	test("falls back to deriving the link when NO row carries the field", () => {
		// A backend that has not restarted. Returning [] here would blank the
		// evidence block under every claim in the queue.
		const legacy = receipt({
			id: "rcp-legacy",
			disputes: undefined,
			lines: [
				{ lineDate: "2026-08-26", kind: "drinks" },
			] as AgencyReceipt["lines"],
		});
		const otherDay = receipt({
			id: "rcp-other-day",
			disputes: undefined,
			lines: [
				{ lineDate: "2026-08-25", kind: "drinks" },
			] as AgencyReceipt["lines"],
		});
		const otherBucket = receipt({
			id: "rcp-other-bucket",
			disputes: undefined,
			lines: [
				{ lineDate: "2026-08-26", kind: "tips" },
			] as AgencyReceipt["lines"],
		});
		expect(
			receiptsForDispute(claim({}), [legacy, otherDay, otherBucket]).map(
				(r) => r.id,
			),
		).toEqual(["rcp-legacy"]);
	});

	test("a legacy claim that NAMES a receipt names exactly that one", () => {
		const named = receipt({ id: "rcp-named", disputes: undefined });
		const sameDay = receipt({
			id: "rcp-same-day",
			disputes: undefined,
			lines: [
				{ lineDate: "2026-08-26", kind: "drinks" },
			] as AgencyReceipt["lines"],
		});
		expect(
			receiptsForDispute(claim({ receiptId: "rcp-named" }), [
				named,
				sameDay,
			]).map((r) => r.id),
		).toEqual(["rcp-named"]);
	});

	test("a whole-day claim never reaches another PR's paper on the same night", () => {
		const otherVoucher = receipt({
			id: "rcp-other-pr",
			voucherId: "pv-2",
			disputes: undefined,
			lines: [
				{ lineDate: "2026-08-26", kind: "drinks" },
			] as AgencyReceipt["lines"],
		});
		expect(receiptsForDispute(claim({}), [otherVoucher])).toEqual([]);
	});
});
