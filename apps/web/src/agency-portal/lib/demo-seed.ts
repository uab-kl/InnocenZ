/**
 * Canonical demo snapshot — restored only via manual “Reset all demo data” on welcome.
 */

import {
	type AgencyCollectionInvoice,
	type AgencyManagedPR,
	type AgencyRosterSlot,
	buildDefaultTierRates,
	cloneTierRates,
	DEFAULT_AGENCY_OWNER,
	DEFAULT_FINANCE_HEAD,
	getOutletRule,
	OUTLET_COMMISSION_RULES,
	SCALING_TIER_MULTIPLIERS,
	SEED_AGENCY_COLLECTIONS,
	SEED_AGENCY_PRS,
	SEED_AGENCY_PRS_ALL,
	SEED_AGENCY_ROSTER,
	SEED_PENDING_PRS,
	SEED_RECONCILIATION,
} from "@agency-portal/lib/agency-demo";
import { resolveOutletShiftDateIso } from "@agency-portal/lib/agency-outlet-shifts";
import {
	syncAgencyPayrollReceiptScans,
	syncAgencyPayrollShiftHistory,
} from "@agency-portal/lib/agency-payroll";
import {
	addDaysToIso,
	isoOnWeekday,
	weekdayEventName,
} from "@agency-portal/lib/demo-clock";
import { mergeHistoryDemoLedger } from "@agency-portal/lib/history-demo-sync";
import {
	DEFAULT_OUTLET_FINANCE_HEAD,
	DEFAULT_OUTLET_OPS_HEAD,
	DEFAULT_OUTLET_OWNER,
	DEFAULT_OUTLET_SETTINGS,
	DEFAULT_OUTLET_WORKSPACE,
	DEMO_SHIFT_TIER_SALES_TARGETS,
	patchShiftTierSalesTargets,
	SEED_OUTLET_RATINGS,
	type ShiftApplicant,
} from "@agency-portal/lib/outlet-demo";
import {
	computeShiftLiveSales,
	recomputeAllOutletPnl,
	withShiftFinancialDefaults,
} from "@agency-portal/lib/outlet-financial-sync";
import {
	marketplacePrsFromAgency,
	mergeOutletRequestRosterSlots,
	outletMatches,
} from "@agency-portal/lib/portal-sync";
import {
	allocateDiversePayTierSplit,
	payTierRowsFromSplit,
} from "@agency-portal/lib/post-job-pay-tiers";
import {
	buildSeedPrPortfolio,
	COMCARD,
	demoPayrollWeekBoundsForWeeksAgo,
	fmtDateLabelFromIso,
	getPrProfile,
	LIVE_SEED_PR_PVS,
	LIVE_SEED_RECEIPT_SCANS,
	PORTFOLIO_SLOT_COUNT,
	type PrPaymentVoucher,
	remapSeedPaymentVouchers,
	SEED_PR_AVATAR_IMAGE,
	SEED_PR_PVS,
	SEED_RECEIPT_SCANS,
} from "@agency-portal/lib/pr-demo";
import {
	DEMO_AGENCY_TIED_AT,
	SEED_PR_NOTIFICATIONS,
	SEED_PR_SWAP_REQUESTS,
	SEED_UPCOMING_SHIFTS,
} from "@agency-portal/lib/pr-features";
import { DEFAULT_NOTIFICATION_PREFS } from "@agency-portal/lib/push-notifications";
import {
	DEMO_RECONCILIATION_WEEK,
	recomputeWeeklyReconciliation,
} from "@agency-portal/lib/reconciliation-weekly";
import { DEFAULT_ROSTER_DATE_ISO } from "@agency-portal/lib/roster-availability";
import {
	prepareShiftHistoryForDisplay,
	SEED_SHIFT_HISTORY,
} from "@agency-portal/lib/shift-history";
import { SEED_SPECIAL_SERVICES } from "@agency-portal/lib/special-service-demo";
import type { Booking, PV, ShiftRequest } from "@agency-portal/lib/store";

const DEMO_BOOKINGS: Booking[] = [
	{
		id: "b1",
		outletName: "Velvet 23",
		date: "Tonight",
		shift: "22:00 — 04:00",
		pay: 360,
		status: "offered",
		event: "Hennessy Launch",
		languages: "EN / 中文",
	},
	{
		id: "b2",
		outletName: "Noir Lounge",
		date: "Tomorrow",
		shift: "21:00 — 03:00",
		pay: 320,
		status: "offered",
		event: "Ladies Night",
		languages: "EN / Mandarin",
	},
];

const DEMO_PVS: PV[] = [
	{
		id: "pv1",
		prName: "You",
		outlet: "Velvet 23",
		date: "Last Sat",
		wages: 360,
		drinkCommission: 84,
		tipCommission: 45,
		status: "sent",
		version: 1,
	},
];

/** Extra Velvet invoice so Finance can demo Pay */
const DEMO_COLLECTIONS: AgencyCollectionInvoice[] = [
	...SEED_AGENCY_COLLECTIONS,
	{
		id: "COL-2026-0615",
		outlet: "Velvet 23",
		amount: 2160,
		issueDate: "8 Jun 2026",
		issueTime: "10:00",
		dueDate: "15 Jun 2026",
		status: "PENDING",
		aging: "current",
		linkedPvIds: ["PV-2026-0611-A"],
		lines: [
			{
				label: "Daily wages",
				detail: "Velvet 23 · current cycle",
				amount: 720,
				group: "payroll",
			},
			{
				label: "Commission – Drinks",
				detail: "Floor sales passthrough",
				amount: 1240,
				group: "commissions",
			},
			{
				label: "Platform fee (5%)",
				detail: "InnocenZ cycle fee",
				amount: 200,
				group: "fees",
			},
		],
	},
	{
		id: "COL-DELTA-0701",
		outlet: "Onyx KL",
		amount: 1680,
		issueDate: "1 Jul 2026",
		issueTime: "11:15",
		dueDate: "8 Jul 2026",
		status: "PENDING",
		aging: "current",
		linkedPvIds: [],
		kind: "outlet",
		agencyId: "delta",
		lines: [
			{
				label: "Daily wages",
				detail: "Onyx KL · Sofia + Rina",
				amount: 880,
				group: "payroll",
			},
			{
				label: "Commission – Drinks",
				detail: "Floor sales passthrough",
				amount: 720,
				group: "commissions",
			},
			{
				label: "Platform fee (5%)",
				detail: "InnocenZ cycle fee",
				amount: 80,
				group: "fees",
			},
		],
	},
];

function demoShiftDateLabel(daysFromToday: number): string {
	if (daysFromToday === 0) return "Tonight";
	if (daysFromToday === 1) return "Tomorrow";
	return fmtDateLabelFromIso(
		addDaysToIso(DEFAULT_ROSTER_DATE_ISO, daysFromToday),
	);
}

/** Calendar backfill — ISO date N days before demo today. */
function demoShiftDateDaysAgo(daysAgo: number): {
	date: string;
	dateIso: string;
} {
	const dateIso = addDaysToIso(DEFAULT_ROSTER_DATE_ISO, -daysAgo);
	return { date: fmtDateLabelFromIso(dateIso), dateIso };
}

