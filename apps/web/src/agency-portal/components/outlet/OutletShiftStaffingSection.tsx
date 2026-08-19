import { TierBadge, TrafficPill } from "@agency-portal/components/iz/ui";
import type {
	AgencyManagedPR,
	AgencyRosterSlot,
} from "@agency-portal/lib/agency-demo";
import { resolveOutletShiftDateIso } from "@agency-portal/lib/agency-outlet-shifts";
import {
	agencyNameForShift,
	buildShiftStaffRows,
	type ShiftStaffRow,
	shiftDemandBreakdown,
	shiftStaffingSummary,
	staffingFallbackAgencyName,
} from "@agency-portal/lib/outlet-shift-staffing";
import { DEFAULT_ROSTER_DATE_ISO } from "@agency-portal/lib/roster-availability";
import { type ShiftRequest, useStore } from "@agency-portal/lib/store";
import { trafficLevelForRatio } from "@agency-portal/lib/traffic-status";
import { cn } from "@agency-portal/lib/utils";
import { ClipboardList, UserCheck, Users } from "lucide-react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/**
 * Status → tag colour, and status → the words for it.
 *
 * Two maps keyed by the SAME literal union the lib emits, so a status added
 * there becomes a compile error here rather than a tag that quietly renders
 * uncoloured. Labels are resolver functions because this map is module-scope and
 * cannot read `t`; a dictionary KEY would type-check and then print its own name
 * to screen.
 */
const STATUS_TAG_CLASS: Record<ShiftStaffRow["statusLabel"], string> = {
	Booked: "iz-outlet-staff-tag--booked",
	Applied: "iz-outlet-staff-tag--applied",
	Accepted: "iz-outlet-staff-tag--accepted",
	Declined: "iz-outlet-staff-tag--declined",
	"Pending agency": "iz-outlet-staff-tag--pending",
};

const STATUS_TAG_LABEL: Record<
	ShiftStaffRow["statusLabel"],
	(t: PortalTranslations) => string
> = {
	Booked: (t) => t.today.statusBooked,
	Applied: (t) => t.today.statusApplied,
	Accepted: (t) => t.today.statusAccepted,
	Declined: (t) => t.today.statusDeclined,
	"Pending agency": (t) => t.today.pendingAgency,
};

function StaffRow({ row }: { row: ShiftStaffRow }) {
	const { t } = usePortalLocale();
	return (
		<div className="iz-outlet-staff-row">
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-1.5">
					<span className="text-sm font-semibold text-[var(--iz-txt)]">
						{row.name}
					</span>
					{row.tier && <TierBadge tier={row.tier} />}
					{row.rating != null && (
						<span className="text-[10px] text-[var(--iz-gold)]">
							{row.rating}★
						</span>
					)}
				</div>
				{/* The separator belongs to the agency name, so it leaves with it.
				    `agencyLabel` is empty whenever nothing names the supplier — the
				    normal case on a real session — and this line printed
				    "10pm - 4am · " with nothing after the dot. */}
				<p className="iz-tiny iz-muted2 mt-0.5">
					{row.shiftTime}
					{row.agencyLabel ? ` · ${row.agencyLabel}` : null}
				</p>
			</div>
			{/* ⚠️ BRANCH ON THE LITERAL, RENDER THE TRANSLATION.
			    `row.statusLabel` is the English literal union the lib emits
			    ("Booked" | "Applied" | …). Comparing it to `t.today.*` worked only
			    while the locale happened to be English: on zh every branch is
			    false, so all five tags lost their colour at once — and the text
			    rendered was the raw English literal anyway. A status is DATA and
			    the words are presentation; only one of the two may be compared. */}
			<span
				className={cn(
					"iz-outlet-staff-tag shrink-0",
					STATUS_TAG_CLASS[row.statusLabel],
				)}
			>
				{STATUS_TAG_LABEL[row.statusLabel](t)}
			</span>
		</div>
	);
}

