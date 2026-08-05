/** Outlet portal demo config — workspace rates, tags, dress codes */

import {
	buildDefaultTierRates,
	cloneTierRates,
	defaultHappyHourDrinkPct,
	estimateShiftLaborCost,
	getOutletRule,
	getTierWageFromRates,
	migrateTierRatesHappyHourDrinks,
	normalizeTierRates,
	normalizeWorkspaceTierRates,
	OUTLET_BASE_TIER,
	OUTLET_PR_TIERS,
	OUTLET_SERVANT_TIER,
	type OutletPrTier,
	type OutletTierRateSettings,
	repairTierRatesDailyWageSemantics,
	snapTierWage,
	tierHappyHourDrinkPct,
} from "@agency-portal/lib/agency-demo";
import {
	DEFAULT_PER_DRINK_RM,
	DEFAULT_PER_TABLE_RM,
	DEFAULT_PER_TIP_RM,
} from "@agency-portal/lib/outlet-financial-defaults";
import { outletMatches } from "@agency-portal/lib/portal-sync";
import {
	COMMISSION_ONLY_DEFAULT_DRINK_PCT,
	COMMISSION_ONLY_DEFAULT_TARGET_SALES_RM,
	COMMISSION_ONLY_DEFAULT_TIP_PCT,
	type CommissionOnlyRateSettings,
	defaultCommissionOnlyRateSettings,
	estimatePayTierRowsLaborCost,
	isCommissionOnlyPayTier,
	outletTierForPostJobPayTier,
	type PostJobPayTierId,
	type PostJobPayTierRow,
	postJobPayTierIdForOutletTier,
	resolveEffectiveShiftPayTierRows,
	resolveShiftPayTierRows,
} from "@agency-portal/lib/post-job-pay-tiers";
import {
	DEFAULT_PENALTY_RULES,
	normalizePenaltyRules,
	type OutletPenaltyRules,
	type PrPayClass,
	prPayClass,
} from "@agency-portal/lib/pr-penalties";

export type ShiftDestination = "agency" | "marketplace" | "both";

export const SHIFT_DESTINATION_LABELS: Record<ShiftDestination, string> = {
	agency: "Linked agency only",
	marketplace: "Marketplace",
	both: "Agency + Marketplace",
};

export const DRESS_CODE_OPTIONS = [
	"Black elegant",
	"Cocktail attire",
	"Brand uniform",
	"Smart casual",
	"Formal gown",
] as const;

export const DRESS_CODE_OTHER_ID = "Other";

export function isOtherDressCode(code: string | undefined): boolean {
	return code === DRESS_CODE_OTHER_ID;
}

export function formatDressCodeLabel(
	dressCode: string,
	customDressCode?: string,
): string {
	if (isOtherDressCode(dressCode)) {
		const name = customDressCode?.trim();
		return name || DRESS_CODE_OTHER_ID;
	}
	return dressCode;
}

export function resolveDressCode(
	dressCode: string,
	customDressCode?: string,
): string {
	if (isOtherDressCode(dressCode)) {
		return customDressCode?.trim() || DRESS_CODE_OTHER_ID;
	}
	return dressCode;
}

export type ShiftEventKind = "normal" | "special";

export const SHIFT_EVENT_KIND_LABELS: Record<ShiftEventKind, string> = {
	normal: "Normal event",
	special: "Special event",
};

/** Sub-types when posting a special-event shift */
export const SHIFT_SPECIAL_EVENT_OTHER_ID = "other";

export const SHIFT_SPECIAL_EVENT_OPTIONS = [
	{ id: "vip", label: "VIP" },
	{ id: "launch", label: "Product launch" },
	{ id: "private_table", label: "Private table buyout" },
	{ id: "brand_activation", label: "Brand activation" },
	{ id: "corporate", label: "Corporate" },
	{ id: "other", label: "Other" },
] as const;

export type ShiftSpecialEventType =
	(typeof SHIFT_SPECIAL_EVENT_OPTIONS)[number]["id"];

export function isOtherSpecialEvent(type: string | undefined): boolean {
	return type === SHIFT_SPECIAL_EVENT_OTHER_ID;
}

export function shiftSpecialEventLabel(
	type: string | undefined,
	customName?: string,
): string {
	if (isOtherSpecialEvent(type)) {
		const name = customName?.trim();
		return name || "Other";
	}
	return (
		SHIFT_SPECIAL_EVENT_OPTIONS.find((o) => o.id === type)?.label ?? type ?? ""
	);
}

export function formatShiftEventTypeSummary(
	eventKind: ShiftEventKind,
	specialEventType?: string,
	customSpecialEventName?: string,
): string {
	if (eventKind === "normal") return SHIFT_EVENT_KIND_LABELS.normal;
	const sub = shiftSpecialEventLabel(specialEventType, customSpecialEventName);
	return sub
		? `${SHIFT_EVENT_KIND_LABELS.special} · ${sub}`
		: SHIFT_EVENT_KIND_LABELS.special;
}

export function formatOutletPriceRm(amount: number): string {
	return Math.round(amount).toLocaleString("en-MY");
}

export function formatShiftDrinkPricingSummary(
	shift: { eventKind?: ShiftEventKind; eventDrinkMenu?: OutletDrinkPrice[] },
	workspaceMenu: OutletDrinkPrice[] = [],
): string {
	if (shift.eventKind !== "special") {
		const menu =
			workspaceMenu.length > 0 ? workspaceMenu : DEFAULT_OUTLET_DRINK_MENU;
		const range = drinkMenuPriceRange(menu);
		return `Workspace · RM ${formatOutletPriceRm(range.min)}–${formatOutletPriceRm(range.max)}`;
	}
	const menu = effectiveShiftDrinkMenu(shift, workspaceMenu);
	const range = drinkMenuPriceRange(menu);
	return menu.length > 0
		? `Event-specific · RM ${formatOutletPriceRm(range.min)}–${formatOutletPriceRm(range.max)}`
		: "Event-specific";
}

export type ShiftDrinkMenuLine = {
	name: string;
	priceRm: number;
	changed: boolean;
};

/** Per-drink lines for event detail — flags prices that differ from workspace */
export function shiftDrinkMenuDetailLines(
	shift: { eventKind?: ShiftEventKind; eventDrinkMenu?: OutletDrinkPrice[] },
	workspaceMenu: OutletDrinkPrice[] = [],
): ShiftDrinkMenuLine[] {
	const menu = sortOutletDrinkMenuByPrice(
		effectiveShiftDrinkMenu(shift, workspaceMenu),
	);
	const workspaceById = Object.fromEntries(
		(workspaceMenu.length > 0 ? workspaceMenu : DEFAULT_OUTLET_DRINK_MENU).map(
			(d) => [d.id, d.priceRm],
		),
	);
	return menu.map((d) => ({
		name: d.name,
		priceRm: d.priceRm,
		changed:
			shift.eventKind === "special" &&
			shift.eventDrinkMenu != null &&
			workspaceById[d.id] !== d.priceRm,
	}));
}

export const PR_RATING_TAGS = [
	"Punctual",
	"Friendly",
	"Professional",
	"Great upsell",
	"Team player",
	"Needs coaching",
] as const;

export const PR_RATING_NOTE_PLACEHOLDERS: Record<1 | 2 | 3 | 4 | 5, string> = {
	1: "Serious issue — late, attitude, guest complaint, or floor impact…",
	2: "Below standard — drinks, upsell, dress code, or table engagement…",
	3: "Acceptable shift — one coaching note for next booking…",
	4: "Good shift — what would make this a 5 next time?",
	5: "Standout moment — VIP upsell, bottle push, teamwork, or vibe…",
};

export type OutletSubmittedRating = {
	id: string;
	pr: string;
	stars: number;
	note: string;
	date: string;
	tags?: string[];
};

type OutletRatingSeed = Omit<OutletSubmittedRating, "id" | "pr">;

