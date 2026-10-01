/**
 * In-app PR navigation — mirrors proto host routes beyond the 5-tab bar
 * (scan, PV detail, security).
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { PrTab } from '../components/BottomNav';

export type ScanCategory = 'drinks' | 'tips';
export type ScanMode = 'scan' | 'selflog';

export type PaymentWeekFocus = 'current' | 'last';

/**
 * Opening Shifts ON something — a notification's shift or swap request
 * (TopBar, `notification-targets.ts`). Each navigation makes a NEW object, and
 * that identity is what ShiftsScreen reacts to, so a second notification tapped
 * while Shifts is already open still opens its own item.
 */
export type ShiftsFocus =
  /**
   * The To-do section, where swap requests are answered. `swapId` = the request
   * the notice was about, so To-do can say it is no longer open when it was
   * answered or withdrawn before the tap.
   */
  | { section: 'todo'; swapId?: string }
  /**
   * The Agency Schedule, with this day's sheet open. `assignmentId` = the
   * booking the notice was about, so the sheet can say when it is gone.
   */
  | { section: 'schedule'; dateIso: string; assignmentId?: string };

export type PrRoute =
  | {
      name: 'tabs';
      tab: PrTab;
      paymentWeek?: PaymentWeekFocus;
      shiftsFocus?: ShiftsFocus;
    }
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
  /** When opening Shifts from a notification, land on its item. */
  shiftsFocus?: ShiftsFocus;
};

/** The two halves of the History tab. */
export type PrHistoryTab = 'shifts' | 'payment';

type PrNavState = {
  route: PrRoute;
  setTab: (tab: PrTab, opts?: SetTabOptions) => void;
  openScan: (category: ScanCategory, mode: ScanMode, editId?: string) => void;
  openPv: (pvId: string) => void;
  openSecurity: () => void;
  goBack: () => void;
  /** Current tab when on tabs route */
  tab: PrTab;
  /**
   * Which half of History to show — REMEMBERED, not reset.
   *
   * It lived as `useState('shifts')` inside HistoryScreen, so the screen was
   * remounted on Shifts every time it was reached. Both journeys that end at
   * History ended at the wrong half: a PR who opens a voucher from Payment
   * history and comes back WITHOUT signing landed on Shifts, and — worse — one
   * who DID sign is redirected here by PvDetailScreen and landed on Shifts too,
   * so the confirmation she had just given RM3,708.20 for sat on a tab she had
   * to know to press.
   */
  historyTab: PrHistoryTab;
  setHistoryTab: (tab: PrHistoryTab) => void;
  /**
   * The voucher she last opened, so Payment history can reopen its card when she
   * comes back. Same reset problem as `historyTab`: the panel's `expanded` is
   * local state, so returning from a voucher — signed or not — dropped her onto
   * a list of identical collapsed cards with nothing marking the one she had
   * just been inside. Null until a voucher is opened.
   */
  lastOpenedPvId: string | null;
};

const PrNavContext = createContext<PrNavState | null>(null);

export function PrNavProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<PrRoute>({ name: 'tabs', tab: 'shifts' });
  const [stack, setStack] = useState<PrRoute[]>([]);
  // Lives here rather than in HistoryScreen so it survives that screen being
  // unmounted while a voucher is open. See `historyTab` on PrNavState.
  const [historyTab, setHistoryTab] = useState<PrHistoryTab>('shifts');
  const [lastOpenedPvId, setLastOpenedPvId] = useState<string | null>(null);

  const setTab = useCallback((tab: PrTab, opts?: SetTabOptions) => {
    setStack([]);
    setRoute({
      name: 'tabs',
      tab,
      ...(tab === 'payment' && opts?.paymentWeek ? { paymentWeek: opts.paymentWeek } : {}),
      ...(tab === 'shifts' && opts?.shiftsFocus ? { shiftsFocus: opts.shiftsFocus } : {}),
    });
  }, []);

  const openScan = useCallback((category: ScanCategory, mode: ScanMode, editId?: string) => {
    setRoute((prev) => {
      setStack((s) => [...s, prev]);
      return { name: 'scan', category, mode, editId };
    });
  }, []);

  const openPv = useCallback((pvId: string) => {
    // A voucher is only ever opened from the payment half — from Payment
    // history, or from the Payment tab. Pinning it here means every way BACK
    // lands there: the stack pop when she leaves without signing, and
    // PvDetailScreen's `setTab('history')` after she signs.
    setHistoryTab('payment');
    setLastOpenedPvId(pvId);
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
    () => ({
      route,
      setTab,
      openScan,
      openPv,
      openSecurity,
      goBack,
      tab,
      historyTab,
      setHistoryTab,
      lastOpenedPvId,
    }),
    [
      route,
      setTab,
      openScan,
      openPv,
      openSecurity,
      goBack,
      tab,
      historyTab,
      lastOpenedPvId,
    ],
  );

  return <PrNavContext.Provider value={value}>{children}</PrNavContext.Provider>;
}

export function usePrNav(): PrNavState {
  const ctx = useContext(PrNavContext);
  if (!ctx) throw new Error('usePrNav must be used inside PrNavProvider');
  return ctx;
}
