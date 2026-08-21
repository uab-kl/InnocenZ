import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import {
	issuerFromAgency,
	PV_TEMPLATE_ISSUER,
	type PvIssuerProfile,
} from "@agency-portal/lib/pv-template";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiAssetUrl } from "@/components/organization/details-sheet-parts";
import { getPortalSessionKind } from "@/lib/auth/agency-demo-session";
import { useAuth } from "@/lib/auth-context";
import { fetchAgencyById } from "@/services/agency";

/**
 * Why this voucher may or may not print a letterhead.
 *
 * ONE value used to carry four different answers. The hook returned `undefined`
 * for a demo session, for a fetch still in flight, for a 401/offline fetch, and
 * for a real operator whose agency identity could not be resolved at all — and
 * `pv-pdf` took every one of them through a DEFAULT PARAMETER
 * (`issuer: PvIssuerProfile = PV_TEMPLATE_ISSUER`) into a real and DIFFERENT
 * company: ATMOSPHERE EVENT ENTERPRISE, its reg. no. (CT0152091-D) and its KL
 * address. A network blip therefore printed a stranger's letterhead onto a live
 * payment voucher — and because passing `undefined` is indistinguishable from
 * passing nothing, the compiler could not see the hole.
 *
 * "I do not know who you are" and "the demo company" are not the same answer, so
 * they no longer share a representation: a NULL `issuer` is a refusal, and
 * `status` says which refusal it is.
 */
export interface PvIssuerState {
	/** The letterhead to print. NULL means print NOTHING — refuse the download. */
	issuer: PvIssuerProfile | null;
	status: "ready" | "demo" | "loading" | "unavailable";
}

/**
 * The letterhead the agency portal's payment voucher should print.
 *
 * The PR's copy of a voucher prints the agency the voucher belongs to, read
 * through its FK. The agency's copy printed a hardcoded constant, so the two
 * documents named different companies. This resolves the signed-in agency and
 * hands back a letterhead built from it.
 *
 * Only an EXPLICIT demo marker gets the template company. Absence of an agency
 * identity is NOT evidence of a demo session — `startAgencyRealSession` clears
 * the identity when membership resolution fails, so "no identity" is a state a
 * REAL operator reaches. Treating it as "must be demo" is the confusion this
 * hook exists to end.
 *
 * Shares `useAgencyProfile`'s query key on purpose: the agency record is one
 * fact, and two keys for it is two chances to show two different letterheads.
 */
export function usePvIssuer(): PvIssuerState {
	const { logout } = useAuth();
	const identity = useMemo(() => getAgencyIdentity(), []);
	const agencyId = identity?.agencyId ?? null;
	// Read once at mount, beside the identity, so both halves of the answer come
	// from the same moment.
	const isDemoSession = useMemo(() => getPortalSessionKind() === "demo", []);

	const agencyQuery = useQuery({
		queryKey: ["agency", "profile", agencyId ?? "none"],
		queryFn: () => fetchAgencyById(agencyId as string, logout),
		// A demo session holds a placeholder JWT, so this request cannot succeed —
		// and firing it hands `logout` a failure, which is how a demo user gets
		// kicked to /login by opening a voucher.
		enabled: Boolean(agencyId) && !isDemoSession,
		staleTime: 60_000,
	});

	const agency = agencyQuery.data?.data ?? null;
	const { isError } = agencyQuery;

	return useMemo<PvIssuerState>(() => {
		if (isDemoSession) {
			return { issuer: PV_TEMPLATE_ISSUER, status: "demo" };
		}
		// A real session that cannot name its own agency prints nothing.
		if (!agencyId) return { issuer: null, status: "unavailable" };
		if (agency) {
			return {
				issuer: issuerFromAgency(agency, apiAssetUrl(agency.logoImage)),
				status: "ready",
			};
		}
		if (isError) return { issuer: null, status: "unavailable" };
		return { issuer: null, status: "loading" };
	}, [agency, agencyId, isDemoSession, isError]);
}
