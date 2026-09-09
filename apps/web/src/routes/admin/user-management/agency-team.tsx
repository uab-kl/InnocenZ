import { createFileRoute } from "@tanstack/react-router";
import { OrgMembersListPage } from "@/components/organization/org-members-list-page";

/*
 * A SIBLING path, deliberately — not /admin/user-management/agency/team-members.
 * The sidebar's active check and the breadcrumb resolver are both trailing-slash
 * PREFIX matches over the same nav config, so a child path would light up the
 * "PR Agency" item as well as this one and render the crumb as "PR Agency"
 * forever.
 */
export const Route = createFileRoute("/admin/user-management/agency-team")({
	/* ?org=<uuid> — the deep link from that organisation's Team tab. Invalid or
	   absent means "every organisation", never an error page. */
	validateSearch: (search: Record<string, unknown>): { org?: string } =>
		typeof search.org === "string" && search.org ? { org: search.org } : {},
	component: PRAgencyTeamPage,
	/* English title — route metadata is evaluated outside React, so it cannot
	   read the locale context. Same rule as every other admin page. */
	head: () => ({
		meta: [{ title: "PR Agency Team Members — Innocenz Admin" }],
	}),
});

function PRAgencyTeamPage() {
	const { org } = Route.useSearch();
	return <OrgMembersListPage orgKind="agency" orgId={org} />;
}
