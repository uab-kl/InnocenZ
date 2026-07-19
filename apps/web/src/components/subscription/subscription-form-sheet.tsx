import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Check, CreditCard, Loader2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
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
import { useAuth } from "@/lib/auth-context";
import { cn, formatRoleLabel, getErrorMessage } from "@/lib/utils";
import { fetchRoles } from "@/services/rbac";
import type { RbacRole } from "@/services/rbac/types";
import type { Subscription } from "@/services/subscription";
import {
	type CreateSubscriptionInput,
	SubscriptionSchema,
} from "@/services/subscription";

type CoveragePeriod = "day" | "week" | "month" | "year";

const COVERAGE_PERIODS: Array<{ value: CoveragePeriod; label: string }> = [
	{ value: "day", label: "Daily" },
	{ value: "week", label: "Weekly" },
	{ value: "month", label: "Monthly" },
	{ value: "year", label: "Annually" },
];

// Coverage is stored as one free-text string on the plan (e.g. "5 PRs/day").
// The editor splits it into amount + unit + period so it can be driven by a
// number stepper and two dropdowns, then recomposes the same string on change.
function parseCoverage(raw: string): {
	amount: string;
	unit: string;
	period: CoveragePeriod;
} {
	const value = (raw ?? "").trim();
	const amount = value.match(/\d+/)?.[0] ?? "";
	const unit = /\bPV\b/i.test(value) ? "PV" : "PRs";
	let period: CoveragePeriod = "day";
	if (/week|weekly/i.test(value)) period = "week";
	else if (/month|monthly/i.test(value)) period = "month";
	else if (/year|annual/i.test(value)) period = "year";
	return { amount, unit, period };
}

function composeCoverage(
	amount: string,
	unit: string,
	period: CoveragePeriod,
): string {
	const trimmed = amount.trim();
	if (!trimmed) return "";
	return `${trimmed} ${unit}/${period}`;
}

interface SubscriptionFormSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: (input: CreateSubscriptionInput) => void;
	isSubmitting: boolean;
	error: Error | null;
	editTarget?: Subscription | null;
}

