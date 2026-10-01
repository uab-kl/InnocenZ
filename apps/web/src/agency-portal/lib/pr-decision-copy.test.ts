import { describe, expect, it } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import {
	localisePrDecisionMessage,
	PR_DECISION_SENTENCES,
	prDecisionText,
} from "./pr-decision-copy";

/**
 * Copied from apps/backend/src/features/agency/join-decision.ts (decidedMessage,
 * settledDecisionAnswer) and agency.controller.ts setAgencyPrApproval on
 * 29 Sep 2026 — every fixed sentence `PATCH /agency/:id/prs/:userId/approval`
 * can answer. Written out rather than read from the list, so an entry that
 * stops matching the server fails here.
 */
const SERVER_SENTENCES = [
	// decidedMessage — a real decision (it used to answer "OK").
	"Request approved — they are on your roster now.",
	"Request declined — they were not added to your roster.",
	"Departure approved — they are no longer on your roster.",
	"Departure declined — they stay on your roster, and your reason was sent to them.",
	// settledDecisionAnswer — a repeat (200) or a conflict (409).
	"Already approved — they are on your roster. Nothing changed.",
	"Their departure was already declined — they stay on your roster. Nothing changed.",
	"This request was already approved and they are on your roster, so it can no longer be declined. Nothing changed.",
	"Already declined. Nothing changed.",
	"This request was already declined, so it can no longer be approved — they can apply again, and the new request will appear here. Nothing changed.",
	"Their departure was already approved — they are no longer on your roster. Nothing changed.",
	"Their departure was already approved, so it can no longer be declined. Nothing changed.",
	// answerMovedDecision and the departure's mandatory reason.
	"This request changed while you were deciding it — reload the page to see it now. Nothing changed.",
	"A reason is required to reject a departure — it is sent to the PR.",
];

const HAS_CJK = /[㐀-鿿]/;

describe("localisePrDecisionMessage", () => {
	it.each(SERVER_SENTENCES)("translates %s", (sentence) => {
		const zh = localisePrDecisionMessage(sentence, translations.zh);
		expect(zh).not.toBe(sentence);
		expect(zh).toMatch(HAS_CJK);
	});

	it.each(
		SERVER_SENTENCES,
	)("reads %s in English exactly as the server wrote it", (sentence) => {
		expect(localisePrDecisionMessage(sentence, translations.en)).toBe(sentence);
	});

	it("matches with or without the final full stop, and around stray spaces", () => {
		expect(
			localisePrDecisionMessage(
				"  Request approved — they are on your roster now ",
				translations.zh,
			),
		).toBe(translations.zh.agencyPending.srvJoinApproved);
	});

	it("an unknown sentence — the settlement gate's list of blockers — is shown as the server wrote it", () => {
		const blockers =
			"The departure cannot be approved yet: 1 shift still assigned (2026-10-02).";
		expect(localisePrDecisionMessage(blockers, translations.zh)).toBe(blockers);
		expect(localisePrDecisionMessage("OK", translations.zh)).toBe("OK");
	});

	it("every entry is exercised by a server sentence", () => {
		for (const entry of PR_DECISION_SENTENCES) {
			expect(
				SERVER_SENTENCES.some(
					(s) => s.trim().replace(/\.$/, "") === entry.sentence,
				),
			).toBe(true);
		}
		expect(PR_DECISION_SENTENCES).toHaveLength(SERVER_SENTENCES.length);
	});
});

describe("prDecisionText", () => {
	it("falls back to the caller's sentence when the server sent none", () => {
		const fallback = translations.zh.approvals.approved;
		expect(prDecisionText(undefined, translations.zh, fallback)).toBe(fallback);
		expect(prDecisionText("  ", translations.zh, fallback)).toBe(fallback);
	});

	it("prefers the server's sentence, translated", () => {
		expect(
			prDecisionText(
				"Departure approved — they are no longer on your roster.",
				translations.zh,
				"fallback",
			),
		).toBe(translations.zh.agencyPending.srvDepartureApproved);
	});
});
