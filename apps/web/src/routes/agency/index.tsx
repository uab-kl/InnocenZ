import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useStore } from '@agency-portal/lib/store';
import { OUTLET_NAMES, scopeToAgency } from '@agency-portal/lib/agency-demo';
import {
  agencyPendingPayoutDeadline,
  agencyPrToPayTotal,
} from '@agency-portal/lib/agency-payroll';
import { LIVE_SEED_PR_PVS } from '@agency-portal/lib/pr-demo';
import { agencyCan } from '@agency-portal/lib/agency-rbac';
import { AiSuggestionsPanel } from '@agency-portal/components/portal/AiSuggestionsPanel';
import { AgencyHomeHubTabs } from '@agency-portal/components/portal/AgencyHomeHubTabs';
import { IconGuide } from '@agency-portal/components/iz/IconGuide';
import { formatRM } from '@agency-portal/components/iz/ui';

export const Route = createFileRoute('/agency/')({
  component: AgencyHub,
});

function AgencyHub() {
  const agencySubRole = useStore((s) => s.agencySubRole);
  const activeAgencyId = useStore((s) => s.activeAgencyId);
  const allAgencyPRs = useStore((s) => s.agencyPRs);
  const agencyPRs = useMemo(
    () => scopeToAgency(allAgencyPRs, activeAgencyId),
    [allAgencyPRs, activeAgencyId],
  );
  const prPaymentVouchers = useStore((s) => s.prPaymentVouchers);
  const prToPayTotal = useMemo(() => {
    const pvs = prPaymentVouchers?.length
      ? prPaymentVouchers
      : LIVE_SEED_PR_PVS;
    return agencyPrToPayTotal(pvs, agencyPRs ?? []);
  }, [prPaymentVouchers, agencyPRs]);
  const payoutDeadline = useMemo(() => {
    const pvs = prPaymentVouchers?.length
      ? prPaymentVouchers
      : LIVE_SEED_PR_PVS;
    return agencyPendingPayoutDeadline(pvs, agencyPRs ?? []);
  }, [prPaymentVouchers, agencyPRs]);
  const totalPrs = agencyPRs.filter((p) => !p.detached).length;
  const totalOutlets = OUTLET_NAMES.length;
  const isFinance = agencySubRole === 'agency_finance';
  const showWorkforce = agencyCan(agencySubRole, 'viewWorkforce');

  return (
    <div className="iz-screen iz-portal-page">
      <div className="iz-portal-kpi-grid iz-portal-desktop-only">
        <div className="iz-portal-kpi">
          <div className="l">Total PR</div>
          <div className="n">{totalPrs}</div>
        </div>
        <div className="iz-portal-kpi">
          <div className="l">Total outlets</div>
          <div className="n">{totalOutlets}</div>
        </div>
        <Link
          to="/agency/pv"
          search={{ status: 'TO_PAY' }}
          className="iz-portal-kpi iz-portal-kpi-payout no-underline"
        >
          <div className="l">Pending payout</div>
          <div className="n">{formatRM(prToPayTotal)}</div>
          {payoutDeadline && prToPayTotal > 0 && (
            <p
              className={`iz-tiny mt-1 leading-snug ${
                payoutDeadline.isOverdue
                  ? 'text-[var(--iz-red)]'
                  : 'text-[var(--iz-muted2)]'
              }`}
            >
              {payoutDeadline.isOverdue ? 'Overdue · ' : 'Pay by '}
              {payoutDeadline.payByLabel}
              {payoutDeadline.pvCount > 1
                ? ` · ${payoutDeadline.pvCount} PVs`
                : ''}
            </p>
          )}
        </Link>
      </div>

      <div className="iz-portal-home-grid">
        <div className="iz-portal-home-main">
          {isFinance && (
            <p className="iz-tiny iz-muted mb-3 rounded-lg border border-dashed border-[var(--iz-line)] px-2.5 py-1.5">
              Read-only overview — payroll &amp; PV only
            </p>
          )}

          <AgencyHomeHubTabs agencySubRole={agencySubRole} />
        </div>

        {showWorkforce && !isFinance && (
          <aside className="iz-portal-home-aside iz-portal-desktop-only">
            <AiSuggestionsPanel />
          </aside>
        )}
      </div>

      <IconGuide className="iz-icon-guide--portal mt-6" />
    </div>
  );
}
