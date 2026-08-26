import {
	defaultHappyHourDrinkPct,
	OUTLET_BASE_TIER,
	OUTLET_PR_TIERS,
	type OutletPrTier,
	type OutletTierRateSettings,
	snapTierWage,
} from "@agency-portal/lib/agency-demo";
import type { PrPayClass } from "@agency-portal/lib/pr-penalties";
import { fill } from "@/lib/portal-i18n/fill";
import { tierLabel } from "@/lib/portal-i18n/language-label";
import {
	type PortalTranslations,
	translations,
} from "@/lib/portal-i18n/translations";

/**
 * The pay ladder. `id` and `outletTier` are STORED values — `outletTier` is also
 * the key of every `tierRates` record — and `label` is the RAW ladder string
 * those rows are matched by, not display copy. All three stay English in every
 * locale; the rendered text is produced by `tierLabel(label, t)`.
 */
export const POST_JOB_PAY_TIER_OPTIONS = [
	{ id: "tier_1", label: "Tier 1", outletTier: "Tier I" as OutletPrTier },
	{ id: "tier_2", label: "Tier 2", outletTier: "Tier II" as OutletPrTier },
	{ id: "tier_3", label: "Tier 3", outletTier: "Tier III" as OutletPrTier },
	{ id: "tier_4", label: "Tier 4", outletTier: "Tier IV" as OutletPrTier },
	{ id: "tier_5", label: "Tier 5", outletTier: "Tier V" as OutletPrTier },
	{ id: "servant", label: "Servant", outletTier: "Servant" as OutletPrTier },
	{ id: "commission_only", label: "Commission only", outletTier: null },
] as const;

export type PostJobPayTierId = (typeof POST_JOB_PAY_TIER_OPTIONS)[number]["id"];

/** Tier I–V — primary pay ladder columns in the composer grid. */
export const RANKED_POST_JOB_PAY_TIER_IDS: PostJobPayTierId[] = [
	"tier_1",
	"tier_2",
	"tier_3",
	"tier_4",
	"tier_5",
];

/** All composer columns — ranked tiers first, then Servant and Commission only. */
export const ALL_POST_JOB_PAY_TIER_IDS: PostJobPayTierId[] =
	POST_JOB_PAY_TIER_OPTIONS.map((option) => option.id);

export function payTierDisplayOrder(payTierId: PostJobPayTierId): number {
	const idx = POST_JOB_PAY_TIER_OPTIONS.findIndex(
		(option) => option.id === payTierId,
	);
	return idx >= 0 ? idx : 999;
}

/** Ensure every pay tier column exists (fixed order, prCount preserved). */
export function ensureAllPayTierRows(
	rows: PostJobPayTierRow[],
	workspaceTierRates?: Record<OutletPrTier, OutletTierRateSettings>,
	commissionOnlyRates?: CommissionOnlyRateSettings,
): PostJobPayTierRow[] {
	const byTierId = new Map(rows.map((row) => [row.payTierId, row]));
	return ALL_POST_JOB_PAY_TIER_IDS.map((payTierId) => {
		const existing = byTierId.get(payTierId);
		if (existing) return existing;
		return newPostJobPayTierRow(
			{ payTierId, prCount: 0 },
			workspaceTierRates,
			commissionOnlyRates,
		);
	});
}

export type PostJobPayTierRow = {
	id: string;
	payTierId: PostJobPayTierId;
	wagePerHour: number;
	targetSalesRm?: number;
	drinkPct: number;
	tipPct: number;
	prCount: number;
};

export const COMMISSION_ONLY_DEFAULT_DRINK_PCT = 80;
export const COMMISSION_ONLY_DEFAULT_TIP_PCT = 85;
/** Legacy workspace default — cleared on hydrate; targets are set per shift in Post Job. */
export const COMMISSION_ONLY_DEFAULT_TARGET_SALES_RM = 2500;

export type CommissionOnlyRateSettings = Pick<
	OutletTierRateSettings,
	"drinkPct" | "happyHourDrinkPct" | "tipPct" | "targetSalesRm"
