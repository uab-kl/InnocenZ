import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useStore } from '@agency-portal/lib/store';
import {
  formatOutletPlanPrPickerRule,
  getOutletSubscriptionPlan,
  maxDailyOutletNamedPrCount,
  OUTLET_SUBSCRIPTION_ADDONS,
  OUTLET_SUBSCRIPTION_PLANS,
  outletNamedPrCountForDate,
  type OutletSubscriptionAddon,
  type OutletSubscriptionPlanId,
} from '@agency-portal/lib/outlet-demo';
import { outletCan } from '@agency-portal/lib/outlet-rbac';
import {
  outletMatches,
  tonightShiftOutletName,
} from '@agency-portal/lib/portal-sync';
import { isoKeyFromDate } from '@agency-portal/components/iz/HistDateCalendar';
import { OutletSection } from '@agency-portal/components/outlet/OutletSection';
import {
  IzCard,
  IzPageTitle,
  IzPill,
  IzSectionLabel,
  formatRM,
} from '@agency-portal/components/iz/ui';
import {
  Calendar,
  Check,
  CreditCard,
  Plug,
  Receipt,
  Sparkles,
  Users,
} from 'lucide-react';

const RENEWAL_DATE = '15 Jul 2026';

const MONTHLY_PLANS = OUTLET_SUBSCRIPTION_PLANS.filter((p) => !p.renegotiate);

const POS_FEATURES = [
  'Real-time drink & table sales from your POS',
  'Custom setup for your venue layout',
  'Pricing quoted by InnocenZ admin',
] as const;

export const Route = createFileRoute('/outlet/subscription')({
  component: OutletSubscriptionPage,
});

