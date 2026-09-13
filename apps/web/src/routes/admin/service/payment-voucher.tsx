import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, ReceiptText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, PageShell } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
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
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import { resolveProofPhotoUrl } from "@/lib/proof-photo";
import { formatDate, formatNumber, formatPrice } from "@/lib/utils";
import {
	type DisputeComponent,
	type DisputeOutcome,
	fetchDisputes,
	fetchPaymentVoucher,
	fetchPaymentVouchers,
	type PaymentVoucherReceipt,
	type PaymentVoucherReceiptSource,
	type PaymentVoucherReceiptStatus,
	type PaymentVoucherStatus,
	type PaymentVouchersQueryParams,
	resolveDispute,
} from "@/services/payment-voucher";

export const Route = createFileRoute("/admin/service/payment-voucher")({
	component: PaymentVoucherPage,
	/*
	 * Document title stays ENGLISH — `head()` is route metadata evaluated
	 * outside React, so it cannot read the locale context.
	 */
	head: () => ({
		meta: [{ title: "Payment Vouchers — Innocenz Admin" }],
	}),
});

const PAGE_SIZE = 10;

type StatusFilter = PaymentVoucherStatus | "all";

/*
 * Keyed by the API's own enum value — that never changes, only the words a
 * human reads do. A module-scope map cannot call a hook, so each entry holds a
 * lookup that takes `t`.
 */
const statusLabels: Record<
	PaymentVoucherStatus,
	(t: PortalTranslations) => string
> = {
	pending_review: (t) => t.adminService.pendingReview,
	sent: (t) => t.adminService.pvSent,
	signed: (t) => t.adminService.pvSigned,
	paid: (t) => t.payroll.statusPaid,
	disputed: (t) => t.payroll.statusDisputed,
};

