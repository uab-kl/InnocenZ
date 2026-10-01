/**
 * THE SERVER'S APPROVALS-DECISION SENTENCES, IN THE READER'S LANGUAGE.
 *
 * `PATCH /agency/:id/prs/:userId/approval` decides a PR's join request or
 * departure, and the Approvals page shows its answer as the confirmation (the
 * owner's rule: every action confirms in the server's words). A real decision
 * used to answer "OK"; it now answers a sentence — and the sentences are
 * English, so they are translated here, the way `member-change-copy.ts` does it
 * for the team queue.
 *
 * Sentences read from apps/backend/src/features/agency/join-decision.ts and the
 * route's handler (agency.controller.ts `setAgencyPrApproval`) on 29 Sep 2026 —
 * the only producers of them:
 *
 *   decidedMessage        a real decision (200)
 *   settledDecisionAnswer a repeat (200) or a conflict (409) on a decided row
 *   answerMovedDecision   the row moved while the reader was deciding (409)
 *   departure reason      a departure declined without a reason (400)
 *
 * Compared without a trailing full stop. A sentence this list does not know —
 * the settlement gate's "The departure cannot be approved yet: …", whose list
 * of blockers is data — is shown exactly as the server wrote it, never
 * swallowed and never replaced by a generic "Saved".
 */
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

type Sentence = {
	/** The server's sentence, without its final full stop. */
	sentence: string;
	render: (t: PortalTranslations) => string;
};

/** Exported for the test, which checks it against the backend's own list. */
export const PR_DECISION_SENTENCES: readonly Sentence[] = [
	{
		sentence: "Request approved — they are on your roster now",
		render: (t) => t.agencyPending.srvJoinApproved,
	},
	{
		sentence: "Request declined — they were not added to your roster",
		render: (t) => t.agencyPending.srvJoinDeclined,
	},
	{
		sentence: "Departure approved — they are no longer on your roster",
		render: (t) => t.agencyPending.srvDepartureApproved,
	},
	{
		sentence:
			"Departure declined — they stay on your roster, and your reason was sent to them",
		render: (t) => t.agencyPending.srvDepartureDeclined,
	},
	{
		sentence: "Already approved — they are on your roster. Nothing changed",
		render: (t) => t.agencyPending.srvAlreadyApproved,
	},
	{
		sentence:
			"Their departure was already declined — they stay on your roster. Nothing changed",
		render: (t) => t.agencyPending.srvDepartureAlreadyDeclined,
	},
	{
		sentence:
			"This request was already approved and they are on your roster, so it can no longer be declined. Nothing changed",
		render: (t) => t.agencyPending.srvApprovedCannotDecline,
	},
	{
		sentence: "Already declined. Nothing changed",
		render: (t) => t.agencyPending.srvAlreadyDeclined,
	},
	{
		sentence:
			"This request was already declined, so it can no longer be approved — they can apply again, and the new request will appear here. Nothing changed",
		render: (t) => t.agencyPending.srvDeclinedCannotApprove,
	},
	{
		sentence:
			"Their departure was already approved — they are no longer on your roster. Nothing changed",
		render: (t) => t.agencyPending.srvDepartureAlreadyApproved,
	},
	{
		sentence:
			"Their departure was already approved, so it can no longer be declined. Nothing changed",
		render: (t) => t.agencyPending.srvDepartureApprovedCannotDecline,
	},
	{
		sentence:
			"This request changed while you were deciding it — reload the page to see it now. Nothing changed",
		render: (t) => t.agencyPending.srvDecisionChanged,
	},
	{
		sentence:
			"A reason is required to reject a departure — it is sent to the PR",
		render: (t) => t.agencyPending.srvDepartureReasonRequired,
	},
];

/** One decision sentence in the reader's language; an unknown one verbatim. */
export function localisePrDecisionMessage(
	message: string,
	t: PortalTranslations,
): string {
	const key = message.trim().replace(/\.$/, "");
	const known = PR_DECISION_SENTENCES.find((entry) => entry.sentence === key);
	return known ? known.render(t) : message;
}

/** The sentence to confirm with — the server's, translated — or `fallback` when it sent none. */
export function prDecisionText(
	message: string | null | undefined,
	t: PortalTranslations,
	fallback: string,
): string {
	const trimmed = message?.trim();
	return trimmed ? localisePrDecisionMessage(trimmed, t) : fallback;
}