>;

export function defaultCommissionOnlyRateSettings(): CommissionOnlyRateSettings {
	return {
		drinkPct: COMMISSION_ONLY_DEFAULT_DRINK_PCT,
		happyHourDrinkPct: defaultHappyHourDrinkPct(
			COMMISSION_ONLY_DEFAULT_DRINK_PCT,
		),
		tipPct: COMMISSION_ONLY_DEFAULT_TIP_PCT,
	};
}

export function isCommissionOnlyPayTier(payTierId: PostJobPayTierId): boolean {
	return payTierId === "commission_only";
}

/** Pay class a shift's pay tier belongs to — commission_only slots are commissionOnly, all others basic. */
export function payTierPayClass(payTierId: PostJobPayTierId): PrPayClass {
	return isCommissionOnlyPayTier(payTierId) ? "commissionOnly" : "basic";
}

/** Booking rule: a commission-only PR may only work commission-only slots; a basic PR only basic-wage slots. */
export function canPrWorkPayTier(
	prPayClass: PrPayClass,
	payTierId: PostJobPayTierId,
): boolean {
	return payTierPayClass(payTierId) === prPayClass;
}

export function isServantPayTier(payTierId: PostJobPayTierId): boolean {
	return payTierId === "servant";
}

export function postJobPayTierLabel(payTierId: PostJobPayTierId): string {
	return (
		POST_JOB_PAY_TIER_OPTIONS.find((o) => o.id === payTierId)?.label ??
		payTierId
	);
}

export function postJobPayTierLabelForOutletTier(tier: OutletPrTier): string {
	return (
		POST_JOB_PAY_TIER_OPTIONS.find((o) => o.outletTier === tier)?.label ?? tier
	);
}

export function outletTierForPostJobPayTier(
	payTierId: PostJobPayTierId,
): OutletPrTier | null {
	return (
		POST_JOB_PAY_TIER_OPTIONS.find((o) => o.id === payTierId)?.outletTier ??
		null
	);
}

export function postJobPayTierIdForOutletTier(
	tier: OutletPrTier,
): PostJobPayTierId {
	return (
		POST_JOB_PAY_TIER_OPTIONS.find((o) => o.outletTier === tier)?.id ?? "tier_1"
	);
}

export type ShiftTierStaffing = { demand: number; supplied: number };

