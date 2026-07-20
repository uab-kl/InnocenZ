import { IzPageTitle } from "@agency-portal/components/iz/ui";
import { OutletOperationsCalendar } from "@agency-portal/components/outlet/OutletOperationsCalendar";
import {
	OutletPage,
	OutletPageHeader,
} from "@agency-portal/components/outlet/outlet-portal-ui";
import { useOutletToday } from "@agency-portal/hooks/use-outlet-today";
import { outletCan } from "@agency-portal/lib/outlet-rbac";
import { useStore } from "@agency-portal/lib/store";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/outlet/ratings")({
	component: CalendarPage,
});

// The calendar pages through months in both directions, so it needs a much
// wider window than Today's fortnight.
const CALENDAR_WINDOW_DAYS = 90;

function CalendarPage() {
	const outletSubRole = useStore((s) => s.outletSubRole);
	const outletName = useStore((s) => s.outletWorkspace.outletName);
	// A real session reads its shifts from the backend; demo sessions keep the
	// demo store.
	const backend = useOutletToday({
		lookbehindDays: CALENDAR_WINDOW_DAYS,
		lookaheadDays: CALENDAR_WINDOW_DAYS,
	});
	const canView =
		outletCan(outletSubRole, "ratePrs") ||
		outletCan(outletSubRole, "viewLiveDashboard");

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
