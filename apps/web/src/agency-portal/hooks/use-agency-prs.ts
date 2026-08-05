import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import {
	ageFromDob,
	managedPrFromBackend,
	payClassToBackend,
	tierFromLabel,
} from "@agency-portal/lib/pr-personnel-map";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
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

/**
 * The birth date that makes someone `age` today, keeping their existing
 * birthday. The editor edits AGE, but `user_profile` stores a DOB — deriving it
 * from today's date alone would silently move every PR's birthday to whatever
 * day their agency happened to edit them on, so only the year moves.
 */
function dobForAge(age: number, currentDob: string | null | undefined): string {
	const now = new Date();
	const match = (currentDob ?? "").match(/^\d{4}-(\d{2})-(\d{2})$/);
	const birthYear = now.getFullYear() - age;
	if (!match) {
		// No DOB on file: 1 Jan reads as "year known, day not", rather than
		// inventing today's date as their birthday.
		return `${birthYear}-01-01`;
	}
	const [, month, day] = match;
	// If their birthday this year has not happened yet they only turn `age` on
	// the next one, so the birth year is one earlier.
	const hadBirthday =
		now.getMonth() + 1 > Number(month) ||
		(now.getMonth() + 1 === Number(month) && now.getDate() >= Number(day));
	return `${hadBirthday ? birthYear : birthYear - 1}-${month}-${day}`;
}

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
	const saveProfile = (prId: string, patch: ProfilePatch) => {
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
		if (patch.age !== undefined) {
			// Only when the age actually moved: re-deriving an unchanged age would
			// rewrite a DOB the PR set themselves, for no reason.
			const current = prsQuery.data?.data.find((p) => p.id === prId);
			const storedDob = current?.profile?.dob ?? null;
			if (patch.age !== ageFromDob(storedDob)) {
				input.dob = dobForAge(patch.age, storedDob);
			}
		}

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
