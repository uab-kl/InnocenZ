import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	render,
	renderHook,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";

const api = vi.hoisted(() => ({
	agencies: vi.fn(),
	outlets: vi.fn(),
	requests: vi.fn(),
	pendingCount: vi.fn(),
	jobs: vi.fn(),
	jobSummary: vi.fn(),
	activity: vi.fn(),
}));

vi.mock("@/services/agency", () => ({ fetchAgencies: api.agencies }));
vi.mock("@/services/outlet", () => ({ fetchOutlets: api.outlets }));
vi.mock("@/services/admin-request", () => ({
	fetchAdminRequests: api.requests,
	fetchPendingCount: api.pendingCount,
}));
vi.mock("@/services/special-service", () => ({
	fetchAdminPendingJobs: api.jobs,
	fetchSpecialServiceSummary: api.jobSummary,
}));
vi.mock("@/services/audit-log", () => ({ fetchAuditLogs: api.activity }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock("@/lib/auth/use-current-user", () => ({
	useCurrentUser: () => ({ user: { displayName: "Admin reviewer" } }),
}));
vi.mock("@/lib/portal-i18n/context", () => ({
	usePortalLocale: () => ({ t: translations.en, locale: "en" }),
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-router")>()),
	Link: ({
		to,
		search,
		children,
		...props
	}: {
		to: string;
		search?: { focus?: string };
		children: ReactNode;
	}) => (
		<a
			href={`${to}${search?.focus ? `?focus=${search.focus}` : ""}`}
			{...props}
		>
			{children}
		</a>
	),
}));

import { useSidebarBadges } from "@/hooks/use-sidebar-badges";
import { Route as DashboardRoute } from "@/routes/admin/dashboard";
import { Route as PendingRoute } from "@/routes/admin/rbac/pending";

const Dashboard = DashboardRoute.options.component as ComponentType;
const Pending = PendingRoute.options.component as ComponentType;
const t = translations.en;
const clients: QueryClient[] = [];
const agency = {
	id: "agency-a",
	name: "Northview Community Agency with a long registered name",
	memberCodePrefix: "NV",
	status: "pending_review",
	createdAt: "2026-10-19T00:00:00.000Z",
};
const outlet = {
	id: "outlet-a",
	name: "Riverfront Hospitality Outlet",
	ssmNo: "202601234567",
	status: "pending_review",
	createdAt: "2026-10-20T00:00:00.000Z",
};

function response(data: unknown[]) {
	return { data, pagination: { totalCount: data.length } };
}

function show(Page: ComponentType) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: 0 } },
	});
	clients.push(client);
	render(
		<QueryClientProvider client={client}>
			<Page />
		</QueryClientProvider>,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	api.agencies.mockResolvedValue(response([agency]));
	api.outlets.mockResolvedValue(response([outlet]));
	api.requests.mockResolvedValue(response([]));
	api.pendingCount.mockResolvedValue({ pending: 3 });
	api.jobs.mockResolvedValue(response([]));
	api.jobSummary.mockResolvedValue({ data: {} });
	api.activity.mockResolvedValue({ query: [] });
});

afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
});

describe("Admin overview preserves organization data while jobs are deferred", () => {
	it("lists both organization types with original identity fields and focused review links", async () => {
		show(Pending);
		expect(await screen.findByText(agency.name)).toBeTruthy();
		expect(screen.getByText(outlet.name)).toBeTruthy();
		expect(screen.getByText(`SSM ${outlet.ssmNo}`)).toBeTruthy();
		const links = screen.getAllByRole("link", { name: /Review/ });
		expect(links.map((link) => link.getAttribute("href"))).toEqual([
			"/admin/user-management/outlet?focus=outlet-a",
			"/admin/user-management/agency?focus=agency-a",
		]);
		expect(api.requests).not.toHaveBeenCalled();
		expect(api.jobs).not.toHaveBeenCalled();
	});

	it("keeps successfully loaded approvals and the failure reason when the other source fails", async () => {
		api.agencies.mockRejectedValue(
			new Error("Agency approval service unavailable"),
		);
		show(Pending);
		expect(await screen.findByText(outlet.name)).toBeTruthy();
		expect(
			screen.getByText("Agency approval service unavailable"),
		).toBeTruthy();
		expect(
			screen.getByRole("button", { name: t.rbac.tryAgainCaps }),
		).toBeTruthy();
		expect(screen.queryByText(t.rbac.nothingPending)).toBeNull();
	});

	it("retains the Dashboard organization and plan summaries without fetching or showing deferred jobs", async () => {
		show(Dashboard);
		expect(await screen.findByText(agency.name)).toBeTruthy();
		expect(screen.getByText(outlet.name)).toBeTruthy();
		expect(screen.getByText(t.admin.kpiPendingAgencies)).toBeTruthy();
		expect(screen.getByText(t.admin.kpiPendingOutlets)).toBeTruthy();
		expect(screen.getByText(t.admin.kpiPlanRequests)).toBeTruthy();
		expect(screen.getByText(t.admin.dashAgenciesByStatus)).toBeTruthy();
		expect(screen.getByText(t.admin.dashOutletsByStatus)).toBeTruthy();
		expect(api.requests).toHaveBeenCalled();
		expect(api.jobs).not.toHaveBeenCalled();
		expect(api.jobSummary).not.toHaveBeenCalled();
		expect(screen.queryByText(t.admin.kpiJobPostings)).toBeNull();
		expect(screen.queryByText(t.admin.dashJobsByStatus)).toBeNull();
	});

	it("does not re-enable the deferred job query through the sidebar observer, while keeping organization and plan badges", async () => {
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false, gcTime: 0 } },
		});
		clients.push(client);
		// A cached job result must not leak into the hidden feature's badge.
		client.setQueryData(["dashboard", "pending-jobs-list"], response([{}, {}]));
		const { result } = renderHook(() => useSidebarBadges(), {
			wrapper: ({ children }: { children: ReactNode }) => (
				<QueryClientProvider client={client}>{children}</QueryClientProvider>
			),
		});
		await waitFor(() => expect(result.current["sidebar-user-agency"]).toBe(1));
		expect(result.current["sidebar-user-outlet"]).toBe(1);
		expect(result.current["sidebar-service-requests"]).toBe(3);
		expect(result.current["sidebar-service-plan-changes"]).toBe(3);
		expect(result.current["sidebar-service-other"]).toBe(0);
		expect(api.jobs).not.toHaveBeenCalled();
	});
});
