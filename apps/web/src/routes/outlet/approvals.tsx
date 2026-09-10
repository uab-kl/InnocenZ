import { IzPageTitle } from "@agency-portal/components/iz/ui";
import { PendingMemberDetail } from "@agency-portal/components/org/PendingMemberDetail";
import { PendingMembersPanel } from "@agency-portal/components/org/PendingMembersPanel";
import { useOutletProfile } from "@agency-portal/hooks/use-outlet-profile";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

export const Route = createFileRoute("/outlet/approvals")({
	component: OutletApprovalsPage,
});

/**
 * THE VENUE'S APPROVALS PAGE — people asking to join its team.
 *
 * Owner, 11 Sep 2026, having gone looking for it twice: *"where is the approval
 * page for the outlet, new members?"*, then *"the layout please make like
 * agency and the new page"*.
 *
 * It used to be a section part-way down Settings, below the profile, the owner
 * block and the notification toggles. Everything about that was wrong. A queue
 * nobody can find is not a queue: the owner had to already know it existed and
 * scroll to it, and no count anywhere else on the venue's screen suggested that
 * somebody was waiting. Admitting a stranger to a venue's roster is also not a
 * settings toggle — it is the same act the agency portal gives a page of its
 * own, so the venue now gets the same page and the same shape.
 *
 * ⚠️ Deliberately NOT a copy of `/agency/pending`. That page carries three
 * groups (PR sign-ups, venue links, new members) and their sub-tabs; a venue
 * has exactly one queue, so it takes the LAYOUT — list on the left, the person
 * on the right — without the group tablist, which above a single group would
 * name it a second time and offer no choice.
 *
 * Both panels are the SAME components the agency page mounts, so the row, the
 * filter, the detail and the approve write cannot drift between the portals.
 */
function OutletApprovalsPage() {
	const { t } = usePortalLocale();
	const { outletId } = useOutletProfile();
	const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

	return (
		<div className="iz-screen iz-approvals-page">
			<div className="iz-approvals-layout">
				<aside className="iz-approvals-sidebar">
					<header className="iz-approvals-sidebar-head">
						<IzPageTitle level={1} dateTime>
							{t.approvals.title}
						</IzPageTitle>
					</header>

					<div className="iz-approvals-list">
						<PendingMembersPanel
							kind="outlet"
							orgId={outletId}
							selectedId={selectedMemberId}
							onSelect={setSelectedMemberId}
						/>
					</div>
				</aside>

				<main className="iz-approvals-detail">
					<PendingMemberDetail
						kind="outlet"
						orgId={outletId}
						memberId={selectedMemberId}
						// A decided row leaves the Waiting filter, and a pane still
						// showing a row the list no longer holds is how a screen starts
						// lying about its own state.
						onDecided={() => setSelectedMemberId(null)}
					/>
				</main>
			</div>
		</div>
	);
}