const statusBadgeColors: Record<PaymentVoucherStatus, string> = {
	pending_review:
		"border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
	sent: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
	signed:
		"border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
	paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	disputed:
		"border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

function StatusBadge({ status }: { status: PaymentVoucherStatus }) {
	const { t } = usePortalLocale();
	return (
		<Badge variant="outline" className={`${statusBadgeColors[status]} w-fit`}>
			{statusLabels[status](t)}
		</Badge>
	);
}

function PaymentVoucherPage() {
	const { t } = usePortalLocale();
	const { logout } = useAuth();

	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const queryParams: PaymentVouchersQueryParams = { page, pageSize: PAGE_SIZE };
	if (statusFilter !== "all") queryParams.status = statusFilter;
	if (search.trim()) queryParams.prName = search.trim();

	const vouchersQuery = useQuery({
		queryKey: ["payment-vouchers", queryParams],
		queryFn: () => fetchPaymentVouchers(queryParams, logout),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
		retry: 2,
	});

	const vouchers = vouchersQuery.data?.data ?? [];
	const pagination = vouchersQuery.data?.pagination;
	const showLoading = vouchersQuery.isLoading;

	return (
		<PageShell>
			<PageHeader
				icon={ReceiptText}
				title={t.payroll.paymentVouchers}
				description={t.adminService.pvSubtitle}
			/>

			<Card className="border-(--lavender-soft)/40 bg-card">
				<CardHeader>
					<div className="space-y-4">
						<div>
							<CardTitle className="flex items-center gap-2">
								{t.adminService.vouchers}
								{vouchersQuery.isFetching && !showLoading && (
									<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
								)}
							</CardTitle>
							<CardDescription>{t.adminService.pvReadOnlyHint}</CardDescription>
						</div>

						<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
							<div className="space-y-1.5">
								<Label htmlFor="pv-search">{t.adminService.searchPrName}</Label>
								<Input
									id="pv-search"
									placeholder={t.adminService.searchPrNamePlaceholder}
									className="sm:w-56"
									value={search}
									onChange={(event) => {
										setSearch(event.target.value);
										setPage(1);
									}}
								/>
							</div>

							<div className="space-y-1.5">
								<Label htmlFor="pv-status">{t.admin.colStatus}</Label>
								<Select
									value={statusFilter}
									onValueChange={(value) => {
										setStatusFilter(value as StatusFilter);
										setPage(1);
									}}
								>
									<SelectTrigger
										id="pv-status"
										className="sm:w-44"
										aria-label={t.admin.filterByStatus}
									>
										<SelectValue placeholder={t.admin.allStatus} />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">{t.admin.allStatus}</SelectItem>
										<SelectItem value="pending_review">
											{statusLabels.pending_review(t)}
										</SelectItem>
										<SelectItem value="sent">{statusLabels.sent(t)}</SelectItem>
										<SelectItem value="signed">
											{statusLabels.signed(t)}
										</SelectItem>
										<SelectItem value="paid">{statusLabels.paid(t)}</SelectItem>
										<SelectItem value="disputed">
											{statusLabels.disputed(t)}
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
					</div>
				</CardHeader>

				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t.adminService.colPrName}</TableHead>
								<TableHead>{t.table.outlet}</TableHead>
								<TableHead>{t.adminService.colCycle}</TableHead>
								<TableHead className="w-[140px]">
									{t.adminService.issued}
								</TableHead>
								<TableHead className="text-right">{t.table.net} (RM)</TableHead>
								<TableHead className="w-[130px]">{t.admin.colStatus}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{showLoading ? (
								<TableRow>
									<TableCell colSpan={6} className="h-32 text-center">
										<Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
									</TableCell>
								</TableRow>
							) : vouchersQuery.isError ? (
								<TableRow>
									<TableCell
										colSpan={6}
										className="h-32 text-center text-muted-foreground"
									>
										{t.adminService.pvLoadFailed}
									</TableCell>
								</TableRow>
							) : vouchers.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={6}
										className="h-32 text-center text-muted-foreground"
									>
										{t.adminService.noVouchersFound}
									</TableCell>
								</TableRow>
							) : (
								vouchers.map((voucher) => (
									<TableRow
										key={voucher.id}
										className="cursor-pointer"
										onClick={() => setSelectedId(voucher.id)}
									>
										<TableCell className="font-medium">
											{voucher.prName}
										</TableCell>
										<TableCell>{voucher.outlet ?? "—"}</TableCell>
										<TableCell>{voucher.cycle ?? "—"}</TableCell>
										<TableCell>
											{voucher.issuedDate
												? formatDate(voucher.issuedDate)
												: "—"}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatPrice(voucher.net)}
										</TableCell>
										<TableCell>
											<StatusBadge status={voucher.status} />
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>

					{pagination && pagination.totalCount > 0 && (
						<div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
							<div>
								{fill(
									pagination.totalCount === 1
										? t.adminService.voucherCountOne
										: t.adminService.voucherCountMany,
									{ n: formatNumber(pagination.totalCount) },
								)}
							</div>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={!pagination.hasPrevPage || vouchersQuery.isFetching}
									onClick={() => setPage((value) => value - 1)}
								>
									{t.admin.previous}
								</Button>
								<span>
									{fill(t.admin.pageOf, {
										page: pagination.page,
										total: pagination.totalPages,
									})}
								</span>
								<Button
									variant="outline"
									size="sm"
									disabled={!pagination.hasNextPage || vouchersQuery.isFetching}
									onClick={() => setPage((value) => value + 1)}
								>
									{t.admin.next}
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			<Sheet
				open={selectedId != null}
				onOpenChange={(open) => {
					if (!open) setSelectedId(null);
				}}
			>
				<SheetContent
					side="right"
					className="w-full overflow-y-auto sm:max-w-lg"
				>
					{selectedId && (
						<VoucherDetail id={selectedId} onRefreshFail={logout} />
					)}
				</SheetContent>
			</Sheet>
		</PageShell>
	);
}

function VoucherDetail({
	id,
	onRefreshFail,
}: {
	id: string;
	onRefreshFail: () => void;
}) {
	const { t } = usePortalLocale();
	const detailQuery = useQuery({
		queryKey: ["payment-voucher", id],
		queryFn: () => fetchPaymentVoucher(id, onRefreshFail),
		staleTime: 30_000,
	});

	if (detailQuery.isLoading) {
		return (
			<div className="flex h-40 items-center justify-center">
				<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (detailQuery.isError || !detailQuery.data) {
		return (
			<div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
				{t.adminService.pvDetailLoadFailed}
			</div>
		);
	}

	const voucher = detailQuery.data;

	return (
		<>
			<SheetHeader>
				<SheetTitle className="flex items-center gap-2">
					{voucher.prName}
					<StatusBadge status={voucher.status} />
				</SheetTitle>
				<SheetDescription>
					{voucher.cycle ?? t.adminService.paymentVoucher}
					{voucher.outlet ? ` · ${voucher.outlet}` : ""}
				</SheetDescription>
			</SheetHeader>

			<div className="space-y-6 px-4 pb-6">
				<dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
					<DetailField
						label={t.adminService.issued}
						value={fmtDate(voucher.issuedDate)}
					/>
					<DetailField
						label={t.adminService.due}
						value={fmtDate(voucher.dueDate)}
					/>
					<DetailField
						label={t.adminService.weekStart}
						value={fmtDate(voucher.weekStart)}
					/>
					<DetailField
						label={t.adminService.weekEnd}
						value={fmtDate(voucher.weekEnd)}
					/>
					<DetailField
						label={t.adminService.prIc}
						value={voucher.prIc ?? "—"}
					/>
					<DetailField
						label={t.adminService.financeHead}
						value={voucher.financeHeadName ?? "—"}
					/>
					<DetailField
						label={t.adminService.bankRef}
						value={voucher.bankRef ?? "—"}
					/>
					<DetailField
						label={t.adminService.paidAt}
						value={fmtDateTime(voucher.paidAt)}
					/>
				</dl>

				<div>
					<h3 className="mb-2 text-sm font-semibold">
						{t.adminService.lineItems}
					</h3>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t.filters.date}</TableHead>
								<TableHead>{t.adminService.colDescription}</TableHead>
								<TableHead className="text-right">
									{t.adminService.colQty}
								</TableHead>
								<TableHead className="text-right">
									{t.adminService.colAmount} (RM)
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{voucher.lines.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={4}
										className="h-16 text-center text-muted-foreground"
									>
										{t.adminService.noLineItems}
									</TableCell>
								</TableRow>
							) : (
								voucher.lines.map((line) => (
									<TableRow key={line.id}>
										<TableCell>{fmtDate(line.lineDate)}</TableCell>
										<TableCell>
											{line.description}
											{line.outlet ? (
												<span className="block text-xs text-muted-foreground">
													{line.outlet}
												</span>
											) : null}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{line.quantity}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatPrice(line.amount)}
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>

				<dl className="space-y-2 border-t pt-4 text-sm">
					<TotalRow label={t.payroll.subtotal} value={voucher.subtotal} />
					<TotalRow
						label={t.adminService.deduction}
						value={voucher.deduction}
					/>
					<TotalRow label={t.table.net} value={voucher.net} emphasize />
				</dl>

				<ReceiptEvidence receipts={voucher.receipts} />

				<VoucherDisputes voucherId={voucher.id} onRefreshFail={onRefreshFail} />

				{voucher.disputeReason && (
					<div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-sm">
						{/* The voucher's own dispute COLUMNS, which predate the
						    payment_voucher_dispute table. Kept and labelled rather than
						    folded into the queue above: a legacy value with no row behind
						    it cannot be resolved, and showing it as an open dispute would
						    offer a decision that has nothing to write to. */}
						<p className="font-medium text-rose-600 dark:text-rose-400">
							{t.adminService.legacyDisputeNote}
						</p>
						<p className="mt-1 text-muted-foreground">
							{voucher.disputeReason}
						</p>
						{voucher.disputeNote && (
							<p className="mt-2 text-xs text-muted-foreground">
								{t.adminService.noteLabel} {voucher.disputeNote}
							</p>
						)}
					</div>
				)}
			</div>
		</>
	);
}

const RECEIPT_SOURCE_LABEL: Record<
	PaymentVoucherReceiptSource,
	(t: PortalTranslations) => string
> = {
	scan: (t) => t.receipts.scanned,
	manual: (t) => t.receipts.selfLogged,
	checkin: (t) => t.adminService.autoSealed,
};

const RECEIPT_STATUS_TONE: Record<
	PaymentVoucherReceiptStatus,
	{ label: (t: PortalTranslations) => string; className: string }
> = {
	pending: {
		label: (t) => t.adminService.pendingReview,
		className: "border-amber-500/40 text-amber-600 dark:text-amber-400",
	},
	approved: {
		label: (t) => t.receipts.approved,
		className: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
	},
	verified: {
		label: (t) => t.receipts.verified,
		className: "border-sky-500/40 text-sky-600 dark:text-sky-400",
	},
};

/**
 * The receipts backing this voucher's commission lines.
 *
 * READ-ONLY on purpose. Reviewing a receipt is the agency's job — they are the
 * party who can check it against the venue — and admin is an escalation path
 * for disputes, not a second reviewer. Rendering it here answers "what is this
 * money resting on?", which is the question an escalation actually needs.
 *
 * A voucher with no receipts says so rather than rendering nothing: several
 * live commission lines have no receipt behind them at all, and an empty gap
 * reads as "not loaded" when it means "nothing backs this".
 */
function ReceiptEvidence({
	receipts,
}: {
	receipts: PaymentVoucherReceipt[] | undefined;
}) {
	const { t } = usePortalLocale();

	// undefined = the list route, which does not return receipts. An empty array
	// = the detail route saying there genuinely are none. Different facts.
	if (receipts === undefined) return null;

	return (
		<div>
			<h3 className="mb-2 text-sm font-semibold">
				{t.adminService.receiptEvidence}
				{receipts.length > 0 ? ` (${receipts.length})` : ""}
			</h3>
			{receipts.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					{t.adminService.noReceiptEvidence}
				</p>
			) : (
				<ul className="space-y-2">
					{receipts.map((receipt) => {
						const tone = RECEIPT_STATUS_TONE[receipt.status];
						const photos = receipt.proofPhotos ?? [];
						return (
							<li key={receipt.id} className="rounded-md border p-3 text-sm">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<span className="font-medium">
										{receipt.receiptNo}
										{receipt.orderNo ? ` · ${receipt.orderNo}` : ""}
									</span>
									<Badge variant="outline" className={tone.className}>
										{tone.label(t)}
									</Badge>
								</div>
								<p className="mt-1 text-xs text-muted-foreground">
									{RECEIPT_SOURCE_LABEL[receipt.source](t)}
									{receipt.receiptDate
										? ` · ${fmtDate(receipt.receiptDate)}`
										: ""}
									{receipt.receiptTime ? ` ${receipt.receiptTime}` : ""}
								</p>
								{receipt.note && (
									<p className="mt-1 text-xs text-muted-foreground">
										{receipt.note}
									</p>
								)}
								<p className="mt-1 text-xs text-muted-foreground">
									{/* A null reviewedAt beside `approved` means the row
									    predates the review flow — never print a date derived
									    from something else. */}
									{receipt.reviewedBy
										? fill(t.adminService.reviewedAtBy, {
												when: fmtDateTime(receipt.reviewedAt),
												name: receipt.reviewedBy,
											})
										: fill(t.adminService.reviewedAt, {
												when: fmtDateTime(receipt.reviewedAt),
											})}
								</p>
								{photos.length > 0 && (
									<div className="mt-2 flex flex-wrap gap-2">
										{photos.map((src) => (
											<a
												// Key stays the RAW string; only the displayed URL is resolved.
												key={`${receipt.id}-${src}`}
												href={resolveProofPhotoUrl(src)}
												target="_blank"
												rel="noreferrer"
												title={t.adminService.openFullSize}
											>
												<img
													src={resolveProofPhotoUrl(src)}
													alt={fill(t.adminService.proofForReceipt, {
														no: receipt.receiptNo,
													})}
													className="h-20 w-20 rounded border object-cover transition hover:brightness-110"
												/>
											</a>
										))}
									</div>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

const DISPUTE_COMPONENT_LABEL: Record<
	DisputeComponent,
	(t: PortalTranslations) => string
> = {
	wages: (t) => t.money.dailyWages,
	drinks: (t) => t.money.drinks,
	tips: (t) => t.money.tips,
	others: (t) => t.money.others,
};

/** The record KEY is the stored outcome; only the badge wording is translated. */
const DISPUTE_OUTCOME_LABEL: Record<
	DisputeOutcome,
	(t: PortalTranslations) => string
> = {
	accepted: (t) => t.adminService.resolvedAccepted,
	rejected: (t) => t.adminService.resolvedRejected,
	withdrawn: (t) => t.adminService.resolvedWithdrawn,
};

/**
 * Disputes raised against this voucher, and the admin's escalation decision.
 *
 * This is the ONE write on an otherwise read-only page, and it exists for a
 * single reason (owner's decision, 31 Jul 2026, Option A): resolving a dispute
 * belongs to the agency, but agency-only leaves a PR with **no recourse if
 * their agency goes quiet**. The server's `agencyOwnerOrFinance` guard waves
 * admin through by design, so nothing had to be widened to build this.
 *
 * The queue endpoint is not voucher-scoped, so the filter is client-side. That
 * is safe HERE and nowhere else: admin is authorised for every tenant, so this
 * narrows a list it may already see in full, rather than being the thing that
 * keeps tenants apart.
 */
function VoucherDisputes({
	voucherId,
	onRefreshFail,
}: {
	voucherId: string;
	onRefreshFail: () => void;
}) {
	const { t } = usePortalLocale();
	const queryClient = useQueryClient();
	const [note, setNote] = useState("");
	const [needsNote, setNeedsNote] = useState(false);

	// openOnly = false: an escalation needs to see what was ALREADY decided as
	// much as what is outstanding — "the agency rejected this" is the usual
	// reason a PR escalates in the first place.
	const disputesQuery = useQuery({
		queryKey: ["payment-voucher", "disputes", "all"],
		queryFn: () => fetchDisputes(onRefreshFail, false),
		staleTime: 30_000,
	});

	const resolveMut = useMutation({
		mutationFn: (input: {
			disputeId: string;
			outcome: "accepted" | "rejected";
		}) =>
			resolveDispute(
				input.disputeId,
				{ outcome: input.outcome, resolutionNote: note.trim() || undefined },
				onRefreshFail,
			),
		/*
		 * ⚠️ `onSuccess`, NOT `onSettled` — and the difference is the admin's note.
		 *
		 * `onSettled` runs on BOTH outcomes, so a failed resolve still cleared the
		 * resolution note that had just been typed and refetched the list, leaving
		 * the dispute exactly where it was. Nothing said it had failed, and the
		 * reasoning was gone. This is a PR's money dispute: the note is the record
		 * of WHY it was accepted or rejected.
		 *
		 * On failure the note is now kept, so a retry starts where they left off.
		 */
		onSuccess: (_data, input) => {
			setNote("");
			queryClient.invalidateQueries({
				queryKey: ["payment-voucher", "disputes", "all"],
			});
			// Resolving the last open dispute hands the voucher back to 'sent', so
			// the detail and the list both move.
			queryClient.invalidateQueries({
				queryKey: ["payment-voucher", voucherId],
			});
			queryClient.invalidateQueries({ queryKey: ["payment-vouchers"] });
			toast.success(
				input.outcome === "accepted"
					? t.adminService.disputeAccepted
					: t.adminService.disputeRejected,
			);
		},
		onError: (error) =>
			toast.error(
				// `toMutationError` returns null only for a falsy error, which cannot
				// happen in onError — the `??` is for the type, not for the case.
				toMutationError(error, t.adminService.couldNotResolveDispute)?.message ??
					t.adminService.couldNotResolveDispute,
			),
	});

	if (disputesQuery.isLoading) {
		return (
			<div>
				<h3 className="mb-2 text-sm font-semibold">
					{t.adminService.disputes}
				</h3>
				<p className="text-sm text-muted-foreground">
					{t.payroll.loadingDisputes}
				</p>
			</div>
		);
	}

	const disputes = (disputesQuery.data ?? []).filter(
		(d) => d.voucherId === voucherId,
	);
	if (disputes.length === 0) return null;

	const submit = (disputeId: string, outcome: "accepted" | "rejected") => {
		// The server enforces this too; surfacing it here is about not making an
		// admin discover the rule through a 400.
		if (outcome === "rejected" && !note.trim()) {
			setNeedsNote(true);
			return;
		}
		setNeedsNote(false);
		resolveMut.mutate({ disputeId, outcome });
	};

	return (
		<div>
			<h3 className="mb-2 text-sm font-semibold">
				{t.adminService.disputes} ({disputes.length})
			</h3>
			<p className="mb-2 text-xs text-muted-foreground">
				{t.adminService.disputeEscalationHint}
			</p>
			<ul className="space-y-2">
				{disputes.map((dispute) => (
					<li key={dispute.id} className="rounded-md border p-3 text-sm">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<span className="font-medium">
								{DISPUTE_COMPONENT_LABEL[dispute.component](t)} ·{" "}
								{fmtDate(dispute.disputeDate)}
							</span>
							{dispute.outcome ? (
								<Badge variant="outline">
									{DISPUTE_OUTCOME_LABEL[dispute.outcome](t)}
								</Badge>
							) : (
								<Badge
									variant="outline"
									className="border-amber-500/40 text-amber-600 dark:text-amber-400"
								>
									{t.payroll.open}
								</Badge>
							)}
						</div>

						<div className="mt-2 flex flex-wrap gap-4 text-xs">
							<span>
								<span className="block text-muted-foreground">
									{t.table.voucherSays}
								</span>
								<span className="tabular-nums">
									RM {formatPrice(dispute.disputedAmount ?? "0")}
								</span>
							</span>
							{dispute.claimedAmount !== null && (
								<span>
									<span className="block text-muted-foreground">
										{t.payroll.prClaims}
									</span>
									<span className="tabular-nums">
										RM {formatPrice(dispute.claimedAmount)}
									</span>
								</span>
							)}
						</div>

						{dispute.reason && (
							<p className="mt-2 text-xs text-muted-foreground">
								{t.payroll.reasonLabel} {dispute.reason}
							</p>
						)}
						{dispute.proofPhotos && dispute.proofPhotos.length > 0 ? (
							<div className="mt-2 flex flex-wrap gap-2">
								{dispute.proofPhotos.map((src) => (
									<a
										key={`${dispute.id}-${src}`}
										href={resolveProofPhotoUrl(src)}
										target="_blank"
										rel="noreferrer"
										title={t.adminService.openFullSize}
									>
										<img
											src={resolveProofPhotoUrl(src)}
											alt={fill(t.adminService.proofForDispute, {
												component:
													DISPUTE_COMPONENT_LABEL[dispute.component](t),
												date: dispute.disputeDate,
											})}
											className="h-20 w-20 rounded border object-cover transition hover:brightness-110"
										/>
									</a>
								))}
							</div>
						) : (
							// Not a defect: a "missing record" claim has nothing to
							// photograph.
							<p className="mt-2 text-xs text-muted-foreground">
								{t.receipts.noProofAttached}
							</p>
						)}

						{dispute.outcome ? (
							<p className="mt-2 text-xs text-muted-foreground">
								{fmtDateTime(dispute.resolvedAt)}
								{dispute.resolvedBy ? ` · ${dispute.resolvedBy}` : ""}
								{dispute.resolutionNote ? ` — ${dispute.resolutionNote}` : ""}
							</p>
						) : (
							<div className="mt-3 space-y-2">
								<Label
									htmlFor={`dispute-note-${dispute.id}`}
									className="text-xs"
								>
									{t.payroll.noteToPrRequired}
								</Label>
								<Input
									id={`dispute-note-${dispute.id}`}
									value={note}
									onChange={(e) => {
										setNote(e.target.value);
										if (e.target.value.trim()) setNeedsNote(false);
									}}
									placeholder={t.adminService.disputeNotePlaceholder}
								/>
								{needsNote && (
									<p className="text-xs text-amber-600 dark:text-amber-400">
										{t.adminService.tellPrWhyRejected}
									</p>
								)}
								<div className="flex gap-2">
									<Button
										size="sm"
										disabled={resolveMut.isPending}
										onClick={() => submit(dispute.id, "accepted")}
									>
										{t.adminService.accept}
									</Button>
									<Button
										size="sm"
										variant="outline"
										disabled={resolveMut.isPending}
										onClick={() => submit(dispute.id, "rejected")}
									>
										{t.common.reject}
									</Button>
								</div>
							</div>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}

function DetailField({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="font-medium">{value}</dd>
		</div>
	);
}

function TotalRow({
	label,
	value,
	emphasize,
}: {
	label: string;
	value: string;
	emphasize?: boolean;
}) {
	return (
		<div
			className={`flex items-center justify-between ${
				emphasize ? "text-base font-semibold" : "text-muted-foreground"
			}`}
		>
			<dt>{label}</dt>
			<dd className="tabular-nums">RM {formatPrice(value)}</dd>
		</div>
	);
}

function fmtDate(value: string | null): string {
	return value ? formatDate(value) : "—";
}

function fmtDateTime(value: string | null): string {
	if (!value) return "—";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-MY");
}
