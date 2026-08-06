/**
 * Delete leftover "owner" roles (and similar display names). Org ownership is
 * membership.sub_role; portal access is agency / outlet — not a Role named owner.
 *
 *   pnpm exec tsx --tsconfig apps/backend/tsconfig.json apps/backend/src/scripts/remove-orphan-unassigned-roles.ts
 *   pnpm exec tsx --tsconfig apps/backend/tsconfig.json apps/backend/src/scripts/remove-orphan-unassigned-roles.ts --apply
 */
import "dotenv/config";
import { eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db/index.js";
import { AgencyUserTable } from "@/features/agency/agency.model.js";
import { OutletUserTable } from "@/features/outlet/outlet.model.js";
import { RolePermissionTable } from "@/features/rbac/role-permission/role-permission.model.js";
import { RoleTable } from "@/features/rbac/role/role.model.js";
import { UserRoleTable } from "@/features/rbac/user-role/user-role.model.js";
import { portalRoleName } from "@/types/rbac-constant.js";
import { SYSTEM_ACTOR } from "@/util/actor.js";

const APPLY = process.argv.includes("--apply");

async function roleIdByName(name: string): Promise<string | null> {
	const [row] = await db
		.select({ id: RoleTable.id })
		.from(RoleTable)
		.where(eq(RoleTable.roleName, name))
		.limit(1);
	return row?.id ?? null;
}

async function ensureUserRole(userId: string, roleId: string) {
	const [existing] = await db
		.select({ id: UserRoleTable.id })
		.from(UserRoleTable)
		.where(
			sql`${UserRoleTable.userId} = ${userId} and ${UserRoleTable.roleId} = ${roleId}`,
		)
		.limit(1);
	if (existing) return;
	await db.insert(UserRoleTable).values({
		userId,
		roleId,
		createdBy: SYSTEM_ACTOR,
		updatedBy: SYSTEM_ACTOR,
	});
}

async function main() {
	const targets = await db
		.select({
			id: RoleTable.id,
			roleName: RoleTable.roleName,
			portalId: RoleTable.portalId,
		})
		.from(RoleTable)
		.where(
			or(
				ilike(RoleTable.roleName, "owner"),
				ilike(RoleTable.roleName, "outlet owner"),
				ilike(RoleTable.roleName, "agency owner"),
				ilike(RoleTable.roleName, "outlet_owner"),
				ilike(RoleTable.roleName, "agency_owner"),
			),
		);

	console.log(`Found ${targets.length} owner-like role(s):`);
	for (const r of targets) {
		const [{ count }] = await db
			.select({ count: sql<number>`count(*)::int` })
			.from(UserRoleTable)
			.where(eq(UserRoleTable.roleId, r.id));
		console.log(
			`  - "${r.roleName}" (${r.id}) portalId=${r.portalId ?? "null"} users=${count}`,
		);
	}

	if (targets.length === 0) {
		console.log("Nothing to do.");
		process.exit(0);
	}

	if (!APPLY) {
		console.log("\nDry run. Re-run with --apply to delete.");
		process.exit(0);
	}

	const agencyRoleId = await roleIdByName(portalRoleName.AGENCY);
	const outletRoleId = await roleIdByName(portalRoleName.OUTLET);
	if (!agencyRoleId || !outletRoleId) {
		throw new Error("Missing canonical agency/outlet roles — run init-roles");
	}

	const targetIds = targets.map((t) => t.id);
	const grants = await db
		.select({
			id: UserRoleTable.id,
			userId: UserRoleTable.userId,
		})
		.from(UserRoleTable)
		.where(inArray(UserRoleTable.roleId, targetIds));

	let remapped = 0;
	for (const g of grants) {
		const [agencyMem] = await db
			.select({ id: AgencyUserTable.id })
			.from(AgencyUserTable)
			.where(
				sql`${AgencyUserTable.userId} = ${g.userId} and ${AgencyUserTable.status} = 'active'`,
			)
			.limit(1);
		const [outletMem] = await db
			.select({ id: OutletUserTable.id })
			.from(OutletUserTable)
			.where(
				sql`${OutletUserTable.userId} = ${g.userId} and ${OutletUserTable.status} = 'active'`,
			)
			.limit(1);

		if (agencyMem) {
			await ensureUserRole(g.userId, agencyRoleId);
			remapped++;
		}
		if (outletMem) {
			await ensureUserRole(g.userId, outletRoleId);
			remapped++;
		}
	}

	const ur = await db
		.delete(UserRoleTable)
		.where(inArray(UserRoleTable.roleId, targetIds))
		.returning({ id: UserRoleTable.id });
	const rp = await db
		.delete(RolePermissionTable)
		.where(inArray(RolePermissionTable.roleId, targetIds))
		.returning({ id: RolePermissionTable.id });
	const roles = await db
		.delete(RoleTable)
		.where(inArray(RoleTable.id, targetIds))
		.returning({ roleName: RoleTable.roleName });

	console.log(
		`Done. deleted=[${roles.map((r) => r.roleName).join(", ")}] user_roles_removed=${ur.length} perms=${rp.length} membership_heals=${remapped}`,
	);
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
