import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	ArrowUpRight,
	Banknote,
	Building2,
	CreditCard,
	Landmark,
	Loader2,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth-context";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { formatDate, formatDay, formatPrice } from "@/lib/utils";
import type { PaymentMethod } from "@/services/payment-method";
import {
	fetchInvoicePaymentDetail,
	type SubscriptionPayment,
	type SubscriptionPaymentStatus,
} from "@/services/subscription-payment";

/**
 * What one billing period actually looks like: who owes it, HOW they pay, and
 * every attempt made against it.
 *
 * The Plan Payment table can only ever show the invoice — a period, a figure and
 * one status flag. It cannot answer the two questions an admin actually opens a
 * row to ask: *what did they pay with*, and *did anything already fail*. Those
 * live in `payment_method` and `subscription_payment`, and this panel is where
 * the three finally meet.
 *
 * The subscriber gets a LINK into their full record, because "who is this
 * agency" is the next question after "did they pay", and making someone search a
 * second page for a row they already had in front of them is how a detail panel
 * stops being used.
 */

const paymentToneOf: Record<SubscriptionPaymentStatus, string> = {
	// Green = settled, amber = waiting, red = failed, grey = retracted — the
	// project's status colour code, same as every other receipt surface.
	succeeded: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
	pending: "border-amber-400/40 bg-amber-400/10 text-amber-300",
	initiated: "border-amber-400/40 bg-amber-400/10 text-amber-300",
	failed: "border-red-400/40 bg-red-400/10 text-red-300",
	refunded: "border-red-400/40 bg-red-400/10 text-red-300",
	voided: "border-muted-foreground/30 bg-muted/30 text-muted-foreground",
};

function MethodIcon({ type }: { type: PaymentMethod["type"] }) {
	if (type === "manual_transfer") return <Landmark className="h-4 w-4" />;
	if (type === "fpx_mandate") return <Banknote className="h-4 w-4" />;
	return <CreditCard className="h-4 w-4" />;
}

/**
 * The org's mark, or its initials when it has none.
 *
 * Initials rather than a generic placeholder icon: every outlet without a logo
 * would otherwise render the identical grey square, which tells the reader
 * nothing and looks like a broken image. `onError` falls back the same way, so a
 * key that no longer resolves in R2 degrades to initials instead of a torn icon.
 */
