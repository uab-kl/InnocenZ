import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { AdminNotFoundPage } from "@/components/layout/admin-not-found";

function normalizePathname(pathname: string) {
	return pathname.replace(/^\/en/, "").replace(/\/$/, "") || "/";
}

export const Route = createFileRoute("/admin/business")({
	beforeLoad: ({ location }) => {
		if (normalizePathname(location.pathname) === "/business") {
			throw notFound();
		}
	},
	notFoundComponent: AdminNotFoundPage,
	component: BusinessLayout,
});

function BusinessLayout() {
	return <Outlet />;
}
