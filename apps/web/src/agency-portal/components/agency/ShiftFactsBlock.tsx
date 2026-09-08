import {
	formatShiftDayDate,
	formatShiftDuration,
	formatStampClock,
} from "@agency-portal/lib/agency-payroll";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { resolveProofPhotoUrl } from "@/lib/proof-photo";
import type { DisputeShift } from "@/services/payment-voucher";

/**
 * The shift behind a figure — where it was, what the OUTLET named the night,
 * whether they marked it special, its window, its day, and the PR's stamps.
 *
 * ONE component, rendered identically by the dispute queue and the receipts
 * feed. It started as a block on the dispute card and a cramped one-liner on
 * the receipt row; two spellings of one fact is exactly how these screens drift
 * apart, and the agency reads both while deciding the same money.
 *
 * Every absent value is spelled out. "not checked in" and "still on duty" are
 * DIFFERENT facts and neither is a dash — the reviewer is about to approve or
 * reject money and needs to know which.
 *
 * `slot` prints VERBATIM. It must never go through `formatShiftTimeRange` /
 * `parseShiftWindow`, whose `?? "22:00"` / `?? "04:00"` defaults would turn a
 * null slot into a confident, entirely fabricated "10pm – 4am".
 */
export function ShiftFactsBlock({ shift }: { shift: DisputeShift }) {
	const { t, locale } = usePortalLocale();
	const ot = shift.overtimeMinutes ?? 0;
	// An R2 object KEY on the wire; the resolver adds the public base. It returns
	// the input unchanged for anything it does not recognise, so a stale or
	// oddly-shaped value degrades to a broken <img> rather than a crash — hence
	// the onError below, which removes the picture instead of leaving a torn icon
	// beside money somebody is about to approve.
	const cover = shift.coverImage?.trim()
		? resolveProofPhotoUrl(shift.coverImage.trim())
		: null;
	return (
		<div className="flex gap-2.5 rounded-md border border-[var(--iz-line,#2a2a3a)] px-2.5 py-2">
			{cover ? (
				<img
					src={cover}
					// The outlet's own name for the night, which is what the picture
					// is of. Falls back to the venue; never an empty alt, because
					// this image is evidence rather than decoration.
					alt={shift.eventName?.trim() || shift.outletName || ""}
					className="h-12 w-16 shrink-0 rounded border border-[var(--iz-line,#2a2a3a)] object-cover"
					loading="lazy"
					onError={(e) => {
						e.currentTarget.style.display = "none";
					}}
				/>
			) : null}
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-1.5">
					<span className="text-sm font-semibold">
						{shift.outletName || "—"}
					</span>
					{/* The event TYPE, always present — the column is NOT NULL and
				    defaults to 'normal', so once we have the shift we have this. */}
					<span
						className={`iz-pill !text-[10px] ${
							shift.eventKind === "special" ? "iz-pill-amber" : "iz-pill-ink"
						}`}
					>
						{shift.eventKind === "special"
							? t.rosterGrid.specialEvent
							: t.rosterGrid.normalShift}
					</span>
				</div>
				<p className="iz-tiny iz-muted mt-0.5">
					{shift.eventName?.trim() || t.rosterGrid.noEventName} ·{" "}
					{shift.slot || "—"}
				</p>
				{/* The shift's OWN day, with the year — a payroll queue holds claims
			    months apart, and "Thu 6 Aug" alone reads as this year. This is
			    shift.shiftDate, NOT the dispute's or the receipt's date: those are
			    when the paper was logged, which differs on a midnight-crossing
			    shift and on a re-dated receipt. */}
				<p className="iz-tiny iz-muted2 mt-0.5">
					{formatShiftDayDate(shift.shiftDate, locale)}
				</p>
				<div className="mt-1.5 flex flex-wrap gap-4">
					<span>
						<span className="iz-tiny iz-muted block">
							{t.rosterGrid.checkIn}
						</span>
						<span className="iz-nums text-sm">
							{formatStampClock(shift.checkInAt, t.rosterGrid.notCheckedIn)}
						</span>
					</span>
					<span>
						{/* "Shift end", NOT "checked out". The stored stamp is clamped to
					    the scheduled end when the PR taps out, so calling it a
					    check-out asserts a time that never happened on every overtime
					    shift. The real overrun is the OT beside it. */}
						<span className="iz-tiny iz-muted block">
							{t.agencyPanels.shiftEnd}
						</span>
						<span className="iz-nums text-sm">
							{formatStampClock(shift.checkOutAt, t.agencyPanels.stillOnDuty)}
							{ot > 0 ? fill(t.agencyPanels.otSuffix, { n: ot }) : ""}
						</span>
					</span>
					<span>
						{/* Derived from the two stamps ONLY. The OT above comes from the
					    server's overtime_minutes and is the sole OT truth — this never
					    adds a second guess at it, which is why the phone's
					    shiftDurationLabel (hardcoded scheduledHours = 6) is not used. */}
						<span className="iz-tiny iz-muted block">
							{t.agencyPanels.duration}
						</span>
						<span className="iz-nums text-sm">
							{formatShiftDuration(shift.checkInAt, shift.checkOutAt)}
						</span>
					</span>
				</div>
			</div>
		</div>
	);
}
