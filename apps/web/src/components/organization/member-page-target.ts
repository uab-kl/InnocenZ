import { MEMBER_PAGE_FROM_LEGACY } from "@/components/admin/admin-trail";

/** Which list opened a member page. Absent = that kind's Members list. */
export type MemberPageSearch = { from?: typeof MEMBER_PAGE_FROM_LEGACY };

/**
 * The member routes' `?from=`. Anything but the one known value means "opened
 * from the Members list", never an error page.
 */
export function validateMemberPageSearch(
	search: Record<string, unknown>,
): MemberPageSearch {
	return search.from === MEMBER_PAGE_FROM_LEGACY
		? { from: MEMBER_PAGE_FROM_LEGACY }
		: {};
}

/**
 * The admin page for one person inside one organisation — the destination a
 * team-member row opens. Null when either id is missing: never guess one.
 *
 * `from` says which list is opening it, so the page files itself under that
 * list in the rail, the trail and its Back button (see `adminNavFilingPath`).
 */
export function memberPageTarget(
	orgKind: "agency" | "outlet" | null | undefined,
	orgId: string | null | undefined,
	userId: string | null | undefined,
	from?: MemberPageSearch["from"],
) {
	if (!orgKind || !orgId || !userId) return null;
	const search: MemberPageSearch = from ? { from } : {};
	return orgKind === "agency"
		? {
				to: "/admin/user-management/agency/$agencyId/member/$userId" as const,
				params: { agencyId: orgId, userId },
				search,
			}
		: {
				to: "/admin/user-management/outlet/$outletId/member/$userId" as const,
				params: { outletId: orgId, userId },
				search,
			};
}
