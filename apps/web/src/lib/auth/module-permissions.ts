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

/** Feature → module key used by agency portal screens. */
export const AGENCY_FEATURE_MODULE: Record<
	string,
	{ key: string; type: CruType }
> = {
	viewHome: { key: "dashboard", type: "read" },
	approvePrSignups: { key: "approvals", type: "update" },
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