export const CALENDAR_PAST_SHIFT_IDS = [
	"s18",
	"s19",
	"s20",
	"s21",
	"s22",
	"s23",
] as const;

/** Next occurrence of a weekday (0=Sun … 6=Sat) — keeps event names like "Friday lounge" aligned. */
function demoShiftDateOnWeekday(weekday: number, allowToday = false): string {
	const todayIso = DEFAULT_ROSTER_DATE_ISO;
	const dateIso = isoOnWeekday(todayIso, weekday, allowToday);
	if (dateIso === todayIso) return "Tonight";
	if (dateIso === addDaysToIso(todayIso, 1)) return "Tomorrow";
	return fmtDateLabelFromIso(dateIso);
}

/** Outlet home — Private VIP Hennessy Launch (Velvet 23 tonight). */
export const HENNESSY_LAUNCH_SHIFT_ID = "s1";

/** Atlas-tied Hennessy floor only — Delta PRs live on `buildDeltaRosterSlots`. */
export const HENNESSY_LAUNCH_PR_IDS = [
	"p1",
	"pr-comcard-alice",
	"pr-comcard-ava",
	"pr-comcard-bernice",
	"pr-comcard-grace",
	"pr-comcard-hazel",
] as const;

/** Demo tier demand for Hennessy — includes Tier 4–5 slots to match booked PR training levels. */
export const HENNESSY_DEMO_PAY_TIER_SPLIT: Array<{
	payTierId: import("@agency-portal/lib/post-job-pay-tiers").PostJobPayTierId;
	prCount: number;
}> = [
	{ payTierId: "tier_1", prCount: 7 },
	{ payTierId: "tier_2", prCount: 4 },
	{ payTierId: "tier_3", prCount: 2 },
	{ payTierId: "tier_4", prCount: 2 },
	{ payTierId: "tier_5", prCount: 1 },
];

const AGENCY_PR_NAME_BY_ID = Object.fromEntries(
	SEED_AGENCY_PRS_ALL.map((p) => [p.id, p.name]),
);

/** Re-apply demo staffing on the Hennessy shift after localStorage hydrate. */
export function mergeDemoShiftStaffing(
	shifts: ShiftRequest[],
	seedShifts?: ShiftRequest[],
): ShiftRequest[] {
	const seed = seedShifts?.find((s) => s.id === HENNESSY_LAUNCH_SHIFT_ID);
	const rosterPrIds = [...HENNESSY_LAUNCH_PR_IDS];
	return shifts.map((sh) => {
		if (sh.id !== HENNESSY_LAUNCH_SHIFT_ID) return sh;
		const releasedEarly = [...new Set(sh.releasedEarlyPrIds ?? [])];
		const activePrs = rosterPrIds.filter((id) => !releasedEarly.includes(id));
		return {
			...sh,
			quantity: seed?.quantity ?? sh.quantity,
			payTierRows: seed?.payTierRows ?? sh.payTierRows,
			demandCut: sh.demandCut ?? 0,
			releasedEarlyPrIds: releasedEarly.length ? releasedEarly : undefined,
			releasedEarlyAt: sh.releasedEarlyAt,
			prs: activePrs,
			filled: activePrs.length,
			drinkUnits: seed?.drinkUnits ?? 0,
			drinkUnitCounts: seed?.drinkUnitCounts,
			legacyDrinkSalesRm: seed?.legacyDrinkSalesRm,
			liveSales: seed?.liveSales ?? 0,
			anchorLiveSales: seed?.anchorLiveSales ?? 0,
		};
	});
}

/** Inject past-month calendar examples when missing from persisted demo state. */
export function mergeDemoCalendarPastShifts(
	shifts: ShiftRequest[],
	seedShifts: ShiftRequest[],
): ShiftRequest[] {
	const existing = new Set(shifts.map((s) => s.id));
	const toAdd = seedShifts.filter(
		(s) =>
			(CALENDAR_PAST_SHIFT_IDS as readonly string[]).includes(s.id) &&
			!existing.has(s.id),
	);
	return toAdd.length === 0 ? shifts : [...shifts, ...toAdd];
}

/** Re-apply demo shift dates after localStorage hydrate — keeps weekday event names aligned. */
export function mergeDemoShiftDates(
	shifts: ShiftRequest[],
	seedShifts: ShiftRequest[],
): ShiftRequest[] {
	const seedById = Object.fromEntries(seedShifts.map((s) => [s.id, s]));
	return shifts.map((sh) => {
		const seed = seedById[sh.id];
		if (!seed) return sh;
		const dateIso =
			seed.dateIso ??
			resolveOutletShiftDateIso(
				seed.date,
				seed.dateIso,
				DEFAULT_ROSTER_DATE_ISO,
			);
		return {
			...sh,
			date: seed.date,
			dateIso,
			event: seed.event,
			payTierRows: seed.payTierRows,
		};
	});
}

/** Legacy: assignment-pending → scheduled (agency assign is now immediate). */
export function mergeAutoConfirmAgencyAssignments(
	roster: AgencyRosterSlot[],
): AgencyRosterSlot[] {
	return roster.map((slot) =>
		slot.status === "assignment-pending"
			? { ...slot, status: "scheduled" as const }
			: slot,
	);
}

/** Re-apply assignment-pending roster dates & notes after localStorage hydrate. */
export function mergeDemoRosterAssignmentSlots(
	roster: AgencyRosterSlot[],
	seedRoster: AgencyRosterSlot[] = SEED_AGENCY_ROSTER,
): AgencyRosterSlot[] {
	const seedById = Object.fromEntries(seedRoster.map((s) => [s.id, s]));
	return roster.map((slot) => {
		const seed = seedById[slot.id];
		if (!seed?.agencyAssignment) return slot;
		return {
			...slot,
			dateIso: seed.dateIso,
			date: seed.date,
			agencyAssignment: {
				...slot.agencyAssignment,
				...seed.agencyAssignment,
			},
		};
	});
}

/** Drop stale Hennessy slots for PRs no longer on the Atlas launch list; refresh floor counts. */
export function mergeDemoHennessyRosterFloor(
	roster: AgencyRosterSlot[],
	seedRoster: AgencyRosterSlot[] = buildDemoRoster(),
): AgencyRosterSlot[] {
	const allowed = new Set<string>(HENNESSY_LAUNCH_PR_IDS);
	const seedByPrId = Object.fromEntries(
		seedRoster
			.filter((s) => s.id.startsWith("rs-hennessy-"))
			.map((s) => [s.prId, s]),
	);
	const seedOnDuty = seedRoster.filter(
		(s) => s.status === "on-duty" && !!s.checkedInAt,
	);
	const onDutyById = Object.fromEntries(seedOnDuty.map((s) => [s.id, s]));

	let next = roster
		.filter(
			(slot) =>
				!(slot.id.startsWith("rs-hennessy-") && !allowed.has(slot.prId)),
		)
		.map((slot) => {
			const onDuty = onDutyById[slot.id];
			if (onDuty) {
				const { agencyAssignment: _a, outletSwap: _o, ...base } = slot;
				return {
					...base,
					dateIso: onDuty.dateIso,
					date: onDuty.date,
					outlet: onDuty.outlet,
					shift: onDuty.shift,
					shiftStart: onDuty.shiftStart,
					shiftEnd: onDuty.shiftEnd,
					status: "on-duty" as const,
					checkedInAt: onDuty.checkedInAt,
					floorDrinks: onDuty.floorDrinks,
					floorTips: onDuty.floorTips,
					estPayout: onDuty.estPayout,
				};
			}
			const seed = seedByPrId[slot.prId];
			if (!seed || !slot.id.startsWith("rs-hennessy-")) return slot;
			return {
				...slot,
				prName: seed.prName,
				agencyId: seed.agencyId ?? "atlas",
				floorDrinks: seed.floorDrinks,
				floorTips: seed.floorTips,
				estPayout: seed.estPayout,
			};
		});

	for (const seed of seedOnDuty) {
		if (!next.some((s) => s.id === seed.id)) {
			next = [...next, { ...seed }];
		}
	}

	return next;
}

