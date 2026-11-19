import {
	type AgencySessionIdentity,
	saveAgencyIdentity,
} from "@agency-portal/lib/agency-identity";
import type { AgencySubRole } from "@agency-portal/lib/agency-rbac";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	cleanup,
	fireEvent,
	render,
	waitFor,
} from "@testing-library/react";
import { type ReactNode, useContext } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import { AgencyHomeHubTabs } from "./AgencyHomeHubTabs";
import { NavAlertSettledContext, usePortalTodoCounts } from "./NavAlertBadge";
import { PortalNavAlerts } from "./PortalNavAlerts";
import { TodoPanel } from "./TodoPanel";

/*
 * "ALL CLEAR" ONLY ONCE EVERY APPROVAL READ HAS ANSWERED (owner, 18 Nov 2026 —
 * "yes fix the to do panel").
 *
 * The panel's flag used to wait for cut-loss and MC/leave only, so it could say
 * "All clear" while sign-ups, venue links or team members were still on their
 * way, then grow an Approvals row. These tests run the REAL approval-queue
 * hooks on a real react-query client: a read has "answered" when its key holds
 * a cached answer, and is "still loading" when its fetcher has not returned.
 * Only the five payroll/billing reads, which this change does not touch, are
 * stubbed.
 */

type Fetcher = (...args: unknown[]) => Promise<unknown>;

const h = vi.hoisted(() => {
	// A request that never answers, so an enabled query with no cached answer
	// stays loading for as long as the test looks at it.
	const never: Fetcher = () => new Promise<never>(() => {});
	return {
		never,
		isAuthenticated: true,
		logout: () => {},
		payrollLoading: {
			pvs: false,
			disputes: false,
			receipts: false,
			overtime: false,
			billing: false,
		},
		fetchAgencyPrs: vi.fn<Fetcher>(never),
		fetchAgencyMembers: vi.fn<Fetcher>(never),
		fetchAgencyOutletLinks: vi.fn<Fetcher>(never),
		listCutlostRequests: vi.fn<Fetcher>(never),
		fetchShiftAssignments: vi.fn<Fetcher>(never),
	};
});

vi.mock("@/lib/auth-context", () => ({
	useAuth: () => ({ logout: h.logout, isAuthenticated: h.isAuthenticated }),
}));
vi.mock("@/services/agency", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/agency")>()),
	fetchAgencyPrs: h.fetchAgencyPrs,
	fetchAgencyMembers: h.fetchAgencyMembers,
}));
vi.mock("@/services/agency-outlet", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/agency-outlet")>()),
	fetchAgencyOutletLinks: h.fetchAgencyOutletLinks,
}));
vi.mock("@/services/cutlost", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/cutlost")>()),
	listCutlostRequests: h.listCutlostRequests,
}));
vi.mock("@/services/shift-assignment", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/shift-assignment")>()),
	fetchShiftAssignments: h.fetchShiftAssignments,
}));
vi.mock("@agency-portal/hooks/use-agency-pvs", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@agency-portal/hooks/use-agency-pvs")
	>()),
	useAgencyPvs: () => ({ pvs: [], isLoading: h.payrollLoading.pvs }),
}));
vi.mock("@agency-portal/hooks/use-agency-disputes", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@agency-portal/hooks/use-agency-disputes")
	>()),
	useAgencyDisputes: () => ({
		disputes: [],
		isLoading: h.payrollLoading.disputes,
	}),
}));
vi.mock("@agency-portal/hooks/use-agency-receipts", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@agency-portal/hooks/use-agency-receipts")
	>()),
	useAgencyReceipts: () => ({
		receipts: [],
		isLoading: h.payrollLoading.receipts,
	}),
}));
vi.mock("@agency-portal/hooks/use-agency-overtime", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@agency-portal/hooks/use-agency-overtime")
	>()),
	useAgencyOvertime: () => ({
		claims: [],
		isLoading: h.payrollLoading.overtime,
	}),
}));
vi.mock("@agency-portal/hooks/use-unpaid-billing", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@agency-portal/hooks/use-unpaid-billing")
	>()),
	useUnpaidBilling: () => ({
		periods: 0,
		isLoading: h.payrollLoading.billing,
	}),
}));
// The Today hub's other tabs — the live floor and PR photos — which the
// Approvals tab under test does not read.
vi.mock("@agency-portal/hooks/use-agency-day-roster", () => ({
	useAgencyDayRoster: () => ({
		backed: false,
		slots: [],
		agencyPRs: [],
		agencyLabel: "",
	}),
}));
vi.mock("@agency-portal/hooks/use-agency-pr-photos", () => ({
	useAgencyPrPhotos: () => () => null,
}));
vi.mock("@agency-portal/components/portal/LiveWorkforceTable", () => ({
	LiveWorkforceTable: () => null,
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-router")>()),
	Link: ({
		to,
		className,
		children,
	}: {
		to: string;
		className?: string;
		children: ReactNode;
	}) => (
		<a href={to} className={className}>
			{children}
		</a>
	),
}));

