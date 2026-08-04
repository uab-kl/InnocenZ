import {
	type AgencyRosterSlot,
	getOutletRule,
	OUTLET_NAMES,
	type OutletCommissionRule,
	type OutletPrTier,
	type OutletTierRateSettings,
} from "@agency-portal/lib/agency-demo";
import {
	addDaysToIso,
	migrateDemoDateIso,
	migrateDemoYmd,
} from "@agency-portal/lib/demo-clock";
import { resolveOutletTierRates } from "@agency-portal/lib/outlet-agency-sync";
import {
	ensureShiftSalesTargets,
	formatShiftEventTypeSummary,
	type OutletWorkspaceSettings,
	outletShiftDemandSupplied,
	SHIFT_DESTINATION_LABELS,
	type ShiftDestination,
	type ShiftEventKind,
} from "@agency-portal/lib/outlet-demo";
import {
	allocateDiversePayTierSplit,
	type PostJobPayTierRow,
	payTierRowsFromSplit,
} from "@agency-portal/lib/post-job-pay-tiers";
import { fmtDateLabelFromIso, fmtDShort } from "@agency-portal/lib/pr-demo";
import {
	type AgencyTiedOffer,
	PR_AGENCY_TIED_OFFERS,
} from "@agency-portal/lib/pr-features";
import { DEFAULT_ROSTER_DATE_ISO } from "@agency-portal/lib/roster-availability";
import type { ShiftRequest } from "@agency-portal/lib/store";

export type OutletShiftSource = "posted" | "tied-offer" | "assignment-pending";

export type AgencyOutletAvailableShift = {
	id: string;
	source: OutletShiftSource;
	outlet: string;
	date: string;
	dateIso: string;
	shift: string;
	event: string;
	demandSlots: number;
	suppliedSlots: number;
	openSlots: number;
	payEstimate: number;
	languages?: string;
	destination?: ShiftDestination;
	eventKind?: ShiftEventKind;
	specialEventType?: string;
	/** Custom label when specialEventType is "other" */
	customSpecialEventName?: string;
	/** Legacy tied-offer flag — prefer eventKind / specialEventType */
	vip?: boolean;
	briefing?: string;
	tierRates: Record<OutletPrTier, OutletTierRateSettings>;
	/** Posted headcount — used when payTierRows is absent */
	quantity: number;
	/** Outlet-configured tier × PR count rows */
	payTierRows?: PostJobPayTierRow[];
	/** Posted shift id when this row mirrors an outlet job board post */
	linkedShiftId?: string;
};

export type AgencyOutletSummary = {
	outlet: string;
	rule: OutletCommissionRule;
	openShiftCount: number;
	totalOpenSlots: number;
	totalDemand: number;
	totalSupplied: number;
	todayDemand: number;
	todaySupplied: number;
	futureDemand: number;
	futureSupplied: number;
	scheduledTonight: number;
	shifts: AgencyOutletAvailableShift[];
};

export type AgencyOutletDayDemand = {
	dateIso: string;
	dateLabel: string;
	demand: number;
	supplied: number;
	openSlots: number;
	eventCount: number;
};

export type AgencyOutletDayShiftGroup = AgencyOutletDayDemand & {
	shifts: AgencyOutletAvailableShift[];
};

export type AgencyOutletFilterState = {
	outlet: string;
	date: string;
	minOpenSlots: string;
	source: "" | OutletShiftSource;
};

export const EMPTY_AGENCY_OUTLET_FILTERS: AgencyOutletFilterState = {
	outlet: "",
	date: "",
	minOpenSlots: "",
	source: "",
};

const SOURCE_LABEL: Record<OutletShiftSource, string> = {
	posted: "Posted shift",
	"tied-offer": "Posted shift",
	"assignment-pending": "Awaiting PR",
};

export function outletShiftSourceLabel(source: OutletShiftSource) {
	return SOURCE_LABEL[source];
}

const DEFAULT_EVENT_HEADCOUNT = 12;

function tiedOfferHeadcount(offer: AgencyTiedOffer) {
	return offer.headcount ?? DEFAULT_EVENT_HEADCOUNT;
}

function tiedOfferSupplied(offer: AgencyTiedOffer) {
	return offer.supplied ?? 0;
}

function rosterEventDemand(slot: AgencyRosterSlot) {
	return slot.agencyAssignment?.eventDemand ?? 1;
}

function rosterEventSupplied(slot: AgencyRosterSlot) {
	return slot.agencyAssignment?.eventSupplied ?? 0;
}

