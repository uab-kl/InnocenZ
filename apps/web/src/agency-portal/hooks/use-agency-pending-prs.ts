import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { fmtDateLabelFromIso } from "@agency-portal/lib/pr-demo";
import { ageFromDob } from "@agency-portal/lib/pr-personnel-map";
import { prPhotoSrc } from "@agency-portal/lib/public-asset";
import type { PendingPR } from "@agency-portal/lib/store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	type AgencyPr,
	fetchAgencyPrs,
	setAgencyPrApproval,
} from "@/services/agency";
import {
	type CreatePrPersonnelInput,
	createPrPersonnel,
} from "@/services/pr-personnel";

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
 *
 * 🔴 Everything below the contact fields used to be hardcoded absence —
 * `languages: ""`, `portfolioPhotos: []`, and no body at all, which the screen
 * then papered over with `?? 165 / ?? 52 / ?? 24`. `GET /agency/:id/pr` already
 * joins `user_profile` and returns every one of these columns (see
 * AgencyPrEnriched); they were simply never read. So the agency approved a PR
 * against a blank card while that same PR's profile — one row in one table —
 * held her languages, her comcard and her real measurements.
 *
 * Age is DERIVED from `dob` through the same `ageFromDob` Manage PR uses. There
 * is no age column and there must never be one.
 */
function pendingPrFromMembership(pr: AgencyPr): PendingPR {
	// 0 is this codebase's one spelling of "the account does not carry this"; the
	// comcard renderers turn it into an em-dash. Never a plausible number.
	const dob = pr.dob ? String(pr.dob).slice(0, 10) : null;
	return {
		id: pr.userId,
		name: pr.nickname?.trim() || pr.name,
		icName: pr.name,
		// PendingPR stores languages as one string; the picker parses it back.
		languages: (pr.languages ?? []).join(", "),
		ic: pr.idNo ?? undefined,
		mobile: pr.phoneNum ?? undefined,
		email: pr.email ?? undefined,
		race: pr.race ?? undefined,
		age: ageFromDob(dob),
		height: pr.comcardHeightCm ?? 0,
		weight: pr.comcardWeightKg ?? 0,
		// R2 object keys — resolved here so nothing downstream has to remember.
		comcardImageUrl: prPhotoSrc(pr.comcardImage) ?? undefined,
		portfolioPhotos: (pr.portfolioPhotos ?? []).map((photo) =>
			prPhotoSrc(photo),
		),
		// The selfie IS the account's profile photo — there is no separate
		// selfie column, and `profileImage` is already in this payload, so this
		// reads a value the endpoint always sent rather than widening it.
		hasSelfie: Boolean(pr.profileImage),
		selfiePhoto: prPhotoSrc(pr.profileImage) ?? undefined,
		// IC scans live on `user_profile.id_photo_front` / `_back`. They read
		// "Missing" for every PR because this mapper hardcoded `false`, not
		// because no scan existed — the route now selects them, and it is
		// role-gated and agency-scoped before it does (agency.routes.ts).
		hasIcPhotos: Boolean(pr.idPhotoFront || pr.idPhotoBack),
		icPhotoFront: prPhotoSrc(pr.idPhotoFront) ?? undefined,
		icPhotoBack: prPhotoSrc(pr.idPhotoBack) ?? undefined,
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
