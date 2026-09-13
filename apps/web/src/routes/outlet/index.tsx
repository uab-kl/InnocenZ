import { IconGuide } from "@agency-portal/components/iz/IconGuide";
import { UnpaidBillingBanner } from "@agency-portal/components/iz/UnpaidBillingBanner";
import { OutletBookings } from "@agency-portal/components/outlet/OutletBookings";
import { OutletPriceSetupBanner } from "@agency-portal/components/outlet/OutletPriceSetupBanner";
import { OutletReconciliationBanner } from "@agency-portal/components/outlet/OutletReconciliationBanner";
import {
	OutletPage,
	OutletPageHeader,
} from "@agency-portal/components/outlet/outlet-portal-ui";
import { useOutletAgencyLinks } from "@agency-portal/hooks/use-outlet-agency-links";
import { useOutletToday } from "@agency-portal/hooks/use-outlet-today";
import { nowAgencyDateTime } from "@agency-portal/lib/portal-clock";
import { useOutletCan } from "@agency-portal/lib/use-portal-can";
import { createFileRoute, Link } from "@tanstack/react-router";
import { usePortalLocale } from "@/lib/portal-i18n/context";

export const Route = createFileRoute("/outlet/")({
	component: OutletHome,
});

function OutletHome() {
	const can = useOutletCan();
	/*
	 * ⚠️ WHO IS ACTUALLY VIEW-ONLY — asked of the grants, never of a lane name.
	 *
	 * This read `outletSubRole === "outlet_finance"` and printed "Read-only
	 * overview" over a page whose own sidebar offered Finance Post Job. Outlet
	 * Finance holds `booking`, `sales`, `workspace`, `rating` and
	 * `special_service` at CRU — they run the venue's floor. The lane that IS
	 * view-only is Director, and it was the one lane this never labelled.
	 *
	 * That is the same defect CLAUDE.md records the matrix having had ("it
	 * called outlet Finance view only while Post Job sat in their sidebar"):
	 * the matrix was fixed and this hard-coded copy was left behind. Deriving
	 * it means it cannot go stale again — change a grant and this follows.
	 */
	const isViewOnly = ![
		"postJob",
		"logSales",
		"sealShift",
		"manageShiftStaffing",
		"ratePrs",
		"orderSpecialService",
		"editSettings",
	].some((p) => can(p as Parameters<typeof can>[0]));
	const { date, time } = nowAgencyDateTime();
	// A real session shows tonight's booked shift from the backend; demo sessions
	// keep the demo store.
	const backend = useOutletToday();
	// Same hook Post Job gates on, so Today and Post Job cannot disagree about
	// whether this venue has an agency.
	const agencyLinks = useOutletAgencyLinks();
	const { t } = usePortalLocale();

	return (
		<OutletPage>
			{isViewOnly && (
				<p className="iz-tiny iz-muted rounded-lg border border-dashed border-[var(--iz-line)] px-2.5 py-1.5">
					{t.outletHome.readOnlyOverview}
				</p>
			)}

			{/* The page is named after itself, like every other page in both
			    portals (owner, 8 Sep 2026). It used to print the DATE as its title
			    with "Today" demoted to the eyebrow — the same inversion the agency
			    home had, and the reason this was the one outlet page whose heading
			    did not match its own sidebar row. The clock keeps its place, one
			    step down in the hint, where it has always belonged: it is what is
			    true about today, not what the page is.

			    `iconKey` takes the ENGLISH lookup key, not the rendered words:
			    `iconForNav` matches on text, so a translated "今天" resolves to a
			    "?" glyph instead of the Home icon. */}
			<OutletPageHeader
				title={t.common.today}
				iconKey="Today"
				hint={`${date} · ${time} · ${t.outletHome.liveShiftHint}`}
			/>

			{/* Money the venue owes InnocenZ, above the staffing banners: a shift it
			    cannot post is today's problem, but an unpaid subscription is the one
			    that ends the account. Hidden entirely at zero. */}
			<UnpaidBillingBanner portal="outlet" />

			{/*
			  ⚠️ SAID OUT LOUD, because an empty board is this screen's normal state.

			  Shifts, assignments and PRs all come back `[]` when their requests
			  fail, and everything below renders that as a quiet night — so a venue
			  with a full floor could be shown nothing at all, on the one screen
			  they use to run the evening. And worse than nothing: if the shifts
			  loaded but the assignments did not, the board shows a shift with
			  NOBODY on it, which reads as staff failing to turn up.

			  Amber, not red: nothing is known to be wrong with the night itself,
			  only with our ability to describe it.
			*/}
			{backend.isError && (
				<div className="mb-3 rounded-xl border border-amber-300/40 bg-amber-300/5 px-4 py-3">
					<p className="text-sm font-semibold text-amber-300">
						{t.today.couldNotLoadTonight}
					</p>
					<p className="iz-tiny iz-muted mt-1">
						{t.today.couldNotLoadTonightHint}
					</p>
				</div>
			)}

			{/* A venue with no APPROVED agency cannot post a shift, and Today is the
			    screen it lands on. Without this it sees an empty board with no
			    explanation and no idea the next step is in Settings. Split in two
			    because the action differs: link one, or wait for the one already
			    asked. */}
			{backend.backed && !agencyLinks.isLoading && !agencyLinks.canPost && (
				<div className="mb-3 rounded-xl border border-amber-300/40 bg-amber-300/5 px-4 py-3">
					<p className="text-sm font-semibold text-amber-300">
						{agencyLinks.awaitingApproval
							? t.postJob.waitingForAgency
							: t.today.noAgencyYet}
					</p>
					<p className="iz-tiny iz-muted mt-1">
						{agencyLinks.awaitingApproval
							? t.today.requestWithAgency
							: t.today.agenciesFillShifts}
					</p>
					{!agencyLinks.awaitingApproval && (
						<Link
							to="/outlet/settings"
							className="iz-tiny mt-2 inline-block underline decoration-dotted underline-offset-2 hover:text-[var(--iz-gold)]"
						>
							{t.postJob.goToSettingsAgencies}
						</Link>
					)}
				</div>
			)}

			{/* Prices before people: a venue can be staffed with empty price lists,
			    and the gap only surfaces when somebody tries to log what was sold —
			    mid-shift, with PRs already on the floor. Sits under the agency
			    banner because linking an agency is the step that must come first;
			    hidden entirely once each list carries a price. */}
			<OutletPriceSetupBanner />

			<OutletBookings
				shifts={backend.backed ? backend.shifts : undefined}
				roster={backend.backed ? backend.roster : undefined}
				agencyPrs={backend.backed ? backend.prs : undefined}
			/>

			<OutletReconciliationBanner />

			<IconGuide className="iz-icon-guide--portal mt-6" />
		</OutletPage>
	);
}
