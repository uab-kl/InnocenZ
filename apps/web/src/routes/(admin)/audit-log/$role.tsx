import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuditLogTableView } from "@/components/audit-log";
import {
	getAuditLogRoleBySlug,
	isAuditLogRoleSlug,
} from "@/constants/audit-log-roles";

export const Route = createFileRoute("/(admin)/audit-log/$role")({
	beforeLoad: ({ params }) => {
		if (!isAuditLogRoleSlug(params.role)) {
			throw redirect({ to: "/audit-log" });
		}
	},
	component: AuditLogRolePage,
	head: ({ params }) => {
		const roleMeta = getAuditLogRoleBySlug(params.role);
		return {
			meta: [
				{
					title: `${roleMeta?.label ?? "Audit Log"} — Innocenz Admin`,
				},
			],
		};
	},
});

function AuditLogRolePage() {
	const { role: roleSlug } = Route.useParams();
	const roleMeta = getAuditLogRoleBySlug(roleSlug)!;
	return <AuditLogTableView role={roleMeta.key} />;
}
