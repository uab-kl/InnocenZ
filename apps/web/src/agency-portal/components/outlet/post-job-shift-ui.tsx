import type { ReactNode } from 'react';
import { Calendar, ChevronRight, Info, Lock, Pencil, Plus } from 'lucide-react';
import { JobPostingMicroLabel } from '@agency-portal/components/special-service/job-posting-ui';
import { cn } from '@agency-portal/lib/utils';

export function PostJobFormLegend() {
  return (
    <details className="iz-post-job-legend">
      <summary className="iz-post-job-legend__title cursor-pointer select-none">
        How to read this form
      </summary>
      <ul className="iz-post-job-legend__list">
        <li>
          <span className="iz-post-job-legend__swatch iz-post-job-legend__swatch--violet" />
          Violet = editable · tap gold cells to set pay
        </li>
        <li>
          <span className="iz-post-job-legend__swatch iz-post-job-legend__swatch--gold" />
          Gold = payment / cost values
        </li>
        <li>
          <Lock className="iz-post-job-legend__lock" aria-hidden />
          Locked = pulled from Workspace · not editable here
        </li>
      </ul>
    </details>
  );
}

export function PostJobShiftField({
  label,
  children,
  className,
  layout = 'row',
}: {
  label: string;
  children: ReactNode;
  className?: string;
  layout?: 'row' | 'stack';
}) {
  return (
    <label
      className={cn(
        'iz-post-job-field',
        layout === 'row'
          ? 'iz-post-job-field--row'
          : 'iz-post-job-field--stack',
        className,
      )}
    >
      <JobPostingMicroLabel className="iz-post-job-field__label">
        {label}
      </JobPostingMicroLabel>
      <div className="iz-post-job-field__control">{children}</div>
    </label>
  );
}

export function PostJobShiftCardHeader({
  title,
  shiftIndex,
  shiftTotal,
  trailing,
}: {
  title: string;
  shiftIndex?: number;
  shiftTotal?: number;
  trailing?: ReactNode;
}) {
  return (
    <div className="iz-post-job-shift-head">
      <div className="flex min-w-0 items-center gap-2">
        <span className="iz-post-job-shift-head__icon" aria-hidden>
          <Calendar className="h-4 w-4" />
        </span>
        <span className="font-sora text-sm font-extrabold text-[var(--iz-txt)]">
          {title}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {shiftIndex != null && shiftTotal != null && (
          <span className="iz-post-job-shift-head__badge">
            Shift {shiftIndex} of {shiftTotal}
          </span>
        )}
        {trailing}
      </div>
    </div>
  );
}

export function PostJobLockedValue({
  children,
  locked = true,
}: {
  children: ReactNode;
  locked?: boolean;
}) {
  return (
    <div className="iz-post-job-locked-row">
      <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--iz-txt)]">
        {children}
      </span>
      {locked && (
        <span className="iz-post-job-locked-badge">
          <Lock className="h-3 w-3" aria-hidden />
          Locked
        </span>
      )}
    </div>
  );
}

export function PostJobEditableInputShell({
  children,
  icon: Icon = Pencil,
}: {
  children: ReactNode;
  icon?: typeof Pencil;
}) {
  return (
    <div className="iz-job-posting-control iz-post-job-editable-shell">
      <div className="min-w-0 flex-1">{children}</div>
      <Icon
        className="h-3.5 w-3.5 shrink-0 text-[var(--iz-violet)]"
        aria-hidden
      />
    </div>
  );
}

export function PostJobTierSectionHeader() {
  return (
    <div className="iz-post-job-tier-head">
      <span
        className="iz-post-job-tier-head__icon iz-post-job-tier-head__icon--info"
        aria-hidden
      >
        <Info className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0">
        <p className="font-sora text-sm font-extrabold text-[var(--iz-txt)]">
          Pay by PR tier
        </p>
        <p className="mt-0.5 text-xs leading-snug text-[var(--iz-muted2)]">
          Tap a gold cell to set pay · tap + drinks &amp; tips to set commission
          · set PR count per tier
        </p>
      </div>
    </div>
  );
}

export function PostJobSummaryCard({
  headcount,
  cost,
  compact,
}: {
  headcount: number;
  cost: number;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="iz-post-job-dock-stats">
        <div className="iz-post-job-dock-stats__item">
          <span className="iz-post-job-dock-stats__label">Headcount</span>
          <span className="iz-post-job-dock-stats__value">{headcount}</span>
        </div>
        <div className="iz-post-job-dock-stats__divider" aria-hidden />
        <div className="iz-post-job-dock-stats__item">
          <span className="iz-post-job-dock-stats__label">Est. cost</span>
          <span className="iz-post-job-dock-stats__value iz-post-job-dock-stats__value--gold">
            RM&nbsp;{cost.toLocaleString('en-MY')}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="iz-post-job-summary-card">
      <p className="iz-post-job-summary-card__title">Summary</p>
      <div className="iz-post-job-summary-card__row">
        <span className="iz-post-job-summary-card__label">Total headcount</span>
        <span className="iz-post-job-summary-card__value iz-post-job-summary-card__value--headcount">
          {headcount}
        </span>
      </div>
      <div className="iz-post-job-summary-card__cost-box">
        <span className="iz-post-job-summary-card__label">Estimated cost</span>
        <span className="iz-post-job-summary-card__value iz-post-job-summary-card__value--gold">
          RM&nbsp;{cost.toLocaleString('en-MY')}
        </span>
      </div>
    </div>
  );
}

export function PostJobActionPanel({
  headcount,
  cost,
  shiftCount,
  onAddShift,
  onSubmit,
  submitDisabled,
  compact = false,
}: {
  headcount: number;
  cost: number;
  shiftCount: number;
  onAddShift: () => void;
  onSubmit: () => void;
  submitDisabled?: boolean;
  compact?: boolean;
}) {
  const shiftLabel = `Post ${shiftCount} shift${shiftCount !== 1 ? 's' : ''}`;

  if (compact) {
    return (
      <div className="iz-post-job-action-panel iz-post-job-action-panel--compact">
        <PostJobSummaryCard headcount={headcount} cost={cost} compact />
        <div className="iz-post-job-dock-actions">
          <button
            type="button"
            onClick={onAddShift}
            className="iz-post-job-dock-add"
            aria-label="Add another shift"
            title="Add another shift"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitDisabled}
            className="iz-post-job-submit-btn iz-post-job-dock-submit flex-1 disabled:opacity-40"
          >
            {shiftLabel}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="iz-post-job-action-panel">
      <PostJobSummaryCard headcount={headcount} cost={cost} />
      <button
        type="button"
        onClick={onAddShift}
        className="iz-post-job-aside-btn mt-3 w-full"
      >
        <Plus className="h-4 w-4" />
        Add another shift
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={submitDisabled}
        className="iz-post-job-submit-btn mt-2 w-full disabled:opacity-40"
      >
        {shiftLabel}
        <ChevronRight className="h-4 w-4" />
      </button>
      <p className="iz-post-job-submit-hint">
        <span className="iz-post-job-submit-hint__green">Green</span> creates
        the job and notifies your linked agencies instantly.
      </p>
    </div>
  );
}
