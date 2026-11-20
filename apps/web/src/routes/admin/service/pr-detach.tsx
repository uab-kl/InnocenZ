import "@/components/admin/admin-finance-design.css";
import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, Loader2, RefreshCw, UserMinus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, PageShell } from "@/components/admin/page-header";
import {
	QueueRowButton,
	QueueWaitingStrip,
	queueRowState,
} from "@/components/admin/queue-cues";
import { DateTimeCell } from "@/components/admin/table-sort";
import {
	currentOrgName,
	useCurrentOrgNames,
} from "@/components/admin/use-current-org-names";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
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
import { useAdminTodoCounts } from "@/hooks/use-sidebar-badges";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import { getErrorMessage } from "@/lib/utils";
import {
	type AdminRequest,
	type AdminRequestStatus,
	approvePrDetach,
	declineRequest,
	fetchAdminRequests,
	isAwaitingAnswer,
} from "@/services/admin-request";

/**
 * ADMIN → SERVICE → PR DETACH (owner, 20 Nov 2026 — "Keep rule, real admin
 * request").
 *
 * An agency may let a PR go on its own once that PR has been on its roster for
 * a year. Under a year, Manage PR files a `pr_detach` request instead, and it
 * lands here. Approve ends THAT agency's membership (`agency_pr` → 'left', the
 * same thing Detach writes — never a hard delete); Decline keeps the PR. The
 * agency is told either way, and every answer shows the server's own sentence.
 *
 * Its own page rather than a row on Plan Request: that inbox is about prices
 * (Resolve applies one to billing), and the server refuses Resolve on a detach
 * request for exactly that reason. The PR's name is read server-side through
 * `subject_user_id` — nothing on the request copies it.
 */
export const Route = createFileRoute("/admin/service/pr-detach")({
	component: PrDetachPage,
	head: () => ({
		meta: [{ title: "PR Detach — Innocenz Admin" }],
	}),
});

type StatusFilter = "waiting" | "all";

