import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { fmtDateLabelFromIso } from "@agency-portal/lib/pr-demo";
import type { PendingPR } from "@agency-portal/lib/store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	type CreatePrPersonnelInput,
	createPrPersonnel,
} from "@/services/pr-personnel";
import {
	fetchAgencyPrs,
	setAgencyPrApproval,
	type AgencyPr,
} from "@/services/agency";

/** Fields the owner-invite ("Add PR") sheet collects. */
export interface AgencyPrInvite {
	name: string;
	ic?: string;
	mobile?: string;
	email?: string;
}

/**
 * Map an agency_pr pending membership into the Approvals list shape.
 * Identity comes from user / user_profile (not the deprecated pr table).
 */
function pendingPrFromMembership(pr: AgencyPr): PendingPR {
	return {
		id: pr.userId,
		name: pr.nickname?.trim() || pr.name,
		icName: pr.name,
		languages: "",
		ic: pr.idNo ?? undefined,
		mobile: pr.phoneNum ?? undefined,
		email: pr.email ?? undefined,
		hasIcPhotos: false,
		hasSelfie: false,
		portfolioPhotos: [],
		submittedAt: pr.createdAt
			? fmtDateLabelFromIso(String(pr.createdAt).slice(0, 10))
			: undefined,
		status: "pending",
		agencyId: pr.agencyId,
	};
}

/**
 * Backend-driven Approvals queue — pending `agency_pr` memberships for this
 * agency (mobile signup writes these). Approve/reject patches agency_pr, not pr.
 */
export function useAgencyPendingPrs() {
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const identity = useMemo(() => getAgencyIdentity(), []);
	const backed = identity !== null;
	const agencyId = identity?.agencyId ?? "";

	const query = useQuery({
		queryKey: ["agency", "pending-prs", agencyId],
		queryFn: () =>
			fetchAgencyPrs(agencyId, { approveStatus: "pending" }, logout),
		enabled: backed && Boolean(agencyId),
		staleTime: 30_000,
	});

	const signups = useMemo<PendingPR[]>(
		() => (query.data?.data ?? []).map(pendingPrFromMembership),
		[query.data],
	);

	const invalidate = () => {
		queryClient.invalidateQueries({ queryKey: ["agency", "pending-prs"] });
		queryClient.invalidateQueries({ queryKey: ["roster", "prs"] });
	};

	const statusMut = useMutation({
		mutationFn: (vars: {
			userId: string;
			approveStatus: "approved" | "rejected";
			rejectReason?: string;
		}) =>
			setAgencyPrApproval(
				agencyId,
				vars.userId,
				{
					approveStatus: vars.approveStatus,
					rejectReason: vars.rejectReason,
				},
				logout,
			),
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
		/** `id` is the pending member's userId. */
		approve: (userId: string) =>
			statusMut.mutate({ userId, approveStatus: "approved" }),
		reject: (userId: string, reason?: string) =>
			statusMut.mutate({
				userId,
				approveStatus: "rejected",
				rejectReason: reason,
			}),
		invite: (input: AgencyPrInvite) =>
			createMut.mutate({
				name: input.name,
				icNo: input.ic || undefined,
				phone: input.mobile || undefined,
				email: input.email || undefined,
			}),
	};
}