function OrgLogo({
	name,
	src,
	isAgency,
}: {
	name: string;
	src: string | null;
	isAgency: boolean;
}) {
	const [failed, setFailed] = useState(false);
	const initials = name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((word) => word[0]?.toUpperCase() ?? "")
		.join("");

	if (src && !failed) {
		return (
			<img
				src={src}
				alt=""
				onError={() => setFailed(true)}
				className="h-10 w-10 shrink-0 rounded-md object-cover"
			/>
		);
	}
	return (
		<span
			aria-hidden
			className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-semibold ${
				isAgency
					? "bg-violet-400/15 text-violet-300"
					: "bg-sky-400/15 text-sky-300"
			}`}
		>
			{initials || <Building2 className="h-4 w-4" />}
		</span>
	);
}

function Row({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-start justify-between gap-4 py-2">
			<span className="text-sm text-muted-foreground">{label}</span>
			<span className="text-right text-sm font-medium">{children}</span>
		</div>
	);
}

export function InvoicePaymentSheet({ invoiceId }: { invoiceId: string }) {
	const { t } = usePortalLocale();
	const { logout } = useAuth();

	const { data, isLoading, isError } = useQuery({
		queryKey: ["invoice-payment-detail", invoiceId],
		queryFn: () => fetchInvoicePaymentDetail(invoiceId, logout),
		staleTime: 15_000,
	});

	if (isLoading) {
		return (
			<div className="flex h-40 items-center justify-center">
				<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
			</div>
		);
	}
	if (isError || !data) {
		// This is the panel failing to LOAD. It used to borrow the mutation's
		// message and tell the admin a payment UPDATE had failed — a read error
		// reported as a write error is how someone goes looking for money that
		// never moved.
		return (
			<div className="p-6 text-sm text-muted-foreground">
				{t.adminService.paymentDetailLoadFailed}
			</div>
		);
	}

	const { invoice, payments, methods, org, lanes, actors, r2PublicUrl } = data;
	const isAgency = invoice.subscriberType === "agency";
	/**
	 * Legacy rows still hold base64 data URLs and absolute URLs; newer ones hold
	 * a bare R2 key that has to be joined with the base. Checked in that order so
	 * an already-usable value is never mangled by prefixing.
	 */
	const logoSrc = org?.logoImage
		? /^(https?:|data:)/.test(org.logoImage)
			? org.logoImage
			: r2PublicUrl
				? `${r2PublicUrl}/${org.logoImage.replace(/^\//, "")}`
				: null
		: null;
	// Both admin org pages take ?focus=<id> and open that record — the same
	// entry point their own lists use, so this is a jump, not a parallel screen.
	const orgHref = isAgency
		? "/admin/user-management/agency"
		: "/admin/user-management/outlet";

	const methodLabelOf = (method: PaymentMethod) => {
		if (method.type === "manual_transfer") return t.subscription.savedTransfer;
		if (method.type === "fpx_mandate") return t.subscription.savedFpx;
		return `${method.brand} ···· ${method.last4 ?? "····"}`;
	};

	const methodTypeLabelOf = (type: SubscriptionPayment["methodType"]) => {
		if (type === "manual_transfer") return t.subscription.methodTransfer;
		if (type === "fpx_mandate") return t.subscription.methodFpx;
		return t.subscription.methodCard;
	};

	/**
	 * The attempt's state, in the reader's language. The badge printed the raw
	 * enum — "succeeded", "voided" — inside a portal with a 中文 switch in its
	 * own sidebar, on the panel that explains what happened to money.
	 */
	const paymentStatusLabelOf = (status: SubscriptionPayment["status"]) =>
		({
			initiated: t.adminService.attemptInitiated,
			pending: t.adminService.attemptPending,
			succeeded: t.adminService.attemptSucceeded,
			failed: t.adminService.attemptFailed,
			refunded: t.adminService.attemptRefunded,
			voided: t.adminService.attemptVoided,
		})[status] ?? status;

	/**
	 * Who recorded it. The server resolves a uuid to a person's name; a stamp
	 * that is not a person keeps its own word. Falls back to the raw value
	 * rather than blanking — an unrecognised actor is still evidence.
	 */
	const actorLabelOf = (actor: string) => {
		if (actor === "system") return t.adminService.actorSystem;
		if (actor.startsWith("gateway:")) return actor.slice("gateway:".length);
		return actors?.[actor] ?? actor;
	};

	return (
		<div className="flex h-full flex-col gap-5 overflow-y-auto">
			<SheetHeader className="space-y-1 p-0">
				<SheetTitle>{t.admin.navPlanPayment}</SheetTitle>
				<SheetDescription>{t.adminService.paymentPanelIntro}</SheetDescription>
			</SheetHeader>

			{/* WHO — logo, live name, and the way out to their full record. */}
			<section className="rounded-lg border border-border/60 p-4">
				<div className="flex items-start justify-between gap-3">
					<div className="flex min-w-0 items-center gap-3">
						<OrgLogo
							name={org?.name ?? invoice.subscriberName}
							src={logoSrc}
							isAgency={isAgency}
						/>
						<div className="min-w-0">
							{/* The org's CURRENT name — the invoice's copy is a snapshot kept
							    so history survives a rename, which is wrong for a header. */}
							<p className="truncate text-lg font-semibold">
								{org?.name ?? invoice.subscriberName}
							</p>
							<Badge
								variant="outline"
								className={`mt-1 ${isAgency ? "border-violet-400/40 bg-violet-400/10 text-violet-300" : "border-sky-400/40 bg-sky-400/10 text-sky-300"}`}
							>
								{isAgency ? t.adminService.agency : t.table.outlet}
							</Badge>
						</div>
					</div>
					<Button asChild size="sm" variant="outline">
						<Link to={orgHref} search={{ focus: invoice.subscriberId }}>
							{t.adminService.openFullRecord}
							<ArrowUpRight className="ml-1 h-3.5 w-3.5" />
						</Link>
					</Button>
				</div>
			</section>

			{/* WHAT IS OWED — this period, and every lane it sits beside. */}
			<section className="rounded-lg border border-border/60 p-4">
				<p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{t.adminService.subscriptionDetails}
				</p>
				<div className="divide-y divide-border/50">
					<Row label={t.adminService.thisInvoiceFor}>{invoice.planName}</Row>
					<Row label={t.adminService.billingCycleLabel}>
						{invoice.billingCycle === "weekly"
							? t.subscription.billedWeekly
							: t.subscription.billedMonthly}
					</Row>
					<Row label={t.adminService.billingPeriodLabel}>
						{formatDay(invoice.periodStart)} – {formatDay(invoice.periodEnd)}
					</Row>
					<Row label={t.adminService.amountLabel}>
						{formatPrice(invoice.amount)}
					</Row>
					<Row label={t.adminService.statusLabel}>
						<Badge
							className={
								invoice.status === "paid"
									? paymentToneOf.succeeded
									: paymentToneOf.pending
							}
						>
							{invoice.status === "paid"
								? t.subscription.statusPaid
								: t.subscription.statusUnpaid}
						</Badge>
					</Row>
					{invoice.paidAt && (
						<Row label={t.adminService.paidOnLabel}>
							{formatDate(invoice.paidAt)}
						</Row>
					)}
				</div>
			</section>

			{/*
			 * EVERY LANE — the fix for "got 2 plans, why does it show one".
			 * A venue on Enterprise with the POS add-on is billed on TWO lanes and
			 * each opens its own invoice, so the row above is only ever one of them.
			 */}
			{lanes.length > 0 && (
				<section className="rounded-lg border border-border/60 p-4">
					<p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{t.adminService.allBillingLanes}
					</p>
					<p className="mb-2 text-xs text-muted-foreground">
						{t.adminService.allBillingLanesHint}
					</p>
					<ul className="space-y-2">
						{lanes.map((lane) => {
							const isThisOne = lane.id === invoice.memberSubscriptionId;
							return (
								<li
									key={lane.id}
									className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm ${
										isThisOne
											? "bg-primary/10 ring-1 ring-primary/40"
											: "bg-muted/30"
									}`}
								>
									<span className="min-w-0">
										<span className="block truncate font-medium">
											{lane.planName}
										</span>
										<span className="text-xs text-muted-foreground">
											{lane.billingCycle}
										</span>
									</span>
									<span className="flex shrink-0 items-center gap-2">
										<span className="font-medium">
											{formatPrice(lane.amount)}
										</span>
										{isThisOne && (
											<Badge variant="outline">
												{t.adminService.thisPeriodBadge}
											</Badge>
										)}
									</span>
								</li>
							);
						})}
						{lanes.length > 1 && (
							<li className="flex items-center justify-between gap-3 px-3 pt-1 text-sm font-semibold">
								<span>{t.adminService.totalPerCycle}</span>
								<span>
									{formatPrice(
										lanes
											.reduce((sum, lane) => sum + Number(lane.amount), 0)
											.toFixed(2),
									)}
								</span>
							</li>
						)}
					</ul>
				</section>
			)}

			{/* HOW THEY PAY — the half the invoice cannot hold. */}
			<section className="rounded-lg border border-border/60 p-4">
				<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{t.subscription.payHow}
				</p>
				{methods.length === 0 ? (
					// Said plainly rather than left blank: an empty box reads as a
					// loading fault, and "no method on file" is a real, actionable answer.
					<p className="text-sm text-muted-foreground">
						{t.adminService.noMethodOnFile}
					</p>
				) : (
					<ul className="space-y-2">
						{methods.map((method) => (
							<li
								key={method.id}
								className="flex items-center justify-between gap-3 rounded-md bg-muted/30 px-3 py-2"
							>
								<span className="flex items-center gap-2 text-sm">
									<MethodIcon type={method.type} />
									{methodLabelOf(method)}
								</span>
								<span className="flex items-center gap-2">
									{method.isDefault && (
										<Badge variant="outline">
											{t.adminService.defaultMethod}
										</Badge>
									)}
									{method.mandateStatus === "pending" && (
										<Badge className={paymentToneOf.pending}>
											{t.adminService.mandatePendingShort}
										</Badge>
									)}
								</span>
							</li>
						))}
					</ul>
				)}
			</section>

			{/* EVERY ATTEMPT — including the ones that failed, which is the point. */}
			<section className="rounded-lg border border-border/60 p-4">
				<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{t.adminService.paymentAttempts}
				</p>
				{payments.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						{t.adminService.noAttemptsYet}
					</p>
				) : (
					<ul className="space-y-2">
						{payments.map((payment) => (
							<li
								key={payment.id}
								className="rounded-md bg-muted/30 px-3 py-2 text-sm"
							>
								<div className="flex items-center justify-between gap-3">
									<span className="font-medium">
										{methodTypeLabelOf(payment.methodType)}
									</span>
									<Badge className={paymentToneOf[payment.status]}>
										{paymentStatusLabelOf(payment.status)}
									</Badge>
								</div>
								<div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
									<p>
										{formatPrice(payment.amount)} ·{" "}
										{formatDate(payment.paidAt ?? payment.createdAt)}
									</p>
									{payment.reference && (
										<p className="break-all">
											{t.adminService.paymentReference}: {payment.reference}
										</p>
									)}
									{payment.gateway && (
										<p className="break-all">
											{payment.gateway}
											{payment.gatewayPaymentId
												? ` · ${payment.gatewayPaymentId}`
												: ""}
										</p>
									)}
									{payment.failureReason && (
										<p className="text-red-300">{payment.failureReason}</p>
									)}
									<p>
										{t.adminService.recordedBy}:{" "}
										{actorLabelOf(payment.createdBy)}
									</p>
								</div>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
