/**
 * Loads every CLOSED week's payment_voucher row for the History tabs — not just
 * signed/paid ones, because a week sits in `pending_review` from the moment it
 * closes until the agency issues it, and that is exactly when a PR comes looking
 * for it. Anything not paid renders as "Signed".
 *
 * Empty list when the PR has no closed weeks yet (e.g. no last-week shifts).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSession } from './session';
import { fetchMyPaymentHistory, type PrHistoryVoucher } from './api';
import { historyVoucherToPayWeek } from './payment-history-map';
import type { HistPayWeek } from './demo-payment-history';
import { normalizeHistPayWeek } from './history-pay-sync';

type PaymentHistoryState = {
  vouchers: PrHistoryVoucher[];
  weeks: HistPayWeek[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const PaymentHistoryContext = createContext<PaymentHistoryState | null>(null);

export function PaymentHistoryProvider({ children }: { children: React.ReactNode }) {
  const { token } = useSession();
  const [vouchers, setVouchers] = useState<PrHistoryVoucher[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setVouchers(await fetchMyPaymentHistory(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load payment history');
      setVouchers([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const weeks = useMemo(
    () => vouchers.map((v) => normalizeHistPayWeek(historyVoucherToPayWeek(v))),
    [vouchers],
  );

  const value = useMemo(
    () => ({ vouchers, weeks, loading, error, refresh }),
    [vouchers, weeks, loading, error, refresh],
  );

  return (
    <PaymentHistoryContext.Provider value={value}>{children}</PaymentHistoryContext.Provider>
  );
}

export function usePaymentHistory(): PaymentHistoryState {
  const ctx = useContext(PaymentHistoryContext);
  if (!ctx) throw new Error('usePaymentHistory must be used inside PaymentHistoryProvider');
  return ctx;
}
