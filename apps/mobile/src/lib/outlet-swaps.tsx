/**
 * Outlet swaps addressed to the signed-in PR.
 *
 * There is no push transport in this app, so the request appearing in the PR's
 * To-do list IS the notification — the same philosophy as cancellations and
 * MC/leave. The list is fetched on mount and re-fetched after every answer.
 */
import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '../i18n';
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
  /**
   * The swap WORKED, but the venue it moved you to is tight against another shift
   * you hold — "which leaves 20 min to get between the two". Its own field, not
   * folded into `actionError`: one says the move failed, the other says it landed
   * and to plan the journey. Null when the roster is comfortable, and null too when
   * a venue has no map pin, since nothing can be measured then.
   */
  travelWarning: string | null;
  /** Swap id currently being answered, so only that card shows a spinner. */
  busyId: string | null;
  respond: (swapId: string, accept: boolean) => Promise<void>;
  refresh: () => Promise<void>;
};

export function useOutletSwaps(params?: {
  /** Called after an approval actually moves the roster, so the shift list reloads. */
  onChanged?: () => void;
}): OutletSwapsState {
  const { t } = useLocale();
  const onChanged = params?.onChanged;
  const { token } = useSession();
  const [pending, setPending] = useState<OutletSwapRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [travelWarning, setTravelWarning] = useState<string | null>(null);
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
      // A real server message is shown raw (backend English); only the
      // fallback for a non-Error throw is ours to translate.
      setError(e instanceof Error ? e.message : t.swaps.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const respond = useCallback(
    async (swapId: string, accept: boolean) => {
      if (!token || busyId) return;
      setBusyId(swapId);
      setActionError(null);
      // Cleared on every answer: a warning about the LAST swap, left on screen
      // beside a new one, reads as being about the new one.
      setTravelWarning(null);
      try {
        if (accept) {
          const { travelWarning } = await approveOutletSwap(token, swapId);
          // The swap SUCCEEDED — this is a caution, not an error, and it is kept
          // apart from `actionError` for exactly that reason. It must not send
          // anyone back to the card thinking the move failed.
          setTravelWarning(travelWarning);
          // Approval repointed the assignment — the shift list is now stale.
          onChanged?.();
        } else {
          await declineOutletSwap(token, swapId);
        }
        await refresh();
      } catch (e) {
        // A 409 here is expected, not a fault: the destination filled up or
        // the agency withdrew it. Re-fetch so the card reflects reality.
        setActionError(e instanceof Error ? e.message : t.swaps.respondFailed);
        await refresh();
      } finally {
        setBusyId(null);
      }
    },
    [token, busyId, refresh, onChanged, t],
  );

  return { pending, loading, error, actionError, travelWarning, busyId, respond, refresh };
}
