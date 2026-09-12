/**
 * Signed PVs move from Payment inbox → History (Payment history).
 * Local demo store so Confirm signature redirects with the amount visible.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { MONTH_NAMES, weekPayGridTotal, type DemoPv, type WeeklyDayPay } from './demo-shifts';
import type { HistPayLine, HistPayWeek } from './demo-payment-history';
import { normalizeHistPayWeek } from './history-pay-sync';

const STORE_KEY = 'iz-pr-signed-pvs-v3';

type SignedPvState = {
  signedWeeks: HistPayWeek[];
  isSigned: (pvId: string) => boolean;
  signPv: (input: {
    pv: DemoPv;
    net: number;
    grid: WeeklyDayPay[];
    sigName: string;
  }) => HistPayWeek;
};

type WebStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function webStorage(): WebStorage | null {
  if (Platform.OS !== 'web') return null;
  return (globalThis as { localStorage?: WebStorage }).localStorage ?? null;
}

function readStore(): HistPayWeek[] {
  try {
    const raw = webStorage()?.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistPayWeek[];
    return Array.isArray(parsed) ? parsed.map(normalizeHistPayWeek) : [];
  } catch {
    return [];
  }
}

function writeStore(weeks: HistPayWeek[]) {
  try {
    webStorage()?.setItem(STORE_KEY, JSON.stringify(weeks));
  } catch {
    /* ignore */
  }
}

function fmtSignedStamp(d = new Date()): string {
  const day = d.getDate();
  const mon = MONTH_NAMES[d.getMonth()];
  const y = d.getFullYear();
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${day} ${mon} ${y} · ${h}:${m}`;
}

function linesFromGrid(grid: WeeklyDayPay[], outlet: string): HistPayLine[] {
  const lines: HistPayLine[] = [];
  for (const d of grid) {
    if (d.status === 'empty') continue;
    // Include month so History → Shifts can parse line dates back to ISO.
    const [y, m] = d.dateIso.split('-').map(Number);
    const mon = MONTH_NAMES[(m ?? 1) - 1] ?? 'Jan';
    const date = `${String(d.date).padStart(2, '0')} ${mon}`;
    if (d.wages > 0) {
      lines.push({
        date,
        day: d.day,
        type: 'Daily wages',
        outlet,
        amount: d.wages,
      });
    }
    if ((d.drinks ?? 0) > 0) {
      lines.push({
        date,
        day: d.day,
        type: 'Drinks commission',
        outlet,
        amount: d.drinks!,
      });
    }
    if ((d.tips ?? 0) > 0) {
      lines.push({
        date,
        day: d.day,
        type: 'Tips commission',
        outlet,
        amount: d.tips!,
      });
    }
    if ((d.others ?? 0) > 0) {
      lines.push({
        date,
        day: d.day,
        type: 'Others',
        outlet,
        amount: d.others!,
      });
    }
    /*
     * ⚠️ THE FINE HAS TO BE WRITTEN INTO THE SNAPSHOT TOO.
     *
     * Every emit above gates on `> 0`, and there was no branch for the grid's
     * `deductions` at all — so a signed week was stored with NO `debit` line.
     * `buildSignedWeek` sealed the right total, but `normalizeHistPayWeek` then
     * derived debits from `line.debit`, got zero, recomputed net as
     * wages + commission and overwrote the seal. A PR signed a voucher reading
     * RM 338.00 and History immediately showed that same week at RM 588.00, the
     * red −RM 250.00 row missing entirely — and on web that wrong figure
     * persisted in localStorage indefinitely.
     *
     * Stored as a positive `amount` with `debit: true`, the shape the renderer
     * and the normaliser both already expect. `deductions` is held NEGATIVE on
     * the grid, so its magnitude is what goes in.
     */
    if ((d.deductions ?? 0) < 0) {
      lines.push({
        date,
        day: d.day,
        type: 'Others',
        outlet,
        amount: Math.abs(d.deductions!),
        debit: true,
      });
    }
  }
  return lines;
}

function buildSignedWeek(input: {
  pv: DemoPv;
  net: number;
  grid: WeeklyDayPay[];
  sigName: string;
}): HistPayWeek {
  const wages = input.grid.reduce((s, d) => s + d.wages, 0);
  const commission = input.grid.reduce(
    (s, d) => s + (d.drinks ?? 0) + (d.tips ?? 0) + (d.others ?? 0),
    0,
  );
  /*
   * ⚠️ DAYS THAT EARNED, not days that exist.
   *
   * `status !== 'empty'` counts a day whose only content is a charged fine —
   * and since that day now resolves to 'deducted' rather than 'empty', it
   * counted one for a shift the PR did not work. A late-cancel fee exists
   * BECAUSE they did not attend.
   */
  const shifts = input.grid.filter(
    (d) =>
      d.status !== 'empty' &&
      d.wages + (d.drinks ?? 0) + (d.tips ?? 0) + (d.others ?? 0) > 0,
  ).length;
  const stamp = fmtSignedStamp();
  /** Always seal net from the week grid so History matches Payment Last week. */
  const net = weekPayGridTotal(input.grid) || input.net;
  return {
    id: input.pv.id,
    ref: input.pv.ref,
    weekLabel: input.pv.weekLabel,
    outlet: input.pv.outlet,
    // Not `Math.max(1, …)`: a week that is only a cancellation fee has zero
    // shifts, and saying "1" invents one the voucher does not pay for.
    shifts,
    issued: stamp.split(' · ')[0] ?? stamp,
    status: 'signed',
    // This builder exists BECAUSE the PR just signed it, so there is nothing
    // left to offer. `canSign` is required rather than optional on the type on
    // purpose: optional would have let this second construction site keep
    // silently returning `undefined`, and the button would have disappeared
    // here for the right reason by accident.
    canSign: false,
    statusMeta: `Signed ${stamp}`,
    net: Math.round(net * 100) / 100,
    wages: Math.round(wages * 100) / 100,
    commission: Math.round(commission * 100) / 100,
    lines: linesFromGrid(input.grid, input.pv.outlet),
  };
}

const SignedPvContext = createContext<SignedPvState | null>(null);

export function SignedPvProvider({ children }: { children: React.ReactNode }) {
  const [signedWeeks, setSignedWeeks] = useState<HistPayWeek[]>(() => readStore());

  const isSigned = useCallback(
    (pvId: string) => signedWeeks.some((w) => w.id === pvId),
    [signedWeeks],
  );

  const signPv = useCallback(
    (input: {
      pv: DemoPv;
      net: number;
      grid: WeeklyDayPay[];
      sigName: string;
    }) => {
      const week = buildSignedWeek(input);
      setSignedWeeks((prev) => {
        const next = [week, ...prev.filter((w) => w.id !== week.id)];
        writeStore(next);
        return next;
      });
      return week;
    },
    [],
  );

  const value = useMemo(
    () => ({ signedWeeks, isSigned, signPv }),
    [signedWeeks, isSigned, signPv],
  );

  return <SignedPvContext.Provider value={value}>{children}</SignedPvContext.Provider>;
}

export function useSignedPvs(): SignedPvState {
  const ctx = useContext(SignedPvContext);
  if (!ctx) throw new Error('useSignedPvs must be used inside SignedPvProvider');
  return ctx;
}