const OUTLET_RATING_BY_PR: Record<string, OutletRatingSeed> = {
	Victoria: {
		stars: 5,
		note: "Owned the VIP lounge — two booth upgrades and guests stayed past 2am.",
		tags: ["Great upsell", "Professional"],
		date: "3 Jun 2026",
	},
	Vicky: {
		stars: 4,
		note: "Hennessy anchor — guests ask for her section on busy Saturdays.",
		tags: ["Professional", "Team player"],
		date: "6 Jun 2026",
	},
	Alice: {
		stars: 3,
		note: "Reliable champagne closer — could open tables faster at peak.",
		tags: ["Great upsell", "Friendly"],
		date: "29 Jun 2026",
	},
	Moon: {
		stars: 2,
		note: "Stepped into a short-staffed zone — drinks count still below floor average.",
		tags: ["Team player"],
		date: "4 Jul 2026",
	},
	Angie: {
		stars: 1,
		note: "High energy early, but two tables were left unattended during rush.",
		tags: ["Needs coaching"],
		date: "2 Jul 2026",
	},
	Charlotte: {
		stars: 2,
		note: "Late check-in and slow to warm the floor — review before next booking.",
		tags: ["Needs coaching"],
		date: "27 Jun 2026",
	},
	Bernice: {
		stars: 5,
		note: "Dom Perignon upsell on a full house — zero service complaints.",
		tags: ["Great upsell", "Professional"],
		date: "26 Jun 2026",
	},
	Ava: {
		stars: 4,
		note: "Steady floor coverage — premium spirits pitch could be sharper.",
		tags: ["Professional", "Punctual"],
		date: "28 Jun 2026",
	},
	Yvon: {
		stars: 3,
		note: "Warm with walk-ins — on-time and polite, tips slightly soft.",
		tags: ["Punctual", "Friendly"],
		date: "1 Jul 2026",
	},
	Sarah: {
		stars: 5,
		note: "Closed the night strong — three bottle upgrades on her tables.",
		tags: ["Great upsell"],
		date: "22 Jun 2026",
	},
	Veron: {
		stars: 4,
		note: "Regulars stayed longer at her section — upsell on top-shelf next time.",
		tags: ["Friendly"],
		date: "24 Jun 2026",
	},
	Hazel: {
		stars: 3,
		note: "Consistent on quieter shifts — pairs well with senior PRs.",
		tags: ["Team player", "Punctual"],
		date: "25 Jun 2026",
	},
	KarYan: {
		stars: 5,
		note: "Mandarin guest rapport landed a walk-in VIP booth.",
		tags: ["Great upsell", "Professional"],
		date: "20 Jun 2026",
	},
	Gin: {
		stars: 4,
		note: "Covered an absent colleague — drinks just under the shift target.",
		tags: ["Team player"],
		date: "18 Jun 2026",
	},
	Grace: {
		stars: 3,
		note: "Hit minimums on a slow night — coach on table engagement.",
		tags: ["Needs coaching"],
		date: "30 Jun 2026",
	},
	Zoe: {
		stars: 2,
		note: "Met shift requirements — needs a louder presence during peak hour.",
		tags: ["Needs coaching"],
		date: "23 Jun 2026",
	},
	Winnie: {
		stars: 1,
		note: "Punctual and polite — drinks target missed on a busier floor.",
		tags: ["Punctual"],
		date: "21 Jun 2026",
	},
	"Wei Qi": {
		stars: 5,
		note: "Champagne package pitch converted twice — guests praised her service.",
		tags: ["Great upsell", "Friendly"],
		date: "19 Jun 2026",
	},
	"Xiao Bao": {
		stars: 4,
		note: "Still finding floor rhythm — polite with guests, upsell improving.",
		tags: ["Friendly"],
		date: "17 Jun 2026",
	},
	Jes: {
		stars: 3,
		note: "On time but left two sections unattended during the 11pm rush.",
		tags: ["Needs coaching"],
		date: "16 Jun 2026",
	},
};

const OUTLET_RATING_FALLBACK: OutletRatingSeed[] = [
	{
		stars: 4,
		note: "Good shift at Velvet 23 — steady drinks and professional on the floor.",
		tags: ["Professional"],
		date: "15 Jun 2026",
	},
	{
		stars: 3,
		note: "Acceptable shift — one coaching note logged for next booking.",
		tags: ["Needs coaching"],
		date: "14 Jun 2026",
	},
];

/** One outlet rating per agency PR — used on History cards and shift-log detail. */
export function buildSeedOutletRatings(
	prNames: string[],
): OutletSubmittedRating[] {
	return prNames.map((name, index) => {
		const seed =
			OUTLET_RATING_BY_PR[name] ??
			OUTLET_RATING_FALLBACK[index % OUTLET_RATING_FALLBACK.length]!;
		return {
			id: `r-demo-${index + 1}`,
			pr: name,
			...seed,
		};
	});
}

/** Default demo ratings for full agency roster. */
export const SEED_OUTLET_RATINGS: OutletSubmittedRating[] =
	buildSeedOutletRatings([
		"Vicky",
		"Alice",
		"Angie",
		"Ava",
		"Bernice",
		"Charlotte",
		"Gin",
		"Grace",
		"Hazel",
		"Jes",
		"KarYan",
		"Moon",
		"Sarah",
		"Veron",
		"Victoria",
		"Wei Qi",
		"Winnie",
		"Xiao Bao",
		"Yvon",
		"Zoe",
	]);

/** Which of the two workspace price lists an item belongs to. */
export type OutletDrinkCategory = "drink" | "service";

export interface OutletDrinkPrice {
	id: string;
	name: string;
	priceRm: number;
	/** Omitted rows are treated as 'service' (the list's original meaning). */
	category?: OutletDrinkCategory;
}

/** Category for a menu row, defaulting legacy/undefined rows to 'service'. */
export function outletDrinkCategory(d: OutletDrinkPrice): OutletDrinkCategory {
	return d.category === "drink" ? "drink" : "service";
}

export const DEFAULT_OUTLET_DRINK_MENU: OutletDrinkPrice[] = [
	{ id: "tips", name: "Tips", priceRm: DEFAULT_PER_TIP_RM, category: "service" },
	{
		id: "booking-com",
		name: "Booking commission",
		priceRm: DEFAULT_PER_TABLE_RM,
		category: "service",
	},
	{ id: "cosmo", name: "Cosmo", priceRm: 150, category: "drink" },
	{
		id: "heradura-anejo-ultra",
		name: "Heradura anejo ultra",
		priceRm: 150,
		category: "drink",
	},
	{
		id: "laddies-drink",
		name: "Laddies drink",
		priceRm: 150,
		category: "drink",
	},
	{ id: "dom-perignon", name: "Dom perignon", priceRm: 200, category: "drink" },
	{ id: "donjulio", name: "Donjulio", priceRm: 200, category: "drink" },
	{ id: "havoc", name: "Havoc", priceRm: 1000, category: "service" },
];

/** Seeded rows that belong to Service Entitlement and must always be present. */
const SEEDED_SERVICE_MENU_IDS = ["booking-com", "tips"] as const;

/** Workspace page anchor — Service Entitlement section */
export const OUTLET_SERVICE_ENTITLEMENT_SECTION_ID = "service-entitlement";

/** Outlet home — PR tonight staffing grid */
export const OUTLET_PR_TONIGHT_SECTION_ID = "pr-tonight";

/** Outlet home — reduce cutlost actions (below shift card on Today) */
export const OUTLET_REDUCE_CUTLOST_SECTION_ID = "reduce-cutlost";

/** Outlet home — PR live sales earnings table */
export const OUTLET_LIVE_SALES_SECTION_ID = "live-sales";

export const OUTLET_OPEN_LIVE_SALES_EVENT = "outlet:open-live-sales";

/** Outlet home — labor cost report (below shift card on Today) */
export const OUTLET_LABOR_COST_SECTION_ID = "labor-cost-report";

export const OUTLET_OPEN_LABOR_COST_EVENT = "outlet:open-labor-cost";

