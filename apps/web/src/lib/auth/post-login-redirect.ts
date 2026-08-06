import { getClient } from "@/lib/axios-v1";
import { kickToLogin } from "@/lib/auth/guards";
import { pickHomePortal } from "@/lib/auth/pick-home-portal";

interface MeRole {
	id: string;
	roleName: string;
	portalCode?: string | null;
}

/**
 * After a real backend login, ask `/auth/me` for the user's portals/roles and
 * route to the matching portal.
 */
export async function resolvePostLoginPath(): Promise<string> {
	try {
		const client = getClient(kickToLogin);
		const res = await client.get<{
			data?: { roles?: MeRole[]; portals?: string[] };
		}>("/auth/me");
		const roles = res.data?.data?.roles ?? [];
		const portals = res.data?.data?.portals ?? [];
		const names = roles.map((r) => (r.roleName ?? "").toLowerCase());
		const home = pickHomePortal(portals, names);
		if (home === "agency") return "/agency";
		if (home === "outlet") return "/outlet";
		if (home === "admin") return "/admin/dashboard";
		return "/no-access";
	} catch {
		return "/no-access";
	}
}
