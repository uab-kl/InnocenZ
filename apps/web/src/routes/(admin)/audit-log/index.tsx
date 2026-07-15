import { createFileRoute } from "@tanstack/react-router";
import { AuditLogRolePicker } from "@/components/audit-log";

export const Route = createFileRoute("/(admin)/audit-log/")({
	component: AuditLogIndexPage,
	head: () => ({
		meta: [
			{
				title: "Audit Log — Innocenz Admin",
			},
			{
				name: "description",
				content: "Choose a user role to view its audit log activity.",
			},
		],
	}),
});

function AuditLogIndexPage() {
	return <AuditLogRolePicker />;
}
