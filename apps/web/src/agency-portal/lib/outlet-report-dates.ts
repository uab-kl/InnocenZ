import { getLiveTodayIso } from '@agency-portal/lib/demo-clock';
import { shiftHistoryForOutlet } from '@agency-portal/lib/portal-sync';
import type { ShiftHistoryRow } from '@agency-portal/lib/shift-history-utils';
import {
  mappedVelvetReportNights,
  VELVET_OUTLET_NAME,
} from '@agency-portal/lib/velvet-week-demo';
import type { OutletReportPrefs } from '@agency-portal/lib/outlet-report-prefs';

/** Past/today nights with floor sales and at least one PR shift — selectable in custom reports. */
export function reportableDateIsosForOutlet(
  outletName: string,
  shiftHistory: ShiftHistoryRow[] | undefined,
  todayIso = getLiveTodayIso(),
): string[] {
  const isos = new Set<string>();

  if (outletName === VELVET_OUTLET_NAME) {
    for (const night of mappedVelvetReportNights()) {
      if (night.dateIso > todayIso) continue;
      if (night.sales > 0 && night.prs.length > 0) {
        isos.add(night.dateIso);
      }
    }
  }

  for (const row of shiftHistoryForOutlet(shiftHistory, outletName)) {
    if (row.dateIso > todayIso) continue;
    if (row.totalPayout > 0 || row.totalDrinks > 0 || row.totalTips > 0) {
      isos.add(row.dateIso);
    }
  }

  return [...isos].sort();
}

export function filterReportableDateIsos(
  isos: string[],
  reportable: Set<string>,
): string[] {
  return [...isos].filter((iso) => reportable.has(iso)).sort();
}

export function reportableIsosInRange(
  startIso: string,
  endIso: string,
  reportable: string[],
): string[] {
  return reportable.filter((iso) => iso >= startIso && iso <= endIso);
}

/** Resolve the active custom selection — prefers stored isos, else reportable nights in saved range. */
export function effectiveCustomReportDateIsos(
  prefs: OutletReportPrefs,
  reportableDateIsos: string[],
): string[] {
  const reportableSet = new Set(reportableDateIsos);
  if (prefs.customDateIsos?.length) {
    return filterReportableDateIsos(prefs.customDateIsos, reportableSet);
  }
  return reportableIsosInRange(
    prefs.customStartIso,
    prefs.customEndIso,
    reportableDateIsos,
  );
}

export function defaultCustomReportDateIsos(
  reportableDateIsos: string[],
): string[] {
  if (reportableDateIsos.length === 0) return [];
  return reportableDateIsos.slice(-7);
}
