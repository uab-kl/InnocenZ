import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import {
	memberDisplayName,
	signerDisplayName,
} from "@agency-portal/lib/payroll-display";
import { useCallback, useMemo } from "react";
import { useOrgMembersQuery } from "./use-org-members";

/**
 * user id -> this agency's member name, or null.
 *
 * For the actor columns (`reviewed_by` on a receipt) that hold a USER id: the
 * receipt line printed it raw — "Reviewed by 9616d5be-…". The name comes from
 * the agency's own member list through `useOrgMembersQuery`, the SAME key the
 * Team panel and the approvals badge already hold, so it costs no request of
 * its own. Anyone outside the list (an admin, a system sweep) resolves to null
 * and the caller words it generically.
 */
export function useAgencyMemberName(): (
	userId: string | null | undefined,
) => string | null {
	const agencyId = useMemo(() => getAgencyIdentity()?.agencyId ?? null, []);
	const { data: members } = useOrgMembersQuery("agency", agencyId);
	return useCallback(
		(userId: string | null | undefined) => memberDisplayName(members, userId),
		[members],
	);
}

/**
 * A voucher's stored agency signer -> a person's NAME, or null.
 *
 * `finance_head_name` can hold an email or (on old rows) a user id — see
 * `signerDisplayName`. Same member list, same cache key, no request of its own.
 */
export function useAgencySignerName(): (
	stored: string | null | undefined,
) => string | null {
	const agencyId = useMemo(() => getAgencyIdentity()?.agencyId ?? null, []);
	const { data: members } = useOrgMembersQuery("agency", agencyId);
	return useCallback(
		(stored: string | null | undefined) => signerDisplayName(stored, members),
		[members],
	);
}