function ymdToIso([y, m, d]: [number, number, number]) {
	return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

type TierRatesContext = {
	commissionRules: OutletCommissionRule[];
	workspace?: Pick<OutletWorkspaceSettings, "outletName" | "tierRates">;
};

function outletDefaultTierRates(outlet: string, ctx: TierRatesContext) {
	return resolveOutletTierRates(outlet, ctx.commissionRules, ctx.workspace);
}

function normalizeShiftTime(time: string) {
	return time.replace(/\s+/g, " ").trim();
}

function isAgencyVisiblePostedShift(shift: ShiftRequest): boolean {
	return (
		shift.status === "open" &&
		(shift.destination === "agency" || shift.destination === "both")
	);
}

/** True when the outlet already has an agency-visible job board post on this calendar day. */
function outletHasAgencyPostedShiftOnDate(
	outlet: string,
	dateIso: string,
	posted: ShiftRequest[],
	todayIso: string,
): boolean {
	return posted.some((s) => {
		if (s.outletName !== outlet || !isAgencyVisiblePostedShift(s)) return false;
		const sIso =
			s.dateIso ?? resolveOutletShiftDateIso(s.date, s.date, todayIso);
		return sIso === dateIso;
	});
}

/** Match tied offers to outlet-posted shifts so tier pay + sales targets stay in sync. */
function findMatchingOutletShift(
	outlet: string,
	dateIso: string,
	shiftTime: string,
	posted: ShiftRequest[],
	todayIso: string,
): ShiftRequest | undefined {
	const normTime = normalizeShiftTime(shiftTime);
	return posted.find((s) => {
		if (s.outletName !== outlet) return false;
		if (s.status === "sealed" || s.status === "draft") return false;
		const sIso =
			s.dateIso ?? resolveOutletShiftDateIso(s.date, s.date, todayIso);
		if (sIso !== dateIso) return false;
		return normalizeShiftTime(s.shift) === normTime;
	});
}

const OUTLET_SHIFT_SOURCE_RANK: Record<OutletShiftSource, number> = {
	posted: 3,
	"tied-offer": 2,
	"assignment-pending": 1,
};

function outletShiftDayKey(
	shift: AgencyOutletAvailableShift,
	todayIso: string,
): string {
	return resolveOutletShiftDateIso(shift.date, shift.dateIso, todayIso);
}

function preferOutletShift(
	a: AgencyOutletAvailableShift,
	b: AgencyOutletAvailableShift,
): AgencyOutletAvailableShift {
	const rankA = OUTLET_SHIFT_SOURCE_RANK[a.source];
	const rankB = OUTLET_SHIFT_SOURCE_RANK[b.source];
	if (rankA !== rankB) return rankA > rankB ? a : b;
	if (a.payEstimate !== b.payEstimate)
		return a.payEstimate > b.payEstimate ? a : b;
	return a.id.localeCompare(b.id) <= 0 ? a : b;
}

/** One agency-visible event per outlet calendar day — prefer outlet job-board posts. */
function dedupeOutletShiftsOnePerDay(
	shifts: AgencyOutletAvailableShift[],
	todayIso: string,
): AgencyOutletAvailableShift[] {
	const byDay = new Map<string, AgencyOutletAvailableShift>();
	for (const shift of shifts) {
		const key = outletShiftDayKey(shift, todayIso);
		const existing = byDay.get(key);
		byDay.set(key, existing ? preferOutletShift(existing, shift) : shift);
	}
	return [...byDay.values()].sort((a, b) =>
		outletShiftDayKey(a, todayIso).localeCompare(
			outletShiftDayKey(b, todayIso),
		),
	);
}

function resolveAgencyPayTierRows(
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	quantity: number,
	existing?: PostJobPayTierRow[],
	idPrefix?: string,
): PostJobPayTierRow[] | undefined {
	if (existing?.length) return existing;
	if (quantity <= 0) return undefined;
	return payTierRowsFromSplit(
		tierRates,
		allocateDiversePayTierSplit(quantity),
		idPrefix,
	);
}

function resolveAgencyShiftTierRates(
	match: ShiftRequest | undefined,
	outlet: string,
	ctx: TierRatesContext,
): Record<OutletPrTier, OutletTierRateSettings> {
	if (match?.tierRates) {
		if (match.id) {
			return ensureShiftSalesTargets({
				id: match.id,
				tierRates: match.tierRates,
			}).tierRates;
		}
		return match.tierRates;
	}
	return outletDefaultTierRates(outlet, ctx);
}

function postedShiftBriefing(
	shift: Pick<ShiftRequest, "dressCode">,
): string | undefined {
	const dressCode = shift.dressCode?.trim();
	return dressCode || undefined;
}

function postedShiftEventFields(
	shift: Pick<
		ShiftRequest,
		"eventKind" | "specialEventType" | "customSpecialEventName"
	>,
): Pick<
	AgencyOutletAvailableShift,
	"eventKind" | "specialEventType" | "customSpecialEventName" | "vip"
> {
	const eventKind = shift.eventKind ?? "normal";
	const specialEventType =
		eventKind === "special" ? shift.specialEventType : undefined;
	const customSpecialEventName =
		eventKind === "special" && specialEventType === "other"
			? shift.customSpecialEventName?.trim() || undefined
			: undefined;
	return {
		eventKind,
		specialEventType,
		customSpecialEventName,
		vip: eventKind === "special" && specialEventType === "vip",
	};
}

function tiedOfferEventFields(
	vip?: boolean,
): Pick<AgencyOutletAvailableShift, "eventKind" | "specialEventType" | "vip"> {
	if (!vip) return { eventKind: "normal", vip: false };
	return { eventKind: "special", specialEventType: "vip", vip: true };
}

function shiftsFromPosted(
	outlet: string,
	posted: ShiftRequest[],
	ctx: TierRatesContext,
	todayIso: string,
): AgencyOutletAvailableShift[] {
	return posted
		.filter(
			(s) =>
				s.outletName === outlet &&
				s.status === "open" &&
				(s.destination === "agency" || s.destination === "both"),
		)
		.map((s) => {
			const { demand, supplied, openSlots } = outletShiftDemandSupplied(s);
			const tierRates = s.tierRates ?? outletDefaultTierRates(outlet, ctx);
			return {
				id: `posted-${s.id}`,
				source: "posted" as const,
				outlet,
				date: s.date,
				dateIso:
					s.dateIso ?? resolveOutletShiftDateIso(s.date, s.date, todayIso),
				shift: s.shift,
				event: s.event,
				demandSlots: demand,
				suppliedSlots: supplied,
				openSlots,
				payEstimate: s.estimatedCost,
				languages: s.languages,
				destination: s.destination,
				tierRates,
				quantity: s.quantity,
				payTierRows: resolveAgencyPayTierRows(
					tierRates,
					s.quantity,
					s.payTierRows,
					s.id,
				),
				briefing: postedShiftBriefing(s),
				...postedShiftEventFields(s),
			};
		})
		.filter((s) => s.openSlots > 0 && isUpcomingOutletShift(s, todayIso));
}

function shiftsFromTied(
	outlet: string,
	tied: AgencyTiedOffer[],
	ctx: TierRatesContext,
	todayIso: string,
	posted: ShiftRequest[],
): AgencyOutletAvailableShift[] {
	return tied
		.filter((o) => o.outlet === outlet)
		.filter((o) => {
			const dateIso = ymdToIso(migrateDemoYmd(o.date));
			return !outletHasAgencyPostedShiftOnDate(
				outlet,
				dateIso,
				posted,
				todayIso,
			);
		})
		.map((o) => {
			const dateYmd = migrateDemoYmd(o.date);
			const dateIso = ymdToIso(dateYmd);
			const demandSlots = tiedOfferHeadcount(o);
			const suppliedSlots = tiedOfferSupplied(o);
			const match = findMatchingOutletShift(
				outlet,
				dateIso,
				o.time,
				posted,
				todayIso,
			);
			const tierRates = resolveAgencyShiftTierRates(match, outlet, ctx);
			const quantity = match?.quantity ?? demandSlots;
			return {
				id: `tied-${o.id}`,
				source: "tied-offer" as const,
				outlet,
				date: fmtDShort(...dateYmd),
				dateIso,
				shift: o.time,
				event: o.event,
				demandSlots,
				suppliedSlots,
				openSlots: Math.max(0, demandSlots - suppliedSlots),
				payEstimate: match?.estimatedCost ?? o.base + o.comm,
				...tiedOfferEventFields(o.vip),
				destination: "agency" as const,
				briefing: o.briefing,
				tierRates,
				quantity,
				payTierRows: resolveAgencyPayTierRows(
					tierRates,
					quantity,
					match?.payTierRows,
					`tied-${o.id}`,
				),
				linkedShiftId: match?.id,
			};
		})
		.filter((shift) => isUpcomingOutletShift(shift, todayIso));
}

function shiftsFromRoster(
	outlet: string,
	roster: AgencyRosterSlot[],
	ctx: TierRatesContext,
	todayIso: string,
): AgencyOutletAvailableShift[] {
	return roster
		.filter((s) => s.outlet === outlet && s.status === "assignment-pending")
		.map((s) => {
			const demandSlots = rosterEventDemand(s);
			const suppliedSlots = rosterEventSupplied(s);
			const tierRates = outletDefaultTierRates(outlet, ctx);
			return {
				id: `roster-${s.id}`,
				source: "assignment-pending" as const,
				outlet,
				date: s.date,
				dateIso: migrateDemoDateIso(s.dateIso),
				shift: s.shift,
				event:
					s.agencyAssignment?.agencyNote?.trim() || "Agency slot · awaiting PR",
				demandSlots,
				suppliedSlots,
				openSlots: Math.max(0, demandSlots - suppliedSlots),
				payEstimate: s.estPayout ?? 350,
				tierRates,
				quantity: demandSlots,
				payTierRows: resolveAgencyPayTierRows(
					tierRates,
					demandSlots,
					undefined,
					`roster-${s.id}`,
				),
			};
		})
		.filter((shift) => isUpcomingOutletShift(shift, todayIso));
}

export function buildAgencyOutletSummaries(input: {
	outlets?: string[];
	shifts: ShiftRequest[];
	roster: AgencyRosterSlot[];
	tiedOffers?: AgencyTiedOffer[];
	todayIso?: string;
	commissionRules?: OutletCommissionRule[];
	outletWorkspace?: Pick<OutletWorkspaceSettings, "outletName" | "tierRates">;
}): AgencyOutletSummary[] {
	const outlets = input.outlets ?? OUTLET_NAMES;
	const tied = input.tiedOffers ?? PR_AGENCY_TIED_OFFERS;
	const todayIso = input.todayIso ?? DEFAULT_ROSTER_DATE_ISO;
	const commissionRules = input.commissionRules ?? [];
	const tierCtx: TierRatesContext = {
		commissionRules,
		workspace: input.outletWorkspace,
	};

	return outlets.map((outlet) => {
		const rule = getOutletRule(
			outlet,
			commissionRules.length ? commissionRules : undefined,
		);
		const shifts = dedupeOutletShiftsOnePerDay(
			[
				...shiftsFromPosted(outlet, input.shifts, tierCtx, todayIso),
				...shiftsFromTied(outlet, tied, tierCtx, todayIso, input.shifts),
				...shiftsFromRoster(outlet, input.roster, tierCtx, todayIso),
			].filter((shift) => isUpcomingOutletShift(shift, todayIso)),
			todayIso,
		);
		const scheduledTonight = input.roster.filter(
			(s) =>
				s.outlet === outlet &&
				s.dateIso === todayIso &&
				s.status !== "unavailable",
		).length;
		const dayDemand = buildOutletDayDemandSummaries({
			outlet,
			posted: input.shifts,
			roster: input.roster,
			tiedOffers: tied,
			todayIso,
		});
		const todayRow = dayDemand.find((day) => day.dateIso === todayIso);
		const futureRows = dayDemand.filter((day) => day.dateIso > todayIso);

		return {
			outlet,
			rule,
			openShiftCount: shifts.length,
			totalOpenSlots: shifts.reduce((sum, s) => sum + s.openSlots, 0),
			totalDemand: shifts.reduce((sum, s) => sum + s.demandSlots, 0),
			totalSupplied: shifts.reduce((sum, s) => sum + s.suppliedSlots, 0),
			todayDemand: todayRow?.demand ?? 0,
			todaySupplied: todayRow?.supplied ?? 0,
			futureDemand: futureRows.reduce((sum, day) => sum + day.demand, 0),
			futureSupplied: futureRows.reduce((sum, day) => sum + day.supplied, 0),
			scheduledTonight,
			shifts,
		};
	});
}

function resolveOutletShiftDateIso(
	date: string,
	dateIso?: string,
	todayIso: string = DEFAULT_ROSTER_DATE_ISO,
): string {
	const raw = dateIso?.trim() || date.trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
	if (raw === "Tonight" || date === "Tonight") return todayIso;
	if (raw === "Tomorrow" || date === "Tomorrow")
		return addDaysToIso(todayIso, 1);

	const parsed =
		raw.match(/(\d{1,2})\s+([A-Za-z]{3})/) ??
		date.match(/(\d{1,2})\s+([A-Za-z]{3})/);
	if (parsed) {
		const day = Number(parsed[1]);
		const monthKey = parsed[2].slice(0, 3).toLowerCase();
		const monthMap: Record<string, number> = {
			jan: 1,
			feb: 2,
			mar: 3,
			apr: 4,
			may: 5,
			jun: 6,
			jul: 7,
			aug: 8,
			sep: 9,
			oct: 10,
			nov: 11,
			dec: 12,
		};
		const month = monthMap[monthKey];
		if (month) {
			const [refY, refM, refD] = todayIso.split("-").map(Number);
			let year = Number(
				raw.match(/\b(20\d{2})\b/)?.[1] ?? todayIso.slice(0, 4),
			);
			const today = new Date(refY, refM - 1, refD);
			const candidate = new Date(year, month - 1, day);
			const diffDays = (today.getTime() - candidate.getTime()) / 86_400_000;
			if (!raw.match(/\b20\d{2}\b/) && diffDays > 45) year += 1;
			else if (!raw.match(/\b20\d{2}\b/) && diffDays < -330) year -= 1;
			return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
		}
	}

	return raw;
}

export { resolveOutletShiftDateIso };

export function formatOutletDayLabel(
	dateIso: string,
	todayIso: string = DEFAULT_ROSTER_DATE_ISO,
): string {
	if (dateIso === todayIso) return "Today";
	if (dateIso === addDaysToIso(todayIso, 1)) return "Tomorrow";
	if (/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return fmtDateLabelFromIso(dateIso);
	return dateIso;
}

function resolveShiftDateIso(shift: AgencyOutletAvailableShift): string {
	return resolveOutletShiftDateIso(shift.date, shift.dateIso);
}

export function isUpcomingOutletShift(
	shift: Pick<AgencyOutletAvailableShift, "date" | "dateIso">,
	todayIso: string = DEFAULT_ROSTER_DATE_ISO,
): boolean {
	const dateIso = resolveOutletShiftDateIso(
		shift.date,
		shift.dateIso,
		todayIso,
	);
	return /^\d{4}-\d{2}-\d{2}$/.test(dateIso) && dateIso >= todayIso;
}

/**
 * Open slots the agency can send an early-released PR to (other outlets, same calendar day only).
 * Includes open + confirmed posted shifts with remaining demand.
 */
export function listAvailableShiftsForEarlyReleaseReassign(input: {
	shifts: ShiftRequest[];
	excludeOutlet: string;
	dateIso?: string;
	todayIso?: string;
	commissionRules?: OutletCommissionRule[];
	outletWorkspace?: Pick<OutletWorkspaceSettings, "outletName" | "tierRates">;
}): AgencyOutletAvailableShift[] {
	const todayIso = input.todayIso ?? DEFAULT_ROSTER_DATE_ISO;
	const dayIso = input.dateIso ?? todayIso;
	const tierCtx: TierRatesContext = {
		commissionRules: input.commissionRules ?? [],
		workspace: input.outletWorkspace,
	};

	const rows: AgencyOutletAvailableShift[] = [];
	for (const outlet of OUTLET_NAMES) {
		if (outlet === input.excludeOutlet) continue;
		for (const s of input.shifts) {
			if (s.outletName !== outlet) continue;
			if (s.status !== "open" && s.status !== "confirmed") continue;
			if (s.destination !== "agency" && s.destination !== "both") continue;
			const { demand, supplied, openSlots } = outletShiftDemandSupplied(s);
			if (openSlots <= 0) continue;
			const dateIso =
				s.dateIso ?? resolveOutletShiftDateIso(s.date, s.date, todayIso);
			if (dateIso !== dayIso) continue;
			const tierRates = s.tierRates ?? outletDefaultTierRates(outlet, tierCtx);
			rows.push({
				id: `posted-${s.id}`,
				source: "posted",
				outlet,
				date: s.date,
				dateIso,
				shift: s.shift,
				event: s.event,
				demandSlots: demand,
				suppliedSlots: supplied,
				openSlots,
				payEstimate: s.estimatedCost,
				languages: s.languages,
				destination: s.destination,
				tierRates,
				quantity: s.quantity,
				payTierRows: resolveAgencyPayTierRows(
					tierRates,
					s.quantity,
					s.payTierRows,
					s.id,
				),
				briefing: postedShiftBriefing(s),
				...postedShiftEventFields(s),
			});
		}
	}

	return rows.sort(
		(a, b) =>
			a.outlet.localeCompare(b.outlet) || a.shift.localeCompare(b.shift),
	);
}

export function buildOutletDayDemandSummaries(input: {
	outlet: string;
	posted: ShiftRequest[];
	roster: AgencyRosterSlot[];
	tiedOffers?: AgencyTiedOffer[];
	todayIso?: string;
}): AgencyOutletDayDemand[] {
	const todayIso = input.todayIso ?? DEFAULT_ROSTER_DATE_ISO;
	const tied = input.tiedOffers ?? PR_AGENCY_TIED_OFFERS;
	const buckets = new Map<
		string,
		{ demand: number; supplied: number; eventCount: number; dateLabel?: string }
	>();

	const bump = (
		dateIso: string,
		dateLabel: string,
		demand: number,
		supplied: number,
		events = 1,
	) => {
		if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso) || dateIso < todayIso) return;
		const cur = buckets.get(dateIso) ?? {
			demand: 0,
			supplied: 0,
			eventCount: 0,
		};
		cur.demand += demand;
		cur.supplied += supplied;
		cur.eventCount += events;
		if (!cur.dateLabel) cur.dateLabel = dateLabel;
		buckets.set(dateIso, cur);
	};

	for (const shift of input.posted) {
		if (shift.outletName !== input.outlet) continue;
		if (shift.destination !== "agency" && shift.destination !== "both")
			continue;
		if (shift.status !== "open" && shift.status !== "confirmed") continue;
		const dateIso = resolveOutletShiftDateIso(
			shift.date,
			shift.dateIso,
			todayIso,
		);
		const dateLabel =
			shift.date === "Tonight" || shift.date === "Tomorrow"
				? shift.date
				: formatOutletDayLabel(dateIso, todayIso);
		const { demand, supplied } = outletShiftDemandSupplied(shift);
		bump(dateIso, dateLabel, demand, supplied);
	}

	for (const offer of tied.filter((o) => o.outlet === input.outlet)) {
		const dateYmd = migrateDemoYmd(offer.date);
		const dateIso = ymdToIso(dateYmd);
		// Outlet post + agency tied offer are the same calendar day — count demand once.
		if (
			outletHasAgencyPostedShiftOnDate(
				input.outlet,
				dateIso,
				input.posted,
				todayIso,
			)
		) {
			continue;
		}
		bump(
			dateIso,
			fmtDShort(...dateYmd),
			tiedOfferHeadcount(offer),
			tiedOfferSupplied(offer),
		);
	}

	for (const slot of input.roster.filter(
		(r) => r.outlet === input.outlet && r.status === "assignment-pending",
	)) {
		bump(
			migrateDemoDateIso(slot.dateIso),
			slot.date,
			rosterEventDemand(slot),
			rosterEventSupplied(slot),
		);
	}

	return [...buckets.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([dateIso, bucket]) => ({
			dateIso,
			dateLabel: bucket.dateLabel ?? formatOutletDayLabel(dateIso, todayIso),
			demand: bucket.demand,
			supplied: bucket.supplied,
			openSlots: Math.max(0, bucket.demand - bucket.supplied),
			eventCount: bucket.eventCount,
		}));
}