/** Per pay-tier requested headcount and supplied PRs (supplied capped at demand). */
export function shiftTierStaffingByPayTier(opts: {
	payTierRows?: PostJobPayTierRow[];
	quantity: number;
	demandCut?: number;
	releasedEarlyPrIds?: string[];
	tierRates: Record<OutletPrTier, OutletTierRateSettings>;
	bookedPrIds?: string[];
	agencyPRs?: { id: string; trainingLevel?: string }[];
	/**
	 * Seats taken per tier, counted by the SERVER across every agency on the shift.
	 *
	 * Wins over the local count when present. The local one derives each booked PR's
	 * tier from `agencyPRs` — a list the outlet portal does not have on a real
	 * session, which is why this column read 0 with a PR plainly on the shift. Tier is
	 * a fact about a PR's membership of an AGENCY, so the outlet can never compute it.
	 */
	suppliedByTierBucket?: Record<string, number>;
}): Partial<Record<PostJobPayTierId, ShiftTierStaffing>> {
	const demandRows = resolveEffectiveShiftPayTierRows({
		payTierRows: opts.payTierRows,
		quantity: opts.quantity,
		demandCut: opts.demandCut,
		releasedEarlyPrIds: opts.releasedEarlyPrIds,
		tierRates: opts.tierRates,
		bookedPrIds: opts.bookedPrIds,
		agencyPRs: opts.agencyPRs,
	});
	const booked = countBookedPrsByPayTier(
		opts.bookedPrIds ?? [],
		opts.agencyPRs ?? [],
	);
	const suppliedMap = suppliedByPayTierDemand(demandRows, booked);
	// Server buckets are OUTLET labels ("Tier I"); the composer keys rows by its own
	// pay-tier id. Convert once here rather than at each read.
	const serverSupplied: Record<string, number> | null =
		opts.suppliedByTierBucket
			? Object.fromEntries(
					Object.entries(opts.suppliedByTierBucket).map(([bucket, count]) => [
						bucket === "commission_only"
							? "commission_only"
							: postJobPayTierIdForOutletTier(bucket as OutletPrTier),
						count,
					]),
				)
			: null;
	const out: Partial<Record<PostJobPayTierId, ShiftTierStaffing>> = {};
	for (const option of POST_JOB_PAY_TIER_OPTIONS) {
		const demandRow = demandRows.find((row) => row.payTierId === option.id);
		out[option.id] = {
			demand: demandRow?.prCount ?? 0,
			// ⚠️ ALL-OR-NOTHING, never per key.
			//
			// This was `serverSupplied?.[option.id] ?? suppliedMap[option.id] ?? 0`,
			// which reads as "prefer the server" and is not: the server sends only
			// the tiers that actually have someone on them, so every OTHER tier
			// missed the map and fell through to the local guess. One booked PR was
			// then counted twice — once by the server under the tier her SUPPLYING
			// agency grades her, and again locally under the tier a DIFFERENT
			// agency grades her, because `agencyPRs` carries one tier per person
			// and a person's tier differs per agency. Tier I and Tier II each read
			// 1 supplied against a single booked PR, while the headline (the
			// server's `total`) correctly said 1.
			//
			// An absent key in a server map that COUNTS OCCUPANCY means zero, not
			// "unknown, go and guess". Per-key fallback is only ever right when
			// absence means "not measured".
			supplied: serverSupplied
				? (serverSupplied[option.id] ?? 0)
				: (suppliedMap[option.id] ?? 0),
		};
	}
	return out;
}

