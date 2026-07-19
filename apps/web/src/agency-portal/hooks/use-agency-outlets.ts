import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchOutlets, type Outlet } from "@/services/outlet";

/**
 * The agency's own outlets from the backend registry, scoped by
 * `onboardedByAgencyId`. Gated on a real session (`getAgencyIdentity()`); demo
 * sessions get `backed: false` + empty, so callers fall back to their demo
 * source. Supplies the real outlet directory (name/address/status) and the
 * "total outlets" count — NOT the shift-demand dashboard content, which is
 * derived from the shift backend, not this registry.
 */
export function useAgencyOutlets() {
	const { logout } = useAuth();
	const identity = useMemo(() => getAgencyIdentity(), []);
	const backed = identity !== null;
	const agencyId = identity?.agencyId ?? null;

	const query = useQuery({
		queryKey: ["agency", "outlets", agencyId ?? "none"],
		queryFn: () =>
			fetchOutlets(
				{ onboardedByAgencyId: agencyId as string, pageSize: 200 },
				logout,
			),
		enabled: backed,
		staleTime: 60_000,
	});

	const outlets = useMemo<Outlet[]>(() => query.data?.data ?? [], [query.data]);

	return { backed, outlets, isLoading: query.isLoading };
}