export function summarizeOutletDemandTodayFuture(
	dayDemand: AgencyOutletDayDemand[],
	todayIso: string = DEFAULT_ROSTER_DATE_ISO,
): AgencyOutletDayDemand[] {
	const today = dayDemand.find((day) => day.dateIso === todayIso);
	const futureRows = dayDemand.filter((day) => day.dateIso > todayIso);
	const rows: AgencyOutletDayDemand[] = [];

	if (today) {
		rows.push({ ...today, dateLabel: "Today" });
	}

	if (futureRows.length > 0) {
		rows.push({
			dateIso: "future",
			dateLabel: "Future",
			demand: futureRows.reduce((sum, day) => sum + day.demand, 0),
			supplied: futureRows.reduce((sum, day) => sum + day.supplied, 0),
			openSlots: futureRows.reduce((sum, day) => sum + day.openSlots, 0),
			eventCount: futureRows.reduce((sum, day) => sum + day.eventCount, 0),
		});
	}

	return rows;
}

export function groupOutletShiftsByDay(
	shifts: AgencyOutletAvailableShift[],
	todayIso: string = DEFAULT_ROSTER_DATE_ISO,
): AgencyOutletDayShiftGroup[] {
	const groups = new Map<string, AgencyOutletAvailableShift[]>();

	for (const shift of shifts) {
		const dateIso = resolveOutletShiftDateIso(
			shift.date,
			shift.dateIso,
			todayIso,
		);
		if (!isUpcomingOutletShift(shift, todayIso)) continue;
		const list = groups.get(dateIso) ?? [];
		list.push(shift);
		groups.set(dateIso, list);
	}

	return [...groups.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([dateIso, dayShifts]) => ({
			dateIso,
			dateLabel: formatOutletDayLabel(dateIso, todayIso),
			demand: dayShifts.reduce((sum, shift) => sum + shift.demandSlots, 0),
			supplied: dayShifts.reduce((sum, shift) => sum + shift.suppliedSlots, 0),
			openSlots: dayShifts.reduce((sum, shift) => sum + shift.openSlots, 0),
			eventCount: dayShifts.length,
			shifts: dayShifts,
		}));
}

