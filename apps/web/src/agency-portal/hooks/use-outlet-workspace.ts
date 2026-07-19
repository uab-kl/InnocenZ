import type { OutletWorkspaceSettings } from "@agency-portal/lib/outlet-demo";
import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import {
	saveInputFromWorkspaceSettings,
	workspaceSettingsFromBackend,
} from "@agency-portal/lib/outlet-workspace-map";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	fetchOutletWorkspace,
	type OutletWorkspaceApiResponse,
	saveOutletWorkspace,
} from "@/services/outlet-workspace";

/**
 * Backend-driven outlet Workspace (pay/commission rates, drink menu, penalty
 * rules). Gated on a real session (`getOutletIdentity()`); demo sessions get
 * `backed: false` and keep the demo store. Reads the real workspace (mapped into
 * the demo `OutletWorkspaceSettings`) and saves the whole thing via PUT (upsert).
 * A 404 means "no workspace saved yet" — surfaced as a null workspace so the
 * screen falls back to demo defaults until the first save creates the row.
 */
export function useOutletWorkspace() {
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const identity = useMemo(() => getOutletIdentity(), []);
	const backed = identity !== null;
	const outletId = identity?.outletId ?? null;
	const outletName = identity?.outletName ?? "";

	const query = useQuery({
		queryKey: ["outlet-workspace", outletId ?? "none"],
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
		enabled: backed,
		staleTime: 60_000,
	});

	const workspace = useMemo<OutletWorkspaceSettings | null>(() => {
		if (!backed) return null;
		const data = query.data?.data;
		if (!data) return null;
		return workspaceSettingsFromBackend(data, outletName);
	}, [backed, query.data, outletName]);

	const saveMut = useMutation({
		mutationFn: (ws: OutletWorkspaceSettings) =>
			saveOutletWorkspace(
				outletId as string,
				saveInputFromWorkspaceSettings(ws),
				logout,
			),
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: ["outlet-workspace"] }),
	});

	return {
		backed,
		workspace,
		isLoading: backed && query.isLoading,
		isSaving: saveMut.isPending,
		save: (ws: OutletWorkspaceSettings) => saveMut.mutateAsync(ws),
	};
}
