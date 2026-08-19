import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, PageShell } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import {
	fetchPlatformConfig,
	type UpdatePlatformConfigInput,
	updatePlatformConfig,
} from "@/services/platform-config";

export const Route = createFileRoute("/admin/settings")({
	component: SettingsComponent,
	head: () => ({
		meta: [{ title: "Settings — Innocenz Admin" }],
	}),
});

function SettingsComponent() {
	const { t } = usePortalLocale();
	return (
		<PageShell>
			<PageHeader
				title={t.admin.navSettings}
				description={t.admin.setSubtitle}
			/>

			<PlatformConfigCard />

			<Card>
				<CardHeader>
					<CardTitle>{t.admin.setEnvironment}</CardTitle>
					<CardDescription>{t.admin.setEnvironmentHint}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					<div className="flex justify-between gap-4 border-b pb-2">
						<span className="text-muted-foreground">{t.admin.setApiUrl}</span>
						<code>{import.meta.env.VITE_API_URL}</code>
					</div>
					<div className="flex justify-between gap-4">
						<span className="text-muted-foreground">GraphQL</span>
						<code>
							{import.meta.env.VITE_GRAPHQL_ENDPOINT ||
								`${import.meta.env.VITE_API_URL?.replace(/\/api$/, "")}/graphql`}
						</code>
					</div>
				</CardContent>
			</Card>
		</PageShell>
	);
}

const EMPTY_FORM = {
	platformFeePercent: "",
	geofenceRadiusMeters: "",
	subscriptionMonthlyFee: "",
	duplicatePaymentWindowHours: "",
	currency: "",
};

type FormErrors = Partial<Record<keyof typeof EMPTY_FORM, string>>;

const NUMERIC_FIELDS = [
	"platformFeePercent",
	"geofenceRadiusMeters",
	"subscriptionMonthlyFee",
	"duplicatePaymentWindowHours",
] as const;

// Guards only what the backend cannot: a blank field posts a real 0, and a
// non-numeric one posts NaN, which JSON turns into null and z.coerce.number()
// then coerces to 0 — so the fee is silently overwritten with 0.00 on a 200.
// Range/integer limits stay server-side (platform-config.controller.ts).
function validateForm(
	form: typeof EMPTY_FORM,
	t: PortalTranslations,
): FormErrors {
	const errors: FormErrors = {};
	for (const key of NUMERIC_FIELDS) {
		const raw = form[key].trim();
		if (raw === "") errors[key] = t.admin.setRequired;
		else if (!Number.isFinite(Number(raw)))
			errors[key] = t.admin.setEnterNumber;
	}
	if (form.currency.trim() === "") errors.currency = t.admin.setRequired;
	return errors;
}

function PlatformConfigCard() {
	const { t } = usePortalLocale();
	const { logout } = useAuth();
	const queryClient = useQueryClient();

	const configQuery = useQuery({
		queryKey: ["platform-config"],
		queryFn: () => fetchPlatformConfig(logout),
		staleTime: 30_000,
	});
	const config = configQuery.data?.data;

	const [form, setForm] = useState(EMPTY_FORM);
	const [errors, setErrors] = useState<FormErrors>({});

	useEffect(() => {
		if (config) {
			setForm({
				platformFeePercent: config.platformFeePercent,
				geofenceRadiusMeters: String(config.geofenceRadiusMeters),
				subscriptionMonthlyFee: config.subscriptionMonthlyFee,
				duplicatePaymentWindowHours: String(config.duplicatePaymentWindowHours),
				currency: config.currency,
			});
		}
	}, [config]);

	const updateMutation = useMutation({
		mutationFn: (input: UpdatePlatformConfigInput) =>
			updatePlatformConfig(input, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["platform-config"] });
			toast.success(response.message || t.admin.setUpdated);
		},
	});

	const mutationError = toMutationError(
		updateMutation.error,
		t.admin.setUpdateFailed,
	);

	function handleSubmit(event: FormEvent) {
		event.preventDefault();
		const nextErrors = validateForm(form, t);
		setErrors(nextErrors);
		if (Object.keys(nextErrors).length > 0) return;
		updateMutation.mutate({
			platformFeePercent: Number(form.platformFeePercent),
			geofenceRadiusMeters: Number(form.geofenceRadiusMeters),
			subscriptionMonthlyFee: Number(form.subscriptionMonthlyFee),
			duplicatePaymentWindowHours: Number(form.duplicatePaymentWindowHours),
			currency: form.currency.trim(),
		});
	}

	const setField = (key: keyof typeof EMPTY_FORM) => (value: string) => {
		setForm((prev) => ({ ...prev, [key]: value }));
		setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t.admin.setSystemConfig}</CardTitle>
				<CardDescription>{t.admin.setSystemConfigHint}</CardDescription>
			</CardHeader>
			<CardContent>
				{configQuery.isLoading ? (
					<div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
						<Loader2 className="h-4 w-4 animate-spin" />
						{t.admin.setLoadingConfig}
					</div>
				) : configQuery.isError ? (
					<p className="text-destructive text-sm py-4">
						{t.admin.setLoadFailed}
					</p>
				) : (
					<form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
						<div className="grid gap-4 sm:grid-cols-2">
							<ConfigField
								id="platformFeePercent"
								label={t.admin.setPlatformFee}
								type="number"
								step="0.01"
								value={form.platformFeePercent}
								onChange={setField("platformFeePercent")}
								error={errors.platformFeePercent}
							/>
							<ConfigField
								id="geofenceRadiusMeters"
								label={t.admin.setGeofenceRadius}
								type="number"
								value={form.geofenceRadiusMeters}
								onChange={setField("geofenceRadiusMeters")}
								error={errors.geofenceRadiusMeters}
							/>
							<ConfigField
								id="subscriptionMonthlyFee"
								label={t.admin.setSubscriptionFee}
								type="number"
								step="0.01"
								value={form.subscriptionMonthlyFee}
								onChange={setField("subscriptionMonthlyFee")}
								error={errors.subscriptionMonthlyFee}
							/>
							<ConfigField
								id="duplicatePaymentWindowHours"
								label={t.admin.setDuplicateWindow}
								type="number"
								value={form.duplicatePaymentWindowHours}
								onChange={setField("duplicatePaymentWindowHours")}
								error={errors.duplicatePaymentWindowHours}
							/>
							<ConfigField
								id="currency"
								label={t.admin.setCurrency}
								value={form.currency}
								onChange={setField("currency")}
								error={errors.currency}
							/>
						</div>

						{mutationError && (
							<p className="text-destructive text-sm">
								{mutationError.message}
							</p>
						)}

						<Button type="submit" disabled={updateMutation.isPending}>
							{updateMutation.isPending && (
								<Loader2 className="h-4 w-4 animate-spin" />
							)}
							{t.admin.setSaveChanges}
						</Button>
					</form>
				)}
			</CardContent>
		</Card>
	);
}

function ConfigField({
	id,
	label,
	value,
	onChange,
	type = "text",
	step,
	error,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	type?: string;
	step?: string;
	error?: string;
}) {
	return (
		<div className="space-y-1.5">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				type={type}
				step={step}
				value={value}
				aria-invalid={error ? true : undefined}
				aria-describedby={error ? `${id}-error` : undefined}
				onChange={(event) => onChange(event.target.value)}
			/>
			{error && (
				<p id={`${id}-error`} className="text-destructive text-sm">
					{error}
				</p>
			)}
		</div>
	);
}