const AGENCY = "agency-test";

/** The five reads behind `approvals.total` — the Approvals row's number. */
const APPROVAL_READS = [
	"cutlost",
	"leave",
	"signups",
	"outletLinks",
	"members",
] as const;
type ApprovalRead = (typeof APPROVAL_READS)[number];

/*
 * The keys the hooks themselves build. A wrong key here seeds nothing, the
 * read stays loading on a request that never answers, and the "All clear" test
 * below fails — so these cannot silently drift from the hooks.
 */
const KEYS: Record<ApprovalRead, readonly unknown[]> = {
	cutlost: ["cutlost", "pending", "all"],
	leave: ["roster", "leave-requests"],
	signups: ["agency", "pending-prs", AGENCY],
	outletLinks: ["agency-outlet", "links", "pending"],
	members: ["agency", "members", AGENCY],
};
const ANSWERS: Record<ApprovalRead, unknown> = {
	cutlost: [],
	leave: { data: [] },
	signups: { data: [] },
	outletLinks: [],
	members: [],
};

const LANES = [
	"agency_owner",
	"agency_guarantor",
	"agency_finance",
	"agency_director",
] as const satisfies readonly AgencySubRole[];

function identity(
	subRole: AgencySubRole,
	agencyId = AGENCY,
): AgencySessionIdentity {
	return {
		userId: "user-test",
		agencyId,
		orgName: "Test agency",
		agencyCode: "AG-TEST",
		subRole,
		agencyStatus: "active",
	};
}

let renders: Array<{ loading: boolean; settled: boolean }> = [];
let clients: QueryClient[] = [];

/** Records what the panel and the rail badges were told on every render. */
function Probe() {
	const { loading } = usePortalTodoCounts();
	const settled = useContext(NavAlertSettledContext);
	renders.push({ loading, settled });
	return null;
}

function mount({
	who = identity("agency_owner"),
	signedIn = true,
	answered = APPROVAL_READS,
	hub = false,
}: {
	who?: AgencySessionIdentity | null;
	signedIn?: boolean;
	answered?: readonly ApprovalRead[];
	/** Also mount the Today hub, as agency Today does under the panel. */
	hub?: boolean;
} = {}) {
	if (who) saveAgencyIdentity(who);
	h.isAuthenticated = signedIn;
	// The production client: `new QueryClient()` with no defaults
	// (integrations/tanstack-query/root-provider.tsx).
	const client = new QueryClient();
	clients.push(client);
	// Read on the same mount but behind no flag — answered so they ask nothing.
	client.setQueryData(["roster", "leave-history"], { data: [] });
	client.setQueryData(["agency-outlet", "links", "all"], []);
	for (const read of answered) client.setQueryData(KEYS[read], ANSWERS[read]);
	return render(
		<QueryClientProvider client={client}>
			<PortalNavAlerts portal="agency">
				<TodoPanel>{null}</TodoPanel>
				{hub && <AgencyHomeHubTabs agencySubRole={who?.subRole ?? null} />}
				<Probe />
			</PortalNavAlerts>
		</QueryClientProvider>,
	);
}

