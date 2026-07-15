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
import {
	fetchPlatformConfig,
	type UpdatePlatformConfigInput,
	updatePlatformConfig,
} from "@/services/platform-config";

export const Route = createFileRoute("/(admin)/settings")({
	component: SettingsComponent,
	head: () => ({
		meta: [{ title: "Settings — Innocenz Admin" }],
	}),
});

function SettingsComponent() {
	return (
		<PageShell>
			<PageHeader
				title="Settings"
				description="Configure application preferences and master data."
			/>

			<PlatformConfigCard />

			<Card>
				<CardHeader>
					<CardTitle>Environment</CardTitle>
					<CardDescription>
						API configuration loaded from environment variables.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-2 text-sm">
					<div className="flex justify-between gap-4 border-b pb-2">
						<span className="text-muted-foreground">API URL</span>
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

function PlatformConfigCard() {
	const { logout } = useAuth();
	const queryClient = useQueryClient();

	const configQuery = useQuery({
		queryKey: ["platform-config"],
		queryFn: () => fetchPlatformConfig(logout),
		staleTime: 30_000,
	});
	const config = configQuery.data?.data;

	const [form, setForm] = useState(EMPTY_FORM);

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
			toast.success(response.message || "Platform configuration updated");
		},
	});

	const mutationError = toMutationError(
		updateMutation.error,
		"Failed to update platform configuration",
	);

	function handleSubmit(event: FormEvent) {
		event.preventDefault();
		updateMutation.mutate({
			platformFeePercent: Number(form.platformFeePercent),
			geofenceRadiusMeters: Number(form.geofenceRadiusMeters),
			subscriptionMonthlyFee: Number(form.subscriptionMonthlyFee),
			duplicatePaymentWindowHours: Number(form.duplicatePaymentWindowHours),
			currency: form.currency,
		});
	}

	const setField = (key: keyof typeof EMPTY_FORM) => (value: string) =>
		setForm((prev) => ({ ...prev, [key]: value }));

	return (
		<Card>
			<CardHeader>
				<CardTitle>System configuration</CardTitle>
				<CardDescription>
					Platform-wide defaults used across payments, geofencing, and
					subscriptions.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{configQuery.isLoading ? (
					<div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
						<Loader2 className="h-4 w-4 animate-spin" />
						Loading configuration…
					</div>
				) : configQuery.isError ? (
					<p className="text-destructive text-sm py-4">
						Could not load platform configuration.
					</p>
				) : (
					<form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
						<div className="grid gap-4 sm:grid-cols-2">
							<ConfigField
								id="platformFeePercent"
								label="Platform fee (%)"
								type="number"
								step="0.01"
								value={form.platformFeePercent}
								onChange={setField("platformFeePercent")}
							/>
							<ConfigField
								id="geofenceRadiusMeters"
								label="Geofence radius (m)"
								type="number"
								value={form.geofenceRadiusMeters}
								onChange={setField("geofenceRadiusMeters")}
							/>
							<ConfigField
								id="subscriptionMonthlyFee"
								label="Subscription fee / month"
								type="number"
								step="0.01"
								value={form.subscriptionMonthlyFee}
								onChange={setField("subscriptionMonthlyFee")}
							/>
							<ConfigField
								id="duplicatePaymentWindowHours"
								label="Duplicate-payment window (h)"
								type="number"
								value={form.duplicatePaymentWindowHours}
								onChange={setField("duplicatePaymentWindowHours")}
							/>
							<ConfigField
								id="currency"
								label="Currency"
								value={form.currency}
								onChange={setField("currency")}
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
							Save changes
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
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	type?: string;
	step?: string;
}) {
	return (
		<div className="space-y-1.5">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				type={type}
				step={step}
				value={value}
				onChange={(event) => onChange(event.target.value)}
			/>
		</div>
	);
}