function velvetTonightRosterSlot(
	id: string,
	prId: string,
	floorDrinks = 0,
	floorTips = 0,
	estPayout = 360,
): AgencyRosterSlot {
	const date = fmtDateLabelFromIso(DEFAULT_ROSTER_DATE_ISO);
	return {
		id,
		prId,
		prName: AGENCY_PR_NAME_BY_ID[prId] ?? "PR",
		outlet: "Velvet 23",
		date,
		dateIso: DEFAULT_ROSTER_DATE_ISO,
		shift: "22:00 — 04:00",
		shiftStart: "22:00",
		shiftEnd: "04:00",
		status: "scheduled",
		floorDrinks,
		floorTips,
		estPayout,
		agencyId: "atlas",
	};
}

function buildDemoShifts(): ShiftRequest[] {
	const wsTierRates = DEFAULT_OUTLET_WORKSPACE.tierRates;
	const velvetTierRates = (
		targets: Partial<
			Record<import("@agency-portal/lib/agency-demo").OutletPrTier, number>
		>,
	) => patchShiftTierSalesTargets(cloneTierRates(wsTierRates), targets);
	const tierRatesForOutlet = (
		outletName: string,
		targets: Partial<
			Record<import("@agency-portal/lib/agency-demo").OutletPrTier, number>
		>,
	) => {
		const rule = getOutletRule(outletName, OUTLET_COMMISSION_RULES);
		const base = {
			wagePerHour: rule.wagePerHour,
			drinkPct: rule.drinkPct,
			tipPct: rule.tipPct,
			tablePct: rule.tablePct,
			otAfterHours: rule.otAfterHours,
		};
		return patchShiftTierSalesTargets(buildDefaultTierRates(base), targets);
	};
	const tonightTiers = velvetTierRates(DEMO_SHIFT_TIER_SALES_TARGETS.s1);
	const vipEventDrinks = DEFAULT_OUTLET_WORKSPACE.drinkMenu.map((d) => ({
		...d,
		priceRm:
			d.id === "hennessy"
				? 450
				: d.id === "champagne"
					? 550
					: Math.round(d.priceRm * 1.25),
	}));
	const ladiesTiers = velvetTierRates(DEMO_SHIFT_TIER_SALES_TARGETS.s2);
	const corporateTiers = velvetTierRates(DEMO_SHIFT_TIER_SALES_TARGETS.s3);
	const mermateThuTiers = tierRatesForOutlet(
		"Mermate",
		DEMO_SHIFT_TIER_SALES_TARGETS.s4,
	);
	const mermateRelaunchTiers = tierRatesForOutlet(
		"Mermate",
		DEMO_SHIFT_TIER_SALES_TARGETS.s5,
	);
	const mermateVipTiers = tierRatesForOutlet(
		"Mermate",
		DEMO_SHIFT_TIER_SALES_TARGETS.s6,
	);
	const bearLaunchTiers = tierRatesForOutlet(
		"Bear Lounge",
		DEMO_SHIFT_TIER_SALES_TARGETS.s7,
	);
	const bearSoulTiers = tierRatesForOutlet(
		"Bear Lounge",
		DEMO_SHIFT_TIER_SALES_TARGETS.s8,
	);
	const onyxThuTiers = tierRatesForOutlet(
		"Onyx KL",
		DEMO_SHIFT_TIER_SALES_TARGETS.s9,
	);
	const onyxRooftopTiers = tierRatesForOutlet(
		"Onyx KL",
		DEMO_SHIFT_TIER_SALES_TARGETS.s10,
	);
	const urbanPartyTiers = tierRatesForOutlet(
		"Urban Soul",
		DEMO_SHIFT_TIER_SALES_TARGETS.s11,
	);
	const urbanSatTiers = tierRatesForOutlet(
		"Urban Soul",
		DEMO_SHIFT_TIER_SALES_TARGETS.s12,
	);
	const raw: ShiftRequest[] = [
		withShiftFinancialDefaults({
			id: "s1",
			outletName: "Velvet 23",
			date: "Tonight",
			shift: "22:00 — 04:00",
			quantity: 16,
			filled: HENNESSY_LAUNCH_PR_IDS.length,
			languages: "English / Mandarin",
			event: "Private VIP — Hennessy Launch",
			eventKind: "special",
			specialEventType: "vip",
			eventDrinkMenu: vipEventDrinks,
			preferredRating: 4.5,
			preferredStarTiers: [4, 5],
			estimatedCost: 6000,
			liveSales: 0,
			drinkUnits: 0,
			status: "confirmed",
			prs: [...HENNESSY_LAUNCH_PR_IDS],
			payPerHour: tonightTiers["Tier I"].wagePerHour,
			tierRates: tonightTiers,
			dressCode: "Black elegant",
			destination: "both",
		}),
		withShiftFinancialDefaults({
			id: "s2",
			outletName: "Velvet 23",
			date: "Tomorrow",
			shift: "21:00 — 03:00",
			quantity: 18,
			filled: 10,
			languages: "English / Mandarin",
			event: "Ladies Night — Champagne",
			preferredRating: 4,
			preferredStarTiers: [4, 5],
			estimatedCost: 4320,
			liveSales: 0,
			status: "open",
			prs: [
				"p1",
				"pr-comcard-alice",
				"pr-comcard-charlotte",
				"pr-comcard-angie",
			],
			payPerHour: ladiesTiers["Tier I"].wagePerHour,
			tierRates: ladiesTiers,
			dressCode: "Cocktail attire",
			destination: "both",
		}),
		withShiftFinancialDefaults({
			id: "s3",
			outletName: "Velvet 23",
			date: "Fri 6 Jun",
			shift: "20:00 — 02:00",
			quantity: 14,
			filled: 8,
			languages: "English",
			event: "Corporate Table Buyout",
			preferredRating: 4,
			estimatedCost: 2520,
			liveSales: 0,
			status: "open",
			prs: ["pr-comcard-alice", "pr-comcard-charlotte"],
			payPerHour: corporateTiers["Tier I"].wagePerHour,
			tierRates: corporateTiers,
			dressCode: "Smart casual",
			destination: "agency",
		}),
		withShiftFinancialDefaults({
			id: "s4",
			outletName: "Mermate",
			date: demoShiftDateOnWeekday(4, true),
			shift: "21:00 — 02:00",
			quantity: 14,
			filled: 9,
			languages: "English / Mandarin",
			event: "Thursday lounge",
			preferredRating: 4,
			estimatedCost: 2520,
			liveSales: 0,
			status: "open",
			prs: ["pr-comcard-sarah"],
			payPerHour: mermateThuTiers["Tier I"].wagePerHour,
			tierRates: mermateThuTiers,
			dressCode: "Smart casual",
			destination: "both",
		}),
		withShiftFinancialDefaults({
			id: "s5",
			outletName: "Mermate",
			date: demoShiftDateOnWeekday(5),
			shift: "22:00 — 04:00",
			quantity: 16,
			filled: 10,
			languages: "English / Mandarin",
			event: weekdayEventName(5, "lounge relaunch"),
			preferredRating: 4.2,
			preferredStarTiers: [3, 4, 5],
			estimatedCost: 2880,
			liveSales: 0,
			status: "open",
			prs: ["pr-comcard-victoria", "pr-comcard-moon"],
			payPerHour: mermateRelaunchTiers["Tier I"].wagePerHour,
			tierRates: mermateRelaunchTiers,
			dressCode: "Cocktail attire",
			destination: "agency",
		}),
		withShiftFinancialDefaults({
			id: "s6",
			outletName: "Mermate",
			date: demoShiftDateOnWeekday(6),
			shift: "21:00 — 02:00",
			quantity: 12,
			filled: 6,
			languages: "English",
			event: weekdayEventName(6, "VIP tables"),
			preferredRating: 4.5,
			preferredStarTiers: [4, 5],
			estimatedCost: 2160,
			liveSales: 0,
			status: "open",
			prs: [],
			payPerHour: mermateVipTiers["Tier I"].wagePerHour,
			tierRates: mermateVipTiers,
			dressCode: "Black elegant",
			destination: "both",
		}),
		withShiftFinancialDefaults({
			id: "s7",
			outletName: "Bear Lounge",
			date: demoShiftDateOnWeekday(4, true),
			shift: "22:00 — 04:00",
			quantity: 12,
			filled: 7,
			languages: "English / Cantonese",
			event: "Thursday floor coverage",
			preferredRating: 4,
			estimatedCost: 2400,
			liveSales: 0,
			status: "open",
			prs: ["pr-comcard-charlotte"],
			payPerHour: bearLaunchTiers["Tier I"].wagePerHour,
			tierRates: bearLaunchTiers,
			dressCode: "Smart casual",
			destination: "both",
		}),
		withShiftFinancialDefaults({
			id: "s8",
			outletName: "Bear Lounge",
			date: demoShiftDateLabel(1),
			shift: "22:30 — 04:30",
			quantity: 16,
			filled: 9,
			languages: "English",
			event: "Launch night floor",
			preferredRating: 4.3,
			preferredStarTiers: [4, 5],
			estimatedCost: 3200,
			liveSales: 0,
			status: "open",
			prs: ["pr-comcard-angie", "pr-comcard-victoria"],
			payPerHour: bearLaunchTiers["Tier I"].wagePerHour,
			tierRates: bearLaunchTiers,
			dressCode: "Black dress code",
			destination: "both",
		}),
		withShiftFinancialDefaults({
			id: "s8b",
			outletName: "Bear Lounge",
			date: demoShiftDateOnWeekday(6),
			shift: "20:00 — 01:00",
			quantity: 12,
			filled: 5,
			languages: "English",
			event: "Saturday soul session",
			preferredRating: 4,
			estimatedCost: 1800,
			liveSales: 0,
			status: "open",
			prs: [],
			payPerHour: bearSoulTiers["Tier I"].wagePerHour,
			tierRates: bearSoulTiers,
			dressCode: "Smart casual",
			destination: "agency",
		}),
		withShiftFinancialDefaults({
			id: "s9",
			outletName: "Onyx KL",
			date: demoShiftDateOnWeekday(4, true),
			shift: "21:00 — 03:00",
			quantity: 14,
			filled: 8,
			languages: "English / Cantonese",
			event: "Thursday premium lounge",
			preferredRating: 4.2,
			estimatedCost: 3080,
			liveSales: 0,
			status: "open",
			prs: ["pr-comcard-moon"],
			payPerHour: onyxThuTiers["Tier I"].wagePerHour,
			tierRates: onyxThuTiers,
			dressCode: "Smart casual",
			destination: "both",
		}),
		withShiftFinancialDefaults({
			id: "s10",
			outletName: "Onyx KL",
			date: demoShiftDateOnWeekday(5),
			shift: "20:00 — 02:00",
			quantity: 16,
			filled: 11,
			languages: "English / Mandarin",
			event: "Friday rooftop",
			preferredRating: 4.5,
			preferredStarTiers: [4, 5],
			estimatedCost: 3520,
			liveSales: 0,
			status: "open",
			prs: ["p1", "pr-comcard-alice"],
			payPerHour: onyxRooftopTiers["Tier I"].wagePerHour,
			tierRates: onyxRooftopTiers,
			dressCode: "Cocktail attire",
			destination: "agency",
		}),
		withShiftFinancialDefaults({
			id: "s11",
			outletName: "Urban Soul",
			date: demoShiftDateOnWeekday(5),
			shift: "20:00 — 01:00",
			quantity: 18,
			filled: 12,
			languages: "English / Mandarin",
			event: "Friday party",
			preferredRating: 4,
			preferredStarTiers: [3, 4, 5],
			estimatedCost: 4320,
			liveSales: 0,
			status: "open",
			prs: ["pr-comcard-alice", "pr-comcard-charlotte", "pr-comcard-angie"],
			payPerHour: urbanPartyTiers["Tier I"].wagePerHour,
			tierRates: urbanPartyTiers,
			dressCode: "Heels required",
			destination: "both",
		}),
		withShiftFinancialDefaults({
			id: "s12",
			outletName: "Urban Soul",
			date: demoShiftDateOnWeekday(6),
			shift: "21:00 — 03:00",
			quantity: 14,
			filled: 7,
			languages: "English",
			event: "Saturday regular",
			preferredRating: 4,
			estimatedCost: 2520,
			liveSales: 0,
			status: "open",
			prs: ["pr-comcard-sarah"],
			payPerHour: urbanSatTiers["Tier I"].wagePerHour,
			tierRates: urbanSatTiers,
			dressCode: "Smart casual",
			destination: "agency",
		}),
		withShiftFinancialDefaults({
			id: "s13",
			outletName: "Velvet 23",
			date: demoShiftDateOnWeekday(5),
			shift: "22:00 — 04:00",
			quantity: 15,
			filled: 9,
			languages: "English / Mandarin",
			event: "Friday lounge",
			preferredRating: 4.2,
			estimatedCost: 2700,
			liveSales: 0,
			status: "open",
			prs: ["p1"],
			payPerHour: tonightTiers["Tier I"].wagePerHour,
			tierRates: tonightTiers,
			dressCode: "Smart casual",
			destination: "both",
		}),
		withShiftFinancialDefaults({
			id: "s14",
			outletName: "Onyx KL",
			date: demoShiftDateOnWeekday(1),
			shift: "21:00 — 03:00",
			quantity: 14,
			filled: 6,
			languages: "English / Cantonese",
			event: "Monday premium night",
			preferredRating: 4.3,
			estimatedCost: 3080,
			liveSales: 0,
			status: "open",
			prs: [],
			payPerHour: onyxThuTiers["Tier I"].wagePerHour,
			tierRates: onyxThuTiers,
			dressCode: "Smart casual",
			destination: "agency",
		}),
		withShiftFinancialDefaults({
			id: "s15",
			outletName: "Bear Lounge",
			date: demoShiftDateOnWeekday(2),
			shift: "22:30 — 04:30",
			quantity: 12,
			filled: 4,
			languages: "English",
			event: "Tuesday soul night",
			preferredRating: 4,
			estimatedCost: 2400,
			liveSales: 0,
			status: "open",
			prs: [],
			payPerHour: bearSoulTiers["Tier I"].wagePerHour,
			tierRates: bearSoulTiers,
			dressCode: "Black dress code",
			destination: "both",
		}),
		withShiftFinancialDefaults({
			id: "s17",
			outletName: "Velvet 23",
			date: demoShiftDateOnWeekday(6),
			shift: "21:00 — 03:00",
			quantity: 16,
			filled: 10,
			languages: "English / Mandarin",
			event: "Saturday champagne",
			preferredRating: 4.9,
			preferredStarTiers: [4, 5],
			estimatedCost: 3520,
			liveSales: 0,
			status: "open",
			prs: [],
			payPerHour: tonightTiers["Tier I"].wagePerHour,
			tierRates: tonightTiers,
			dressCode: "Black dress code",
			destination: "agency",
		}),
		withShiftFinancialDefaults({
			id: "s16",
			outletName: "Mermate",
			date: demoShiftDateOnWeekday(3),
			shift: "21:00 — 02:00",
			quantity: 13,
			filled: 5,
			languages: "English / Mandarin",
			event: weekdayEventName(3, "lounge tables"),
			preferredRating: 4.1,
			estimatedCost: 2340,
			liveSales: 0,
			status: "open",
			prs: [],
			payPerHour: mermateThuTiers["Tier I"].wagePerHour,
			tierRates: mermateThuTiers,
			dressCode: "Cocktail attire",
			destination: "agency",
		}),
		...(
			[
				{
					id: "s18",
					daysAgo: 3,
					event: "Friday lounge",
					shift: "22:00 — 04:00",
					quantity: 14,
					prs: [
						"p1",
						"pr-comcard-alice",
						"pr-comcard-angie",
						"pr-comcard-charlotte",
						"pr-comcard-grace",
					],
					tierRates: tonightTiers,
				},
				{
					id: "s19",
					daysAgo: 8,
					event: "Sunday brunch floor",
					shift: "14:00 — 20:00",
					quantity: 10,
					prs: [
						"pr-comcard-ava",
						"pr-comcard-hazel",
						"pr-comcard-charlotte",
						"pr-comcard-grace",
					],
					tierRates: ladiesTiers,
				},
				{
					id: "s20",
					daysAgo: 12,
					event: "Wednesday VIP tables",
					shift: "21:00 — 03:00",
					quantity: 12,
					prs: ["pr-comcard-alice", "pr-comcard-bernice", "pr-comcard-angie"],
					tierRates: corporateTiers,
					eventKind: "special" as const,
					specialEventType: "vip" as const,
				},
				{
					id: "s21",
					daysAgo: 17,
					event: "Friday party night",
					shift: "21:00 — 03:00",
					quantity: 16,
					prs: [
						"p1",
						"pr-comcard-alice",
						"pr-comcard-angie",
						"pr-comcard-ava",
						"pr-comcard-bernice",
						"pr-comcard-charlotte",
					],
					tierRates: ladiesTiers,
				},
				{
					id: "s22",
					daysAgo: 22,
					event: "Sunday closing",
					shift: "20:00 — 02:00",
					quantity: 12,
					prs: [
						"pr-comcard-sarah",
						"pr-comcard-victoria",
						"pr-comcard-moon",
						"pr-comcard-grace",
					],
					tierRates: tonightTiers,
				},
				{
					id: "s23",
					daysAgo: 28,
					event: "Tuesday lounge",
					shift: "21:00 — 02:00",
					quantity: 10,
					prs: ["pr-comcard-charlotte", "pr-comcard-hazel", "pr-comcard-ava"],
					tierRates: corporateTiers,
				},
			] as const
		).map((row) => {
			const { date, dateIso } = demoShiftDateDaysAgo(row.daysAgo);
			return withShiftFinancialDefaults({
				id: row.id,
				outletName: "Velvet 23",
				date,
				dateIso,
				shift: row.shift,
				quantity: row.quantity,
				filled: row.prs.length,
				languages: "English / Mandarin",
				event: row.event,
				eventKind: "eventKind" in row ? row.eventKind : "normal",
				specialEventType:
					"specialEventType" in row ? row.specialEventType : undefined,
				preferredRating: 4.2,
				estimatedCost: row.quantity * 180,
				liveSales: 0,
				status: "sealed",
				prs: [...row.prs],
				payPerHour: row.tierRates["Tier I"].wagePerHour,
				tierRates: row.tierRates,
				dressCode: "Smart casual",
				destination: "both",
			});
		}),
	];
	return raw.map((s) => {
		const tierRates = s.tierRates ?? velvetTierRates({});
		return {
			...s,
			payTierRows:
				s.id === HENNESSY_LAUNCH_SHIFT_ID
					? payTierRowsFromSplit(tierRates, HENNESSY_DEMO_PAY_TIER_SPLIT, s.id)
					: payTierRowsFromSplit(
							tierRates,
							allocateDiversePayTierSplit(s.quantity),
							s.id,
						),
			filled: s.prs?.length ?? 0,
			liveSales:
				(s.drinkUnits ?? 0) > 0 || s.drinkUnitCounts
					? computeShiftLiveSales(s)
					: 0,
			dateIso:
				s.dateIso ??
				resolveOutletShiftDateIso(s.date, s.dateIso, DEFAULT_ROSTER_DATE_ISO),
		};
	});
}

