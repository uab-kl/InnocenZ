import { useAgencyPenaltyProposals } from "@agency-portal/hooks/use-agency-penalty-proposals";
import { useAgencyUncharged } from "@agency-portal/hooks/use-agency-uncharged";
import {
	type PrPenaltyItem,
	prPenaltyItems,
	prPenaltyTotalRm,
} from "@agency-portal/lib/pr-penalty-items";
import { useMemo } from "react";

/**
 * One PR's real penalties for the Manage PR profile — see `prPenaltyItems`.
 *
 * Reads through the two hooks Payroll and the Manage PR list already hold, so
 * it shares their cache keys and costs no request of its own. Real sessions
 * only (`backed`); a demo session keeps its own evaluator, because the demo
 * store is the only place a demo PR's counters exist.
 */
export function useAgencyPrPenalties(prId: string): {
	backed: boolean;
	items: PrPenaltyItem[];
	totalRm: number;
	isLoading: boolean;
	isError: boolean;
} {
	const proposals = useAgencyPenaltyProposals();
	const uncharged = useAgencyUncharged();
	const items = useMemo(
		() =>
			prPenaltyItems(prId, {
				proposals: proposals.proposals,
				penalties: uncharged.penalties,
				cancellations: uncharged.cancellations,
			}),
		[prId, proposals.proposals, uncharged.penalties, uncharged.cancellations],
	);
	return {
		backed: proposals.backed,
		items,
		totalRm: prPenaltyTotalRm(items),
		isLoading: proposals.isLoading || uncharged.isLoading,
		isError: proposals.isError || uncharged.isError,
	};
}
