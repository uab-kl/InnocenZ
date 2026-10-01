import {
	type AgencyManagedPR,
	type AgencyRosterSlot,
	agencyPortalLabel,
	rosterSlotsForAgency,
	scopeToAgency,
} from "@agency-portal/lib/agency-demo";
import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { useStore } from "@agency-portal/lib/store";
import { useMemo } from "react";
import { useAgencyPrs } from "./use-agency-prs";
import { useRosterSlots } from "./use-roster-slots";

/**
 * WHO IS BOOKED ON ONE DAY — the agency home's PR-on-duty tab and its count.
 *
 * Both read the store's `agencyRoster`, which `buildBlankPortalReset` empties on
 * every real login and nothing refills — so a real agency's home said "No PRs on
 * the floor" and counted 0 while the Roster, one click away, showed PRs checked
 * in. A real session now reads the SAME rows the Roster's Live view does
 * (`useRosterSlots`, one shift_assignment per slot, shared query keys — no extra
 * request when both are mounted) and the PR records Manage PR reads. A demo
 * session keeps the store, scoped to its active agency as before.
 */
export function useAgencyDayRoster(params: {
	dateIso: string;
	/** Gate the backend reads — a lane that may not see the floor passes false. */
	enabled?: boolean;
}): {
	backed: boolean;
	slots: AgencyRosterSlot[];
	agencyPRs: AgencyManagedPR[];
	/** The viewing agency's own name — never a demo company on a real login. */
	agencyLabel: string;
} {
	const { dateIso, enabled = true } = params;
	const identity = useMemo(() => getAgencyIdentity(), []);
	const backed = identity !== null;
	const on = backed && enabled;

	const backendRoster = useRosterSlots({
		fromDate: dateIso,
		toDate: dateIso,
		enabled: on,
	});
	const { prs: backendPrs } = useAgencyPrs({ enabled: on });

	const activeAgencyId = useStore((s) => s.activeAgencyId);
	const allAgencyRoster = useStore((s) => s.agencyRoster);
	const allAgencyPRs = useStore((s) => s.agencyPRs);
	const demoPRs = useMemo(
		() => scopeToAgency(allAgencyPRs, activeAgencyId),
		[allAgencyPRs, activeAgencyId],
	);
	const demoRoster = useMemo(
		() => rosterSlotsForAgency(allAgencyRoster, allAgencyPRs, activeAgencyId),
		[allAgencyRoster, allAgencyPRs, activeAgencyId],
	);

	return {
		backed,
		slots: backed ? backendRoster.slots : demoRoster,
		agencyPRs: backed ? backendPrs : demoPRs,
		agencyLabel: identity?.orgName ?? agencyPortalLabel(activeAgencyId),
	};
}