/** What the screen shows, and what the badges were told, right now. */
function seen(container: HTMLElement) {
	const last = renders.at(-1);
	return {
		checking: container.querySelector(".iz-todo__checking") !== null,
		allClear: container.querySelector(".iz-todo__clear") !== null,
		loading: last?.loading,
		badgesSettled: last?.settled,
	};
}

const CHECKING = {
	checking: true,
	allClear: false,
	loading: true,
	badgesSettled: false,
};
const ALL_CLEAR = {
	checking: false,
	allClear: true,
	loading: false,
	badgesSettled: true,
};

beforeEach(() => {
	renders = [];
	sessionStorage.clear();
	localStorage.clear();
	h.isAuthenticated = true;
	for (const key of Object.keys(h.payrollLoading) as Array<
		keyof typeof h.payrollLoading
	>) {
		h.payrollLoading[key] = false;
	}
	for (const fn of [
		h.fetchAgencyPrs,
		h.fetchAgencyMembers,
		h.fetchAgencyOutletLinks,
		h.listCutlostRequests,
		h.fetchShiftAssignments,
	]) {
		fn.mockReset();
		fn.mockImplementation(h.never);
	}
});

afterEach(() => {
	cleanup();
	for (const client of clients) client.clear();
	clients = [];
	sessionStorage.clear();
	localStorage.clear();
});

describe("Agency To do panel — waits for every read behind the Approvals row", () => {
	it.each([
		["signups", () => h.fetchAgencyPrs],
		["outletLinks", () => h.fetchAgencyOutletLinks],
		["members", () => h.fetchAgencyMembers],
	] as const)("keeps 'Checking…' while %s has not answered, after cut-loss and MC/leave have", (read, fetcher) => {
		const view = mount({
			answered: APPROVAL_READS.filter((r) => r !== read),
		});
		expect(seen(view.container)).toEqual(CHECKING);
		// The read in question really is out on the wire…
		expect(fetcher()).toHaveBeenCalledTimes(1);
		// …and MC/leave really has answered, so the old cut-loss + MC/leave
		// flag would already have let go and shown "All clear" here.
		expect(h.fetchShiftAssignments).not.toHaveBeenCalled();
	});

	it.each([
		"cutlost",
		"leave",
	] as const)("still waits for %s, which it always waited on", (read) => {
		const view = mount({
			answered: APPROVAL_READS.filter((r) => r !== read),
		});
		expect(seen(view.container)).toEqual(CHECKING);
	});

	it.each([
		"pvs",
		"disputes",
		"receipts",
		"overtime",
		"billing",
	] as const)("still waits for the %s read", (read) => {
		h.payrollLoading[read] = true;
		const view = mount();
		expect(seen(view.container)).toEqual(CHECKING);
	});

	it("says 'All clear', and settles the badges, once every read has answered", () => {
		const view = mount();
		expect(seen(view.container)).toEqual(ALL_CLEAR);
		// Answered from the first frame: no "Checking…" flash at all.
		expect(renders.every((r) => !r.loading && r.settled)).toBe(true);
	});

	it.each(
		LANES,
	)("%s: settles once the reads answer, with nothing cached", async (subRole) => {
		h.fetchAgencyPrs.mockResolvedValue({ data: [] });
		h.fetchAgencyMembers.mockResolvedValue({ data: [] });
		h.fetchAgencyOutletLinks.mockResolvedValue([]);
		h.listCutlostRequests.mockResolvedValue([]);
		h.fetchShiftAssignments.mockResolvedValue({ data: [] });
		const view = mount({ who: identity(subRole), answered: [] });
		// The instrument: the same hooks, ENABLED, do hold the panel — which is
		// what makes the "never held" results below mean something.
		expect(renders[0]).toEqual({ loading: true, settled: false });
		await waitFor(() => expect(seen(view.container)).toEqual(ALL_CLEAR));
		expect(h.fetchAgencyPrs).toHaveBeenCalledWith(
			AGENCY,
			{},
			expect.any(Function),
		);
		expect(h.fetchAgencyMembers).toHaveBeenCalledWith(
			AGENCY,
			{},
			expect.any(Function),
		);
	});
});

