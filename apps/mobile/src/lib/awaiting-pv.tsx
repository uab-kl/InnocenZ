/**
 * Real "awaiting PR signature" last-week voucher — source of truth is
 * GET /payment-voucher/mine/last-week. Empty when no PV exists (no last-week
 * shifts), so To-do / notifications never invent demo amounts.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from './session';
import { fetchMyLastWeek, type PrCurrentWeek } from './api';
import { useSignedPvs } from './signed-pv';
import { formatRM, weekRangeLabel } from './demo-shifts';

const REVIEWABLE = new Set(['sent', 'awaiting_pr']);

export type AwaitingPvTodo = {
  id: string;
  pvId: string;
  title: string;
  subtitle: string;
  actionLabel: string;
  net: number;
  ref: string;
  outlet: string;
};

/** The stored number (0075); the week-derived form is a pre-0075 fallback. */
function pvRef(week: PrCurrentWeek): string {
  if (week.voucherNo) return week.voucherNo;
  const end = (week.weekEnd ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (end) return `PV-${end[1]}${end[2]}${end[3]}`;
  return `PV-${(week.voucherId ?? 'week').slice(0, 8).toUpperCase()}`;
}

function outletFromWeek(week: PrCurrentWeek): string {
  const outlets = [
    ...new Set(week.lines.map((l) => l.outlet?.trim()).filter(Boolean) as string[]),
  ];
  if (outlets.length === 1) return outlets[0]!;
  if (outlets.length > 1) return `(${outlets.length})-outlet`;
  return 'Outlet';
}

export function useAwaitingLastWeekPv() {
  const { token } = useSession();
  const { isSigned } = useSignedPvs();
  const [week, setWeek] = useState<PrCurrentWeek | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) {
      setWeek(null);
      return;
    }
    setLoading(true);
    try {
      setWeek(await fetchMyLastWeek(token));
    } catch {
      setWeek(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const awaiting = useMemo(() => {
    if (!week?.voucherId) return null;
    if (!REVIEWABLE.has(week.status ?? '')) return null;
    if (isSigned(week.voucherId)) return null;
    const net = Number(week.net) || 0;
    const hasLines = week.lines.some((l) => l.commission > 0);
    if (net <= 0 && !hasLines) return null;
    const ref = pvRef(week);
    const outlet = outletFromWeek(week);
    const todo: AwaitingPvTodo = {
      id: `todo-pv-${week.voucherId}`,
      pvId: week.voucherId,
      title: 'Review payment voucher',
      subtitle: `${outlet} · ${ref} · ${formatRM(net)}`,
      actionLabel: 'Review PV',
      net,
      ref,
      outlet,
    };
    return { week, todo, weekLabel: weekRangeLabel(1) };
  }, [week, isSigned]);

  return { awaiting, loading, refresh, lastWeek: week };
}
