import type { ComcardPreviewData } from "@agency-portal/components/agency/Comcard3dPreview";
import { IzHScroll } from "@agency-portal/components/iz/HScroll";
import {
	IzCard,
	IzSelect,
	IzTimeInput,
	normalizeTimeValue,
} from "@agency-portal/components/iz/ui";
import {
	OutletDatePopoverChip,
	OutletDatePopoverField,
	OutletDateRangePopover,
	OutletMultiDatePopover,
} from "@agency-portal/components/outlet/outlet-date-popover";
import { PostJobTierRatesEditor } from "@agency-portal/components/outlet/PostJobTierRatesEditor";
import {
	PostJobEditableInputShell,
	PostJobFormLegend,
	PostJobGroupHeader,
	PostJobInfoTip,
	PostJobShiftCardHeader,
	PostJobShiftField,
	PostJobTierSectionHeader,
} from "@agency-portal/components/outlet/post-job-shift-ui";
import { ShiftEventPriceEditor } from "@agency-portal/components/outlet/ShiftEventPriceEditor";
import { PrComcardPickerThumb } from "@agency-portal/components/pr/PortfolioComcardVisual";
import { JobPostingMicroLabel } from "@agency-portal/components/special-service/job-posting-ui";
import { useOutletEffectivePlan } from "@agency-portal/hooks/use-outlet-effective-plan";
import {
	buildDefaultTierRates,
	cloneTierRates,
	collectAgencyPrLanguages,
	estimateShiftLaborCost,
	OUTLET_BASE_TIER,
	OUTLET_PR_TIERS,
	type OutletPrTier,
	type OutletTierRateSettings,
	snapTierWage,
	tierWageFromMultiplier,
} from "@agency-portal/lib/agency-demo";
import type {
	OutletDrinkPrice,
	OutletWorkspaceSettings,
} from "@agency-portal/lib/outlet-demo";
import {
	cloneDrinkMenu,
	DRESS_CODE_OPTIONS,
	DRESS_CODE_OTHER_ID,
	drinkMenuPriceRange,
	formatDressCodeLabel,
	formatOutletPlanDailyHeadcountHint,
	formatOutletPlanPrPickerRule,
	formatShiftDrinkPricingSummary,
	formatShiftEventTypeSummary,
	isOtherDressCode,
	isOtherSpecialEvent,
	OUTLET_DRINKS_PRICE_SECTION_ID,
	OUTLET_TIER_RATES_SECTION_ID,
	outletDrinkCategory,
	SHIFT_EVENT_KIND_LABELS,
	SHIFT_SPECIAL_EVENT_OPTIONS,
	type ShiftDestination,
	type ShiftEventKind,
	type ShiftSpecialEventType,
	withDrinkCategoriesFromWorkspace,
} from "@agency-portal/lib/outlet-demo";
import {
	ALL_POST_JOB_PAY_TIER_IDS,
	adjustPayTierRowsToTotal,
	basePayFromPayTierRows,
	type CommissionOnlyRateSettings,
	clampPayTierRowsToMax,
	clonePostJobPayTierRow,
	ensureAllPayTierRows,
	estimatePayTierRowsLaborCost,
	formatPayTierRowSummary,
	isCommissionOnlyPayTier,
	newPostJobPayTierRow,
	type PostJobPayTierRow,
	payTierRowsFromLegacy,
	RANKED_POST_JOB_PAY_TIER_IDS,
	syncPayTierRowsFromWorkspace,
	syncTierRatesFromPayTierRows,
	totalPrCountFromPayTierRows,
	workspaceTierRatesSignature,
} from "@agency-portal/lib/post-job-pay-tiers";
import { formatStars } from "@agency-portal/lib/pr-rating-summary";
import { useStore } from "@agency-portal/lib/store";
import { cn } from "@agency-portal/lib/utils";
import { Link } from "@tanstack/react-router";
import { addDays, format, startOfToday } from "date-fns";
import {
	ArrowUpRight,
	Check,
	Lock,
	Minus,
	Pencil,
	Plus,
	Search,
	X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import {
	dressCodeLabel,
	languageLabel,
} from "@/lib/portal-i18n/language-label";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

const DEFAULT_DRAFT_TIER_BASE: OutletTierRateSettings = {
	wagePerHour: 60,
	drinkPct: 8,
	tipPct: 15,
	tablePct: 10,
	otAfterHours: 6,
};

const DRAFT_NORMAL_EVENT_DEFAULT = "Friday lounge";

const DRAFT_SPECIAL_EVENT_DEFAULTS: Record<ShiftSpecialEventType, string> = {
	vip: "Private VIP — Hennessy Launch",
	launch: "Champagne product launch",
	private_table: "Private table buyout",
	brand_activation: "Brand night activation",
	corporate: "Corporate table event",
	other: "",
};

const DRAFT_EVENT_PRESETS = new Set([
	DRAFT_NORMAL_EVENT_DEFAULT,
	"Private VIP - Hennessy Launch",
	...Object.values(DRAFT_SPECIAL_EVENT_DEFAULTS).filter(Boolean),
]);

export function defaultDraftEventName(
	eventKind: ShiftEventKind,
	specialEventType?: string,
): string {
	if (eventKind === "normal") return DRAFT_NORMAL_EVENT_DEFAULT;
	const type = (specialEventType ?? "vip") as ShiftSpecialEventType;
	return DRAFT_SPECIAL_EVENT_DEFAULTS[type] ?? "Special event";
}

/**
 * The suggested name, shown greyed out INSIDE the empty field. It is a hint, not
 * a value — the outlet types over it instead of first clearing seeded text.
 */
export function draftEventPlaceholder(
	eventKind: ShiftEventKind,
	t: PortalTranslations,
	specialEventType?: string,
): string {
	// The suggestion itself stays English: it is the literal `resolveDraftEventName`
	// posts if the outlet types nothing, so a translated hint would promise a name
	// the shift would not carry. Only the LAST-RESORT prompt — shown when a kind
	// suggests nothing at all — is real UI copy.
	return (
		defaultDraftEventName(eventKind, specialEventType) ||
		t.postJob.nameYourEvent
	);
}

/**
 * What actually gets posted: whatever the outlet typed, else the suggestion the
 * placeholder was showing. An untouched field must never post a blank name.
 */
export function resolveDraftEventName(
	shift: Pick<DraftShift, "event" | "eventKind" | "specialEventType">,
): string {
	return (
		shift.event.trim() ||
		defaultDraftEventName(shift.eventKind, shift.specialEventType)
	);
}

function resolveDraftEventOnPresetChange(current: string): string {
	// Clear a leftover preset literal (from an older draft) so the new kind's
	// suggestion shows as a placeholder; anything the outlet typed is kept.
	return DRAFT_EVENT_PRESETS.has(current.trim()) ? "" : current;
}

export function draftTierRatesFromWorkspace(
	ws: Pick<OutletWorkspaceSettings, "tierRates">,
): Record<OutletPrTier, OutletTierRateSettings> {
	return cloneTierRates(ws.tierRates);
}

/** Sync post-job pay rows from saved workspace rates while keeping tier rows and PR counts. */
export function applyWorkspaceRatesToDraftShift(
	shift: Pick<DraftShift, "payTierRows" | "prIds" | "quantity">,
	workspace: Pick<OutletWorkspaceSettings, "tierRates" | "commissionOnlyRates">,
): Pick<
	DraftShift,
	"tierRates" | "payTierRows" | "payPerHour" | "quantity" | "prIds"
> {
	const tierRates = draftTierRatesFromWorkspace(workspace);
	const payTierRows = clampPayTierRowsToMax(
		syncPayTierRowsFromWorkspace(
			ensureAllPayTierRows(
				shift.payTierRows,
				tierRates,
				workspace.commissionOnlyRates,
			),
			tierRates,
			workspace.commissionOnlyRates,
		),
		shift.quantity,
	);
	return {
		tierRates: syncTierRatesFromPayTierRows(payTierRows, tierRates),
		payTierRows,
		payPerHour: basePayFromPayTierRows(payTierRows),
		quantity: shift.quantity,
		prIds: shift.prIds.slice(0, shift.quantity),
	};
}

export { workspaceTierRatesSignature };

export type DraftShift = {
	id: string;
	/** The event template this draft was started from (0128), if any. */
	templateId?: string;
	/** That template's name — the post-time fallback when the owner leaves
	 * the Event name empty (the field starts blank on purpose, 20 Aug). */
	templateName?: string;
	selectedDateIsos: string[];
	event: string;
	eventKind: ShiftEventKind;
	specialEventType?: ShiftSpecialEventType;
	/** Custom label when specialEventType is "other" */
	customSpecialEventName?: string;
	/** Event-specific drink prices — only used when eventKind is special */
	eventDrinkMenu?: OutletDrinkPrice[];
	langs: string[];
	otherLang: string;
	starTiers: number[];
	shiftTime: string;
	quantity: number;
	prIds: string[];
	payPerHour: number;
	tierRates: Record<OutletPrTier, OutletTierRateSettings>;
	/** Pay rows configured for this shift (Tier 1–5 + Commission only) */
	payTierRows: PostJobPayTierRow[];
	dressCode: string;
	customDressCode?: string;
	destination: ShiftDestination;
};

function distributePrCounts(total: number, slots: number): number[] {
	const result = Array(slots).fill(0);
	if (total <= 0) return result;
	if (total >= slots) {
		const base = Math.floor(total / slots);
		const extra = total % slots;
		for (let i = 0; i < slots; i++) result[i] = base + (i < extra ? 1 : 0);
		return result;
	}
	for (let i = 0; i < total; i++) result[i] = 1;
	return result;
}

/** All tier columns (I–V + Servant + Commission only) — PR counts spread across Tier I–V only. */
export function defaultComposerPayTierRows(
	workspaceTierRates: Record<OutletPrTier, OutletTierRateSettings>,
	totalQuantity = 6,
	commissionOnlyRates?: CommissionOnlyRateSettings,
): PostJobPayTierRow[] {
	const rankedCounts = distributePrCounts(
		totalQuantity,
		RANKED_POST_JOB_PAY_TIER_IDS.length,
	);
	return ALL_POST_JOB_PAY_TIER_IDS.map((payTierId) => {
		const rankedIndex = RANKED_POST_JOB_PAY_TIER_IDS.indexOf(payTierId);
		const prCount = rankedIndex >= 0 ? rankedCounts[rankedIndex]! : 0;
		return newPostJobPayTierRow(
			{ payTierId, prCount },
			workspaceTierRates,
			commissionOnlyRates,
		);
	});
}

export function newDraftShift(
	partial?: Partial<Omit<DraftShift, "id">>,
	workspace?: Pick<OutletWorkspaceSettings, "tierRates" | "drinkMenu">,
): DraftShift {
	const tierRates = partial?.tierRates
		? cloneTierRates(partial.tierRates)
		: workspace?.tierRates
			? cloneTierRates(workspace.tierRates)
			: buildDefaultTierRates(DEFAULT_DRAFT_TIER_BASE);
	const eventKind = partial?.eventKind ?? "normal";
	const workspaceDrinks = workspace?.drinkMenu ?? [];
	const eventDrinkMenu =
		partial?.eventDrinkMenu ??
		(eventKind === "special" && workspaceDrinks.length > 0
			? cloneDrinkMenu(workspaceDrinks)
			: undefined);
	const defaultDateIso = isoFromJobDate(startOfToday());
	const defaultQuantity = partial?.quantity ?? 6;
	const legacyPayTierIds = (
		partial as { payTierIds?: OutletPrTier[] } | undefined
	)?.payTierIds;
	const payTierRows = partial?.payTierRows?.length
		? ensureAllPayTierRows(
				partial.payTierRows.map(clonePostJobPayTierRow),
				tierRates,
			)
		: legacyPayTierIds?.length
			? ensureAllPayTierRows(
					payTierRowsFromLegacy(legacyPayTierIds, tierRates, defaultQuantity),
					tierRates,
				)
			: defaultComposerPayTierRows(tierRates, defaultQuantity);
	const quantity =
		partial?.quantity ?? totalPrCountFromPayTierRows(payTierRows);
	return {
		id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
		selectedDateIsos: partial?.selectedDateIsos?.length
			? sortJobDateIsos(partial.selectedDateIsos)
			: [defaultDateIso],
		// Empty by default — the suggested name renders as a placeholder instead,
		// so a fresh draft has nothing to delete before typing. resolveDraftEventName
		// puts the suggestion back at post time.
		event: partial?.event ?? "",
		eventKind,
		specialEventType: partial?.specialEventType ?? "vip",
		customSpecialEventName: partial?.customSpecialEventName ?? "",
		eventDrinkMenu,
		langs: partial?.langs ? [...partial.langs] : [],
		otherLang: partial?.otherLang ?? "",
		starTiers: partial?.starTiers ? [...partial.starTiers] : [4, 5],
		shiftTime: partial?.shiftTime ?? "22:00 - 04:00",
		quantity,
		prIds: partial?.prIds ? [...partial.prIds] : [],
		tierRates: syncTierRatesFromPayTierRows(payTierRows, tierRates),
		payPerHour: snapPayPerHour(
			partial?.payPerHour ?? basePayFromPayTierRows(payTierRows),
		),
		payTierRows,
		dressCode: partial?.dressCode ?? DRESS_CODE_OPTIONS[0],
		customDressCode: partial?.customDressCode ?? "",
		destination: partial?.destination ?? "both",
	};
}

export function patchDraftTierRates(
	tierRates: Record<OutletPrTier, OutletTierRateSettings>,
	tier: OutletPrTier,
	tierPatch: Partial<OutletTierRateSettings>,
	options?: {
		cascadeFromBase?: boolean;
		tierMultipliers?: Record<OutletPrTier, number>;
	},
): Record<OutletPrTier, OutletTierRateSettings> {
	const patch = { ...tierPatch };
	if (patch.wagePerHour != null)
		patch.wagePerHour = snapTierWage(patch.wagePerHour);
	const next = {
		...tierRates,
		[tier]: { ...tierRates[tier], ...patch },
	};
	const cascade = options?.cascadeFromBase !== false;
	if (cascade && tier === OUTLET_BASE_TIER && patch.wagePerHour != null) {
		const base = next[OUTLET_BASE_TIER];
		const mults = options?.tierMultipliers;
		if (mults) {
			for (const t of OUTLET_PR_TIERS) {
				next[t] = {
					...next[t],
					wagePerHour: tierWageFromMultiplier(base.wagePerHour, mults[t]),
				};
			}
		} else {
			const rebuilt = buildDefaultTierRates(base);
			for (const t of OUTLET_PR_TIERS) {
				next[t] = { ...next[t], wagePerHour: rebuilt[t].wagePerHour };
			}
		}
	}
	return next;
}

export function estimateDraftShiftCost(
	shift: Pick<
		DraftShift,
		"payTierRows" | "tierRates" | "quantity" | "shiftTime" | "prIds"
	>,
	prTierById?: Record<string, string | undefined>,
): number {
	if (shift.payTierRows?.length) {
		return estimatePayTierRowsLaborCost(shift.payTierRows, shift.tierRates);
	}
	const p = parseShiftTime(shift.shiftTime);
	const start = p.startH * 60 + p.startM;
	let end = p.endH * 60 + p.endM;
	if (end <= start) end += 24 * 60;
	const hours = Math.max(1, Math.round((end - start) / 60));
	return estimateShiftLaborCost({
		tierRates: shift.tierRates,
		hours,
		quantity: shift.quantity,
		prIds: shift.prIds,
		prTierById,
	});
}

export function formatDraftPrNames(
	prIds: string[],
	prs: { id: string; name: string }[],
	t: PortalTranslations,
): string {
	if (prIds.length === 0) return t.postJob.noneSelected;
	return prIds.map((id) => prs.find((p) => p.id === id)?.name ?? id).join(", ");
}

export function formatJobDate(d: Date, t: PortalTranslations): string {
	const today = startOfToday();
	const day = new Date(d);
	day.setHours(0, 0, 0, 0);
	const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
	if (diff === 0) return t.postJob.tonight;
	if (diff === 1) return t.postJob.tomorrow;
	return format(d, "EEE d MMM");
}

export function isoFromJobDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export type JobDateSpan = "3d" | "week";

function normalizeJobDateRange(from: Date, to: Date): { from: Date; to: Date } {
	const start = new Date(from);
	start.setHours(0, 0, 0, 0);
	const end = new Date(to);
	end.setHours(0, 0, 0, 0);
	if (end < start) return { from: end, to: start };
	return { from: start, to: end };
}

export function eachJobDateInRange(from: Date, to: Date): Date[] {
	const { from: start, to: end } = normalizeJobDateRange(from, to);
	const dates: Date[] = [];
	let cur = start;
	while (cur <= end) {
		dates.push(new Date(cur));
		cur = addDays(cur, 1);
	}
	return dates;
}

export function formatJobDateRange(
	from: Date,
	to: Date,
	t: PortalTranslations,
): string {
	if (isoFromJobDate(from) === isoFromJobDate(to))
		return formatJobDate(from, t);
	return `${formatJobDate(from, t)} → ${formatJobDate(to, t)}`;
}

export function jobEndDateForSpan(from: Date, span: JobDateSpan): Date {
	return addDays(from, span === "3d" ? 2 : 6);
}

function jobRangeMatchesSpan(from: Date, to: Date, span: JobDateSpan): boolean {
	return isoFromJobDate(to) === isoFromJobDate(jobEndDateForSpan(from, span));
}

export function sortJobDateIsos(isos: string[]): string[] {
	return [...isos].sort();
}

export function jobDateIsosForSpan(from: Date, span: JobDateSpan): string[] {
	return eachJobDateInRange(from, jobEndDateForSpan(from, span)).map(
		isoFromJobDate,
	);
}

export function jobSpanMatchesSelection(
	from: Date,
	span: JobDateSpan,
	selectedIsos: string[],
): boolean {
	const expected = jobDateIsosForSpan(from, span);
	if (expected.length !== selectedIsos.length) return false;
	const sorted = sortJobDateIsos(selectedIsos);
	return expected.every((iso, index) => iso === sorted[index]);
}

export function jobDateFromIso(iso: string): Date {
	return new Date(iso + "T12:00:00");
}

export function eachJobDateFromIsos(isos: string[]): Date[] {
	return sortJobDateIsos(isos).map(jobDateFromIso);
}

export function primaryJobDateFromIsos(isos: string[]): Date {
	const sorted = sortJobDateIsos(isos);
	return sorted.length > 0 ? jobDateFromIso(sorted[0]) : startOfToday();
}

export function formatJobDates(isos: string[], t: PortalTranslations): string {
	const sorted = sortJobDateIsos(isos);
	if (sorted.length === 0) return t.postJob.pickDates;
	if (sorted.length === 1) {
		return formatJobDate(jobDateFromIso(sorted[0]), t);
	}
	if (sorted.length <= 3) {
		return sorted.map((iso) => format(jobDateFromIso(iso), "d MMM")).join(", ");
	}
	return fill(t.postJob.datesCount, { n: sorted.length });
}

export function starTierToMinRating(tier: number): number {
	if (tier >= 5) return 4.5;
	if (tier >= 4) return 4;
	return tier;
}

export function buildLanguagesLabel(
	selected: string[],
	otherText = "",
): string {
	const parts = [...selected];
	if (otherText.trim()) parts.push(otherText.trim());
	return parts.join(" / ");
}

/** Base rate on post-shift form — multiples of 5 only (40, 45, 50 …). */
export const PAY_RATE_STEP = 5;
export const PAY_RATE_MIN = 40;
export const PAY_RATE_MAX = 120;

/** @deprecated Use snapTierWage from agency-demo */
export function snapPayPerHour(value: number): number {
	return snapTierWage(value);
}

export type ShiftTimeParts = {
	startH: number;
	startM: number;
	endH: number;
	endM: number;
};

const DEFAULT_SHIFT_TIME: ShiftTimeParts = {
	startH: 22,
	startM: 0,
	endH: 4,
	endM: 0,
};

function clampTime(n: number, min: number, max: number) {
	if (Number.isNaN(n)) return min;
	return Math.min(max, Math.max(min, n));
}

function parseTimeToken(raw: string, fallback: { h: number; m: number }) {
	const s = raw.trim();
	const colon = s.match(/^(\d{1,2}):(\d{2})$/);
	if (colon) {
		return {
			h: clampTime(parseInt(colon[1], 10), 0, 23),
			m: clampTime(parseInt(colon[2], 10), 0, 59),
		};
	}
	const digits = s.replace(/\D/g, "");
	if (digits.length >= 3) {
		return {
			h: clampTime(parseInt(digits.slice(0, -2), 10), 0, 23),
			m: clampTime(parseInt(digits.slice(-2), 10), 0, 59),
		};
	}
	if (digits.length > 0) {
		return { h: clampTime(parseInt(digits, 10), 0, 23), m: 0 };
	}
	return fallback;
}

export function parseShiftTime(value: string): ShiftTimeParts {
	if (!value?.trim()) return { ...DEFAULT_SHIFT_TIME };
	const segments = value.replace(/—/g, "-").split(/\s*-\s*/);
	if (segments.length < 2) return { ...DEFAULT_SHIFT_TIME };
	const start = parseTimeToken(segments[0], {
		h: DEFAULT_SHIFT_TIME.startH,
		m: DEFAULT_SHIFT_TIME.startM,
	});
	const end = parseTimeToken(segments[1], {
		h: DEFAULT_SHIFT_TIME.endH,
		m: DEFAULT_SHIFT_TIME.endM,
	});
	return { startH: start.h, startM: start.m, endH: end.h, endM: end.m };
}

export function formatShiftTime(parts: ShiftTimeParts): string {
	const z = (n: number) => String(n).padStart(2, "0");
	return `${z(parts.startH)}:${z(parts.startM)} - ${z(parts.endH)}:${z(parts.endM)}`;
}

const plainInputClass =
	"min-w-0 max-w-[10.5rem] flex-1 bg-transparent pr-2 text-right text-sm outline-none";

export function JobEventInput({
	value,
	onChange,
	placeholder,
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
}) {
	return (
		<input
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			className="w-full min-w-0 bg-transparent text-left text-sm font-semibold leading-snug text-[var(--iz-txt)] outline-none"
		/>
	);
}

export function JobTextInput({
	value,
	onChange,
	placeholder,
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
}) {
	return (
		<input
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			className={plainInputClass}
		/>
	);
}

export function JobDatePicker({
	value,
	onChange,
	layout = "chip",
	className,
}: {
	value: Date;
	onChange: (d: Date) => void;
	layout?: "chip" | "field";
	className?: string;
}) {
	const { t } = usePortalLocale();
	const label = formatJobDate(value, t);
	const isPast = (date: Date) => date < startOfToday();

	if (layout === "field") {
		return (
			<OutletDatePopoverField
				label={t.postJob.date}
				value={value}
				displayLabel={label}
				onChange={onChange}
				disabled={isPast}
				align="start"
				className={cn("w-full", className)}
			/>
		);
	}

	return (
		<OutletDatePopoverChip
			value={value}
			displayLabel={label}
			onChange={onChange}
			disabled={isPast}
		/>
	);
}

export function JobDateRangePicker({
	jobDate,
	jobEndDate,
	onChange,
	embedded,
}: {
	jobDate: Date;
	jobEndDate: Date;
	onChange: (patch: { jobDate: Date; jobEndDate: Date }) => void;
	embedded?: boolean;
}) {
	const { t } = usePortalLocale();
	const isPast = (date: Date) => date < startOfToday();

	const applyRange = (from: Date, to: Date) => {
		const n = normalizeJobDateRange(from, to);
		onChange({ jobDate: n.from, jobEndDate: n.to });
	};

	const dayCount = eachJobDateInRange(jobDate, jobEndDate).length;
	const rangeLabel = formatJobDateRange(jobDate, jobEndDate, t);

	const content = (
		<>
			{(["3d", "week"] as const).map((span) => (
				<button
					key={span}
					type="button"
					onClick={() => applyRange(jobDate, jobEndDateForSpan(jobDate, span))}
					className={cn(
						"iz-pill !text-xs",
						jobRangeMatchesSpan(jobDate, jobEndDate, span)
							? "iz-pill-gold"
							: "iz-pill-ink",
					)}
				>
					{span === "3d" ? t.outletPanels.span3Days : t.outletPanels.span1Week}
				</button>
			))}
			<OutletDateRangePopover
				from={jobDate}
				to={jobEndDate}
				onRangeChange={applyRange}
				disabled={isPast}
				formatRangeLabel={() => rangeLabel}
				compact
			/>
			{!embedded && dayCount > 1 && (
				<span className="iz-tiny iz-muted2 whitespace-nowrap px-0.5">
					{fill(t.reports.daysCount, { n: dayCount })}
				</span>
			)}
		</>
	);

	if (embedded) {
		return (
			<div className="inline-flex max-w-full flex-wrap items-center gap-1.5">
				{content}
			</div>
		);
	}

	return (
		<div className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-[var(--iz-line)] bg-[rgba(0,0,0,0.15)] p-2">
			{content}
		</div>
	);
}

export function JobMultiDatePicker({
	selectedDateIsos,
	onChange,
	embedded,
}: {
	selectedDateIsos: string[];
	onChange: (isos: string[]) => void;
	embedded?: boolean;
}) {
	const { t } = usePortalLocale();
	const isPast = (date: Date) => date < startOfToday();
	const label = formatJobDates(selectedDateIsos, t);

	const content = (
		<>
			<OutletMultiDatePopover
				selectedIsos={selectedDateIsos}
				onChange={onChange}
				disabled={isPast}
				formatLabel={() => label}
				compact
				quickSpans={{
					spans: [
						{ id: "3d", label: t.outletPanels.span3Days },
						{ id: "week", label: t.outletPanels.span1Week },
					],
					isActive: (spanAnchor, spanId) =>
						jobSpanMatchesSelection(
							spanAnchor,
							spanId as JobDateSpan,
							selectedDateIsos,
						),
					onApply: (spanAnchor, spanId) =>
						onChange(jobDateIsosForSpan(spanAnchor, spanId as JobDateSpan)),
				}}
			/>
			{!embedded && selectedDateIsos.length > 1 && (
				<span className="iz-tiny iz-muted2 whitespace-nowrap px-0.5">
					{fill(t.reports.daysCount, { n: selectedDateIsos.length })}
				</span>
			)}
		</>
	);

	if (embedded) {
		return <div className="flex w-full min-w-0 items-center">{content}</div>;
	}

	return (
		<div className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-[var(--iz-line)] bg-[rgba(0,0,0,0.15)] p-2">
			{content}
		</div>
	);
}

/** Title-case a typed language so "mandarin" and "Mandarin" don't both appear. */
function formatLanguageInput(raw: string): string {
	const trimmed = raw.trim().replace(/\s+/g, " ");
	if (!trimmed) return "";
	return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Post Job's language field: the languages the outlet's own PRs actually speak,
 * plus **Others** for anything they don't.
 *
 * Listing every language in the world made the field a wish list — most of it
 * unreachable at this venue. Listing only what the pool speaks makes the common
 * case one tap, and `Others` keeps the uncommon one possible instead of merely
 * absent. It stays a preference either way: nothing here filters assignment.
 */
function PostJobLanguagePicker({
	hint,
	options,
	selected,
	onToggle,
	onAdd,
}: {
	hint?: string;
	options: string[];
	selected: string[];
	onToggle: (lang: string) => void;
	onAdd: (lang: string) => void;
}) {
	const { t } = usePortalLocale();
	const [showOther, setShowOther] = useState(false);
	const [otherInput, setOtherInput] = useState("");

	// The field is only mounted once the outlet taps `+ Others`, and the whole
	// point of that tap is to type — so focus follows the reveal, which is the
	// job autoFocus used to do here.
	const otherInputRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (showOther) otherInputRef.current?.focus();
	}, [showOther]);

	const addOther = () => {
		const label = formatLanguageInput(otherInput);
		if (!label) return;
		onAdd(label);
		setOtherInput("");
		setShowOther(false);
	};

	return (
		<div className="flex w-full flex-col gap-2">
			{hint && (
				<p className="text-[10px] leading-snug text-[var(--iz-muted)]">
					{hint}
				</p>
			)}
			<div className="flex w-full flex-wrap gap-1.5">
				{options.length === 0 && !showOther && (
					<span className="self-center text-[10px] text-[var(--iz-muted)]">
						{t.postJob.noLanguagesOnProfiles}
					</span>
				)}
				{options.map((l) => (
					<button
						key={l}
						type="button"
						onClick={() => onToggle(l)}
						className={cn(
							"iz-job-posting-type-pill",
							selected.includes(l) && "is-active",
						)}
					>
						{/* The English name is the STORED value — it is what `selected`
						    compares against and what the post carries. Only the words on
						    the pill change; a hand-typed language falls through as-is. */}
						{languageLabel(l, t)}
					</button>
				))}
				<button
					type="button"
					onClick={() => setShowOther((v) => !v)}
					className={cn("iz-job-posting-type-pill", showOther && "is-active")}
				>
					{t.postJob.plusOthers}
				</button>
			</div>
			{showOther && (
				<div className="flex w-full items-center gap-1.5">
					<input
						type="text"
						value={otherInput}
						maxLength={32}
						ref={otherInputRef}
						placeholder={t.postJob.nameALanguage}
						aria-label={t.postJob.otherPreferredLanguage}
						className="iz-job-posting-control iz-job-posting-input min-w-0 flex-1 text-sm"
						onChange={(e) => setOtherInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								addOther();
							}
						}}
					/>
					<button
						type="button"
						onClick={addOther}
						className="iz-chip shrink-0 px-2.5 py-1.5 text-[11px] font-semibold text-[var(--iz-gold)]"
					>
						{t.postJob.add}
					</button>
				</div>
			)}
		</div>
	);
}

