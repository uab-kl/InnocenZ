import { describe, expect, test } from "vitest";
import { buildSendGate } from "./use-agency-pv-day-review";

/**
 * The client mirror of the backend's `voucherSendGate()`. These tests exist
 * because the mirror was WRONG in the direction that hurts: it carried the
 * receipt term and not the overtime term, so on 3 Sep 2026 PV-000009 offered an
 * enabled Send button for a voucher the server refused twice over.
 *
 * Every case here is stated as "what does the agency see", not "what does the
 * function return", because the whole point of the mirror is the caption.
 */
describe("buildSendGate", () => {
	const verified = [{ receiptNo: "RCP-000020", status: "verified" as const }];
	const pending = [{ receiptNo: "RCP-000031", status: "pending" as const }];

	test("allows the send when nothing is outstanding", () => {
		const gate = buildSendGate([], verified, []);
		expect(gate.allowed).toBe(true);
		expect(gate.reason).toBeNull();
	});

	test("blocks on a pending receipt and names it in the count", () => {
		const gate = buildSendGate([], pending, []);
		expect(gate.allowed).toBe(false);
		expect(gate.pendingReceipts).toEqual(["RCP-000031"]);
		expect(gate.reason).toContain("1 receipt(s) not yet reviewed");
	});

	test("blocks on undecided overtime even when every receipt is verified", () => {
		const gate = buildSendGate([], verified, ["2026-08-20", "2026-08-22"]);
		expect(gate.allowed).toBe(false);
		expect(gate.pendingReceipts).toEqual([]);
		expect(gate.reason).toContain("2 overtime claim(s) not yet decided");
	});

	test("names the overtime DATES, so the caption points at real rows", () => {
		const gate = buildSendGate([], verified, ["2026-08-20", "2026-08-22"]);
		expect(gate.reason).toContain("2026-08-20, 2026-08-22");
	});

	test("reports both blockers at once rather than the first one found", () => {
		const gate = buildSendGate([], pending, ["2026-08-22"]);
		expect(gate.allowed).toBe(false);
		expect(gate.reason).toContain("receipt(s) not yet reviewed");
		expect(gate.reason).toContain("overtime claim(s) not yet decided");
	});

	/*
	 * The regression this file was written for. Before 3 Sep 2026 the overtime
	 * argument did not exist, so this exact input returned `allowed: true` and
	 * the button rendered live — the server then answered 409 into a mutation
	 * with no error handler, and the click did nothing at all.
	 */
	test("PV-000009: verified receipts + two pending claims does NOT send", () => {
		const gate = buildSendGate(
			[],
			[
				{ receiptNo: "RCP-000020", status: "verified" },
				{ receiptNo: "RCP-000021", status: "verified" },
				{ receiptNo: "RCP-000022", status: "verified" },
				{ receiptNo: "RCP-000023", status: "verified" },
				{ receiptNo: "RCP-000024", status: "verified" },
			],
			["2026-08-20", "2026-08-22"],
		);
		expect(gate.allowed).toBe(false);
	});

	// Omitting the argument must not silently start blocking (or start allowing)
	// for the callers that predate it.
	test("an omitted overtime list is no overtime, not unknown overtime", () => {
		expect(buildSendGate([], verified).allowed).toBe(true);
	});
});