function cloneRosterSlot(slot: AgencyRosterSlot): AgencyRosterSlot {
	return {
		...slot,
		lateFlag: undefined,
		noShowFlag: undefined,
		outletSwap: slot.outletSwap ? { ...slot.outletSwap } : undefined,
		agencyAssignment: slot.agencyAssignment
			? { ...slot.agencyAssignment }
			: undefined,
	};
}

function cloneAgencyPr(pr: AgencyManagedPR): AgencyManagedPR {
	return { ...pr, detached: false };
}

function clonePaymentVoucher(pv: PrPaymentVoucher): PrPaymentVoucher {
	return {
		...pv,
		rows: pv.rows.map((r) => ({ ...r })),
		overrideAudit: undefined,
	};
}

const DEMO_APPLICANTS: ShiftApplicant[] = [
	{
		id: "app-s2-p5",
		shiftId: "s2",
		prId: "pr-comcard-victoria",
		prName: "Victoria",
		rating: 4.6,
		status: "pending",
		source: "outlet_request",
	},
	{
		id: "app-s2-p6",
		shiftId: "s2",
		prId: "pr-comcard-moon",
		prName: "Moon",
		rating: 4.4,
		status: "pending",
		source: "outlet_request",
	},
	{
		id: "app-s2-p7",
		shiftId: "s2",
		prId: "pr-comcard-sarah",
		prName: "Sarah",
		rating: 4.2,
		status: "pending",
		source: "outlet_request",
	},
	{
		id: "app-s13-p1",
		shiftId: "s13",
		prId: "pr-comcard-charlotte",
		prName: "Charlotte",
		rating: 4.5,
		status: "pending",
		source: "outlet_request",
	},
	{
		id: "app-s13-p2",
		shiftId: "s13",
		prId: "pr-comcard-angie",
		prName: "Angie",
		rating: 4.3,
		status: "pending",
		source: "outlet_request",
	},
	{
		id: "app-s13-p3",
		shiftId: "s13",
		prId: "pr-comcard-moon",
		prName: "Moon",
		rating: 4.4,
		status: "pending",
		source: "outlet_request",
	},
	{
		id: "app-s17-p1",
		shiftId: "s17",
		prId: "pr-comcard-sarah",
		prName: "Sarah",
		rating: 4.2,
		status: "pending",
		source: "outlet_request",
	},
	{
		id: "app-s17-p2",
		shiftId: "s17",
		prId: "pr-comcard-victoria",
		prName: "Victoria",
		rating: 4.6,
		status: "pending",
		source: "outlet_request",
	},
	{
		id: "app-s17-p3",
		shiftId: "s17",
		prId: "pr-comcard-charlotte",
		prName: "Charlotte",
		rating: 4.5,
		status: "pending",
		source: "outlet_request",
	},
	{
		id: "app-s17-p4",
		shiftId: "s17",
		prId: "pr-comcard-alice",
		prName: "Alice",
		rating: 4.8,
		status: "pending",
		source: "outlet_request",
	},
];