export function SubscriptionFormSheet({
	open,
	onOpenChange,
	onSubmit,
	isSubmitting,
	error,
	editTarget,
}: SubscriptionFormSheetProps) {
	const { logout } = useAuth();
	const isEditing = !!editTarget;
	const [roleRows, setRoleRows] = useState<string[]>([""]);

	const rolesQuery = useQuery({
		queryKey: ["rbac-roles", "subscription-form"],
		queryFn: () => fetchRoles({ status: "active", pageSize: 100 }, logout),
		enabled: open,
		staleTime: 60_000,
	});

	const form = useForm({
		defaultValues: {
			name: editTarget?.name ?? "",
			price: editTarget ? Number(editTarget.price) : 0,
			billingCycle: (editTarget?.billingCycle ?? "monthly") as
				| "weekly"
				| "monthly"
				| "annually",
			status: (editTarget?.status ?? "active") as "active" | "inactive",
			coverage: editTarget?.coverage ?? "",
			roleIds: editTarget?.roles.map((role) => role.id) ?? [],
		},
		onSubmit: async ({ value }) => {
			const parsed = SubscriptionSchema.safeParse(value);
			if (!parsed.success) return;
			onSubmit(parsed.data);
		},
	});

	useEffect(() => {
		if (!open) {
			form.reset();
			setRoleRows([""]);
			return;
		}

		const roleIds = editTarget?.roles.map((role) => role.id) ?? [];
		setRoleRows(roleIds.length > 0 ? roleIds : [""]);
		form.setFieldValue("name", editTarget?.name ?? "");
		form.setFieldValue("price", editTarget ? Number(editTarget.price) : 0);
		form.setFieldValue("billingCycle", editTarget?.billingCycle ?? "monthly");
		form.setFieldValue("status", editTarget?.status ?? "active");
		form.setFieldValue("coverage", editTarget?.coverage ?? "");
		form.setFieldValue("roleIds", roleIds);
	}, [open, editTarget]); // eslint-disable-line react-hooks/exhaustive-deps

	const syncRoleRows = (rows: string[]) => {
		setRoleRows(rows);
		form.setFieldValue("roleIds", rows.filter(Boolean));
	};

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen && isSubmitting) return;
		onOpenChange(nextOpen);
	};

	const availableRoles = rolesQuery.data?.data ?? [];

	return (
		<Sheet open={open} onOpenChange={handleOpenChange}>
			<SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl md:max-w-3xl lg:max-w-4xl">
				<SheetHeader className="shrink-0 border-b border-border">
					<div className="flex items-start gap-3 pr-8">
						<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-(--lavender-soft)/50 bg-(--lavender-soft)/20 text-lavender">
							<CreditCard className="h-5 w-5" />
						</div>
						<div className="space-y-1">
							<SheetTitle className="text-xl">
								{isEditing ? "Edit Plan" : "Create Plan"}
							</SheetTitle>
							<SheetDescription>
								{isEditing
									? "Update the plan details."
									: "Add a new plan for agencies."}
							</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				<form
					className="flex min-h-0 flex-1 flex-col overflow-hidden"
					onSubmit={(event) => {
						event.preventDefault();
						event.stopPropagation();
						form.handleSubmit();
					}}
				>
					<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
						<FieldGroup className="gap-4">
							<form.Field name="name">
								{(field) => {
									const isInvalid =
										field.state.meta.isTouched && !field.state.value.trim();
									return (
										<Field data-invalid={isInvalid}>
											<FieldLabel htmlFor="sub-name">Plan Name</FieldLabel>
											<Input
												id="sub-name"
												placeholder="e.g. Basic, Pro, Enterprise"
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												disabled={isSubmitting}
												aria-invalid={isInvalid}
											/>
											{isInvalid && (
												<FieldError
													errors={[{ message: "Plan name is required" }]}
												/>
											)}
										</Field>
									);
								}}
							</form.Field>

							<Field>
								<FieldLabel>Roles</FieldLabel>
								<p className="text-sm text-muted-foreground">
									Tap the roles that can use this plan.
								</p>
								{rolesQuery.isLoading ? (
									<div className="flex items-center gap-2 text-sm text-muted-foreground">
										<Loader2 className="h-4 w-4 animate-spin" />
										Loading roles...
									</div>
								) : rolesQuery.isError ? (
									<p className="text-sm text-destructive">
										Failed to load roles.
									</p>
								) : availableRoles.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										No active roles found.
									</p>
								) : (
									<SubscriptionRolePicker
										selected={roleRows.filter(Boolean)}
										availableRoles={availableRoles}
										disabled={isSubmitting}
										onChange={syncRoleRows}
									/>
								)}
							</Field>

							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<form.Field name="price">
									{(field) => {
										const isInvalid =
											field.state.meta.isTouched && field.state.value < 0;
										return (
											<Field data-invalid={isInvalid}>
												<FieldLabel htmlFor="sub-price">Price (RM)</FieldLabel>
												<Input
													id="sub-price"
													type="number"
													min="0"
													step="0.01"
													placeholder="0.00"
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) =>
														field.handleChange(Number(e.target.value))
													}
													disabled={isSubmitting}
													aria-invalid={isInvalid}
												/>
												{isInvalid && (
													<FieldError
														errors={[{ message: "Price must be 0 or more" }]}
													/>
												)}
											</Field>
										);
									}}
								</form.Field>

								<form.Field name="billingCycle">
									{(field) => (
										<Field>
											<FieldLabel htmlFor="sub-billing-cycle">
												Billing Cycle
											</FieldLabel>
											<Select
												value={field.state.value}
												onValueChange={(value) =>
													field.handleChange(
														value as "weekly" | "monthly" | "annually",
													)
												}
												disabled={isSubmitting}
											>
												<SelectTrigger id="sub-billing-cycle">
													<SelectValue placeholder="Select billing cycle" />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="weekly">Weekly</SelectItem>
													<SelectItem value="monthly">Monthly</SelectItem>
													<SelectItem value="annually">Annually</SelectItem>
												</SelectContent>
											</Select>
										</Field>
									)}
								</form.Field>
							</div>

							<form.Field name="coverage">
								{(field) => {
									const parts = parseCoverage(field.state.value);
									const update = (next: {
										amount?: string;
										unit?: string;
										period?: CoveragePeriod;
									}) => {
										field.handleChange(
											composeCoverage(
												next.amount ?? parts.amount,
												next.unit ?? parts.unit,
												next.period ?? parts.period,
											),
										);
									};
									return (
										<Field>
											<FieldLabel htmlFor="sub-coverage-amount">
												Coverage
											</FieldLabel>
											<div className="flex items-center gap-2">
												<Input
													id="sub-coverage-amount"
													type="number"
													min="0"
													step="1"
													inputMode="numeric"
													placeholder="0"
													className="w-20"
													value={parts.amount}
													onBlur={field.handleBlur}
													onChange={(e) => update({ amount: e.target.value })}
													disabled={isSubmitting}
													aria-label="Coverage amount"
												/>
												<Select
													value={parts.unit}
													onValueChange={(value) => update({ unit: value })}
													disabled={isSubmitting}
												>
													<SelectTrigger
														className="w-24"
														aria-label="Coverage unit"
													>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														<SelectItem value="PRs">PRs</SelectItem>
														<SelectItem value="PV">PV</SelectItem>
													</SelectContent>
												</Select>
												<span className="text-muted-foreground">/</span>
												<Select
													value={parts.period}
													onValueChange={(value) =>
														update({ period: value as CoveragePeriod })
													}
													disabled={isSubmitting}
												>
													<SelectTrigger
														className="w-36"
														aria-label="Coverage period"
													>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{COVERAGE_PERIODS.map((option) => (
															<SelectItem
																key={option.value}
																value={option.value}
															>
																{option.label}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>
											<p className="text-sm text-muted-foreground">
												{field.state.value ? (
													<>
														Shown on the plan as{" "}
														<span className="font-medium text-foreground">
															{field.state.value}
														</span>
														.
													</>
												) : (
													"Volume tier shown on the plan. Optional."
												)}
											</p>
										</Field>
									);
								}}
							</form.Field>

							<form.Field name="status">
								{(field) => (
									<Field>
										<div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
											<div className="space-y-1">
												<FieldLabel htmlFor="sub-status">
													Active Status
												</FieldLabel>
												<p className="text-sm text-muted-foreground">
													Set plan as active or inactive.
												</p>
											</div>
											<Switch
												id="sub-status"
												checked={field.state.value === "active"}
												onCheckedChange={(checked) =>
													field.handleChange(checked ? "active" : "inactive")
												}
												disabled={isSubmitting}
												aria-label="Toggle subscription active status"
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
					</div>

					<SheetFooter className="shrink-0 flex-row justify-end gap-2 border-t border-border">
						<Button
							type="button"
							variant="outline"
							onClick={() => handleOpenChange(false)}
							disabled={isSubmitting}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									{isEditing ? "Saving..." : "Creating..."}
								</>
							) : isEditing ? (
								"Save Changes"
							) : (
								"Create Plan"
							)}
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}

function SubscriptionRolePicker({
	selected,
	availableRoles,
	disabled,
	onChange,
}: {
	selected: string[];
	availableRoles: RbacRole[];
	disabled: boolean;
	onChange: (rows: string[]) => void;
}) {
	const toggle = (roleId: string) => {
		onChange(
			selected.includes(roleId)
				? selected.filter((id) => id !== roleId)
				: [...selected, roleId],
		);
	};

	return (
		<div className="flex flex-wrap gap-2">
			{availableRoles.map((role) => {
				const on = selected.includes(role.roleId);
				return (
					<button
						key={role.roleId}
						type="button"
						disabled={disabled}
						aria-pressed={on}
						onClick={() => toggle(role.roleId)}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
							on
								? "border-(--lavender-soft) bg-(--lavender-soft)/25 text-lavender"
								: "border-border text-muted-foreground hover:border-(--lavender-soft)/60 hover:text-foreground",
						)}
					>
						{on ? (
							<Check className="h-3.5 w-3.5" />
						) : (
							<Plus className="h-3.5 w-3.5" />
						)}
						{formatRoleLabel(role.roleName)}
					</button>
				);
			})}
		</div>
	);
}