export function newPostJobPayTierRow(
	partial?: Partial<Omit<PostJobPayTierRow, "id">>,
	workspaceTierRates?: Record<OutletPrTier, OutletTierRateSettings>,
	commissionOnlyRates?: CommissionOnlyRateSettings,
): PostJobPayTierRow {
	const payTierId = partial?.payTierId ?? "tier_1";
	const outletTier = outletTierForPostJobPayTier(payTierId);
	const ws =
		outletTier && workspaceTierRates
			? workspaceTierRates[outletTier]
			: undefined;
	const commissionOnly = isCommissionOnlyPayTier(payTierId);
	const coDefaults = commissionOnlyRates ?? defaultCommissionOnlyRateSettings();
	const baseWage =
		workspaceTierRates?.[OUTLET_BASE_TIER]?.wagePerHour ??
		snapTierWage(partial?.wagePerHour ?? ws?.wagePerHour ?? 500);

	return {
		id: `pay-tier-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
		payTierId,
		wagePerHour: commissionOnly
			? 0
			: snapTierWage(partial?.wagePerHour ?? ws?.wagePerHour ?? baseWage),
		targetSalesRm:
			partial?.targetSalesRm ??
			(commissionOnly ? coDefaults.targetSalesRm : undefined),
		drinkPct:
			partial?.drinkPct ??
			(commissionOnly ? coDefaults.drinkPct : (ws?.drinkPct ?? 10)),
		tipPct:
			partial?.tipPct ??
			(commissionOnly ? coDefaults.tipPct : (ws?.tipPct ?? 15)),
		prCount: partial?.prCount != null ? Math.max(0, partial.prCount) : 1,
	};
}

export function allocateDiversePayTierSplit(
	quantity: number,
): Array<{ payTierId: PostJobPayTierId; prCount: number }> {
	const total = Math.max(0, Math.floor(quantity));
	if (total === 0) return [];
	if (total === 1) return [{ payTierId: "tier_1", prCount: 1 }];
	if (total === 2) {
		return [
			{ payTierId: "tier_1", prCount: 1 },
			{ payTierId: "tier_2", prCount: 1 },
		];
	}

	const tier3 = total >= 6 ? Math.max(1, Math.round(total * 0.11)) : 0;
	const tier2 = Math.max(1, Math.round(total * 0.22));
	const tier1 = Math.max(1, total - tier2 - tier3);

	return [
		{ payTierId: "tier_1", prCount: tier1 },
		{ payTierId: "tier_2", prCount: tier2 },
		...(tier3 > 0 ? [{ payTierId: "tier_3" as const, prCount: tier3 }] : []),
	];
}

export function payTierRowsFromSplit(
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	split: Array<{ payTierId: PostJobPayTierId; prCount: number }>,
	idPrefix?: string,
): PostJobPayTierRow[] {
	return split
		.filter(
			(entry) => entry.prCount > 0 && !isCommissionOnlyPayTier(entry.payTierId),
		)
		.map((entry) => ({
			...newPostJobPayTierRow(
				{ payTierId: entry.payTierId, prCount: entry.prCount },
				tierRates,
			),
			...(idPrefix ? { id: `${idPrefix}-${entry.payTierId}` } : {}),
		}));
}

export function defaultPostJobPayTierRows(
	workspaceTierRates: Record<OutletPrTier, OutletTierRateSettings>,
	quantity = 6,
): PostJobPayTierRow[] {
	return payTierRowsFromSplit(
		workspaceTierRates,
		allocateDiversePayTierSplit(quantity),
	);
}

export function payTierRowsFromLegacy(
	payTierIds: OutletPrTier[] | undefined,
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	quantity: number,
): PostJobPayTierRow[] {
	if (!payTierIds?.length) {
		return defaultPostJobPayTierRows(tierRates, quantity);
	}
	const perTier = Math.max(1, Math.floor(quantity / payTierIds.length));
	return payTierIds.map((outletTier) => {
		const option = POST_JOB_PAY_TIER_OPTIONS.find(
			(o) => o.outletTier === outletTier,
		);
		const rates = tierRates[outletTier];
		return newPostJobPayTierRow(
			{
				payTierId: option?.id ?? "tier_1",
				wagePerHour: rates.wagePerHour,
				targetSalesRm: rates.targetSalesRm,
				drinkPct: rates.drinkPct,
				tipPct: rates.tipPct,
				prCount: perTier,
			},
			tierRates,
		);
	});
}

export function clonePostJobPayTierRow(
	row: PostJobPayTierRow,
): PostJobPayTierRow {
	return { ...row };
}

export function totalPrCountFromPayTierRows(
	rows?: PostJobPayTierRow[],
): number {
	return (rows ?? []).reduce((sum, row) => sum + row.prCount, 0);
}

/** Set total PR headcount while preserving tier rows — adds to Tier 1, trims from last rows. */
export function adjustPayTierRowsToTotal(
	rows: PostJobPayTierRow[],
	targetTotal: number,
): PostJobPayTierRow[] {
	const capped = Math.max(0, targetTotal);
	if (!rows.length) return rows;

	const current = totalPrCountFromPayTierRows(rows);
	if (current === capped) return rows;

	if (capped === 0) {
		return rows.map((row) => ({ ...row, prCount: 0 }));
	}

	if (current === 0) {
		const tier1Idx = rows.findIndex((row) => row.payTierId === "tier_1");
		const targetIdx = tier1Idx >= 0 ? tier1Idx : 0;
		return rows.map((row, index) => ({
			...row,
			prCount: index === targetIdx ? capped : 0,
		}));
	}

	if (current < capped) {
		const delta = capped - current;
		const addIdx = rows.findIndex((row) => row.prCount > 0);
		const targetIdx = addIdx >= 0 ? addIdx : 0;
		return rows.map((row, index) =>
			index === targetIdx ? { ...row, prCount: row.prCount + delta } : row,
		);
	}

	let toRemove = current - capped;
	const next = rows.map((row) => ({ ...row }));
	for (let i = next.length - 1; i >= 0 && toRemove > 0; i--) {
		const peel = Math.min(next[i].prCount, toRemove);
		next[i] = { ...next[i], prCount: next[i].prCount - peel };
		toRemove -= peel;
	}
	return next;
}

export function workspaceTierRatesSignature(
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
): string {
	return OUTLET_PR_TIERS.map((tier) => {
		const r = tierRates[tier];
		return `${tier}:${r.wagePerHour},${r.drinkPct},${r.tipPct},${r.targetSalesRm ?? ""},${r.otAfterHours}`;
	}).join("|");
}

/** Pull latest workspace wage, commission, and sales targets into post-job pay rows (keeps tier + PR count). */
export function syncPayTierRowsFromWorkspace(
	rows: PostJobPayTierRow[],
	workspaceTierRates: Record<OutletPrTier, OutletTierRateSettings>,
	commissionOnlyRates?: CommissionOnlyRateSettings,
): PostJobPayTierRow[] {
	const coDefaults = commissionOnlyRates ?? defaultCommissionOnlyRateSettings();
	return rows.map((row) => {
		if (isCommissionOnlyPayTier(row.payTierId)) {
			return {
				...row,
				wagePerHour: 0,
				drinkPct: coDefaults.drinkPct,
				tipPct: coDefaults.tipPct,
				targetSalesRm: coDefaults.targetSalesRm,
			};
		}
		const outletTier = outletTierForPostJobPayTier(row.payTierId);
		if (!outletTier) return row;
		const ws = workspaceTierRates[outletTier];
		return {
			...row,
			wagePerHour: snapTierWage(ws.wagePerHour),
			drinkPct: ws.drinkPct,
			tipPct: ws.tipPct,
			targetSalesRm: ws.targetSalesRm,
		};
	});
}

export function syncTierRatesFromPayTierRows(
	rows: PostJobPayTierRow[],
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
): Record<OutletPrTier, OutletTierRateSettings> {
	const next = { ...tierRates };
	for (const tier of OUTLET_PR_TIERS) {
		next[tier] = { ...next[tier] };
	}
	for (const row of rows) {
		const outletTier = outletTierForPostJobPayTier(row.payTierId);
		if (!outletTier) continue;
		next[outletTier] = {
			...next[outletTier],
			wagePerHour: row.wagePerHour,
			drinkPct: row.drinkPct,
			tipPct: row.tipPct,
			targetSalesRm: row.targetSalesRm,
		};
	}
	return next;
}

export function applyPayTierRowChange(
	row: PostJobPayTierRow,
	patch: Partial<PostJobPayTierRow>,
	workspaceTierRates: Record<OutletPrTier, OutletTierRateSettings>,
	commissionOnlyRates?: CommissionOnlyRateSettings,
): PostJobPayTierRow {
	const nextPayTierId = patch.payTierId ?? row.payTierId;
	const switchingTier =
		patch.payTierId != null && patch.payTierId !== row.payTierId;
	const commissionOnly = isCommissionOnlyPayTier(nextPayTierId);
	const outletTier = outletTierForPostJobPayTier(nextPayTierId);
	const ws = outletTier ? workspaceTierRates[outletTier] : undefined;
	const coDefaults = commissionOnlyRates ?? defaultCommissionOnlyRateSettings();
	const baseWage = workspaceTierRates[OUTLET_BASE_TIER]?.wagePerHour ?? 500;

	let next: PostJobPayTierRow = { ...row, ...patch, payTierId: nextPayTierId };

	if (switchingTier) {
		next = {
			...next,
			wagePerHour: commissionOnly
				? 0
				: snapTierWage(ws?.wagePerHour ?? baseWage),
			drinkPct: commissionOnly ? coDefaults.drinkPct : (ws?.drinkPct ?? 10),
			tipPct: commissionOnly ? coDefaults.tipPct : (ws?.tipPct ?? 15),
			targetSalesRm: commissionOnly
				? coDefaults.targetSalesRm
				: ws?.targetSalesRm,
		};
	}

	if (commissionOnly && patch.wagePerHour == null && !switchingTier) {
		next.wagePerHour = 0;
	}

	if (patch.wagePerHour != null && !commissionOnly) {
		next.wagePerHour = snapTierWage(patch.wagePerHour);
	}

	if (patch.prCount != null) {
		next.prCount = Math.max(0, patch.prCount);
	}

	return next;
}

/** Cap tier row PR counts so the total does not exceed the people-needed limit. */
export function clampPayTierRowsToMax(
	rows: PostJobPayTierRow[],
	maxTotal: number,
	changedRowId?: string,
): PostJobPayTierRow[] {
	const max = Math.max(0, maxTotal);
	const current = totalPrCountFromPayTierRows(rows);
	if (current <= max) return rows;

	if (changedRowId) {
		const others = rows
			.filter((row) => row.id !== changedRowId)
			.reduce((sum, row) => sum + row.prCount, 0);
		const rowMax = Math.max(0, max - others);
		return rows.map((row) =>
			row.id === changedRowId
				? { ...row, prCount: Math.min(row.prCount, rowMax) }
				: row,
		);
	}

	return adjustPayTierRowsToTotal(rows, max);
}

/**
 * One posted pay-tier row as a sentence — "Tier 1 · RM 500/shift · 10% drinks ·
 * 15% tips · 6 PRs".
 *
 * The tier name goes through `tierLabel()`: `postJobPayTierLabel()` hands back
 * the RAW ladder value ("Tier 1", "Servant", "Commission only"), which is what
 * the saved rate rows are keyed by, so only the rendered text changes.
 *
 * The wage half is a PRICE, not a headcount — a row whose `prCount` is 0 still
 * carries the rate the outlet is offering for that tier, and it keeps printing
 * that rate here.
 *
 * `t` is optional ONLY so the call sites can be wired one at a time; pass it
 * wherever the caller has a locale. Falling back to `translations.en` keeps the
 * English in the dictionary instead of making a second copy of it here.
 */
export function formatPayTierRowSummary(
	row: PostJobPayTierRow,
	t?: PortalTranslations,
): string {
	const tx = t ?? translations.en;
	const shiftWage = isCommissionOnlyPayTier(row.payTierId)
		? 0
		: row.wagePerHour;
	const parts = [
		tierLabel(postJobPayTierLabel(row.payTierId), tx),
		fill(tx.manageOutlet.perShift, {
			wage: shiftWage.toLocaleString("en-MY"),
		}),
		fill(tx.libTiers.drinksTipsPct, {
			drinks: row.drinkPct,
			tips: row.tipPct,
		}),
		row.targetSalesRm
			? fill(tx.libTiers.targetSales, { amount: row.targetSalesRm })
			: null,
		fill(
			row.prCount === 1 ? tx.rosterGrid.prCountOne : tx.rosterGrid.prCountMany,
			{ n: row.prCount },
		),
	].filter(Boolean);
	return parts.join(" · ");
}

/**
 * Short tier label for compact cards — e.g. T1, T2, Comm.
 *
 * "T1"…"T5" is the ladder's own numeric shorthand and reads the same in both
 * locales; the compact card has no room for the spelled-out tier name. Servant
 * falls through to the full resolved label.
 */
export function postJobPayTierShortLabel(
	payTierId: PostJobPayTierId,
	t?: PortalTranslations,
): string {
	const tx = t ?? translations.en;
	if (isCommissionOnlyPayTier(payTierId)) return tx.libTiers.commissionShort;
	const match = payTierId.match(/^tier_(\d)$/);
	return match ? `T${match[1]}` : tierLabel(postJobPayTierLabel(payTierId), tx);
}

/** Compact tier × count summary — e.g. "6× T1 · 1× T2". */
export function formatPayTierRowsCompact(
	rows?: PostJobPayTierRow[],
	t?: PortalTranslations,
): string | null {
	const parts = (rows ?? [])
		.filter((row) => row.prCount > 0)
		.map(
			(row) => `${row.prCount}× ${postJobPayTierShortLabel(row.payTierId, t)}`,
		);
	return parts.length ? parts.join(" · ") : null;
}

export function resolveShiftPayTierRows(input: {
	payTierRows?: PostJobPayTierRow[];
	quantity: number;
	tierRates?: Record<OutletPrTier, OutletTierRateSettings>;
}): PostJobPayTierRow[] {
	const quantity = Math.max(0, Math.floor(input.quantity));
	if (input.payTierRows?.length) {
		return adjustPayTierRowsToTotal(
			input.payTierRows.filter((row) => row.prCount > 0),
			quantity,
		);
	}
	if (input.tierRates) {
		return defaultPostJobPayTierRows(input.tierRates, quantity);
	}
	return [];
}

/** Peel demand only from unfilled slots per tier (Tier 1 → 5), never below supplied. */
export function applyOpenSlotDemandCut(
	rows: PostJobPayTierRow[],
	bookedByTier: Partial<Record<PostJobPayTierId, number>>,
	demandCut: number,
): PostJobPayTierRow[] {
	let remaining = Math.max(0, Math.floor(demandCut));
	if (remaining <= 0) return rows.map((row) => ({ ...row }));

	const next = rows.map((row) => ({ ...row }));
	for (const option of POST_JOB_PAY_TIER_OPTIONS) {
		if (remaining <= 0) break;
		const idx = next.findIndex((row) => row.payTierId === option.id);
		if (idx < 0) continue;
		const row = next[idx];
		const supplied = bookedByTier[option.id] ?? 0;
		const open = Math.max(0, row.prCount - supplied);
		const peel = Math.min(open, remaining);
		if (peel <= 0) continue;
		next[idx] = { ...row, prCount: row.prCount - peel };
		remaining -= peel;
	}
	return next;
}

function countPrIdsByPayTier(
	prIds: string[],
	agencyPRs?: { id: string; trainingLevel?: string }[],
	prTierById?: Record<string, string | undefined>,
): Partial<Record<PostJobPayTierId, number>> {
	if (agencyPRs?.length) {
		return countBookedPrsByPayTier(prIds, agencyPRs);
	}
	const counts: Partial<Record<PostJobPayTierId, number>> = {};
	for (const prId of prIds) {
		// Same rule as countBookedPrsByPayTier above: no tier on file means the
		// PR is not counted into one. `?? "Tier I"` priced them silently.
		const outletTier = prTierById?.[prId] as OutletPrTier | undefined;
		if (!outletTier) continue;
		const payTierId = postJobPayTierIdForOutletTier(outletTier);
		counts[payTierId] = (counts[payTierId] ?? 0) + 1;
	}
	return counts;
}

/** Posted pay tiers after open-slot cuts and early releases — preserves filled tiers. */
export function resolveEffectiveShiftPayTierRows(input: {
	payTierRows?: PostJobPayTierRow[];
	quantity: number;
	demandCut?: number;
	releasedEarlyPrIds?: string[];
	tierRates?: Record<OutletPrTier, OutletTierRateSettings>;
	bookedPrIds?: string[];
	agencyPRs?: { id: string; trainingLevel?: string }[];
	prTierById?: Record<string, string | undefined>;
}): PostJobPayTierRow[] {
	const baseRows = resolveShiftPayTierRows({
		payTierRows: input.payTierRows,
		quantity: input.quantity,
		tierRates: input.tierRates,
	});
	const activeIds = input.bookedPrIds ?? [];
	const releasedIds = [...new Set(input.releasedEarlyPrIds ?? [])];
	// Seats that were filled (still on floor + released early) — demand cuts only remove never-filled opens.
	const filledForCut = [...new Set([...activeIds, ...releasedIds])];
	const bookedForCut = countPrIdsByPayTier(
		filledForCut,
		input.agencyPRs,
		input.prTierById,
	);

	let rows = baseRows;
	const demandCut = input.demandCut ?? 0;
	if (demandCut > 0) {
		rows = applyOpenSlotDemandCut(rows, bookedForCut, demandCut);
	}

	if (releasedIds.length > 0) {
		const releasedByTier = countPrIdsByPayTier(
			releasedIds,
			input.agencyPRs,
			input.prTierById,
		);
		rows = rows.map((row) => {
			const peel = releasedByTier[row.payTierId] ?? 0;
			return { ...row, prCount: Math.max(0, row.prCount - peel) };
		});
	}

	// Never show requested below currently supplied active PRs.
	const activeByTier = countPrIdsByPayTier(
		activeIds,
		input.agencyPRs,
		input.prTierById,
	);
	rows = rows.map((row) => {
		const floor = activeByTier[row.payTierId] ?? 0;
		return floor > row.prCount ? { ...row, prCount: floor } : row;
	});

	return rows;
}

export function payTierRowShiftWage(
	row: PostJobPayTierRow,
	tierRates?: Record<OutletPrTier, OutletTierRateSettings>,
): number {
	if (isCommissionOnlyPayTier(row.payTierId)) return 0;
	const outletTier = outletTierForPostJobPayTier(row.payTierId);
	if (outletTier && tierRates?.[outletTier]) {
		return tierRates[outletTier].wagePerHour;
	}
	return row.wagePerHour;
}

export function estimatePayTierRowsLaborCost(
	rows: PostJobPayTierRow[],
	tierRates?: Record<OutletPrTier, OutletTierRateSettings>,
): number {
	return rows.reduce(
		(sum, row) => sum + payTierRowShiftWage(row, tierRates) * row.prCount,
		0,
	);
}

export function basePayFromPayTierRows(rows?: PostJobPayTierRow[]): number {
	if (!rows?.length) return 0;
	const tier1 = rows.find((r) => r.payTierId === "tier_1");
	if (tier1) return tier1.wagePerHour;
	const firstPaid = rows.find((r) => !isCommissionOnlyPayTier(r.payTierId));
	return firstPaid?.wagePerHour ?? rows[0]?.wagePerHour ?? 0;
}

/**
 * Count booked PRs by pay tier from agency training levels.
 *
 * A PR whose tier nobody has set is NOT counted. This used to read
 * `pr?.trainingLevel ?? "Tier I"` with a second `?? "tier_1"` behind it, so an
 * ungraded PR — or one simply missing from the roster passed in — was priced at
 * Tier I rates. That is not a cosmetic default like a blank age: these counts
 * drive the posted pay-tier rows, so it put real ringgit against a tier nobody
 * ever assigned. An unknown tier is unknown; the tier rows stay as posted.
 */
export function countBookedPrsByPayTier(
	prIds: string[],
	agencyPRs: { id: string; trainingLevel?: string }[],
): Partial<Record<PostJobPayTierId, number>> {
	const counts = {} as Partial<Record<PostJobPayTierId, number>>;
	for (const prId of prIds) {
		const pr = agencyPRs.find((p) => p.id === prId);
		const payTierId = POST_JOB_PAY_TIER_OPTIONS.find(
			(option) => option.outletTier === pr?.trainingLevel,
		)?.id;
		if (!payTierId) continue;
		counts[payTierId] = (counts[payTierId] ?? 0) + 1;
	}
	return counts;
}

/** Supplied per tier — capped at outlet demand for each pay tier row. */
export function suppliedByPayTierDemand(
	demandRows: PostJobPayTierRow[],
	bookedByPayTier: Partial<Record<PostJobPayTierId, number>>,
): Record<PostJobPayTierId, number> {
	const out = {} as Record<PostJobPayTierId, number>;
	for (const row of demandRows) {
		const booked = bookedByPayTier[row.payTierId] ?? 0;
		out[row.payTierId] = Math.min(booked, row.prCount);
	}
	return out;
}
