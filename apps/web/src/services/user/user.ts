import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";
import type {
	UserDetail,
	UserDetailApiResponse,
	UserRoleGrant,
	UserRolesApiResponse,
} from "./types";

/**
 * One person's account, with their `user_profile` nested.
 *
 * ADMIN-ONLY in practice. The route itself (`GET /user/:id`) is open to any
 * signed-in caller, but `redactUnlessOwnRecord` runs
 * `redactIdentityDocsForOutlet` for everyone reading somebody ELSE's record —
 * an admin is `privileged` there and receives the identity fields intact, an
 * outlet caller receives them blanked. Do not build a non-admin screen on the
 * assumption that `profile` is populated.
 */
export async function fetchUserById(
	userId: string,
	onRefreshFail: () => void,
): Promise<UserDetail | null> {
	const client = getClient(onRefreshFail);
	const response = await client.get<UserDetailApiResponse>(`/user/${userId}`);
	return response.data.data ?? null;
}

/**
 * The portal roles granted to one person — `GET /rbac/user-role?userId=`.
 *
 * This is the RAW grant, and it is the honest answer to "what is this person
 * allowed to do here". The `subRole` lane the team lists render is DERIVED from
 * these rows server-side and is lossy: the fold keeps one role per portal and
 * falls back to `owner` when nothing matches, so a member holding no role at all
 * still reads as an owner. Show both, and let the grant settle disagreements.
 *
 * ADMIN ONLY — `/rbac` is mounted behind `requireAdmin`, so this 403s for every
 * agency, outlet and PR token.
 */
export async function fetchUserRoles(
	userId: string,
	onRefreshFail: () => void,
): Promise<UserRoleGrant[]> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({ userId });
	const response = await client.get<UserRolesApiResponse>(
		`/rbac/user-role${queryString}`,
	);
	return response.data.data ?? [];
}
