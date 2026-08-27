import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, LayoutGrid, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { kickToLogin } from "@/lib/auth/guards";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { getErrorMessage } from "@/lib/utils";
import {
	type CreateModuleInput,
	fetchPortals,
	ModuleSchema,
	type RbacModule,
} from "@/services/rbac";

interface ModuleFormSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mode: "create" | "edit";
	module?: RbacModule | null;
	onSubmit: (input: CreateModuleInput) => void;
	isSubmitting: boolean;
	error: Error | null;
}

export function ModuleFormSheet({
	open,
	onOpenChange,
	mode,
	module,
	onSubmit,
	isSubmitting,
	error,
}: ModuleFormSheetProps) {
	const { t } = usePortalLocale();
	const portalsQuery = useQuery({
		queryKey: ["rbac-portals"],
		queryFn: () => fetchPortals(kickToLogin),
		enabled: open,
		staleTime: 60_000,
	});

	const form = useForm({
		defaultValues: {
			moduleName: "",
			moduleKey: "",
			portalId: "" as string,
			status: "active" as "active" | "inactive",
		},
		validators: {
			onChange: ModuleSchema,
			onSubmit: ModuleSchema,
		},
		onSubmit: async ({ value }) => {
			onSubmit({
				...value,
				portalId: value.portalId || null,
				moduleKey:
					value.moduleKey ||
					value.moduleName.toLowerCase().replace(/\s+/g, "_"),
			});
		},
	});

	useEffect(() => {
		if (open) {
			form.reset();
			if (mode === "edit" && module) {
				form.setFieldValue("moduleName", module.moduleName);
				form.setFieldValue("moduleKey", module.moduleKey);
				form.setFieldValue("portalId", module.portalId ?? "");
				form.setFieldValue("status", module.status);
			}
		}
	}, [open, mode, module, form]);

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen && isSubmitting) return;
		onOpenChange(nextOpen);
	};

	const isEdit = mode === "edit";

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
			<SheetContent className="flex w-full flex-col sm:max-w-2xl md:max-w-3xl lg:max-w-4xl">
				<SheetHeader className="border-b border-border pb-4">
					<div className="flex items-start gap-3 pr-8">
						<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-(--lavender-soft)/50 bg-(--lavender-soft)/20 text-lavender">
							<LayoutGrid className="h-5 w-5" />
						</div>
						<div className="space-y-1">
							<SheetTitle className="text-xl">
								{isEdit ? t.rbac.editModule : t.rbac.createModule}
							</SheetTitle>
							<SheetDescription>
								{isEdit ? t.rbac.editModuleHint : t.rbac.createModuleHint}
							</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				<form
					className="flex flex-1 flex-col"
					onSubmit={(event) => {
						event.preventDefault();
						event.stopPropagation();
						form.handleSubmit();
					}}
				>
					<FieldGroup className="flex-1 gap-6 px-4 py-6">
						<form.Field name="moduleName">
							{(field) => {
								const isInvalid =
									field.state.meta.isTouched && !field.state.meta.isValid;

								return (
									<Field data-invalid={isInvalid}>
										<FieldLabel htmlFor="module-name">
											{t.rbac.moduleName}
										</FieldLabel>
										<Input
											id="module-name"
											placeholder={t.rbac.enterModuleName}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) => {
												field.handleChange(event.target.value);
												if (!isEdit) {
													form.setFieldValue(
														"moduleKey",
														event.target.value
															.toLowerCase()
															.replace(/\s+/g, "_"),
													);
												}
											}}
											disabled={isSubmitting}
											aria-invalid={isInvalid}
										/>
										{isInvalid && (
											<FieldError errors={field.state.meta.errors} />
										)}
									</Field>
								);
							}}
						</form.Field>

						<form.Field name="moduleKey">
							{(field) => {
								const isInvalid =
									field.state.meta.isTouched && !field.state.meta.isValid;
								return (
									<Field data-invalid={isInvalid}>
										<FieldLabel htmlFor="module-key">
											{t.rbac.moduleKey}
										</FieldLabel>
										<Input
											id="module-key"
											placeholder={t.adminBits.moduleKeyPlaceholder}
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
											disabled={isSubmitting}
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
									<FieldLabel htmlFor="module-portal">
										{t.rbac.colPortal}
									</FieldLabel>
									<Select
										value={field.state.value || undefined}
										onValueChange={(v) => field.handleChange(v)}
										disabled={isSubmitting || portalsQuery.isLoading}
									>
										<SelectTrigger id="module-portal" className="w-full">
											<SelectValue placeholder={t.rbac.selectPortal} />
										</SelectTrigger>
										<SelectContent>
											{(portalsQuery.data ?? []).map((p) => (
												<SelectItem key={p.id} value={p.id}>
													{p.name} ({p.code})
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
											<FieldLabel htmlFor="module-status">
												{t.rbac.activeStatus}
											</FieldLabel>
											<p className="text-sm text-muted-foreground">
												{t.adminBits.setModuleActiveHint}
											</p>
										</div>
										<Switch
											id="module-status"
											checked={field.state.value === "active"}
											onCheckedChange={(checked) =>
												field.handleChange(checked ? "active" : "inactive")
											}
											disabled={isSubmitting}
											aria-label={t.rbac.toggleModuleActive}
										/>
									</div>
								</Field>
							)}
						</form.Field>

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

					<SheetFooter className="flex-row justify-end gap-2 border-t border-border">
						<Button
							type="button"
							variant="outline"
							onClick={() => handleOpenChange(false)}
							disabled={isSubmitting}
						>
							{t.rbac.cancel}
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									{isEdit ? t.rbac.saving : t.rbac.creating}
								</>
							) : isEdit ? (
								t.rbac.saveChanges
							) : (
								t.rbac.createModule
							)}
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
