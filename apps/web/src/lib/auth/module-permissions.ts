/**
 * Module C/R/U helpers for portal UI (mirrors backend requirePermission).
 */
export type CruType = "create" | "read" | "update";

export function canModule(
	modulePermissions:
		| Array<{ moduleKey: string; permissionType: string }>
		| undefined
		| null,
	moduleKey: string,
	type: CruType,
): boolean {
	if (!modulePermissions?.length) return false;
	return modulePermissions.some(
		(p) => p.moduleKey === moduleKey && p.permissionType === type,
	);
}

/**
 * THE GRANTS THAT BELONG TO ONE CONSOLE.
 *
 * ⚠️ `/auth/me` returns the UNION of every role the account holds, across every
 * portal, and `canModule` above matches on module key + verb alone. That is
 * safe only while a key means one thing — and it does not: `settings`,
 * `dashboard` and `history` each exist as a SEPARATE module row per portal.
 *
 * So an agency Owner (who holds `settings:update`) who is also a Finance head
 * at some venue was answered YES on that venue's Settings page and shown the
 * Edit control. The server refused the save — `PUT /outlet/:id` is gated by
 * `outletOwnerOfParam`, scoped to the venue in the URL — so nothing could be
 * written, but the page offered an edit it could not keep. The owner's rule is
 * that only the venue's own owner changes owner information; a control that
 * says otherwise breaks the rule on screen even when the data holds.
 *
 * A missing `portalCode` means "unknown", and unknown grants are KEPT: an older
 * server, or a module row with no portal, must behave exactly as it did before
 * this field existed. Dropping them would lock people out of consoles they can
 * use today, which is the more expensive way to be wrong.
 */
/**
 * BUILD A PORTAL'S ROLE MATRIX FROM THE DATABASE'S OWN GRANTS.
 *
 * Owner, 11 Sep 2026: "the rbac must ensure what can do what cannot do, ofcourse
 * must from the database … web matrix must follow what database given."
 *
 * ⚠️ The matrix used to be a hand-written SECOND copy of `role_permission`, and
 * the two had drifted 14 cells apart — every one of them decided by the
 * database at runtime, so the copy was simply wrong on screen. It is now
 * DERIVED from `rbac-grants.generated.ts`, which a sync script writes from the
 * live table. One fact, one place.
 *
 * `matrixOnly` is the deliberate remainder: permissions the SERVER gates by
 * LANE rather than by a module grant, so there is no row to derive them from.
 * Those lists must mirror the server's own lane list, and a wrong entry here is
 * a button that collects a 403 — they are the only part of this still kept in
 * step by hand, which is why there are just two of them.
 */
export function buildRoleMatrix<Role extends string, Perm extends string>(
	grants: Record<Role, readonly string[]>,
	featureModule: Record<string, { key: string; type: CruType }>,
	matrixOnly: Partial<Record<Perm, readonly Role[]>>,
): Record<Role, Perm[]> {
	const out = {} as Record<Role, Perm[]>;
	for (const role of Object.keys(grants) as Role[]) {
		const held = new Set<string>(grants[role]);
		const perms: Perm[] = [];
		for (const [permission, module] of Object.entries(featureModule)) {
			if (held.has(`${module.key}:${module.type}`)) {
				perms.push(permission as Perm);
			}
		}
		for (const permission of Object.keys(matrixOnly) as Perm[]) {
			if (matrixOnly[permission]?.includes(role)) perms.push(permission);
		}
		out[role] = perms;
	}
	return out;
}

export function grantsForPortal<
	T extends { moduleKey: string; permissionType: string; portalCode?: unknown },
>(modulePermissions: T[] | undefined | null, portalCode: string): T[] {
	if (!modulePermissions?.length) return [];
	return modulePermissions.filter(
		(p) =>
			p.portalCode === undefined ||
			p.portalCode === null ||
			p.portalCode === portalCode,
	);
}

/** Feature → module key used by agency portal screens. */
export const AGENCY_FEATURE_MODULE: Record<
	string,
	{ key: string; type: CruType }
> = {
	viewHome: { key: "dashboard", type: "read" },
	approvePrSignups: { key: "approvals", type: "update" },
	/** Seeing the Approvals queue, as against answering it (Director). */
	viewApprovals: { key: "approvals", type: "read" },
	assignShifts: { key: "roster", type: "update" },
	managePr: { key: "workforce", type: "update" },
	viewSettings: { key: "settings", type: "read" },
	editSettings: { key: "settings", type: "update" },
	viewPv: { key: "payment_voucher", type: "read" },
	raisePv: { key: "payment_voucher", type: "create" },
	viewCollections: { key: "collections", type: "read" },
	confirmReconciliation: { key: "collections", type: "update" },
	viewHistory: { key: "history", type: "read" },
	viewWorkforce: { key: "workforce", type: "read" },
	overrideSignedPv: { key: "payment_voucher", type: "update" },
};

export const OUTLET_FEATURE_MODULE: Record<
	string,
	{ key: string; type: CruType }
> = {
	postJob: { key: "booking", type: "create" },
	/** Seeing the Post Job screen, as against posting on it (Director). */
	viewBookings: { key: "booking", type: "read" },
	viewLiveDashboard: { key: "dashboard", type: "read" },
	logSales: { key: "sales", type: "create" },
	sealShift: { key: "booking", type: "update" },
	confirmShift: { key: "booking", type: "update" },
	confirmDaily: { key: "billing", type: "update" },
	viewBilling: { key: "billing", type: "read" },
	viewSalesDashboard: { key: "sales", type: "read" },
	ratePrs: { key: "rating", type: "create" },
	viewHistory: { key: "history", type: "read" },
	manageShiftStaffing: { key: "workspace", type: "update" },
	viewWorkspace: { key: "workspace", type: "read" },
	manageWorkspace: { key: "workspace", type: "update" },
	viewSettings: { key: "settings", type: "read" },
	editSettings: { key: "settings", type: "update" },
	orderSpecialService: { key: "special_service", type: "create" },
};
