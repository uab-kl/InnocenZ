import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import {
	type AgencyPenaltyRules,
	penaltyRulesFromBackend,
	penaltyRulesSaveInput,
} from "@agency-portal/lib/pr-penalties";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	type AgencyPenaltyRulesApiResponse,
	fetchAgencyPenaltyRules,
	saveAgencyPenaltyRules,
} from "@/services/agency-penalty-rules";

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

	const query = useQuery({
		queryKey: ["agency-penalty-rules", agencyId ?? "none"],
		queryFn: (): Promise<AgencyPenaltyRulesApiResponse> =>
			fetchAgencyPenaltyRules(agencyId as string, logout),
		enabled: backed,
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
