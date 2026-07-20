import { useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { ShiftHistoryLog } from '@agency-portal/components/iz/ShiftHistoryLog';
import {
  OutletPage,
  OutletPageHeader,
} from '@agency-portal/components/outlet/outlet-portal-ui';
import { useOutletHistory } from '@agency-portal/hooks/use-outlet-history';
import { shiftHistoryForOutlet } from '@agency-portal/lib/portal-sync';
import { useStore } from '@agency-portal/lib/store';

export const Route = createFileRoute('/outlet/history')({
  component: OutletHistory,
});

function OutletHistory() {
  const shiftHistory = useStore((s) => s.shiftHistory) ?? [];
  const storeOutletName = useStore((s) => s.outletWorkspace.outletName);
  // A real session reads its sealed nights from the backend; demo sessions keep
  // reading the demo store.
  const backend = useOutletHistory();
  const outletName = backend.backed ? backend.outletName : storeOutletName;
  const demoRows = useMemo(
    () => shiftHistoryForOutlet(shiftHistory, storeOutletName),
    [shiftHistory, storeOutletName],
  );
  const rows = backend.backed ? backend.rows : demoRows;
  const summaryHint = useMemo(() => {
    if (backend.isLoading) return 'Loading shift history…';
    if (rows.length === 0)
      return 'No shift history yet — completed shifts will appear here.';
    const sorted = [...rows].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
    const oldest = sorted[0]?.dateDisplay;
    const newest = sorted[sorted.length - 1]?.dateDisplay;
    const totalPayout = rows.reduce((a, r) => a + r.totalPayout, 0);
    const range =
      oldest && newest && oldest !== newest
        ? `${oldest} – ${newest}`
        : (oldest ?? newest);
    return `${rows.length} PR shifts · ${range} · RM ${totalPayout.toLocaleString()} paid out`;
  }, [rows, backend.isLoading]);

  return (
    <OutletPage>
      <OutletPageHeader
        eyebrow={outletName}
        title="History"
        hint={summaryHint}
      />
      <ShiftHistoryLog portal="outlet" rows={rows} embedded />
    </OutletPage>
  );
}
