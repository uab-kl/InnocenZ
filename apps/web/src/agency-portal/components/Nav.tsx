import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';

import type { LucideIcon } from 'lucide-react';

import { ArrowLeft } from 'lucide-react';

import { TitleWithIcon } from '@agency-portal/components/iz/TitleWithIcon';

import {
  getShiftToday,
  fmtDTopbar,
  getPrProfile,
} from '@agency-portal/lib/pr-demo';

import { AGENCY_SUB_ROLE_LABELS } from '@agency-portal/lib/agency-rbac';

import { goToWelcome } from '@agency-portal/lib/go-welcome';
import { publicAssetPath } from '@agency-portal/lib/public-asset';
import { PrNotificationBell } from '@agency-portal/components/pr/PrNotificationBell';
import {
  getAutoBackLabel,
  getAutoBackTo,
  WELCOME_PATH,
} from '@agency-portal/lib/nav-back';

import { OUTLET_SUB_ROLE_LABELS } from '@agency-portal/lib/outlet-rbac';

import { useStore } from '@agency-portal/lib/store';
import { usePrPortalReady } from '@agency-portal/lib/use-pr-sub-role';

export interface NavItem {
  to: string;

  label: string;

  icon: LucideIcon;
}

export function navIsActive(pathname: string, to: string) {
  if (pathname === to || pathname === `${to}/`) return true;

  const hubs = ['/host', '/outlet', '/agency'];

  if (hubs.includes(to)) return false;

  return pathname.startsWith(`${to}/`);
}

