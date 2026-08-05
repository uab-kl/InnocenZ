import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import {
	issuerFromAgency,
	type PvIssuerProfile,
} from "@agency-portal/lib/pv-template";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchAgencyById } from "@/services/agency";

/**
 * The letterhead the agency portal's payment voucher should print.
 *
 * The PR's copy of a voucher prints the agency the voucher belongs to, read
 * through its FK. The agency's copy printed a hardcoded constant, so the two
 * documents named different companies. This resolves the signed-in agency and
 * hands back a letterhead built from it.
 *
 * Returns `undefined` for a demo session, which is the signal for the document
 * to fall back to `PV_TEMPLATE_ISSUER` — a demo voucher has no agency row to
 * name, and inventing one is what this is fixing.
 *
 * Shares `useAgencyProfile`'s query key on purpose: the agency record is one
 * fact, and two keys for it is two chances to show two different letterheads.
 */
export function usePvIssuer(): PvIssuerProfile | undefined {
	const { logout } = useAuth();
	const identity = useMemo(() => getAgencyIdentity(), []);
	const agencyId = identity?.agencyId ?? null;

	const agencyQuery = useQuery({
		queryKey: ["agency", "profile", agencyId ?? "none"],
		queryFn: () => fetchAgencyById(agencyId as string, logout),
		enabled: Boolean(agencyId),
		staleTime: 60_000,
	});

	const agency = agencyQuery.data?.data ?? null;
	return useMemo(
		() => (agency ? issuerFromAgency(agency) : undefined),
		[agency],
	);
}
