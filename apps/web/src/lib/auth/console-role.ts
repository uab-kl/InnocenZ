/**
 * The role the ADMIN console names in its header and on the profile page.
 *
 * Both used to print `roles[0]` — the first of the account's role names from
 * `/auth/me`, which come in no particular order (28 Sep 2026 follow-up). An
 * admin who also holds a lane elsewhere read as that lane: on the test data
 * one admin holds `admin, Finance, Finance`, and could be titled "Finance" in
 * the console only `admin` can open.
 *
 * The admin tree admits the canonical `admin` role alone (`ensureAdminPortal`),
 * so that is the role it names — the stored spelling when the account has it,
 * "Admin" otherwise (the old default, for a profile not loaded yet).
 */
export function adminConsoleRoleName(
	roles: readonly string[] | null | undefined,
): string {
	return (
		roles?.find((role) => role.trim().toLowerCase() === "admin") ?? "Admin"
	);
}
