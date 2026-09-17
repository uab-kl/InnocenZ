import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import {
	managedPrFromBackend,
	payClassToBackend,
	tierFromLabel,
} from "@agency-portal/lib/pr-personnel-map";
import { prWriteRefusalText } from "@agency-portal/lib/pr-write-refusal";
import { useStore } from "@agency-portal/lib/store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import {
	fetchPrPersonnel,
	removePrPersonnel,
	type UpdatePrPersonnelInput,
	updatePrPersonnel,
} from "@/services/pr-personnel";

// Everything the Manage-PR edit form emits. All of it is backend-backed now
// (migration 0089 gave `agency_pr` the four roster columns that had no home),
// so nothing here is a placeholder — see saveProfile for where each one lands.
type ProfilePatch = Partial<
	Pick<
		AgencyManagedPR,
		| "name"
		| "icName"
		| "mobile"
		| "email"
		| "age"
		| "height"
		| "weight"
		| "race"
		| "place"
		| "yearsExp"
		| "languages"
		| "kpiTier"
		| "trainingLevel"
		| "payClass"
	>
>;

// `dobForAge` lived here — it turned an edited age back into a birth date,
// keeping the PR's existing birthday and moving only the year. Deleted rather
// than left unused: age follows the PR's IC now, so there is no lane in which
// an agency-typed age should become someone's date of birth.

/**
 * Backend-driven PR roster for the Manage-PR screen. Reads real PRs (mapped into
 * the demo shape via managedPrFromBackend) and exposes the writes the backend
 * supports: edit contact/name, suspend (status), detach (delete). Shares the
 * roster's `["roster","prs"]` query key so Manage-PR and the roster grid stay in
 * sync. Pay class, KPI tier, languages and the rest of the profile ARE backed
 * now (0089); tie rules and ratings remain demo-only.
 */