function buildDemoRoster(): AgencyRosterSlot[] {
	const patched = SEED_AGENCY_ROSTER.map(cloneRosterSlot).map((slot) => {
		// Prototype Live GPS: three outlets with on-duty PRs (Onyx + Bear Lounge + Mermate).
		if (slot.id === "rs3") {
			const { outletSwap: _swap, ...rest } = slot;
			return {
				...rest,
				status: "on-duty" as const,
				checkedInAt: "21:45",
				floorDrinks: 9,
				floorTips: 35,
				estPayout: 523,
			};
		}
		if (slot.id === "rs5") {
			return {
				...slot,
				dateIso: DEFAULT_ROSTER_DATE_ISO,
				date: fmtDateLabelFromIso(DEFAULT_ROSTER_DATE_ISO),
				status: "on-duty" as const,
				checkedInAt: "22:10",
				floorDrinks: 4,
				floorTips: 20,
				estPayout: 780,
			};
		}
		if (slot.id === "rs7") {
			const { agencyAssignment: _assignment, ...rest } = slot;
			return {
				...rest,
				outlet: "Mermate",
				dateIso: DEFAULT_ROSTER_DATE_ISO,
				date: fmtDateLabelFromIso(DEFAULT_ROSTER_DATE_ISO),
				shift: "22:00 — 04:00",
				shiftStart: "22:00",
				shiftEnd: "04:00",
				status: "on-duty" as const,
				checkedInAt: "22:05",
				floorDrinks: 6,
				floorTips: 28,
				estPayout: 520,
			};
		}
		return slot;
	});
	const hennessyPrIds = new Set<string>(HENNESSY_LAUNCH_PR_IDS);
	const withoutHennessyDupes = patched.filter(
		(slot) =>
			!(
				slot.dateIso === DEFAULT_ROSTER_DATE_ISO &&
				outletMatches(slot.outlet, "Velvet 23") &&
				hennessyPrIds.has(slot.prId)
			),
	);
	const velvetTonight: AgencyRosterSlot[] = HENNESSY_LAUNCH_PR_IDS.map(
		(prId, index) => velvetTonightRosterSlot(`rs-hennessy-${index + 1}`, prId),
	);
	return [...withoutHennessyDupes, ...velvetTonight];
}

