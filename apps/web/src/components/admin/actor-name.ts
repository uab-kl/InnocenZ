import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import { fetchUserById } from "@/services/user";

/** An actor stamp that is a real account id, rather than a service token. */
export const ACTOR_UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * WHO did it, as a reader sees it — never a raw id.
 *
 * `created_by` / `updated_by` / `reviewed_by` / `resolved_by` hold a user id,
 * and admin screens printed it ("Updated by 96cb6034…"), which tells an admin
 * deciding whether a change was legitimate nothing at all. In order:
 *
 *   * a name already resolved (a server join, or the account fetched below);
 *   * `gateway:<name>` — the payment gateway, by its own name;
 *   * an id with no name yet: "…" while it loads, "Unknown" once the account
 *     turns out not to exist;
 *   * anything else — `system`, and every service token a script or seed
 *     stamps (`seed-sample`, `seed-org-details`, `weekly-payout-job`,
 *     `member-signup`) — is "System". Those tokens are developer tags: they
 *     printed "Created by seed-sample" on an admin's screen (22 Oct 2026), which
 *     names a file nobody reading it has seen. What they share is that no
 *     person did it, and that is the one thing the reader needs.
 */
export function actorText(
	actor: string | null | undefined,
	resolvedName: string | null | undefined,
	t: PortalTranslations,
	isResolving = false,
): string {
	if (resolvedName?.trim()) return resolvedName;
	const raw = actor?.trim();
	if (!raw) return "—";
	if (raw.startsWith("gateway:")) return raw.slice("gateway:".length);
	if (ACTOR_UUID.test(raw))
		return isResolving ? "…" : t.adminUsers.actorUnknown;
	return t.adminUsers.actorSystem;
}

/**
 * `actorText` with the account looked up when only an id is known. Shares the
 * `["user", id]` cache key with the member page, so a name fetched once is not
 * fetched again. Pass `knownName` when the server already joined it.
 */
export function useActorName(
	actor: string | null | undefined,
	t: PortalTranslations,
	knownName?: string | null,
): string {
	const { logout } = useAuth();
	const id = actor?.trim() ?? "";
	const needsLookup = !knownName?.trim() && ACTOR_UUID.test(id);
	const userQuery = useQuery({
		queryKey: ["user", id],
		queryFn: () => fetchUserById(id, logout),
		enabled: needsLookup,
		staleTime: 5 * 60_000,
		retry: false,
	});
	const fetched = userQuery.data
		? userQuery.data.username || userQuery.data.profile?.fullName || null
		: null;
	return actorText(
		actor,
		knownName ?? fetched,
		t,
		needsLookup && userQuery.isLoading,
	);
}
