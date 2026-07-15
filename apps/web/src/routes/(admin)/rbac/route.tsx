import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AdminNotFoundPage } from "@/components/layout/admin-not-found";

export const Route = createFileRoute("/(admin)/rbac")({
	beforeLoad: ({ location }) => {
		const pathname = location.pathname.replace(/\/$/, "");
		if (pathname === "/rbac") {
			throw redirect({ to: "/rbac/role" });
		}
	},
	notFoundComponent: AdminNotFoundPage,
	component: RbacLayout,
});

function RbacLayout() {
	return <Outlet />;
}
