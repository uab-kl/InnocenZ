/**
 * PR current-week earnings — the real backend replacement for the localStorage
 * receipt logs. Backed by the PR's current-week draft voucher
 * (reused payment_voucher + payment_voucher_line). Shared across Scan (create /
 * edit / delete), Check-In STATUS (live rows) and Payment (This-week grid) so a
 * change in one reflects everywhere after `refresh`.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSession } from './session';
import {
  addMyReceiptLine,
  deleteMyReceiptLine,
  fetchMyCurrentWeek,
  submitMyReceipt,
  updateMyReceiptLine,
  type PrCurrentWeek,
  type PrReceiptLine,
  type PrReceiptLineInput,
  type PrReceiptRecord,
  type PrReceiptSubmitInput,
} from './api';

type PrEarningsState = {
  current: PrCurrentWeek | null;
  loading: boolean;
  error: string | null;
  /** All current-week lines (wages + drinks + tips + others). */
  lines: PrReceiptLine[];
  /** Drink/tip self-log rows shown in the Check-In STATUS table. */
  receiptLines: PrReceiptLine[];
  refresh: () => Promise<void>;
  addLine: (input: PrReceiptLineInput) => Promise<PrReceiptLine>;
  /** Saves one whole scanned/self-logged receipt (header + items) in one call. */
  submitReceipt: (input: PrReceiptSubmitInput) => Promise<PrReceiptRecord>;
  updateLine: (id: string, input: Partial<PrReceiptLineInput>) => Promise<PrReceiptLine>;
  deleteLine: (id: string) => Promise<void>;
};

const PrEarningsContext = createContext<PrEarningsState | null>(null);

export function PrEarningsProvider({ children }: { children: React.ReactNode }) {
  const { token } = useSession();
  const [current, setCurrent] = useState<PrCurrentWeek | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setCurrent(await fetchMyCurrentWeek(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this week');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addLine = useCallback(
    async (input: PrReceiptLineInput) => {
      if (!token) throw new Error('Not signed in');
      const line = await addMyReceiptLine(token, input);
      await refresh();
      return line;
    },
    [token, refresh],
  );

  const submitReceipt = useCallback(
    async (input: PrReceiptSubmitInput) => {
      if (!token) throw new Error('Not signed in');
      const receipt = await submitMyReceipt(token, input);
      await refresh();
      return receipt;
    },
    [token, refresh],
  );

  const updateLine = useCallback(
    async (id: string, input: Partial<PrReceiptLineInput>) => {
      if (!token) throw new Error('Not signed in');
      const line = await updateMyReceiptLine(token, id, input);
      await refresh();
      return line;
    },
    [token, refresh],
  );

  const deleteLine = useCallback(
    async (id: string) => {
      if (!token) throw new Error('Not signed in');
      await deleteMyReceiptLine(token, id);
      await refresh();
    },
    [token, refresh],
  );

  const lines = current?.lines ?? [];
  const receiptLines = useMemo(
    () => lines.filter((l) => l.kind === 'drinks' || l.kind === 'tips' || l.kind === 'others'),
    [lines],
  );

  const value = useMemo<PrEarningsState>(
    () => ({ current, loading, error, lines, receiptLines, refresh, addLine, submitReceipt, updateLine, deleteLine }),
    [current, loading, error, lines, receiptLines, refresh, addLine, submitReceipt, updateLine, deleteLine],
  );

  return <PrEarningsContext.Provider value={value}>{children}</PrEarningsContext.Provider>;
}

export function usePrEarnings(): PrEarningsState {
  const ctx = useContext(PrEarningsContext);
  if (!ctx) throw new Error('usePrEarnings must be used inside PrEarningsProvider');
  return ctx;
}

/** Sum of receipt commissions (RM) — drinks + tips (+ others), excludes wages. */
export function receiptCommissionTotal(lines: PrReceiptLine[]): number {
  return lines
    .filter((l) => l.kind !== 'wages')
    .reduce((sum, l) => sum + l.commission, 0);
}
