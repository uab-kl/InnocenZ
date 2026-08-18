import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { fmtDateLabelFromIso } from "@agency-portal/lib/pr-demo";
import { ageFromDob } from "@agency-portal/lib/pr-personnel-map";
import { prPhotoSrc } from "@agency-portal/lib/public-asset";
import type { PendingPR } from "@agency-portal/lib/store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
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
 * Age is READ from the server's derived `age`, never recomputed here. It follows
 * the PR's IC — a Malaysian NRIC's first six digits ARE the birth date, and they
 * WIN over the stored `dob`, which on live data can be a year out. Deriving it
 * locally is what made this screen print an age one lower than the comcard
 * rendered beside it. `ageFromDob` survives only as the fallback for a backend
 * that predates the `age` field.
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
		age: pr.age ?? ageFromDob(dob),
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
		rejectReason: pr.rejectReason ?? undefined,
		agencyId: pr.agencyId,
	};
}

/** The one marker a REFUSED departure leaves behind (the row stays approved). */
const LEAVE_REJECTED_PREFIX = "[Leave rejected]";

/**
 * One membership row -> one card, stamped with what the row IS in the list
 * being built: its chip status and its direction. The same approved row can
 * legitimately appear twice — once in Approved history as its approved JOIN,
 * and once in Rejected history as its refused DEPARTURE — because those are
 * two different decisions about one membership.
 */
function asCard(
	pr: AgencyPr,
	status: PendingPR["status"],
	requestKind: "join" | "leave",
): PendingPR {
	return { ...pendingPrFromMembership(pr), status, requestKind };
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
		// UNFILTERED — the endpoint accepts at most ONE approveStatus, and the
		// four chips (Current / Approved / Rejected / All) need every state.
		// One fetch, split client-side.
		queryFn: () => fetchAgencyPrs(agencyId, {}, logout),
		enabled: backed && Boolean(agencyId),
		staleTime: 30_000,
	});

	/**
	 * Current = what needs a DECISION: pending joins and pending departures.
	 * `signups` keeps this meaning on purpose — the Today-hub tile counts it
	 * as "approvals waiting", and both directions are genuinely waiting.
	 */
	const signups = useMemo<PendingPR[]>(() => {
		const rows = query.data?.data ?? [];
		return [
			...rows
				.filter((r) => r.approveStatus === "pending")
				.map((r) => asCard(r, "pending", "join")),
			...rows
				.filter((r) => r.approveStatus === "leave_pending")
				.map((r) => asCard(r, "pending", "leave")),
		];
	}, [query.data]);

	/** Members (approved joins) + completed departures ('left' rows). */
	const approvedHistory = useMemo<PendingPR[]>(() => {
		const rows = query.data?.data ?? [];
		return [
			...rows
				.filter((r) => r.approveStatus === "approved")
				.map((r) => asCard(r, "approved", "join")),
			...rows
				.filter((r) => r.approveStatus === "left")
				.map((r) => asCard(r, "approved", "leave")),
		];
	}, [query.data]);

	/**
	 * Refused joins + refused departures. A refused departure lives ONLY as
	 * the "[Leave rejected]" prefix on an approved row's rejectReason — the
	 * membership itself continues, so the row is approved AND its departure
	 * was rejected. Same best-effort convention as the MC/leave notes prefix.
	 */
	const rejectedHistory = useMemo<PendingPR[]>(() => {
		const rows = query.data?.data ?? [];
		return [
			...rows
				.filter((r) => r.approveStatus === "rejected")
				.map((r) => asCard(r, "rejected", "join")),
			...rows
				.filter(
					(r) =>
						r.approveStatus === "approved" &&
						r.rejectReason?.startsWith(LEAVE_REJECTED_PREFIX),
				)
				.map((r) => asCard(r, "rejected", "leave")),
		];
	}, [query.data]);

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
		approvedHistory,
		rejectedHistory,
		isLoading: query.isLoading,
		/**
		 * `id` is the member's userId. On a `leave_pending` row the SERVER reads
		 * "approved" as approve-the-DEPARTURE and re-runs the settlement gate —
		 * its 409 lists what is still unsettled, in words. The callbacks exist
		 * so the page can show that sentence and the success confirmation: a
		 * silent refusal here reads as a decision that happened, and invites a
		 * second, harmful click.
		 */
		approve: (
			userId: string,
			opts?: {
				onSuccess?: (message: string) => void;
				onError?: (message: string) => void;
			},
		) =>
			statusMut.mutate(
				{ userId, approveStatus: "approved" },
				{
					onSuccess: (data) => opts?.onSuccess?.(data.message || "Approved"),
					onError: (e) =>
						opts?.onError?.(
							toMutationError(e, "Could not save the decision")?.message ??
								"Could not save the decision",
						),
				},
			),
		reject: (
			userId: string,
			reason?: string,
			opts?: {
				onSuccess?: (message: string) => void;
				onError?: (message: string) => void;
			},
		) =>
			statusMut.mutate(
				{
					userId,
					approveStatus: "rejected",
					rejectReason: reason,
				},
				{
					onSuccess: (data) => opts?.onSuccess?.(data.message || "Rejected"),
					onError: (e) =>
						opts?.onError?.(
							toMutationError(e, "Could not save the decision")?.message ??
								"Could not save the decision",
						),
				},
			),
		invite: (input: AgencyPrInvite) =>
			createMut.mutate({
				name: input.name,
				icNo: input.ic || undefined,
				phone: input.mobile || undefined,
				email: input.email || undefined,
			}),
	};
}
