/**
 * The PR's active shift assignment, shared across screens. Owns the
 * `/shift-assignment/mine` fetch (scoped server-side to this PR) and picks the
 * one shift the app acts on, so Check-In and Scan agree on the same real
 * assignment — including its resolved rate card and outlet drink menu — even as
 * the router swaps which screen is mounted.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useSession } from './session';
import { fetchMyShiftAssignments, type ShiftAssignmentRecord } from './api';

export type AttendancePhase = 'idle' | 'booked' | 'on_duty' | 'complete';

/** Attendance phase implied by a row's check-in / check-out stamps. */
export function derivePhase(a: ShiftAssignmentRecord): Exclude<AttendancePhase, 'idle'> {
  if (a.checkOutAt) return 'complete';
  if (a.checkInAt) return 'on_duty';
  return 'booked';
}

/**
 * The single assignment the app acts on: a shift in progress wins, else the
 * soonest one still awaiting check-in, else the latest completed one (to show
 * its summary). Cancelled / no-show / locally-dismissed rows are skipped.
 */
export function pickActive(
  list: ShiftAssignmentRecord[],
  dismissed: Set<string>,
): ShiftAssignmentRecord | null {
  const open = list.filter(
    (a) => !dismissed.has(a.id) && a.status !== 'cancelled' && a.status !== 'no_show',
  );
  const onDuty = open.find((a) => a.checkInAt && !a.checkOutAt);
  if (onDuty) return onDuty;
  const booked = open
    .filter((a) => !a.checkInAt && a.status !== 'completed')
    .sort((a, b) => a.shiftDate.localeCompare(b.shiftDate));
  if (booked.length) return booked[0];
  const completed = open
    .filter((a) => a.checkOutAt)
    .sort((a, b) => b.shiftDate.localeCompare(a.shiftDate));
  return completed[0] ?? null;
}

type ActiveShiftState = {
  assignments: ShiftAssignmentRecord[];
  active: ShiftAssignmentRecord | null;
  phase: AttendancePhase;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Optimistically merge a stamped row (check-in/out) into the list. */
  patch: (updated: ShiftAssignmentRecord) => void;
  /** Hide a row from the active pick until the next reload (client-only cancel). */
  dismiss: (id: string) => void;
};

const ActiveShiftContext = createContext<ActiveShiftState | null>(null);

export function ActiveShiftProvider({ children }: { children: React.ReactNode }) {
  const { token } = useSession();
  const [assignments, setAssignments] = useState<ShiftAssignmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const refresh = useCallback(async () => {
    if (!token) {
      setAssignments([]);
      setLoading(false);
      return;
    }
    try {
      const list = await fetchMyShiftAssignments(token);
      setAssignments(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your shift');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const patch = useCallback((updated: ShiftAssignmentRecord) => {
    // Spread `updated` over the existing row: check-in/out responses omit the
    // rate/drinkMenu fields, so those keys are absent and the resolved values
    // stay intact.
    setAssignments((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
  }, []);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  }, []);

  const active = useMemo(() => pickActive(assignments, dismissed), [assignments, dismissed]);
  const phase: AttendancePhase = active ? derivePhase(active) : 'idle';

  const value = useMemo<ActiveShiftState>(
    () => ({ assignments, active, phase, loading, error, refresh, patch, dismiss }),
    [assignments, active, phase, loading, error, refresh, patch, dismiss],
  );

  return <ActiveShiftContext.Provider value={value}>{children}</ActiveShiftContext.Provider>;
}

export function useActiveShift(): ActiveShiftState {
  const ctx = useContext(ActiveShiftContext);
  if (!ctx) throw new Error('useActiveShift must be used inside ActiveShiftProvider');
  return ctx;
}
