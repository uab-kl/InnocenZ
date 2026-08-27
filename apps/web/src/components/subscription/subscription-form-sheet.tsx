import { useForm } from "@tanstack/react-form";
import { AlertCircle, CreditCard, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { planAudienceLabel } from "@/components/subscription/plan-labels";
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
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import { getErrorMessage } from "@/lib/utils";
import type { Subscription } from "@/services/subscription";
import {
	type CreateSubscriptionInput,
	SubscriptionSchema,
} from "@/services/subscription";

type CoveragePeriod = "day" | "week" | "month" | "year";

// `value` is composed into the stored coverage string, so it stays English.
// `label` is a function because a module-scope map cannot read `t` — storing
// the resolved string here would freeze it at the locale of the first render.
const COVERAGE_PERIODS: Array<{
	value: CoveragePeriod;
	label: (t: PortalTranslations) => string;
}> = [
	{ value: "day", label: (t) => t.adminSubscription.periodDaily },
	{ value: "week", label: (t) => t.subscription.billedWeekly },
	{ value: "month", label: (t) => t.subscription.billedMonthly },
	{ value: "year", label: (t) => t.subscription.billedAnnually },
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
	const { t } = usePortalLocale();
	const isEditing = !!editTarget;

	const form = useForm({
		defaultValues: {
			name: editTarget?.name ?? "",
			price: editTarget ? Number(editTarget.price) : 0,
			billingCycle: (editTarget?.billingCycle ?? "monthly") as
				| "weekly"
				| "monthly"
				| "annually",
			subscriptionType: (editTarget?.subscriptionType ?? "outlet") as
				| "agency"
				| "outlet",
			status: (editTarget?.status ?? "active") as "active" | "inactive",
			coverage: editTarget?.coverage ?? "",
		},
		onSubmit: async ({ value }) => {
			const parsed = SubscriptionSchema.safeParse(value);
			if (!parsed.success) return;
			onSubmit(parsed.data);
		},
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies(form.reset): this effect re-seeds the sheet only when it opens or the edit target changes; keying it on the form API instead would re-run the reset while the user is typing and wipe their input.
	// biome-ignore lint/correctness/useExhaustiveDependencies(form.setFieldValue): same window — the field seeding is intentionally scoped to open/editTarget, not to the form API identity.
	useEffect(() => {
		if (!open) {
			form.reset();
			return;
		}

		form.setFieldValue("name", editTarget?.name ?? "");
		form.setFieldValue("price", editTarget ? Number(editTarget.price) : 0);
		form.setFieldValue("billingCycle", editTarget?.billingCycle ?? "monthly");
		form.setFieldValue(
			"subscriptionType",
			editTarget?.subscriptionType ?? "outlet",
		);
		form.setFieldValue("status", editTarget?.status ?? "active");
		form.setFieldValue("coverage", editTarget?.coverage ?? "");
	}, [open, editTarget]); // eslint-disable-line react-hooks/exhaustive-deps

	const handleOpenChange = (nextOpen: boolean) => {
		if (!nextOpen && isSubmitting) return;
		onOpenChange(nextOpen);
	};

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
								{isEditing
									? t.adminSubscription.editPlan
									: t.adminSubscription.createPlan}
							</SheetTitle>
							<SheetDescription>
								{isEditing
									? t.adminSubscription.editPlanHint
									: t.adminSubscription.createPlanHint}
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
											<FieldLabel htmlFor="sub-name">
												{t.adminSubscription.planName}
											</FieldLabel>
											<Input
												id="sub-name"
												placeholder={t.adminSubscription.planNamePlaceholder}
												value={field.state.value}
												onBlur={field.handleBlur}
												onChange={(e) => field.handleChange(e.target.value)}
												disabled={isSubmitting}
												aria-invalid={isInvalid}
											/>
											{isInvalid && (
												<FieldError
													errors={[
														{
															message: t.adminSubscription.planNameRequired,
														},
													]}
												/>
											)}
										</Field>
									);
								}}
							</form.Field>

							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								<form.Field name="price">
									{(field) => {
										const isInvalid =
											field.state.meta.isTouched && field.state.value < 0;
										return (
											<Field data-invalid={isInvalid}>
												<FieldLabel htmlFor="sub-price">
													{t.adminSubscription.colPrice}
												</FieldLabel>
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
														errors={[
															{ message: t.adminSubscription.priceMinimum },
														]}
													/>
												)}
											</Field>
										);
									}}
								</form.Field>

								<form.Field name="subscriptionType">
									{(field) => (
										<Field>
											<FieldLabel htmlFor="sub-audience">
												{t.adminSubscription.colAudience}
											</FieldLabel>
											<Select
												value={field.state.value}
												onValueChange={(value) =>
													field.handleChange(value as "agency" | "outlet")
												}
												disabled={isSubmitting}
											>
												<SelectTrigger id="sub-audience">
													<SelectValue
														placeholder={t.adminSubscription.selectAudience}
													/>
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="agency">
														{planAudienceLabel("agency", t)}
													</SelectItem>
													<SelectItem value="outlet">
														{planAudienceLabel("outlet", t)}
													</SelectItem>
												</SelectContent>
											</Select>
										</Field>
									)}
								</form.Field>

								<form.Field name="billingCycle">
									{(field) => (
										<Field>
											<FieldLabel htmlFor="sub-billing-cycle">
												{t.adminBusiness.colBillingCycle}
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
													<SelectValue
														placeholder={t.adminSubscription.selectBillingCycle}
													/>
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="weekly">
														{t.subscription.billedWeekly}
													</SelectItem>
													<SelectItem value="monthly">
														{t.subscription.billedMonthly}
													</SelectItem>
													<SelectItem value="annually">
														{t.subscription.billedAnnually}
													</SelectItem>
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
												{t.adminSubscription.colCoverage}
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
													aria-label={t.adminSubscription.coverageAmount}
												/>
												<Select
													value={parts.unit}
													onValueChange={(value) => update({ unit: value })}
													disabled={isSubmitting}
												>
													<SelectTrigger
														className="w-24"
														aria-label={t.adminSubscription.coverageUnit}
													>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{/* "PRs" and "PV" are composed into the stored
														    coverage string, so both the value and the
														    label stay English in every locale. */}
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
														aria-label={t.adminSubscription.coveragePeriod}
													>
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{COVERAGE_PERIODS.map((option) => (
															<SelectItem
																key={option.value}
																value={option.value}
															>
																{option.label(t)}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>
											<p className="text-sm text-muted-foreground">
												{field.state.value
													? fill(t.adminSubscription.shownOnPlanAs, {
															value: field.state.value,
														})
													: t.adminSubscription.coverageHint}
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
													{t.adminSubscription.activeStatus}
												</FieldLabel>
												<p className="text-sm text-muted-foreground">
													{t.adminSubscription.activeStatusHint}
												</p>
											</div>
											<Switch
												id="sub-status"
												checked={field.state.value === "active"}
												onCheckedChange={(checked) =>
													field.handleChange(checked ? "active" : "inactive")
												}
												disabled={isSubmitting}
												aria-label={t.adminSubscription.toggleActiveStatus}
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
							{t.common.cancel}
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									{isEditing ? t.common.saving : t.admin.creating}
								</>
							) : isEditing ? (
								t.adminSubscription.saveChanges
							) : (
								t.adminSubscription.createPlan
							)}
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
