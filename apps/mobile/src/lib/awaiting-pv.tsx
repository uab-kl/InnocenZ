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
import { formatMessage, useLocale, type AppTranslations } from '../i18n';

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
  /** WHOSE voucher this is — null on a backend that has not restarted yet. */
  agencyName?: string | null;
};

/** The stored number (0075); the week-derived form is a pre-0075 fallback. */
function pvRef(week: PrCurrentWeek): string {
  if (week.voucherNo) return week.voucherNo;
  const end = (week.weekEnd ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (end) return `PV-${end[1]}${end[2]}${end[3]}`;
  return `PV-${(week.voucherId ?? 'week').slice(0, 8).toUpperCase()}`;
}

/**
 * Venue label for the to-do card. Module scope — no hooks here, so the caller
 * hands the dictionary in. Real outlet names are DATA and pass through
 * untouched; only the generated multi-venue and empty labels are localized.
 */
function outletFromWeek(week: PrCurrentWeek, t: AppTranslations): string {
  const outlets = [
    ...new Set(week.lines.map((l) => l.outlet?.trim()).filter(Boolean) as string[]),
  ];
  if (outlets.length === 1) return outlets[0]!;
  if (outlets.length > 1) {
    return formatMessage(t.shiftLib.multiOutlet, { n: outlets.length });
  }
  return t.common.outlet;
}

export function useAwaitingLastWeekPv() {
  const { t } = useLocale();
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

  /**
   * ONE TO-DO PER VOUCHER — a week can be waiting on more than one signature.
   *
   * ⚠️ This gated on `week.status` and `week.net`, which are the NEWEST voucher's
   * status and the WHOLE WEEK's money. For a PR on two rosters that was wrong
   * twice over. With Atlas's voucher `sent` and Why We Met's newer one still
   * `pending_review`, the week's status was `pending_review`, the gate failed,
   * and the PR was NEVER TOLD Atlas was waiting on them. Reverse the order and
   * they got a single to-do whose amount was both agencies' money and whose id
   * was one agency's document.
   *
   * Each voucher is now asked for itself, and each to-do NAMES the agency it
   * belongs to — the PR is signing that agency's document, so it has to say so.
   */
  const awaitingAll = useMemo<AwaitingPvTodo[]>(() => {
    if (!week) return [];

    // Per-voucher when the backend offers it, else the single merged week — which
    // IS one voucher on a one-agency week, the case this always handled.
    const rows =
      week.vouchers && week.vouchers.length > 0
        ? week.vouchers.map((v) => ({
            id: v.id,
            voucherNo: v.voucherNo,
            agencyName: v.agencyName,
            net: v.net,
            status: v.status,
            lines: week.lines.filter((l) => !l.voucherId || l.voucherId === v.id),
          }))
        : week.voucherId
          ? [
              {
                id: week.voucherId,
                voucherNo: week.voucherNo ?? null,
                agencyName: null as string | null,
                net: week.net,
                status: week.status,
                lines: week.lines,
              },
            ]
          : [];

    return rows.flatMap((row) => {
      if (!REVIEWABLE.has(row.status ?? '')) return [];
      if (isSigned(row.id)) return [];
      const net = Number(row.net) || 0;
      const hasLines = row.lines.some((l) => l.commission > 0);
      if (net <= 0 && !hasLines) return [];
      const ref =
        row.voucherNo ?? pvRef({ ...week, voucherId: row.id, voucherNo: row.voucherNo });
      const outlet = outletFromWeek({ ...week, lines: row.lines }, t);
      // The agency LEADS the subtitle: on a two-voucher week the venue and the
      // week label are often identical, so it is the only thing telling the PR
      // which of the two they are about to sign.
      const who = row.agencyName?.trim();
      return [
        {
          id: `todo-pv-${row.id}`,
          pvId: row.id,
          title: t.shiftLib.reviewPvTitle,
          subtitle: `${who ? `${who} · ` : ''}${outlet} · ${ref} · ${formatRM(net)}`,
          actionLabel: t.shiftLib.reviewPvAction,
          net,
          ref,
          outlet,
          agencyName: row.agencyName ?? null,
        },
      ];
    });
  }, [week, isSigned, t]);

  /**
   * The FIRST outstanding to-do, for the callers that show a single prompt
   * (TopBar's badge, the Shifts to-do row). Kept so those keep working unchanged;
   * anything LISTING signatures should read `awaitingAll`.
   */
  const awaiting = useMemo(
    () =>
      awaitingAll.length > 0
        ? { week, todo: awaitingAll[0]!, weekLabel: weekRangeLabel(1) }
        : null,
    [awaitingAll, week],
  );

  return { awaiting, awaitingAll, loading, refresh, lastWeek: week };
}