export function scrollToOutletLiveSales() {
	window.dispatchEvent(new Event(OUTLET_OPEN_LIVE_SALES_EVENT));
	document
		.getElementById(OUTLET_LIVE_SALES_SECTION_ID)
		?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function scrollToOutletLaborCostReport() {
	window.dispatchEvent(new Event(OUTLET_OPEN_LABOR_COST_EVENT));
	document
		.getElementById(OUTLET_LABOR_COST_SECTION_ID)
		?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const LEGACY_DEFAULT_DRINK_IDS = new Set([
	"beer",
	"wine",
	"whisky",
	"champagne",
	"hennessy",
]);

export function isLegacyDefaultDrinkMenu(menu: OutletDrinkPrice[]): boolean {
	if (menu.length !== 5) return false;
	return menu.every((d) => LEGACY_DEFAULT_DRINK_IDS.has(d.id));
}

export function averageDrinkPrice(menu: OutletDrinkPrice[]): number {
	if (menu.length === 0) return DEFAULT_PER_DRINK_RM;
	const total = menu.reduce((sum, d) => sum + d.priceRm, 0);
	return Math.round(total / menu.length);
}

/** Median menu price excluding booking fees and bottle outliers — for floor previews. */
export function typicalDrinkPrice(menu: OutletDrinkPrice[]): number {
	if (menu.length === 0) return DEFAULT_PER_DRINK_RM;
	const prices = menu
		.map((d) => d.priceRm)
		.filter((p) => p >= 110 && p <= 800)
		.sort((a, b) => a - b);
	if (prices.length === 0) return averageDrinkPrice(menu);
	const mid = Math.floor(prices.length / 2);
	return prices.length % 2 === 1
		? prices[mid]
		: Math.round((prices[mid - 1] + prices[mid]) / 2);
}

export function drinkMenuPriceRange(menu: OutletDrinkPrice[]): {
	min: number;
	max: number;
} {
	if (menu.length === 0)
		return { min: DEFAULT_PER_DRINK_RM, max: DEFAULT_PER_DRINK_RM };
	const prices = menu.map((d) => d.priceRm);
	return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function cloneDrinkMenu(menu: OutletDrinkPrice[]): OutletDrinkPrice[] {
	return menu.map((d) => ({ ...d }));
}

export function sortOutletDrinkMenuByPrice(
	menu: OutletDrinkPrice[],
): OutletDrinkPrice[] {
	return [...menu].sort(
		(a, b) =>
			a.priceRm - b.priceRm ||
			a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
	);
}

/** Categories split a menu into the Drinks / Services lists. Event menus saved
 *  before that split carry none, so borrow the workspace row's category by id. */
export function withDrinkCategoriesFromWorkspace(
	menu: OutletDrinkPrice[],
	workspaceMenu: OutletDrinkPrice[],
): OutletDrinkPrice[] {
	if (menu.every((d) => d.category != null)) return menu;
	const categoryById = new Map(
		(workspaceMenu.length > 0 ? workspaceMenu : DEFAULT_OUTLET_DRINK_MENU).map(
			(d) => [d.id, outletDrinkCategory(d)] as const,
		),
	);
	return menu.map((d) =>
		d.category != null
			? d
			: { ...d, category: categoryById.get(d.id) ?? "service" },
	);
}

/** Special events may override workspace drink prices; normal events always use workspace menu. */
export function effectiveShiftDrinkMenu(
	shift: { eventKind?: ShiftEventKind; eventDrinkMenu?: OutletDrinkPrice[] },
	workspaceMenu: OutletDrinkPrice[] = [],
): OutletDrinkPrice[] {
	if (
		shift.eventKind === "special" &&
		shift.eventDrinkMenu &&
		shift.eventDrinkMenu.length > 0
	) {
		return shift.eventDrinkMenu;
	}
	if (workspaceMenu.length > 0) return workspaceMenu;
	return DEFAULT_OUTLET_DRINK_MENU;
}

export function workspaceBaseRates(
	ws: Pick<
		OutletWorkspaceSettings,
		"basePayPerHour" | "drinkPct" | "tipPct" | "tablePct" | "otAfterHours"
	>,
): OutletTierRateSettings {
	return {
		wagePerHour: ws.basePayPerHour,
		drinkPct: ws.drinkPct,
		tipPct: ws.tipPct,
		tablePct: ws.tablePct,
		otAfterHours: ws.otAfterHours,
	};
}

export function normalizeOutletWorkspace(
	ws: Partial<OutletWorkspaceSettings> | undefined,
): OutletWorkspaceSettings {
	const drinkMenu = (() => {
		let menu =
			ws?.drinkMenu && ws.drinkMenu.length > 0
				? ws.drinkMenu.map((d) => ({ ...d }))
				: DEFAULT_OUTLET_DRINK_MENU.map((d) => ({ ...d }));
		if (isLegacyDefaultDrinkMenu(menu)) {
			menu = DEFAULT_OUTLET_DRINK_MENU.map((d) => ({ ...d }));
		}
		for (const id of SEEDED_SERVICE_MENU_IDS) {
			if (menu.some((d) => d.id === id)) continue;
			const seeded = DEFAULT_OUTLET_DRINK_MENU.find((d) => d.id === id);
			if (seeded) menu = [...menu, { ...seeded }];
		}
		// `havoc` was seeded as a drink; it is a service. Correct only rows still
		// identical to that bad seed — a moved or re-priced row is the outlet's
		// own choice and stays put.
		menu = menu.map((d) => {
			const seeded = DEFAULT_OUTLET_DRINK_MENU.find((s) => s.id === d.id);
			return seeded &&
				seeded.category === "service" &&
				d.category === "drink" &&
				d.priceRm === seeded.priceRm
				? { ...d, category: "service" as const }
				: d;
		});
		if (menu.length === 0) {
			menu = DEFAULT_OUTLET_DRINK_MENU.map((d) => ({ ...d }));
		}
		return sortOutletDrinkMenuByPrice(menu);
	})();
	const merged = {
		...DEFAULT_OUTLET_WORKSPACE,
		...ws,
		drinkMenu,
	};
	const tierRates = normalizeWorkspaceTierRates(
		workspaceBaseRates(merged),
		ws?.tierRates,
	);
	const baseTier = tierRates[OUTLET_BASE_TIER];
	const migratedTierRates = (() => {
		if (merged.outletName === "Velvet 23" && baseTier.wagePerHour === 50) {
			return normalizeTierRates({ ...baseTier, wagePerHour: 500 }, undefined);
		}
		const t2 = tierRates["Tier II"]?.wagePerHour;
		if (baseTier.wagePerHour === 500 && t2 === 540) {
			return normalizeTierRates(baseTier, undefined);
		}
		if (tierRates[OUTLET_SERVANT_TIER] == null) {
			return normalizeTierRates(baseTier, tierRates);
		}
		if (
			baseTier.wagePerHour === 500 &&
			tierRates[OUTLET_SERVANT_TIER]?.wagePerHour === 400
		) {
			return normalizeTierRates(baseTier, {
				...tierRates,
				[OUTLET_SERVANT_TIER]: {
					...tierRates[OUTLET_SERVANT_TIER]!,
					wagePerHour: 200,
				},
			});
		}
		if (baseTier.drinkPct === 8 && tierHappyHourDrinkPct(baseTier) === 7) {
			const newBase = { ...baseTier, drinkPct: 10, happyHourDrinkPct: 5 };
			const rebuilt = buildDefaultTierRates(newBase);
			const out = { ...tierRates };
			for (const tier of OUTLET_PR_TIERS) {
				out[tier] = {
					...out[tier],
					drinkPct: rebuilt[tier].drinkPct,
					happyHourDrinkPct: rebuilt[tier].happyHourDrinkPct,
					tipPct: rebuilt[tier].tipPct,
				};
			}
			return out;
		}
		return tierRates;
	})();
	const happyHourTierRates = migrateTierRatesHappyHourDrinks(migratedTierRates);
	const repairedTierRates =
		repairTierRatesDailyWageSemantics(happyHourTierRates);
	const migratedBaseTier = repairedTierRates[OUTLET_BASE_TIER];
	const legacyCommissionOnly =
		ws?.commissionOnlyRates?.drinkPct === 14 &&
		ws?.commissionOnlyRates?.tipPct === 28;
	const commissionOnlyRates = legacyCommissionOnly
		? defaultCommissionOnlyRateSettings()
		: {
				...defaultCommissionOnlyRateSettings(),
				...ws?.commissionOnlyRates,
			};
	if (
		commissionOnlyRates.targetSalesRm ===
		COMMISSION_ONLY_DEFAULT_TARGET_SALES_RM
	) {
		commissionOnlyRates.targetSalesRm = undefined;
	}
	if (
		commissionOnlyRates.drinkPct === COMMISSION_ONLY_DEFAULT_DRINK_PCT &&
		commissionOnlyRates.tipPct === 86
	) {
		commissionOnlyRates.tipPct = COMMISSION_ONLY_DEFAULT_TIP_PCT;
	}
	if (
		commissionOnlyRates.happyHourDrinkPct == null ||
		commissionOnlyRates.happyHourDrinkPct === commissionOnlyRates.drinkPct
	) {
		commissionOnlyRates.happyHourDrinkPct = defaultHappyHourDrinkPct(
			commissionOnlyRates.drinkPct,
		);
	}
	return {
		...merged,
		drinkMenu,
		perDrinkRm: ws?.perDrinkRm ?? averageDrinkPrice(drinkMenu),
		tierRates: repairedTierRates,
		commissionOnlyRates,
		basePayPerHour: migratedBaseTier.wagePerHour,
		drinkPct: migratedBaseTier.drinkPct,
		tipPct: migratedBaseTier.tipPct,
		tablePct: migratedBaseTier.tablePct,
		otAfterHours: migratedBaseTier.otAfterHours ?? merged.otAfterHours ?? 6,
		happyHourStart: ws?.happyHourStart ?? merged.happyHourStart ?? "20:00",
		happyHourEnd: ws?.happyHourEnd ?? merged.happyHourEnd ?? "22:00",
		happyHourDrinkDiscountPct: resolveHappyHourDrinkDiscountPct(ws),
		penaltyRules: normalizePenaltyRules(ws?.penaltyRules),
	};
}

/** Backfill tiers missing from persisted shift snapshots (e.g. after adding Servant). */
function mergeShiftTierRatesWithWorkspace(
	shiftRates: Partial<Record<OutletPrTier, OutletTierRateSettings>>,
	workspaceRates: Record<OutletPrTier, OutletTierRateSettings>,
): Record<OutletPrTier, OutletTierRateSettings> {
	const out = cloneTierRates(workspaceRates);
	for (const tier of OUTLET_PR_TIERS) {
		const shiftTier = shiftRates[tier];
		if (shiftTier) {
			out[tier] = { ...out[tier], ...shiftTier };
		}
	}
	return out;
}

export function resolveShiftTierRates(
	shift: {
		tierRates?: Record<OutletPrTier, OutletTierRateSettings>;
		payPerHour: number;
	},
	workspace: Pick<OutletWorkspaceSettings, "tierRates">,
): Record<OutletPrTier, OutletTierRateSettings> {
	if (!shift.tierRates) {
		const baseTier = workspace.tierRates[OUTLET_BASE_TIER];
		return buildDefaultTierRates({
			wagePerHour: shift.payPerHour,
			drinkPct: baseTier.drinkPct,
			tipPct: baseTier.tipPct,
			tablePct: baseTier.tablePct,
			otAfterHours: baseTier.otAfterHours,
		});
	}
	const wsBase = workspace.tierRates[OUTLET_BASE_TIER].wagePerHour;
	const shiftBase =
		shift.tierRates[OUTLET_BASE_TIER]?.wagePerHour ?? shift.payPerHour;
	if (wsBase >= 500 && shiftBase <= 80) {
		const out = cloneTierRates(workspace.tierRates);
		for (const tier of OUTLET_PR_TIERS) {
			const shiftTier = shift.tierRates[tier];
			if (shiftTier?.targetSalesRm != null) {
				out[tier] = { ...out[tier], targetSalesRm: shiftTier.targetSalesRm };
			}
		}
		return out;
	}
	return mergeShiftTierRatesWithWorkspace(shift.tierRates, workspace.tierRates);
}

export function patchShiftTierWages(
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	wages: Partial<Record<OutletPrTier, number>>,
): Record<OutletPrTier, OutletTierRateSettings> {
	const out = cloneTierRates(tierRates);
	for (const tier of OUTLET_PR_TIERS) {
		if (wages[tier] != null) {
			out[tier] = { ...out[tier], wagePerHour: snapTierWage(wages[tier]!) };
		}
	}
	return out;
}

export function patchShiftTierSalesTargets(
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	targets: Partial<Record<OutletPrTier, number>>,
): Record<OutletPrTier, OutletTierRateSettings> {
	const out = cloneTierRates(tierRates);
	for (const tier of OUTLET_PR_TIERS) {
		if (targets[tier] != null) {
			out[tier] = { ...out[tier], targetSalesRm: targets[tier] };
		}
	}
	return out;
}

/** Demo per-shift PR sales targets (RM) — Post Job optional targets, seeded for outlet home */
export const DEMO_SHIFT_TIER_SALES_TARGETS: Record<
	string,
	Partial<Record<OutletPrTier, number>>
> = {
	s1: {
		"Tier I": 800,
		"Tier II": 1000,
		"Tier III": 1200,
		"Tier IV": 1500,
		"Tier V": 2000,
	},
	s2: {
		"Tier I": 1000,
		"Tier II": 1200,
		"Tier III": 1400,
		"Tier IV": 1600,
		"Tier V": 2200,
	},
	s3: {
		"Tier I": 600,
		"Tier II": 750,
		"Tier III": 900,
		"Tier IV": 1100,
		"Tier V": 1400,
	},
	s4: {
		"Tier I": 700,
		"Tier II": 850,
		"Tier III": 1000,
		"Tier IV": 1200,
		"Tier V": 1500,
	},
	s5: {
		"Tier I": 800,
		"Tier II": 950,
		"Tier III": 1100,
		"Tier IV": 1300,
		"Tier V": 1600,
	},
	s6: {
		"Tier I": 900,
		"Tier II": 1050,
		"Tier III": 1200,
		"Tier IV": 1400,
		"Tier V": 1800,
	},
	s7: {
		"Tier I": 750,
		"Tier II": 900,
		"Tier III": 1050,
		"Tier IV": 1250,
		"Tier V": 1550,
	},
	s8: {
		"Tier I": 650,
		"Tier II": 800,
		"Tier III": 950,
		"Tier IV": 1150,
		"Tier V": 1450,
	},
	s9: {
		"Tier I": 850,
		"Tier II": 1000,
		"Tier III": 1150,
		"Tier IV": 1350,
		"Tier V": 1700,
	},
	s10: {
		"Tier I": 900,
		"Tier II": 1050,
		"Tier III": 1200,
		"Tier IV": 1400,
		"Tier V": 1750,
	},
	s11: {
		"Tier I": 700,
		"Tier II": 850,
		"Tier III": 1000,
		"Tier IV": 1200,
		"Tier V": 1500,
	},
	s12: {
		"Tier I": 750,
		"Tier II": 900,
		"Tier III": 1050,
		"Tier IV": 1250,
		"Tier V": 1600,
	},
	s13: {
		"Tier I": 800,
		"Tier II": 950,
		"Tier III": 1100,
		"Tier IV": 1300,
		"Tier V": 1650,
	},
	s17: {
		"Tier I": 900,
		"Tier II": 1100,
		"Tier III": 1300,
		"Tier IV": 1600,
		"Tier V": 2200,
	},
	s8b: {
		"Tier I": 650,
		"Tier II": 800,
		"Tier III": 950,
		"Tier IV": 1150,
		"Tier V": 1450,
	},
};

/** Map agency PR training level to a valid outlet tier (defaults to base tier). */
export function resolveOutletPrTier(trainingLevel?: string): OutletPrTier {
	if (
		trainingLevel &&
		OUTLET_PR_TIERS.includes(trainingLevel as OutletPrTier)
	) {
		return trainingLevel as OutletPrTier;
	}
	return OUTLET_BASE_TIER;
}

/** Effective per-shift rate a PR earns — commission-only pays no basic wage. */
export interface EffectiveShiftRate {
	wagePerHour: number;
	drinkPct: number;
	happyHourDrinkPct: number;
	tipPct: number;
}

/** Resolve the rate for a pay tier — commission_only uses commissionOnlyRates (RM 0 wage). */
export function resolveShiftRateForPayTier(
	payTierId: PostJobPayTierId,
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	commissionOnlyRates: CommissionOnlyRateSettings,
): EffectiveShiftRate {
	if (isCommissionOnlyPayTier(payTierId)) {
		return {
			wagePerHour: 0,
			drinkPct: commissionOnlyRates.drinkPct,
			happyHourDrinkPct:
				commissionOnlyRates.happyHourDrinkPct ?? commissionOnlyRates.drinkPct,
			tipPct: commissionOnlyRates.tipPct,
		};
	}
	const tier = outletTierForPostJobPayTier(payTierId) ?? OUTLET_BASE_TIER;
	const rate = tierRates[tier] ?? tierRates[OUTLET_BASE_TIER];
	return {
		wagePerHour: rate.wagePerHour,
		drinkPct: rate.drinkPct,
		happyHourDrinkPct: tierHappyHourDrinkPct(rate),
		tipPct: rate.tipPct,
	};
}

/**
 * The pay tier a PR's shift should be paid at. The slot's recorded payTierId
 * (captured at booking) wins; otherwise it's derived from the PR's pay class,
 * then their training level. This is what makes a basic→commission-only switch
 * apply per shift without rewriting already-booked shifts.
 */
export function effectiveShiftPayTierId(
	slotPayTierId: PostJobPayTierId | undefined,
	pr: { payClass?: PrPayClass; trainingLevel?: string },
): PostJobPayTierId {
	if (slotPayTierId) return slotPayTierId;
	if (prPayClass(pr) === "commissionOnly") return "commission_only";
	return postJobPayTierIdForOutletTier(resolveOutletPrTier(pr.trainingLevel));
}

/** Per-PR sales target (RM) from outlet shift tier rates. */
export function tierSalesTargetForPr(
	tierRates: Record<OutletPrTier, OutletTierRateSettings> | undefined,
	trainingLevel?: string,
): number {
	if (!tierRates) return 0;
	const tier = resolveOutletPrTier(trainingLevel);
	return tierRates[tier]?.targetSalesRm ?? 0;
}

export function findOutletShiftForPr<
	T extends { id: string; outletName: string; status: string; prs: string[] },
>(shifts: T[], outlet: string, prId: string, shiftId?: string): T | undefined {
	if (shiftId) {
		const byId = shifts.find((s) => s.id === shiftId);
		if (byId && outletMatches(byId.outletName, outlet)) return byId;
	}
	const assigned = shifts.find(
		(s) =>
			outletMatches(s.outletName, outlet) &&
			s.status !== "sealed" &&
			s.prs.includes(prId),
	);
	if (assigned) return assigned;
	return shifts.find(
		(s) => outletMatches(s.outletName, outlet) && s.status !== "sealed",
	);
}

/** Match outlet shift row to an agency roster assignment (outlet + shift time). */
export function findOutletShiftForRosterSlot<
	T extends {
		outletName: string;
		shift: string;
		event?: string;
		date?: string;
		status?: string;
	},
>(shifts: T[], slot: { outlet: string; shift: string }): T | undefined {
	const matches = shifts.filter(
		(s) => outletMatches(s.outletName, slot.outlet) && s.status !== "sealed",
	);
	if (matches.length === 0) return undefined;
	const byTime = matches.find((s) => s.shift === slot.shift);
	if (byTime) return byTime;
	return matches.find((s) => s.date === "Tonight") ?? matches[0];
}

export function ensureShiftSalesTargets<
	T extends {
		id: string;
		tierRates: Record<OutletPrTier, OutletTierRateSettings>;
	},
>(shift: T): T {
	const demo = DEMO_SHIFT_TIER_SALES_TARGETS[shift.id];
	if (!demo) return shift;
	const hasTargets = OUTLET_PR_TIERS.some(
		(t) => (shift.tierRates[t].targetSalesRm ?? 0) > 0,
	);
	if (hasTargets) return shift;
	return {
		...shift,
		tierRates: patchShiftTierSalesTargets(shift.tierRates, demo),
	};
}

export function migrateShiftTierRates<
	T extends {
		id?: string;
		tierRates?: Record<OutletPrTier, OutletTierRateSettings>;
		payPerHour: number;
	},
>(
	shift: T,
	workspace: Pick<OutletWorkspaceSettings, "tierRates">,
): T & {
	tierRates: Record<OutletPrTier, OutletTierRateSettings>;
	payPerHour: number;
} {
	const tierRates = resolveShiftTierRates(shift, workspace);
	const migrated = {
		...shift,
		tierRates,
		payPerHour: tierRates[OUTLET_BASE_TIER].wagePerHour,
	};
	if (shift.id) {
		return ensureShiftSalesTargets(
			migrated as T & {
				id: string;
				tierRates: Record<OutletPrTier, OutletTierRateSettings>;
			},
		);
	}
	return migrated;
}

export interface OutletWorkspaceSettings {
	outletName: string;
	basePayPerHour: number;
	drinkPct: number;
	tipPct: number;
	tablePct: number;
	otAfterHours: number;
	/** Wage & commission per PR training tier */
	tierRates: Record<OutletPrTier, OutletTierRateSettings>;
	/** Commission-only tier defaults (no shift pay) — synced to post job */
	commissionOnlyRates: CommissionOnlyRateSettings;
	/** Legacy average — derived from drinkMenu on save */
	perDrinkRm: number;
	perTableRm: number;
	drinkMenu: OutletDrinkPrice[];
	happyHourStart: string;
	happyHourEnd: string;
	/** % discount off menu drink prices during happy hour (e.g. 15 = 15% off). */
	happyHourDrinkDiscountPct: number;
	/** Attendance & discipline rules, scoped per pay class. */
	penaltyRules: OutletPenaltyRules;
}

export const DEFAULT_HAPPY_HOUR_DRINK_DISCOUNT_PCT = 15;

export function resolveHappyHourDrinkDiscountPct(
	ws?: Partial<OutletWorkspaceSettings> & { happyHourDrinkBoost?: number },
): number {
	if (
		ws?.happyHourDrinkDiscountPct != null &&
		!Number.isNaN(ws.happyHourDrinkDiscountPct)
	) {
		return Math.min(100, Math.max(0, Math.round(ws.happyHourDrinkDiscountPct)));
	}
	const legacyBoost = ws?.happyHourDrinkBoost;
	if (legacyBoost != null && legacyBoost > 1) {
		return Math.min(100, Math.max(0, Math.round((legacyBoost - 1) * 100)));
	}
	return DEFAULT_HAPPY_HOUR_DRINK_DISCOUNT_PCT;
}

export function happyHourDrinkPrice(
	priceRm: number,
	discountPct: number,
): number {
	const pct = Math.min(100, Math.max(0, discountPct));
	return Math.round(priceRm * (1 - pct / 100) * 100) / 100;
}

export interface OutletSettings {
	venueName: string;
	location: string;
	notifyShiftUpdates: boolean;
	notifyReconciliation: boolean;
	notifyInvoiceDue: boolean;
}

export interface OutletOwnerSettings {
	ownerName: string;
	mobile: string;
	email: string;
	ic: string;
	orgName: string;
	otpChannel: "email" | "phone";
	accountActivated: boolean;
	avatarPhoto?: string | null;
	subscriptionPlanId?: OutletSubscriptionPlanId;
}

export type OutletSubscriptionPlanId =
	| "starter"
	| "plus"
	| "pro"
	| "enterprise"
	| "scale"
	| "premier"
	| "pos_integration";

export interface OutletSubscriptionPlan {
	id: OutletSubscriptionPlanId;
	label: string;
	monthlyRm: number;
	/** Shown instead of monthlyRm when pricing is negotiated with admin */
	priceLabel?: string;
	/** Requires InnocenZ admin to quote pricing — not a self-serve plan switch */
	renegotiate?: boolean;
	/** Max outlet-requested specific PRs per calendar day (agency-assigned fill excluded) */
	prPerDayMax: number;
	/** Lower bound of daily PR band (display) */
	prPerDayMin?: number;
	/** PRs shown in Post Job special-service PR picker */
	prPoolSize: number;
	/** Max PRs selectable per shift from the pool */
	prSelectMax: number;
	capacityLabel: string;
	description: string;
}

export const OUTLET_SUBSCRIPTION_PLANS: OutletSubscriptionPlan[] = [
	{
		id: "starter",
		label: "Essential",
		monthlyRm: 999,
		prPerDayMax: 5,
		prPoolSize: 10,
		prSelectMax: 5,
		capacityLabel: "5 PRs / day",
		description: "Full InnocenZ service · choose 5 from 10 PRs per shift",
	},
	{
		id: "plus",
		label: "Plus",
		monthlyRm: 1699,
		prPerDayMin: 6,
		prPerDayMax: 10,
		prPoolSize: 20,
		prSelectMax: 10,
		capacityLabel: "6–10 PRs / day",
		description: "Growing venue · choose 10 from 20 PRs per shift",
	},
	{
		id: "pro",
		label: "Pro",
		monthlyRm: 2999,
		prPerDayMin: 11,
		prPerDayMax: 25,
		prPoolSize: 50,
		prSelectMax: 25,
		capacityLabel: "11–25 PRs / day",
		description: "Multi-event nights · choose 25 from 50 PRs per shift",
	},
	{
		id: "enterprise",
		label: "Enterprise",
		monthlyRm: 3999,
		prPerDayMin: 26,
		prPerDayMax: 50,
		prPoolSize: 100,
		prSelectMax: 50,
		capacityLabel: "26–50 PRs / day",
		description: "Large venues · choose 50 from 100 PRs per shift",
	},
	{
		id: "scale",
		label: "Scale",
		monthlyRm: 6999,
		prPerDayMin: 51,
		prPerDayMax: 100,
		prPoolSize: 200,
		prSelectMax: 100,
		capacityLabel: "51–100 PRs / day",
		description: "High-volume nights · choose 100 from 200 PRs per shift",
	},
	{
		id: "premier",
		label: "Premier",
		monthlyRm: 9999,
		prPerDayMin: 101,
		prPerDayMax: 999,
		prPoolSize: 400,
		prSelectMax: 200,
		capacityLabel: "101+ PRs / day",
		description: "Flagship venues · choose more than 100 PRs per shift",
	},
];

export type OutletSubscriptionAddonId = "pos_integration";

export interface OutletSubscriptionAddon {
	id: OutletSubscriptionAddonId;
	label: string;
	priceLabel: string;
	capacityLabel: string;
	description: string;
	negotiateWithAdmin: true;
}

/** Add-ons billed separately — price negotiated with InnocenZ admin */
export const OUTLET_SUBSCRIPTION_ADDONS: OutletSubscriptionAddon[] = [
	{
		id: "pos_integration",
		label: "Integrate with POS",
		priceLabel: "Call to get price",
		capacityLabel: "POS sync",
		description:
			"Sync floor sales with your POS — InnocenZ admin will quote for your venue",
		negotiateWithAdmin: true,
	},
];

export function getOutletSubscriptionPlan(
	id?: OutletSubscriptionPlanId | null,
): OutletSubscriptionPlan {
	return (
		OUTLET_SUBSCRIPTION_PLANS.find((p) => p.id === id) ??
		OUTLET_SUBSCRIPTION_PLANS.find((p) => p.id === "pro")!
	);
}

export function formatOutletPlanPrPickerRule(
	plan: OutletSubscriptionPlan,
): string {
	if (plan.renegotiate) return plan.description;
	if (plan.id === "premier") return "Choose more than 100 PRs";
	return `Choose ${plan.prSelectMax} from ${plan.prPoolSize} PRs`;
}

export function formatOutletPlanDailyHeadcountHint(
	plan: OutletSubscriptionPlan,
	remaining: number,
	dateLabel: string,
): string {
	if (remaining <= 0) {
		return `${plan.label} plan · ${plan.prPerDayMax} PRs/day limit reached for ${dateLabel}`;
	}
	const band = plan.prPerDayMin
		? `${plan.prPerDayMin}–${plan.prPerDayMax}`
		: String(plan.prPerDayMax);
	return `${plan.label} plan · ${band} PRs/day · ${remaining} available on ${dateLabel}`;
}

function canonicalOutletName(name: string): string {
	return name.trim().toLowerCase();
}

/** Total PR headcount (people needed) already booked for one outlet on a date */
export function outletPrHeadcountForDate(
	shifts: { outletName: string; dateIso?: string; quantity: number }[],
	outletName: string,
	dateIso: string,
): number {
	const canon = canonicalOutletName(outletName);
	return shifts
		.filter(
			(s) =>
				canonicalOutletName(s.outletName) === canon &&
				(s.dateIso ?? "") === dateIso,
		)
		.reduce((sum, s) => sum + s.quantity, 0);
}

/** PRs the outlet explicitly requested (Post Job picker) — not agency-assigned fill */
export function outletNamedPrCountForDate(
	shifts: { outletName: string; dateIso?: string; requestedPrIds?: string[] }[],
	outletName: string,
	dateIso: string,
): number {
	const canon = canonicalOutletName(outletName);
	return shifts
		.filter(
			(s) =>
				canonicalOutletName(s.outletName) === canon &&
				(s.dateIso ?? "") === dateIso,
		)
		.reduce((sum, s) => sum + (s.requestedPrIds?.length ?? 0), 0);
}

/** Peak daily outlet-requested PR count across all booked shift dates */
export function maxDailyOutletNamedPrCount(
	shifts: { outletName: string; dateIso?: string; requestedPrIds?: string[] }[],
	outletName: string,
): number {
	const canon = canonicalOutletName(outletName);
	const byDate = new Map<string, number>();
	for (const s of shifts) {
		if (canonicalOutletName(s.outletName) !== canon || !s.dateIso) continue;
		byDate.set(
			s.dateIso,
			(byDate.get(s.dateIso) ?? 0) + (s.requestedPrIds?.length ?? 0),
		);
	}
	if (byDate.size === 0) return 0;
	return Math.max(...byDate.values());
}

/** Peak daily PR headcount across all booked shift dates for an outlet */
export function maxDailyOutletPrHeadcount(
	shifts: { outletName: string; dateIso?: string; quantity: number }[],
	outletName: string,
): number {
	const canon = canonicalOutletName(outletName);
	const byDate = new Map<string, number>();
	for (const s of shifts) {
		if (canonicalOutletName(s.outletName) !== canon || !s.dateIso) continue;
		byDate.set(s.dateIso, (byDate.get(s.dateIso) ?? 0) + s.quantity);
	}
	if (byDate.size === 0) return 0;
	return Math.max(...byDate.values());
}

export interface OutletSubscriptionInvoice {
	id: string;
	issueDate: string;
	detail: string;
	planLabel: string;
	amount: number;
	status: "SETTLED" | "PENDING";
}

export const OUTLET_SUBSCRIPTION_BILLING: OutletSubscriptionInvoice[] = [
	{
		id: "SUB-2026-0601",
		issueDate: "25 Jun 2026",
		detail: "Jun 2026 · Pro · InnocenZ Outlet SaaS",
		planLabel: "Pro",
		amount: 2999,
		status: "SETTLED",
	},
	{
		id: "SUB-2026-0501",
		issueDate: "1 May 2026",
		detail: "May 2026 · Plus · InnocenZ Outlet SaaS",
		planLabel: "Plus",
		amount: 1699,
		status: "SETTLED",
	},
];

export function outletSubscriptionInvoiceForPlan(
	plan: OutletSubscriptionPlan,
	issueDate = new Date(),
): OutletSubscriptionInvoice {
	const month = issueDate.toLocaleDateString("en-GB", {
		month: "short",
		year: "numeric",
	});
	const day = issueDate.toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
	return {
		id: `SUB-${issueDate.getFullYear()}-${String(issueDate.getMonth() + 1).padStart(2, "0")}-${plan.id}`,
		issueDate: day,
		detail: `${month} · ${plan.label} · InnocenZ Outlet SaaS`,
		planLabel: plan.label,
		amount: plan.monthlyRm,
		status: "SETTLED",
	};
}

/** Backfill plan label/amount on invoices saved before planLabel existed */
export function normalizeOutletSubscriptionInvoice(
	inv: OutletSubscriptionInvoice & { planLabel?: string },
): OutletSubscriptionInvoice {
	if (inv.planLabel) return inv;
	if (inv.detail.includes("Premier")) {
		return { ...inv, planLabel: "Premier", amount: 9999 };
	}
	if (inv.detail.includes("Scale")) {
		return { ...inv, planLabel: "Scale", amount: 6999 };
	}
	if (inv.detail.includes("Enterprise")) {
		return { ...inv, planLabel: "Enterprise", amount: 3999 };
	}
	if (inv.detail.includes("Pro")) {
		return { ...inv, planLabel: "Pro", amount: 2999 };
	}
	if (inv.detail.includes("Essential")) {
		return { ...inv, planLabel: "Essential", amount: 999 };
	}
	return { ...inv, planLabel: "Plus", amount: inv.amount || 1699 };
}

/** Ensure billing reflects the active plan (e.g. after upgrade from persisted Plus history). */
export function syncOutletSubscriptionBilling(
	invoices: OutletSubscriptionInvoice[],
	planId?: OutletSubscriptionPlanId | null,
): OutletSubscriptionInvoice[] {
	const normalized = invoices.map(normalizeOutletSubscriptionInvoice);
	const plan = getOutletSubscriptionPlan(planId);
	const hasPlanInvoice = normalized.some(
		(inv) => inv.planLabel === plan.label && inv.amount === plan.monthlyRm,
	);
	if (hasPlanInvoice) return normalized;
	const upgrade = outletSubscriptionInvoiceForPlan(plan);
	const withoutDup = normalized.filter((inv) => inv.id !== upgrade.id);
	return [upgrade, ...withoutDup];
}

export interface OutletFinanceHead {
	name: string;
	ic: string;
	email: string;
}

export interface OutletOpsHead {
	name: string;
	ic: string;
	email: string;
}

export type ShiftApplicantSource = "outlet_request";

export interface ShiftApplicant {
	id: string;
	shiftId: string;
	prId: string;
	prName: string;
	rating: number;
	status: "pending" | "accepted" | "declined";
	/** outlet_request = agency approval flow */
	source?: ShiftApplicantSource;
}

const velvetRule = getOutletRule("Velvet 23");
const velvetTierBase = {
	wagePerHour: velvetRule.wagePerHour,
	drinkPct: velvetRule.drinkPct,
	tipPct: velvetRule.tipPct,
	tablePct: velvetRule.tablePct,
	otAfterHours: velvetRule.otAfterHours,
};

/** Velvet Coupe Wine Bar — outlet logo & profile photo (served from `public/`). */
export const VELVET_23_OUTLET_LOGO = "/assets/outlet-logos/velvet-23-logo.png";

export const OUTLET_LOGOS: Record<string, string> = {
	"Velvet 23": VELVET_23_OUTLET_LOGO,
};

export function outletLogoForName(outletName: string): string | null {
	return OUTLET_LOGOS[outletName.trim()] ?? null;
}

export const DEFAULT_OUTLET_WORKSPACE: OutletWorkspaceSettings = {
	outletName: "Velvet 23",
	basePayPerHour: velvetRule.wagePerHour,
	drinkPct: velvetRule.drinkPct,
	tipPct: velvetRule.tipPct,
	tablePct: velvetRule.tablePct,
	otAfterHours: velvetRule.otAfterHours,
	tierRates: normalizeTierRates(velvetTierBase, velvetRule.tierRates),
	commissionOnlyRates: defaultCommissionOnlyRateSettings(),
	perDrinkRm: DEFAULT_PER_DRINK_RM,
	perTableRm: DEFAULT_PER_TABLE_RM,
	drinkMenu: DEFAULT_OUTLET_DRINK_MENU.map((d) => ({ ...d })),
	happyHourStart: "20:00",
	happyHourEnd: "22:00",
	happyHourDrinkDiscountPct: DEFAULT_HAPPY_HOUR_DRINK_DISCOUNT_PCT,
	penaltyRules: DEFAULT_PENALTY_RULES,
};

export const DEFAULT_OUTLET_SETTINGS: OutletSettings = {
	venueName: "Velvet 23",
	location: "Bukit Bintang, KL",
	notifyShiftUpdates: true,
	notifyReconciliation: true,
	notifyInvoiceDue: true,
};

export const DEFAULT_OUTLET_OWNER: OutletOwnerSettings = {
	ownerName: "Chen Wei Jie",
	mobile: "+60 11-234 5678",
	email: "owner@velvet23.my",
	ic: "820315-10-8834",
	orgName: "Velvet 23",
	otpChannel: "email",
	accountActivated: true,
	avatarPhoto: VELVET_23_OUTLET_LOGO,
	subscriptionPlanId: "pro",
};

export const DEFAULT_OUTLET_FINANCE_HEAD: OutletFinanceHead = {
	name: "Michelle Lim",
	ic: "900412-14-2210",
	email: "finance@velvet23.my",
};

export const DEFAULT_OUTLET_OPS_HEAD: OutletOpsHead = {
	name: "Ahmad Razif",
	ic: "880707-08-5511",
	email: "ops@velvet23.my",
};

export {
	getOutletWeeklyReport,
	type OutletWeeklyDaySales,
	type OutletWeeklyReport,
} from "@agency-portal/lib/velvet-week-demo";

export function shiftHoursFromLabel(shift: string): number {
	const segments = shift.replace(/—/g, "-").split(/\s*-\s*/);
	if (segments.length < 2) return 6;
	const parse = (s: string) => {
		const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
		if (!m) return 0;
		return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
	};
	const start = parse(segments[0]);
	let end = parse(segments[1]);
	if (end <= start) end += 24 * 60;
	return Math.max(1, Math.round((end - start) / 60));
}

function clockLabelToMinutes(clock: string): number {
	const m = clock.trim().match(/^(\d{1,2}):(\d{2})$/);
	if (!m) return 0;
	return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Happy-hour window length in hours (handles overnight end times). */
export function happyHourWindowHours(start: string, end: string): number {
	const s = clockLabelToMinutes(start);
	let e = clockLabelToMinutes(end);
	if (e <= s) e += 24 * 60;
	return Math.max(0, (e - s) / 60);
}

export function shiftStartTimeFromLabel(shiftLabel: string): string | null {
	const segments = shiftLabel.replace(/—/g, "-").split(/\s*-\s*/);
	const m = segments[0]?.trim().match(/^(\d{1,2}):(\d{2})$/);
	if (!m) return null;
	return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export function formatOutletShiftMetricAmount(amount: number): string {
	const rounded = Math.round(amount);
	if (rounded >= 1000) return `${(rounded / 1000).toFixed(1)}k`;
	return String(rounded);
}

export function formatOutletShiftDualMetric(
	target: number,
	actual: number,
): string {
	return `${formatOutletShiftMetricAmount(target)}/${formatOutletShiftMetricAmount(actual)}`;
}

export function outletShiftTargetSalesRm(
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	headcount: number,
): number {
	const perPr = OUTLET_PR_TIERS.map(
		(t) => tierRates[t].targetSalesRm ?? 0,
	).filter((v) => v > 0);
	if (!perPr.length || headcount <= 0) return 0;
	return Math.min(...perPr) * headcount;
}

/** Unique PR ids marked released early for this shift. */
export function outletShiftReleasedEarlyIds(shift: {
	releasedEarlyPrIds?: string[];
}): string[] {
	return [...new Set(shift.releasedEarlyPrIds ?? [])];
}

export function mergeReleasedEarlyPrIds(
	existing: string[] | undefined,
	toAdd: string[],
): string[] {
	return [...new Set([...(existing ?? []), ...toAdd])];
}

/** Merge release clock times (HH:mm) keyed by PR id. */
export function mergeReleasedEarlyAt(
	existing: Record<string, string> | undefined,
	toAdd: Record<string, string>,
): Record<string, string> {
	return { ...(existing ?? {}), ...toAdd };
}

export function releasedEarlyAtForPrIds(
	prIds: string[],
	releaseAtClock: string,
): Record<string, string> {
	return Object.fromEntries(prIds.map((id) => [id, releaseAtClock]));
}

/** Local clock label used for early-release timestamps. */
export function outletNowClockLabel(): string {
	return new Date().toLocaleTimeString("en-MY", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

/** Hours from shift start to a release clock (overnight-safe). */
export function hoursWorkedUntilRelease(
	shiftLabel: string,
	releaseClock: string,
): number {
	const scheduled = shiftHoursFromLabel(shiftLabel);
	const startLabel = shiftStartTimeFromLabel(shiftLabel);
	if (!startLabel) return scheduled;
	const start = clockLabelToMinutes(startLabel);
	let release = clockLabelToMinutes(releaseClock);
	if (release < start) release += 24 * 60;
	const worked = Math.max(0, (release - start) / 60);
	return Math.min(scheduled, Math.round(worked * 100) / 100);
}

/**
 * Clock used for early-release estimates.
 * If "now" falls outside the shift window (common in daytime demos), use 2h into the shift.
 */
export function outletPlanningReleaseClock(
	shiftLabel: string,
	preferred?: string,
): string {
	const clock = preferred ?? outletNowClockLabel();
	const scheduled = shiftHoursFromLabel(shiftLabel);
	const worked = hoursWorkedUntilRelease(shiftLabel, clock);
	if (worked > 0 && worked < scheduled - 0.01) return clock;
	const start = shiftStartTimeFromLabel(shiftLabel);
	if (!start) return clock;
	const fallbackHours = Math.min(2, Math.max(1, Math.floor(scheduled / 3)));
	let mins = clockLabelToMinutes(start) + fallbackHours * 60;
	if (mins >= 24 * 60) mins -= 24 * 60;
	const h = Math.floor(mins / 60);
	const m = mins % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Flat shift wage → hourly rate for cutlost / early-release pay. */
export function outletFlatWageHourlyRate(
	flatShiftWage: number,
	scheduledHours: number,
): number {
	if (scheduledHours <= 0 || flatShiftWage <= 0) return 0;
	return flatShiftWage / scheduledHours;
}

export function outletPrFlatShiftWage(
	prId: string,
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	prTierById: Record<string, string | undefined>,
): number {
	const tier = (prTierById[prId] ?? OUTLET_BASE_TIER) as OutletPrTier;
	return getTierWageFromRates(tierRates, tier);
}

/** Wage owed for an early-released PR (exact hours worked × hourly). Commissions are separate. */
export function outletPrEarlyReleaseWage(
	prId: string,
	shiftLabel: string,
	releaseClock: string,
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	prTierById: Record<string, string | undefined>,
): number {
	const flat = outletPrFlatShiftWage(prId, tierRates, prTierById);
	const scheduled = shiftHoursFromLabel(shiftLabel);
	const hourly = outletFlatWageHourlyRate(flat, scheduled);
	const hours = hoursWorkedUntilRelease(shiftLabel, releaseClock);
	return Math.round(hourly * hours);
}

/** Unused flat wage when a PR is released early (remaining hours × hourly). */
export function outletPrEarlyReleaseUnusedWage(
	prId: string,
	shiftLabel: string,
	releaseClock: string,
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	prTierById: Record<string, string | undefined>,
): number {
	const flat = outletPrFlatShiftWage(prId, tierRates, prTierById);
	return Math.max(
		0,
		flat -
			outletPrEarlyReleaseWage(
				prId,
				shiftLabel,
				releaseClock,
				tierRates,
				prTierById,
			),
	);
}

/** PRs still on the floor (booked minus early releases). */
export function outletShiftActivePrIds(shift: {
	prs?: string[];
	releasedEarlyPrIds?: string[];
}): string[] {
	const released = new Set(outletShiftReleasedEarlyIds(shift));
	return (shift.prs ?? []).filter((id) => !released.has(id));
}

export function outletShiftActualLaborCost(
	shift: { shift: string; prs: string[] },
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	prTierById: Record<string, string | undefined>,
): number {
	if (shift.prs.length === 0) return 0;
	return estimateShiftLaborCost({
		tierRates,
		hours: shiftHoursFromLabel(shift.shift),
		quantity: shift.prs.length,
		prIds: shift.prs,
		prTierById,
	});
}

export function outletShiftActualLaborCostForShift(
	shift: {
		shift: string;
		prs?: string[];
		releasedEarlyPrIds?: string[];
		releasedEarlyAt?: Record<string, string>;
	},
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	prTierById: Record<string, string | undefined>,
): number {
	const active = outletShiftActivePrIds(shift);
	const activeCost = outletShiftActualLaborCost(
		{ shift: shift.shift, prs: active },
		tierRates,
		prTierById,
	);
	const releasedIds = outletShiftReleasedEarlyIds(shift);
	if (!releasedIds.length) return activeCost;

	const scheduled = shiftHoursFromLabel(shift.shift);
	const fallbackClock = shiftStartTimeFromLabel(shift.shift) ?? "00:00";
	let releasedCost = 0;
	for (const id of releasedIds) {
		const clock = shift.releasedEarlyAt?.[id] ?? fallbackClock;
		releasedCost += outletPrEarlyReleaseWage(
			id,
			shift.shift,
			clock,
			tierRates,
			prTierById,
		);
	}
	// Guard: never exceed full flat wages for released PRs
	const releasedFull = estimateShiftLaborCost({
		tierRates,
		hours: scheduled,
		quantity: releasedIds.length,
		prIds: releasedIds,
		prTierById,
	});
	return activeCost + Math.min(releasedCost, releasedFull);
}

/**
 * Planned labor for demand after slot cuts only.
 * Early releases stay in the labor target at full shift wages (Phase 1 cutlost math).
 */
export function outletShiftTargetLaborCost(
	shift: OutletCutLossShiftSlice & {
		shift: string;
		prs?: string[];
		payTierRows?: PostJobPayTierRow[];
		releasedEarlyPrIds?: string[];
	},
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	prTierById: Record<string, string | undefined>,
): number {
	if (shift.payTierRows?.length) {
		// Do not peel early releases from labor target — only demandCut applies.
		const rows = resolveEffectiveShiftPayTierRows({
			payTierRows: shift.payTierRows,
			quantity: shift.quantity,
			demandCut: shift.demandCut,
			releasedEarlyPrIds: undefined,
			tierRates,
			bookedPrIds: [
				...outletShiftActivePrIds(shift),
				...outletShiftReleasedEarlyIds(shift),
			],
			prTierById,
		});
		return estimatePayTierRowsLaborCost(rows, tierRates);
	}

	const demand = outletShiftEffectiveDemand(shift);
	if (demand <= 0) return 0;
	return estimateShiftLaborCost({ tierRates, quantity: demand });
}

export function outletShiftPlannedLaborPerSlot(
	shift: OutletCutLossShiftSlice & {
		shift: string;
		prs?: string[];
		payTierRows?: PostJobPayTierRow[];
		releasedEarlyPrIds?: string[];
	},
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	prTierById: Record<string, string | undefined>,
): number {
	const demand = outletShiftEffectiveDemand(shift);
	if (demand <= 0) return 0;
	return outletShiftTargetLaborCost(shift, tierRates, prTierById) / demand;
}

export function outletShiftLaborCostForPrIds(
	prIds: string[],
	shiftLabel: string,
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	prTierById: Record<string, string | undefined>,
): number {
	if (!prIds.length) return 0;
	return estimateShiftLaborCost({
		tierRates,
		hours: shiftHoursFromLabel(shiftLabel),
		quantity: prIds.length,
		prIds,
		prTierById,
	});
}

/**
 * Legacy labor-gap share (kept for callers that still pass target−actual).
 * Display cutlost is underfill only — see outletShiftCutLossForShift.
 */
export const OUTLET_CUTLOSS_COST_SHARE = 1;

/** Best-effort: outlet saves this share of unused early-release wages. */
export const OUTLET_CUTLOSS_BEST_EFFORT_UNUSED_SHARE = 0.8;

/** Guaranteed early-release unused share — Phase 2. */
export const OUTLET_CUTLOSS_GUARANTEED_UNUSED_SHARE = 0.6;

export function outletCutlostUnusedShare(
	model: "best_effort" | "guaranteed" = "best_effort",
): number {
	return model === "guaranteed"
		? OUTLET_CUTLOSS_GUARANTEED_UNUSED_SHARE
		: OUTLET_CUTLOSS_BEST_EFFORT_UNUSED_SHARE;
}

/** Raw labor gap (target − actual). Not the Cutlost KPI — early-release unused lives here. */
export function outletShiftCutLoss(
	targetCost: number,
	actualCost: number,
): number {
	return Math.max(0, Math.round(targetCost - actualCost));
}

/**
 * Planned labor for fillable demand (sales-target headcount).
 * Early releases are peeled — unlike labor-cost target, which keeps full wages for released PRs.
 */
export function outletShiftFillableLaborCost(
	shift: OutletCutLossShiftSlice & {
		shift: string;
		prs?: string[];
		payTierRows?: PostJobPayTierRow[];
		releasedEarlyPrIds?: string[];
	},
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	prTierById: Record<string, string | undefined>,
): number {
	const headcount = outletShiftSalesTargetHeadcount(shift);
	if (headcount <= 0) return 0;

	if (shift.payTierRows?.length) {
		const rows = resolveEffectiveShiftPayTierRows({
			payTierRows: shift.payTierRows,
			quantity: shift.quantity,
			demandCut: shift.demandCut,
			releasedEarlyPrIds: shift.releasedEarlyPrIds,
			tierRates,
			bookedPrIds: [
				...outletShiftActivePrIds(shift),
				...outletShiftReleasedEarlyIds(shift),
			],
			prTierById,
		});
		return estimatePayTierRowsLaborCost(rows, tierRates);
	}

	return estimateShiftLaborCost({ tierRates, quantity: headcount });
}

/**
 * Cutlost KPI = underfill only (planned wages for open demand seats).
 * Early-release unused wages are tracked separately as best-effort savings — not cutlost.
 */
export function outletShiftCutLossForShift(
	shift: OutletCutLossShiftSlice & {
		shift: string;
		prs?: string[];
		payTierRows?: PostJobPayTierRow[];
		releasedEarlyPrIds?: string[];
		releasedEarlyAt?: Record<string, string>;
	},
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	prTierById: Record<string, string | undefined>,
): number {
	const { openSlots, demand, supplied } = outletShiftDemandSupplied(shift);
	if (openSlots <= 0 || demand <= 0) return 0;

	const fillable = outletShiftFillableLaborCost(shift, tierRates, prTierById);
	if (supplied <= 0) return Math.max(0, Math.round(fillable));

	const active = outletShiftActivePrIds(shift);
	const suppliedLabor = outletShiftActualLaborCost(
		{ shift: shift.shift, prs: active },
		tierRates,
		prTierById,
	);
	return Math.max(0, Math.round(fillable - suppliedLabor));
}

/** Unused wages from PRs already released early on this shift (full − hours paid). */
export function outletShiftReleasedUnusedWagesTotal(
	shift: {
		shift: string;
		releasedEarlyPrIds?: string[];
		releasedEarlyAt?: Record<string, string>;
	},
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	prTierById: Record<string, string | undefined>,
): number {
	const releasedIds = outletShiftReleasedEarlyIds(shift);
	if (!releasedIds.length) return 0;
	const fallbackClock = shiftStartTimeFromLabel(shift.shift) ?? "00:00";
	return releasedIds.reduce((sum, id) => {
		const clock = shift.releasedEarlyAt?.[id] ?? fallbackClock;
		return (
			sum +
			outletPrEarlyReleaseUnusedWage(
				id,
				shift.shift,
				clock,
				tierRates,
				prTierById,
			)
		);
	}, 0);
}

/** Best-effort outlet credit on already-released unused wages (80% in Phase 1). */
export function outletShiftBestEffortSaveCredited(
	shift: {
		shift: string;
		releasedEarlyPrIds?: string[];
		releasedEarlyAt?: Record<string, string>;
	},
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	prTierById: Record<string, string | undefined>,
	model: "best_effort" | "guaranteed" = "best_effort",
): number {
	const unused = outletShiftReleasedUnusedWagesTotal(
		shift,
		tierRates,
		prTierById,
	);
	return Math.round(unused * outletCutlostUnusedShare(model));
}

export type OutletCutLossPatch = Partial<{
	releasedEarlyPrIds: string[];
	releasedEarlyAt: Record<string, string>;
	/** Clock used for newly released PRs when releasedEarlyAt omits them. */
	releaseAtClock: string;
	demandCut: number;
	salesTargetPct: number;
}>;

function resolvePatchReleasedEarlyAt(
	shift: {
		releasedEarlyPrIds?: string[];
		releasedEarlyAt?: Record<string, string>;
	},
	patch: OutletCutLossPatch,
	nextReleased: string[],
): Record<string, string> {
	const prev = shift.releasedEarlyAt ?? {};
	const fromPatch = patch.releasedEarlyAt ?? {};
	const clock = patch.releaseAtClock ?? outletNowClockLabel();
	const merged = { ...prev, ...fromPatch };
	for (const id of nextReleased) {
		if (!merged[id]) merged[id] = clock;
	}
	return merged;
}

export function outletShiftCutLossAfterPatch(
	shift: OutletCutLossShiftSlice & {
		shift: string;
		prs: string[];
		releasedEarlyPrIds?: string[];
		releasedEarlyAt?: Record<string, string>;
		demandCut?: number;
		salesTargetPct?: number;
	},
	patch: OutletCutLossPatch,
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	prTierById: Record<string, string | undefined>,
): number {
	const prevReleased = new Set(outletShiftReleasedEarlyIds(shift));
	const nextReleased =
		patch.releasedEarlyPrIds !== undefined
			? mergeReleasedEarlyPrIds([], patch.releasedEarlyPrIds)
			: outletShiftReleasedEarlyIds(shift);
	const newlyReleased = nextReleased.filter((id) => !prevReleased.has(id));
	const prs = outletShiftActivePrIds(shift).filter(
		(id) => !newlyReleased.includes(id),
	);
	const releasedEarlyAt = resolvePatchReleasedEarlyAt(
		shift,
		patch,
		nextReleased,
	);

	return outletShiftCutLossForShift(
		{
			...shift,
			...patch,
			prs,
			demandCut: patch.demandCut ?? shift.demandCut,
			releasedEarlyPrIds: nextReleased,
			releasedEarlyAt,
		},
		tierRates,
		prTierById,
	);
}

/** Unused wages created by newly released PRs in a patch (exact hours). */
export function outletShiftEarlyReleaseUnusedWages(
	shift: OutletCutLossShiftSlice & {
		shift: string;
		prs: string[];
		releasedEarlyPrIds?: string[];
		releasedEarlyAt?: Record<string, string>;
	},
	patch: OutletCutLossPatch,
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	prTierById: Record<string, string | undefined>,
): number {
	const prevReleased = new Set(outletShiftReleasedEarlyIds(shift));
	const nextReleased =
		patch.releasedEarlyPrIds !== undefined
			? mergeReleasedEarlyPrIds([], patch.releasedEarlyPrIds)
			: outletShiftReleasedEarlyIds(shift);
	const newlyReleased = nextReleased.filter((id) => !prevReleased.has(id));
	if (!newlyReleased.length) return 0;
	const releasedEarlyAt = resolvePatchReleasedEarlyAt(
		shift,
		patch,
		nextReleased,
	);
	return newlyReleased.reduce((sum, id) => {
		const clock = releasedEarlyAt[id] ?? outletNowClockLabel();
		return (
			sum +
			outletPrEarlyReleaseUnusedWage(
				id,
				shift.shift,
				clock,
				tierRates,
				prTierById,
			)
		);
	}, 0);
}

/**
 * Estimated outlet savings for a cutlost action.
 * - Slot cuts: full underfill cutlost reduction (open seats leave the plan).
 * - Early releases: model share of unused wages (best effort 80% / guaranteed 60%) — not cutlost.
 */
export function outletShiftCutLossSavings(
	shift: OutletCutLossShiftSlice & {
		shift: string;
		prs: string[];
		releasedEarlyPrIds?: string[];
		releasedEarlyAt?: Record<string, string>;
		demandCut?: number;
		salesTargetPct?: number;
	},
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	prTierById: Record<string, string | undefined>,
	patch: OutletCutLossPatch,
	model: "best_effort" | "guaranteed" = "best_effort",
): number {
	const demandBefore = shift.demandCut ?? 0;
	const demandAfter = patch.demandCut ?? demandBefore;
	let slotSavings = 0;
	if (demandAfter > demandBefore) {
		const before = outletShiftCutLossForShift(shift, tierRates, prTierById);
		const afterSlots = outletShiftCutLossAfterPatch(
			shift,
			{ demandCut: demandAfter },
			tierRates,
			prTierById,
		);
		slotSavings = Math.max(0, before - afterSlots);
	}

	const unused = outletShiftEarlyReleaseUnusedWages(
		shift,
		patch,
		tierRates,
		prTierById,
	);
	const releaseSavings = Math.round(unused * outletCutlostUnusedShare(model));

	return Math.max(0, slotSavings + releaseSavings);
}

export type OutletCutLossShiftSlice = {
	quantity: number;
	releasedEarlyPrIds?: string[];
	releasedEarlyAt?: Record<string, string>;
	demandCut?: number;
	salesTargetPct?: number;
};

export function outletShiftEffectiveDemand(
	shift: OutletCutLossShiftSlice,
): number {
	return Math.max(0, shift.quantity - (shift.demandCut ?? 0));
}

/** PRs still on shift (excludes early releases). */
export function outletShiftSuppliedCount(shift: {
	prs?: string[];
	releasedEarlyPrIds?: string[];
}): number {
	return outletShiftActivePrIds(shift).length;
}

export function outletShiftDemandSupplied(
	shift: OutletCutLossShiftSlice & { prs?: string[] },
) {
	// Align with cut-slot apply path: early releases already leave the fillable demand.
	const demand = outletShiftSalesTargetHeadcount(shift);
	const supplied = outletShiftSuppliedCount(shift);
	return {
		demand,
		supplied,
		openSlots: Math.max(0, demand - supplied),
	};
}

export function outletShiftSalesTargetHeadcount(
	shift: OutletCutLossShiftSlice,
): number {
	const released = outletShiftReleasedEarlyIds(shift).length;
	return Math.max(0, outletShiftEffectiveDemand(shift) - released);
}

export function outletShiftTargetSalesForShift(
	shift: OutletCutLossShiftSlice,
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
): number {
	const headcount = outletShiftSalesTargetHeadcount(shift);
	const base = outletShiftTargetSalesRm(tierRates, headcount);
	const pct = Math.max(0, Math.min(100, shift.salesTargetPct ?? 100));
	return Math.round((base * pct) / 100);
}

export function outletUnfilledDemandSlots(
	shift: OutletCutLossShiftSlice & { prs?: string[] },
): number {
	return outletShiftDemandSupplied(shift).openSlots;
}

export function outletShiftCutLossAdjustmentsLabel(shift: {
	releasedEarlyPrIds?: string[];
	demandCut?: number;
	salesTargetPct?: number;
}): string | null {
	const parts: string[] = [];
	const released = outletShiftReleasedEarlyIds(shift).length;
	if (released > 0) parts.push(`${released} released early`);
	if ((shift.demandCut ?? 0) > 0) parts.push(`${shift.demandCut} demand cut`);
	const pct = shift.salesTargetPct ?? 100;
	if (pct < 100) parts.push(`${pct}% target`);
	return parts.length ? parts.join(" · ") : null;
}

/** Early-released PRs still free tonight (sent home unless agency reassigns). */
export function listEarlyReleasedPrsForReassign(
	shifts: Array<{
		id: string;
		outletName?: string;
		event?: string;
		shift?: string;
		status?: string;
		releasedEarlyPrIds?: string[];
		releasedEarlyAt?: Record<string, string>;
	}>,
	agencyPRs: Array<{ id: string; name: string }>,
): Array<{
	prId: string;
	prName: string;
	fromShiftId: string;
	fromOutlet: string;
	fromEvent: string;
	shiftLabel: string;
	releasedAt?: string;
}> {
	const out: Array<{
		prId: string;
		prName: string;
		fromShiftId: string;
		fromOutlet: string;
		fromEvent: string;
		shiftLabel: string;
		releasedAt?: string;
	}> = [];
	for (const sh of shifts) {
		if (sh.status === "sealed") continue;
		for (const prId of outletShiftReleasedEarlyIds(sh)) {
			out.push({
				prId,
				prName: agencyPRs.find((p) => p.id === prId)?.name ?? prId,
				fromShiftId: sh.id,
				fromOutlet: sh.outletName ?? "",
				fromEvent: sh.event ?? "",
				shiftLabel: sh.shift ?? "",
				releasedAt: sh.releasedEarlyAt?.[prId],
			});
		}
	}
	return out;
}
