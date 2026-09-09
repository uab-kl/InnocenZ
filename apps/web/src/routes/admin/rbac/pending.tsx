import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertCircle,
	Building2,
	CheckCircle2,
	Clock,
	Handshake,
	LayoutGrid,
	Loader2,
	RefreshCw,
	Store,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { orgMemberIdStem } from "@/lib/member-code";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import { formatDate, getErrorMessage } from "@/lib/utils";
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
	| "/admin/service/plan-changes"
	| "/admin/service/other";

type PendingRow = {
	id: string;
	rawId: string;
	kind: "agency" | "outlet" | "request" | "job";
	typeLabel: string;
	icon: typeof Building2;
	name: string;
	detail: string;
	date: string;
	createdAt: string;
	href: PendingHref;
};

const REQUEST_TYPE_LABELS: Record<
	AdminRequest["type"],
	(t: PortalTranslations) => string
> = {
	pos_integration_quote: (t) => t.admin.reqPosQuote,
	custom_renegotiation: (t) => t.admin.reqCustom,
	plan_change: (t) => t.admin.reqPlanChange,
	contact: (t) => t.admin.reqContact,
	other: (t) => t.admin.reqOther,
};

const PAGE_SIZE = 20;

function PendingApprovalsPage() {
	const { t } = usePortalLocale();
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

	// The four sources fail independently, so a failure is shown as a banner over
	// whatever DID load — never as a replacement branch that would hide good rows.
	const loadError =
		agenciesQuery.error ??
		outletsQuery.error ??
		requestsQuery.error ??
		jobsQuery.error;
	const refetchAll = () => {
		agenciesQuery.refetch();
		outletsQuery.refetch();
		requestsQuery.refetch();
		jobsQuery.refetch();
	};

	const rows: PendingRow[] = [
		...(agenciesQuery.data?.data ?? []).map(
			(a: Agency): PendingRow => ({
				id: `agency-${a.id}`,
				rawId: a.id,
				kind: "agency",
				typeLabel: t.rbac.typePrAgency,
				icon: Building2,
				name: a.name,
				detail: orgMemberIdStem("agency", a.memberCodePrefix) ?? "—",
				date: formatDate(a.createdAt),
				createdAt: a.createdAt,
				href: "/admin/user-management/agency",
			}),
		),
		...(outletsQuery.data?.data ?? []).map(
			(o: Outlet): PendingRow => ({
				id: `outlet-${o.id}`,
				rawId: o.id,
				kind: "outlet",
				typeLabel: t.rbac.typeOutlet,
				icon: Store,
				name: o.name,
				detail: o.ssmNo ? `SSM ${o.ssmNo}` : t.rbac.venueSignup,
				date: formatDate(o.createdAt),
				createdAt: o.createdAt,
				href: "/admin/user-management/outlet",
			}),
		),
		...(requestsQuery.data?.data ?? []).map(
			(r: AdminRequest): PendingRow => ({
				id: `request-${r.id}`,
				rawId: r.id,
				kind: "request",
				typeLabel:
					r.type === "plan_change"
						? t.rbac.typePlanChange
						: t.rbac.typePlanRequest,
				icon: Handshake,
				name: r.subscriberName,
				detail: REQUEST_TYPE_LABELS[r.type](t),
				date: formatDate(r.createdAt),
				createdAt: r.createdAt,
				// The Plan Request inbox filters to its own two types, so a
				// plan_change must deep-link to the page that actually lists it.
				href:
					r.type === "plan_change"
						? "/admin/service/plan-changes"
						: "/admin/service/requests",
			}),
		),
		...(jobsQuery.data?.data ?? []).map(
			(j: SpecialService): PendingRow => ({
				id: `job-${j.id}`,
				rawId: j.id,
				kind: "job",
				typeLabel: t.rbac.typeJobPosting,
				icon: LayoutGrid,
				name: j.title,
				detail: `${j.postingAgencyName || t.rbac.agencyFallback} · ${j.category}`,
				date: formatDate(j.createdAt),
				createdAt: j.createdAt,
				href: "/admin/service/other",
			}),
		),
	].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	// Each source is capped at PAGE_SIZE, but its envelope reports the true
	// unpaginated total — so we can say when this list is not the whole story.
	const totalPending =
		(agenciesQuery.data?.pagination.totalCount ?? 0) +
		(outletsQuery.data?.pagination.totalCount ?? 0) +
		(requestsQuery.data?.pagination.totalCount ?? 0) +
		(jobsQuery.data?.pagination.totalCount ?? 0);
	const truncated = totalPending > rows.length;

	return (
		<PageShell>
			<PageHeader
				icon={Clock}
				title={t.rbac.pendingTitle}
				description={t.rbac.pendingSubtitle}
			/>

			<section className="overflow-hidden rounded-2xl border bg-card">
				{loadError && (
					<div className="flex flex-wrap items-center gap-3 border-b bg-destructive/10 px-6 py-3 text-sm">
						<AlertCircle className="h-4 w-4 text-destructive" />
						<span className="font-medium text-destructive">
							{t.rbac.pendingIncomplete}
						</span>
						<span className="text-xs text-muted-foreground">
							{getErrorMessage(loadError)}
						</span>
						<Button variant="outline" size="sm" onClick={refetchAll}>
							<RefreshCw className="mr-2 h-4 w-4" />
							{t.rbac.tryAgainCaps}
						</Button>
					</div>
				)}

				<div className="hidden grid-cols-[2fr_1.1fr_1fr_96px] gap-3 border-b px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground md:grid">
					<span>{t.rbac.colItem}</span>
					<span>{t.rbac.colType}</span>
					<span>{t.rbac.colSubmitted}</span>
					<span className="text-right">{t.rbac.colAction}</span>
				</div>

				{isLoading ? (
					<div className="flex items-center gap-2 px-6 py-12 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" />
						{t.rbac.loadingPending}
					</div>
				) : rows.length === 0 && !loadError ? (
					<div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center text-muted-foreground">
						<CheckCircle2 className="h-8 w-8 text-[color:var(--signal-live)]/80" />
						<p className="text-sm font-medium text-foreground">
							{t.rbac.nothingPending}
						</p>
						<p className="max-w-sm text-xs">{t.rbac.nothingPendingHint}</p>
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
								{row.kind === "agency" ? (
									<Link
										to="/admin/user-management/agency"
										search={{ focus: row.rawId }}
										className="text-[12.5px] font-bold text-[color:var(--royal-gold)] no-underline"
									>
										{t.rbac.review} →
									</Link>
								) : row.kind === "outlet" ? (
									<Link
										to="/admin/user-management/outlet"
										search={{ focus: row.rawId }}
										className="text-[12.5px] font-bold text-[color:var(--royal-gold)] no-underline"
									>
										{t.rbac.review} →
									</Link>
								) : (
									<Link
										to={row.href}
										className="text-[12.5px] font-bold text-[color:var(--royal-gold)] no-underline"
									>
										{t.rbac.review} →
									</Link>
								)}
							</div>
						</div>
					))
				)}

				{truncated && (
					<div className="border-t px-6 py-3 text-xs text-muted-foreground">
						{fill(t.rbac.pendingTruncated, {
							shown: rows.length,
							total: totalPending,
							perCategory: PAGE_SIZE,
						})}
					</div>
				)}
			</section>
		</PageShell>
	);
}
