import { getClient } from "@/lib/axios-v1";
import type { RbacPortal } from "./types";

interface BackendPortal {
	id: string;
	code: string;
	name: string;
	status: string;
}

interface PortalsApiResponse {
	success: boolean;
	message: string;
	data: BackendPortal[];
}

export async function fetchPortals(
	onUnauthorized: () => void,
): Promise<RbacPortal[]> {
	const client = getClient(onUnauthorized);
	const res = await client.get<PortalsApiResponse>("/rbac/portal");
	return (res.data.data ?? []).map((p) => ({
		id: p.id,
		code: p.code as RbacPortal["code"],
		name: p.name,
		status: p.status as RbacPortal["status"],
	}));
}
