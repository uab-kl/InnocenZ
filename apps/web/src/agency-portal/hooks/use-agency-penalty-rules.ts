import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import type { AgencySubRole } from "@agency-portal/lib/agency-rbac";
import {
	type AgencyPenaltyRules,
	penaltyRulesFromBackend,
	penaltyRulesSaveInput,
} from "@agency-portal/lib/pr-penalties";
import { useStore } from "@agency-portal/lib/store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	type AgencyPenaltyRulesApiResponse,
	fetchAgencyPenaltyRules,
	saveAgencyPenaltyRules,
} from "@/services/agency-penalty-rules";

/**
 * The lanes `GET /agency/:id/penalty-rules` admits:
 * `requireAgencySubRoleScoped('id', 'owner', 'finance')`, with the guarantor
 * passing wherever the owner does (`holdsAgencyLane`). A LANE gate on the
 * server, not a module grant, so it is kept in step by hand — the same as
 * `useAgencyIsOwner`. A lane missing here only hides the rules; a lane wrongly
 * added here is the 403 this list exists to stop.
 */
export const PENALTY_RULES_READ_LANES: readonly AgencySubRole[] = [
	"agency_owner",
	"agency_guarantor",
	"agency_finance",
];

/**
 * The signed-in agency's attendance & penalty policy, from the backend.
 *
 * Gated on a real session (`getAgencyIdentity()`); demo sessions get
 * `backed: false` and keep the demo store, so a demo login never shows another
 * agency's fine schedule. Unlike the outlet workspace there is no 404 case —
 * the endpoint answers `[]` for an agency that has written no rules, because
 * "nothing is enforced" is a real answer and a 404 would make a fresh agency's
 * editor look broken.
 */
export function useAgencyPenaltyRules() {
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const identity = useMemo(() => getAgencyIdentity(), []);
	const backed = identity !== null;
	const agencyId = identity?.agencyId ?? null;
	const subRole = useStore((s) => s.agencySubRole);
	const mayRead =
		subRole !== null && PENALTY_RULES_READ_LANES.includes(subRole);

	const query = useQuery({
		queryKey: ["agency-penalty-rules", agencyId ?? "none"],
		queryFn: (): Promise<AgencyPenaltyRulesApiResponse> =>
			fetchAgencyPenaltyRules(agencyId as string, logout),
		// Only for a lane the server will answer. A Director hard-loading Manage PR
		// mounted this page for a moment before the route guard sent them home,
		// and that moment was enough to fire the read and log a 403 every time.
		// A null sub-role (membership still loading) waits rather than guesses.
		enabled: backed && mayRead,
		staleTime: 60_000,
	});

	const rules = useMemo<AgencyPenaltyRules | null>(() => {
		if (!backed || !query.data) return null;
		return penaltyRulesFromBackend(query.data.data);
	}, [backed, query.data]);

	const saveMut = useMutation({
		mutationFn: (next: AgencyPenaltyRules) =>
			saveAgencyPenaltyRules(
				agencyId as string,
				penaltyRulesSaveInput(next),
				logout,
			),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["agency-penalty-rules"] }),
	});

	return {
		backed,
		rules,
		isLoading: backed && query.isLoading,
		// Surfaced so the screen can say "failed" instead of "loading". A failed
		// read leaves `rules` null exactly like a pending one, so without this the
		// editor sits on its loading line forever and a broken endpoint is
		// indistinguishable from a slow one.
		isError: query.isError,
		isSaving: saveMut.isPending,
		save: (next: AgencyPenaltyRules) => saveMut.mutateAsync(next),
	};
}
