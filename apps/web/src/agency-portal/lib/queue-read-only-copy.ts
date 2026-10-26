import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/**
 * WHAT THE PAYROLL QUEUES SAY TO A LANE THAT MAY ONLY READ THEM.
 *
 * The dispute and overtime queues are readable by every agency lane, while
 * deciding is owner/finance only (`raisePv`). Their rows already swapped Accept
 * / Reject for a "only the owner or finance can…" line — but the sentences
 * AROUND the rows did not: a Director was still told "Accepting records the
 * decision…" and "switch weeks above to decide it", instructions for an act
 * their lane cannot perform. One place picks the sentence, so the two queues
 * cannot drift apart on it.
 */

export type QueueKind = "dispute" | "overtime";

/** "{n} open dispute in another week — switch weeks above to decide/see it." */
export function queueElsewhereLine(
	kind: QueueKind,
	n: number,
	canDecide: boolean,
	t: PortalTranslations,
): string {
	const q = t.agencyQueues;
	const one = n === 1;
	const template =
		kind === "dispute"
			? canDecide
				? one
					? q.openDisputesElsewhereOne
					: q.openDisputesElsewhereMany
				: one
					? q.openDisputesElsewhereViewOne
					: q.openDisputesElsewhereViewMany
			: canDecide
				? one
					? q.overtimeElsewhereOne
					: q.overtimeElsewhereMany
				: one
					? q.overtimeElsewhereViewOne
					: q.overtimeElsewhereViewMany;
	return fill(template, { n });
}

/** The sentence above the dispute rows. */
export function disputeQueueIntro(
	canDecide: boolean,
	t: PortalTranslations,
): string {
	return canDecide
		? t.agencyQueues.acceptingRecordsDecision
		: t.agencyQueues.disputesViewOnlyIntro;
}
