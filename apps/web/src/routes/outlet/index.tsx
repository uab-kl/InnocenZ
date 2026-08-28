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
import { nowAgencyDateTime } from "@agency-portal/lib/agency-demo";
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

			<OutletPageHeader
				eyebrow={t.common.today}
				// English lookup key for the eyebrow icon: `iconForNav` matches on the
				// text, so the translated "今天" would resolve to a "?" glyph instead
				// of the Home icon.
				eyebrowIconKey="Today"
				title={`${date} · ${time}`}
				hint={t.outletHome.liveShiftHint}
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
