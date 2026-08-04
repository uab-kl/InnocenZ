import {
	addDaysToIso,
	getPayrollWeekSundayIso,
	getPreviousWeekSundayIso,
} from "@agency-portal/lib/demo-clock";
import {
	getVelvetReportWeekOptions,
	velvetReportDateBounds,
} from "@agency-portal/lib/velvet-week-demo";

export type OutletReportTab = "this_week" | "last_week" | "custom";

export type OutletReportPeriod = "3d" | "week" | "month";

export interface OutletReportPrefs {
	tab: OutletReportTab;
	/** Selected week (Sunday ISO) when browsing week history */
	weekSundayIso: string;
	customStartIso: string;
	customEndIso: string;
	/** Explicit nights selected in custom range (may be non-contiguous) */
	customDateIsos?: string[];
	customPeriod: OutletReportPeriod;
}

const STORAGE_PREFIX = "innocenz-outlet-report-prefs";

export function clampReportStartIso(iso: string): string {
	const { minIso, maxIso } = velvetReportDateBounds();
	if (!iso || iso < minIso) return minIso;
	if (iso > maxIso) return maxIso;
	return iso;
}

export function clampReportEndIso(iso: string): string {
	const { minIso, maxIso } = velvetReportDateBounds();
	if (!iso || iso < minIso) return minIso;
	if (iso > maxIso) return maxIso;
	return iso;
}

export function normalizeCustomReportRange(
	startIso: string,
	endIso: string,
): { startIso: string; endIso: string } {
	let start = clampReportStartIso(startIso);
	let end = clampReportEndIso(endIso);
	if (end < start) [start, end] = [end, start];
	return { startIso: start, endIso: end };
}

export function defaultOutletReportPrefs(): OutletReportPrefs {
	const thisSun = getPayrollWeekSundayIso();
	const lastSun = getPreviousWeekSundayIso();
	const customEndIso = endIsoForReportPeriod(lastSun, "week");
	return {
		tab: "this_week",
		weekSundayIso: thisSun,
		customStartIso: lastSun,
		customEndIso,
		customPeriod: "week",
	};
}

function storageKey(orgName: string) {
	return `${STORAGE_PREFIX}:${orgName.trim().toLowerCase() || "outlet"}`;
}

function migrateLegacyWeekSundayIso(
	tab: OutletReportTab,
	iso: string,
	fallback: string,
): string {
	if (tab === "this_week") return getPayrollWeekSundayIso();
	if (tab === "last_week") return getPreviousWeekSundayIso();
	const options = getVelvetReportWeekOptions();
	if (options.some((w) => w.weekSundayIso === iso)) return iso;
	return fallback;
}

export function loadOutletReportPrefs(orgName: string): OutletReportPrefs {
	if (typeof window === "undefined") return defaultOutletReportPrefs();
	try {
		const raw = localStorage.getItem(storageKey(orgName));
		if (!raw) return defaultOutletReportPrefs();
		const parsed = JSON.parse(raw) as Partial<OutletReportPrefs>;
		const defaults = defaultOutletReportPrefs();
		const customStartIso = clampReportStartIso(
			parsed.customStartIso ?? defaults.customStartIso,
		);
		const customPeriod = parsed.customPeriod ?? defaults.customPeriod;
		const customEndIso = normalizeCustomReportRange(
			customStartIso,
			parsed.customEndIso ??
				endIsoForReportPeriod(customStartIso, customPeriod),
		).endIso;
		const tab = parsed.tab ?? defaults.tab;
		return {
			tab,
			weekSundayIso: migrateLegacyWeekSundayIso(
				tab,
				parsed.weekSundayIso ?? defaults.weekSundayIso,
				defaults.weekSundayIso,
			),
			customStartIso,
			customEndIso,
			customDateIsos: parsed.customDateIsos?.length
				? [...parsed.customDateIsos].sort()
				: undefined,
			customPeriod,
		};
	} catch {
		return defaultOutletReportPrefs();
	}
}

export function saveOutletReportPrefs(
	orgName: string,
	prefs: OutletReportPrefs,
) {
	if (typeof window === "undefined") return;
	const range = normalizeCustomReportRange(
		prefs.customStartIso,
		prefs.customEndIso,
	);
	try {
		localStorage.setItem(
			storageKey(orgName),
			JSON.stringify({
				...prefs,
				customStartIso: range.startIso,
				customEndIso: range.endIso,
			}),
		);
	} catch {
		/* ignore quota */
	}
}

export function endIsoForReportPeriod(
	startIso: string,
	period: OutletReportPeriod,
): string {
	const { maxIso } = velvetReportDateBounds();
	let end: string;
	if (period === "3d") end = addDaysToIso(startIso, 2);
	else if (period === "week") end = addDaysToIso(startIso, 6);
	else {
		const [y, m] = startIso.split("-").map(Number);
		const lastDay = new Date(y, m, 0).getDate();
		end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
	}
	return end > maxIso ? maxIso : end;
}

export function customRangeMatchesPeriod(
	startIso: string,
	endIso: string,
	period: OutletReportPeriod,
): boolean {
	return endIso === endIsoForReportPeriod(startIso, period);
}

export function periodLabel(period: OutletReportPeriod): string {
	if (period === "3d") return "3 days";
	if (period === "week") return "1 week";
	return "Whole month";
}
