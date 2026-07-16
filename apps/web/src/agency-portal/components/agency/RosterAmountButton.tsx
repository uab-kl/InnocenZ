import type { MouseEvent, ReactNode } from 'react';

export function RosterAmountButton({
  label,
  onClick,
  className = '',
  children,
  stopRowNavigation = false,
}: {
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  children: ReactNode;
  /** Prevent parent table row navigation when the amount is inside a clickable row. */
  stopRowNavigation?: boolean;
}) {
  return (
    <button
      type="button"
      className={`iz-roster-amount-btn ${className}`.trim()}
      onClick={(event) => {
        if (stopRowNavigation) {
          event.stopPropagation();
        }
        onClick(event);
      }}
      aria-label={`View ${label} breakdown`}
    >
      {children}
    </button>
  );
}