export function groupOutletShiftsTodayFuture(
	shifts: AgencyOutletAvailableShift[],
	todayIso: string = DEFAULT_ROSTER_DATE_ISO,
): AgencyOutletDayShiftGroup[] {
	const byDay = groupOutletShiftsByDay(shifts, todayIso);
	const today = byDay.find((group) => group.dateIso === todayIso);
	const futureDays = byDay.filter((group) => group.dateIso > todayIso);
	const groups: AgencyOutletDayShiftGroup[] = [];

	if (today) {
		groups.push({ ...today, dateLabel: "Today" });
	}

	if (futureDays.length > 0) {
		const futureShifts = futureDays
			.flatMap((group) => group.shifts)
			.sort((a, b) =>
				resolveOutletShiftDateIso(a.date, a.dateIso, todayIso).localeCompare(
					resolveOutletShiftDateIso(b.date, b.dateIso, todayIso),
				),
			);

		groups.push({
			dateIso: "future",
			dateLabel: "Future",
			demand: futureDays.reduce((sum, group) => sum + group.demand, 0),
			supplied: futureDays.reduce((sum, group) => sum + group.supplied, 0),
			openSlots: futureDays.reduce((sum, group) => sum + group.openSlots, 0),
			eventCount: futureShifts.length,
			shifts: futureShifts,
		});
	}

	return groups;
}