function PosIntegrationAddonCard({
  addon,
  canEdit,
  quotePending,
  contactLine,
  onRequestQuote,
  onCancelQuote,
}: {
  addon: OutletSubscriptionAddon;
  canEdit: boolean;
  quotePending: boolean;
  contactLine: string;
  onRequestQuote: () => void;
  onCancelQuote: () => void;
}) {
  return (
    <div className="iz-outlet-pos-addon col-span-2">
      <div className="iz-outlet-pos-addon__glow" aria-hidden />
      <div className="iz-outlet-pos-addon__inner">
        <div className="iz-outlet-pos-addon__head">
          <div className="iz-outlet-pos-addon__icon-wrap">
            <Plug className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="iz-outlet-pos-addon__title">{addon.label}</p>
              <IzPill variant="violet" className="!py-0.5 !text-[10px]">
                Add-on
              </IzPill>
              {quotePending && (
                <IzPill variant="green" className="!py-0.5 !text-[10px]">
                  Request sent
                </IzPill>
              )}
            </div>
            <p className="iz-outlet-pos-addon__subtitle">
              {addon.capacityLabel} · {addon.priceLabel}
            </p>
          </div>
          <Sparkles className="h-5 w-5 shrink-0 text-[var(--iz-violet-l)] opacity-80" />
        </div>

        <p className="iz-outlet-pos-addon__lead">{addon.description}</p>

        <ul className="iz-outlet-pos-addon__features">
          {POS_FEATURES.map((feature) => (
            <li key={feature}>
              <Check className="h-4 w-4 shrink-0 text-[var(--iz-green)]" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        {quotePending ? (
          <div className="iz-outlet-pos-addon__sent">
            <p className="iz-outlet-pos-addon__sent-title">Admin notified</p>
            <p className="iz-outlet-pos-addon__sent-body">
              InnocenZ admin received your request and will contact{' '}
              {contactLine} to negotiate pricing.
            </p>
            {canEdit && (
              <button
                type="button"
                className="iz-btn iz-btn-soft iz-outlet-pos-addon__cancel"
                onClick={onCancelQuote}
              >
                Cancel request
              </button>
            )}
          </div>
        ) : (
          canEdit && (
            <button
              type="button"
              className="iz-btn iz-btn-primary iz-outlet-pos-addon__cta"
              onClick={onRequestQuote}
            >
              Request admin quote
            </button>
          )
        )}
      </div>
    </div>
  );
}

function OutletSubscriptionPage() {
  const outletSubRole = useStore((s) => s.outletSubRole);
  const outletOwner = useStore((s) => s.outletOwner);
  const shifts = useStore((s) => s.shifts);
  const paymentCardLast4 = useStore((s) => s.paymentCardLast4);
  const posIntegrationQuoteRequests = useStore(
    (s) => s.posIntegrationQuoteRequests,
  );
  const saveOutletOwner = useStore((s) => s.saveOutletOwner);
  const recordOutletSubscriptionPlanChange = useStore(
    (s) => s.recordOutletSubscriptionPlanChange,
  );
  const requestPosIntegrationQuote = useStore(
    (s) => s.requestPosIntegrationQuote,
  );
  const cancelPosIntegrationQuoteRequest = useStore(
    (s) => s.cancelPosIntegrationQuoteRequest,
  );
  const billingHistory = useStore((s) => s.outletSubscriptionBilling);
  const updateOutletPaymentCard = useStore((s) => s.updateOutletPaymentCard);
  const toast = useStore((s) => s.toast);
  const canEdit = outletCan(outletSubRole, 'editSettings');

  const outletName = tonightShiftOutletName(shifts);
  const currentPlan = getOutletSubscriptionPlan(outletOwner.subscriptionPlanId);
  const contactLine = outletOwner.email || outletOwner.mobile;

  const posQuotePending = useMemo(
    () =>
      posIntegrationQuoteRequests.some(
        (r) => r.status === 'pending' && outletMatches(r.outlet, outletName),
      ),
    [posIntegrationQuoteRequests, outletName],
  );

  const todayIso = isoKeyFromDate(new Date());
  const namedPrsToday = useMemo(
    () => outletNamedPrCountForDate(shifts, outletName, todayIso),
    [shifts, outletName, todayIso],
  );
  const peakDailyNamedPrs = useMemo(
    () => maxDailyOutletNamedPrCount(shifts, outletName),
    [shifts, outletName],
  );

  const selectPlan = (planId: OutletSubscriptionPlanId) => {
    if (!canEdit || planId === currentPlan.id) return;
    const next = getOutletSubscriptionPlan(planId);
    if (next.renegotiate) return;
    if (peakDailyNamedPrs > next.prPerDayMax) {
      toast(
        `Peak day has ${peakDailyNamedPrs} requested PRs — reduce to ${next.prPerDayMax}/day before downgrading to ${next.label}`,
        'warn',
      );
      return;
    }
    saveOutletOwner({ subscriptionPlanId: planId });
    recordOutletSubscriptionPlanChange(planId);
    toast(
      `Switched to ${next.label} · ${formatRM(next.monthlyRm)}/mo · ${next.capacityLabel} · ${formatOutletPlanPrPickerRule(next)}`,
      'success',
    );
  };

  if (!outletCan(outletSubRole, 'viewSettings')) {
    return (
      <div className="iz-screen">
        <header>
          <IzPageTitle>Access restricted</IzPageTitle>
        </header>
        <IzCard className="text-center">
          <p className="iz-sm iz-muted">
            You do not have access to subscription billing.
          </p>
        </IzCard>
      </div>
    );
  }

  const isFinanceReadOnly = outletSubRole === 'outlet_finance';

  return (
    <div className="iz-screen">
      <header>
        <IzPageTitle>Subscription</IzPageTitle>
        <p className="iz-tiny iz-muted mt-0.5">{outletOwner.orgName}</p>
        {isFinanceReadOnly && (
          <p className="iz-tiny iz-muted mt-2 rounded-lg border border-dashed border-[var(--iz-line)] px-2.5 py-1.5">
            Finance view — read-only · contact owner to change plan or card
          </p>
        )}
      </header>

      <IzSectionLabel>Plans · monthly</IzSectionLabel>
      <p className="iz-tiny iz-muted2 -mt-1 mb-2">
        PR limit = max specific PRs you name per day (agency fill does not
        count) · {namedPrsToday} requested today · peak day {peakDailyNamedPrs}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {MONTHLY_PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan.id;
          const atCapacity = namedPrsToday >= plan.prPerDayMax;
          return (
            <IzCard
              key={plan.id}
              className={
                isCurrent
                  ? 'border-[rgba(57,217,138,.35)] bg-[rgba(57,217,138,.06)]'
                  : undefined
              }
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-sora text-sm font-bold">{plan.label}</p>
                    {isCurrent && <IzPill variant="green">Current</IzPill>}
                    {atCapacity && !isCurrent && (
                      <IzPill variant="amber">At daily limit</IzPill>
                    )}
                  </div>
                  <p className="mt-1 text-lg font-bold text-[var(--iz-gold-l)]">
                    {formatRM(plan.monthlyRm)}
                    <span className="iz-tiny iz-muted font-normal">
                      {' '}
                      / month
                    </span>
                  </p>
                </div>
                <div className="shrink-0 sm:text-right">
                  <div className="flex items-center gap-1.5 text-[var(--iz-txt)] sm:justify-end">
                    <Users className="h-4 w-4 text-[var(--iz-gold)]" />
                    <span className="font-sora text-sm font-bold">
                      {plan.capacityLabel}
                    </span>
                  </div>
                  <p className="iz-tiny iz-muted mt-0.5">
                    {formatOutletPlanPrPickerRule(plan)}
                  </p>
                </div>
              </div>
              {isCurrent ? (
                <p className="iz-tiny iz-muted2 mt-2">
                  Renewal {RENEWAL_DATE} · {namedPrsToday} / {plan.prPerDayMax}{' '}
                  requested PRs today · pool of {plan.prPoolSize}
                </p>
              ) : (
                canEdit && (
                  <button
                    type="button"
                    className="iz-btn iz-btn-soft mt-3 w-full"
                    onClick={() => selectPlan(plan.id)}
                  >
                    Switch to {plan.label}
                  </button>
                )
              )}
            </IzCard>
          );
        })}

        {OUTLET_SUBSCRIPTION_ADDONS.map((addon) => (
          <PosIntegrationAddonCard
            key={addon.id}
            addon={addon}
            canEdit={canEdit}
            quotePending={posQuotePending}
            contactLine={contactLine}
            onRequestQuote={requestPosIntegrationQuote}
            onCancelQuote={cancelPosIntegrationQuoteRequest}
          />
        ))}
      </div>

      <IzSectionLabel>Billing history</IzSectionLabel>
      <div className="space-y-2">
        {billingHistory.length === 0 ? (
          <IzCard flat>
            <p className="iz-tiny iz-muted py-4 text-center">
              No subscription invoices yet.
            </p>
          </IzCard>
        ) : (
          billingHistory.map((inv) => (
            <IzCard key={inv.id} flat>
              <div className="iz-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-[var(--iz-muted)]" />
                  <div className="min-w-0">
                    <p className="iz-sm truncate font-semibold">
                      InnocenZ Outlet · {inv.planLabel}
                    </p>
                    <p className="iz-tiny iz-muted">
                      {inv.issueDate} · {inv.detail}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="iz-sm font-bold">{formatRM(inv.amount)}</p>
                  <IzPill
                    variant={inv.status === 'SETTLED' ? 'green' : 'amber'}
                    className="!mt-1"
                  >
                    {inv.status === 'SETTLED' ? 'Paid' : inv.status}
                  </IzPill>
                </div>
              </div>
            </IzCard>
          ))
        )}
      </div>

      <OutletSection
        title="Payment method"
        hint={`Visa ···· ${paymentCardLast4} · renewal ${RENEWAL_DATE}`}
        collapsible
        defaultOpen={false}
        className="!mt-5"
      >
        <IzCard flat>
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-[var(--iz-muted)]" />
            <div>
              <p className="iz-sm font-semibold">
                Visa ···· {paymentCardLast4}
              </p>
              <p className="iz-tiny iz-muted">
                Billed monthly · {formatRM(currentPlan.monthlyRm)} · auto-pay
                enabled
              </p>
            </div>
          </div>
          {canEdit && (
            <button
              type="button"
              className="iz-btn iz-btn-soft mt-3 w-full"
              onClick={() =>
                updateOutletPaymentCard(
                  String(Math.floor(1000 + Math.random() * 9000)),
                )
              }
            >
              Update card
            </button>
          )}
        </IzCard>

        <div className="iz-tiny iz-muted mt-2 flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5" />
          Next renewal {RENEWAL_DATE}
        </div>
      </OutletSection>
    </div>
  );
}
