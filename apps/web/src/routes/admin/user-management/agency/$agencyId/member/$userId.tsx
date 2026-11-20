import { createFileRoute } from "@tanstack/react-router";
import { validateMemberPageSearch } from "@/components/organization/member-page-target";
import { OrgMemberPage } from "@/components/organization/org-member-page";

export const Route = createFileRoute(
	"/admin/user-management/agency/$agencyId/member/$userId",
)({
	/* ?from=legacy-member — which list opened the page, so the rail, the trail
	   and Back all name that list. Absent means the Agency Members list. */
	validateSearch: validateMemberPageSearch,
	component: AgencyMemberPage,
	/*
	 * Document title stays ENGLISH, for the same reason the list pages give:
	 * `head()` is route metadata evaluated outside React, so it cannot read the
	 * locale context, and the stored preference is overridden by the account's
	 * `preferred_locale` after hydration.
	 */
	head: () => ({
		meta: [{ title: "Team Member — Innocenz Admin" }],
	}),
});

function AgencyMemberPage() {
	const { agencyId, userId } = Route.useParams();
	const { from } = Route.useSearch();
	return (
		<OrgMemberPage
			orgKind="agency"
			orgId={agencyId}
			userId={userId}
			from={from}
		/>
	);
}
