import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import { managedPrFromBackend } from "@agency-portal/lib/pr-personnel-map";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	fetchPrPersonnel,
	removePrPersonnel,
	type UpdatePrPersonnelInput,
	updatePrPersonnel,
} from "@/services/pr-personnel";

// The Manage-PR edit form emits a demo AgencyManagedPR patch; only these
// backend-backed fields are persisted, the rest are demo-only placeholders.
type ProfilePatch = Partial<
	Pick<AgencyManagedPR, "name" | "icName" | "mobile" | "email">
>;

/**
 * Backend-driven PR roster for the Manage-PR screen. Reads real PRs (mapped into
 * the demo shape via managedPrFromBackend) and exposes the writes the backend
 * supports: edit contact/name, suspend (status), detach (delete). Shares the
 * roster's `["roster","prs"]` query key so Manage-PR and the roster grid stay in
 * sync. Demo-only actions (pay class, KPI, languages, tie rules) are not here.
 */
export function useAgencyPrs(params: { enabled?: boolean } = {}) {
	const { enabled = true } = params;
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: ["roster", "prs"] });

	const prsQuery = useQuery({
		queryKey: ["roster", "prs"],
		queryFn: () => fetchPrPersonnel({ pageSize: 500 }, logout),
		enabled,
		staleTime: 60_000,
	});

	const prs = useMemo<AgencyManagedPR[]>(
		() => (prsQuery.data?.data ?? []).map(managedPrFromBackend),
		[prsQuery.data],
	);

	const updateMut = useMutation({
		mutationFn: (vars: { id: string; input: UpdatePrPersonnelInput }) =>
			updatePrPersonnel(vars.id, vars.input, logout),
		onSuccess: invalidate,
	});
	const removeMut = useMutation({
		mutationFn: (id: string) => removePrPersonnel(id, logout),
		onSuccess: invalidate,
	});

	// Persist only the backend-backed subset of the profile edit. The demo edit
	// calls the floor/display name `name` and the legal name `icName`; the backend
	// stores those as `nickname` and `name` respectively.
	const saveProfile = (prId: string, patch: ProfilePatch) => {
		const input: UpdatePrPersonnelInput = {};
		if (patch.name !== undefined) input.nickname = patch.name;
		if (patch.icName !== undefined) input.name = patch.icName;
		if (patch.mobile !== undefined) input.phone = patch.mobile;
		if (patch.email !== undefined) input.email = patch.email;
		updateMut.mutate({ id: prId, input });
	};

	const suspend = (prId: string) =>
		updateMut.mutate({ id: prId, input: { status: "suspended" } });

	const detach = (prId: string) => removeMut.mutate(prId);

	return {
		prs,
		isLoading: prsQuery.isLoading,
		saveProfile,
		suspend,
		detach,
	};
}
