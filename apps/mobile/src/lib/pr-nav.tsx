/**
 * In-app PR navigation — mirrors proto host routes beyond the 5-tab bar
 * (scan, PV detail, security).
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { PrTab } from '../components/BottomNav';

export type ScanCategory = 'drinks' | 'tips';
export type ScanMode = 'scan' | 'selflog';

export type PaymentWeekFocus = 'current' | 'last';

export type PrRoute =
  | { name: 'tabs'; tab: PrTab; paymentWeek?: PaymentWeekFocus }
  | {
      name: 'scan';
      category: ScanCategory;
      mode: ScanMode;
      editId?: string;
    }
  | { name: 'pvDetail'; pvId: string }
  | { name: 'security' };

type SetTabOptions = {
  /** When opening Payment after check-out, land on This week (or Last week). */
  paymentWeek?: PaymentWeekFocus;
};

type PrNavState = {
  route: PrRoute;
  setTab: (tab: PrTab, opts?: SetTabOptions) => void;
  openScan: (category: ScanCategory, mode: ScanMode, editId?: string) => void;
  openPv: (pvId: string) => void;
  openSecurity: () => void;
  goBack: () => void;
  /** Current tab when on tabs route */
  tab: PrTab;
};

const PrNavContext = createContext<PrNavState | null>(null);

export function PrNavProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<PrRoute>({ name: 'tabs', tab: 'shifts' });
  const [stack, setStack] = useState<PrRoute[]>([]);

  const setTab = useCallback((tab: PrTab, opts?: SetTabOptions) => {
    setStack([]);
    setRoute({
      name: 'tabs',
      tab,
      ...(tab === 'payment' && opts?.paymentWeek ? { paymentWeek: opts.paymentWeek } : {}),
    });
  }, []);

  const openScan = useCallback((category: ScanCategory, mode: ScanMode, editId?: string) => {
    setRoute((prev) => {
      setStack((s) => [...s, prev]);
      return { name: 'scan', category, mode, editId };
    });
  }, []);

  const openPv = useCallback((pvId: string) => {
    setRoute((prev) => {
      setStack((s) => [...s, prev]);
      return { name: 'pvDetail', pvId };
    });
  }, []);

  const openSecurity = useCallback(() => {
    setRoute((prev) => {
      setStack((s) => [...s, prev]);
      return { name: 'security' };
    });
  }, []);

  const goBack = useCallback(() => {
    setStack((s) => {
      const prev = s[s.length - 1];
      if (prev) {
        setRoute(prev);
        return s.slice(0, -1);
      }
      setRoute({ name: 'tabs', tab: 'checkin' });
      return [];
    });
  }, []);

  const tab = route.name === 'tabs' ? route.tab : 'checkin';

  const value = useMemo(
    () => ({ route, setTab, openScan, openPv, openSecurity, goBack, tab }),
    [route, setTab, openScan, openPv, openSecurity, goBack, tab],
  );

  return <PrNavContext.Provider value={value}>{children}</PrNavContext.Provider>;
}

export function usePrNav(): PrNavState {
  const ctx = useContext(PrNavContext);
  if (!ctx) throw new Error('usePrNav must be used inside PrNavProvider');
  return ctx;
}