/** Fresh weekly reconciliation — both sides pending so Owner/Finance can confirm on Sunday */
function buildDemoReconciliation(
	shiftHistory: import("@agency-portal/lib/shift-history-utils").ShiftHistoryRow[],
) {
	return recomputeWeeklyReconciliation({
		shiftHistory,
		pvs: SEED_PR_PVS,
		weekStartIso: DEMO_RECONCILIATION_WEEK.weekStartIso,
		weekEndIso: DEMO_RECONCILIATION_WEEK.weekEndIso,
		dateLabel: DEMO_RECONCILIATION_WEEK.dateLabel,
		agencyConfirmed: false,
		outletConfirmed: false,
	});
}

import {
	defaultPrShiftSessionForRole,
	type PrShiftSessionState,
} from "@agency-portal/lib/pr-session";

/** PR portal fields included in the full demo snapshot. */
export function buildPrDemoReset(
	agencyRoster: AgencyRosterSlot[] = buildDemoRoster(),
) {
	const prSessionByRole: Record<"pr_tied", PrShiftSessionState> = {
		pr_tied: defaultPrShiftSessionForRole("pr_tied", { agencyRoster }),
	};

	const historyLedger = mergeHistoryDemoLedger({
		shiftHistory: SEED_SHIFT_HISTORY,
		scans: [...LIVE_SEED_RECEIPT_SCANS],
		pvs: remapSeedPaymentVouchers(SEED_PR_PVS).map(clonePaymentVoucher),
		profile: getPrProfile("pr_tied"),
	});
	const agencyPRs = SEED_AGENCY_PRS.map(cloneAgencyPr);
	const payrollScans = syncAgencyPayrollReceiptScans(
		historyLedger.scans,
		historyLedger.pvs,
		agencyPRs,
	);

	return {
		prSessionByRole,
		shiftAccepted: false,
		pendingApproval: false,
		acceptedShiftIndex: null as number | null,
		checkedIn: false,
		checkedOut: false,
		drinks: 0,
		tables: 0,
		prActiveShift: null,
		prPaymentVouchers: historyLedger.pvs,
		prReceiptScans: payrollScans,
		prComcard: { ...COMCARD },
		prPortfolio: buildSeedPrPortfolio(),
		prLanguages: ["English", "Mandarin", "Cantonese"],
		prDisplayName: null as string | null,
		prIcName: null as string | null,
		prMobile: null as string | null,
		prEmail: null as string | null,
		prAvatarPhoto: SEED_PR_AVATAR_IMAGE,
		prPayrollAgencyId: null as string | null,
		/** Agencies this PR is linked to (demo PR is under Atlas + Delta). */
		prAgencies: ["atlas", "delta"] as string[],
		prNotifications: [...SEED_PR_NOTIFICATIONS],
		prDeclinedOfferIds: [] as string[],
		prMarketplaceApplication: null,
		prUpcomingShifts: [...SEED_UPCOMING_SHIFTS],
		prSwapRequests: SEED_PR_SWAP_REQUESTS.map((s) => ({ ...s })),
		prAgencyTiedAt: DEMO_AGENCY_TIED_AT,
		prCheckInMeta: {},
		prLeaveRequest: null,
		opsNotifications: [],
		sosIncidents: [],
		notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS },
	};
}