describe("Agency To do panel — a read that is switched off never holds it", () => {
	async function expectNeverHeld(container: HTMLElement) {
		// Let any query that WAS going to start, start.
		await act(async () => {});
		expect(seen(container)).toEqual(ALL_CLEAR);
		expect(renders.length).toBeGreaterThan(0);
		expect(renders.every((r) => !r.loading && r.settled)).toBe(true);
	}

	it("no agency identity (a demo session, or a real one whose identity did not resolve)", async () => {
		// The reads such a session DOES make (cut-loss, MC/leave, venue links)
		// are answered; sign-ups and members have no agency to ask about.
		const view = mount({
			who: null,
			answered: ["cutlost", "leave", "outletLinks"],
		});
		await expectNeverHeld(view.container);
		expect(h.fetchAgencyPrs).not.toHaveBeenCalled();
		expect(h.fetchAgencyMembers).not.toHaveBeenCalled();
	});

	it("an identity whose agency id is empty", async () => {
		const view = mount({
			who: identity("agency_owner", ""),
			answered: ["cutlost", "leave", "outletLinks"],
		});
		await expectNeverHeld(view.container);
		expect(h.fetchAgencyPrs).not.toHaveBeenCalled();
		expect(h.fetchAgencyMembers).not.toHaveBeenCalled();
	});

	it("cut-loss before the session has resumed (no token yet, no venue identity)", async () => {
		const view = mount({
			signedIn: false,
			answered: APPROVAL_READS.filter((r) => r !== "cutlost"),
		});
		await expectNeverHeld(view.container);
		expect(h.listCutlostRequests).not.toHaveBeenCalled();
	});
});

/*
 * THE HUB SAYS WHAT THE PANEL SAYS (owner, 18 Nov 2026 — "yes fix the to do
 * panel"). Agency Today shows the To do panel and, under it, the hub's
 * Approvals tab. The tab chose "Loading approvals…" or "Nothing awaiting
 * approval." on the narrow cut-loss + MC/leave flag, so with sign-ups still on
 * their way the same page said "Checking…" at the top and "Nothing" below.
 */
describe("Agency Today hub — the Approvals tab waits on the same reads as To do", () => {
	const en = translations.en;

	function openApprovalsTab(container: HTMLElement) {
		const tab = [
			...container.querySelectorAll<HTMLButtonElement>(".iz-agency-home-tab"),
		].find((b) => b.textContent?.includes(en.agencyHome.pendingApprovals));
		// The instrument: the owner's hub really has the tab, so the text read
		// below is the Approvals panel and not some other tab's.
		expect(tab).toBeDefined();
		if (tab) fireEvent.click(tab);
		expect(tab?.getAttribute("aria-pressed")).toBe("true");
		return container.querySelector(".iz-approved-queue-panel")?.textContent;
	}

	it.each([
		"signups",
		"outletLinks",
		"members",
	] as const)("says 'Loading approvals…' while %s has not answered, as the panel says 'Checking…'", (read) => {
		const view = mount({
			hub: true,
			answered: APPROVAL_READS.filter((r) => r !== read),
		});
		const panel = openApprovalsTab(view.container);
		expect(panel).toContain(en.agencyHub.loadingApprovals);
		expect(panel).not.toContain(en.agencyHub.nothingAwaitingApproval);
		expect(seen(view.container)).toEqual(CHECKING);
		// The narrow flag really has let go: cut-loss and MC/leave hold an
		// answer (status success, so TanStack's isLoading is false for both —
		// cut-loss may still refetch in the background, which is not loading),
		// so it is the wider flag holding this line.
		const client = clients.at(-1);
		expect(client?.getQueryState(KEYS.cutlost)?.status).toBe("success");
		expect(client?.getQueryState(KEYS.leave)?.status).toBe("success");
		expect(client?.getQueryState(KEYS[read])?.status).toBe("pending");
	});

	it("says 'Nothing awaiting approval.' once every read has answered, as the panel says All clear", () => {
		const view = mount({ hub: true });
		const panel = openApprovalsTab(view.container);
		expect(panel).toContain(en.agencyHub.nothingAwaitingApproval);
		expect(panel).not.toContain(en.agencyHub.loadingApprovals);
		expect(seen(view.container)).toEqual(ALL_CLEAR);
	});
});
