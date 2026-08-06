import { createFileRoute, redirect } from "@tanstack/react-router";

/** Permissions are seeded with each module (C/R/U). Manage grants on RBAC. */
export const Route = createFileRoute("/admin/rbac/permission")({
	beforeLoad: () => {
		throw redirect({ to: "/admin/rbac/role" });
	},
	component: () => null,
});