export function agencyOutletFiltersActive(f: AgencyOutletFilterState): boolean {
	return Boolean(f.outlet || f.date || f.minOpenSlots || f.source);
}

export function filterAgencyOutletSummaries(
	summaries: AgencyOutletSummary[],
	f: AgencyOutletFilterState,
): AgencyOutletSummary[] {
	const minOpen = f.minOpenSlots ? Number(f.minOpenSlots) : null;

	return summaries
		.map((summary) => {
			let shifts = summary.shifts;
			if (f.date) {
				shifts = shifts.filter((s) => resolveShiftDateIso(s) === f.date);
			}
			if (f.source) {
				shifts = shifts.filter(
					(s) =>
						s.source === f.source ||
						(f.source === "posted" && s.source === "tied-offer"),
				);
			}
			if (minOpen != null && !Number.isNaN(minOpen)) {
				shifts = shifts.filter((s) => s.openSlots >= minOpen);
			}
			return {
				...summary,
				shifts,
				openShiftCount: shifts.length,
				totalOpenSlots: shifts.reduce((n, s) => n + s.openSlots, 0),
				totalDemand: shifts.reduce((n, s) => n + s.demandSlots, 0),
				totalSupplied: shifts.reduce((n, s) => n + s.suppliedSlots, 0),
			};
		})
		.filter((summary) => {
			if (f.outlet && summary.outlet !== f.outlet) return false;
			if (
				(f.date || f.source || minOpen != null) &&
				summary.shifts.length === 0
			)
				return false;
			return true;
		});
}

