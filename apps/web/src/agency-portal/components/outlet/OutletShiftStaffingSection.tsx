import { IzPill, TierBadge, TrafficPill } from "@agency-portal/components/iz/ui";
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
import { useMemo } from "react";
import { useOutletAgencyLinks } from "@agency-portal/hooks/use-outlet-agency-links";
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
	// WHO the venue asked for, with their comcards — the owner: "this demand
	// need show that the pr comcard which pr in demand". Booked is derived
	// from the assignment rows (`shift.prs`), never stored on the request.
	const agencyLinks = useOutletAgencyLinks();
	const agencyNameById = useMemo(
		() => new Map(agencyLinks.links.map((l) => [l.agencyId, l.agencyName])),
		[agencyLinks.links],
	);
	const requestedRows = useMemo(() => {
		const bookedIds = new Set(shift.prs ?? []);
		return (shift.requestedPrs ?? []).map((r) => {
			const managed = agencyPRs.find((p) => p.id === r.userId);
			return {
				userId: r.userId,
				name: managed?.name ?? "PR",
				photo: managed?.comcardImageUrl ?? managed?.avatarPhoto ?? null,
				agencyName: agencyNameById.get(r.agencyId) ?? null,
				booked: bookedIds.has(r.userId),
			};
		});
	}, [shift.requestedPrs, shift.prs, agencyPRs, agencyNameById]);

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
						{fill(t.outletPanels.demandPrNeeded, { n: demand })}
					</p>
					<TrafficPill
						level={trafficLevelForRatio(supplied, demand)}
						className="!py-0.5 !text-[9px]"
					>
						{fill(t.outletPanels.suppliedOfDemand, { supplied, demand })}
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
								<p className="iz-tiny iz-muted2">
									{fill(t.outletPanels.slotsPosted, { n: row.slots })}
								</p>
							</div>
						</div>
					))}
				</div>
			</div>

			{requestedRows.length > 0 && (
				<div className="iz-outlet-staffing-block">
					<p className="iz-outlet-staffing-heading flex items-center gap-1.5">
						<UserCheck className="h-3.5 w-3.5 shrink-0 text-[var(--iz-gold-l)]" />
						{fill(t.today.requestedHeading, { n: requestedRows.length })}
					</p>
					<p className="iz-tiny iz-muted2 mt-0.5">{t.today.requestedHint}</p>
					<div className="mt-2 space-y-1.5">
						{requestedRows.map((row) => (
							<div key={row.userId} className="iz-outlet-demand-row">
								{row.photo ? (
									<img
										src={row.photo}
										alt=""
										className="h-9 w-9 shrink-0 rounded-lg object-cover"
									/>
								) : (
									<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--iz-bg-3)] text-sm font-bold">
										{row.name.charAt(0).toUpperCase()}
									</span>
								)}
								<div className="min-w-0 flex-1">
									<p className="truncate text-xs font-semibold text-[var(--iz-txt)]">
										{row.name}
									</p>
									{row.agencyName && (
										<p className="iz-tiny iz-muted2 truncate">
											{row.agencyName}
										</p>
									)}
								</div>
								<IzPill
									variant={row.booked ? "green" : "amber"}
									className="!py-0.5 !text-[9px]"
								>
									{row.booked ? t.today.bookedPill : t.today.requestedPill}
								</IzPill>
							</div>
						))}
					</div>
				</div>
			)}

			<div className="iz-outlet-staffing-block">
				<p className="iz-outlet-staffing-heading flex items-center gap-1.5">
					<Users className="h-3.5 w-3.5 shrink-0 text-[var(--iz-gold-l)]" />
					{fill(t.outletPanels.prsOnShiftBooked, { n: booked.length })}
					{pendingCount > 0
						? fill(t.today.appliedSuffix, { n: pendingCount })
						: ""}
				</p>
				{booked.length === 0 ? (
					<p className="iz-tiny iz-muted mt-2 rounded-lg border border-dashed border-[var(--iz-line)] px-3 py-4 text-center">
						{fill(t.outletPanels.noPrsBookedYet, {
							detail:
								pendingCount > 0
									? fill(t.today.waitingReview, { n: pendingCount })
									: t.outletPanels.openForApplications,
						})}
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
						{fill(t.outletPanels.applicantsCount, { n: applicants.length })}
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
