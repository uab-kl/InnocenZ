import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { AdminNotFoundPage } from "@/components/layout/admin-not-found";

function normalizePathname(pathname: string) {
	// The router de-localizes before matching (`rewrite.input: deLocalizeUrl` in
	// router.tsx), so the `/en` strip is already a no-op by the time this runs.
	// Kept because a direct, un-rewritten entry is still possible.
	return pathname.replace(/^\/en/, "").replace(/\/$/, "") || "/";
}

export const Route = createFileRoute("/admin/business")({
	beforeLoad: ({ location }) => {
		/*
		 * ⚠️ `/admin/business`, NOT `/business` — this guard could never fire.
		 *
		 * The route is `createFileRoute("/admin/business")` and the router hands
		 * `location.pathname` in already de-localized, so it reads
		 * `/admin/business`. Compared against `/business` the test was always
		 * false, so the bare parent rendered `<Outlet />` with no child matched —
		 * a blank page where the Not Found was meant to be.
		 */
		if (normalizePathname(location.pathname) === "/admin/business") {
			throw notFound();
		}
	},
	notFoundComponent: AdminNotFoundPage,
	component: BusinessLayout,
});

function BusinessLayout() {
	return <Outlet />;
}
