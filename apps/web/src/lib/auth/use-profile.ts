import { useQuery } from "@tanstack/react-query";
import type { User } from "@/lib/auth";
import { getAccessToken, hasValidTokens } from "@/lib/auth/auth-storage";
import { kickToLogin } from "@/lib/auth/guards";
import { getClient } from "@/lib/axios-v1";
import { noteR2PublicUrl } from "@/lib/proof-photo";

interface ApiResponse<T> {
	success: boolean;
	message: string;
	data: T;
}

interface MeResponse {
	id: string;
	email: string | null;
	phoneNum: string | null;
	username: string;
	status: string;
	profileImage?: string | null;
	r2PublicUrl?: string | null;
	portals?: string[];
	organisations?: {
		kind: "agency" | "outlet";
		id: string;
		name: string;
		subRole: string;
		memberCode?: string | null;
		membershipStatus?: string;
		orgStatus?: string;
		enterable?: boolean;
	}[];
	/** UI language saved on the account (migration 0122): "en" | "zh" | null. */
	preferredLocale?: string | null;
	roles: {
		id: string;
		roleName: string;
		portalId?: string | null;
		portalCode?: string | null;
	}[];
	permissions: {
		moduleId: string;
		moduleName: string;
		moduleKey?: string;
		permissionId: string;
		permissionType: "read" | "create" | "update";
	}[];
}

export const profileQueryKey = ["auth", "profile"] as const;

export async function fetchProfile(): Promise<User> {
	const accessToken = getAccessToken();
	if (!accessToken) {
		throw new Error("No access token available");
	}

	const client = getClient(kickToLogin);
	const response = await client.get<ApiResponse<MeResponse>>("/auth/me");

	if (!response.data.success || !response.data.data) {
		throw new Error(response.data.message || "Failed to fetch profile");
	}

	const profile = response.data.data;
	noteR2PublicUrl(profile.r2PublicUrl);

	const modulePermissions = profile.permissions
		.filter((p) => p.permissionType !== undefined)
		.map((p) => ({
			moduleKey: p.moduleKey ?? p.moduleName.toLowerCase().replace(/\s+/g, "_"),
			moduleName: p.moduleName,
			permissionType: p.permissionType,
		}));

	return {
		id: profile.id,
		email: profile.email ?? "",
		username: profile.username,
		displayName: profile.username,
		contactNo: profile.phoneNum ?? "",
		isActive: profile.status.toLowerCase() === "active",
		profileImage: profile.profileImage ?? null,
		preferredLocale: profile.preferredLocale ?? null,
		roles: profile.roles.map((r) => r.roleName),
		portals: profile.portals ?? [],
		// Absent on an older backend — read as "no organisation known", which
		// makes the chooser skip rather than block a login it cannot describe.
		organisations: (profile.organisations ?? []).map((o) => ({
			kind: o.kind,
			id: o.id,
			name: o.name,
			subRole: o.subRole,
			memberCode: o.memberCode ?? null,
			/*
			 * ⚠️ THIS MAPPER IS WHERE THE SLICE LIVES OR DIES. It rebuilds each
			 * organisation field by field, so anything the backend adds and this
			 * does not copy is dropped before any screen sees it — the failure
			 * would be a picker whose status is `undefined` on every card, with
			 * no error anywhere to say why.
			 *
			 * The fallbacks describe an OLDER BACKEND, which returned only active
			 * memberships and no statuses. Reading absence as "active and
			 * enterable" therefore reproduces exactly the old behaviour rather
			 * than greying out every organisation against a server that cannot
			 * answer yet.
			 */
			membershipStatus: o.membershipStatus ?? "active",
			orgStatus: o.orgStatus ?? "active",
			enterable: o.enterable ?? true,
		})),
		readPermission: profile.permissions
			.filter((p) => p.permissionType === "read")
			.map((p) => p.moduleName),
		createPermission: profile.permissions
			.filter((p) => p.permissionType === "create")
			.map((p) => p.moduleName),
		updatePermission: profile.permissions
			.filter((p) => p.permissionType === "update")
			.map((p) => p.moduleName),
		modulePermissions,
	};
}

export function useProfile() {
	return useQuery({
		queryKey: profileQueryKey,
		queryFn: fetchProfile,
		enabled: hasValidTokens(),
		staleTime: 5 * 60 * 1000,
		retry: 1,
		refetchOnWindowFocus: false,
	});
}
