import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { fetchAgencies } from "@/services/agency";
import { fetchOutlets } from "@/services/outlet";

export type OrgKind = "agency" | "outlet";

/** `agency:<id>` / `outlet:<id>` → the organisation's name TODAY. */
export type OrgNameMap = ReadonlyMap<string, string>;

export function orgNameKey(kind: OrgKind, id: string): string {
	return `${kind}:${id}`;
}

export function buildOrgNameMap(
	agencies: ReadonlyArray<{ id: string; name: string }>,
	outlets: ReadonlyArray<{ id: string; name: string }>,
): OrgNameMap {
	const map = new Map<string, string>();
	for (const agency of agencies) {
		if (agency.name?.trim())
			map.set(orgNameKey("agency", agency.id), agency.name);
	}
	for (const outlet of outlets) {
		if (outlet.name?.trim())
			map.set(orgNameKey("outlet", outlet.id), outlet.name);
	}
	return map;
}

/**
 * The CURRENT name of an organisation, from the org's own row.
 *
 * `admin_request.subscriber_name` and `member_subscription.subscriber_name` are
 * copies written when the row was opened, so a venue renamed since ("Emhub
 * Testing" → "UAB Emhub") kept its old name on every billing screen while the
 * invoice sheet — which reads the org — showed the new one. One fact, one
 * place: the org row wins, and the stored copy is only the fallback for an
 * organisation the list does not hold (removed, or not loaded yet).
 */
export function currentOrgName(
	names: OrgNameMap,
	kind: OrgKind | null | undefined,
	id: string | null | undefined,
	stored: string | null | undefined,
): string {
	if (kind && id) {
		const live = names.get(orgNameKey(kind, id));
		if (live) return live;
	}
	return stored ?? "";
}

/**
 * Every agency and venue, keyed for `currentOrgName`. Shares its query keys
 * with Current Plan's coverage list, so the pages hold one cached copy. Admin
 * receives every status from both lists, so a deactivated org still resolves.
 */
export function useCurrentOrgNames(): OrgNameMap {
	const { logout } = useAuth();
	const outletsQuery = useQuery({
		queryKey: ["outlets", "history-coverage"],
		// EVERY page: the server clamps pageSize to 100, so one 200-row ask kept
		// any org past the first hundred on its stale stored name.
		queryFn: () =>
			fetchAllPages((page) => fetchOutlets({ page, pageSize: 100 }, logout)),
		staleTime: 60_000,
	});
	const agenciesQuery = useQuery({
		queryKey: ["agencies", "history-coverage"],
		queryFn: () =>
			fetchAllPages((page) => fetchAgencies({ page, pageSize: 100 }, logout)),
		staleTime: 60_000,
	});
	return useMemo(
		() =>
			buildOrgNameMap(
				agenciesQuery.data?.data ?? [],
				outletsQuery.data?.data ?? [],
			),
		[agenciesQuery.data, outletsQuery.data],
	);
}