export function collectOutletShiftDateIsos(
	summaries: AgencyOutletSummary[],
): string[] {
	return [
		...new Set(
			summaries.flatMap((s) =>
				s.shifts.map((shift) => resolveShiftDateIso(shift)),
			),
		),
	]
		.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
		.sort();
}

/** @deprecated Use collectOutletShiftDateIsos */
export function collectOutletShiftDates(
	summaries: AgencyOutletSummary[],
): string[] {
	return collectOutletShiftDateIsos(summaries);
}

export function shiftDestinationLabel(destination?: ShiftDestination) {
	return destination ? SHIFT_DESTINATION_LABELS[destination] : undefined;
}

export function outletShiftEventTypeLabel(
	shift: Pick<
		AgencyOutletAvailableShift,
		"eventKind" | "specialEventType" | "customSpecialEventName" | "vip"
	>,
): string {
	if (shift.eventKind === "special") {
		return formatShiftEventTypeSummary(
			"special",
			shift.specialEventType,
			shift.customSpecialEventName,
		);
	}
	if (shift.vip) return formatShiftEventTypeSummary("special", "vip");
	return formatShiftEventTypeSummary("normal");
}

export function outletShiftIsSpecialEvent(
	shift: Pick<
		AgencyOutletAvailableShift,
		"eventKind" | "specialEventType" | "vip"
	>,
): boolean {
	return shift.eventKind === "special" || Boolean(shift.vip);
}

