import { createFileRoute } from "@tanstack/react-router";
import { validateMemberPageSearch } from "@/components/organization/member-page-target";
import { OrgMemberPage } from "@/components/organization/org-member-page";

export const Route = createFileRoute(
	"/admin/user-management/outlet/$outletId/member/$userId",
)({
	/* ?from=legacy-member — same as the agency twin. Absent means Outlet Members. */
	validateSearch: validateMemberPageSearch,
	component: OutletMemberPage,
	/* English title — same reason as the agency twin and the list pages. */
	head: () => ({
		meta: [{ title: "Team Member — Innocenz Admin" }],
	}),
});

function OutletMemberPage() {
	const { outletId, userId } = Route.useParams();
	const { from } = Route.useSearch();
	return (
		<OrgMemberPage
			orgKind="outlet"
			orgId={outletId}
			userId={userId}
			from={from}
		/>
	);
}
