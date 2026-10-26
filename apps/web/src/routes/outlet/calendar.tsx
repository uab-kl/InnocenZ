import { IzPageTitle } from "@agency-portal/components/iz/ui";
import { OutletOperationsCalendar } from "@agency-portal/components/outlet/OutletOperationsCalendar";
import {
	type CalendarVisibleRange,
	calendarFetchWindow,
} from "@agency-portal/components/outlet/outlet-calendar-window";
import {
	OutletPage,
	OutletPageHeader,
} from "@agency-portal/components/outlet/outlet-portal-ui";
import { useOutletToday } from "@agency-portal/hooks/use-outlet-today";
import { getLiveTodayIso } from "@agency-portal/lib/demo-clock";
import { useStore } from "@agency-portal/lib/store";
import { useOutletCan } from "@agency-portal/lib/use-portal-can";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

// Moved here from `/outlet/ratings`, which is what this screen used to answer
// to. That path had never held ratings — the nav item pointed at it under the
// label "Calendar page" — so the outlet's real Ratings screen had nowhere to
// live and anyone looking for one found a calendar instead.
export const Route = createFileRoute("/outlet/calendar")({
	component: CalendarPage,
});

function CalendarPage() {
	const { t } = usePortalLocale();
	const outletName = useStore((s) => s.outletWorkspace.outletName);
	/*
	 * The calendar pages through months in both directions, so the fetch FOLLOWS
	 * the month on screen — a fixed today ±90 left older months half-empty with
	 * nothing saying so (see `calendarFetchWindow`).
	 */
	const [visible, setVisible] = useState<CalendarVisibleRange | null>(null);
	const onVisibleRangeChange = useCallback((next: CalendarVisibleRange) => {
		setVisible((prev) =>
			prev?.fromIso === next.fromIso && prev?.toIso === next.toIso
				? prev
				: next,
		);
	}, []);
	const fetchWindow = calendarFetchWindow({
		todayIso: getLiveTodayIso(),
		visible,
	});
	// A real session reads its shifts from the backend; demo sessions keep the
	// demo store.
	const backend = useOutletToday(fetchWindow);
	const can = useOutletCan();
	const canView = can("ratePrs") || can("viewLiveDashboard");

	if (!canView) {
		return (
			<div className="iz-screen">
				<header>
					<IzPageTitle>{t.calendar.pageTitle}</IzPageTitle>
				</header>
				<p className="iz-tiny iz-muted mt-4 rounded-xl border border-dashed border-[var(--iz-line)] px-4 py-6 text-center">
					{t.calendar.noAccess}
				</p>
			</div>
		);
	}

	return (
		<OutletPage>
			<OutletPageHeader
				eyebrow={outletName}
				title={t.calendar.title}
				iconKey="Calendar"
				hint={t.calendar.subtitle}
			/>

			<OutletOperationsCalendar
				shifts={backend.backed ? backend.shifts : undefined}
				roster={backend.backed ? backend.roster : undefined}
				agencyPrs={backend.backed ? backend.prs : undefined}
				onVisibleRangeChange={onVisibleRangeChange}
			/>
		</OutletPage>
	);
}
