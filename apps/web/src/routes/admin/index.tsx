import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * `/admin` ON ITS OWN HAD NOWHERE TO GO.
 *
 * `routes/admin/route.tsx` is a LAYOUT — it renders `AdminLayout`, whose job is
 * to draw the shell around an `<Outlet />`. With no index beneath it, the bare
 * path matched the layout and nothing else, so an admin landing on `/admin`
 * (a typed URL, a bookmark, a link that dropped its tail) got the sidebar and
 * header around an empty page. Not a 404 — `notFoundComponent` never fires,
 * because the layout matched — just a console that looks broken.
 *
 * Both other portals already have this: `routes/agency/index.tsx` and
 * `routes/outlet/index.tsx`. Admin was the one tree without it.
 *
 * Dashboard is the destination because it is the admin sidebar's first item and
 * what every other admin entry point already treats as home.
 */
export const Route = createFileRoute("/admin/")({
	beforeLoad: () => {
		throw redirect({ to: "/admin/dashboard" });
	},
});