export function useAgencyPrs(params: { enabled?: boolean } = {}) {
	const { enabled = true } = params;
	const { logout } = useAuth();
	const { t } = usePortalLocale();
	const { toast } = useStore();
	const queryClient = useQueryClient();
	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: ["roster", "prs"] });

	const prsQuery = useQuery({
		queryKey: ["roster", "prs"],
		// Paged out: the server clamps to 100, and this key is shared — see
		// lib/fetch-all-pages.ts. A roster over 100 PRs silently lost its tail,
		// which on this screen means PRs simply absent from Manage PR.
		queryFn: () =>
			fetchAllPages((page) =>
				fetchPrPersonnel({ page, pageSize: 100 }, logout),
			),
		enabled,
		staleTime: 60_000,
	});

	const prs = useMemo<AgencyManagedPR[]>(
		() => (prsQuery.data?.data ?? []).map(managedPrFromBackend),
		[prsQuery.data],
	);

	/*
	 * ⚠️ ALL THREE WRITES ON A PR'S PROFILE USED TO BE FIRE-AND-FORGET.
	 *
	 * `updateMut` and `removeMut` carried `onSuccess: invalidate` and no
	 * `onError`, and the screen closed itself the moment either was called:
	 * Save set `editing` to false, Suspend closed its sheet, and Detach closed
	 * its sheet AND navigated back to the PR list.
	 *
	 * That last one is the reason this matters more here than elsewhere. A
	 * REFUSED detach looks more convincing than a silent one: the operator is
	 * returned to the list exactly as they are when the PR really has been let
	 * go. And a refused SAVE is worse than nothing on screen — the editor closes
	 * and re-renders the STORED values, so the fields visibly snap back to what
	 * they were, which reads as the server having rejected the typing rather
	 * than as a request that never landed.
	 *
	 * `PUT /pr/:id` and `DELETE /pr/:id` both sit behind
	 * `requirePermission('workforce','update')` and both resolve the PR through
	 * `resolvePrForCaller`, which answers 403/404 IN WORDS when the PR belongs to
	 * another agency. That sentence is the whole value of the refusal.
	 *
	 * Through `prWriteRefusalText`: `PUT /pr/:id` answers a change to an
	 * activated PR's sign-in email or phone with "Only the PR can change their
	 * sign-in email or phone" (and 409s with "That email is already used by
	 * another account"), and those sentences have translations. A sentence no
	 * map knows is shown exactly as the server wrote it; a refusal with no
	 * sentence at all reads the fallback, never axios's "Request failed with
	 * status code 403".
	 *
	 * ⚠️ The toast alone was not enough: the screen still closed the editor the
	 * moment Save was pressed, so a refused save snapped the fields back to the
	 * stored values under a warning. Each act now takes `onDone`, run on
	 * SUCCESS only — the page closes its editor or sheet there, and a refusal
	 * leaves it open with what was typed.
	 */
	const failed = (fallback: string) => (error: unknown) =>
		toast(prWriteRefusalText(error, t, fallback), "warn");

	const updateMut = useMutation({
		mutationFn: (vars: { id: string; input: UpdatePrPersonnelInput }) =>
			updatePrPersonnel(vars.id, vars.input, logout),
		onSuccess: invalidate,
	});
	const removeMut = useMutation({
		mutationFn: (id: string) => removePrPersonnel(id, logout),
		onSuccess: invalidate,
	});

	/**
	 * Persist the profile edit. Every field the form collects is sent; the
	 * backend routes each to its own table (`pr` / `user_profile` / `agency_pr`).
	 *
	 * This used to forward four fields and drop the other ten on the floor. The
	 * request still returned 200, the screen closed as if it had saved, and the
	 * refetch then overwrote what you typed — so an edit to Race or KPI tier
	 * looked like it had been rejected by the server when it had never left the
	 * browser. Anything added to the form must be added here too.
	 *
	 * The demo edit calls the floor/display name `name` and the legal name
	 * `icName`; the backend stores those as `nickname` and `name` respectively.
	 */
	const saveProfile = (
		prId: string,
		patch: ProfilePatch,
		onDone?: () => void,
	) => {
		const input: UpdatePrPersonnelInput = {};
		if (patch.name !== undefined) input.nickname = patch.name;
		if (patch.icName !== undefined) input.name = patch.icName;
		if (patch.mobile !== undefined) input.phone = patch.mobile;
		if (patch.email !== undefined) input.email = patch.email;

		// user_profile — the person
		if (patch.race !== undefined) input.race = patch.race;
		if (patch.languages !== undefined) input.languages = patch.languages;
		if (patch.height !== undefined) input.comcardHeightCm = patch.height;
		if (patch.weight !== undefined) input.comcardWeightKg = patch.weight;
		// `patch.age` is deliberately IGNORED. Age follows the PR's IC — a
		// Malaysian NRIC's first six digits ARE the birth date — so it is derived
		// on read and there is nothing here for an agency to set. The editor
		// renders it read-only, so nothing should send one; dropping it here as
		// well means an older client cannot rewrite someone's date of birth
		// through a field that no longer means anything. The server drops `dob`
		// from `UpdatePrSchema` too, so this is the second of three gates.

		// agency_pr — this agency's grading
		if (patch.place !== undefined) input.place = patch.place;
		if (patch.yearsExp !== undefined) input.yearsExp = patch.yearsExp;
		if (patch.kpiTier !== undefined) input.kpiTier = patch.kpiTier;
		if (patch.payClass !== undefined)
			input.payClass = payClassToBackend(patch.payClass);
		if (patch.trainingLevel !== undefined) {
			// Unknown label => leave the tier alone rather than guess one.
			const tier = tierFromLabel(patch.trainingLevel);
			if (tier) input.tier = tier;
		}

		// Per-call outcomes rather than one pair on the mutation, because the
		// three acts share `updateMut` but not their sentences: "Profile saved"
		// over a suspension would be worse than silence.
		updateMut.mutate(
			{ id: prId, input },
			{
				onSuccess: () => {
					toast(t.managePr.profileSaved, "success");
					onDone?.();
				},
				onError: failed(t.managePr.couldNotSaveProfile),
			},
		);
	};

	const suspend = (prId: string, onDone?: () => void) =>
		updateMut.mutate(
			{ id: prId, input: { status: "suspended" } },
			{
				onSuccess: () => {
					toast(t.managePr.prSuspended, "success");
					onDone?.();
				},
				onError: failed(t.managePr.couldNotSuspend),
			},
		);

	const detach = (prId: string, onDone?: () => void) =>
		removeMut.mutate(prId, {
			onSuccess: () => {
				toast(t.managePr.prDetached, "success");
				onDone?.();
			},
			onError: failed(t.managePr.couldNotDetach),
		});

	return {
		prs,
		isLoading: prsQuery.isLoading,
		// A failed roster fetch and an agency with no PRs both come out as `[]`,
		// and the home tile then reads "0 PRs" in the same confident type it uses
		// for a real zero. See the note on `use-agency-pvs`.
		isError: prsQuery.isError,
		saveProfile,
		suspend,
		detach,
		/** A save or suspension is in flight — Save must not fire a second one. */
		saving: updateMut.isPending,
	};
}
