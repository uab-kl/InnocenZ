import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { fmtDateLabelFromIso } from "@agency-portal/lib/pr-demo";
import type { PendingPR } from "@agency-portal/lib/store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	type CreatePrPersonnelInput,
	createPrPersonnel,
	fetchPrPersonnel,
	type PrPersonnel,
	updatePrPersonnel,
} from "@/services/pr-personnel";

/** Fields the owner-invite ("Add PR") sheet collects. */
export interface AgencyPrInvite {
	name: string;
	ic?: string;
	mobile?: string;
	email?: string;
}

/**
 * Map a backend pending `PrPersonnel` into the demo `PendingPR` shape the
 * Approvals list renders. Backend-backed fields carry real data (name, IC,
 * contact); the verification docs (IC photos, selfie, gallery, comcard) and
 * physical stats have no backend, so they stay empty — the accepted hybrid
 * tradeoff (real identity, placeholder documents).
 */
function pendingPrFromBackend(pr: PrPersonnel): PendingPR {
	return {
		id: pr.id,
		name: pr.nickname?.trim() || pr.name,
		icName: pr.name,
		languages: "",
		ic: pr.icNo ?? undefined,
		mobile: pr.phone ?? undefined,
		email: pr.email ?? undefined,
		hasIcPhotos: false,
		hasSelfie: false,
		portfolioPhotos: [],
		submittedAt: pr.createdAt
			? fmtDateLabelFromIso(pr.createdAt.slice(0, 10))
			: undefined,
		status: "pending",
		agencyId: pr.agencyId,
	};
}

/**
 * Backend-driven Approvals queue (PR sign-ups) for the agency portal.
 *
 * Gated on a real session (`getAgencyIdentity()`); demo sessions get `backed:
 * false` and the screen keeps its demo store. Reads real pending PRs
 * (`status=pending`, agency-scoped server-side), and exposes the writes the
 * backend supports: approve → `active`, reject → `inactive` (no reject-reason
 * field, so the reason isn't persisted), and the owner invite → create a PR
 * record. Shares the roster's `["roster","prs"]` cache so an approved PR shows
 * up on the roster. Agency-link requests + cutlost requests have no backend and
 * stay on the demo store.
 */
export function useAgencyPendingPrs() {
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const identity = useMemo(() => getAgencyIdentity(), []);
	const backed = identity !== null;

	const query = useQuery({
		queryKey: ["agency", "pending-prs"],
		queryFn: () =>
			fetchPrPersonnel({ status: "pending", pageSize: 200 }, logout),
		enabled: backed,
		staleTime: 30_000,
	});

	const signups = useMemo<PendingPR[]>(
		() => (query.data?.data ?? []).map(pendingPrFromBackend),
		[query.data],
	);

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ["agency", "pending-prs"] });
		queryClient.invalidateQueries({ queryKey: ["roster", "prs"] });
	};

	const statusMut = useMutation({
		mutationFn: (vars: { id: string; status: string }) =>
			updatePrPersonnel(vars.id, { status: vars.status }, logout),
		onSuccess: invalidate,
	});
	const createMut = useMutation({
		mutationFn: (input: CreatePrPersonnelInput) =>
			createPrPersonnel(input, logout),
		onSuccess: invalidate,
	});

	return {
		backed,
		signups,
		isLoading: query.isLoading,
		approve: (id: string) => statusMut.mutate({ id, status: "active" }),
		reject: (id: string) => statusMut.mutate({ id, status: "inactive" }),
		invite: (input: AgencyPrInvite) =>
			createMut.mutate({
				name: input.name,
				icNo: input.ic || undefined,
				phone: input.mobile || undefined,
				email: input.email || undefined,
			}),
	};
}
