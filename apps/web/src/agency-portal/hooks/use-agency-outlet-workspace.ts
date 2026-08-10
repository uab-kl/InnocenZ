import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import type { OutletWorkspaceSettings } from "@agency-portal/lib/outlet-demo";
import { workspaceSettingsFromBackend } from "@agency-portal/lib/outlet-workspace-map";
import { outletMatches } from "@agency-portal/lib/portal-sync";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	fetchOutletWorkspace,
	type OutletWorkspaceApiResponse,
} from "@/services/outlet-workspace";
import { useAgencyOutlets } from "./use-agency-outlets";

/**
 * The workspace (pay/commission tier rates, drink menu, penalty rules) an outlet
 * saved from its own portal, read from the agency side.
 *
 * The agency screens only ever had the demo store for this, so an outlet editing
 * its rates never showed up under Manage Outlet. `GET /outlet-workspace/:outletId`
 * already admits the `agency` role, so this reads the SAME row the outlet portal
 * writes via PUT — one source, no copy.
 *
 * The agency addresses outlets by NAME (summaries are keyed by name) while the
 * endpoint is keyed by id, so the id comes from the agency's own outlet registry.
 * An outlet outside that directory resolves to no id and the query stays idle.
 * Gated on a real session (`getAgencyIdentity()`); demo sessions get
 * `backed: false` so callers keep their demo source. A 404 means "this outlet has
 * not saved a workspace yet" and surfaces as a null workspace, not an error.
 */
export function useAgencyOutletWorkspace(outletName: string) {
	const { logout } = useAuth();
	const identity = useMemo(() => getAgencyIdentity(), []);
	const backed = identity !== null;
	const { outlets, isLoading: outletsLoading } = useAgencyOutlets();

	const outletId = useMemo(
		() => outlets.find((o) => outletMatches(o.name, outletName))?.id ?? null,
		[outlets, outletName],
	);

	const query = useQuery({
		queryKey: ["agency", "outlet-workspace", outletId ?? "none"],
		queryFn: async (): Promise<OutletWorkspaceApiResponse> => {
			try {
				return await fetchOutletWorkspace(outletId as string, logout);
			} catch (err) {
				// No workspace row yet — treat as empty, not an error.
				if (axios.isAxiosError(err) && err.response?.status === 404) {
					return { success: true, message: "not found", data: null };
				}
				throw err;
			}
		},
		enabled: backed && outletId !== null,
		staleTime: 60_000,
	});

	const workspace = useMemo<OutletWorkspaceSettings | null>(() => {
		const data = query.data?.data;
		if (!data) return null;
		// The backend row carries no name; key it to the outlet that was asked for
		// so the name-matched resolvers downstream accept it.
		return workspaceSettingsFromBackend(data, outletName);
	}, [query.data, outletName]);

	return {
		backed,
		workspace,
		// The outlet directory has to land before the workspace can be asked for at
		// all, so a still-loading directory counts as loading — never as "the
		// outlet saved nothing".
		isLoading: backed && (outletsLoading || query.isLoading),
	};
}
