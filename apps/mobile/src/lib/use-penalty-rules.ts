/**
 * The penalty rules this PR is charged by, read once per session.
 *
 * Shared by the two places that price a cancellation — the Agency schedule and
 * the Check-In cancel sheet — so they can never disagree about whose rules
 * apply. `null` until the answer arrives, and after a failure: callers show the
 * defaults then, which is what the app always did (`cancellationBandsForAgency`).
 */
import { useEffect, useState } from 'react';
import { getMyPenaltyRules, type PenaltyRuleRecord } from './api';
import { useSession } from './session';

export function useMyPenaltyRules(): PenaltyRuleRecord[] | null {
  const { token } = useSession();
  const [rules, setRules] = useState<PenaltyRuleRecord[] | null>(null);

  useEffect(() => {
    if (!token) {
      setRules(null);
      return;
    }
    let cancelled = false;
    getMyPenaltyRules(token)
      .then((next) => {
        if (!cancelled) setRules(next);
      })
      .catch(() => {
        /* stay null — the defaults, rather than a blank price */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return rules;
}
