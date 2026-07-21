import { useMemo, useState } from 'react';
import { SpecialServiceFilters } from '@agency-portal/components/agency/SpecialServiceFilters';
import { OutletSection } from '@agency-portal/components/outlet/OutletSection';
import { SpecialServiceOrderCard } from '@agency-portal/components/special-service/SpecialServiceOrderCard';
import {
  SpecialServiceOrderSheet,
  type SpecialServiceOrderDraft,
} from '@agency-portal/components/special-service/SpecialServiceOrderSheet';
import { IzCard } from '@agency-portal/components/iz/ui';
import { IzSheet } from '@agency-portal/components/iz/Sheet';
import { useStore } from '@agency-portal/lib/store';
import { getPrRosterId } from '@agency-portal/lib/pr-demo';
import { isWithinOneYearTie } from '@agency-portal/lib/pr-features';
import {
  bookableServiceOffers,
  EMPTY_SPECIAL_SERVICE_FILTERS,
  collectSpecialServiceDateIsos,
  filterSpecialServiceRecords,
  isLeaveAgencyService,
  specialServiceOffer,
  type SpecialServiceInitiator,
} from '@agency-portal/lib/special-service-demo';
import {
  pendingSpecialServicesForOutlet,
  pendingSpecialServicesForPr,
  specialServicesForOutlet,
  specialServicesForPr,
} from '@agency-portal/lib/special-service-actions';
import { Plus, Sparkles } from 'lucide-react';