/** Delta Agency's own scheduled roster (peer-agency demo — distinct outlets/PRs). */
function buildDeltaRosterSlots(): AgencyRosterSlot[] {
	const date = fmtDateLabelFromIso(DEFAULT_ROSTER_DATE_ISO);
	const common = {
		date,
		dateIso: DEFAULT_ROSTER_DATE_ISO,
		status: "scheduled" as const,
		floorDrinks: 0,
		floorTips: 0,
		agencyId: "delta",
	};
	return [
		{
			id: "rs-delta-1",
			prId: "delta-p1",
			prName: "Sofia",
			// Delta also staffs Velvet 23 tonight — shows a Delta PR on the outlet's floor.
			outlet: "Velvet 23",
			shift: "22:00 — 04:00",
			shiftStart: "22:00",
			shiftEnd: "04:00",
			estPayout: 420,
			...common,
		},
		{
			id: "rs-delta-2",
			prId: "delta-p2",
			prName: "Rina",
			outlet: "Bear Lounge",
			shift: "21:00 — 03:00",
			shiftStart: "21:00",
			shiftEnd: "03:00",
			estPayout: 460,
			...common,
		},
	];
}

/**
 * Delta Agency's own payment vouchers (peer-agency demo). Kept OUT of the Atlas
 * payroll ledger / history sync — appended straight onto the store's PV list so they
 * only surface in Delta's Payroll (owned-PR scoping) and never generate Atlas rows.
 * One SIGNED (To pay), one SENT (pending PR review), one PAID (History → Paid PVs).
 */
function buildDeltaPvs(): PrPaymentVoucher[] {
	const lastWeek = demoPayrollWeekBoundsForWeeksAgo(0);
	const lastLastWeek = demoPayrollWeekBoundsForWeeksAgo(1);
	const financeHeadName = "Nadia Rahman";
	const pvRows = (date: string, outlet: string) => [
		{
			i: 1,
			date,
			day: "Sat",
			outlet,
			desc: "Daily Wages",
			qty: 1,
			amt: 400,
			ref: "Sealed",
		},
		{
			i: 2,
			date,
			day: "Sat",
			outlet,
			desc: "Drink Commission",
			qty: 1,
			amt: 120,
			ref: "Sealed",
		},
	];
	return [
		{
			id: "PV-DELTA-0001",
			prName: "Sofia",
			prIc: "970218-10-5623",
			outlet: "Velvet 23",
			cycle: lastLastWeek.cycle,
			issued: fmtDateLabelFromIso(lastLastWeek.weekEndIso),
			due: fmtDateLabelFromIso(lastLastWeek.weekEndIso),
			weekStartIso: lastLastWeek.weekStartIso,
			weekEndIso: lastLastWeek.weekEndIso,
			rows: pvRows(fmtDateLabelFromIso(lastLastWeek.weekStartIso), "Velvet 23"),
			subtotal: 520,
			deduct: 20,
			net: 500,
			status: "SIGNED",
			financeHeadName,
			financeHeadSignedAt: `${fmtDateLabelFromIso(lastLastWeek.weekEndIso)} · 10:02`,
			prSignedAt: `${fmtDateLabelFromIso(lastLastWeek.weekEndIso)} · 18:40`,
		},
		{
			id: "PV-DELTA-0002",
			prName: "Rina",
			prIc: "960705-08-4412",
			outlet: "Bear Lounge",
			cycle: lastWeek.cycle,
			issued: fmtDateLabelFromIso(lastWeek.weekEndIso),
			due: fmtDateLabelFromIso(lastWeek.weekEndIso),
			weekStartIso: lastWeek.weekStartIso,
			weekEndIso: lastWeek.weekEndIso,
			rows: pvRows(fmtDateLabelFromIso(lastWeek.weekStartIso), "Bear Lounge"),
			subtotal: 520,
			deduct: 20,
			net: 500,
			status: "SENT",
			financeHeadName,
			financeHeadSignedAt: `${fmtDateLabelFromIso(lastWeek.weekEndIso)} · 09:30`,
		},
		{
			id: "PV-DELTA-0003",
			prName: "Mei",
			prIc: "980921-14-3390",
			outlet: "Mermate",
			cycle: lastLastWeek.cycle,
			issued: fmtDateLabelFromIso(lastLastWeek.weekEndIso),
			due: fmtDateLabelFromIso(lastLastWeek.weekEndIso),
			weekStartIso: lastLastWeek.weekStartIso,
			weekEndIso: lastLastWeek.weekEndIso,
			rows: pvRows(fmtDateLabelFromIso(lastLastWeek.weekStartIso), "Mermate"),
			subtotal: 520,
			deduct: 20,
			net: 500,
			status: "PAID",
			financeHeadName,
			financeHeadSignedAt: `${fmtDateLabelFromIso(lastLastWeek.weekEndIso)} · 10:15`,
			prSignedAt: `${fmtDateLabelFromIso(lastLastWeek.weekEndIso)} · 19:05`,
			paidAt: `${fmtDateLabelFromIso(lastWeek.weekStartIso)} · 11:20`,
			bankRef: "DELTA-TRX-88231",
		},
	];
}

export function buildDemoStoreReset() {
	const shifts = buildDemoShifts();
	const agencyRoster = [
		...mergeOutletRequestRosterSlots(
			buildDemoRoster(),
			shifts,
			DEMO_APPLICANTS,
		),
		...buildDeltaRosterSlots(),
	];
	const outletPnl = recomputeAllOutletPnl(shifts, undefined, agencyRoster);
	const agencyPRs = SEED_AGENCY_PRS_ALL.map(cloneAgencyPr);
	const prDemo = buildPrDemoReset(agencyRoster);
	const shiftHistory = prepareShiftHistoryForDisplay(
		syncAgencyPayrollShiftHistory(
			SEED_SHIFT_HISTORY.map((row) => ({ ...row })),
			prDemo.prPaymentVouchers,
			agencyPRs,
		),
	);

	return {
		shifts,
		outletPnl,
		outletPnlSyncAt: 0,
		outletMoneyEditCount: 0,
		agencyRoster,
		agencyPRs,
		prs: marketplacePrsFromAgency(SEED_AGENCY_PRS.map(cloneAgencyPr)),
		shiftHistory,
		shiftApplicants: [...DEMO_APPLICANTS],
		ratings: SEED_OUTLET_RATINGS.map((r) => ({ ...r })),
		agencyReconciliation: buildDemoReconciliation(shiftHistory),
		agencyCollections: DEMO_COLLECTIONS.map((c) => ({ ...c })),
		agencyOwner: { ...DEFAULT_AGENCY_OWNER },
		agencyFinanceHead: { ...DEFAULT_FINANCE_HEAD },
		outletCommissionRules: OUTLET_COMMISSION_RULES.map((r) => ({ ...r })),
		scalingTierMultipliers: { ...SCALING_TIER_MULTIPLIERS },
		bookings: [...DEMO_BOOKINGS],
		pvs: [...DEMO_PVS],
		walletBalance: 1240,
		outletWorkspace: { ...DEFAULT_OUTLET_WORKSPACE },
		outletSettings: { ...DEFAULT_OUTLET_SETTINGS },
		outletOwner: { ...DEFAULT_OUTLET_OWNER },
		outletFinanceHead: { ...DEFAULT_OUTLET_FINANCE_HEAD },
		outletOpsHead: { ...DEFAULT_OUTLET_OPS_HEAD },
		paymentCardLast4: "4242",
		postSealRatePrompt: null,
		pendingPRs: SEED_PENDING_PRS.map((p) => ({ ...p })),
		pendingAgencyLinks: [
			{
				id: "pal-alice-delta",
				prId: "pr-comcard-alice",
				prName: "Alice",
				agencyId: "delta",
				agencyName: "Delta Agency",
				status: "pending" as const,
				requestedAt: "13 Jul 2026 · 12:40",
			},
		],
		pendingCutlostRequests: [],
		specialServiceOrders: SEED_SPECIAL_SERVICES.map((r) => ({ ...r })),
		...prDemo,
		// Append Delta's own PVs AFTER the Atlas ledger spread so they reach the store's PV
		// list (for Delta's owned-PR scoping) without feeding the Atlas payroll/history sync.
		prPaymentVouchers: [...prDemo.prPaymentVouchers, ...buildDeltaPvs()],
	};
}