export function JobLanguagePicker({
	options,
	selected,
	onSelectedChange,
	variant = "default",
	hint,
}: {
	options: string[];
	selected: string[];
	onSelectedChange: (langs: string[]) => void;
	variant?: "default" | "postJob";
	/** Shown above the pills — say what picking a language does, and does not do. */
	hint?: string;
}) {
	const { t } = usePortalLocale();
	const toggle = (lang: string) => {
		onSelectedChange(
			selected.includes(lang)
				? selected.filter((l) => l !== lang)
				: [...selected, lang],
		);
	};

	if (variant === "postJob") {
		return (
			<PostJobLanguagePicker
				hint={hint}
				options={options}
				selected={selected}
				onToggle={toggle}
				onAdd={(lang) =>
					onSelectedChange(
						selected.some((l) => l.toLowerCase() === lang.toLowerCase())
							? selected
							: [...selected, lang],
					)
				}
			/>
		);
	}

	if (options.length === 0) {
		return (
			<p className="text-[11px] text-[var(--iz-muted)]">
				{t.postJob.noLanguagesToChoose}
			</p>
		);
	}

	return (
		<div className="w-full min-w-0">
			<div className="iz-job-posting-type-grid justify-end">
				{options.map((l) => (
					<button
						key={l}
						type="button"
						onClick={() => toggle(l)}
						className={cn(
							"iz-job-posting-type-pill",
							selected.includes(l) && "is-active",
						)}
					>
						{languageLabel(l, t)}
					</button>
				))}
			</div>
		</div>
	);
}

