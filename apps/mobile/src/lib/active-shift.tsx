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

/** Local (device-time) calendar day as YYYY-MM-DD — the PR's own "today". */
function localDateKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * A check-out is still "fresh" while its calendar day is today or it happened
 * under 12 h ago — a 23:50 night-shift check-out must not fall off Today /
 * Check-In minutes later at midnight. Same rule as ShiftsScreen's Today cards.
 */
function checkOutFresh(stamp: string): boolean {
  if (localDateKey(new Date(stamp)) === localDateKey(new Date())) return true;
  return Date.now() - new Date(stamp).getTime() < 12 * 60 * 60 * 1000;
}

/**
 * The single assignment the app acts on:
 *  1. a shift in progress (checked in, not out) — highest;
 *  2. a shift booked for TODAY still awaiting check-in — a new same-day
 *     assignment renews the Check-In page even right after a check-out, so
 *     the PR can start the next shift instead of staring at the old summary;
 *  3. a shift the PR checked out TODAY or under 12 h ago (night shifts cross
 *     midnight) — with no new shift, the just-finished summary stays pinned,
 *     then clears once the check-out stops being fresh;
 *  4. the soonest TODAY-or-future one still awaiting check-in (their next
 *     shift) — a PAST booking that was never checked in is a missed shift,
 *     not the next shift: it surfaces on Today → To-do instead of posing as
 *     a live "Booked" card here;
 *  5. the latest completed one, as a fallback so the page is never blank.
 * Cancelled / no-show / locally-dismissed rows are skipped.
 */
export function pickActive(
  list: ShiftAssignmentRecord[],
  dismissed: Set<string>,
): ShiftAssignmentRecord | null {
  const open = list.filter(
    (a) =>
      !dismissed.has(a.id) &&
      a.status !== 'cancelled' &&
      a.status !== 'no_show' &&
      // Excused via approved MC/leave — never today's active shift.
      a.status !== 'leave_approved',
  );
  const today = localDateKey(new Date());

  // A shift dated in the future can't be "on duty" today — you check in when it
  // actually starts. Guarding on shiftDate stops tomorrow's booked shift (with a
  // stray check-in) from hijacking Check-In before its day arrives.
  const onDuty = open.find((a) => a.checkInAt && !a.checkOutAt && a.shiftDate <= today);
  if (onDuty) return onDuty;

  // A fresh assignment for TONIGHT outranks this morning's check-out summary —
  // the agency re-booked the PR, so Check-In renews to the new shift. Strictly
  // today's date: tomorrow's booking must not evict the summary early.
  const bookedToday = open
    .filter((a) => !a.checkInAt && a.status !== 'completed' && a.shiftDate === today)
    .sort((a, b) => (a.slot ?? '').localeCompare(b.slot ?? ''));
  if (bookedToday.length) return bookedToday[0];

  // Keep the just-finished shift on screen while its check-out is fresh —
  // the rest of its day, or 12 h past a pre-midnight check-out.
  const completedToday = open
    .filter((a) => a.checkOutAt && checkOutFresh(a.checkOutAt))
    .sort((a, b) => (b.checkOutAt ?? '').localeCompare(a.checkOutAt ?? ''));
  if (completedToday.length) return completedToday[0];

  const booked = open
    .filter((a) => !a.checkInAt && a.status !== 'completed' && a.shiftDate >= today)
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
  /** The auto-picked shift, ignoring any focus override — "your current shift". */
  current: ShiftAssignmentRecord | null;
  phase: AttendancePhase;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Optimistically merge a stamped row (check-in/out) into the list. */
  patch: (updated: ShiftAssignmentRecord) => void;
  /** Hide a row from the active pick until the next reload (client-only cancel). */
  dismiss: (id: string) => void;
  /**
   * Pin Check-In to one specific assignment — the Today section's
   * "View summary" on an earlier same-day shift. null returns to auto-pick.
   */
  focus: (id: string | null) => void;
  focusedId: string | null;
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

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const focus = useCallback((id: string | null) => setFocusedId(id), []);

  const current = useMemo(() => pickActive(assignments, dismissed), [assignments, dismissed]);
  // A focus pin only holds while the row is still viewable: a completed shift's
  // summary stays reachable while its check-out is fresh, then the pin
  // silently falls back to the auto pick (so a stale summary can't hijack
  // Check-In days later).
  const active = useMemo(() => {
    if (!focusedId) return current;
    const row = assignments.find((a) => a.id === focusedId);
    const valid =
      row &&
      !dismissed.has(row.id) &&
      row.status !== 'cancelled' &&
      row.status !== 'no_show' &&
      row.status !== 'leave_approved' &&
      (!row.checkOutAt || checkOutFresh(row.checkOutAt));
    return valid ? row : current;
  }, [assignments, dismissed, focusedId, current]);
  const phase: AttendancePhase = active ? derivePhase(active) : 'idle';

  const value = useMemo<ActiveShiftState>(
    () => ({
      assignments,
      active,
      current,
      phase,
      loading,
      error,
      refresh,
      patch,
      dismiss,
      focus,
      focusedId,
    }),
    [assignments, active, current, phase, loading, error, refresh, patch, dismiss, focus, focusedId],
  );

  return <ActiveShiftContext.Provider value={value}>{children}</ActiveShiftContext.Provider>;
}

export function useActiveShift(): ActiveShiftState {
  const ctx = useContext(ActiveShiftContext);
  if (!ctx) throw new Error('useActiveShift must be used inside ActiveShiftProvider');
  return ctx;
}
