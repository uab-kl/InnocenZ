import { Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { PageHeader, PageShell } from "@/components/admin/page-header";
import { auditLogRoleLabel } from "@/components/audit-log/audit-log-role-copy";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { auditLogRoles } from "@/constants/audit-log-roles";
import { usePortalLocale } from "@/lib/portal-i18n/context";

export function AuditLogRolePicker() {
	const { t } = usePortalLocale();
	const gridRoles = auditLogRoles.slice(0, 4);
	const lastRole = auditLogRoles[4];
	const LastIcon = lastRole.icon;

	return (
		<PageShell>
			<PageHeader
				icon={FileText}
				title={t.admin.navAuditLog}
				description={t.adminAudit.pickerSubtitle}
			/>

			<Card className="mx-auto w-full max-w-4xl border-(--lavender-soft)/40 bg-card">
				<CardHeader className="text-center">
					<CardTitle>{t.adminAudit.chooseRole}</CardTitle>
					<CardDescription>{t.adminAudit.chooseRoleHint}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4 px-8 pb-10">
					<div className="grid grid-cols-2 gap-4">
						{gridRoles.map((role) => {
							const Icon = role.icon;
							return (
								<Button
									key={role.key}
									variant="outline"
									className="h-auto min-h-28 flex-col gap-3 px-6 py-8"
									asChild
								>
									<Link
										to="/admin/audit-log/$role"
										params={{ role: role.slug }}
									>
										<Icon className="h-6 w-6 text-lavender" />
										<span className="text-lg font-medium">
											{auditLogRoleLabel(role.key, role.label, t)}
										</span>
									</Link>
								</Button>
							);
						})}
					</div>

					<div className="flex justify-center pt-2">
						<Button
							variant="outline"
							className="h-auto min-h-28 w-[calc(50%-0.5rem)] flex-col gap-3 px-6 py-8"
							asChild
						>
							<Link
								to="/admin/audit-log/$role"
								params={{ role: lastRole.slug }}
							>
								<LastIcon className="h-6 w-6 text-lavender" />
								<span className="text-lg font-medium">
									{auditLogRoleLabel(lastRole.key, lastRole.label, t)}
								</span>
							</Link>
						</Button>
					</div>
				</CardContent>
			</Card>
		</PageShell>
	);
}
