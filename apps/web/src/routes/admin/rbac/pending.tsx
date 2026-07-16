import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Building2,
	CheckCircle2,
	Clock,
	Handshake,
	LayoutGrid,
	Loader2,
	Store,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/admin/page-header";
import { useAuth } from "@/lib/auth-context";
import { formatDate } from "@/lib/utils";
import {
	type AdminRequest,
	fetchAdminRequests,
} from "@/services/admin-request";
import { type Agency, fetchAgencies } from "@/services/agency";
import { fetchOutlets, type Outlet } from "@/services/outlet";
import {
	fetchAdminPendingJobs,
	type SpecialService,
} from "@/services/special-service";

export const Route = createFileRoute("/admin/rbac/pending")({
	component: PendingApprovalsPage,
	head: () => ({
		meta: [{ title: "Pending Approvals — Innocenz Admin" }],
	}),
});

type PendingHref =
	| "/admin/user-management/agency"
	| "/admin/user-management/outlet"
	| "/admin/service/requests"
	| "/admin/service/other";

type PendingRow = {
	id: string;
	kind: "agency" | "outlet" | "request" | "job";
	typeLabel: string;
	icon: typeof Building2;
	name: string;
	detail: string;
	date: string;
	createdAt: string;
	href: PendingHref;
};

const REQUEST_TYPE_LABELS: Record<AdminRequest["type"], string> = {
	pos_integration_quote: "POS quote",
	custom_renegotiation: "Custom",
	plan_change: "Plan change",
	contact: "Contact",
	other: "Other",
};

const PAGE_SIZE = 20;

function PendingApprovalsPage() {
	const { logout } = useAuth();

	const agenciesQuery = useQuery({
		queryKey: ["pending-approvals", "agencies"],
		queryFn: () =>
			fetchAgencies(
				{ status: "pending_review", page: 1, pageSize: PAGE_SIZE },
				logout,
			),
		staleTime: 30_000,
	});
	const outletsQuery = useQuery({
		queryKey: ["pending-approvals", "outlets"],
		queryFn: () =>
			fetchOutlets(
				{ status: "pending_review", page: 1, pageSize: PAGE_SIZE },
				logout,
			),
		staleTime: 30_000,
	});
	const requestsQuery = useQuery({
		queryKey: ["pending-approvals", "requests"],
		queryFn: () =>
			fetchAdminRequests(
				{ status: "pending", page: 1, pageSize: PAGE_SIZE },
				logout,
			),
		staleTime: 30_000,
	});
	const jobsQuery = useQuery({
		queryKey: ["pending-approvals", "jobs"],
		queryFn: () =>
			fetchAdminPendingJobs({ page: 1, pageSize: PAGE_SIZE }, logout),
		staleTime: 30_000,
	});

	const isLoading =
		agenciesQuery.isLoading ||
		outletsQuery.isLoading ||
		requestsQuery.isLoading ||
		jobsQuery.isLoading;

	const rows: PendingRow[] = [
		...(agenciesQuery.data?.data ?? []).map(
			(a: Agency): PendingRow => ({
				id: `agency-${a.id}`,
				kind: "agency",
				typeLabel: "PR Agency",
				icon: Building2,
				name: a.name,
				detail: `Code ${a.agencyCode}`,
				date: formatDate(a.createdAt),
				createdAt: a.createdAt,
				href: "/admin/user-management/agency",
			}),
		),
		...(outletsQuery.data?.data ?? []).map(
			(o: Outlet): PendingRow => ({
				id: `outlet-${o.id}`,
				kind: "outlet",
				typeLabel: "Outlet",
				icon: Store,
				name: o.name,
				detail: o.ssmNo ? `SSM ${o.ssmNo}` : "Venue signup",
				date: formatDate(o.createdAt),
				createdAt: o.createdAt,
				href: "/admin/user-management/outlet",
			}),
		),
		...(requestsQuery.data?.data ?? []).map(
			(r: AdminRequest): PendingRow => ({
				id: `request-${r.id}`,
				kind: "request",
				typeLabel: "Plan request",
				icon: Handshake,
				name: r.subscriberName,
				detail: REQUEST_TYPE_LABELS[r.type],
				date: formatDate(r.createdAt),
				createdAt: r.createdAt,
				href: "/admin/service/requests",
			}),
		),
		...(jobsQuery.data?.data ?? []).map(
			(j: SpecialService): PendingRow => ({
				id: `job-${j.id}`,
				kind: "job",
				typeLabel: "Job posting",
				icon: LayoutGrid,
				name: j.title,
				detail: `${j.postingAgencyName || "Agency"} · ${j.category}`,
				date: formatDate(j.createdAt),
				createdAt: j.createdAt,
				href: "/admin/service/other",
			}),
		),
	].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	return (
		<PageShell>
			<PageHeader
				icon={Clock}
				title="Pending Approvals"
				description="Everything across the platform waiting on an admin decision."
			/>

			<section className="overflow-hidden rounded-2xl border bg-card">
				<div className="hidden grid-cols-[2fr_1.1fr_1fr_96px] gap-3 border-b px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground md:grid">
					<span>Item</span>
					<span>Type</span>
					<span>Submitted</span>
					<span className="text-right">Action</span>
				</div>

				{isLoading ? (
					<div className="flex items-center gap-2 px-6 py-12 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" />
						Loading pending items…
					</div>
				) : rows.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center text-muted-foreground">
						<CheckCircle2 className="h-8 w-8 text-[color:var(--signal-live)]/80" />
						<p className="text-sm font-medium text-foreground">
							Nothing pending
						</p>
						<p className="max-w-sm text-xs">
							New agency and outlet signups, plan requests, and agency job posts
							will appear here for review.
						</p>
					</div>
				) : (
					rows.map((row) => (
						<div
							key={row.id}
							className="grid grid-cols-1 gap-2 border-b px-6 py-4 transition-colors last:border-b-0 hover:bg-[color:var(--lavender-soft)]/20 md:grid-cols-[2fr_1.1fr_1fr_96px] md:items-center md:gap-3"
						>
							<div className="flex min-w-0 items-center gap-3">
								<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--lavender-soft)] text-lavender">
									<row.icon className="h-4 w-4" />
								</span>
								<div className="min-w-0">
									<div className="truncate text-sm font-bold">{row.name}</div>
									<div className="truncate text-[11.5px] text-muted-foreground">
										{row.detail}
									</div>
								</div>
							</div>
							<div>
								<span className="inline-flex rounded-full bg-[color:var(--lavender-soft)] px-2.5 py-0.5 text-xs font-bold text-lavender">
									{row.typeLabel}
								</span>
							</div>
							<div className="text-[13px] text-muted-foreground">
								{row.date}
							</div>
							<div className="md:text-right">
								<Link
									to={row.href}
									className="text-[12.5px] font-bold text-[color:var(--royal-gold)] no-underline"
								>
									Review →
								</Link>
							</div>
						</div>
					))
				)}
			</section>
		</PageShell>
	);
}
