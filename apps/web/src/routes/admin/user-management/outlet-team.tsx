import { createFileRoute } from "@tanstack/react-router";
import { OrgMembersListPage } from "@/components/organization/org-members-list-page";

/*
 * A SIBLING path, deliberately — not /admin/user-management/outlet/team-members.
 * The sidebar's active check and the breadcrumb resolver are both trailing-slash
 * PREFIX matches over the same nav config, so a child path would light up the
 * "Outlet" item as well as this one and render the crumb as "Outlet"
 * forever.
 */
export const Route = createFileRoute("/admin/user-management/outlet-team")({
	/* ?org=<uuid> — the deep link from that organisation's Team tab. Invalid or
	   absent means "every organisation", never an error page. */
	validateSearch: (search: Record<string, unknown>): { org?: string } =>
		typeof search.org === "string" && search.org ? { org: search.org } : {},
	component: OutletTeamPage,
	/* English title — route metadata is evaluated outside React, so it cannot
	   read the locale context. Same rule as every other admin page. */
	head: () => ({
		meta: [{ title: "Outlet Team Members — Innocenz Admin" }],
	}),
});

function OutletTeamPage() {
	const { org } = Route.useSearch();
	return <OrgMembersListPage orgKind="outlet" orgId={org} />;
}
