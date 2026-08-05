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
	PostJobLockedValue,
	PostJobShiftCardHeader,
	PostJobShiftField,
	PostJobTierSectionHeader,
} from "@agency-portal/components/outlet/post-job-shift-ui";
import { ShiftEventPriceEditor } from "@agency-portal/components/outlet/ShiftEventPriceEditor";
import { PrComcardPickerThumb } from "@agency-portal/components/pr/PortfolioComcardVisual";
import { JobPostingMicroLabel } from "@agency-portal/components/special-service/job-posting-ui";
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
	getOutletSubscriptionPlan,
	isOtherDressCode,
	isOtherSpecialEvent,
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
	type PostJobPayTierId,
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
import { addDays, format, startOfToday } from "date-fns";
import { Check, Minus, Pencil, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_DRAFT_TIER_BASE: OutletTierRateSettings = {
	wagePerHour: 60,
	drinkPct: 8,
	tipPct: 15,
	tablePct: 10,
	otAfterHours: 6,
};

const DRAFT_NORMAL_EVENT_DEFAULT = "Friday lounge";
const DRAFT_NORMAL_EVENT_PLACEHOLDER = "e.g. Friday lounge, ladies night";

const DRAFT_SPECIAL_EVENT_DEFAULTS: Record<ShiftSpecialEventType, string> = {
	vip: "Private VIP — Hennessy Launch",
	launch: "Champagne product launch",
	private_table: "Private table buyout",
	brand_activation: "Brand night activation",
	corporate: "Corporate table event",
	other: "",
};

const DRAFT_SPECIAL_EVENT_PLACEHOLDERS: Record<ShiftSpecialEventType, string> =
	{
		vip: "e.g. Private VIP — Hennessy Launch",
		launch: "e.g. Champagne product launch",
		private_table: "e.g. Private table buyout",
		brand_activation: "e.g. Brand night activation",
		corporate: "e.g. Corporate table event",
		other: "Name your special event",
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

export function draftEventPlaceholder(
	eventKind: ShiftEventKind,
	specialEventType?: string,
): string {
	if (eventKind === "normal") return DRAFT_NORMAL_EVENT_PLACEHOLDER;
	const type = (specialEventType ?? "vip") as ShiftSpecialEventType;
	return DRAFT_SPECIAL_EVENT_PLACEHOLDERS[type] ?? "Name your special event";
}

function resolveDraftEventOnPresetChange(
	current: string,
	eventKind: ShiftEventKind,
	specialEventType?: string,
): string {
	if (!DRAFT_EVENT_PRESETS.has(current.trim())) return current;
	return defaultDraftEventName(eventKind, specialEventType);
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
		event:
			partial?.event ??
			defaultDraftEventName(eventKind, partial?.specialEventType ?? "vip"),
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
): string {
	if (prIds.length === 0) return "None selected";
	return prIds.map((id) => prs.find((p) => p.id === id)?.name ?? id).join(", ");
}

export function formatJobDate(d: Date): string {
	const today = startOfToday();
	const day = new Date(d);
	day.setHours(0, 0, 0, 0);
	const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
	if (diff === 0) return "Tonight";
	if (diff === 1) return "Tomorrow";
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

export function formatJobDateRange(from: Date, to: Date): string {
	if (isoFromJobDate(from) === isoFromJobDate(to)) return formatJobDate(from);
	return `${formatJobDate(from)} → ${formatJobDate(to)}`;
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

export function formatJobDates(isos: string[]): string {
	const sorted = sortJobDateIsos(isos);
	if (sorted.length === 0) return "Pick dates";
	if (sorted.length === 1) {
		return formatJobDate(jobDateFromIso(sorted[0]));
	}
	if (sorted.length <= 3) {
		return sorted.map((iso) => format(jobDateFromIso(iso), "d MMM")).join(", ");
	}
	return `${sorted.length} dates`;
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
	const label = formatJobDate(value);
	const isPast = (date: Date) => date < startOfToday();

	if (layout === "field") {
		return (
			<OutletDatePopoverField
				label="Date"
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
	const isPast = (date: Date) => date < startOfToday();

	const applyRange = (from: Date, to: Date) => {
		const n = normalizeJobDateRange(from, to);
		onChange({ jobDate: n.from, jobEndDate: n.to });
	};

	const dayCount = eachJobDateInRange(jobDate, jobEndDate).length;
	const rangeLabel = formatJobDateRange(jobDate, jobEndDate);

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
					{span === "3d" ? "3 days" : "1 week"}
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
					{dayCount} days
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
	const isPast = (date: Date) => date < startOfToday();
	const label = formatJobDates(selectedDateIsos);

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
						{ id: "3d", label: "3 days" },
						{ id: "week", label: "1 week" },
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
					{selectedDateIsos.length} days
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
	const [showOther, setShowOther] = useState(false);
	const [otherInput, setOtherInput] = useState("");

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
						No languages on your PRs' profiles yet — add one with Others.
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
						{l}
					</button>
				))}
				<button
					type="button"
					onClick={() => setShowOther((v) => !v)}
					className={cn("iz-job-posting-type-pill", showOther && "is-active")}
				>
					+ Others
				</button>
			</div>
			{showOther && (
				<div className="flex w-full items-center gap-1.5">
					<input
						type="text"
						value={otherInput}
						maxLength={32}
						autoFocus
						placeholder="Name a language"
						aria-label="Other preferred language"
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
						Add
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
				No languages to choose from.
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
						{l}
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
				aria-label="Start time"
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
				aria-label="End time"
			/>
		</div>
	);

	if (layout === "grid") {
		return (
			<div className="grid w-full grid-cols-2 gap-2.5">
				<label className="flex min-w-0 flex-col gap-1">
					<JobPostingMicroLabel>Start</JobPostingMicroLabel>
					{startField}
				</label>
				<label className="flex min-w-0 flex-col gap-1">
					<JobPostingMicroLabel>End</JobPostingMicroLabel>
					{endField}
				</label>
			</div>
		);
	}

	return (
		<div className="flex w-full flex-col items-end gap-2">
			<div className="flex items-center justify-end gap-2">
				<span className="w-8 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--iz-muted)]">
					Start
				</span>
				<IzTimeInput
					value={hmFromParts(parts.startH, parts.startM)}
					onChange={(v) => {
						if (!v) return;
						const { h, m } = partsFromHm(v);
						onChange(formatShiftTime({ ...parts, startH: h, startM: m }));
					}}
					className="min-w-[8.5rem]"
					aria-label="Start time"
				/>
			</div>
			<div className="flex items-center justify-end gap-2">
				<span className="w-8 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--iz-muted)]">
					End
				</span>
				<IzTimeInput
					value={hmFromParts(parts.endH, parts.endM)}
					onChange={(v) => {
						if (!v) return;
						const { h, m } = partsFromHm(v);
						onChange(formatShiftTime({ ...parts, endH: h, endM: m }));
					}}
					className="min-w-[8.5rem]"
					aria-label="End time"
				/>
			</div>
		</div>
	);
}

/** The fields a PR card draws — a demo store `PR` and a backend PR both fit. */
export type DraftPrCandidate = {
	id: string;
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
	const prs = useStore((s) => s.prs);
	const toast = useStore((s) => s.toast);

	const blocked = useMemo(() => new Set(excludePrIds ?? []), [excludePrIds]);
	const selectCap = useMemo(() => {
		if (maxSelect === undefined) return quantity;
		let cap = maxSelect;
		if (dailyRemaining !== undefined) cap = Math.min(cap, dailyRemaining);
		return cap;
	}, [maxSelect, quantity, dailyRemaining]);

	const candidates = useMemo(() => {
		// A backed outlet's pool arrives pre-sorted from the server read; the demo
		// store's own list is still ranked here by its seeded rating.
		const source: DraftPrCandidate[] =
			candidatesProp ?? [...prs].sort((a, b) => b.rating - a.rating);
		const visible = source.filter((p) => !blocked.has(p.id));
		return poolSize !== undefined ? visible.slice(0, poolSize) : visible;
	}, [candidatesProp, prs, blocked, poolSize]);

	const toggle = (prId: string) => {
		const has = selected.includes(prId);
		if (!has && selected.length >= selectCap) {
			toast(
				maxSelect !== undefined
					? dailyRemaining !== undefined && selected.length >= dailyRemaining
						? `Daily PR limit — ${dailyRemaining} slot${dailyRemaining === 1 ? "" : "s"} left today on your plan`
						: `Your plan allows ${selectCap} PR${selectCap !== 1 ? "s" : ""} per shift — remove one to add another`
					: `This shift needs ${quantity} PR${quantity !== 1 ? "s" : ""} — remove one to add another`,
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
					{selected.length}/{selectCap} selected
				</span>
				{selected.length > 0 ? (
					<button
						type="button"
						onClick={() => onSelectedChange([])}
						className="iz-post-job-pr-clear text-[10px] font-semibold text-[var(--iz-gold)]"
					>
						Clear all
					</button>
				) : (
					<span className="iz-post-job-pr-clear" aria-hidden />
				)}
			</div>
			{poolHint && <p className="iz-post-job-pr-hint mb-2">{poolHint}</p>}
			{candidates.length === 0 ? (
				<p className="text-[11px] leading-snug text-[var(--iz-muted)]">
					{emptyHint ?? "No PRs available to select."}
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
									<PrComcardPickerThumb
										comcardImageUrl={p.comcardImageUrl}
										avatar={p.avatar}
										name={p.name}
										pr={"comcard" in p ? p.comcard : undefined}
									/>
									<div className="mt-1.5 truncate text-xs font-semibold text-[var(--iz-txt)]">
										{p.name}
									</div>
									<div className="text-[10px] text-[var(--iz-violet-l)]">
										{p.rating === null
											? "Not rated yet"
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
												<Check className="h-3 w-3" /> Selected
											</>
										) : (
											"Tap to add"
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

function FormRow({
	label,
	children,
	last,
	alignTop,
	stacked,
}: {
	label: string;
	children: React.ReactNode;
	last?: boolean;
	alignTop?: boolean;
	stacked?: boolean;
}) {
	if (stacked) {
		return (
			<div
				className={`flex flex-col gap-1.5 py-2.5 ${last ? "" : "border-b border-[var(--iz-line)]"}`}
			>
				<span className="text-xs text-[var(--iz-muted)]">{label}</span>
				<div className="min-w-0 w-full">{children}</div>
			</div>
		);
	}
	return (
		<div
			className={`flex gap-3 py-2.5 ${alignTop ? "items-start" : "items-center"} ${last ? "" : "border-b border-[var(--iz-line)]"}`}
		>
			<span className="shrink-0 text-xs text-[var(--iz-muted)]">{label}</span>
			<div className="ml-auto flex min-w-0 flex-1 justify-end">{children}</div>
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
	const storeMenu = useStore((s) => s.outletWorkspace.drinkMenu ?? []);
	return (
		<SummaryLine
			label="Prices"
			value={formatShiftDrinkPricingSummary(shift, workspaceMenu ?? storeMenu)}
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
						<Pencil className="h-3 w-3" /> Edit
					</button>
					{showRemove && onRemove && (
						<button
							type="button"
							onClick={onRemove}
							className="iz-chip flex h-6 w-6 items-center justify-center !p-0 text-[var(--iz-muted)]"
							aria-label={`Remove ${title}`}
						>
							<X className="h-3.5 w-3.5" />
						</button>
					)}
				</div>
			</div>
			<SummaryLine
				label="Date"
				value={formatJobDates(shift.selectedDateIsos)}
			/>
			<SummaryLine
				label="Event type"
				value={formatShiftEventTypeSummary(
					shift.eventKind,
					shift.specialEventType,
					shift.customSpecialEventName,
				)}
			/>
			<DraftDrinkPricingSummary shift={shift} workspaceMenu={workspaceMenu} />
			<SummaryLine label="Event" value={shift.event} stacked />
			<SummaryLine label="Time" value={shift.shiftTime} />
			<SummaryLine label="People needed" value={String(shift.quantity)} />
			<SummaryLine
				label="PRs"
				value={`${shift.prIds.length}/${shift.quantity} · ${formatDraftPrNames(shift.prIds, prs)}`}
				stacked
			/>
			<SummaryLine
				label="Languages"
				value={buildLanguagesLabel(shift.langs, shift.otherLang) || "—"}
			/>
			<div className="border-b border-[var(--iz-line)] py-2.5 last:border-0">
				<span className="text-xs text-[var(--iz-muted)]">Pay by PR tier</span>
				<div className="mt-1.5 space-y-1">
					{(shift.payTierRows ?? []).map((row) => (
						<p
							key={row.id}
							className="text-[11px] leading-snug text-[var(--iz-txt)]"
						>
							{formatPayTierRowSummary(row)}
						</p>
					))}
				</div>
			</div>
			<SummaryLine
				label="Dress code"
				value={formatDressCodeLabel(shift.dressCode, shift.customDressCode)}
			/>
		</IzCard>
	);
}

export function DraftShiftEditor({
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
}: {
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
}) {
	// Demo sessions have no backend pool, so the language options come from the
	// demo roster instead. A real session passes `prCandidates` and ignores this.
	const agencyPRs = useStore((s) => s.agencyPRs);
	const outletOwner = useStore((s) => s.outletOwner);
	const outletWorkspace = useStore((s) => s.outletWorkspace);
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

	const subscriptionPlan = getOutletSubscriptionPlan(
		outletOwner.subscriptionPlanId,
	);
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
			? `${subscriptionPlan.label} plan · daily limit of ${subscriptionPlan.prPerDayMax} named PRs reached for this date`
			: `${subscriptionPlan.label} plan · ${formatOutletPlanPrPickerRule(subscriptionPlan)} · ${namedPrRemaining} named PR slot${namedPrRemaining === 1 ? "" : "s"} left today`;

	const maxPeople =
		peopleRemaining !== undefined
			? peopleRemaining
			: subscriptionPlan.prPerDayMax;
	const dateLabel = formatJobDates(shift.selectedDateIsos);
	const peopleNeededHint = formatOutletPlanDailyHeadcountHint(
		subscriptionPlan,
		maxPeople,
		dateLabel,
	);

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

	const planHintParts = peopleNeededHint.split(" · ");
	const planHintLead = planHintParts.slice(0, -1).join(" · ");
	const planHintTail = planHintParts[planHintParts.length - 1] ?? "";

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
									Done
								</button>
							)}
							{showRemove && onRemove && (
								<button
									type="button"
									onClick={onRemove}
									className="iz-chip flex h-6 w-6 items-center justify-center !p-0 text-[var(--iz-muted)]"
									aria-label={`Remove ${title}`}
								>
									<X className="h-3.5 w-3.5" />
								</button>
							)}
						</div>
					) : undefined
				}
			/>

			<div className="mt-3 space-y-3">
				<PostJobShiftField label="Date">
					<div className="iz-job-posting-control">
						<JobMultiDatePicker
							embedded
							selectedDateIsos={shift.selectedDateIsos}
							onChange={(selectedDateIsos) => onChange({ selectedDateIsos })}
						/>
					</div>
				</PostJobShiftField>

				<PostJobShiftField label="Event type" layout="stack">
					<div className="iz-post-job-event-type-grid">
						{(Object.keys(SHIFT_EVENT_KIND_LABELS) as ShiftEventKind[]).map(
							(kind) => (
								<button
									key={kind}
									type="button"
									onClick={() => {
										const nextKind = kind;
										const nextSpecialType =
											nextKind === "special"
												? (shift.specialEventType ?? "vip")
												: undefined;
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
											event: resolveDraftEventOnPresetChange(
												shift.event,
												nextKind,
												nextSpecialType,
											),
										});
									}}
									className={cn(
										"iz-post-job-event-type-pill",
										shift.eventKind === kind && "is-active",
									)}
								>
									{SHIFT_EVENT_KIND_LABELS[kind]}
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
												event: resolveDraftEventOnPresetChange(
													shift.event,
													"special",
													option.id,
												),
											})
										}
										className={cn(
											"iz-job-posting-type-pill shrink-0 whitespace-nowrap",
											shift.specialEventType === option.id && "is-active",
										)}
									>
										{option.label}
									</button>
								))}
							</IzHScroll>
							{isOtherSpecialEvent(shift.specialEventType) && (
								<input
									type="text"
									className="iz-job-posting-control iz-job-posting-input mt-2 block w-full min-w-0"
									placeholder="Name your event type"
									aria-label="Custom special event type"
									value={shift.customSpecialEventName ?? ""}
									onChange={(e) =>
										onChange({ customSpecialEventName: e.target.value })
									}
								/>
							)}
						</>
					)}
				</PostJobShiftField>

				<PostJobShiftField label="Prices">
					{shift.eventKind === "special" ? (
						<div className="w-full min-w-0">
							<p className="mb-2 text-[10px] text-[var(--iz-muted)]">
								Set prices for this special event only. Later events keep using
								the Workspace prices.
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
								Reset to workspace prices
							</button>
						</div>
					) : (
						<div className="iz-job-posting-control">
							<PostJobLockedValue>
								Follow Workspace
								{(() => {
									const range = drinkMenuPriceRange(workspaceDrinkMenu);
									return ` · RM ${range.min}–${range.max}`;
								})()}
							</PostJobLockedValue>
						</div>
					)}
				</PostJobShiftField>

				<PostJobShiftField label="Event name">
					<PostJobEditableInputShell>
						<JobEventInput
							value={shift.event}
							onChange={(event) => onChange({ event })}
							placeholder={draftEventPlaceholder(
								shift.eventKind ?? "normal",
								shift.specialEventType,
							)}
						/>
					</PostJobEditableInputShell>
				</PostJobShiftField>

				<PostJobShiftField label="Time">
					<ShiftTimePicker
						value={shift.shiftTime}
						onChange={(shiftTime) => onChange({ shiftTime })}
						layout="grid"
					/>
				</PostJobShiftField>

				<PostJobShiftField label="People needed">
					<div className="flex w-full flex-col gap-1">
						<QuantityStepper
							value={shift.quantity}
							onChange={updatePeopleNeeded}
							min={maxPeople > 0 ? 1 : 0}
							max={maxPeople > 0 ? maxPeople : 0}
							suffix="PRs"
						/>
						<p className="text-[10px] text-[var(--iz-muted)]">
							{peopleNeededHint}
						</p>
					</div>
				</PostJobShiftField>

				<PostJobShiftField label="Preferred languages">
					<JobLanguagePicker
						variant="postJob"
						hint="Spoken by your PRs — a plus, not a requirement. PRs who don't speak these can still be assigned. Use Others for anything not listed."
						options={pickerOptions}
						selected={shift.langs}
						onSelectedChange={(langs) => onChange({ langs })}
					/>
				</PostJobShiftField>

				<div className="iz-post-job-tier-section border-t border-[var(--iz-line)] pt-4">
					<PostJobTierSectionHeader />
					<div className="mt-3">
						{maxPeople <= 0 ? (
							<p className="mb-2 text-[11px] text-[var(--iz-muted)]">
								{peopleNeededHint}
							</p>
						) : null}
						<PostJobTierRatesEditor
							rows={shift.payTierRows}
							workspaceTierRates={outletWorkspace.tierRates}
							commissionOnlyRates={outletWorkspace.commissionOnlyRates}
							maxPrTotal={shift.quantity}
							onChange={updatePayTierRows}
							planHint={
								maxPeople > 0 ? (
									<>
										{planHintLead ? `${planHintLead} · ` : ""}
										<span className="text-[var(--iz-green)] font-semibold">
											{planHintTail}
										</span>
									</>
								) : undefined
							}
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
								Reset to workspace rates
							</button>
						</div>
					</div>
				</div>

				<PostJobShiftField label="Dress code">
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
										{d}
									</option>
								))}
								<option value={DRESS_CODE_OTHER_ID}>Other</option>
							</IzSelect>
						</div>
						{isOtherDressCode(shift.dressCode) && (
							<input
								type="text"
								className="iz-job-posting-control iz-job-posting-input w-full min-w-0 text-sm"
								placeholder="Name dress code"
								aria-label="Custom dress code"
								value={shift.customDressCode ?? ""}
								onChange={(e) => onChange({ customDressCode: e.target.value })}
							/>
						)}
					</div>
				</PostJobShiftField>

				<PostJobShiftField
					label="Select PRs"
					className="!mb-0 iz-post-job-pr-field"
					layout="stack"
				>
					{maxNamedPrSelect === 0 ? (
						<p className="text-[11px] text-[var(--iz-muted)]">{prPickerHint}</p>
					) : (
						<DraftPrPicker
							candidates={prCandidates}
							emptyHint={prEmptyHint}
							selected={shift.prIds}
							onSelectedChange={(prIds) =>
								onChange({
									prIds,
									quantity: Math.max(shift.quantity, prIds.length),
								})
							}
							quantity={shift.quantity}
							poolSize={subscriptionPlan.prPoolSize}
							maxSelect={subscriptionPlan.prSelectMax}
							dailyRemaining={namedPrRemaining}
							poolHint={prPickerHint}
						/>
					)}
				</PostJobShiftField>
			</div>
		</div>
	);
}
