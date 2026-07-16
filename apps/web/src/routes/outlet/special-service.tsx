import { createFileRoute, Navigate } from '@tanstack/react-router';
import { outletCan } from '@agency-portal/lib/outlet-rbac';
import { useStore } from '@agency-portal/lib/store';
import { IzCard } from '@agency-portal/components/iz/ui';

export const Route = createFileRoute('/outlet/special-service')({
  component: OutletSpecialServiceRedirect,
});

function OutletSpecialServiceRedirect() {
  const outletSubRole = useStore((s) => s.outletSubRole);

  if (
    !outletCan(outletSubRole, 'orderSpecialService') &&
    !outletCan(outletSubRole, 'postJob')
  ) {
    return (
      <div className="iz-screen">
        <header>
          <h2 className="font-sora text-lg font-extrabold text-[var(--iz-txt)]">
            Access restricted
          </h2>
        </header>
        <IzCard className="text-center">
          <p className="iz-sm iz-muted">
            Your outlet role cannot access job postings.
          </p>
        </IzCard>
      </div>
    );
  }

  return (
    <Navigate to="/outlet/bookings" search={{ tab: 'services' }} replace />
  );
}
