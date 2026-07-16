import { useLayoutEffect, useState } from 'react';
import { type PrSubRole } from '@agency-portal/lib/pr-demo';
import { useStore } from '@agency-portal/lib/store';

const STORE_KEY = 'innocenz-store';
const SESSION_ROLE_KEY = 'innocenz-pr-sub-role';

function parsePrSubRole(value: unknown): PrSubRole | null {
  return value === 'pr_tied' ? value : null;
}

/** Synchronous read — sessionStorage first, then Zustand persist blob. */
export function readPersistedPrSubRole(): PrSubRole | null {
  if (typeof window === 'undefined') return null;
  try {
    const sessionRole = sessionStorage.getItem(SESSION_ROLE_KEY);
    const fromSession = parsePrSubRole(sessionRole);
    if (fromSession) return fromSession;

    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      state?: { prSubRole?: unknown };
      prSubRole?: unknown;
    };
    return parsePrSubRole(parsed?.state?.prSubRole ?? parsed?.prSubRole);
  } catch {
    return null;
  }
}

export function writePersistedPrSubRole(role: PrSubRole | null) {
  if (typeof window === 'undefined') return;
  try {
    if (role) sessionStorage.setItem(SESSION_ROLE_KEY, role);
    else sessionStorage.removeItem(SESSION_ROLE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Resolves PR sub-role only after client mount so SSR + first hydration paint stay neutral.
 */
export function usePrPortalReady(): { ready: boolean; role: PrSubRole | null } {
  const storeRole = useStore((s) => s.prSubRole);
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    const role = useStore.getState().prSubRole ?? readPersistedPrSubRole();
    if (role) writePersistedPrSubRole(role);
    setMounted(true);
  }, []);

  const role = mounted ? (storeRole ?? readPersistedPrSubRole()) : null;

  return { ready: mounted && role !== null, role };
}

/** @deprecated Prefer usePrPortalReady — kept for call sites that only need the role string. */
export function usePrSubRole(): PrSubRole | null {
  return usePrPortalReady().role;
}