export function outletShiftStaffingLabel(destination?: ShiftDestination) {
	return destination
		? SHIFT_DESTINATION_LABELS[destination]
		: SHIFT_DESTINATION_LABELS.agency;
}

/** All outlet shifts for calendar month view — includes past sealed events. */
export function outletCalendarShiftRequests(input: {
	shifts: ShiftRequest[];
	outletName: string;
	todayIso?: string;
}): ShiftRequest[] {
	const todayIso = input.todayIso ?? DEFAULT_ROSTER_DATE_ISO;
	return input.shifts
		.filter((s) => s.outletName === input.outletName && s.status !== "draft")
		.sort((a, b) => {
			const isoA = resolveOutletShiftDateIso(a.date, a.dateIso, todayIso);
			const isoB = resolveOutletShiftDateIso(b.date, b.dateIso, todayIso);
			return isoA.localeCompare(isoB) || a.event.localeCompare(b.event);
		});
}

/** Outlet home — same posted shifts as agency Manage Outlet, plus live confirmed shifts */
export function outletHomeShiftRequests(input: {
	shifts: ShiftRequest[];
	outletName: string;
	roster: AgencyRosterSlot[];
	tiedOffers?: AgencyTiedOffer[];
	todayIso?: string;
	commissionRules?: OutletCommissionRule[];
	outletWorkspace?: Pick<OutletWorkspaceSettings, "outletName" | "tierRates">;
}): ShiftRequest[] {
	const todayIso = input.todayIso ?? DEFAULT_ROSTER_DATE_ISO;
	const [summary] = buildAgencyOutletSummaries({
		outlets: [input.outletName],
		shifts: input.shifts,
		roster: input.roster,
		tiedOffers: input.tiedOffers,
		todayIso,
		commissionRules: input.commissionRules,
		outletWorkspace: input.outletWorkspace,
	});
	const agencyPostedIds = new Set(
		(summary?.shifts ?? [])
			.filter((shift) => shift.id.startsWith("posted-"))
			.map((shift) => shift.id.slice("posted-".length)),
	);

	return input.shifts
		.filter((shift) => {
			if (shift.outletName !== input.outletName) return false;
			if (shift.status === "sealed" || shift.status === "draft") return false;
			if (agencyPostedIds.has(shift.id)) return true;
			return (
				shift.status === "confirmed" &&
				isUpcomingOutletShift({ date: shift.date }, todayIso)
			);
		})
		.sort((a, b) => {
			const rank = (date: string) =>
				date === "Tonight" ? 0 : date === "Tomorrow" ? 1 : 2;
			const ra = rank(a.date);
			const rb = rank(b.date);
			if (ra !== rb) return ra - rb;
			const isoA = resolveOutletShiftDateIso(a.date, undefined, todayIso);
			const isoB = resolveOutletShiftDateIso(b.date, undefined, todayIso);
			return isoA.localeCompare(isoB) || a.event.localeCompare(b.event);
		});
}

export type PlanningWeekOutletShiftInput = {
	weekDays: string[];
	shifts: ShiftRequest[];
	roster: AgencyRosterSlot[];
	tiedOffers?: AgencyTiedOffer[];
	todayIso?: string;
	commissionRules?: OutletCommissionRule[];
	outletWorkspace?: Pick<OutletWorkspaceSettings, "outletName" | "tierRates">;
};

/** Outlet-posted / tied offers with open slots for each day in the planning week */
export function buildPlanningWeekOutletShiftMap(
	input: PlanningWeekOutletShiftInput,
): Record<string, AgencyOutletAvailableShift[]> {
	const weekSet = new Set(input.weekDays);
	const todayIso = input.todayIso ?? DEFAULT_ROSTER_DATE_ISO;
	const commissionRules = input.commissionRules ?? [];
	const tierCtx: TierRatesContext = {
		commissionRules,
		workspace: input.outletWorkspace,
	};
	const tied = input.tiedOffers ?? PR_AGENCY_TIED_OFFERS;
	const byDate: Record<string, AgencyOutletAvailableShift[]> =
		Object.fromEntries(input.weekDays.map((day) => [day, []]));

	for (const outlet of OUTLET_NAMES) {
		const posted = shiftsFromPostedForWeek(
			outlet,
			input.shifts,
			tierCtx,
			todayIso,
			weekSet,
		);
		const tiedShifts = shiftsFromTiedForWeek(
			outlet,
			tied,
			tierCtx,
			todayIso,
			weekSet,
			input.shifts,
		);
		for (const shift of [...posted, ...tiedShifts]) {
			if (shift.openSlots <= 0) continue;
			const dateIso = resolveOutletShiftDateIso(
				shift.date,
				shift.dateIso,
				todayIso,
			);
			if (!weekSet.has(dateIso)) continue;
			byDate[dateIso].push(shift);
		}
	}

	for (const day of input.weekDays) {
		byDate[day] = dedupePlanningOutletShifts(byDate[day], todayIso);
		byDate[day].sort(
			(a, b) =>
				a.outlet.localeCompare(b.outlet) || a.shift.localeCompare(b.shift),
		);
	}

	return byDate;
}

