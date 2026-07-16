import { useQuery } from "@tanstack/react-query";
import type { User } from "@/lib/auth";
import { getAccessToken, hasValidTokens } from "@/lib/auth/auth-storage";
import { kickToLogin } from "@/lib/auth/guards";
import { getClient } from "@/lib/axios-v1";

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
	roles: { id: string; roleName: string }[];
	permissions: {
		moduleId: string;
		moduleName: string;
		permissionId: string;
		permissionType: "read" | "create" | "update" | "delete";
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

	return {
		id: profile.id,
		email: profile.email ?? "",
		displayName: profile.username,
		contactNo: profile.phoneNum ?? "",
		isActive: profile.status.toLowerCase() === "active",
		roles: profile.roles.map((r) => r.roleName),
		readPermission: profile.permissions
			.filter((p) => p.permissionType === "read")
			.map((p) => p.moduleName),
		createPermission: profile.permissions
			.filter((p) => p.permissionType === "create")
			.map((p) => p.moduleName),
		updatePermission: profile.permissions
			.filter((p) => p.permissionType === "update")
			.map((p) => p.moduleName),
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
