import { ComcardGridVisual } from '@agency-portal/components/agency/Comcard3dPreview';
import { toComcardPreview } from '@agency-portal/components/agency/PrComcardIdentity';
import { IzPill } from '@agency-portal/components/iz/ui';
import { formatOutletHistRm } from '@agency-portal/components/outlet/outlet-history-ui';
import type { AgencyManagedPR } from '@agency-portal/lib/agency-demo';
import { languagesFromPr } from '@agency-portal/lib/agency-demo';
import { getAgencyPrFlags } from '@agency-portal/lib/agency-pr-flags';
import { cn } from '@agency-portal/lib/utils';
import { Check, Star } from 'lucide-react';

type ManagePrGridCardProps = {
  pr: AgencyManagedPR;
  active: boolean;
  flags: ReturnType<typeof getAgencyPrFlags>;
  selectMode: boolean;
  picked: boolean;
  onActivate: () => void;
};

export function ManagePrGridCard({
  pr,
  active,
  flags,
  selectMode,
  picked,
  onActivate,
}: ManagePrGridCardProps) {
  const preview = toComcardPreview(pr);
  const langs = languagesFromPr(pr).filter(Boolean).slice(0, 2).join(' · ');
  const metaLine = [langs, pr.place].filter(Boolean).join(' · ');
  const paid = formatOutletHistRm(pr.totalPaid ?? 0);

  return (
    <article
      role="button"
      tabIndex={0}
      className={cn(
        'iz-pr-manage-card',
        picked && 'iz-pr-manage-card--picked',
        !active && 'iz-pr-manage-card--inactive',
        flags.suspendStreak && active && 'iz-pr-manage-card--warn-border',
      )}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onActivate();
      }}
    >
      {selectMode && (
        <div
          className={cn(
            'iz-pr-manage-card__check',
            picked && 'iz-pr-manage-card__check--on',
          )}
          aria-hidden
        >
          {picked && <Check className="h-3 w-3" strokeWidth={3} />}
        </div>
      )}

      <div className="iz-pr-manage-card__visual">
        <ComcardGridVisual
          pr={preview}
          className="iz-pr-manage-card__comcard"
        />
        <IzPill
          variant={active ? 'green' : 'ink'}
          className="iz-pr-manage-card__status"
        >
          {active ? 'Active' : 'Inactive'}
        </IzPill>
      </div>

      <div className="iz-pr-manage-card__body">
        <div className="iz-pr-manage-card__name-row">
          <p className="iz-pr-manage-card__name">{pr.name}</p>
          {pr.rating != null && (
            <span className="iz-pr-manage-card__rating">
              <Star className="iz-pr-manage-card__rating-star" aria-hidden />
              {pr.rating.toFixed(1)}
            </span>
          )}
        </div>

        <div className="iz-pr-manage-card__tier-row">
          {pr.trainingLevel && (
            <IzPill variant="violet" className="iz-pr-manage-card__tier">
              {pr.trainingLevel}
            </IzPill>
          )}
          {metaLine && <p className="iz-pr-manage-card__meta">{metaLine}</p>}
        </div>

        {(flags.warnLowAvg ||
          flags.suspendStreak ||
          flags.tiedUnderOneYear ||
          !active) && (
          <div className="iz-pr-manage-card__flags">
            {!active && (
              <IzPill variant="ink" className="!py-0 !text-[8px]">
                Suspended
              </IzPill>
            )}
            {flags.warnLowAvg && active && (
              <IzPill variant="amber" className="!py-0 !text-[8px]">
                Warn
              </IzPill>
            )}
            {flags.suspendStreak && active && (
              <IzPill variant="red" className="!py-0 !text-[8px]">
                Suspend
              </IzPill>
            )}
            {flags.tiedUnderOneYear && (
              <IzPill variant="violet" className="!py-0 !text-[8px]">
                Tied
              </IzPill>
            )}
          </div>
        )}

        <div className="iz-pr-manage-card__metrics">
          <div className="iz-pr-manage-card__metric">
            <span className="iz-pr-manage-card__metric-label">Paid</span>
            <span className="iz-pr-manage-card__metric-value iz-pr-manage-card__metric-value--gold">
              {paid}
            </span>
          </div>
          <div className="iz-pr-manage-card__metric">
            <span className="iz-pr-manage-card__metric-label">Att.</span>
            <span className="iz-pr-manage-card__metric-value">
              {pr.attendancePct ?? 0}%
            </span>
          </div>
          <div className="iz-pr-manage-card__metric">
            <span className="iz-pr-manage-card__metric-label">KPI</span>
            <span className="iz-pr-manage-card__metric-value">
              {pr.kpiScore ?? '—'}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
