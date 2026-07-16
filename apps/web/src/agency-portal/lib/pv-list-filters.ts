import {
  fmtHistDate,
  parsePvIssuedMs,
  type PrPaymentVoucher,
  type PrReceiptScan,
} from '@agency-portal/lib/pr-demo';
import {
  parseDateInputMs,
  parseScannedAtMs,
} from '@agency-portal/lib/payroll-filters';

const PV_MONTHS: Record<string, number> = {
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

export type PvDayTimeFilter = {
  date: string;
  timeFrom: string;
  timeTo: string;
};

export const EMPTY_PV_DAY_TIME_FILTER: PvDayTimeFilter = {
  date: '',
  timeFrom: '',
  timeTo: '',
};

export function dateKeyFromTuple(d: [number, number, number]) {
  const [y, m, day] = d;
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function dateFromIsoKey(key: string): Date | undefined {
  if (!key) return undefined;
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

export function isoKeyFromDate(date: Date) {
  return dateKeyFromTuple([
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  ]);
}

function msToIsoKey(ms: number) {
  return isoKeyFromDate(new Date(ms));
}

export function pvRowDisplayDateKey(
  rowDate: string,
  cycleOrIssued: string,
): string | null {
  const yearMatch = cycleOrIssued.match(/\d{4}/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : 2026;
  const m = rowDate.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})/);
  if (!m) return null;
  const month = PV_MONTHS[m[2].slice(0, 3).toLowerCase()];
  if (!month) return null;
  return dateKeyFromTuple([year, month, parseInt(m[1], 10)]);
}

export function collectPvDateKeys(
  pv: PrPaymentVoucher,
  scans: PrReceiptScan[] = [],
): string[] {
  const keys = new Set<string>();

  if (pv.timeIn) {
    const ms = parseScannedAtMs(pv.timeIn);
    if (ms) keys.add(msToIsoKey(ms));
  }
  if (pv.timeOut) {
    const ms = parseScannedAtMs(pv.timeOut);
    if (ms) keys.add(msToIsoKey(ms));
  }

  for (const row of pv.rows) {
    const k = pvRowDisplayDateKey(row.date, pv.cycle || pv.issued);
    if (k) keys.add(k);
  }

  for (const id of pv.receiptIds ?? []) {
    const scan = scans.find((s) => s.id === id);
    if (scan) keys.add(dateKeyFromTuple(scan.date));
  }

  const issuedMs = parsePvIssuedMs(pv.issued);
  if (issuedMs) keys.add(msToIsoKey(issuedMs));

  return [...keys];
}

export function pvEventMsForDate(
  pv: PrPaymentVoucher,
  dateIso: string,
  scans: PrReceiptScan[] = [],
): number | null {
  if (pv.timeIn) {
    const ms = parseScannedAtMs(pv.timeIn);
    if (ms && msToIsoKey(ms) === dateIso) return ms;
  }

  const receiptMs = (pv.receiptIds ?? [])
    .map((id) => scans.find((s) => s.id === id))
    .filter((s): s is PrReceiptScan => Boolean(s))
    .filter((s) => dateKeyFromTuple(s.date) === dateIso)
    .map((s) => parseScannedAtMs(s.scannedAt));
  if (receiptMs.length > 0) return Math.min(...receiptMs);

  const issuedMs = parsePvIssuedMs(pv.issued);
  if (issuedMs && msToIsoKey(issuedMs) === dateIso) {
    if (pv.financeHeadSignedAt) {
      const signed = parseScannedAtMs(pv.financeHeadSignedAt);
      if (signed) return signed;
    }
    return issuedMs;
  }

  for (const row of pv.rows) {
    const k = pvRowDisplayDateKey(row.date, pv.cycle || pv.issued);
    if (k === dateIso) return parseDateInputMs(dateIso, '12:00');
  }

  return null;
}

export function pvDayTimeFilterActive(filter: PvDayTimeFilter): boolean {
  return Boolean(filter.date || filter.timeFrom || filter.timeTo);
}

export function pvDayTimeFilterCount(filter: PvDayTimeFilter): number {
  let n = 0;
  if (filter.date) n++;
  if (filter.date && filter.timeFrom) n++;
  if (filter.date && filter.timeTo) n++;
  return n;
}

export function matchesPvDayTimeFilter(
  pv: PrPaymentVoucher,
  filter: PvDayTimeFilter,
  scans: PrReceiptScan[] = [],
): boolean {
  if (!filter.date) return true;

  const keys = collectPvDateKeys(pv, scans);
  if (!keys.includes(filter.date)) return false;

  if (!filter.timeFrom && !filter.timeTo) return true;

  const eventMs = pvEventMsForDate(pv, filter.date, scans);
  if (!eventMs) return false;

  const fromMs = parseDateInputMs(filter.date, filter.timeFrom || '00:00');
  const toMs = parseDateInputMs(filter.date, filter.timeTo || '23:59');
  if (fromMs != null && eventMs < fromMs) return false;
  if (toMs != null && eventMs > toMs) return false;
  return true;
}

export function buildPvDateOptions(
  pvs: PrPaymentVoucher[],
  scans: PrReceiptScan[] = [],
): { key: string; label: string }[] {
  const map = new Map<string, string>();
  for (const pv of pvs) {
    for (const key of collectPvDateKeys(pv, scans)) {
      if (map.has(key)) continue;
      const d = dateFromIsoKey(key);
      map.set(
        key,
        d ? fmtHistDate(d.getFullYear(), d.getMonth() + 1, d.getDate()) : key,
      );
    }
  }
  return [...map.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => b.key.localeCompare(a.key));
}
