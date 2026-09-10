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

/**
 * Accounts that are switched OFF — `GET /user?status=inactive`.
 *
 * An account being off is a DIFFERENT fact from a membership being removed
 * and from an organisation being suspended, and the three live in three
 * different columns (`user.status`, `agency_user`/`outlet_user`.status, and
 * `agency`/`outlet`.status). A screen that shows them together must keep
 * them apart, because reactivating one is not reactivating another.
 *
 * ⚠️ THE LIST CONTAINS TOMBSTONES. `POST /user/:id/delete` — the phone app's
 * own "Delete account" — also leaves `status: 'inactive'`, after destroying
 * the person's photos, nulling their email and replacing their password with
 * a random one. The field that separates the two (`blocked_reason`) is
 * stripped from every response by `PRIVATE_USER_FIELDS`, so the caller must
 * filter on the tombstone's own signature: the username is rewritten to
 * `deleted_<8 hex>` and the email is nulled. Offering one of those a
 * Reactivate button restores a login nobody can use, for somebody who asked
 * to be forgotten — see `isDeletedAccountTombstone`.
 */
export interface DisabledAccount {
	id: string;
	memberCode?: string | null;
	username: string;
	email?: string | null;
	phoneNum?: string | null;
	/** `inactive` or `blocked` — both mean the account cannot sign in. */
	status: string;
	createdAt: string;
	updatedAt: string;
}

interface DisabledAccountsApiResponse {
	success: boolean;
	message: string;
	data: DisabledAccount[];
	pagination: { hasNextPage: boolean };
}

/**
 * True for an account erased by its own owner rather than switched off by an
 * admin. Matched on the tombstone the server writes (`user.controller.ts`:
 * `deleted_${id.slice(0, 8)}`), because the authoritative field is private.
 */
export function isDeletedAccountTombstone(account: {
	username?: string | null;
	email?: string | null;
}): boolean {
	return /^deleted_[0-9a-f]{8}$/i.test(account.username ?? "");
}

export async function fetchDisabledAccounts(
	params: { status?: string; page?: number; pageSize?: number } = {},
	onRefreshFail: () => void,
): Promise<DisabledAccountsApiResponse> {
	const client = getClient(onRefreshFail);
	// No roleId: every switched-off account, whatever they do on the platform.
	// The caller decides which ones belong on its screen.
	const queryString = buildQueryParams({
		status: params.status ?? "inactive",
		page: params.page,
		pageSize: params.pageSize,
	});
	const response = await client.get<DisabledAccountsApiResponse>(
		`/user${queryString}`,
	);
	return response.data;
}
