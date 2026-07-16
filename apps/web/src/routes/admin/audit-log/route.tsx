import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminNotFoundPage } from "@/components/layout/admin-not-found";

export const Route = createFileRoute("/admin/audit-log")({
	notFoundComponent: AdminNotFoundPage,
	component: AuditLogLayout,
});

function AuditLogLayout() {
	return <Outlet />;
}
