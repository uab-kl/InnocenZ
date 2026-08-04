import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Real logins land here via login.tsx's role redirect (`outlet` -> /outlet/dashboard).
 * The outlet portal's real landing is the hub (index route), so forward there.
 */
export const Route = createFileRoute("/outlet/dashboard")({
	beforeLoad: () => {
		throw redirect({ to: "/outlet" });
	},
});
