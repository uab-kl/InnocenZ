import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { IzPill } from '@agency-portal/components/iz/ui';

export function PrOfferRow({
  title,
  subtitle,
  amount,
  badge,
  onClick,
  trailing,
}: {
  title: string;
  subtitle?: string;
  amount?: string;
  badge?: ReactNode;
  onClick?: () => void;
  trailing?: ReactNode;
}) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-sora truncate text-[13px] font-bold text-[var(--iz-txt)]">
            {title}
          </span>
          {badge}
        </div>
        {subtitle && (
          <p className="iz-tiny iz-muted mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-2">
        {amount && (
          <span className="font-sora text-sm font-extrabold text-[var(--iz-gold-l)]">
            {amount}
          </span>
        )}
        {trailing ??
          (onClick && (
            <ChevronRight className="h-4 w-4 text-[var(--iz-muted2)]" />
          ))}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className="iz-pr-offer-row w-full text-left"
        onClick={onClick}
      >
        {inner}
      </button>
    );
  }

  return <div className="iz-pr-offer-row">{inner}</div>;
}

export function PrOfferRowActions({
  onPrimary,
  onSecondary,
  primaryLabel,
  secondaryLabel,
}: {
  onPrimary: () => void;
  onSecondary: () => void;
  primaryLabel: string;
  secondaryLabel?: string;
}) {
  return (
    <div className="flex gap-2 iz-pr-inbox-card__actions">
      <button
        type="button"
        className="iz-btn iz-btn-soft iz-btn-sm flex-1 !py-2"
        onClick={onSecondary}
      >
        {secondaryLabel ?? 'Decline'}
      </button>
      <button
        type="button"
        className="iz-btn iz-btn-primary iz-btn-sm flex-1 !py-2"
        onClick={onPrimary}
      >
        {primaryLabel}
      </button>
    </div>
  );
}

export function PrStatusPill({
  children,
  variant = 'amber',
}: {
  children: ReactNode;
  variant?: 'amber' | 'green' | 'ink' | 'gold' | 'red';
}) {
  return (
    <IzPill variant={variant} className="!text-[9px]">
      {children}
    </IzPill>
  );
}
