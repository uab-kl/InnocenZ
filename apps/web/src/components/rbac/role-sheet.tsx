import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Key, Loader2, Shield } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { getErrorMessage } from "@/lib/utils";
import {
	type CreateRoleInput,
	fetchModules,
	fetchPermissions,
	fetchPortals,
	fetchRolePermissions,
	type PermissionType,
	type RbacPermission,
	type RbacRole,
	RoleSchema,
} from "@/services/rbac";

const CRU: PermissionType[] = ["create", "read", "update"];
const CRU_LABEL: Record<PermissionType, string> = {
	create: "C",
	read: "R",
	update: "U",
};

interface RoleSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mode: "create" | "manage";
	role?: RbacRole | null;
	onCreate: (input: CreateRoleInput) => void;
	onSaveManage: (input: CreateRoleInput, permissionIds: string[]) => void;
	isSubmitting: boolean;
	error: Error | null;
	onRefreshFail: () => void;
}

export function RoleSheet({
	open,
	onOpenChange,
	mode,
	role,
	onCreate,
	onSaveManage,
	isSubmitting,
	error,
	onRefreshFail,
}: RoleSheetProps) {
	const { t } = usePortalLocale();
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [portalId, setPortalId] = useState("");
	const matrixIdsRef = useRef({
		selectedIds: new Set<string>(),
		portalPermissionIds: new Set<string>(),
	});

	const isManage = mode === "manage";
	const isBusy = isSubmitting;

	const form = useForm({
		defaultValues: {
			roleName: "",
			portalId: "" as string,
			status: "active" as "active" | "inactive",
		},
		validators: {
			onChange: RoleSchema,
			onSubmit: RoleSchema,
		},
		onSubmit: async ({ value }) => {
			const payload = {
				...value,
				portalId: value.portalId || portalId || null,
			};
			if (isManage) {
				const { selectedIds: ids, portalPermissionIds: allowed } =
					matrixIdsRef.current;
				onSaveManage(
					payload,
					[...ids].filter((id) => allowed.has(id)),
				);
				return;
			}
			onCreate(payload);
		},
	});

	const portalsQuery = useQuery({
		queryKey: ["rbac-portals"],
		queryFn: () => fetchPortals(onRefreshFail),
		enabled: open,
		staleTime: 60_000,
	});

	const effectivePortalId =
		portalId || form.state.values.portalId || role?.portalId || "";

	const effectivePortalCode = useMemo(() => {
		if (role?.portalCode) return role.portalCode;
		const portals = portalsQuery.data ?? [];
		const match = portals.find((p) => p.id === effectivePortalId);
		return match?.code ?? null;
	}, [role?.portalCode, portalsQuery.data, effectivePortalId]);

	const modulesQuery = useQuery({
		queryKey: ["rbac-modules", "all-active"],
		queryFn: () =>
			fetchModules({ status: "active", pageSize: 500 }, onRefreshFail),
		enabled: open && isManage,
		staleTime: 60_000,
	});

	const permissionsQuery = useQuery({
		queryKey: ["rbac-permissions", "all-active"],
		queryFn: () =>
			fetchPermissions({ status: "active", pageSize: 500 }, onRefreshFail),
		enabled: open && isManage,
		staleTime: 60_000,
	});

	const rolePermissionsQuery = useQuery({
		queryKey: ["rbac-role-permissions", role?.roleId],
		queryFn: () => fetchRolePermissions(role!.roleId, onRefreshFail),
		enabled: open && isManage && !!role,
		staleTime: 30_000,
	});

	useEffect(() => {
		if (!open) return;
		form.reset();
		// Never carry one role's matrix into another: without this reset, opening
		// role A then role B and pressing Save posted A's permission ids onto B —
		// the seeding effect below only OVERWRITES when its queries succeed, so
		// stale ids survived every failed or slow load.
		setSelectedIds(new Set());
		if (isManage && role) {
			form.setFieldValue("roleName", role.roleName);
			form.setFieldValue("portalId", role.portalId ?? "");
			form.setFieldValue("status", role.status);
			setPortalId(role.portalId ?? "");
		} else {
			setPortalId("");
		}
	}, [open, isManage, role, form]);

	/** Modules for this role's portal only — never mix portals in the matrix. */
	const portalModules = useMemo(() => {
		const all = modulesQuery.data?.data ?? [];
		if (effectivePortalId) {
			return all.filter((m) => m.portalId === effectivePortalId);
		}
		if (effectivePortalCode) {
			return all.filter((m) => m.portalCode === effectivePortalCode);
		}
		return [];
	}, [modulesQuery.data, effectivePortalId, effectivePortalCode]);

	/** moduleId → permissionType → permission row (portal-scoped) */
	const permByModuleType = useMemo(() => {
		const map = new Map<string, Map<PermissionType, RbacPermission>>();
		const allowedModuleIds = new Set(portalModules.map((m) => m.moduleId));
		for (const p of permissionsQuery.data?.data ?? []) {
			if (!allowedModuleIds.has(p.moduleId)) continue;
			const row = map.get(p.moduleId) ?? new Map();
			row.set(p.permissionType, p);
			map.set(p.moduleId, row);
		}
		return map;
	}, [permissionsQuery.data, portalModules]);

	const portalPermissionIds = useMemo(() => {
		const ids = new Set<string>();
		for (const types of permByModuleType.values()) {
			for (const p of types.values()) ids.add(p.permissionId);
		}
		return ids;
	}, [permByModuleType]);

	useEffect(() => {
		if (!open || !isManage || !rolePermissionsQuery.data) return;
		// Wait until modules are loaded so we don't flash cross-portal grants.
		if (modulesQuery.isLoading || !modulesQuery.data) return;
		const granted = rolePermissionsQuery.data.data.map(
			(item) => item.permissionId,
		);
		setSelectedIds(
			new Set(granted.filter((id) => portalPermissionIds.has(id))),
		);
	}, [
		open,
		isManage,
		rolePermissionsQuery.data,
		portalPermissionIds,
		modulesQuery.isLoading,
		modulesQuery.data,
	]);

	const togglePermission = (permissionId: string, checked: boolean) => {
		setSelectedIds((current) => {
			const next = new Set(current);
			if (checked) next.add(permissionId);
			else next.delete(permissionId);
			return next;
		});
	};

	const toggleModuleRow = (moduleId: string, checked: boolean) => {
		const types = permByModuleType.get(moduleId);
		if (!types) return;
		setSelectedIds((current) => {
			const next = new Set(current);
			for (const p of types.values()) {
				if (checked) next.add(p.permissionId);
				else next.delete(p.permissionId);
			}
			return next;
		});
	};

	const handlePortalChange = (nextPortalId: string) => {
		setPortalId(nextPortalId);
		form.setFieldValue("portalId", nextPortalId);
		setSelectedIds(new Set());
	};

	const permissionsLoading =
		modulesQuery.isLoading ||
		permissionsQuery.isLoading ||
		rolePermissionsQuery.isLoading;

	const permissionsError =
		modulesQuery.error ?? permissionsQuery.error ?? rolePermissionsQuery.error;

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen && isBusy) return;
		onOpenChange(nextOpen);
	};

	matrixIdsRef.current = { selectedIds, portalPermissionIds };

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
			<SheetContent className="flex w-full flex-col sm:max-w-2xl md:max-w-3xl lg:max-w-4xl">
				<SheetHeader className="border-b border-border pb-4">
					<div className="flex items-start gap-3 pr-8">
						<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
							<Shield className="h-5 w-5" />
						</div>
						<div className="space-y-1">
							<SheetTitle className="text-xl">
								{isManage ? t.rbac.manageRole : t.rbac.createRole}
							</SheetTitle>
							<SheetDescription>
								{isManage ? t.rbac.manageRoleHint : t.rbac.createRoleHint}
							</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				<form
					className="flex min-h-0 flex-1 flex-col"
					onSubmit={(event) => {
						event.preventDefault();
						event.stopPropagation();
						form.handleSubmit();
					}}
				>
					<ScrollArea className="flex-1 px-4 py-6">
						<FieldGroup className="gap-6">
							<form.Field name="roleName">
								{(field) => {
									const isInvalid =
										field.state.meta.isTouched && !field.state.meta.isValid;
									return (
										<Field data-invalid={isInvalid}>
											<FieldLabel htmlFor="role-name">
												{t.rbac.roleName}
											</FieldLabel>
											<Input
												id="role-name"
												placeholder={t.rbac.enterRoleName}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(event) =>
													field.handleChange(event.target.value)
												}
												disabled={isBusy}
												aria-invalid={isInvalid}
											/>
											{isInvalid && (
												<FieldError errors={field.state.meta.errors} />
											)}
										</Field>
									);
								}}
							</form.Field>

							<form.Field name="portalId">
								{(field) => (
									<Field>
										<FieldLabel htmlFor="role-portal">
											{t.rbac.colPortal}
										</FieldLabel>
										<Select
											value={field.state.value || portalId || undefined}
											onValueChange={handlePortalChange}
											disabled={isBusy || portalsQuery.isLoading}
										>
											<SelectTrigger id="role-portal" className="w-full">
												<SelectValue placeholder={t.rbac.selectPortal} />
											</SelectTrigger>
											<SelectContent>
												{(portalsQuery.data ?? []).map((p) => (
													<SelectItem key={p.id} value={p.id}>
														{p.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</Field>
								)}
							</form.Field>

							<form.Field name="status">
								{(field) => (
									<Field>
										<div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
											<div className="space-y-1">
												<FieldLabel htmlFor="role-status">
													{t.rbac.statusActive}
												</FieldLabel>
												<p className="text-sm text-muted-foreground">
													{t.rbac.inactiveNoAccess}
												</p>
											</div>
											<Switch
												id="role-status"
												checked={field.state.value === "active"}
												onCheckedChange={(checked) =>
													field.handleChange(checked ? "active" : "inactive")
												}
												disabled={isBusy}
											/>
										</div>
									</Field>
								)}
							</form.Field>

							{isManage && (
								<>
									<Separator />
									<div className="space-y-3">
										<div className="flex items-center justify-between gap-2">
											<div className="flex items-center gap-2">
												<Key className="h-4 w-4 text-emerald-500" />
												<h3 className="text-sm font-semibold">
													{t.rbac.modulePermissions}
												</h3>
											</div>
											<div className="flex gap-1.5 text-xs text-muted-foreground">
												<Badge variant="outline">{t.rbac.cCreate}</Badge>
												<Badge variant="outline">{t.rbac.rRead}</Badge>
												<Badge variant="outline">{t.rbac.uUpdate}</Badge>
											</div>
										</div>

										{permissionsLoading ? (
											<div className="flex min-h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
												<Loader2 className="h-5 w-5 animate-spin" />
												<span className="text-sm">{t.rbac.loadingMatrix}</span>
											</div>
										) : permissionsError ? (
											<div className="flex min-h-32 flex-col items-center justify-center gap-2 text-destructive">
												<AlertCircle className="h-5 w-5" />
												<span className="text-sm text-center">
													{getErrorMessage(permissionsError)}
												</span>
											</div>
										) : !effectivePortalId && !effectivePortalCode ? (
											<p className="text-sm text-muted-foreground">
												{t.rbac.selectPortalToSeeModules}
											</p>
										) : portalModules.length === 0 ? (
											<p className="text-sm text-muted-foreground">
												{t.rbac.noModulesForPortal}
											</p>
										) : (
											<div className="overflow-x-auto rounded-lg border border-border">
												<Table>
													<TableHeader>
														<TableRow>
															<TableHead className="min-w-40">
																{t.rbac.colModule}
															</TableHead>
															{CRU.map((type) => (
																<TableHead
																	key={type}
																	className="w-16 text-center"
																>
																	{CRU_LABEL[type]}
																</TableHead>
															))}
															<TableHead className="w-16 text-center">
																{t.rbac.all}
															</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{portalModules.map((mod) => {
															const types =
																permByModuleType.get(mod.moduleId) ?? new Map();
															const ids = [...types.values()].map(
																(p) => p.permissionId,
															);
															const allOn =
																ids.length > 0 &&
																ids.every((id) => selectedIds.has(id));
															return (
																<TableRow key={mod.moduleId}>
																	<TableCell>
																		<div className="font-medium">
																			{mod.moduleName}
																		</div>
																		<div className="text-xs text-muted-foreground font-mono">
																			{mod.moduleKey}
																		</div>
																	</TableCell>
																	{CRU.map((type) => {
																		const perm = types.get(type);
																		return (
																			<TableCell
																				key={type}
																				className="text-center"
																			>
																				{perm ? (
																					<Checkbox
																						checked={selectedIds.has(
																							perm.permissionId,
																						)}
																						onCheckedChange={(
																							checked:
																								| boolean
																								| "indeterminate",
																						) =>
																							togglePermission(
																								perm.permissionId,
																								checked === true,
																							)
																						}
																						disabled={isBusy}
																						aria-label={`${mod.moduleName} ${t}`}
																					/>
																				) : (
																					<span className="text-muted-foreground">
																						—
																					</span>
																				)}
																			</TableCell>
																		);
																	})}
																	<TableCell className="text-center">
																		<Checkbox
																			checked={allOn}
																			onCheckedChange={(
																				checked: boolean | "indeterminate",
																			) =>
																				toggleModuleRow(
																					mod.moduleId,
																					checked === true,
																				)
																			}
																			disabled={isBusy || ids.length === 0}
																			aria-label={fill(t.rbac.allFor, {
																				name: mod.moduleName,
																			})}
																		/>
																	</TableCell>
																</TableRow>
															);
														})}
													</TableBody>
												</Table>
											</div>
										)}
									</div>
								</>
							)}

							{error && (
								<div
									className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive flex items-start gap-2"
									role="alert"
								>
									<AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
									<span>{getErrorMessage(error)}</span>
								</div>
							)}
						</FieldGroup>
					</ScrollArea>

					<SheetFooter className="flex-row justify-end gap-2 border-t border-border">
						<Button
							type="button"
							variant="outline"
							onClick={() => handleOpenChange(false)}
							disabled={isBusy}
						>
							{t.rbac.close}
						</Button>
						<Button
							type="submit"
							// A sheet that could not LOAD the matrix must not POST one:
							// with permissionsError unchecked, an admin who opened a role
							// just to rename it submitted the still-empty selectedIds, the
							// backend deleted every grant and answered 200, and the sheet
							// closed on a green "saved" — every holder of the role locked
							// out at once. An empty portal matrix (null portalId) is the
							// same wipe without even an error to show.
							disabled={
								isBusy ||
								(isManage &&
									(permissionsLoading ||
										!!permissionsError ||
										portalPermissionIds.size === 0))
							}
						>
							{isSubmitting ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									{t.rbac.savingEllipsis}
								</>
							) : isManage ? (
								t.rbac.save
							) : (
								t.rbac.create
							)}
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