export function OutletShiftStaffingSection({
	shift,
	roster: rosterOverride,
	agencyPrs: agencyPrsOverride,
}: {
	shift: ShiftRequest;
	/**
	 * Backend roster slots + PR records for a real outlet session; `shift.prs` is
	 * resolved against them, so they travel together. Omitted on demo sessions.
	 */
	roster?: AgencyRosterSlot[];
	agencyPrs?: AgencyManagedPR[];
}) {
	const { t } = usePortalLocale();
	const storeRoster = useStore((s) => s.agencyRoster);
	const storeAgencyPRs = useStore((s) => s.agencyPRs);
	const shiftApplicants = useStore((s) => s.shiftApplicants);
	const agencyRoster = rosterOverride ?? storeRoster;
	const agencyPRs = agencyPrsOverride ?? storeAgencyPRs;
	// A backend roster arrives ONLY on a real outlet session (see the prop doc
	// above), and that is exactly the session that must never be told a demo
	// company supplied its staff. Demo sessions keep naming the demo agency.
	const fallbackAgency = staffingFallbackAgencyName(
		rosterOverride !== undefined,
	);

	const dateIso = resolveOutletShiftDateIso(
		shift.date,
		shift.dateIso,
		DEFAULT_ROSTER_DATE_ISO,
	);
	const agencyName = agencyNameForShift(
		shift,
		agencyRoster,
		dateIso,
		fallbackAgency,
	);
	const demandRows = shiftDemandBreakdown(shift, agencyName);
	const { demand, supplied, pendingCount } = shiftStaffingSummary(
		shift,
		shiftApplicants,
	);
	const { booked, applicants } = buildShiftStaffRows({
		shift,
		dateIso,
		agencyPRs,
		agencyRoster,
		shiftApplicants,
		agencyName,
	});

	return (
		<div className="iz-outlet-staffing-section">
			<div className="iz-outlet-staffing-block">
				<div className="flex items-center justify-between gap-2">
					<p className="iz-outlet-staffing-heading flex items-center gap-1.5">
						<ClipboardList className="h-3.5 w-3.5 shrink-0 text-[var(--iz-gold-l)]" />
						Demand · {demand} PR needed
					</p>
					<TrafficPill
						level={trafficLevelForRatio(supplied, demand)}
						className="!py-0.5 !text-[9px]"
					>
						{supplied}/{demand} supplied
					</TrafficPill>
				</div>
				<div className="mt-2 space-y-1.5">
					{/* Keyed by the shift when the agency has no name: `row.source` was
					    the key, and an unnamed agency made that the empty string —
					    a key that is neither stable nor unique the moment a second
					    row appears. The slot count is real either way, so the row
					    stays; only the "Agency" pill and the name line drop, rather
					    than drawing an empty pill over an empty line. */}
					{demandRows.map((row) => (
						<div key={row.source || shift.id} className="iz-outlet-demand-row">
							{row.source && (
								<span className="iz-outlet-staff-tag shrink-0 iz-outlet-staff-tag--agency">
									{t.today.agency}
								</span>
							)}
							<div className="min-w-0 flex-1">
								{row.source && (
									<p className="text-xs font-semibold text-[var(--iz-txt)]">
										{row.source}
									</p>
								)}
								<p className="iz-tiny iz-muted2">{row.slots} slots posted</p>
							</div>
						</div>
					))}
				</div>
			</div>

			<div className="iz-outlet-staffing-block">
				<p className="iz-outlet-staffing-heading flex items-center gap-1.5">
					<Users className="h-3.5 w-3.5 shrink-0 text-[var(--iz-gold-l)]" />
					PRs on shift · {booked.length} booked
					{pendingCount > 0
						? fill(t.today.appliedSuffix, { n: pendingCount })
						: ""}
				</p>
				{booked.length === 0 ? (
					<p className="iz-tiny iz-muted mt-2 rounded-lg border border-dashed border-[var(--iz-line)] px-3 py-4 text-center">
						No PRs booked yet —{" "}
						{pendingCount > 0
							? fill(t.today.waitingReview, { n: pendingCount })
							: "open for applications"}
					</p>
				) : (
					<div className="mt-2 space-y-1.5">
						{booked.map((row) => (
							<StaffRow key={row.id} row={row} />
						))}
					</div>
				)}
			</div>

			{applicants.length > 0 && (
				<div className="iz-outlet-staffing-block">
					<p className="iz-outlet-staffing-heading flex items-center gap-1.5">
						<UserCheck className="h-3.5 w-3.5 shrink-0 text-[var(--iz-gold-l)]" />
						Applicants · {applicants.length}
					</p>
					<p className="iz-tiny iz-muted2 mt-0.5">{t.today.applicantsHint}</p>
					<div className="mt-2 space-y-1.5">
						{applicants.map((row) => (
							<StaffRow key={`${row.id}-${row.statusLabel}`} row={row} />
						))}
					</div>
				</div>
			)}
		</div>
	);
}