export function SpecialServicePortalSection({
  role,
}: {
  role: 'outlet' | 'pr';
}) {
  const agencyPRs = useStore((s) => s.agencyPRs);
  const prSubRole = useStore((s) => s.prSubRole);
  const outletWorkspace = useStore((s) => s.outletWorkspace);
  const records = useStore((s) => s.specialServiceOrders);
  const prAgencyTiedAt = useStore((s) => s.prAgencyTiedAt);
  const prLeaveRequest = useStore((s) => s.prLeaveRequest);
  const submitOrder = useStore((s) => s.submitSpecialServiceOrder);
  const requestLeaveAgency = useStore((s) => s.requestLeaveAgency);
  const toast = useStore((s) => s.toast);
  const acceptByPr = useStore((s) => s.acceptSpecialServiceByPr);
  const declineByPr = useStore((s) => s.declineSpecialServiceByPr);
  const acceptByOutlet = useStore((s) => s.acceptSpecialServiceByOutlet);
  const declineByOutlet = useStore((s) => s.declineSpecialServiceByOutlet);

  const outletName = outletWorkspace.outletName;
  const prId = getPrRosterId(prSubRole);
  const prTied = true;
  const prTiedLocked = prTied && isWithinOneYearTie(prAgencyTiedAt);
  const serviceOffers = useMemo(
    () => bookableServiceOffers(role, { prTiedLocked }),
    [role, prTiedLocked],
  );
  const defaultOffer = serviceOffers[0];

  const scopedRecords = useMemo(() => {
    if (role === 'outlet') return specialServicesForOutlet(records, outletName);
    return specialServicesForPr(records, prId);
  }, [records, role, outletName, prId]);

  const pendingAction = useMemo(() => {
    if (role === 'outlet')
      return pendingSpecialServicesForOutlet(records, outletName);
    return pendingSpecialServicesForPr(records, prId);
  }, [records, role, outletName, prId]);

  const [bookingFilters, setBookingFilters] = useState(
    EMPTY_SPECIAL_SERVICE_FILTERS,
  );
  const [orderOpen, setOrderOpen] = useState(false);
  const [draft, setDraft] = useState<SpecialServiceOrderDraft>({
    prId: agencyPRs[0]?.id ?? '',
    outlet: outletName,
    serviceType: defaultOffer?.id ?? 'transportation',
    amountOut: String(defaultOffer?.defaultRate ?? ''),
    amountIn: '',
    time: '19:00',
    note: '',
  });

  const bookingDateIsos = useMemo(
    () => collectSpecialServiceDateIsos(scopedRecords),
    [scopedRecords],
  );

  const filtered = useMemo(
    () => filterSpecialServiceRecords(scopedRecords, bookingFilters),
    [scopedRecords, bookingFilters],
  );

  const prOptions = agencyPRs
    .filter((p) => !p.detached)
    .map((p) => ({ id: p.id, name: p.name }));

  const submitOrderDraft = () => {
    const offer = specialServiceOffer(draft.serviceType);
    if (!offer) return;

    if (role === 'pr' && isLeaveAgencyService(draft.serviceType)) {
      const note = draft.note.trim();
      if (!note) {
        toast('Enter a reason for early leave', 'warn');
        return;
      }
      requestLeaveAgency(note);
      submitOrder({
        initiatedBy: 'pr',
        raisedBy: `${agencyPRs.find((p) => p.id === prId)?.name ?? 'PR'} (PR)`,
        prId,
        prName: agencyPRs.find((p) => p.id === prId)?.name ?? 'PR',
        outlet: 'Agency service',
        serviceType: offer.id,
        description: note,
        amountIn: 0,
        amountOut: 0,
        time: '—',
      });
      setOrderOpen(false);
      setDraft((prev) => ({ ...prev, note: '' }));
      return;
    }

    if (role === 'outlet') {
      const pr = agencyPRs.find((p) => p.id === draft.prId);
      if (!pr) return;
      const amountIn = draft.amountIn
        ? Number(draft.amountIn)
        : offer.defaultRate;
      submitOrder({
        initiatedBy: 'outlet',
        raisedBy: outletName,
        prId: pr.id,
        prName: pr.name,
        outlet: outletName,
        serviceType: offer.id,
        description: draft.note.trim() || offer.summary,
        amountIn: Number.isFinite(amountIn) ? amountIn : offer.defaultRate,
        amountOut: offer.defaultRate,
        time: draft.time,
      });
    } else {
      const pr = agencyPRs.find((p) => p.id === prId);
      const prName = pr?.name ?? 'PR';
      submitOrder({
        initiatedBy: 'pr',
        raisedBy: `${prName} (PR)`,
        prId,
        prName,
        outlet: outletName,
        serviceType: offer.id,
        description: draft.note.trim() || offer.summary,
        amountIn: 0,
        amountOut: offer.defaultRate,
        time: draft.time,
      });
    }
    setOrderOpen(false);
    setDraft((prev) => ({ ...prev, note: '' }));
  };

  const initiatedBy: SpecialServiceInitiator = role;

  return (
    <div className={role === 'pr' ? '' : 'mt-3'}>
      {pendingAction.length > 0 && (
        <IzCard
          flat
          className="mb-3 border-[rgba(159,122,234,.35)] bg-[linear-gradient(180deg,rgba(159,122,234,.08),transparent)]"
        >
          <p className="iz-tiny font-semibold text-[var(--iz-violet-l)]">
            {pendingAction.length} booking
            {pendingAction.length !== 1 ? 's' : ''} need your response
          </p>
          <div className="mt-2 space-y-2">
            {pendingAction.map((row) => (
              <SpecialServiceOrderCard
                key={row.id}
                row={row}
                role={role}
                onAccept={role === 'pr' ? acceptByPr : acceptByOutlet}
                onDecline={role === 'pr' ? declineByPr : declineByOutlet}
              />
            ))}
          </div>
        </IzCard>
      )}

      <IzCard
        flat
        className="border-[rgba(159,122,234,.2)] bg-[linear-gradient(180deg,rgba(159,122,234,.04),transparent)]"
      >
        <p className="iz-tiny iz-muted2 leading-relaxed">
          <Sparkles className="mr-1 inline h-3 w-3 text-[var(--iz-violet-l)]" />
          {role === 'outlet'
            ? 'Order agency add-ons for your venue — delivery, emergency cover, styling, and more.'
            : prTiedLocked
              ? 'Request transportation, makeup, wardrobe, and other services — or raise Leave agency under Service.'
              : 'Request transportation, makeup, wardrobe, and other services for your shifts.'}
        </p>
      </IzCard>

      {role === 'pr' && prLeaveRequest && (
        <p className="iz-tiny iz-muted2 mt-2">
          {prLeaveRequest.type === 'leave'
            ? 'Leave ticket'
            : 'Transfer request'}{' '}
          submitted {prLeaveRequest.at}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="iz-btn iz-btn-primary !py-2 !text-xs"
          onClick={() => {
            const first = serviceOffers[0];
            setDraft((prev) => ({
              ...prev,
              serviceType: first?.id ?? prev.serviceType,
              amountOut: String(first?.defaultRate ?? ''),
            }));
            setOrderOpen(true);
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Order service
        </button>
      </div>

      <IzCard
        flat
        className={`iz-pr-manage-filters-card !mt-3${role === 'pr' ? ' iz-special-service-filters-card--compact' : ''}`}
      >
        <SpecialServiceFilters
          filters={bookingFilters}
          onChange={(patch) =>
            setBookingFilters((prev) => ({ ...prev, ...patch }))
          }
          bookingDateIsos={bookingDateIsos}
          resultCount={filtered.length}
          totalCount={scopedRecords.length}
          serviceOffers={serviceOffers}
          compact={role === 'pr'}
        />
      </IzCard>

      <OutletSection
        title="Your service orders"
        hint={`${filtered.length} record${filtered.length !== 1 ? 's' : ''}`}
        collapsible
        defaultOpen={false}
        className="!mt-3"
      >
        {filtered.length === 0 ? (
          <IzCard flat className="text-center">
            <p className="iz-sm iz-muted">No service orders yet</p>
          </IzCard>
        ) : (
          <div className="space-y-2">
            {filtered.map((row) => (
              <SpecialServiceOrderCard key={row.id} row={row} role={role} />
            ))}
          </div>
        )}
      </OutletSection>

      <IzSheet open={orderOpen} onClose={() => setOrderOpen(false)}>
        <SpecialServiceOrderSheet
          role={initiatedBy}
          draft={draft}
          onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
          prOptions={prOptions}
          showPrPicker={role === 'outlet'}
          showAmountIn={role === 'outlet'}
          serviceOffers={serviceOffers}
          onSubmit={submitOrderDraft}
          submitLabel={
            role === 'pr' && isLeaveAgencyService(draft.serviceType)
              ? 'Raise support ticket'
              : 'Submit to admin'
          }
        />
      </IzSheet>
    </div>
  );
}
