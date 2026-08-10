import { getPublicClient } from "@/lib/axios-v1";

export interface SignupAgencyOption {
	id: string;
	name: string;
}

type SignupAgencyApi = {
	id: string;
	name: string;
	logoImage: string | null;
	logoUrl: string | null;
};

/**
 * Active agencies for the outlet sign-up "onboarded by" picker.
 *
 * Uses the same public `GET /auth/agencies` list the PR mobile wizard reads — a
 * signing-up outlet has no token yet, and `GET /agency` sits below the JWT
 * guard. The chosen id lands on `outlet.onboarded_by_agency_id`, which is the
 * column the admin Outlet Details panel shows as "Onboarded by agency" and
 * `PATCH /outlet/:id/onboarding-agency` rewrites.
 */
export async function fetchSignupAgencies(): Promise<SignupAgencyOption[]> {
	const client = getPublicClient();
	const response = await client.get<{
		success: boolean;
		data: SignupAgencyApi[];
	}>("/auth/agencies");
	const rows = response.data.data ?? [];
	return rows.map((agency) => ({ id: agency.id, name: agency.name }));
}