const statusBadgeColors: Partial<Record<AdminRequestStatus, string>> = {
	pending:
		"border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
	contacted:
		"border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
	approved:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	declined: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
	withdrawn: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

function statusLabel(status: AdminRequestStatus, t: PortalTranslations) {
	switch (status) {
		case "pending":
			return t.admin.statusPending;
		case "contacted":
			return t.adminRequests.statusContacted;
		case "approved":
			return t.adminRequests.statusApproved;
		case "declined":
			return t.adminRequests.statusDeclined;
		case "withdrawn":
			return t.adminRequests.statusWithdrawn;
		default:
			return status;
	}
}

function PrDetachPage() {
	const { t } = usePortalLocale();
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const orgNames = useCurrentOrgNames();
	// The rail badge's own number, so the waiting strip cannot disagree with it.
	const { counts } = useAdminTodoCounts();
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("waiting");
	const [open, setOpen] = useState<AdminRequest | null>(null);

	const requestsQuery = useQuery({
		queryKey: ["admin-requests", "pr-detach", statusFilter],
		queryFn: () =>
			fetchAdminRequests(
				{
					type: "pr_detach",
					...(statusFilter === "waiting" ? { status: "pending" } : {}),
					page: 1,
					pageSize: 100,
				},
				logout,
			),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
	});
	const records = requestsQuery.data?.data ?? [];

	const answered = (fallback: string) => (response: { message: string }) => {
		// "admin-requests" is the prefix the badges, the bell and the to-do
		// panel share, so all of them drop at once.
		queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
		toast.success(response.message || fallback);
		setOpen(null);
	};
	const refused = (error: unknown) => {
		queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
		toast.error(
			toMutationError(error, t.prDetachAdmin.toastFailed)?.message ??
				t.prDetachAdmin.toastFailed,
		);
	};

	const approveMutation = useMutation({
		mutationFn: (id: string) => approvePrDetach(id, logout),
		onSuccess: answered(t.prDetachAdmin.toastApproved),
		onError: refused,
	});
	const declineMutation = useMutation({
		mutationFn: (id: string) => declineRequest(id, logout),
		onSuccess: answered(t.prDetachAdmin.toastDeclined),
		onError: refused,
	});
	const busy = approveMutation.isPending || declineMutation.isPending;

	const agencyName = (request: AdminRequest) =>
		currentOrgName(
			orgNames,
			request.subscriberType,
			request.subscriberId,
			request.subscriberName,
		);
	const prName = (request: AdminRequest) =>
		request.subjectName?.trim() || t.prDetachAdmin.unknownPr;

	return (
		<PageShell>
			<PageHeader
				icon={UserMinus}
				title={t.admin.navPrDetach}
				description={t.prDetachAdmin.pageDescription}
			/>

			<Card className="border-(--lavender-soft)/40 bg-card">
				<CardHeader>
					<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
						<div>
							<CardTitle>{t.prDetachAdmin.cardTitle}</CardTitle>
							<CardDescription>{t.prDetachAdmin.cardHint}</CardDescription>
						</div>
						<Select
							value={statusFilter}
							onValueChange={(value) => setStatusFilter(value as StatusFilter)}
						>
							<SelectTrigger
								className="sm:w-40"
								aria-label={t.admin.filterByStatus}
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent position="popper" align="start">
								<SelectItem value="waiting">
									{t.prDetachAdmin.filterWaiting}
								</SelectItem>
								<SelectItem value="all">{t.prDetachAdmin.filterAll}</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<QueueWaitingStrip
						count={counts.prDetach}
						showingWaiting={statusFilter === "waiting"}
						onShowWaiting={() => setStatusFilter("waiting")}
						onShowAll={() => setStatusFilter("all")}
					/>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t.prDetachAdmin.colPr}</TableHead>
								<TableHead>{t.prDetachAdmin.colAgency}</TableHead>
								<TableHead>{t.prDetachAdmin.colNote}</TableHead>
								<TableHead>{t.prDetachAdmin.colStatus}</TableHead>
								<TableHead>{t.prDetachAdmin.colRequested}</TableHead>
								<TableHead className="text-right">
									{t.prDetachAdmin.colAction}
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{requestsQuery.isLoading ? (
								<TableRow>
									<TableCell colSpan={6} className="h-32">
										<div className="flex items-center justify-center">
											<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
										</div>
									</TableCell>
								</TableRow>
							) : requestsQuery.isError ? (
								<TableRow>
									<TableCell colSpan={6} className="h-32">
										<div className="flex flex-col items-center justify-center gap-3">
											<AlertCircle className="h-8 w-8 text-destructive" />
											<p className="font-medium text-destructive">
												{t.prDetachAdmin.failedToLoad}
											</p>
											<p className="text-muted-foreground">
												{getErrorMessage(requestsQuery.error)}
											</p>
											<Button
												variant="outline"
												size="sm"
												onClick={() => requestsQuery.refetch()}
											>
												<RefreshCw className="mr-2 h-4 w-4" />
												{t.admin.tryAgain}
											</Button>
										</div>
									</TableCell>
								</TableRow>
							) : records.length === 0 ? (
								<TableRow>
									<TableCell colSpan={6} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
											<UserMinus className="h-6 w-6" />
											<span>{t.prDetachAdmin.empty}</span>
										</div>
									</TableCell>
								</TableRow>
							) : (
								records.map((request) => {
									// Pending = what the badge counts (amber edge); contacted is
									// still answerable; anything else is history.
									const queueState =
										request.status === "pending"
											? "decide"
											: isAwaitingAnswer(request.status)
												? "open"
												: "done";
									return (
										<TableRow
											key={request.id}
											className="cursor-pointer hover:bg-muted/30"
											onClick={() => setOpen(request)}
											{...queueRowState(queueState)}
										>
											<TableCell
												data-label={t.prDetachAdmin.colPr}
												className="font-medium"
											>
												{prName(request)}
											</TableCell>
											<TableCell data-label={t.prDetachAdmin.colAgency}>
												{agencyName(request)}
											</TableCell>
											<TableCell
												data-label={t.prDetachAdmin.colNote}
												className="max-w-xs truncate text-muted-foreground"
											>
												{request.message?.trim() || "—"}
											</TableCell>
											<TableCell data-label={t.prDetachAdmin.colStatus}>
												<Badge
													variant="outline"
													className={`${statusBadgeColors[request.status] ?? ""} w-fit`}
												>
													{statusLabel(request.status, t)}
												</Badge>
											</TableCell>
											<TableCell
												data-label={t.prDetachAdmin.colRequested}
												className="text-muted-foreground"
											>
												<DateTimeCell value={request.createdAt} />
											</TableCell>
											<TableCell className="text-right">
												<QueueRowButton
													state={queueState}
													onOpen={() => setOpen(request)}
												/>
											</TableCell>
										</TableRow>
									);
								})
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<Sheet
				open={open !== null}
				onOpenChange={(next) => {
					if (!next) setOpen(null);
				}}
			>
				<SheetContent
					side="right"
					className="admin-finance-sheet w-full sm:max-w-xl"
				>
					{open && (
						<>
							<SheetHeader>
								<SheetTitle>{t.prDetachAdmin.sheetTitle}</SheetTitle>
								<SheetDescription>
									{prName(open)} · {agencyName(open)}
								</SheetDescription>
							</SheetHeader>
							<div className="flex flex-col gap-4 px-4">
								<div>
									<p className="text-muted-foreground">
										{t.prDetachAdmin.colNote}
									</p>
									<p>{open.message?.trim() || t.prDetachAdmin.noNote}</p>
								</div>
								<div>
									<p className="text-muted-foreground">
										{t.prDetachAdmin.colRequested}
									</p>
									<DateTimeCell value={open.createdAt} />
								</div>
								{isAwaitingAnswer(open.status) ? (
									<div className="flex flex-col gap-2">
										<p>
											{fill(t.prDetachAdmin.approveConsequence, {
												pr: prName(open),
												agency: agencyName(open),
											})}
										</p>
										<p className="text-muted-foreground">
											{fill(t.prDetachAdmin.declineConsequence, {
												pr: prName(open),
												agency: agencyName(open),
											})}
										</p>
									</div>
								) : (
									<div className="flex items-center gap-2">
										<Badge
											variant="outline"
											className={`${statusBadgeColors[open.status] ?? ""} w-fit`}
										>
											{statusLabel(open.status, t)}
										</Badge>
										<span className="text-muted-foreground">
											{t.prDetachAdmin.answered}
										</span>
									</div>
								)}
							</div>
							<SheetFooter className="flex-row justify-end gap-2">
								<SheetClose asChild>
									<Button type="button" variant="outline">
										{t.common.cancel}
									</Button>
								</SheetClose>
								{isAwaitingAnswer(open.status) && (
									<>
										<Button
											type="button"
											variant="outline"
											disabled={busy}
											onClick={() => declineMutation.mutate(open.id)}
										>
											{t.prDetachAdmin.decline}
										</Button>
										<Button
											type="button"
											disabled={busy}
											aria-busy={approveMutation.isPending || undefined}
											onClick={() => approveMutation.mutate(open.id)}
										>
											{approveMutation.isPending && (
												<Loader2 className="mr-2 h-4 w-4 animate-spin" />
											)}
											{t.prDetachAdmin.approveDetach}
										</Button>
									</>
								)}
							</SheetFooter>
						</>
					)}
				</SheetContent>
			</Sheet>
		</PageShell>
	);
}
