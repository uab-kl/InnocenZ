import type { AgencyRosterSlot } from "@agency-portal/lib/agency-demo";
import type { OpsNotification } from "@agency-portal/lib/ops-notifications";
import { DEFAULT_PR_AGENCY_NAME } from "@agency-portal/lib/pr-demo";

const BLOCKING_STATUSES = new Set<AgencyRosterSlot["status"]>([
	"on-duty",
	"en-route",
	"scheduled",
	"assignment-pending",
	"outlet-request-pending",
	"outlet-pending",
	"swap-pending",
]);

export function prDayIsUnavailable(slots: AgencyRosterSlot[]): boolean {
	return slots.some((s) => s.status === "unavailable");
}

/** PR blocked the day on their schedule (not agency cancel / shift edit) */
export function isPrMarkedDayOff(slot: AgencyRosterSlot): boolean {
	return (
		slot.status === "unavailable" &&
		(slot.outlet === "—" ||
			slot.prUnavailableNote === "PR marked day off on schedule")
	);
}

export function canTogglePrDayAvailability(slots: AgencyRosterSlot[]): boolean {
	if (prDayIsUnavailable(slots)) return true;
	return !slots.some((s) => BLOCKING_STATUSES.has(s.status));
}

export function buildAvailabilityOpsNotifications(input: {
	prName: string;
	dateLabel: string;
	available: boolean;
	at: string;
}): OpsNotification[] {
	const { prName, dateLabel, available, at } = input;
	const verb = available ? "available again" : "not available";
	const suffix = available
		? "Open for Atlas & outlet booking"
		: "Blocked on agency roster — outlets see updated availability";

	return [
		{
			id: `ops-agency-avail-${Date.now().toString(36)}`,
			portal: "agency",
			kind: "shift_edit",
			title: `${prName} · ${dateLabel}`,
			body: `PR ${verb} · ${suffix}`,
			at,
			read: false,
			href: "/agency/roster",
			prName,
		},
		{
			id: `ops-outlet-avail-${Date.now().toString(36)}a`,
			portal: "outlet",
			kind: "shift_edit",
			title: `${prName} · ${dateLabel}`,
			body: `Synced from PR schedule — ${verb} via ${DEFAULT_PR_AGENCY_NAME}`,
			at,
			read: false,
			href: "/outlet/bookings",
			prName,
		},
	];
}
