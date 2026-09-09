import { createFileRoute } from "@tanstack/react-router";
import { OrgMemberPage } from "@/components/organization/org-member-page";

export const Route = createFileRoute(
	"/admin/user-management/outlet/$outletId/member/$userId",
)({
	component: OutletMemberPage,
	/* English title — same reason as the agency twin and the list pages. */
	head: () => ({
		meta: [{ title: "Team Member — Innocenz Admin" }],
	}),
});

function OutletMemberPage() {
	const { outletId, userId } = Route.useParams();
	return <OrgMemberPage orgKind="outlet" orgId={outletId} userId={userId} />;
}
