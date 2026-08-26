/**
 * PR shift attendance session — local prototype state for check-in / check-out
 * + receipt self-logs. GPS/selfie bypassed so every flow is reachable.
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import {
  MONTH_NAMES,
  TONIGHT_SHIFT,
  isoDateFromTimestamp,
  upsertWeekPayRecord,
  type DemoShift,
  type WeekPayRecord,
} from './demo-shifts';
import { formatMessage, translations, type AppTranslations } from '../i18n';

const SESSION_KEY = 'iz-pr-shift-session-v2';
const WEEK_PAY_KEY = 'iz-pr-week-pay-v1';

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
  /** Sealed check-outs for the current payroll week (Payment → This week). */
  weekRecords: WeekPayRecord[];
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
  clearWeekPay: () => void;
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

function readWeekPay(): WeekPayRecord[] {
  try {
    const raw = webStorage()?.getItem(WEEK_PAY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WeekPayRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeWeekPay(records: WeekPayRecord[]) {
  try {
    webStorage()?.setItem(WEEK_PAY_KEY, JSON.stringify(records));
  } catch {
    /* ignore */
  }
}

function roundRm(n: number) {
  return Math.round(n * 100) / 100;
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

/** Sum of receipt commissions (RM) — matches proto `shiftCommissionTotal`. */
export function shiftCommissionTotal(logs: ReceiptLog[]): number {
  return logs.reduce((sum, log) => sum + log.commission, 0);
}

/** Duty wages + commission — matches proto `shiftPayoutTotal`. */
export function shiftPayoutTotal(baseWages: number, logs: ReceiptLog[]): number {
  return Math.round((baseWages + shiftCommissionTotal(logs)) * 100) / 100;
}

/**
 * Elapsed check-in → check-out label, with OT beyond scheduled hours when known.
 *
 * Module scope, so it cannot call `useLocale` itself — the CALLER (a component,
 * which has `t`) hands the dictionary in. Callers that pass nothing keep the
 * English wording, taken from the dictionary rather than duplicated here.
 */
export function shiftDurationLabel(
  checkedInAt: string | null | undefined,
  checkedOutAt: string | null | undefined,
  t?: AppTranslations,
  scheduledHours = 6,
): string {
  if (!checkedInAt || !checkedOutAt) return '—';
  const start = new Date(checkedInAt).getTime();
  const end = new Date(checkedOutAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '—';
  const copy = t ?? translations.en;
  const totalMins = Math.round((end - start) / 60_000);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  // Two spelled-out templates rather than one built by appending a minutes
  // fragment — Chinese has no such fragment to append.
  const base =
    m > 0
      ? formatMessage(copy.shiftLib.durationHoursMinutes, { h, m })
      : formatMessage(copy.shiftLib.durationHours, { h });
  const otMins = Math.max(0, totalMins - scheduledHours * 60);
  if (otMins <= 0) return base;
  return formatMessage(copy.shiftLib.durationWithOt, { base, ot: otMins });
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
  const [weekRecords, setWeekRecords] = useState<WeekPayRecord[]>(() => {
    let records = readWeekPay();
    const session = readPersisted();
    if (session?.phase === 'complete' && session.closedShift) {
      const dateIso = isoDateFromTimestamp(
        session.checkedInAt ?? session.closedShift.checkedInAt,
      );
      if (!records.some((r) => r.dateIso === dateIso)) {
        const drinks = roundRm(
          (session.logs ?? [])
            .filter((l) => l.category === 'drinks')
            .reduce((s, l) => s + l.commission, 0),
        );
        const tips = roundRm(
          (session.logs ?? [])
            .filter((l) => l.category === 'tips')
            .reduce((s, l) => s + l.commission, 0),
        );
        records = upsertWeekPayRecord(records, {
          dateIso,
          outlet: session.closedShift.outlet,
          wages: session.closedShift.baseWages || DUTY_WAGES_RM,
          drinks,
          tips,
          others: 0,
        });
        writeWeekPay(records);
      }
    }
    return records;
  });

  const persist = useCallback((next: Persisted) => {
    setState(next);
    writePersisted(next);
  }, []);

  const persistWeek = useCallback((next: WeekPayRecord[]) => {
    setWeekRecords(next);
    writeWeekPay(next);
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
    const logs = state.logs;
    const drinks = roundRm(
      logs.filter((l) => l.category === 'drinks').reduce((s, l) => s + l.commission, 0),
    );
    const tips = roundRm(
      logs.filter((l) => l.category === 'tips').reduce((s, l) => s + l.commission, 0),
    );
    const dateIso = isoDateFromTimestamp(checkedInAt);
    persistWeek(
      upsertWeekPayRecord(weekRecords, {
        dateIso,
        outlet: TONIGHT_SHIFT.outlet,
        wages: DUTY_WAGES_RM,
        drinks,
        tips,
        others: 0,
      }),
    );
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
      logs,
    });
  }, [persist, persistWeek, state.checkedInAt, state.logs, weekRecords]);

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

  const clearWeekPay = useCallback(() => {
    persistWeek([]);
  }, [persistWeek]);

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
      weekRecords,
      tierTargetRm: TIER_TARGET_RM,
      dutyWagesRm: DUTY_WAGES_RM,
      prTier: 'Tier V',
      acceptShift,
      checkIn,
      checkOut,
      cancelShift,
      resetDemo,
      clearWeekPay,
      addReceiptLog,
      deleteReceiptLog,
    }),
    [
      state,
      weekRecords,
      acceptShift,
      checkIn,
      checkOut,
      cancelShift,
      resetDemo,
      clearWeekPay,
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