export function BottomNav({
  items,
  className,
}: {
  items: NavItem[];
  className?: string;
}) {
  const { pathname } = useLocation();

  return (
    <nav className={className ? `iz-tabbar ${className}` : 'iz-tabbar'}>
      {items.map((i) => {
        const isActive = navIsActive(pathname, i.to);

        return (
          <Link
            key={i.to}
            to={i.to}
            className={isActive ? 'on' : ''}
            data-active={isActive ? 'true' : undefined}
          >
            <i.icon className="h-5 w-5" strokeWidth={1.8} />

            <span>{i.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

const ROLE_LABELS: Record<
  string,
  { name: string; label: string; av: string; gradient: string }
> = {
  host: {
    name: 'PR',
    label: 'PR',
    av: 'P',
    gradient: 'linear-gradient(135deg,#6b7280,#374151)',
  },

  host_tied: {
    name: 'Vicky',
    label: 'PR \u00b7 Agency-Tied',
    av: 'V',
    gradient: 'linear-gradient(135deg,#C99B4E,#8a5e22)',
  },

  agency: {
    name: 'Atlas Agency',
    label: 'PR Agency',
    av: 'A',
    gradient: 'var(--iz-grad)',
  },

  vendor: {
    name: 'Velvet 23',
    label: 'Outlet',
    av: 'V',
    gradient: 'linear-gradient(135deg,#39D98A,#1f8f5c)',
  },
};

function formatTopbarTime(d: Date) {
  return d.toLocaleTimeString('en-MY', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function PrTopbarDateTime() {
  const [time, setTime] = useState(() => formatTopbarTime(new Date()));
  const today = getShiftToday();
  const dateLine = fmtDTopbar(today[0], today[1], today[2]);

  useEffect(() => {
    const tick = () => setTime(formatTopbarTime(new Date()));
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="iz-topbar-datetime" aria-label={`${dateLine}, ${time}`}>
      <span className="iz-topbar-date">{dateLine}</span>
      <span className="iz-topbar-time">{time}</span>
    </div>
  );
}

export type AppTopbarProps = {
  backTo?: string;

  backLabel?: string;

  /** In-page back — return `false` to also run route navigation */

  onBack?: () => void | boolean;

  hideBack?: boolean;
};

export function PortalBackButton({
  backTo,

  backLabel,

  onBack,

  className,
}: {
  backTo?: string;

  backLabel?: string;

  onBack?: () => void | boolean;

  className?: string;
}) {
  const navigate = useNavigate();

  const { pathname } = useLocation();

  const resolvedBackTo = backTo ?? getAutoBackTo(pathname);

  const resolvedLabel = backLabel ?? getAutoBackLabel(pathname);

  const showBack = onBack != null || resolvedBackTo != null;

  if (!showBack) {
    return <span className="iz-topbar-spacer" aria-hidden />;
  }

  const handleBack = () => {
    if (onBack) {
      const fallThrough = onBack();

      if (fallThrough !== false) return;
    }

    if (resolvedBackTo === WELCOME_PATH) {
      goToWelcome();

      return;
    }

    if (resolvedBackTo) void navigate({ to: resolvedBackTo });
  };

  return (
    <button
      type="button"
      className={className ? `iz-topbar-back ${className}` : 'iz-topbar-back'}
      onClick={handleBack}
      aria-label={resolvedLabel}
      title={resolvedLabel}
    >
      <ArrowLeft className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />

      <span className="iz-topbar-back-label">{resolvedLabel}</span>
    </button>
  );
}

export function AppTopbar({
  backTo,

  backLabel,

  onBack,

  hideBack = false,
}: AppTopbarProps) {
  const { pathname } = useLocation();

  const { role: prSubRole } = usePrPortalReady();

  const outletSubRole = useStore((s) => s.outletSubRole);

  const agencySubRole = useStore((s) => s.agencySubRole);

  const prDisplayName = useStore((s) => s.prDisplayName);

  const prAvatarPhoto = useStore((s) => s.prAvatarPhoto);

  let role: keyof typeof ROLE_LABELS = 'host';

  if (pathname.startsWith('/outlet')) role = 'vendor';
  else if (pathname.startsWith('/agency')) role = 'agency';
  else if (pathname.startsWith('/host')) {
    role = prSubRole === 'pr_tied' ? 'host_tied' : 'host';
  }

  const prProfile = prSubRole ? getPrProfile(prSubRole) : null;

  const meta = ROLE_LABELS[role];

  const displayName = prDisplayName ?? prProfile?.name ?? meta.name;

  const displayAv =
    displayName.trim()[0]?.toUpperCase() ?? prProfile?.av ?? meta.av;

  const displayGradient = prProfile?.avg ?? meta.gradient;

  const displayLabel =
    pathname.startsWith('/outlet') && outletSubRole
      ? OUTLET_SUB_ROLE_LABELS[outletSubRole]
      : pathname.startsWith('/agency') && agencySubRole
        ? AGENCY_SUB_ROLE_LABELS[agencySubRole]
        : meta.label;

  const resolvedBackTo = backTo ?? getAutoBackTo(pathname);
  const isPortalShell =
    pathname.startsWith('/outlet') || pathname.startsWith('/agency');
  const isPrPortal = pathname.startsWith('/host');

  if (isPortalShell && onBack == null) {
    return null;
  }

  const hasExplicitBack = backTo != null || backLabel != null;

  const showBack =
    !hideBack &&
    (isPortalShell
      ? onBack != null
      : isPrPortal
        ? hasExplicitBack
        : onBack != null || resolvedBackTo != null);

  return (
    <header
      className={`iz-topbar${isPortalShell ? ' iz-topbar--minimal' : ''}${!showBack ? ' iz-topbar--no-back' : ''}`}
    >
      {showBack && (
        <PortalBackButton
          backTo={backTo}
          backLabel={backLabel}
          onBack={onBack}
        />
      )}

      {!isPortalShell && (
        <>
          {isPrPortal ? (
            <>
              <Link
                to="/host/profile"
                className="iz-topbar-identity iz-topbar-identity--link iz-topbar-identity--pr"
                aria-label="Open profile"
                title="Profile"
              >
                <div
                  className={`iz-avatar iz-avatar--sm${prAvatarPhoto ? ' iz-avatar-photo' : ''}`}
                  style={
                    prAvatarPhoto ? undefined : { background: displayGradient }
                  }
                >
                  {prAvatarPhoto ? (
                    <img src={publicAssetPath(prAvatarPhoto)} alt="" />
                  ) : (
                    displayAv
                  )}
                </div>
                <div className="iz-topbar-meta">
                  <div className="iz-topbar-name">{displayName}</div>
                  <div className="iz-topbar-role">{displayLabel}</div>
                </div>
              </Link>
              <div className="iz-topbar-actions iz-topbar-actions--pr">
                <PrTopbarDateTime />
                <PrNotificationBell />
              </div>
            </>
          ) : (
            <div className="iz-topbar-identity">
              <div
                className={`iz-avatar iz-avatar--sm${prAvatarPhoto ? ' iz-avatar-photo' : ''}`}
                style={
                  prAvatarPhoto ? undefined : { background: displayGradient }
                }
              >
                {prAvatarPhoto ? (
                  <img src={publicAssetPath(prAvatarPhoto)} alt="" />
                ) : (
                  displayAv
                )}
              </div>
              <div className="iz-topbar-meta">
                <div className="iz-topbar-name">{displayName}</div>
                <div className="iz-topbar-role">{displayLabel}</div>
              </div>
            </div>
          )}
        </>
      )}
    </header>
  );
}

/** Standalone back row below topbar (detail overlays, sheets) */

export function BackBar({
  label = 'Back',

  onBack,

  to,
}: {
  label?: string;

  onBack?: () => void;

  to?: string;
}) {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className="iz-chip mb-2"
      onClick={() => {
        if (onBack) onBack();
        else if (to) navigate({ to });
      }}
    >
      <ArrowLeft className="h-3.5 w-3.5" />

      {label}
    </button>
  );
}

/** Screen shell: topbar + optional page title (wrap route content in `iz-screen`). */

export function AppHeader({
  title,

  subtitle,

  right,

  ...topbar
}: AppTopbarProps & {
  title: string;

  subtitle?: string;

  right?: ReactNode;
}) {
  return (
    <>
      <AppTopbar {...topbar} />

      {(subtitle || title || right) && (
        <div className="pb-2">
          {subtitle && (
            <p className="iz-tiny iz-muted2 uppercase tracking-widest">
              {subtitle}
            </p>
          )}

          <div className="flex items-start justify-between gap-2">
            {title ? (
              <h1 className="font-sora text-[22px] font-extrabold tracking-tight text-[var(--iz-txt)]">
                <TitleWithIcon>{title}</TitleWithIcon>
              </h1>
            ) : (
              <span />
            )}

            {right}
          </div>
        </div>
      )}
    </>
  );
}
