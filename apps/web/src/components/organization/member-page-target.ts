/**
 * The admin page for one person inside one organisation — the destination a
 * team-member row opens. Null when either id is missing: never guess one.
 */
export function memberPageTarget(
	orgKind: "agency" | "outlet" | null | undefined,
	orgId: string | null | undefined,
	userId: string | null | undefined,
) {
	if (!orgKind || !orgId || !userId) return null;
	return orgKind === "agency"
		? {
				to: "/admin/user-management/agency/$agencyId/member/$userId" as const,
				params: { agencyId: orgId, userId },
			}
		: {
				to: "/admin/user-management/outlet/$outletId/member/$userId" as const,
				params: { outletId: orgId, userId },
			};
}
