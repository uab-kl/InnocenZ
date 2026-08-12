import { IzPageTitle } from "@agency-portal/components/iz/ui";
import { OutletOperationsCalendar } from "@agency-portal/components/outlet/OutletOperationsCalendar";
import {
	OutletPage,
	OutletPageHeader,
} from "@agency-portal/components/outlet/outlet-portal-ui";
import { useOutletToday } from "@agency-portal/hooks/use-outlet-today";
import { useStore } from "@agency-portal/lib/store";
import { useOutletCan } from "@agency-portal/lib/use-portal-can";
import { createFileRoute } from "@tanstack/react-router";

// Moved here from `/outlet/ratings`, which is what this screen used to answer
// to. That path had never held ratings — the nav item pointed at it under the
// label "Calendar page" — so the outlet's real Ratings screen had nowhere to
// live and anyone looking for one found a calendar instead.
export const Route = createFileRoute("/outlet/calendar")({
	component: CalendarPage,
});

// The calendar pages through months in both directions, so it needs a much
// wider window than Today's fortnight.
const CALENDAR_WINDOW_DAYS = 90;

function CalendarPage() {
	const outletName = useStore((s) => s.outletWorkspace.outletName);
	// A real session reads its shifts from the backend; demo sessions keep the
	// demo store.
	const backend = useOutletToday({
		lookbehindDays: CALENDAR_WINDOW_DAYS,
		lookaheadDays: CALENDAR_WINDOW_DAYS,
	});
	const can = useOutletCan();
	const canView = can("ratePrs") || can("viewLiveDashboard");

	if (!canView) {
		return (
			<div className="iz-screen">
				<header>
					<IzPageTitle>Calendar page</IzPageTitle>
				</header>
				<p className="iz-tiny iz-muted mt-4 rounded-xl border border-dashed border-[var(--iz-line)] px-4 py-6 text-center">
					Your role cannot access upcoming shifts.
				</p>
			</div>
		);
	}

	return (
		<OutletPage>
			<OutletPageHeader
				eyebrow={outletName}
				title="Calendar"
				hint="Upcoming shifts — click a day to view details."
			/>

			<OutletOperationsCalendar
				shifts={backend.backed ? backend.shifts : undefined}
				roster={backend.backed ? backend.roster : undefined}
				agencyPrs={backend.backed ? backend.prs : undefined}
			/>
		</OutletPage>
	);
}