function planningShiftDayKey(
	shift: AgencyOutletAvailableShift,
	todayIso: string,
): string {
	const dateIso = resolveOutletShiftDateIso(
		shift.date,
		shift.dateIso,
		todayIso,
	);
	return `${shift.outlet}|${dateIso}`;
}

/** One row per outlet per calendar day — prefer outlet job-board post over legacy tied listing */
function dedupePlanningOutletShifts(
	shifts: AgencyOutletAvailableShift[],
	todayIso: string,
): AgencyOutletAvailableShift[] {
	const byKey = new Map<string, AgencyOutletAvailableShift>();
	for (const shift of shifts) {
		const key = planningShiftDayKey(shift, todayIso);
		const existing = byKey.get(key);
		const kept = existing ? preferOutletShift(existing, shift) : shift;
		byKey.set(
			key,
			kept.source === "posted" ? { ...kept, source: "posted" as const } : kept,
		);
	}
	return [...byKey.values()];
}

function shiftsFromPostedForWeek(
	outlet: string,
	posted: ShiftRequest[],
	ctx: TierRatesContext,
	todayIso: string,
	weekDays: Set<string>,
): AgencyOutletAvailableShift[] {
	return posted
		.filter(
			(s) =>
				s.outletName === outlet &&
				(s.status === "open" || s.status === "confirmed") &&
				(s.destination === "agency" || s.destination === "both"),
		)
		.map((s) => {
			const { demand, supplied, openSlots } = outletShiftDemandSupplied(s);
			const dateIso =
				s.dateIso ?? resolveOutletShiftDateIso(s.date, s.date, todayIso);
			const tierRates = s.tierRates ?? outletDefaultTierRates(outlet, ctx);
			return {
				id: `posted-${s.id}`,
				source: "posted" as const,
				outlet,
				date: s.date,
				dateIso,
				shift: s.shift,
				event: s.event,
				demandSlots: demand,
				suppliedSlots: supplied,
				openSlots,
				payEstimate: s.estimatedCost,
				languages: s.languages,
				destination: s.destination,
				tierRates,
				quantity: s.quantity,
				payTierRows: resolveAgencyPayTierRows(
					tierRates,
					s.quantity,
					s.payTierRows,
					s.id,
				),
				briefing: postedShiftBriefing(s),
				...postedShiftEventFields(s),
			};
		})
		.filter((s) => weekDays.has(s.dateIso));
}

function shiftsFromTiedForWeek(
	outlet: string,
	tied: AgencyTiedOffer[],
	ctx: TierRatesContext,
	todayIso: string,
	weekDays: Set<string>,
	posted: ShiftRequest[],
): AgencyOutletAvailableShift[] {
	return tied
		.filter((o) => o.outlet === outlet)
		.filter((o) => {
			const dateIso = ymdToIso(migrateDemoYmd(o.date));
			return !outletHasAgencyPostedShiftOnDate(
				outlet,
				dateIso,
				posted,
				todayIso,
			);
		})
		.map((o) => {
			const dateYmd = migrateDemoYmd(o.date);
			const dateIso = ymdToIso(dateYmd);
			const demandSlots = tiedOfferHeadcount(o);
			const suppliedSlots = tiedOfferSupplied(o);
			const match = findMatchingOutletShift(
				outlet,
				dateIso,
				o.time,
				posted,
				todayIso,
			);
			const tierRates = resolveAgencyShiftTierRates(match, outlet, ctx);
			const quantity = match?.quantity ?? demandSlots;
			return {
				id: `tied-${o.id}`,
				source: "tied-offer" as const,
				outlet,
				date: fmtDShort(...dateYmd),
				dateIso,
				shift: o.time,
				event: o.event,
				demandSlots,
				suppliedSlots,
				openSlots: Math.max(0, demandSlots - suppliedSlots),
				payEstimate: match?.estimatedCost ?? o.base + o.comm,
				...tiedOfferEventFields(o.vip),
				destination: "agency" as const,
				briefing: o.briefing,
				tierRates,
				quantity,
				payTierRows: resolveAgencyPayTierRows(
					tierRates,
					quantity,
					match?.payTierRows,
					`tied-${o.id}`,
				),
				linkedShiftId: match?.id,
			};
		})
		.filter((s) => weekDays.has(s.dateIso));
}
