import { useAgencyPrs } from "@agency-portal/hooks/use-agency-prs";
import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import { useStore } from "@agency-portal/lib/store";
import { useMemo } from "react";

/**
 * The roster a voucher screen finds its PR in: the SERVER's — the one Manage PR
 * reads (`useAgencyPrs`, agency-scoped by the API).
 *
 * The Payroll page used the store's `agencyPRs`, which on a real session does
 * not hold the agency's PRs, so the lookup by the voucher's `prId` always
 * missed and the card fell back to the voucher's copied IC. Live, 29 Sep 2026:
 * Vicky's profile IC was corrected on 8 Sep, and every voucher written before
 * that printed the old one (and a payee code built from it) while Manage PR
 * printed the new one. The store roster stays the fallback for a demo session,
 * whose server roster is empty.
 */
export function useVoucherRoster(): AgencyManagedPR[] {
	const { prs } = useAgencyPrs();
	const storePrs = useStore((s) => s.agencyPRs);
	return useMemo(() => (prs.length > 0 ? prs : storePrs), [prs, storePrs]);
}
