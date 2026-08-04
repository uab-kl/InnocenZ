import { env } from "@/env";
import { kickToLogin } from "@/lib/auth/guards";
import { getClient } from "@/lib/axios-v1";

interface MeRole {
	id: string;
	roleName: string;
}

/**
 * After a real backend login, ask `/auth/me` for the user's roles and route
 * agency accounts to the agency portal. Falls back to `/dashboard` for any
 * other role or on error.
 */
export async function resolvePostLoginPath(): Promise<string> {
	try {
		const client = getClient(kickToLogin);
		const res = await client.get<{ data?: { roles?: MeRole[] } }>("/auth/me");
		const roles = res.data?.data?.roles ?? [];
		const isAgency = roles.some(
			(r) => r.roleName === "agency" || r.id === env.VITE_AGENCY_ROLE_ID,
		);
		if (isAgency) return "/agency";
		const isOutlet = roles.some(
			(r) => r.roleName === "outlet" || r.id === env.VITE_OUTLET_ROLE_ID,
		);
		if (isOutlet) return "/outlet";
		return "/dashboard";
	} catch {
		return "/dashboard";
	}
}
