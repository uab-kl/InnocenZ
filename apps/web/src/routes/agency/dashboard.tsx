import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Real logins land here via login.tsx's role redirect (`agency` -> /agency/dashboard).
 * The agency portal's real landing is the hub (index route), so forward there.
 */
export const Route = createFileRoute("/agency/dashboard")({
	beforeLoad: () => {
		throw redirect({ to: "/agency" });
	},
});
