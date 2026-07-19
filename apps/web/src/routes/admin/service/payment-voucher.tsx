import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, ReceiptText } from "lucide-react";
import { useState } from "react";
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
import { formatDate, formatNumber, formatPrice } from "@/lib/utils";
import {
	fetchPaymentVoucher,
	fetchPaymentVouchers,
	type PaymentVoucherStatus,
	type PaymentVouchersQueryParams,
} from "@/services/payment-voucher";

export const Route = createFileRoute("/admin/service/payment-voucher")({
	component: PaymentVoucherPage,
	head: () => ({
		meta: [{ title: "Payment Vouchers — Innocenz Admin" }],
	}),
});

const PAGE_SIZE = 10;

type StatusFilter = PaymentVoucherStatus | "all";

const statusLabels: Record<PaymentVoucherStatus, string> = {
	pending_review: "Pending review",
	sent: "Sent",
	signed: "Signed",
	paid: "Paid",
	disputed: "Disputed",
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
	return (
		<Badge variant="outline" className={`${statusBadgeColors[status]} w-fit`}>
			{statusLabels[status]}
		</Badge>
	);
}

function PaymentVoucherPage() {
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
				title="Payment Vouchers"
				description="Weekly payment vouchers issued by agencies to their PRs. Click a row to view the voucher and its line items."
			/>

			<Card className="border-(--lavender-soft)/40 bg-card">
				<CardHeader>
					<div className="space-y-4">
						<div>
							<CardTitle className="flex items-center gap-2">
								Vouchers
								{vouchersQuery.isFetching && !showLoading && (
									<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
								)}
							</CardTitle>
							<CardDescription>
								Read-only view of every voucher persisted on the platform.
							</CardDescription>
						</div>

						<div className="flex flex-col gap-3 sm:flex-row sm:items-end">
							<div className="space-y-1.5">
								<Label htmlFor="pv-search">Search PR name</Label>
								<Input
									id="pv-search"
									placeholder="e.g. Ali"
									className="sm:w-56"
									value={search}
									onChange={(event) => {
										setSearch(event.target.value);
										setPage(1);
									}}
								/>
							</div>

							<div className="space-y-1.5">
								<Label htmlFor="pv-status">Status</Label>
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
										aria-label="Filter by status"
									>
										<SelectValue placeholder="All Status" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All Status</SelectItem>
										<SelectItem value="pending_review">
											Pending review
										</SelectItem>
										<SelectItem value="sent">Sent</SelectItem>
										<SelectItem value="signed">Signed</SelectItem>
										<SelectItem value="paid">Paid</SelectItem>
										<SelectItem value="disputed">Disputed</SelectItem>
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
								<TableHead>PR name</TableHead>
								<TableHead>Outlet</TableHead>
								<TableHead>Cycle</TableHead>
								<TableHead className="w-[140px]">Issued</TableHead>
								<TableHead className="text-right">Net (RM)</TableHead>
								<TableHead className="w-[130px]">Status</TableHead>
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
										Failed to load vouchers. Try again.
									</TableCell>
								</TableRow>
							) : vouchers.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={6}
										className="h-32 text-center text-muted-foreground"
									>
										No vouchers found.
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
								{formatNumber(pagination.totalCount)} voucher
								{pagination.totalCount === 1 ? "" : "s"}
							</div>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={!pagination.hasPrevPage || vouchersQuery.isFetching}
									onClick={() => setPage((value) => value - 1)}
								>
									Previous
								</Button>
								<span>
									Page {pagination.page} of {pagination.totalPages}
								</span>
								<Button
									variant="outline"
									size="sm"
									disabled={!pagination.hasNextPage || vouchersQuery.isFetching}
									onClick={() => setPage((value) => value + 1)}
								>
									Next
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
				Failed to load voucher.
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
					{voucher.cycle ?? "Payment voucher"}
					{voucher.outlet ? ` · ${voucher.outlet}` : ""}
				</SheetDescription>
			</SheetHeader>

			<div className="space-y-6 px-4 pb-6">
				<dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
					<DetailField label="Issued" value={fmtDate(voucher.issuedDate)} />
					<DetailField label="Due" value={fmtDate(voucher.dueDate)} />
					<DetailField label="Week start" value={fmtDate(voucher.weekStart)} />
					<DetailField label="Week end" value={fmtDate(voucher.weekEnd)} />
					<DetailField label="PR IC" value={voucher.prIc ?? "—"} />
					<DetailField
						label="Finance head"
						value={voucher.financeHeadName ?? "—"}
					/>
					<DetailField label="Bank ref" value={voucher.bankRef ?? "—"} />
					<DetailField label="Paid at" value={fmtDateTime(voucher.paidAt)} />
				</dl>

				<div>
					<h3 className="mb-2 text-sm font-semibold">Line items</h3>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Date</TableHead>
								<TableHead>Description</TableHead>
								<TableHead className="text-right">Qty</TableHead>
								<TableHead className="text-right">Amount (RM)</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{voucher.lines.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={4}
										className="h-16 text-center text-muted-foreground"
									>
										No line items.
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
					<TotalRow label="Subtotal" value={voucher.subtotal} />
					<TotalRow label="Deduction" value={voucher.deduction} />
					<TotalRow label="Net" value={voucher.net} emphasize />
				</dl>

				{voucher.disputeReason && (
					<div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-sm">
						<p className="font-medium text-rose-600 dark:text-rose-400">
							Dispute
						</p>
						<p className="mt-1 text-muted-foreground">
							{voucher.disputeReason}
						</p>
						{voucher.disputeNote && (
							<p className="mt-2 text-xs text-muted-foreground">
								Note: {voucher.disputeNote}
							</p>
						)}
					</div>
				)}
			</div>
		</>
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
