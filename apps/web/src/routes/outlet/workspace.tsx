import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { IzCard } from '@agency-portal/components/iz/ui';
import {
  OutletPage,
  OutletPageHeader,
} from '@agency-portal/components/outlet/outlet-portal-ui';
import { OutletSection } from '@agency-portal/components/outlet/OutletSection';
import { WorkspaceTierRatesEditor } from '@agency-portal/components/outlet/WorkspaceTierRatesEditor';
import { PenaltyRulesEditor } from '@agency-portal/components/outlet/PenaltyRulesEditor';
import { useOutletWorkspace } from '@agency-portal/hooks/use-outlet-workspace';
import { useStore } from '@agency-portal/lib/store';
import { outletCan } from '@agency-portal/lib/outlet-rbac';
import { OutletDrinkMenuEditor } from '@agency-portal/components/outlet/OutletDrinkMenuEditor';
import {
  drinkMenuPriceRange,
  OUTLET_SERVICE_ENTITLEMENT_SECTION_ID,
  sortOutletDrinkMenuByPrice,
} from '@agency-portal/lib/outlet-demo';
import {
  OUTLET_BASE_TIER,
  OUTLET_PR_TIERS,
  buildDefaultTierRates,
  defaultHappyHourDrinkPct,
  snapTierWage,
  type OutletPrTier,
  type OutletTierRateSettings,
} from '@agency-portal/lib/agency-demo';

export const Route = createFileRoute('/outlet/workspace')({
  component: OutletWorkspacePage,
});