export function QuantityStepper({
	value,
	onChange,
	min = 1,
	max,
	step = 1,
	suffix,
}: {
	value: number;
	onChange: (n: number) => void;
	min?: number;
	max?: number;
	step?: number;
	suffix?: string;
}) {
	const dec = () => onChange(Math.max(min, value - step));
	const inc = () =>
		onChange(max !== undefined ? Math.min(max, value + step) : value + step);
	return (
		<div className="flex items-center gap-2">
			<button
				type="button"
				onClick={dec}
				className="iz-chip flex h-7 w-7 items-center justify-center !p-0"
			>
				<Minus className="h-3.5 w-3.5" />
			</button>
			<span className="min-w-[2.5rem] text-center font-semibold">
				{value}
				{suffix && (
					<span className="ml-0.5 text-[10px] font-normal text-[var(--iz-muted)]">
						{suffix}
					</span>
				)}
			</span>
			<button
				type="button"
				onClick={inc}
				className="iz-chip flex h-7 w-7 items-center justify-center !p-0"
			>
				<Plus className="h-3.5 w-3.5" />
			</button>
		</div>
	);
}

function hmFromParts(h: number, m: number): string {
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function partsFromHm(hhmm: string): { h: number; m: number } {
	const normalized = normalizeTimeValue(hhmm);
	const [h, m] = normalized.split(":").map((x) => parseInt(x, 10));
	return { h, m };
}

export function ShiftTimePicker({
	value,
	onChange,
	layout = "stacked",
}: {
	value: string;
	onChange: (v: string) => void;
	layout?: "stacked" | "grid";
}) {
	const { t } = usePortalLocale();
	const parts = useMemo(() => parseShiftTime(value), [value]);

	const startField = (
		<div className="iz-job-posting-control">
			<IzTimeInput
				value={hmFromParts(parts.startH, parts.startM)}
				onChange={(v) => {
					if (!v) return;
					const { h, m } = partsFromHm(v);
					onChange(formatShiftTime({ ...parts, startH: h, startM: m }));
				}}
				className="iz-job-composer-slot w-full min-w-0"
				aria-label={t.postJob.startTime}
			/>
		</div>
	);

	const endField = (
		<div className="iz-job-posting-control">
			<IzTimeInput
				value={hmFromParts(parts.endH, parts.endM)}
				onChange={(v) => {
					if (!v) return;
					const { h, m } = partsFromHm(v);
					onChange(formatShiftTime({ ...parts, endH: h, endM: m }));
				}}
				className="iz-job-composer-slot w-full min-w-0"
				aria-label={t.postJob.endTime}
			/>
		</div>
	);

	if (layout === "grid") {
		return (
			<div className="grid w-full grid-cols-2 gap-2.5">
				<div className="flex min-w-0 flex-col gap-1">
					<JobPostingMicroLabel>{t.postJob.start}</JobPostingMicroLabel>
					{startField}
				</div>
				<div className="flex min-w-0 flex-col gap-1">
					<JobPostingMicroLabel>{t.postJob.end}</JobPostingMicroLabel>
					{endField}
				</div>
			</div>
		);
	}

	return (
		<div className="flex w-full flex-col items-end gap-2">
			<div className="flex items-center justify-end gap-2">
				<span className="w-8 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--iz-muted)]">
					{t.postJob.start}
				</span>
				<IzTimeInput
					value={hmFromParts(parts.startH, parts.startM)}
					onChange={(v) => {
						if (!v) return;
						const { h, m } = partsFromHm(v);
						onChange(formatShiftTime({ ...parts, startH: h, startM: m }));
					}}
					className="min-w-[8.5rem]"
					aria-label={t.postJob.startTime}
				/>
			</div>
			<div className="flex items-center justify-end gap-2">
				<span className="w-8 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--iz-muted)]">
					{t.postJob.end}
				</span>
				<IzTimeInput
					value={hmFromParts(parts.endH, parts.endM)}
					onChange={(v) => {
						if (!v) return;
						const { h, m } = partsFromHm(v);
						onChange(formatShiftTime({ ...parts, endH: h, endM: m }));
					}}
					className="min-w-[8.5rem]"
					aria-label={t.postJob.endTime}
				/>
			</div>
		</div>
	);
}

/** The fields a PR card draws — a demo store `PR` and a backend PR both fit. */
export type DraftPrCandidate = {
	id: string;
	/** The person + membership a request row names (0131). Absent on demo. */
	userId?: string;
	agencyId?: string | null;
	name: string;
	avatar: string;
	comcardImageUrl?: string | null;
	/** Identity + portfolio, so the card can build a comcard when none is saved. */
	comcard?: ComcardPreviewData;
	/** Spoken languages from the PR's own profile — the pool the ask draws on. */
	languages?: string[];
	/** null when this outlet has never rated the PR — printed as "New", not 0★. */
	rating: number | null;
};

export function DraftPrPicker({
	candidates: candidatesProp,
	emptyHint,
	selected,
	onSelectedChange,
	quantity,
	excludePrIds,
	poolSize,
	maxSelect,
	dailyRemaining,
	poolHint,
}: {
	/** Real signed-in outlets pass their backend PR pool; demo sessions omit it. */
	candidates?: DraftPrCandidate[];
	/** Windows overlapping the drafted time, per user — the On-duty badge. */
	/** Replaces the bare "No PRs available" line with why the pool is empty. */
	emptyHint?: string;
	selected: string[];
	onSelectedChange: (prIds: string[]) => void;
	quantity: number;
	/** PRs already on the shift or pending request — hidden from the picker */
	excludePrIds?: string[];
	/** Subscription tier — max PRs shown in the scroll list */
	poolSize?: number;
	/** Subscription tier — max PRs selectable per shift */
	maxSelect?: number;
	/** Remaining PR slots today (subscription daily cap) */
	dailyRemaining?: number;
	poolHint?: string;
}) {
	const { t } = usePortalLocale();
	const prs = useStore((s) => s.prs);
	const toast = useStore((s) => s.toast);

	const blocked = useMemo(() => new Set(excludePrIds ?? []), [excludePrIds]);
	const selectCap = useMemo(() => {
		if (maxSelect === undefined) return quantity;
		let cap = maxSelect;
		if (dailyRemaining !== undefined) cap = Math.min(cap, dailyRemaining);
		return cap;
	}, [maxSelect, quantity, dailyRemaining]);

	const pool = useMemo(() => {
		// A backed outlet's pool arrives pre-sorted from the server read; the demo
		// store's own list is still ranked here by its seeded rating.
		const source: DraftPrCandidate[] =
			candidatesProp ?? [...prs].sort((a, b) => b.rating - a.rating);
		const visible = source.filter((p) => !blocked.has(p.id));
		return poolSize !== undefined ? visible.slice(0, poolSize) : visible;
	}, [candidatesProp, prs, blocked, poolSize]);

	const [query, setQuery] = useState("");
	// Searches the name the card PRINTS. `managedPrFromBackend` maps `name` from
	// the nickname and only falls back to the legal name for a PR who has none,
	// so this IS the nickname search — and the legal name is deliberately not
	// matched. It is a name this picker never displays, and matching it would
	// turn the box into a way to confirm whose nickname is whose by typing an IC
	// name at it.
	//
	// Filters AFTER `poolSize` has capped the list. That cap is a plan
	// entitlement ("choose 100 from 200 PRs"), so search narrows the pool the
	// venue already has; filtering before the slice would let a typed name reach
	// past what the subscription pays for.
	const candidates = useMemo(() => {
		const needle = query.trim().toLowerCase();
		if (!needle) return pool;
		return pool.filter((p) => p.name.toLowerCase().includes(needle));
	}, [pool, query]);

	const toggle = (prId: string) => {
		const has = selected.includes(prId);
		if (!has && selected.length >= selectCap) {
			toast(
				maxSelect !== undefined
					? dailyRemaining !== undefined && selected.length >= dailyRemaining
						? fill(
								dailyRemaining === 1
									? t.postJob.dailyPrLimitOne
									: t.postJob.dailyPrLimitMany,
								{ n: dailyRemaining },
							)
						: fill(
								selectCap === 1
									? t.postJob.planAllowsPerShiftOne
									: t.postJob.planAllowsPerShiftMany,
								{ n: selectCap },
							)
					: fill(
							quantity === 1
								? t.postJob.shiftNeedsOne
								: t.postJob.shiftNeedsMany,
							{ n: quantity },
						),
				"warn",
			);
			return;
		}
		onSelectedChange(
			has ? selected.filter((id) => id !== prId) : [...selected, prId],
		);
	};

	return (
		<div className="iz-post-job-pr-section w-full min-w-0">
			<div className="iz-post-job-pr-toolbar">
				<span className="iz-post-job-pr-badge">
					{fill(t.postJob.selectedOfCap, {
						n: selected.length,
						cap: selectCap,
					})}
				</span>
				{selected.length > 0 ? (
					<button
						type="button"
						onClick={() => onSelectedChange([])}
						className="iz-post-job-pr-clear text-[10px] font-semibold text-[var(--iz-gold)]"
					>
						{t.postJob.clearAll}
					</button>
				) : (
					<span className="iz-post-job-pr-clear" aria-hidden />
				)}
			</div>
			{poolHint && <p className="iz-post-job-pr-hint mb-2">{poolHint}</p>}
			{pool.length > 0 && (
				<label className="iz-post-job-pr-search">
					<Search className="h-3.5 w-3.5 shrink-0 text-[var(--iz-muted2)]" />
					<input
						type="search"
						className="iz-post-job-pr-search-input"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={t.postJob.searchPrPlaceholder}
						aria-label={t.postJob.searchPrLabel}
					/>
					{query !== "" && (
						<button
							type="button"
							onClick={() => setQuery("")}
							className="iz-post-job-pr-search-clear"
							aria-label={t.postJob.searchPrClear}
						>
							<X className="h-3 w-3" />
						</button>
					)}
				</label>
			)}
			{/* An empty POOL and an empty SEARCH are different facts and must read
			    differently: "no PRs available to select" in front of a venue that has
			    44 of them, because they mistyped a nickname, is the kind of message
			    that gets reported as a broken roster. */}
			{pool.length === 0 ? (
				<p className="text-[11px] leading-snug text-[var(--iz-muted)]">
					{emptyHint ?? t.postJob.noPrsAvailable}
				</p>
			) : candidates.length === 0 ? (
				<p className="text-[11px] leading-snug text-[var(--iz-muted)]">
					{fill(t.postJob.noPrMatches, { q: query.trim() })}
				</p>
			) : (
				<div className="iz-post-job-pr-scroll">
					<div className="iz-post-job-pr-scroll-inner">
						{candidates.map((p) => {
							const on = selected.includes(p.id);
							const full = !on && selected.length >= selectCap;

							return (
								<button
									key={p.id}
									type="button"
									onClick={() => toggle(p.id)}
									disabled={full}
									className={cn(
										"iz-post-job-pr-card",
										on && "is-selected",
										full && "opacity-40",
									)}
								>
									<div className="relative w-full">
										<PrComcardPickerThumb
											comcardImageUrl={p.comcardImageUrl}
											avatar={p.avatar}
											name={p.name}
											pr={"comcard" in p ? p.comcard : undefined}
										/>
										{/*
											NO BUSY BADGE HERE (owner, 24 Aug 2026), reversing the
											23 Aug call that a venue "must learn the PR is taken".
											Naming this list is a REQUEST, not a booking — the
											agency decides who actually goes — so "already
											scheduled" answers a question the venue does not get to
											ask, and bare times still tell it she is working
											somewhere tonight. The agency keeps its own busy marker
											on the roster grid, where the person doing the staffing
											can act on it.
										*/}
									</div>
									<div className="mt-1.5 truncate text-xs font-semibold text-[var(--iz-txt)]">
										{p.name}
									</div>
									<div className="text-[10px] text-[var(--iz-violet-l)]">
										{p.rating === null
											? t.postJob.notRatedYet
											: `${formatStars(p.rating)}★`}
									</div>
									<div
										className={cn(
											"mt-1.5 flex w-full items-center justify-center gap-0.5 rounded-full py-1 text-[10px] font-semibold",
											on
												? "bg-[var(--iz-green-bg)] text-[var(--iz-green)]"
												: "bg-[rgba(255,255,255,0.06)] text-[var(--iz-muted)]",
										)}
									>
										{on ? (
											<>
												<Check className="h-3 w-3" /> {t.postJob.selectedCount}
											</>
										) : (
											t.postJob.tapToAdd
										)}
									</div>
								</button>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}

function SummaryLine({
	label,
	value,
	stacked,
}: {
	label: string;
	value: string;
	stacked?: boolean;
}) {
	if (stacked) {
		return (
			<div className="flex flex-col gap-1 border-b border-[var(--iz-line)] py-2.5 last:border-0">
				<span className="text-xs text-[var(--iz-muted)]">{label}</span>
				<span className="break-words text-right text-sm leading-snug text-[var(--iz-txt)]">
					{value}
				</span>
			</div>
		);
	}
	return (
		<div className="flex items-start justify-between gap-3 border-b border-[var(--iz-line)] py-2.5 last:border-0">
			<span className="shrink-0 text-xs text-[var(--iz-muted)]">{label}</span>
			<span className="min-w-0 break-words text-right text-sm text-[var(--iz-txt)]">
				{value}
			</span>
		</div>
	);
}

function DraftDrinkPricingSummary({
	shift,
	workspaceMenu,
}: {
	shift: DraftShift;
	workspaceMenu?: OutletDrinkPrice[];
}) {
	const { t } = usePortalLocale();
	const storeMenu = useStore((s) => s.outletWorkspace.drinkMenu ?? []);
	return (
		<SummaryLine
			label={t.postJob.prices}
			value={formatShiftDrinkPricingSummary(
				shift,
				workspaceMenu ?? storeMenu,
				t,
			)}
		/>
	);
}

export function DraftShiftSummary({
	shift,
	title,
	onEdit,
	onRemove,
	showRemove,
	workspaceMenu,
}: {
	shift: DraftShift;
	title: string;
	onEdit: () => void;
	onRemove?: () => void;
	showRemove?: boolean;
	/** The outlet's real price list on a backed session; omitted on demo ones. */
	workspaceMenu?: OutletDrinkPrice[];
}) {
	const { t } = usePortalLocale();
	const prs = useStore((s) => s.prs);

	return (
		<IzCard className="!mb-0">
			<div className="mb-1 flex items-center justify-between gap-2">
				<span className="text-[11px] font-semibold text-[var(--iz-muted)]">
					{title}
				</span>
				<div className="flex items-center gap-1.5">
					<button
						type="button"
						onClick={onEdit}
						className="iz-chip flex items-center gap-1 px-2 py-1 text-[11px] font-semibold"
					>
						<Pencil className="h-3 w-3" /> {t.postJob.edit}
					</button>
					{showRemove && onRemove && (
						<button
							type="button"
							onClick={onRemove}
							className="iz-chip flex h-6 w-6 items-center justify-center !p-0 text-[var(--iz-muted)]"
							aria-label={fill(t.postJob.removeNamed, { name: title })}
						>
							<X className="h-3.5 w-3.5" />
						</button>
					)}
				</div>
			</div>
			<SummaryLine
				label={t.postJob.date}
				value={formatJobDates(shift.selectedDateIsos, t)}
			/>
			<SummaryLine
				label={t.postJob.eventType}
				value={formatShiftEventTypeSummary(
					shift.eventKind,
					t,
					shift.specialEventType,
					shift.customSpecialEventName,
				)}
			/>
			<DraftDrinkPricingSummary shift={shift} workspaceMenu={workspaceMenu} />
			<SummaryLine
				label={t.postJob.event}
				value={resolveDraftEventName(shift)}
				stacked
			/>
			<SummaryLine label={t.postJob.time} value={shift.shiftTime} />
			<SummaryLine
				label={t.postJob.peopleNeeded}
				value={String(shift.quantity)}
			/>
			<SummaryLine
				label={t.postJob.prsUnit}
				value={`${shift.prIds.length}/${shift.quantity} · ${formatDraftPrNames(shift.prIds, prs, t)}`}
				stacked
			/>
			<SummaryLine
				label={t.postJob.languages}
				/* Display only — the label that gets POSTED is built from the raw
				   stored names by the composer route, never from this line. */
				value={
					buildLanguagesLabel(
						shift.langs.map((lang) => languageLabel(lang, t)),
						shift.otherLang,
					) || "—"
				}
			/>
			<div className="border-b border-[var(--iz-line)] py-2.5 last:border-0">
				<span className="text-xs text-[var(--iz-muted)]">
					{t.postJob.payByPrTier}
				</span>
				<div className="mt-1.5 space-y-1">
					{(shift.payTierRows ?? []).map((row) => (
						<p
							key={row.id}
							className="text-[11px] leading-snug text-[var(--iz-txt)]"
						>
							{/* `t` is optional on the helper and falls back to English, so
							    omitting it here printed the one English line on a Chinese
							    summary card — and nothing warned. */}
							{formatPayTierRowSummary(row, t)}
						</p>
					))}
				</div>
			</div>
			<SummaryLine
				label={t.postJob.dressCode}
				value={dressCodeLabel(
					formatDressCodeLabel(shift.dressCode, shift.customDressCode),
					t,
				)}
			/>
		</IzCard>
	);
}

export function DraftShiftEditor({
	eventTypeLocked = false,
	shift,
	onChange,
	onRemove,
	showRemove,
	title,
	onDone,
	shiftIndex,
	shiftTotal,
	namedPrsOnDate = 0,
	peopleRemaining,
	prCandidates,
	prEmptyHint,
	workspaceMenu,
	workspaceRates,
}: {
	/**
	 * True when a picked event card already decided the kind - the form
	 * then hides its own Event-type toggle instead of asking again. The
	 * chosen-event bar states the kind; "Change event" is the way back.
	 */
	eventTypeLocked?: boolean;
	shift: DraftShift;
	onChange: (patch: Partial<DraftShift>) => void;
	onRemove?: () => void;
	showRemove?: boolean;
	title: string;
	onDone?: () => void;
	shiftIndex?: number;
	shiftTotal?: number;
	/** Named agency PRs already booked on this shift date (excludes current shift selection) */
	namedPrsOnDate?: number;
	/** Max people needed allowed for this shift (subscription daily cap minus booked headcount) */
	peopleRemaining?: number;
	/** Backend PR pool on a real outlet session; omitted on demo sessions. */
	prCandidates?: DraftPrCandidate[];
	/** Why the pool is empty, when it is. */
	prEmptyHint?: string;
	/** The outlet's real price list on a backed session; omitted on demo ones. */
	workspaceMenu?: OutletDrinkPrice[];
	/** The outlet's real rate card on a backed session; omitted on demo ones. */
	workspaceRates?: Pick<
		OutletWorkspaceSettings,
		"tierRates" | "commissionOnlyRates"
	>;
}) {
	const { t } = usePortalLocale();
	// Demo sessions have no backend pool, so the language options come from the
	// demo roster instead. A real session passes `prCandidates` and ignores this.
	const agencyPRs = useStore((s) => s.agencyPRs);
	const storeWorkspace = useStore((s) => s.outletWorkspace);
	// Same story as the price list below: a real session's rate card lives in the
	// backend and arrives as a prop. Reading only the store showed Post Job the
	// blank demo card while the Workspace page showed the real one — and made
	// "Reset to workspace rates" reset to that blank card, which on screen is
	// indistinguishable from the button doing nothing.
	const outletWorkspace = useMemo(
		() =>
			workspaceRates
				? { ...storeWorkspace, ...workspaceRates }
				: storeWorkspace,
		[storeWorkspace, workspaceRates],
	);
	const workspaceRatesKey = workspaceTierRatesSignature(
		outletWorkspace.tierRates,
	);
	// A real outlet session's price list lives in the backend and arrives as a
	// prop; the demo store's copy is the fallback. Reading only the store is why
	// Post Job showed a menu the Workspace page did not have.
	const workspaceDrinkMenu = workspaceMenu ?? outletWorkspace.drinkMenu ?? [];
	// This event's own price list. Menus saved before the Drinks/Services split
	// carry no category, so borrow the workspace's — display only, the workspace
	// list itself is never written from here.
	const eventPriceMenu = useMemo(
		() =>
			withDrinkCategoriesFromWorkspace(
				shift.eventDrinkMenu ?? [],
				workspaceDrinkMenu,
			),
		[shift.eventDrinkMenu, workspaceDrinkMenu],
	);
	const prevWorkspaceRatesKey = useRef(workspaceRatesKey);
	const didExpandTierColumns = useRef(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: one-shot on mount (guarded by didExpandTierColumns) — it rewrites the shift's tier rows via onChange, so any dep here would re-trigger it on the change it just made.
	useEffect(() => {
		if (didExpandTierColumns.current) return;
		const complete =
			shift.payTierRows.length === ALL_POST_JOB_PAY_TIER_IDS.length &&
			ALL_POST_JOB_PAY_TIER_IDS.every((payTierId) =>
				shift.payTierRows.some((row) => row.payTierId === payTierId),
			);
		if (complete) {
			const ordered = ensureAllPayTierRows(
				shift.payTierRows,
				outletWorkspace.tierRates,
				outletWorkspace.commissionOnlyRates,
			);
			const sameOrder = ordered.every(
				(row, index) => row.payTierId === shift.payTierRows[index]?.payTierId,
			);
			if (sameOrder) return;
		}
		didExpandTierColumns.current = true;
		const onlyRow =
			shift.payTierRows.length === 1 ? shift.payTierRows[0] : null;
		const total = Math.max(
			1,
			shift.quantity || totalPrCountFromPayTierRows(shift.payTierRows),
		);
		const payTierRows =
			onlyRow && !isCommissionOnlyPayTier(onlyRow.payTierId)
				? defaultComposerPayTierRows(
						outletWorkspace.tierRates,
						total,
						outletWorkspace.commissionOnlyRates,
					)
				: ensureAllPayTierRows(
						shift.payTierRows,
						outletWorkspace.tierRates,
						outletWorkspace.commissionOnlyRates,
					);
		onChange({
			payTierRows,
			tierRates: syncTierRatesFromPayTierRows(payTierRows, shift.tierRates),
			quantity: total,
			payPerHour: basePayFromPayTierRows(payTierRows),
			prIds: shift.prIds.slice(0, total),
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps -- one-time expand composer to all tier columns
	}, []);

	// Same ledger-first plan as the composer route — never the demo store alone,
	// or this picker caps a real Enterprise venue at Essential's numbers.
	const subscriptionPlan = useOutletEffectivePlan();
	const namedPrRemaining = Math.max(
		0,
		subscriptionPlan.prPerDayMax - namedPrsOnDate,
	);
	const maxNamedPrSelect =
		namedPrRemaining === 0
			? 0
			: Math.min(subscriptionPlan.prSelectMax, namedPrRemaining);
	const prPickerHint =
		namedPrRemaining === 0
			? fill(t.postJob.planDailyLimitReached, {
					plan: subscriptionPlan.label,
					max: subscriptionPlan.prPerDayMax,
				})
			: fill(t.postJob.planPickerRule, {
					plan: subscriptionPlan.label,
					rule: formatOutletPlanPrPickerRule(subscriptionPlan, t),
					left: namedPrRemaining,
				});

	const maxPeople =
		peopleRemaining !== undefined
			? peopleRemaining
			: subscriptionPlan.prPerDayMax;
	// The stepper's own floor, shared so un-naming a PR can never push People
	// needed below what the stepper itself would let the outlet type.
	const minPeople = maxPeople > 0 ? 1 : 0;
	const dateLabel = formatJobDates(shift.selectedDateIsos, t);
	const peopleNeededHint = formatOutletPlanDailyHeadcountHint(
		subscriptionPlan,
		maxPeople,
		dateLabel,
		t,
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: runs only when plan/date capacity moves — it writes shift.quantity/prIds/payTierRows through onChange, so depending on those makes the clamp re-fire on its own write.
	useEffect(() => {
		if (peopleRemaining === undefined) return;
		const patches: Partial<DraftShift> = {};
		if (peopleRemaining <= 0) {
			if (shift.quantity !== 0) patches.quantity = 0;
			if (shift.prIds.length > 0) patches.prIds = [];
			if (shift.payTierRows.some((row) => row.prCount > 0)) {
				patches.payTierRows = shift.payTierRows.map((row) => ({
					...row,
					prCount: 0,
				}));
			}
		} else if (shift.quantity > peopleRemaining) {
			patches.quantity = peopleRemaining;
			if (shift.prIds.length > peopleRemaining) {
				patches.prIds = shift.prIds.slice(0, peopleRemaining);
			}
			const total = totalPrCountFromPayTierRows(shift.payTierRows);
			if (total > peopleRemaining) {
				patches.payTierRows = adjustPayTierRowsToTotal(
					ensureAllPayTierRows(
						shift.payTierRows,
						outletWorkspace.tierRates,
						outletWorkspace.commissionOnlyRates,
					),
					peopleRemaining,
				);
			}
		}
		if (Object.keys(patches).length > 0) onChange(patches);
		// eslint-disable-next-line react-hooks/exhaustive-deps -- clamp when plan/date capacity changes only
	}, [peopleRemaining, shift.selectedDateIsos]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed to the saved rate card's signature on purpose — `shift` and `outletWorkspace` are read to build the patch, and depending on them would re-apply workspace rates over the outlet's own per-shift edits every render.
	useEffect(() => {
		if (prevWorkspaceRatesKey.current === workspaceRatesKey) return;
		prevWorkspaceRatesKey.current = workspaceRatesKey;
		onChange(applyWorkspaceRatesToDraftShift(shift, outletWorkspace));
		// eslint-disable-next-line react-hooks/exhaustive-deps -- sync when workspace tier rates are saved
	}, [workspaceRatesKey]);

	// Preferred languages are the outlet's ASK for this shift, so this is NOT keyed
	// to whoever is selected below — that made the field a read-out of the roster.
	// It is keyed to the whole POOL: the languages this venue's PRs actually speak,
	// which is what "a plus if we get it" can realistically mean here. Anything
	// else goes in via Others, so an unlisted language is still askable.
	const poolLanguages = useMemo(() => {
		const source =
			prCandidates?.flatMap((p) => p.languages ?? []) ??
			collectAgencyPrLanguages(agencyPRs);
		return [...new Set(source.filter(Boolean))].sort((a, b) =>
			a.localeCompare(b),
		);
	}, [prCandidates, agencyPRs]);

	const pickerOptions = useMemo(() => {
		// A language typed via Others still has to render as a pill, or it would
		// vanish from the field the moment it was added.
		const custom = shift.langs.filter((lang) => !poolLanguages.includes(lang));
		return [...poolLanguages, ...custom];
	}, [poolLanguages, shift.langs]);

	const updatePayTierRows = (rows: PostJobPayTierRow[]) => {
		const payTierRows = clampPayTierRowsToMax(
			ensureAllPayTierRows(
				rows,
				outletWorkspace.tierRates,
				outletWorkspace.commissionOnlyRates,
			),
			shift.quantity,
		);
		const tierRates = syncTierRatesFromPayTierRows(
			payTierRows,
			shift.tierRates,
		);
		onChange({
			payTierRows,
			tierRates,
			payPerHour: basePayFromPayTierRows(payTierRows),
			prIds: shift.prIds.slice(0, shift.quantity),
		});
	};

	const updatePeopleNeeded = (quantity: number) => {
		const capped =
			maxPeople > 0 ? Math.min(Math.max(0, quantity), maxPeople) : 0;
		const payTierRows = adjustPayTierRowsToTotal(shift.payTierRows, capped);
		const tierRates = syncTierRatesFromPayTierRows(
			payTierRows,
			shift.tierRates,
		);
		onChange({
			quantity: capped,
			payTierRows,
			tierRates,
			payPerHour: basePayFromPayTierRows(payTierRows),
			prIds: shift.prIds.slice(0, capped),
		});
	};

	// PEOPLE NEEDED FOLLOWS THE NAMED LIST BOTH WAYS.
	//
	// It only ever tracked the way UP: naming past the count raised it, but
	// un-naming left the count stranded a slot too high, so the venue kept asking
	// for a head it had just taken off the list — and the day's plan cap, the
	// tier split and the posted quantity were all charged for it.
	//
	// The two rules mirror each other on purpose. The count moves only while the
	// list is at or past it, which is exactly when naming moves it up, so a
	// partly-named shift (3 named of 6 needed) is left alone in both directions.
	// The tier rows are re-split the same way the stepper re-splits them, because
	// the tier total — not this number — is what the summary and the post read.
	const updateSelectedPrs = (prIds: string[]) => {
		const removed = shift.prIds.length - prIds.length;
		const nextQuantity =
			prIds.length > shift.quantity
				? prIds.length
				: removed > 0 && shift.prIds.length >= shift.quantity
					? Math.max(minPeople, shift.quantity - removed)
					: shift.quantity;
		if (nextQuantity === shift.quantity) {
			onChange({ prIds });
			return;
		}
		// prIds is NOT re-sliced here — this handler's input IS the list the outlet
		// just edited, and trimming it would silently undo the click that fired it.
		const payTierRows = adjustPayTierRowsToTotal(
			shift.payTierRows,
			nextQuantity,
		);
		onChange({
			prIds,
			quantity: nextQuantity,
			payTierRows,
			tierRates: syncTierRatesFromPayTierRows(payTierRows, shift.tierRates),
			payPerHour: basePayFromPayTierRows(payTierRows),
		});
	};

	return (
		<div className="iz-job-posting-form-card !mb-0">
			<PostJobShiftCardHeader
				title={title}
				shiftIndex={shiftIndex}
				shiftTotal={shiftTotal}
				trailing={
					onDone || (showRemove && onRemove) ? (
						<div className="flex items-center gap-1.5">
							{onDone && (
								<button
									type="button"
									onClick={onDone}
									className="iz-chip px-2 py-1 text-[11px] font-semibold text-[var(--iz-gold)]"
								>
									{t.postJob.done}
								</button>
							)}
							{showRemove && onRemove && (
								<button
									type="button"
									onClick={onRemove}
									className="iz-chip flex h-6 w-6 items-center justify-center !p-0 text-[var(--iz-muted)]"
									aria-label={fill(t.postJob.removeNamed, { name: title })}
								>
									<X className="h-3.5 w-3.5" />
								</button>
							)}
						</div>
					) : undefined
				}
			/>

			<div className="mt-3 space-y-3">
				<PostJobFormLegend />

				<PostJobGroupHeader label={t.postJob.groupTheNight} />

				<PostJobShiftField
					label={t.postJob.date}
					info={<PostJobInfoTip text={t.postJob.helpDates} />}
				>
					<div className="iz-job-posting-control">
						<JobMultiDatePicker
							embedded
							selectedDateIsos={shift.selectedDateIsos}
							onChange={(selectedDateIsos) => onChange({ selectedDateIsos })}
						/>
					</div>
				</PostJobShiftField>

				{!eventTypeLocked && (
					<PostJobShiftField label={t.postJob.eventType} layout="stack">
						<div className="iz-post-job-event-type-grid">
							{(Object.keys(SHIFT_EVENT_KIND_LABELS) as ShiftEventKind[]).map(
								(kind) => (
									<button
										key={kind}
										type="button"
										onClick={() => {
											const nextKind = kind;
											onChange({
												eventKind: nextKind,
												specialEventType:
													nextKind === "special"
														? (shift.specialEventType ?? "vip")
														: undefined,
												customSpecialEventName:
													nextKind === "special" &&
													isOtherSpecialEvent(shift.specialEventType)
														? (shift.customSpecialEventName ?? "")
														: "",
												eventDrinkMenu:
													nextKind === "special"
														? (shift.eventDrinkMenu ??
															cloneDrinkMenu(workspaceDrinkMenu))
														: undefined,
												event: resolveDraftEventOnPresetChange(shift.event),
											});
										}}
										className={cn(
											"iz-post-job-event-type-pill",
											shift.eventKind === kind && "is-active",
										)}
									>
										{SHIFT_EVENT_KIND_LABELS[kind](t)}
									</button>
								),
							)}
						</div>
						{shift.eventKind === "special" && (
							<>
								<IzHScroll className="mt-2 flex w-full gap-1 pb-0.5">
									{SHIFT_SPECIAL_EVENT_OPTIONS.map((option) => (
										<button
											key={option.id}
											type="button"
											onClick={() =>
												onChange({
													specialEventType: option.id,
													customSpecialEventName: isOtherSpecialEvent(option.id)
														? (shift.customSpecialEventName ?? "")
														: "",
													event: resolveDraftEventOnPresetChange(shift.event),
												})
											}
											className={cn(
												"iz-job-posting-type-pill shrink-0 whitespace-nowrap",
												shift.specialEventType === option.id && "is-active",
											)}
										>
											{option.label(t)}
										</button>
									))}
								</IzHScroll>
								{isOtherSpecialEvent(shift.specialEventType) && (
									<input
										type="text"
										className="iz-job-posting-control iz-job-posting-input mt-2 block w-full min-w-0"
										placeholder={t.postJob.nameYourEventType}
										aria-label={t.postJob.customSpecialEventType}
										value={shift.customSpecialEventName ?? ""}
										onChange={(e) =>
											onChange({ customSpecialEventName: e.target.value })
										}
									/>
								)}
							</>
						)}
					</PostJobShiftField>
				)}

				<PostJobShiftField label={t.postJob.eventName}>
					<PostJobEditableInputShell>
						<JobEventInput
							value={shift.event}
							onChange={(event) => onChange({ event })}
							placeholder={
								eventTypeLocked
									? t.postJob.clickToPutEventName
									: draftEventPlaceholder(
											shift.eventKind ?? "normal",
											t,
											shift.specialEventType,
										)
							}
						/>
					</PostJobEditableInputShell>
				</PostJobShiftField>

				<PostJobShiftField label={t.postJob.time}>
					<ShiftTimePicker
						value={shift.shiftTime}
						onChange={(shiftTime) => onChange({ shiftTime })}
						layout="grid"
					/>
				</PostJobShiftField>

				<PostJobGroupHeader label={t.postJob.groupWhoWorks} />

				<PostJobShiftField
					label={t.postJob.peopleNeeded}
					info={<PostJobInfoTip text={t.postJob.helpPeopleNeeded} />}
				>
					<div className="flex w-full flex-col gap-1">
						<QuantityStepper
							value={shift.quantity}
							onChange={updatePeopleNeeded}
							min={minPeople}
							max={maxPeople > 0 ? maxPeople : 0}
							suffix={t.postJob.prsUnit}
						/>
						<p className="text-[10px] text-[var(--iz-muted)]">
							{peopleNeededHint}
						</p>
					</div>
				</PostJobShiftField>

				{/* COLLAPSIBLE, because this one field is a hundred comcards tall and
				    everything below it — languages, dress code, rates — sits under that
				    wall. Open by default, so nothing moves for anyone who liked it as it
				    was. The collapsed header keeps the count: `maxNamedPrSelect` is the
				    SAME value the picker's own badge caps at — both are
				    min(prSelectMax, namedPrRemaining), and this branch only renders when
				    it is above zero — so the two cannot disagree. */}
				<PostJobShiftField
					label={t.postJob.selectPrs}
					info={<PostJobInfoTip text={t.postJob.helpSelectPrs} />}
					className="iz-post-job-pr-field"
					layout="stack"
					collapsible
					summary={fill(t.postJob.selectedOfCap, {
						n: shift.prIds.length,
						cap: maxNamedPrSelect,
					})}
				>
					{maxNamedPrSelect === 0 ? (
						<p className="text-[11px] text-[var(--iz-muted)]">{prPickerHint}</p>
					) : (
						<DraftPrPicker
							candidates={prCandidates}
							emptyHint={prEmptyHint}
							selected={shift.prIds}
							onSelectedChange={updateSelectedPrs}
							quantity={shift.quantity}
							poolSize={subscriptionPlan.prPoolSize}
							maxSelect={subscriptionPlan.prSelectMax}
							dailyRemaining={namedPrRemaining}
							poolHint={prPickerHint}
						/>
					)}
				</PostJobShiftField>

				<PostJobShiftField label={t.postJob.preferredLanguages}>
					<JobLanguagePicker
						variant="postJob"
						hint={t.postJob.languagesHint}
						options={pickerOptions}
						selected={shift.langs}
						onSelectedChange={(langs) => onChange({ langs })}
					/>
				</PostJobShiftField>

				<PostJobShiftField label={t.postJob.dressCode}>
					<div className="flex w-full min-w-0 flex-col gap-2">
						<div className="iz-job-posting-control">
							<IzSelect
								block
								value={
									isOtherDressCode(shift.dressCode)
										? DRESS_CODE_OTHER_ID
										: shift.dressCode
								}
								onChange={(e) => {
									const next = e.target.value;
									onChange({
										dressCode: next,
										customDressCode: isOtherDressCode(next)
											? (shift.customDressCode ?? "")
											: "",
									});
								}}
								className="!border-0 !bg-transparent !text-sm !font-semibold !text-[var(--iz-txt)] !shadow-none"
							>
								{DRESS_CODE_OPTIONS.map((d) => (
									<option key={d} value={d}>
										{dressCodeLabel(d, t)}
									</option>
								))}
								<option value={DRESS_CODE_OTHER_ID}>{t.postJob.other}</option>
							</IzSelect>
						</div>
						{isOtherDressCode(shift.dressCode) && (
							<input
								type="text"
								className="iz-job-posting-control iz-job-posting-input w-full min-w-0 text-sm"
								placeholder={t.postJob.nameDressCodeField}
								aria-label={t.postJob.customDressCode}
								// The column's own width (0132), enforced where the venue can SEE
								// the limit. Without it a long line typed here would be silently
								// clipped by the mapper on the way out, and the venue would read
								// its own half-sentence back off the PR's card.
								maxLength={60}
								value={shift.customDressCode ?? ""}
								onChange={(e) => onChange({ customDressCode: e.target.value })}
							/>
						)}
					</div>
				</PostJobShiftField>

				<PostJobGroupHeader label={t.postJob.groupWhatItPays} />

				<PostJobShiftField
					label={t.postJob.prices}
					info={<PostJobInfoTip text={t.postJob.helpPrices} />}
				>
					{shift.eventKind === "special" ? (
						<div className="w-full min-w-0">
							<p className="mb-2 text-[10px] text-[var(--iz-muted)]">
								{t.postJob.specialPricesIntro}
							</p>
							<ShiftEventPriceEditor
								menu={eventPriceMenu}
								onChange={(eventDrinkMenu) => onChange({ eventDrinkMenu })}
							/>
							<button
								type="button"
								className="iz-chip mt-2 w-full text-[11px]"
								onClick={() =>
									onChange({
										eventDrinkMenu: cloneDrinkMenu(workspaceDrinkMenu),
									})
								}
							>
								{t.postJob.resetToWorkspacePrices}
							</button>
						</div>
					) : (
						// Read-only here BY DESIGN, prices live on the Workspace page. The
						// old row printed one blended range that matched no Workspace
						// section and was secretly a link nothing marked as one. Each list
						// now keeps its own range and its own named, underlined link to
						// the exact section anchor it edits.
						<div className="iz-post-job-prices-card">
							<div className="iz-post-job-prices-card__head">
								<span className="min-w-0 flex-1 text-sm font-semibold text-[var(--iz-txt)]">
									{t.postJob.followingWorkspacePrices}
								</span>
								<span className="iz-post-job-locked-badge">
									<Lock className="h-3 w-3" aria-hidden />
									{t.postJob.fromWorkspace}
								</span>
							</div>
							{(() => {
								const drinks = workspaceDrinkMenu.filter(
									(d) => outletDrinkCategory(d) === "drink",
								);
								const services = workspaceDrinkMenu.filter(
									(d) => outletDrinkCategory(d) === "service",
								);
								const fmt = (menu: OutletDrinkPrice[]) => {
									const range = drinkMenuPriceRange(menu);
									return `RM ${range.min}–${range.max}`;
								};
								return (
									<p className="iz-post-job-prices-card__ranges">
										{drinks.length > 0 && (
											<span>
												<span className="iz-post-job-prices-card__range-label">
													{t.postJob.drinksWord}
												</span>
												{fmt(drinks)}
											</span>
										)}
										{services.length > 0 && (
											<span>
												<span className="iz-post-job-prices-card__range-label">
													{t.postJob.servicesWord}
												</span>
												{fmt(services)}
											</span>
										)}
									</p>
								);
							})()}
							<div className="iz-post-job-ws-links">
								<span>{t.postJob.changeInWorkspace}</span>
								<Link
									to="/outlet/workspace"
									hash={OUTLET_DRINKS_PRICE_SECTION_ID}
									className="iz-post-job-ws-link"
								>
									{t.postJob.linkDrinksPrice}
									<ArrowUpRight className="h-3 w-3" aria-hidden />
								</Link>
								<Link
									to="/outlet/workspace"
									hash={OUTLET_TIER_RATES_SECTION_ID}
									className="iz-post-job-ws-link"
								>
									{t.postJob.linkTierRates}
									<ArrowUpRight className="h-3 w-3" aria-hidden />
								</Link>
							</div>
						</div>
					)}
				</PostJobShiftField>

				<div className="iz-post-job-tier-section border-t border-[var(--iz-line)] pt-4">
					<div className="flex items-start justify-between gap-2">
						<PostJobTierSectionHeader />
						<PostJobInfoTip text={t.postJob.helpTierGrid} />
					</div>
					<div className="mt-3">
						<PostJobTierRatesEditor
							rows={shift.payTierRows}
							workspaceTierRates={outletWorkspace.tierRates}
							commissionOnlyRates={outletWorkspace.commissionOnlyRates}
							maxPrTotal={shift.quantity}
							onChange={updatePayTierRows}
						/>
						<div className="iz-post-job-tier-footer">
							<button
								type="button"
								className="iz-chip col-span-2 w-full text-[11px]"
								onClick={() => {
									const wsRates = draftTierRatesFromWorkspace(outletWorkspace);
									const payTierRows = defaultComposerPayTierRows(
										wsRates,
										Math.max(1, shift.quantity || 6),
										outletWorkspace.commissionOnlyRates,
									);
									onChange({
										tierRates: syncTierRatesFromPayTierRows(
											payTierRows,
											wsRates,
										),
										payTierRows,
										payPerHour: basePayFromPayTierRows(payTierRows),
										prIds: shift.prIds.slice(0, shift.quantity),
									});
								}}
							>
								{t.postJob.resetToWorkspaceRates}
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
