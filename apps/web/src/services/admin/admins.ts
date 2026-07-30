import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";
import { getRoleIdByName } from "@/services/rbac/roles";
import type { BackendUser } from "./mappers";
import { mapAdminUser } from "./mappers";
import type { CreateAdminInput } from "./schemas";
import type {
	AdminApiResponse,
	AdminsApiResponse,
	AdminsQueryParams,
} from "./types";

export async function fetchAdmins(
	params: AdminsQueryParams = {},
	onRefreshFail: () => void,
): Promise<AdminsApiResponse> {
	const adminRoleId = await getRoleIdByName("admin", onRefreshFail);
	if (!adminRoleId) {
		return {
			success: true,
			message: "OK",
			data: [],
			pagination: {
				page: 1,
				pageSize: params.pageSize ?? 10,
				totalCount: 0,
				totalPages: 1,
				hasNextPage: false,
				hasPrevPage: false,
			},
		};
	}

	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		email: params.email,
		status: params.status,
		roleId: adminRoleId,
		page: params.page,
		pageSize: params.pageSize,
	});

	const response = await client.get<{
		success: boolean;
		message: string;
		data: BackendUser[];
		pagination: AdminsApiResponse["pagination"];
	}>(`/user${queryString}`);

	return {
		success: response.data.success,
		message: response.data.message,
		data: (response.data.data ?? []).map(mapAdminUser),
		pagination: response.data.pagination,
	};
}

/**
 * Turn an account off (or back on).
 *
 * A soft-disable, not a delete: nothing in this system can delete a user, on
 * purpose — `audit_logs`, `user_profile`, `admin_mfa` and `user_role` all
 * reference one, and the audit trail should outlive the person.
 *
 * It takes effect immediately, including on sessions already signed in: the
 * server re-reads the account on every request and refuses a non-active one.
 */
export async function setUserStatus(
	userId: string,
	status: "active" | "inactive" | "blocked",
	onRefreshFail: () => void,
): Promise<{ success: boolean; message: string }> {
	const client = getClient(onRefreshFail);
	const response = await client.patch<{ success: boolean; message: string }>(
		`/user/${userId}/status`,
		{ status },
	);
	return response.data;
}

/**
 * Take the admin role back from an account.
 *
 * The server refuses two cases and says why: removing your OWN role (nobody
 * could undo it — the endpoint that would is the one you just lost) and
 * removing the LAST holder of a role (a platform nobody can administer). Both
 * come back as a message worth showing verbatim.
 */
export async function revokeAdminRole(
	userId: string,
	onRefreshFail: () => void,
): Promise<{ success: boolean; message: string }> {
	const adminRoleId = await getRoleIdByName("admin", onRefreshFail);
	if (!adminRoleId) {
		throw new Error("Admin role not found");
	}
	const client = getClient(onRefreshFail);
	const response = await client.delete<{ success: boolean; message: string }>(
		"/rbac/user-role",
		{ data: { userId, roleId: adminRoleId } },
	);
	return response.data;
}

export async function createAdmin(
	input: CreateAdminInput,
	onRefreshFail: () => void,
): Promise<AdminApiResponse> {
	const adminRoleId = await getRoleIdByName("admin", onRefreshFail);
	if (!adminRoleId) {
		throw new Error("Admin role not found");
	}

	const client = getClient(onRefreshFail);
	const response = await client.post<{
		success: boolean;
		message: string;
		data: BackendUser;
	}>("/auth/register", {
		email: input.email,
		phoneNum: `+admin-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
		username: input.displayName,
		password: input.password,
		roleId: adminRoleId,
	});

	return {
		success: response.data.success,
		message: response.data.message,
		data: mapAdminUser(response.data.data),
	};
}
