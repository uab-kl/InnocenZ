/**
 * Outlet swaps addressed to the signed-in PR.
 *
 * There is no push transport in this app, so the request appearing in the PR's
 * To-do list IS the notification — the same philosophy as cancellations and
 * MC/leave. The list is fetched on mount and re-fetched after every answer.
 */
import { useCallback, useEffect, useState } from 'react';
import { useSession } from './session';
import {
  approveOutletSwap,
  declineOutletSwap,
  fetchMyOutletSwaps,
  type OutletSwapRecord,
} from './api';

export type OutletSwapsState = {
  /** Only the unanswered ones — what the PR is being asked to decide. */
  pending: OutletSwapRecord[];
  loading: boolean;
  /** The list could not be loaded at all. */
  error: string | null;
  /**
   * The server's reason for refusing the last answer — "That shift is now
   * fully staffed", "already been answered". Kept separate from `error` so a
   * refused approval does not read as a broken screen.
   */
  actionError: string | null;
  /** Swap id currently being answered, so only that card shows a spinner. */
  busyId: string | null;
  respond: (swapId: string, accept: boolean) => Promise<void>;
  refresh: () => Promise<void>;
};

export function useOutletSwaps(params?: {
  /** Called after an approval actually moves the roster, so the shift list reloads. */
  onChanged?: () => void;
}): OutletSwapsState {
  const onChanged = params?.onChanged;
  const { token } = useSession();
  const [pending, setPending] = useState<OutletSwapRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setPending([]);
      setLoading(false);
      return;
    }
    try {
      const list = await fetchMyOutletSwaps(token);
      setPending(list.filter((s) => s.status === 'pending_pr'));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your swap requests');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const respond = useCallback(
    async (swapId: string, accept: boolean) => {
      if (!token || busyId) return;
      setBusyId(swapId);
      setActionError(null);
      try {
        if (accept) {
          await approveOutletSwap(token, swapId);
          // Approval repointed the assignment — the shift list is now stale.
          onChanged?.();
        } else {
          await declineOutletSwap(token, swapId);
        }
        await refresh();
      } catch (e) {
        // A 409 here is expected, not a fault: the destination filled up or
        // the agency withdrew it. Re-fetch so the card reflects reality.
        setActionError(e instanceof Error ? e.message : 'Could not send your answer');
        await refresh();
      } finally {
        setBusyId(null);
      }
    },
    [token, busyId, refresh, onChanged],
  );

  return { pending, loading, error, actionError, busyId, respond, refresh };
}
