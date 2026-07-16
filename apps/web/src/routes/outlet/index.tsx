import { createFileRoute } from '@tanstack/react-router';
import { useStore } from '@agency-portal/lib/store';
import { OutletBookings } from '@agency-portal/components/outlet/OutletBookings';
import { OutletReconciliationBanner } from '@agency-portal/components/outlet/OutletReconciliationBanner';
import { IconGuide } from '@agency-portal/components/iz/IconGuide';
import {
  OutletPage,
  OutletPageHeader,
} from '@agency-portal/components/outlet/outlet-portal-ui';
import { nowAgencyDateTime } from '@agency-portal/lib/agency-demo';

export const Route = createFileRoute('/outlet/')({
  component: OutletHome,
});

function OutletHome() {
  const outletSubRole = useStore((s) => s.outletSubRole);
  const isFinance = outletSubRole === 'outlet_finance';
  const { date, time } = nowAgencyDateTime();

  return (
    <OutletPage>
      {isFinance && (
        <p className="iz-tiny iz-muted rounded-lg border border-dashed border-[var(--iz-line)] px-2.5 py-1.5">
          Read-only overview
        </p>
      )}

      <OutletPageHeader
        eyebrow="Today"
        title={`${date} · ${time}`}
        hint="Live shift · tap card to expand details and actions"
      />

      <OutletBookings />

      <OutletReconciliationBanner />

      <IconGuide className="iz-icon-guide--portal mt-6" />
    </OutletPage>
  );
}
