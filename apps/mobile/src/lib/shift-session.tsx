/**
 * PR shift attendance session — local prototype state for check-in / check-out
 * + receipt self-logs. GPS/selfie bypassed so every flow is reachable.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { MONTH_NAMES, TONIGHT_SHIFT, type DemoShift } from './demo-shifts';

const SESSION_KEY = 'iz-pr-shift-session-v2';

export type AttendancePhase = 'idle' | 'booked' | 'on_duty' | 'complete';

export type ReceiptLog = {
  id: string;
  category: 'drinks' | 'tips';
  /** Display product name */
  item: string;
  qty: number;
  /** Sales logged (RM) */
  amount: number;
  /** Commission portion (RM) */
  commission: number;
  source: 'Receipt scan' | 'Manual entry';
  at: string;
  pending: boolean;
};

type ClosedShift = {
  outlet: string;
  time: string;
  checkedInAt: string;
  checkedOutAt: string;
  baseWages: number;
};

type Persisted = {
  phase: AttendancePhase;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  closedShift: ClosedShift | null;
  logs: ReceiptLog[];
};

type ShiftSessionState = {
  phase: AttendancePhase;
  shift: DemoShift;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  closedShift: ClosedShift | null;
  logs: ReceiptLog[];
  /** Proto Tier V sales target (RM) */
  tierTargetRm: number;
  /** Duty wages sealed at check-out (RM) — matches Velvet duty rate in proto */
  dutyWagesRm: number;
  prTier: string;
  acceptShift: () => void;
  checkIn: () => void;
  checkOut: () => void;
  cancelShift: () => void;
  resetDemo: () => void;
  addReceiptLog: (log: Omit<ReceiptLog, 'id' | 'at' | 'pending'>) => void;
  deleteReceiptLog: (id: string) => void;
};

type WebStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function webStorage(): WebStorage | null {
  if (Platform.OS !== 'web') return null;
  return (globalThis as { localStorage?: WebStorage }).localStorage ?? null;
}

function readPersisted(): Persisted | null {
  try {
    const raw = webStorage()?.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Persisted;
  } catch {
    return null;
  }
}

function writePersisted(data: Persisted | null) {
  try {
    if (data) webStorage()?.setItem(SESSION_KEY, JSON.stringify(data));
    else webStorage()?.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** e.g. "19 Jul 2026, 11:50 pm" — matches proto attendance stamps */
export function fmtAttendanceStamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}, ${h}:${m} ${ampm}`;
}

const DEFAULT: Persisted = {
  phase: 'booked',
  checkedInAt: null,
  checkedOutAt: null,
  closedShift: null,
  logs: [],
};

/** Proto Velvet Tier V sales target */
const TIER_TARGET_RM = 2000;
/** Proto duty wage display for Velvet shift completion */
const DUTY_WAGES_RM = 500;

const ShiftSessionContext = createContext<ShiftSessionState | null>(null);

export function ShiftSessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Persisted>(() => {
    const stored = readPersisted();
    if (!stored) return DEFAULT;
    return { ...DEFAULT, ...stored, logs: stored.logs ?? [] };
  });

  const persist = useCallback((next: Persisted) => {
    setState(next);
    writePersisted(next);
  }, []);

  const acceptShift = useCallback(() => {
    persist({
      phase: 'booked',
      checkedInAt: null,
      checkedOutAt: null,
      closedShift: null,
      logs: [],
    });
  }, [persist]);

  const checkIn = useCallback(() => {
    persist({
      phase: 'on_duty',
      checkedInAt: new Date().toISOString(),
      checkedOutAt: null,
      closedShift: null,
      logs: [],
    });
  }, [persist]);

  const checkOut = useCallback(() => {
    const now = new Date().toISOString();
    const checkedInAt = state.checkedInAt ?? now;
    persist({
      phase: 'complete',
      checkedInAt,
      checkedOutAt: now,
      closedShift: {
        outlet: TONIGHT_SHIFT.outlet,
        time: TONIGHT_SHIFT.time,
        checkedInAt,
        checkedOutAt: now,
        baseWages: DUTY_WAGES_RM,
      },
      logs: state.logs,
    });
  }, [persist, state.checkedInAt, state.logs]);

  const cancelShift = useCallback(() => {
    persist({
      phase: 'idle',
      checkedInAt: null,
      checkedOutAt: null,
      closedShift: null,
      logs: [],
    });
  }, [persist]);

  const resetDemo = useCallback(() => {
    persist(DEFAULT);
  }, [persist]);

  const addReceiptLog = useCallback(
    (log: Omit<ReceiptLog, 'id' | 'at' | 'pending'>) => {
      const entry: ReceiptLog = {
        ...log,
        id: `log-${Date.now().toString(36)}`,
        at: new Date().toISOString(),
        pending: log.source === 'Manual entry',
      };
      persist({ ...state, logs: [entry, ...state.logs] });
    },
    [persist, state],
  );

  const deleteReceiptLog = useCallback(
    (id: string) => {
      persist({ ...state, logs: state.logs.filter((l) => l.id !== id) });
    },
    [persist, state],
  );

  const value = useMemo<ShiftSessionState>(
    () => ({
      phase: state.phase,
      shift: TONIGHT_SHIFT,
      checkedInAt: state.checkedInAt,
      checkedOutAt: state.checkedOutAt,
      closedShift: state.closedShift,
      logs: state.logs,
      tierTargetRm: TIER_TARGET_RM,
      dutyWagesRm: DUTY_WAGES_RM,
      prTier: 'Tier V',
      acceptShift,
      checkIn,
      checkOut,
      cancelShift,
      resetDemo,
      addReceiptLog,
      deleteReceiptLog,
    }),
    [
      state,
      acceptShift,
      checkIn,
      checkOut,
      cancelShift,
      resetDemo,
      addReceiptLog,
      deleteReceiptLog,
    ],
  );

  return <ShiftSessionContext.Provider value={value}>{children}</ShiftSessionContext.Provider>;
}

export function useShiftSession(): ShiftSessionState {
  const ctx = useContext(ShiftSessionContext);
  if (!ctx) throw new Error('useShiftSession must be used inside ShiftSessionProvider');
  return ctx;
}