function TimeField({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--iz-muted)]">
        {label}
      </div>
      <input
        type="text"
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full rounded-xl border border-[var(--iz-line2)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-sm font-semibold outline-none"
      />
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  suffix,
  readOnly,
}: {
  label: string;
  value: number | string;
  onChange?: (n: number) => void;
  suffix?: string;
  readOnly?: boolean;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commit = () => {
    if (!onChange) return;
    const n = parseFloat(text.replace(/,/g, ''));
    if (!Number.isNaN(n)) onChange(n);
  };
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--iz-muted)]">
        {label}
      </div>
      <div className="flex items-center gap-1.5 rounded-xl border border-[var(--iz-line2)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5">
        {suffix === 'RM' && (
          <span className="text-[11px] font-semibold text-[var(--iz-muted)]">
            RM
          </span>
        )}
        <input
          type="text"
          inputMode="decimal"
          value={text}
          readOnly={readOnly}
          onChange={(e) =>
            !readOnly && setText(e.target.value.replace(/[^\d.:]/g, ''))
          }
          onBlur={commit}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold tabular-nums outline-none"
        />
        {suffix && suffix !== 'RM' && (
          <span className="text-[11px] text-[var(--iz-muted)]">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function OutletWorkspacePage() {
  const outletSubRole = useStore((s) => s.outletSubRole);
  const outletWorkspace = useStore((s) => s.outletWorkspace);
  const saveOutletWorkspace = useStore((s) => s.saveOutletWorkspace);
  const toast = useStore((s) => s.toast);
  const canEdit = outletCan(outletSubRole, 'manageWorkspace');
  // Real login → backend workspace (rates persist via PUT); demo store otherwise.
  const backend = useOutletWorkspace();
  const source =
    backend.backed && backend.workspace ? backend.workspace : outletWorkspace;
  const [draft, setDraft] = useState(source);
  const draftDirtyRef = useRef(false);

  useEffect(() => {
    if (!draftDirtyRef.current) {
      setDraft(source);
    }
  }, [source]);

  useEffect(() => {
    const scrollToServiceEntitlement = () => {
      if (
        window.location.hash.replace('#', '') !==
        OUTLET_SERVICE_ENTITLEMENT_SECTION_ID
      )
        return;
      document
        .getElementById(OUTLET_SERVICE_ENTITLEMENT_SECTION_ID)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    scrollToServiceEntitlement();
    window.addEventListener('hashchange', scrollToServiceEntitlement);
    return () =>
      window.removeEventListener('hashchange', scrollToServiceEntitlement);
  }, []);

  const markDirty = () => {
    draftDirtyRef.current = true;
  };
  const patch = (p: Partial<typeof draft>) => {
    markDirty();
    setDraft((d) => ({ ...d, ...p }));
  };
  const patchTier = (
    tier: OutletPrTier,
    tierPatch: Partial<OutletTierRateSettings>,
  ) => {
    markDirty();
    setDraft((d) => {
      const patch = { ...tierPatch };
      if (patch.wagePerHour != null)
        patch.wagePerHour = snapTierWage(patch.wagePerHour);
      if (patch.drinkPct != null && patch.happyHourDrinkPct == null) {
        const prev = d.tierRates[tier];
        const wasDefaultHappy =
          prev.happyHourDrinkPct == null ||
          prev.happyHourDrinkPct === prev.drinkPct ||
          prev.happyHourDrinkPct === defaultHappyHourDrinkPct(prev.drinkPct);
        if (wasDefaultHappy) {
          patch.happyHourDrinkPct = defaultHappyHourDrinkPct(patch.drinkPct);
        }
      }
      let nextTierRates = {
        ...d.tierRates,
        [tier]: { ...d.tierRates[tier], ...patch },
      };
      if (patch.otAfterHours != null) {
        nextTierRates = { ...nextTierRates };
        for (const t of OUTLET_PR_TIERS) {
          nextTierRates[t] = {
            ...nextTierRates[t],
            otAfterHours: patch.otAfterHours,
          };
        }
      }
      if (tier === OUTLET_BASE_TIER && patch.wagePerHour != null) {
        const rebuilt = buildDefaultTierRates(nextTierRates[OUTLET_BASE_TIER]);
        nextTierRates = { ...nextTierRates };
        for (const t of OUTLET_PR_TIERS) {
          nextTierRates[t] = {
            ...nextTierRates[t],
            wagePerHour: rebuilt[t].wagePerHour,
          };
        }
      }
      const baseTier = nextTierRates[OUTLET_BASE_TIER];
      return {
        ...d,
        tierRates: nextTierRates,
        basePayPerHour: baseTier.wagePerHour,
        drinkPct: baseTier.drinkPct,
        tipPct: baseTier.tipPct,
        tablePct: baseTier.tablePct,
        otAfterHours: baseTier.otAfterHours,
      };
    });
  };
  const patchCommissionOnly = (
    patch: Partial<typeof draft.commissionOnlyRates>,
  ) => {
    markDirty();
    setDraft((d) => {
      const next = { ...d.commissionOnlyRates, ...patch };
      if (patch.drinkPct != null && patch.happyHourDrinkPct == null) {
        const prev = d.commissionOnlyRates;
        const wasDefaultHappy =
          prev.happyHourDrinkPct == null ||
          prev.happyHourDrinkPct === prev.drinkPct ||
          prev.happyHourDrinkPct === defaultHappyHourDrinkPct(prev.drinkPct);
        if (wasDefaultHappy) {
          next.happyHourDrinkPct = defaultHappyHourDrinkPct(patch.drinkPct);
        }
      }
      return { ...d, commissionOnlyRates: next };
    });
  };
  const drinkRange = drinkMenuPriceRange(draft.drinkMenu ?? []);

  return (
    <OutletPage>
      <OutletPageHeader
        title="Workspace"
        hint={`Rates for new shifts · ${draft.outletName}`}
      />
      {!canEdit && (
        <p className="iz-tiny iz-muted rounded-lg border border-dashed border-[var(--iz-line)] px-2.5 py-1.5">
          Read-only (Finance)
        </p>
      )}

      <OutletSection title="Rates by PR tier" className="!mt-4">
        <IzCard className="!py-3">
          <WorkspaceTierRatesEditor
            tierRates={draft.tierRates}
            commissionOnlyRates={draft.commissionOnlyRates}
            onPatchTier={patchTier}
            onPatchCommissionOnly={patchCommissionOnly}
            readOnly={!canEdit}
          />
        </IzCard>
      </OutletSection>

      <OutletSection
        title="Attendance and penalty rules"
        hint="Discipline rules by pay class · Basic and Commission only"
        collapsible
        defaultOpen={false}
      >
        <IzCard className="!py-3">
          <PenaltyRulesEditor
            rules={draft.penaltyRules}
            readOnly={!canEdit}
            onChange={
              canEdit ? (penaltyRules) => patch({ penaltyRules }) : () => {}
            }
          />
        </IzCard>
      </OutletSection>

      <OutletSection
        id={OUTLET_SERVICE_ENTITLEMENT_SECTION_ID}
        title="Service Entitlement"
        hint={
          draft.drinkMenu?.length
            ? `${draft.drinkMenu.length} services · RM ${drinkRange.min}–${drinkRange.max}`
            : 'Add services below'
        }
      >
        <IzCard className="!py-3">
          <OutletDrinkMenuEditor
            drinks={draft.drinkMenu ?? []}
            readOnly={!canEdit}
            onChange={
              canEdit
                ? (drinkMenu) =>
                    patch({ drinkMenu: sortOutletDrinkMenuByPrice(drinkMenu) })
                : () => {}
            }
          />
        </IzCard>
      </OutletSection>

      <OutletSection
        title="Happy hour"
        hint={`${draft.happyHourStart}–${draft.happyHourEnd} · ${draft.happyHourDrinkDiscountPct}% off drinks`}
        collapsible
        defaultOpen={false}
      >
        <IzCard className="!py-3">
          <div className="flex gap-3">
            <TimeField
              label="Start"
              value={draft.happyHourStart}
              readOnly={!canEdit}
              onChange={
                canEdit ? (v) => patch({ happyHourStart: v }) : undefined
              }
            />
            <TimeField
              label="End"
              value={draft.happyHourEnd}
              readOnly={!canEdit}
              onChange={canEdit ? (v) => patch({ happyHourEnd: v }) : undefined}
            />
            <NumField
              label="Drink discount"
              value={draft.happyHourDrinkDiscountPct}
              suffix="%"
              readOnly={!canEdit}
              onChange={
                canEdit
                  ? (n) =>
                      patch({
                        happyHourDrinkDiscountPct: Math.min(
                          100,
                          Math.max(0, Math.round(n)),
                        ),
                      })
                  : undefined
              }
            />
          </div>
        </IzCard>
      </OutletSection>

      {canEdit && (
        <button
          type="button"
          className="iz-btn iz-btn-primary mt-5"
          onClick={() => {
            if (backend.backed) {
              backend
                .save(draft)
                .then(() => toast('Workspace saved', 'success'))
                .catch(() =>
                  toast('Could not save workspace — try again', 'warn'),
                );
            } else {
              saveOutletWorkspace(draft);
            }
            draftDirtyRef.current = false;
          }}
        >
          Save workspace
        </button>
      )}
    </OutletPage>
  );
}
