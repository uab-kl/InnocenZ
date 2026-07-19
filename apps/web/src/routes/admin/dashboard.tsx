import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Ban,
	Building2,
	CheckCircle2,
	ExternalLink,
	FileText,
	Handshake,
	LayoutGrid,
	Loader2,
	Settings,
	Store,
	UserPlus,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DonutChart, type DonutSlice } from "@/components/ui/donut-chart";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { useAuth } from "@/lib/auth-context";
import { formatDate, formatNumber, getErrorMessage } from "@/lib/utils";
import {
	type AdminRequest,
	fetchAdminRequests,
	fetchPendingCount,
} from "@/services/admin-request";
import { type Agency, fetchAgencies } from "@/services/agency";
import { type AuditLog, fetchAuditLogs } from "@/services/audit-log";
import { fetchOutlets, type Outlet } from "@/services/outlet";
import {
	fetchAdminPendingJobs,
	fetchSpecialServiceSummary,
	type SpecialService,
	type SpecialServiceStatus,
} from "@/services/special-service";

export const Route = createFileRoute("/admin/dashboard")({
	component: DashboardComponent,
	head: () => ({
		meta: [{ title: "Dashboard — Innocenz Admin" }],
	}),
});

const REQUEST_TYPE_LABELS: Record<AdminRequest["type"], string> = {
	pos_integration_quote: "POS quote",
	custom_renegotiation: "Custom",
	plan_change: "Plan change",
	contact: "Contact",
	other: "Other",
};

type TodoHref =
	| "/admin/user-management/agency"
	| "/admin/user-management/outlet"
	| "/admin/service/requests"
	| "/admin/service/other";

type TodoItem = {
	id: string;
	title: string;
	detail: string;
	badge: string;
	href: TodoHref;
	priority: "high" | "medium";
};

type Tone = "live" | "warn" | "lavender" | "muted" | "danger";

const TONE_CHIP: Record<Tone, string> = {
	live: "bg-[color:var(--signal-live-soft)] text-[color:var(--signal-live)]",
	warn: "bg-[color:var(--signal-warn-soft)] text-[color:var(--signal-warn)]",
	lavender: "bg-[color:var(--lavender-soft)] text-lavender",
	muted: "bg-muted text-muted-foreground",
	danger: "bg-destructive/15 text-destructive",
};

const STATUS_META: Record<string, { label: string; tone: Tone }> = {
	pending_review: { label: "Pending", tone: "warn" },
	active: { label: "Active", tone: "live" },
	inactive: { label: "Inactive", tone: "muted" },
	suspended: { label: "Suspended", tone: "danger" },
};

// Breakdown-donut colours, keyed to design tokens (light/dark aware).
const ORG_STATUS_COLOR = {
	active: "var(--signal-live)",
	pending: "var(--signal-warn)",
	suspended: "var(--destructive)",
	inactive: "var(--muted-foreground)",
} as const;

const JOB_STATUS_META: {
	key: SpecialServiceStatus;
	label: string;
	color: string;
}[] = [
	{ key: "open", label: "Open", color: "var(--lavender)" },
	{ key: "assigned", label: "Assigned", color: "var(--chart-3)" },
	{ key: "in_progress", label: "In progress", color: "var(--signal-warn)" },
	{ key: "completed", label: "Completed", color: "var(--signal-live)" },
	{ key: "cancelled", label: "Cancelled", color: "var(--muted-foreground)" },
];

type RegRow = {
	id: string;
	name: string;
	code: string;
	kind: "agency" | "outlet";
	typeLabel: string;
	typeTone: Tone;
	status: string;
	date: string;
	createdAt: string;
};

function initialsOf(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "??";
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[1][0]).toUpperCase();
}

