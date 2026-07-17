import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@agency-portal/lib/utils';
import { publicAssetPath } from '@agency-portal/lib/public-asset';

export const INNOCENZ_LOGO_PATH = '/assets/innocenz-logo.png';
export const INNOCENZ_LOGO_HORIZONTAL_PATH =
  '/assets/innocenz-logo-horizontal.png';

/** Serif gold wordmark — matches brand lockup (Playfair Display, unified gold). */
export function InnocenZWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('iz-wordmark', className)}>
      Innocen<span className="iz-wordmark-z">Z</span>
    </span>
  );
}

export function InnocenZLogoHorizontal({ className }: { className?: string }) {
  return (
    <div className={cn('iz-logo-horizontal', className)}>
      <img
        src={publicAssetPath(INNOCENZ_LOGO_HORIZONTAL_PATH)}
        alt="InnocenZ"
        className="iz-logo-horizontal__img"
      />
    </div>
  );
}

export function InnocenZLogoMark({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeClass =
    size === 'sm'
      ? 'iz-logo-tile--sm'
      : size === 'lg'
        ? 'iz-logo-tile--lg'
        : '';

  return (
    <div
      className={['iz-logo-tile', sizeClass, className]
        .filter(Boolean)
        .join(' ')}
    >
      <img
        src={publicAssetPath(INNOCENZ_LOGO_PATH)}
        alt="InnocenZ"
        className="iz-logo-tile__img"
      />
    </div>
  );
}

/**
 * InnocenZ brand mark — circular crown + Z lockup.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src={publicAssetPath(INNOCENZ_LOGO_PATH)}
      alt="InnocenZ"
      className={['iz-logo-mark', className].filter(Boolean).join(' ')}
    />
  );
}

/** Compact circular mark for section headers and inline UI chrome. */
export function InnocenZBrandMark({ className }: { className?: string }) {
  return (
    <img
      src={publicAssetPath(INNOCENZ_LOGO_PATH)}
      alt=""
      className={cn('iz-brand-mark-icon', className)}
      aria-hidden
    />
  );
}

export function Logo({
  size = 'md',
  showTagline = true,
}: {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
}) {
  const wordSize =
    size === 'lg' ? 'text-[22px]' : size === 'sm' ? 'text-lg' : 'text-[22px]';
  return (
    <div className="flex flex-col items-center gap-1">
      <InnocenZWordmark className={wordSize} />
      {showTagline && size !== 'sm' && (
        <p
          className="font-sora text-[10px] font-bold tracking-[0.3em] text-[var(--iz-gold)]"
          style={{ letterSpacing: '3px' }}
        >
          WORK · FLOW · ELEGANCE
        </p>
      )}
    </div>
  );
}

function StatusBar() {
  const [time, setTime] = useState('9:41');
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(
        d.toLocaleTimeString('en-GB', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: false,
        }),
      );
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="iz-statusbar">
      <span>{time}</span>
      <div className="flex items-center gap-[5px]">
        <svg
          width="17"
          height="12"
          viewBox="0 0 17 12"
          fill="currentColor"
          aria-hidden
        >
          <rect x="0" y="7" width="3" height="5" rx="1" />
          <rect x="4.5" y="4" width="3" height="8" rx="1" />
          <rect x="9" y="2" width="3" height="10" rx="1" />
          <rect x="13.5" y="0" width="3" height="12" rx="1" />
        </svg>
        <svg
          width="16"
          height="12"
          viewBox="0 0 16 12"
          fill="currentColor"
          aria-hidden
        >
          <path
            d="M8 2.5c2 0 3.8.8 5.1 2l1.1-1.2C13.6 1.7 11 .7 8 .7S2.4 1.7.7 3.3l1.1 1.2C3.2 3.3 6 2.5 8 2.5z"
            opacity=".5"
          />
          <path d="M8 6c1.1 0 2.1.4 2.9 1.1l1.1-1.2C11 4.9 9.6 4.3 8 4.3s-3 .6-4 1.6l1.1 1.2C5.9 6.4 6.9 6 8 6z" />
          <circle cx="8" cy="9.5" r="1.6" />
        </svg>
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none" aria-hidden>
          <rect
            x="1"
            y="1"
            width="20"
            height="10"
            rx="3"
            stroke="currentColor"
            opacity=".5"
          />
          <rect
            x="2.5"
            y="2.5"
            width="15"
            height="7"
            rx="1.5"
            fill="currentColor"
          />
          <rect
            x="22"
            y="4"
            width="2"
            height="4"
            rx="1"
            fill="currentColor"
            opacity=".5"
          />
        </svg>
      </div>
    </div>
  );
}

export function PhoneFrame({
  children,
  footer,
  overlay,
  framed = true,
  showStatusBar = true,
}: {
  children: ReactNode;
  /** Bottom tab bar — pinned under the scroll area (sibling of viewport). */
  footer?: ReactNode;
  /** Sheets, toasts — full-screen over the phone frame. */
  overlay?: ReactNode;
  framed?: boolean;
  showStatusBar?: boolean;
}) {
  if (!framed) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[392px] flex-col">
        {children}
        {footer}
        {overlay}
      </div>
    );
  }

  return (
    <div className="iz-shell">
      <div className="iz-phone">
        {showStatusBar && <StatusBar />}
        <div
          className={footer ? 'iz-viewport iz-viewport--tabbed' : 'iz-viewport'}
        >
          {children}
        </div>
        {footer ? <div className="iz-phone-footer">{footer}</div> : null}
        {overlay}
      </div>
    </div>
  );
}
