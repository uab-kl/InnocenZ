import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { AgencyPaidPvDetail } from '@agency-portal/components/agency/AgencyPaidPvDetail';
import {
  HistDateRangePickerField,
  HistSelectField,
} from '@agency-portal/components/iz/ShiftHistoryLog';
import { OutletSection } from '@agency-portal/components/outlet/OutletSection';
import { IzCard, IzPill, formatRM } from '@agency-portal/components/iz/ui';
import type { AgencyManagedPR } from '@agency-portal/lib/agency-demo';
import {
  getAgencyManagedPvs,
  getAgencyManagedReceiptScans,
  receiptsForPv,
  resolvePvPrId,
  resolvePvPrName,
} from '@agency-portal/lib/agency-payroll';
import {
  fmtDateLabelFromIso,
  getPvNetTotal,
  getPvSalesTotal,
  parsePvIssuedMs,
  pvStatusPillVariant,
  type PrPaymentVoucher,
  type PrReceiptScan,
} from '@agency-portal/lib/pr-demo';

function pvIssuedDateIso(pv: PrPaymentVoucher): string {
  const ms = parsePvIssuedMs(pv.issued);
  if (!ms) return '';
  return format(new Date(ms), 'yyyy-MM-dd');
}

export function AgencyPaidPvHistory({
  pvs,
  receiptScans,
  agencyPRs,
  initialPvId,
  onClearInitialPv,
}: {
  pvs: PrPaymentVoucher[];
  receiptScans: PrReceiptScan[];
  agencyPRs: AgencyManagedPR[];
  initialPvId?: string;
  onClearInitialPv?: () => void;
}) {
  const [detailId, setDetailId] = useState<string | null>(initialPvId ?? null);
  const [outletFilter, setOutletFilter] = useState('');
  const [prFilter, setPrFilter] = useState('');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  const paidPvs = useMemo(
    () =>
      getAgencyManagedPvs(pvs, agencyPRs).filter((p) => p.status === 'PAID'),
    [pvs, agencyPRs],
  );

  const outlets = useMemo(
    () => [...new Set(paidPvs.map((p) => p.outlet))].sort(),
    [paidPvs],
  );

  const prOptions = useMemo(() => {
    const ids = new Set(
      paidPvs
        .map((pv) => resolvePvPrId(pv, agencyPRs))
        .filter((id): id is string => Boolean(id)),
    );
    return agencyPRs
      .filter((pr) => ids.has(pr.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [paidPvs, agencyPRs]);

  const dateOptions = useMemo(() => {
    const byIso = new Map<string, string>();
    for (const pv of paidPvs) {
      const key = pvIssuedDateIso(pv);
      if (!key || byIso.has(key)) continue;
      byIso.set(key, fmtDateLabelFromIso(key));
    }
    return [...byIso.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, label]) => ({ key, label }));
  }, [paidPvs]);

  const filtered = useMemo(() => {
    return paidPvs
      .filter((pv) => {
        if (outletFilter && pv.outlet !== outletFilter) return false;
        if (prFilter && resolvePvPrId(pv, agencyPRs) !== prFilter) return false;
        const dateIso = pvIssuedDateIso(pv);
        if (dateRange.from && dateIso && dateIso < dateRange.from) return false;
        if (dateRange.to && dateIso && dateIso > dateRange.to) return false;
        return true;
      })
      .sort((a, b) => parsePvIssuedMs(b.issued) - parsePvIssuedMs(a.issued));
  }, [paidPvs, outletFilter, prFilter, dateRange, agencyPRs]);

  const totalPaid = useMemo(
    () => filtered.reduce((sum, pv) => sum + getPvNetTotal(pv), 0),
    [filtered],
  );

  const agencyReceiptScans = useMemo(
    () => getAgencyManagedReceiptScans(receiptScans, agencyPRs, pvs),
    [receiptScans, agencyPRs, pvs],
  );

  const detail = paidPvs.find((p) => p.id === detailId);

  if (detail) {
    return (
      <AgencyPaidPvDetail
        pv={detail}
        receiptScans={receiptsForPv(agencyReceiptScans, detail)}
        agencyPRs={agencyPRs}
        onBack={() => {
          setDetailId(null);
          onClearInitialPv?.();
        }}
      />
    );
  }

  return (
    <>
      <p className="iz-tiny iz-muted mt-1">
        Completed payment vouchers — archived here after bank transfer. Tap a
        row for PDF, Excel, or receipt.
      </p>

      <p className="iz-txn-filter-heading mt-4">Filter by</p>
      <div className="iz-txn-filters">
        <HistSelectField
          label="OUTLET"
          value={outletFilter}
          onChange={setOutletFilter}
          options={[
            { value: '', label: 'All outlets' },
            ...outlets.map((o) => ({ value: o, label: o })),
          ]}
        />
        <HistDateRangePickerField
          label="DATE"
          range={dateRange}
          onChange={setDateRange}
          dateOptions={dateOptions}
        />
        <HistSelectField
          label="PR"
          value={prFilter}
          onChange={setPrFilter}
          options={[
            { value: '', label: 'All PRs' },
            ...prOptions.map((pr) => ({ value: pr.id, label: pr.name })),
          ]}
        />
      </div>

      <OutletSection
        title="Paid payment vouchers"
        hint={`${filtered.length} record${filtered.length !== 1 ? 's' : ''} · ${formatRM(totalPaid)} total`}
        className="!mt-4"
      >
        {filtered.length === 0 ? (
          <IzCard className="text-center">
            <p className="iz-sm iz-muted">No paid vouchers match this filter</p>
          </IzCard>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((pv) => (
              <button
                key={pv.id}
                type="button"
                className="iz-card iz-between w-full cursor-pointer text-left"
                onClick={() => setDetailId(pv.id)}
              >
                <div className="min-w-0">
                  <div className="font-sora text-[15px] font-bold">{pv.id}</div>
                  <p className="iz-tiny iz-muted mt-0.5">
                    {resolvePvPrName(pv, agencyPRs)} · {pv.outlet}
                  </p>
                  {pv.prIc && <p className="iz-tiny iz-muted2">IC {pv.prIc}</p>}
                  <p className="iz-tiny iz-muted2 mt-0.5">Cycle: {pv.cycle}</p>
                  <p className="iz-tiny iz-muted2">Issued {pv.issued}</p>
                  <p className="iz-tiny text-[var(--iz-gold-l)] mt-0.5">
                    Sales {formatRM(getPvSalesTotal(pv))}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <IzPill variant={pvStatusPillVariant(pv.status)}>Paid</IzPill>
                  <div className="iz-ledger font-sora mt-1.5 text-base font-bold">
                    {formatRM(getPvNetTotal(pv))}
                  </div>
                  <p className="iz-tiny iz-muted2 mt-0.5">Net paid</p>
                  {pv.paidAt && (
                    <div className="mt-2.5 rounded-lg border border-[rgba(52,211,153,.28)] bg-[rgba(52,211,153,.1)] px-2.5 py-1.5 text-right">
                      <p className="iz-tiny font-semibold uppercase tracking-wide text-[var(--iz-green-l)]">
                        Date paid
                      </p>
                      <p className="font-sora mt-0.5 text-sm font-bold leading-tight text-[var(--iz-txt)]">
                        {pv.paidAt}
                      </p>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </OutletSection>
    </>
  );
}
