import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old public URL — keep so /en/privacy bookmarks still land on the policy. */
export const Route = createFileRoute("/privacy")({
	beforeLoad: () => {
		throw redirect({ to: "/policy" });
	},
});
