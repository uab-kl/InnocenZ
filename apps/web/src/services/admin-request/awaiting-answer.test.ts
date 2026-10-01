import { describe, expect, it } from "vitest";
import { type AdminRequestStatus, isAwaitingAnswer } from "./index";

/**
 * 28 Sep 2026 follow-up: resolving an answered POS quote or Custom price
 * applied it to billing again. The server now claims only a request still
 * awaiting an answer; the admin Requests page offers Resolve / Cancel on the
 * same test, so it never shows a button whose only outcome is a refusal.
 */
describe("isAwaitingAnswer", () => {
	it.each(["pending", "contacted"] as const)("%s is still open", (status) => {
		expect(isAwaitingAnswer(status)).toBe(true);
	});

	it.each([
		"resolved",
		"declined",
		"approved",
		"direct",
		"withdrawn",
	] as AdminRequestStatus[])("%s is answered — no Resolve, no Cancel", (status) => {
		expect(isAwaitingAnswer(status)).toBe(false);
	});
});
