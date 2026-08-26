import { Box, Clock, Globe, Monitor, User as UserIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import {
	formatAuditDate,
	formatAuditEntity,
	formatRoleLabel,
	getAuditActionBadgeColor,
	truncateId,
} from "@/lib/utils";
import type { AuditLog } from "@/services/audit-log";

interface AuditLogDetailDialogProps {
	log: AuditLog | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

function formatValue(value: unknown) {
	if (value === null || value === undefined) return null;
	if (typeof value === "object") return JSON.stringify(value, null, 2);
	return String(value);
}

export function AuditLogDetailDialog({
	log,
	open,
	onOpenChange,
}: AuditLogDetailDialogProps) {
	const { t } = usePortalLocale();

	if (!log) return null;

	const changeKeys =
		log.oldData || log.newData
			? Object.keys({ ...(log.oldData ?? {}), ...(log.newData ?? {}) })
			: [];

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="max-h-[90vh] overflow-y-auto"
				style={{ maxWidth: "min(95vw, 1400px)" }}
			>
				<DialogHeader>
					<div className="flex items-center justify-between gap-4 pr-8">
						<div>
							<DialogTitle className="text-2xl">
								{t.adminAudit.detailTitle}
							</DialogTitle>
							<DialogDescription>
								{formatAuditEntity(log.entity)}
							</DialogDescription>
						</div>
						{/* The RECORDED action — reproduced verbatim, never translated. */}
						<Badge
							variant="outline"
							className={getAuditActionBadgeColor(log.action)}
						>
							{log.action}
						</Badge>
					</div>
				</DialogHeader>

				<ScrollArea className="max-h-[calc(90vh-8rem)] pr-4">
					<div className="space-y-6">
						<div className="grid grid-cols-2 gap-4 md:grid-cols-3">
							<Card className="border-(--lavender-soft)/40">
								<CardContent className="pt-6">
									<div className="flex items-center gap-2 mb-2">
										<Clock className="h-4 w-4 text-muted-foreground" />
										<span className="text-xs text-muted-foreground uppercase">
											{t.adminAudit.colTimestamp}
										</span>
									</div>
									<p className="text-lg font-semibold">
										{formatAuditDate(log.createdAt)}
									</p>
								</CardContent>
							</Card>

							<Card className="border-(--lavender-soft)/40">
								<CardContent className="pt-6">
									<div className="flex items-center gap-2 mb-2">
										<UserIcon className="h-4 w-4 text-muted-foreground" />
										<span className="text-xs text-muted-foreground uppercase">
											{t.adminAudit.colUser}
										</span>
									</div>
									<p className="text-lg font-semibold">
										{log.username ||
											(log.userId
												? truncateId(log.userId)
												: t.adminAudit.systemActor)}
									</p>
									{log.role && (
										<p className="text-sm text-muted-foreground mt-1 capitalize">
											{formatRoleLabel(log.role)}
										</p>
									)}
								</CardContent>
							</Card>

							<Card className="border-(--lavender-soft)/40">
								<CardContent className="pt-6">
									<div className="flex items-center gap-2 mb-2">
										<Box className="h-4 w-4 text-muted-foreground" />
										<span className="text-xs text-muted-foreground uppercase">
											{t.adminAudit.colTable}
										</span>
									</div>
									<p className="text-lg font-semibold">
										{formatAuditEntity(log.entity)}
									</p>
								</CardContent>
							</Card>

							<Card className="border-(--lavender-soft)/40">
								<CardContent className="pt-6">
									<div className="flex items-center gap-2 mb-2">
										<Globe className="h-4 w-4 text-muted-foreground" />
										<span className="text-xs text-muted-foreground uppercase">
											{t.adminAudit.colIpAddress}
										</span>
									</div>
									<p className="text-sm font-semibold font-mono">
										{log.ipAddress}
									</p>
								</CardContent>
							</Card>

							<Card className="border-(--lavender-soft)/40 md:col-span-2">
								<CardContent className="pt-6">
									<div className="flex items-center gap-2 mb-2">
										<Monitor className="h-4 w-4 text-muted-foreground" />
										<span className="text-xs text-muted-foreground uppercase">
											{t.adminAudit.colUserAgent}
										</span>
									</div>
									<p
										className="text-sm font-semibold truncate"
										title={log.userAgent}
									>
										{log.userAgent}
									</p>
								</CardContent>
							</Card>
						</div>

						<div>
							<h3 className="text-lg font-semibold mb-4">
								{t.adminAudit.changes}
							</h3>
							<div className="rounded-lg border border-(--lavender-soft)/30 overflow-x-auto">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>{t.adminAudit.colField}</TableHead>
											<TableHead>{t.adminAudit.colOldValue}</TableHead>
											<TableHead>{t.adminAudit.colNewValue}</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{changeKeys.length > 0 ? (
											changeKeys.map((key) => {
												const oldValue = log.oldData?.[key];
												const newValue = log.newData?.[key];
												const hasChanged =
													JSON.stringify(oldValue) !== JSON.stringify(newValue);

												return (
													<TableRow key={key}>
														{/* Column name and both values are RECORDED data. */}
														<TableCell>
															<div className="flex items-center gap-2">
																{hasChanged && (
																	<span className="h-2 w-2 rounded-full bg-orange-500" />
																)}
																<span className="font-medium">{key}</span>
															</div>
														</TableCell>
														<TableCell className="min-w-[200px] max-w-[300px]">
															{oldValue !== null && oldValue !== undefined ? (
																<span
																	className={
																		hasChanged
																			? "text-red-600 font-mono text-xs break-all"
																			: "font-mono text-xs break-all"
																	}
																>
																	{formatValue(oldValue)}
																</span>
															) : (
																<span className="text-muted-foreground italic">
																	null
																</span>
															)}
														</TableCell>
														<TableCell className="min-w-[200px] max-w-[300px]">
															{newValue !== null && newValue !== undefined ? (
																<span
																	className={
																		hasChanged
																			? "text-green-600 font-mono text-xs break-all"
																			: "font-mono text-xs break-all"
																	}
																>
																	{formatValue(newValue)}
																</span>
															) : (
																<span className="text-muted-foreground italic">
																	null
																</span>
															)}
														</TableCell>
													</TableRow>
												);
											})
										) : log.oldData ? (
											<TableRow>
												<TableCell
													colSpan={3}
													className="text-center text-muted-foreground"
												>
													{t.adminAudit.deletedEntityData}
												</TableCell>
											</TableRow>
										) : log.newData ? (
											<TableRow>
												<TableCell
													colSpan={3}
													className="text-center text-muted-foreground"
												>
													{t.adminAudit.createdEntityData}
												</TableCell>
											</TableRow>
										) : (
											<TableRow>
												<TableCell
													colSpan={3}
													className="text-center text-muted-foreground"
												>
													{t.adminAudit.noChangesData}
												</TableCell>
											</TableRow>
										)}
									</TableBody>
								</Table>
							</div>
						</div>
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
