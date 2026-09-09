import { IconGuide } from "@agency-portal/components/iz/IconGuide";
import { UnpaidBillingBanner } from "@agency-portal/components/iz/UnpaidBillingBanner";
import { OutletBookings } from "@agency-portal/components/outlet/OutletBookings";
import { OutletReconciliationBanner } from "@agency-portal/components/outlet/OutletReconciliationBanner";
import {
	OutletPage,
	OutletPageHeader,
} from "@agency-portal/components/outlet/outlet-portal-ui";
import { useOutletAgencyLinks } from "@agency-portal/hooks/use-outlet-agency-links";
import { useOutletToday } from "@agency-portal/hooks/use-outlet-today";
import { nowAgencyDateTime } from "@agency-portal/lib/portal-clock";
import { useStore } from "@agency-portal/lib/store";
import { createFileRoute, Link } from "@tanstack/react-router";
import { usePortalLocale } from "@/lib/portal-i18n/context";

export const Route = createFileRoute("/outlet/")({
	component: OutletHome,
});

function OutletHome() {
	const outletSubRole = useStore((s) => s.outletSubRole);
	const isFinance = outletSubRole === "outlet_finance";
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
			{isFinance && (
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