/**
 * Blank portal snapshot — the same data slices as buildDemoStoreReset() but
 * empty. Used for REAL backend logins so the ported agency/outlet portals
 * render their normal pages with no rows and zeroed KPIs. Session identity
 * (role / sub-role / user) is set separately at login and is intentionally NOT
 * reset here. Object slices keep their DEFAULT_* shapes so components that read
 * nested fields don't crash; array/number slices are emptied.
 *
 * This map holds only the slices whose blank value is not simply "empty": the
 * object slices that must keep a DEFAULT_* shape, and the two derived slices
 * that have to be recomputed from empty inputs. Every other demo slice is
 * blanked generically in buildBlankPortalReset() below.
 */
function explicitBlankSlices() {
	return {
		shifts: [],
		// Empty seed rows -> no outlet PnL rows. (Passing `undefined` here would
		// fall back to the seeded outlet list, leaking demo outlets with RM 0.)
		outletPnl: recomputeAllOutletPnl([], [], []),
		outletPnlSyncAt: 0,
		outletMoneyEditCount: 0,
		agencyRoster: [],
		agencyPRs: [],
		prs: [],
		shiftHistory: [],
		shiftApplicants: [],
		ratings: [],
		// Empty history + empty PVs -> no reconciliation rows (buildDemoReconciliation
		// would inject SEED_PR_PVS; recompute directly with empty inputs instead).
		agencyReconciliation: recomputeWeeklyReconciliation({
			shiftHistory: [],
			pvs: [],
			weekStartIso: DEMO_RECONCILIATION_WEEK.weekStartIso,
			weekEndIso: DEMO_RECONCILIATION_WEEK.weekEndIso,
			dateLabel: DEMO_RECONCILIATION_WEEK.dateLabel,
			agencyConfirmed: false,
			outletConfirmed: false,
		}),
		agencyCollections: [],
		agencyOwner: { ...DEFAULT_AGENCY_OWNER },
		agencyFinanceHead: { ...DEFAULT_FINANCE_HEAD },

		// ---- PR-portal slices ------------------------------------------------
		// These are the web PR demo's own state. A real agency or outlet session
		// reads none of them, which is exactly why they sat unblanked for so long:
		// the leak was invisible from the screens anyone was looking at.
		//
		// ⚠️ `acceptedShiftIndex` MUST be listed here rather than left to the
		// generic rule. It is `number | null`, and the generic rule blanks numbers
		// to 0 — but 0 is a VALID index meaning "the first shift was accepted",
		// not "none". The empty value of an index is null, and a rule that maps
		// every number to 0 cannot know that.
		acceptedShiftIndex: null,
		// Nullable session objects: null is their genuine empty.
		prActiveShift: null,
		postSealRatePrompt: null,
		prMarketplaceApplication: null,
		prLeaveRequest: null,
		// A dictionary and an all-optional bag: `{}` is complete, not a guess.
		prSessionByRole: {},
		prCheckInMeta: {},
		// Non-nullable shape with a real default of its own.
		notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS },
		// ⚠️ `prComcard` is deliberately NOT blanked here, and stays named in the
		// warning. The obvious candidate — `DEFAULT_COMCARD` in `comcard-demo` —
		// is typed `ComcardDemoStyle`: a comcard's STYLING, not a comcard. Using
		// it would have put a value of the wrong shape into the slice on the
		// strength of the constant's name reading correctly. Blanking this needs
		// a real empty `PrComcard`, which does not exist yet.

		outletCommissionRules: [],
		scalingTierMultipliers: { ...SCALING_TIER_MULTIPLIERS },
		bookings: [],
		pvs: [],
		walletBalance: 0,
		outletWorkspace: { ...DEFAULT_OUTLET_WORKSPACE },
		outletSettings: { ...DEFAULT_OUTLET_SETTINGS },
		outletOwner: { ...DEFAULT_OUTLET_OWNER },
		outletFinanceHead: { ...DEFAULT_OUTLET_FINANCE_HEAD },
		outletOpsHead: { ...DEFAULT_OUTLET_OPS_HEAD },
		pendingPRs: [],
		pendingAgencyLinks: [],
		pendingCutlostRequests: [],
		specialServiceOrders: [],
		prPaymentVouchers: [],
	};
}

export function buildBlankPortalReset() {
	const blank = explicitBlankSlices() as Record<string, unknown>;

	// Blank every remaining demo slice by reading buildDemoStoreReset()'s own
	// keys, so a demo slice added later is blank-by-default for real accounts.
	// The previous hand-maintained list had to be updated by hand and silently
	// wasn't: `prSwapRequests` stayed seeded, so a real agency saw demo PRs in
	// the roster's swap-request cards. The persist merge re-seeds these slices on
	// every reload, which is why such a leak comes and goes rather than failing
	// outright.
	const unblankable: string[] = [];
	for (const [key, value] of Object.entries(buildDemoStoreReset())) {
		if (key in blank) continue;
		if (Array.isArray(value)) blank[key] = [];
		else if (typeof value === "number") blank[key] = 0;
		// Primitives have an unambiguous empty, so they no longer need naming one
		// by one. This alone cleared 12 of the 21 slices the warning used to list.
		else if (typeof value === "string") blank[key] = "";
		else if (typeof value === "boolean") blank[key] = false;
		// `typeof null === "object"`, so a slice whose demo value is ALREADY null
		// was being reported as unblankable when null is exactly its blank.
		else if (value === null) blank[key] = null;
		// Anything else needs a DEFAULT_* shape we cannot invent — emptying it
		// blind risks crashing components that read nested fields, so report it
		// instead of guessing and add it to explicitBlankSlices() above.
		else unblankable.push(key);
	}

	if (unblankable.length > 0 && import.meta.env?.DEV) {
		console.warn(
			"[buildBlankPortalReset] demo slice(s) with no blank value, real sessions will keep the demo data: " +
				unblankable.join(", "),
		);
	}

	return blank as ReturnType<typeof explicitBlankSlices>;
}
