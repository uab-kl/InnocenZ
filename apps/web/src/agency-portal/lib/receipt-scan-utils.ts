import type { PrReceiptItem, PrReceiptScan } from '@agency-portal/lib/pr-demo';
import { outletMatches } from '@agency-portal/lib/portal-sync';
import type { ShiftHistoryRow } from '@agency-portal/lib/shift-history-utils';
import { DEFAULT_ROSTER_DATE_ISO } from '@agency-portal/lib/roster-availability';

export function normalizeReceiptRef(ref: string): string {
  return ref.trim().toUpperCase();
}

export function findReceiptByRef(
  scans: PrReceiptScan[],
  receiptRef: string,
): PrReceiptScan | undefined {
  const norm = normalizeReceiptRef(receiptRef);
  return scans.find((s) => normalizeReceiptRef(s.receiptRef) === norm);
}

export type ReceiptScanDraft = {
  receiptRef: string;
  outlet: string;
  prCode: string;
  prName: string;
  prId: string;
  items: PrReceiptItem[];
  totalLogged: number;
};

export function validateReceiptScan(
  scans: PrReceiptScan[],
  draft: ReceiptScanDraft,
  scannerPrId: string,
): { ok: true } | { ok: false; message: string } {
  const ref = draft.receiptRef?.trim();
  if (!ref) {
    return {
      ok: false,
      message: 'Receipt ID missing on slip — cannot log commission',
    };
  }

  const existing = findReceiptByRef(scans, ref);
  if (existing) {
    const who = existing.prName || existing.prId || 'another PR';
    return {
      ok: false,
      message: `Receipt ${ref} already scanned by ${who} · duplicate blocked`,
    };
  }

  if (!draft.prId?.trim()) {
    return {
      ok: false,
      message: 'Receipt has no PR ID — commission cannot be assigned',
    };
  }

  if (draft.prId !== scannerPrId) {
    return {
      ok: false,
      message: `Receipt is stamped for PR ${draft.prId} — only that PR can claim commission`,
    };
  }

  return { ok: true };
}

export function receiptDateIso(scan: PrReceiptScan): string {
  const [y, m, d] = scan.date;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** History tab — hide receipts still attached to tonight's live shift. */
export function isReceiptFromPastShift(
  scan: PrReceiptScan,
  shiftHistory: ShiftHistoryRow[],
  prId: string,
  opts?: {
    todayIso?: string;
    checkedIn?: boolean;
    checkedOut?: boolean;
    activeOutlet?: string | null;
  },
): boolean {
  const todayIso = opts?.todayIso ?? DEFAULT_ROSTER_DATE_ISO;
  const dateIso = receiptDateIso(scan);
  if (dateIso > todayIso) return false;

  const rosterId = scan.prId ?? prId;
  if (scan.prId && scan.prId !== prId) return false;

  if (
    opts?.checkedIn &&
    !opts?.checkedOut &&
    dateIso === todayIso &&
    opts.activeOutlet &&
    outletMatches(scan.outlet, opts.activeOutlet)
  ) {
    return false;
  }

  if (dateIso < todayIso) return true;

  return shiftHistory.some(
    (h) =>
      h.prId === rosterId &&
      h.dateIso === dateIso &&
      outletMatches(h.outlet, scan.outlet),
  );
}
