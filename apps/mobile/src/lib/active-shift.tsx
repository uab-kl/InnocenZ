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
import { useLocale } from '../i18n';

// The pick rules live in a pure module so they can be tested — this file pulls
// in react-native, whose Flow source vitest cannot parse. Imported for local
// use AND re-exported, so every existing importer of `active-shift` keeps
// working unchanged.
import {
  type AttendancePhase,
  checkOutFresh,
  derivePhase,
  pickActive,
} from './pick-active-shift';

export {
  type AttendancePhase,
  checkOutFresh,
  derivePhase,
  localDateKey,
  pickActive,
} from './pick-active-shift';

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
  const { t } = useLocale();
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
      setError(e instanceof Error ? e.message : t.shiftLib.loadShiftFailed);
    } finally {
      setLoading(false);
    }
  }, [token, t]);

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