function timeAgo(iso: string): string {
	const then = new Date(iso).getTime();
	if (Number.isNaN(then)) return "";
	const secs = Math.floor((Date.now() - then) / 1000);
	if (secs < 60) return "just now";
	const mins = Math.floor(secs / 60);
	if (mins < 60) return `${mins} min ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
	const days = Math.floor(hrs / 24);
	if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
	return formatDate(iso);
}

const ACTION_VERBS: Record<string, string> = {
	CREATE: "created",
	UPDATE: "updated",
	DELETE: "deleted",
	APPROVE: "approved",
	REJECT: "rejected",
	SUSPEND: "suspended",
	LOGIN: "signed in",
	LOGOUT: "signed out",
};

function describeActivity(log: AuditLog): {
	who: string;
	what: string;
	Icon: typeof CheckCircle2;
	tone: Tone;
} {
	const action = (log.action ?? "").toUpperCase();
	const verb = ACTION_VERBS[action] ?? log.action?.toLowerCase() ?? "changed";
	const entityLabel = (log.entity ?? "record").replace(/_/g, " ");
	const who =
		log.username ||
		(log.role ? log.role[0].toUpperCase() + log.role.slice(1) : "System");

	let Icon = FileText;
	let tone: Tone = "lavender";
	if (action.includes("APPROVE")) {
		Icon = CheckCircle2;
		tone = "live";
	} else if (action.includes("CREATE")) {
		Icon = UserPlus;
		tone = "lavender";
	} else if (
		action.includes("DELETE") ||
		action.includes("REJECT") ||
		action.includes("SUSPEND")
	) {
		Icon = Ban;
		tone = "danger";
	}

	return { who, what: `${verb} ${entityLabel}`, Icon, tone };
}

function DashboardComponent() {
	const { user } = useCurrentUser();
	const { logout } = useAuth();
	const [regFilter, setRegFilter] = useState<"all" | "agency" | "outlet">(
		"all",
	);

	const pendingAgenciesQuery = useQuery({
		queryKey: ["dashboard", "pending-agencies-list"],
		queryFn: () =>
			fetchAgencies({ status: "pending_review", page: 1, pageSize: 5 }, logout),
		staleTime: 30_000,
	});

	const pendingOutletsQuery = useQuery({
		queryKey: ["dashboard", "pending-outlets-list"],
		queryFn: () =>
			fetchOutlets({ status: "pending_review", page: 1, pageSize: 5 }, logout),
		staleTime: 30_000,
	});

	const pendingRequestsCountQuery = useQuery({
		queryKey: ["dashboard", "pending-requests-count"],
		queryFn: () => fetchPendingCount(logout),
		staleTime: 30_000,
	});

	const openRequestsQuery = useQuery({
		queryKey: ["dashboard", "open-requests-list"],
		queryFn: () =>
			fetchAdminRequests({ status: "pending", page: 1, pageSize: 5 }, logout),
		staleTime: 30_000,
	});

	const contactedRequestsQuery = useQuery({
		queryKey: ["dashboard", "contacted-requests-list"],
		queryFn: () =>
			fetchAdminRequests({ status: "contacted", page: 1, pageSize: 5 }, logout),
		staleTime: 30_000,
	});

	const pendingJobsQuery = useQuery({
		queryKey: ["dashboard", "pending-jobs-list"],
		queryFn: () => fetchAdminPendingJobs({ page: 1, pageSize: 5 }, logout),
		staleTime: 30_000,
	});

	const activeAgenciesQuery = useQuery({
		queryKey: ["dashboard", "active-agencies-count"],
		queryFn: () =>
			fetchAgencies({ status: "active", page: 1, pageSize: 1 }, logout),
		staleTime: 60_000,
	});

	const activeOutletsQuery = useQuery({
		queryKey: ["dashboard", "active-outlets-count"],
		queryFn: () =>
			fetchOutlets({ status: "active", page: 1, pageSize: 1 }, logout),
		staleTime: 60_000,
	});

	// Remaining status buckets so the breakdown donuts show the full picture.
	const inactiveAgenciesQuery = useQuery({
		queryKey: ["dashboard", "inactive-agencies-count"],
		queryFn: () =>
			fetchAgencies({ status: "inactive", page: 1, pageSize: 1 }, logout),
		staleTime: 60_000,
	});

	const suspendedAgenciesQuery = useQuery({
		queryKey: ["dashboard", "suspended-agencies-count"],
		queryFn: () =>
			fetchAgencies({ status: "suspended", page: 1, pageSize: 1 }, logout),
		staleTime: 60_000,
	});

	const inactiveOutletsQuery = useQuery({
		queryKey: ["dashboard", "inactive-outlets-count"],
		queryFn: () =>
			fetchOutlets({ status: "inactive", page: 1, pageSize: 1 }, logout),
		staleTime: 60_000,
	});

	const suspendedOutletsQuery = useQuery({
		queryKey: ["dashboard", "suspended-outlets-count"],
		queryFn: () =>
			fetchOutlets({ status: "suspended", page: 1, pageSize: 1 }, logout),
		staleTime: 60_000,
	});

	const jobsSummaryQuery = useQuery({
		queryKey: ["dashboard", "jobs-summary"],
		queryFn: () => fetchSpecialServiceSummary(logout),
		staleTime: 60_000,
	});

	const recentAgenciesQuery = useQuery({
		queryKey: ["dashboard", "recent-agencies"],
		queryFn: () => fetchAgencies({ page: 1, pageSize: 6 }, logout),
		staleTime: 30_000,
	});

	const recentOutletsQuery = useQuery({
		queryKey: ["dashboard", "recent-outlets"],
		queryFn: () => fetchOutlets({ page: 1, pageSize: 6 }, logout),
		staleTime: 30_000,
	});

	const activityQuery = useQuery({
		queryKey: ["dashboard", "recent-activity"],
		queryFn: () =>
			fetchAuditLogs({
				page: 1,
				pageSize: 6,
				sortField: "CREATED_AT",
				sortDirection: "DESC",
			}),
		staleTime: 30_000,
	});

	const agencyCount = pendingAgenciesQuery.data?.pagination.totalCount ?? 0;
	const outletCount = pendingOutletsQuery.data?.pagination.totalCount ?? 0;
	const requestCount = pendingRequestsCountQuery.data?.pending ?? 0;
	const jobCount = pendingJobsQuery.data?.pagination.totalCount ?? 0;
	const activeAgencyCount =
		activeAgenciesQuery.data?.pagination.totalCount ?? 0;
	const activeOutletCount = activeOutletsQuery.data?.pagination.totalCount ?? 0;
	const inactiveAgencyCount =
		inactiveAgenciesQuery.data?.pagination.totalCount ?? 0;
	const suspendedAgencyCount =
		suspendedAgenciesQuery.data?.pagination.totalCount ?? 0;
	const inactiveOutletCount =
		inactiveOutletsQuery.data?.pagination.totalCount ?? 0;
	const suspendedOutletCount =
		suspendedOutletsQuery.data?.pagination.totalCount ?? 0;

	const agencyBreakdown: DonutSlice[] = [
		{
			key: "active",
			label: "Active",
			value: activeAgencyCount,
			color: ORG_STATUS_COLOR.active,
		},
		{
			key: "pending",
			label: "Pending",
			value: agencyCount,
			color: ORG_STATUS_COLOR.pending,
		},
		{
			key: "suspended",
			label: "Suspended",
			value: suspendedAgencyCount,
			color: ORG_STATUS_COLOR.suspended,
		},
		{
			key: "inactive",
			label: "Inactive",
			value: inactiveAgencyCount,
			color: ORG_STATUS_COLOR.inactive,
		},
	];
	const outletBreakdown: DonutSlice[] = [
		{
			key: "active",
			label: "Active",
			value: activeOutletCount,
			color: ORG_STATUS_COLOR.active,
		},
		{
			key: "pending",
			label: "Pending",
			value: outletCount,
			color: ORG_STATUS_COLOR.pending,
		},
		{
			key: "suspended",
			label: "Suspended",
			value: suspendedOutletCount,
			color: ORG_STATUS_COLOR.suspended,
		},
		{
			key: "inactive",
			label: "Inactive",
			value: inactiveOutletCount,
			color: ORG_STATUS_COLOR.inactive,
		},
	];
	const jobsByStatus = jobsSummaryQuery.data?.data;
	const jobsBreakdown: DonutSlice[] = JOB_STATUS_META.map((meta) => ({
		key: meta.key,
		label: meta.label,
		value: jobsByStatus?.[meta.key] ?? 0,
		color: meta.color,
	}));

	const agencyBreakdownLoading =
		activeAgenciesQuery.isLoading ||
		pendingAgenciesQuery.isLoading ||
		suspendedAgenciesQuery.isLoading ||
		inactiveAgenciesQuery.isLoading;
	const outletBreakdownLoading =
		activeOutletsQuery.isLoading ||
		pendingOutletsQuery.isLoading ||
		suspendedOutletsQuery.isLoading ||
		inactiveOutletsQuery.isLoading;

	const breakdowns: {
		id: string;
		title: string;
		slices: DonutSlice[];
		centerLabel: string;
		isLoading: boolean;
	}[] = [
		{
			id: "agencies",
			title: "PR Agencies by status",
			slices: agencyBreakdown,
			centerLabel: "agencies",
			isLoading: agencyBreakdownLoading,
		},
		{
			id: "outlets",
			title: "Outlets by status",
			slices: outletBreakdown,
			centerLabel: "outlets",
			isLoading: outletBreakdownLoading,
		},
		{
			id: "jobs",
			title: "Jobs by status",
			slices: jobsBreakdown,
			centerLabel: "jobs",
			isLoading: jobsSummaryQuery.isLoading,
		},
	];

	const systemOk = ![
		pendingAgenciesQuery,
		pendingOutletsQuery,
		pendingRequestsCountQuery,
		pendingJobsQuery,
	].some((q) => q.isError);

	const cards: KpiCardProps[] = [
		{
			id: "agencies",
			title: "Pending PR Agencies",
			description: "Signups awaiting approval",
			href: "/admin/user-management/agency",
			icon: Building2,
			count: agencyCount,
			numberTone: agencyCount > 0 ? "foreground" : "muted",
			signal:
				agencyCount > 0
					? { label: "Needs approval", tone: "warn" }
					: { label: "All clear", tone: "lavender" },
			isLoading: pendingAgenciesQuery.isLoading,
			isError: pendingAgenciesQuery.isError,
			error: pendingAgenciesQuery.error,
		},
		{
			id: "outlets",
			title: "Pending Outlets",
			description: "Venues awaiting approval",
			href: "/admin/user-management/outlet",
			icon: Store,
			count: outletCount,
			numberTone: outletCount > 0 ? "foreground" : "muted",
			signal:
				outletCount > 0
					? { label: "Needs approval", tone: "warn" }
					: { label: "All clear", tone: "lavender" },
			isLoading: pendingOutletsQuery.isLoading,
			isError: pendingOutletsQuery.isError,
			error: pendingOutletsQuery.error,
		},
		{
			id: "requests",
			title: "Plan requests",
			description: "POS quotes & plan changes",
			href: "/admin/service/requests",
			icon: Handshake,
			count: requestCount,
			numberTone: requestCount > 0 ? "gold" : "muted",
			signal:
				requestCount > 0
					? { label: "Needs quote", tone: "warn" }
					: { label: "All clear", tone: "lavender" },
			isLoading: pendingRequestsCountQuery.isLoading,
			isError: pendingRequestsCountQuery.isError,
			error: pendingRequestsCountQuery.error,
		},
		{
			id: "jobs",
			title: "Job postings",
			description: "Agency jobs to review",
			href: "/admin/service/other",
			icon: LayoutGrid,
			count: jobCount,
			numberTone: jobCount > 0 ? "foreground" : "muted",
			signal:
				jobCount > 0
					? { label: "Needs review", tone: "warn" }
					: { label: "All clear", tone: "lavender" },
			isLoading: pendingJobsQuery.isLoading,
			isError: pendingJobsQuery.isError,
			error: pendingJobsQuery.error,
		},
	];

	const todosLoading =
		pendingAgenciesQuery.isLoading ||
		pendingOutletsQuery.isLoading ||
		openRequestsQuery.isLoading ||
		contactedRequestsQuery.isLoading ||
		pendingJobsQuery.isLoading;

	const todos: TodoItem[] = [
		...(pendingAgenciesQuery.data?.data ?? []).map(
			(agency: Agency): TodoItem => ({
				id: `agency-${agency.id}`,
				title: `Approve PR Agency: ${agency.name}`,
				detail: `Code ${agency.agencyCode} · submitted ${formatDate(agency.createdAt)}`,
				badge: "Org approval",
				href: "/admin/user-management/agency",
				priority: "high",
			}),
		),
		...(pendingOutletsQuery.data?.data ?? []).map(
			(outlet: Outlet): TodoItem => ({
				id: `outlet-${outlet.id}`,
				title: `Approve Outlet: ${outlet.name}`,
				detail: `Submitted ${formatDate(outlet.createdAt)}`,
				badge: "Org approval",
				href: "/admin/user-management/outlet",
				priority: "high",
			}),
		),
		...(openRequestsQuery.data?.data ?? []).map(
			(request: AdminRequest): TodoItem => ({
				id: `request-${request.id}`,
				title: `Quote for ${request.subscriberName}`,
				detail: `${REQUEST_TYPE_LABELS[request.type]} · pending · ${formatDate(request.createdAt)}`,
				badge: "Plan request",
				href: "/admin/service/requests",
				priority: "high",
			}),
		),
		...(contactedRequestsQuery.data?.data ?? []).map(
			(request: AdminRequest): TodoItem => ({
				id: `request-contacted-${request.id}`,
				title: `Finish quote: ${request.subscriberName}`,
				detail: `${REQUEST_TYPE_LABELS[request.type]} · contacted — set negotiated price`,
				badge: "Reminder",
				href: "/admin/service/requests",
				priority: "medium",
			}),
		),
		...(pendingJobsQuery.data?.data ?? []).map(
			(job: SpecialService): TodoItem => ({
				id: `job-${job.id}`,
				title: `Review job: ${job.title}`,
				detail: `${job.postingAgencyName || "Agency"} · ${job.category}`,
				badge: "Job posting",
				href: "/admin/service/other",
				priority: "high",
			}),
		),
	];

	const attentionCount =
		agencyCount +
		outletCount +
		requestCount +
		jobCount +
		(contactedRequestsQuery.data?.pagination.totalCount ?? 0);

	const snapshot: { value: number; label: string; tone: Tone }[] = [
		{ value: agencyCount, label: "Agencies pending", tone: "lavender" },
		{ value: outletCount, label: "Outlets pending", tone: "lavender" },
		{ value: activeAgencyCount, label: "Active agencies", tone: "live" },
		{ value: activeOutletCount, label: "Active outlets", tone: "live" },
	];
	const snapshotLoading =
		pendingAgenciesQuery.isLoading ||
		pendingOutletsQuery.isLoading ||
		activeAgenciesQuery.isLoading ||
		activeOutletsQuery.isLoading;

	const registrations: RegRow[] = [
		...(recentAgenciesQuery.data?.data ?? []).map(
			(a: Agency): RegRow => ({
				id: `agency-${a.id}`,
				name: a.name,
				code: a.agencyCode,
				kind: "agency",
				typeLabel: "PR Agency",
				typeTone: "lavender",
				status: a.status,
				date: formatDate(a.createdAt),
				createdAt: a.createdAt,
			}),
		),
		...(recentOutletsQuery.data?.data ?? []).map(
			(o: Outlet): RegRow => ({
				id: `outlet-${o.id}`,
				name: o.name,
				code: o.ssmNo ? `SSM ${o.ssmNo}` : "Outlet",
				kind: "outlet",
				typeLabel: "Outlet",
				typeTone: "live",
				status: o.status,
				date: formatDate(o.createdAt),
				createdAt: o.createdAt,
			}),
		),
	]
		.sort(
			(a, b) =>
				new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
		)
		.filter((r) => regFilter === "all" || r.kind === regFilter)
		.slice(0, 8);
	const registrationsLoading =
		recentAgenciesQuery.isLoading || recentOutletsQuery.isLoading;

	const activityItems = activityQuery.data?.query ?? [];

	return (
		<div className="flex flex-col gap-6 p-6 md:p-8">
			{/* Page head */}
			<div className="flex flex-wrap items-end justify-between gap-5">
				<div>
					<div
						className={`mb-3.5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.16em] ${
							systemOk
								? "border-[color:var(--royal-gold-line)] bg-[color:var(--royal-gold-soft)] text-[color:var(--royal-gold)]"
								: "border-[color:var(--signal-warn)]/40 bg-[color:var(--signal-warn-soft)] text-[color:var(--signal-warn)]"
						}`}
					>
						<span
							className="h-1.5 w-1.5 rounded-full shadow-[0_0_8px_currentColor]"
							style={{
								background: systemOk
									? "var(--signal-live)"
									: "var(--signal-warn)",
							}}
							aria-hidden
						/>
						{systemOk ? "System operational" : "Checking services"}
					</div>
					<h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
						Dashboard
					</h1>
					<p className="mt-1.5 text-[15px] text-muted-foreground">
						Welcome back{user?.displayName ? `, ${user.displayName}` : ""} —
						here's what needs your attention today.
					</p>
				</div>
				<div className="flex flex-wrap gap-3">
					<Button asChild variant="outline" size="lg" className="h-11 px-4">
						<Link to="/admin/settings">
							<Settings className="opacity-80" />
							Settings
						</Link>
					</Button>
					<Button
						asChild
						size="lg"
						className="h-11 border-0 bg-[image:var(--gradient-royal)] px-5 font-bold text-[#1a1726] shadow-[0_8px_24px_color-mix(in_oklab,#e8c874_25%,transparent)] hover:brightness-105"
					>
						<a
							href="https://ng8522.github.io/InnocenZ-proto/"
							target="_blank"
							rel="noopener noreferrer"
							className="!text-[#1a1726] no-underline hover:!text-[#1a1726]"
						>
							Open prototype
							<ExternalLink className="opacity-80" />
						</a>
					</Button>
				</div>
			</div>

			{/* KPI cards */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{cards.map((card) => (
					<KpiCard key={card.id} {...card} />
				))}
			</div>

			{/* Platform breakdown — status distribution donuts */}
			<section className="overflow-hidden rounded-2xl border bg-card">
				<div className="border-b px-6 py-5">
					<h2 className="text-lg font-extrabold">Platform breakdown</h2>
					<p className="mt-0.5 text-[13px] text-muted-foreground">
						Live status distribution across organizations and jobs.
					</p>
				</div>
				<div className="grid grid-cols-1 divide-y lg:grid-cols-3 lg:divide-x lg:divide-y-0">
					{breakdowns.map((b) => (
						<div key={b.id} className="px-6 py-6">
							<h3 className="mb-4 text-[13.5px] font-bold text-foreground">
								{b.title}
							</h3>
							{b.isLoading ? (
								<div className="flex h-[168px] items-center gap-2 text-sm text-muted-foreground">
									<Loader2 className="h-4 w-4 animate-spin" />
									Loading…
								</div>
							) : (
								<DonutChart slices={b.slices} centerLabel={b.centerLabel} />
							)}
						</div>
					))}
				</div>
			</section>

			{/* Middle: action items + right rail */}
			<div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:grid-rows-[auto_auto]">
				{/* Action items — left column, row 1 */}
				<section className="overflow-hidden rounded-2xl border bg-card xl:col-start-1 xl:row-start-1">
					<div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-5">
						<div>
							<h2 className="text-lg font-extrabold">Today's action items</h2>
							<p className="mt-0.5 text-[13px] text-muted-foreground">
								Approvals, quotes & job reviews — click any row to handle it.
							</p>
						</div>
						{!todosLoading && (
							<span
								className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
									attentionCount > 0 ? TONE_CHIP.warn : TONE_CHIP.live
								}`}
							>
								{attentionCount > 0
									? `${formatNumber(attentionCount)} need attention`
									: "All clear"}
							</span>
						)}
					</div>

					{todosLoading ? (
						<div className="flex items-center gap-2 px-6 py-10 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							Loading today's reminders…
						</div>
					) : todos.length === 0 ? (
						<div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center text-muted-foreground">
							<CheckCircle2 className="h-8 w-8 text-[color:var(--signal-live)]/80" />
							<p className="text-sm font-medium text-foreground">
								Nothing urgent right now
							</p>
							<p className="max-w-sm text-xs">
								New signup approvals, negotiate-price requests, and agency job
								posts will show up here.
							</p>
						</div>
					) : (
						<div>
							{todos.map((todo) => (
								<Link
									key={todo.id}
									to={todo.href}
									className="flex items-center gap-3.5 border-b px-6 py-4 no-underline transition-colors last:border-b-0 hover:bg-[color:var(--lavender-soft)]/25"
								>
									<span
										className={`h-2.5 w-2.5 shrink-0 rounded-full ${
											todo.priority === "high"
												? "bg-[color:var(--signal-warn)] shadow-[0_0_8px_var(--signal-warn)]"
												: "bg-lavender shadow-[0_0_8px_var(--lavender)]"
										}`}
										aria-hidden
									/>
									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-2">
											<span className="truncate text-sm font-bold text-foreground">
												{todo.title}
											</span>
											<span className="rounded-md bg-[color:var(--lavender-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-lavender">
												{todo.badge}
											</span>
										</div>
										<p className="mt-0.5 truncate text-xs text-muted-foreground">
											{todo.detail}
										</p>
									</div>
									<span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-bold text-lavender">
										Open
										<ArrowRight className="h-3.5 w-3.5" />
									</span>
								</Link>
							))}
						</div>
					)}
				</section>

				{/* Platform snapshot — right column, row 1 */}
				<section className="rounded-2xl border bg-[linear-gradient(160deg,var(--secondary),var(--card))] p-5 xl:col-start-2 xl:row-start-1">
					<div className="mb-4 flex items-center justify-between">
						<h3 className="text-[15px] font-extrabold">Platform snapshot</h3>
						<span className="text-[11.5px] text-muted-foreground">
							Live totals
						</span>
					</div>
					<div className="grid grid-cols-2 gap-3">
						{snapshot.map((stat) => (
							<div
								key={stat.label}
								className="rounded-xl border bg-background/50 p-3.5"
							>
								<div
									className="font-display text-3xl leading-none"
									style={{ color: `var(--${toneVar(stat.tone)})` }}
								>
									{snapshotLoading ? "—" : formatNumber(stat.value)}
								</div>
								<div className="mt-1.5 text-[11.5px] text-muted-foreground">
									{stat.label}
								</div>
							</div>
						))}
					</div>
				</section>

				{/* Recent activity — right column, row 2 */}
				<section className="rounded-2xl border bg-card p-5 xl:col-start-2 xl:row-start-2">
					<div className="mb-4 flex items-center justify-between">
						<h3 className="text-[15px] font-extrabold">Recent activity</h3>
						<Link
							to="/admin/audit-log"
							className="text-xs font-semibold text-lavender no-underline"
						>
							View all
						</Link>
					</div>

					{activityQuery.isLoading ? (
						<div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							Loading activity…
						</div>
					) : activityQuery.isError ? (
						<p className="py-2 text-xs text-muted-foreground">
							Activity feed unavailable right now.
						</p>
					) : activityItems.length === 0 ? (
						<p className="py-2 text-xs text-muted-foreground">
							No recent activity yet.
						</p>
					) : (
						<div className="flex flex-col">
							{activityItems.map((log, index) => {
								const v = describeActivity(log);
								const last = index === activityItems.length - 1;
								return (
									<div key={log.auditLogId} className="flex gap-3">
										<div className="flex flex-col items-center">
											<span
												className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${TONE_CHIP[v.tone]}`}
											>
												<v.Icon className="h-3.5 w-3.5" />
											</span>
											{!last && (
												<span className="my-1 w-0.5 flex-1 bg-border" />
											)}
										</div>
										<div className={last ? "" : "pb-4"}>
											<div className="text-[13px] leading-snug">
												<span className="font-bold">{v.who}</span>{" "}
												<span className="text-muted-foreground">{v.what}</span>
											</div>
											<div className="mt-0.5 text-[11.5px] text-muted-foreground">
												{timeAgo(log.createdAt)}
											</div>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</section>

				{/* Latest registrations — left column, row 2 */}
				<section className="overflow-hidden rounded-2xl border bg-card xl:col-start-1 xl:row-start-2">
					<div className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-5">
						<div>
							<h2 className="text-lg font-extrabold">Latest registrations</h2>
							<p className="mt-0.5 text-[13px] text-muted-foreground">
								New organizations awaiting review.
							</p>
						</div>
						<div className="flex gap-2">
							{(
								[
									{ key: "all", label: "All" },
									{ key: "agency", label: "PR Agency" },
									{ key: "outlet", label: "Outlet" },
								] as const
							).map((f) => {
								const active = regFilter === f.key;
								return (
									<button
										key={f.key}
										type="button"
										onClick={() => setRegFilter(f.key)}
										className={`rounded-lg px-3.5 py-1.5 text-[12.5px] font-bold transition-colors ${
											active
												? "bg-[image:var(--gradient-royal)] text-[#1a1726]"
												: "border bg-transparent text-muted-foreground hover:text-foreground"
										}`}
									>
										{f.label}
									</button>
								);
							})}
						</div>
					</div>

					<div className="hidden grid-cols-[2fr_1.1fr_1.1fr_1fr_96px] gap-3 border-b px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground md:grid">
						<span>Organization</span>
						<span>Type</span>
						<span>Submitted</span>
						<span>Status</span>
						<span className="text-right">Action</span>
					</div>

					{registrationsLoading ? (
						<div className="flex items-center gap-2 px-6 py-10 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							Loading registrations…
						</div>
					) : registrations.length === 0 ? (
						<div className="px-6 py-10 text-center text-sm text-muted-foreground">
							No registrations to show.
						</div>
					) : (
						registrations.map((r) => {
							const status = STATUS_META[r.status] ?? {
								label: r.status,
								tone: "muted" as Tone,
							};
							const href: TodoHref =
								r.kind === "agency"
									? "/admin/user-management/agency"
									: "/admin/user-management/outlet";
							return (
								<div
									key={r.id}
									className="grid grid-cols-1 gap-2 border-b px-6 py-4 last:border-b-0 transition-colors hover:bg-[color:var(--lavender-soft)]/20 md:grid-cols-[2fr_1.1fr_1.1fr_1fr_96px] md:items-center md:gap-3"
								>
									<div className="flex min-w-0 items-center gap-3">
										<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--lavender-soft)] text-sm font-extrabold text-lavender">
											{initialsOf(r.name)}
										</span>
										<div className="min-w-0">
											<div className="truncate text-sm font-bold">{r.name}</div>
											<div className="text-[11.5px] text-muted-foreground">
												{r.code}
											</div>
										</div>
									</div>
									<div>
										<span
											className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE_CHIP[r.typeTone]}`}
										>
											{r.typeLabel}
										</span>
									</div>
									<div className="text-[13px] text-muted-foreground">
										{r.date}
									</div>
									<div>
										<span
											className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE_CHIP[status.tone]}`}
										>
											<span className="h-1.5 w-1.5 rounded-full bg-current" />
											{status.label}
										</span>
									</div>
									<div className="md:text-right">
										<Link
											to={href}
											className="text-[12.5px] font-bold text-[color:var(--royal-gold)] no-underline"
										>
											Review →
										</Link>
									</div>
								</div>
							);
						})
					)}
				</section>
			</div>
		</div>
	);
}

function toneVar(tone: Tone): string {
	switch (tone) {
		case "live":
			return "signal-live";
		case "warn":
			return "signal-warn";
		case "danger":
			return "destructive";
		default:
			return "lavender";
	}
}

type KpiCardProps = {
	id: string;
	title: string;
	description: string;
	href: TodoHref;
	icon: React.ComponentType<{ className?: string }>;
	count: number;
	numberTone: "foreground" | "gold" | "muted";
	signal: { label: string; tone: Tone } | null;
	isLoading: boolean;
	isError: boolean;
	error: unknown;
};

function KpiCard({
	title,
	description,
	href,
	icon: Icon,
	count,
	numberTone,
	signal,
	isLoading,
	isError,
	error,
}: KpiCardProps) {
	const numberColor =
		numberTone === "gold"
			? "text-[color:var(--royal-gold)]"
			: numberTone === "muted"
				? "text-muted-foreground"
				: "text-foreground";

	return (
		<Link
			to={href}
			className="group flex flex-col gap-4 rounded-2xl border bg-card p-5 no-underline transition-all hover:-translate-y-0.5 hover:border-lavender"
		>
			<div className="flex items-start justify-between">
				<span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color:var(--lavender-soft)] text-lavender">
					<Icon className="h-5 w-5" />
				</span>
				{signal && !isLoading && !isError && (
					<span
						className={`inline-flex items-center rounded-full px-2 py-1 text-[11.5px] font-bold ${TONE_CHIP[signal.tone]}`}
					>
						{signal.label}
					</span>
				)}
			</div>
			<div>
				<div className="text-[13.5px] font-bold text-foreground">{title}</div>
				<div className="mt-0.5 text-xs text-muted-foreground">
					{description}
				</div>
			</div>
			<div className="flex items-end justify-between">
				{isLoading ? (
					<Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
				) : isError ? (
					<p className="text-xs text-destructive">{getErrorMessage(error)}</p>
				) : (
					<div
						className={`font-display text-5xl leading-[0.85] ${numberColor}`}
					>
						{formatNumber(count)}
					</div>
				)}
				<span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-lavender">
					Review
					<ArrowRight className="h-3.5 w-3.5" />
				</span>
			</div>
		</Link>
	);
}
