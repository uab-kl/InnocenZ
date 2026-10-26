import { describe, expect, it } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import { disputeQueueIntro, queueElsewhereLine } from "./queue-read-only-copy";

/**
 * A Director reads Payroll → Disputes and Overtime but cannot decide (22 Oct
 * 2026: they were told "Accepting records the decision…" and "switch weeks
 * above to decide it"). The deciding lanes keep their instructions.
 */

const t = translations.en;
const zh = translations.zh;

describe("queueElsewhereLine", () => {
	it("tells a deciding lane to decide", () => {
		expect(queueElsewhereLine("dispute", 1, true, t)).toBe(
			"1 open dispute in another week — switch weeks above to decide it.",
		);
		expect(queueElsewhereLine("overtime", 3, true, t)).toContain("decide them");
	});

	it("tells a read-only lane to look, never to decide", () => {
		for (const kind of ["dispute", "overtime"] as const) {
			for (const n of [1, 4]) {
				const line = queueElsewhereLine(kind, n, false, t);
				// "undecided" describes the claim; "to decide" instructs the reader.
				expect(line).not.toMatch(/to decide/i);
				expect(line).toMatch(/to see/);
				expect(line).toContain(String(n));
			}
		}
		expect(queueElsewhereLine("dispute", 2, false, t)).toBe(
			"2 open disputes in another week — switch weeks above to see them.",
		);
	});

	it("has a Chinese line for every case", () => {
		for (const kind of ["dispute", "overtime"] as const) {
			for (const canDecide of [true, false]) {
				const line = queueElsewhereLine(kind, 2, canDecide, zh);
				expect(line).toContain("2");
				expect(line).not.toBe(queueElsewhereLine(kind, 2, canDecide, t));
			}
		}
		expect(queueElsewhereLine("dispute", 1, false, zh)).toContain("查看");
	});
});

describe("disputeQueueIntro", () => {
	it("keeps the decision note for owner and finance", () => {
		expect(disputeQueueIntro(true, t)).toBe(
			t.agencyQueues.acceptingRecordsDecision,
		);
	});

	it("gives a read-only lane a view-only sentence instead", () => {
		expect(disputeQueueIntro(false, t)).toBe(
			t.agencyQueues.disputesViewOnlyIntro,
		);
		expect(disputeQueueIntro(false, t)).not.toMatch(/^Accepting/);
		expect(disputeQueueIntro(false, zh)).toBe(
			zh.agencyQueues.disputesViewOnlyIntro,
		);
	});
});
