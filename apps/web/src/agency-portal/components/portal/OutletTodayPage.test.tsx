import { saveOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { type OutletSubRole, outletCan } from "@agency-portal/lib/outlet-rbac";
import { useStore } from "@agency-portal/lib/store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route as OutletTodayRoute } from "@/routes/outlet/index";
import { usePortalTodoCounts } from "./NavAlertBadge";
import { PortalNavAlerts } from "./PortalNavAlerts";

/*
 * OUTLET TODAY: THE TO DO PANEL WAITS FOR ITS BANNERS TOO (owner, 18 Nov 2026 —
 * "yes fix the to do panel").
 *
 * The outlet provider's flag covers tonight's shifts, billing and join requests.
 * Three strips in the panel read more — the "No agency yet" strip (agency
 * links), the price reminder (the workspace) and the statement check
 * (collections + the sales report) — so the panel could say "All clear" and
 * then grow one. The page now passes those flags to TodoPanel.
 *
 * The REAL route component, the REAL outlet provider, banners and hooks on a
 * real react-query client; only the network fetchers are stubbed.
 */

type Fetcher = (...args: unknown[]) => Promise<unknown>;

const h = vi.hoisted(() => ({
	fetchMyAgencyLinks: vi.fn<Fetcher>(),
	fetchOutletWorkspace: vi.fn<Fetcher>(),
	fetchCollectionInvoices: vi.fn<Fetcher>(),
	fetchShiftSaleReport: vi.fn<Fetcher>(),
	fetchAllOutletShifts: vi.fn<Fetcher>(),
	fetchAllOutletAssignments: vi.fn<Fetcher>(),
	fetchAllOutletPrs: vi.fn<Fetcher>(),
	fetchSubscriptionInvoiceGroups: vi.fn<Fetcher>(),
	fetchOutletMembers: vi.fn<Fetcher>(),
}));

vi.mock("@/lib/auth-context", () => ({
	useAuth: () => ({ logout: () => {}, isAuthenticated: true }),
}));
vi.mock("@/services/agency-outlet", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/agency-outlet")>()),
	fetchMyAgencyLinks: h.fetchMyAgencyLinks,
}));
vi.mock("@/services/outlet-workspace", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/outlet-workspace")>()),
	fetchOutletWorkspace: h.fetchOutletWorkspace,
}));
vi.mock("@/services/collection-invoice", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/collection-invoice")>()),
	fetchCollectionInvoices: h.fetchCollectionInvoices,
}));
vi.mock("@/services/shift-sale", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/shift-sale")>()),
	fetchShiftSaleReport: h.fetchShiftSaleReport,
}));
vi.mock("@/services/subscription-invoice", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/subscription-invoice")>()),
	fetchSubscriptionInvoiceGroups: h.fetchSubscriptionInvoiceGroups,
}));
vi.mock("@/services/outlet", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/outlet")>()),
	fetchOutletMembers: h.fetchOutletMembers,
}));
vi.mock(
	"@agency-portal/hooks/use-outlet-shared-queries",
	async (importOriginal) => ({
		...(await importOriginal<
			typeof import("@agency-portal/hooks/use-outlet-shared-queries")
		>()),
		fetchAllOutletShifts: h.fetchAllOutletShifts,
		fetchAllOutletAssignments: h.fetchAllOutletAssignments,
		fetchAllOutletPrs: h.fetchAllOutletPrs,
	}),
);
// The night's board under the panel reads nothing the panel waits on.
vi.mock("@agency-portal/components/outlet/OutletBookings", () => ({
	OutletBookings: () => null,
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

const OutletToday = OutletTodayRoute.options.component as ComponentType;
const OUTLET = "outlet-test";

/** The four reads behind the panel's banners, by the keys their hooks build. */
const BANNER_READS = {
	agencyLinks: {
		fetcher: () => h.fetchMyAgencyLinks,
		key: ["agency-outlet", "mine", "self"],
		answer: [] as unknown,
	},
	workspace: {
		fetcher: () => h.fetchOutletWorkspace,
		key: ["outlet-workspace", OUTLET],
		answer: { success: true, message: "ok", data: null } as unknown,
	},
	collections: {
		fetcher: () => h.fetchCollectionInvoices,
		key: ["outlet", "collection-invoices"],
		answer: { data: [] } as unknown,
	},
	salesReport: {
		fetcher: () => h.fetchShiftSaleReport,
		key: ["outlet", "shift-sale-report", OUTLET],
		answer: { byDay: [], costByPrDay: [] } as unknown,
	},
} as const;
type BannerRead = keyof typeof BANNER_READS;
const READ_NAMES = Object.keys(BANNER_READS) as BannerRead[];

let providerLoading: boolean[] = [];
let clients: QueryClient[] = [];

/** What the PROVIDER says, apart from the page — the banners' reads are not in it. */
function Probe() {
	providerLoading.push(usePortalTodoCounts().loading);
	return null;
}

function signIn(subRole: OutletSubRole) {
	saveOutletIdentity({
		userId: "user-test",
		outletId: OUTLET,
		outletName: "Test venue",
		subRole,
		outletStatus: "active",
	});
	useStore.setState({ outletSubRole: subRole });
}

function mount() {
	// The production client: `new QueryClient()` with no defaults.
	const client = new QueryClient();
	clients.push(client);
	const view = render(
		<QueryClientProvider client={client}>
			<PortalNavAlerts portal="outlet">
				<OutletToday />
				<Probe />
			</PortalNavAlerts>
		</QueryClientProvider>,
	);
	return { client, ...view };
}

function panel(container: HTMLElement) {
	return {
		checking: container.querySelector(".iz-todo__checking") !== null,
		allClear: container.querySelector(".iz-todo__clear") !== null,
		settled:
			container
				.querySelector(".iz-todo__list")
				?.getAttribute("data-iz-settled") ?? null,
	};
}
const CHECKING = { checking: true, allClear: false, settled: null };
const ALL_CLEAR = { checking: false, allClear: true, settled: "true" };

/** A request that answers only when the test says so. */
function held(read: BannerRead) {
	let release = () => {};
	BANNER_READS[read].fetcher().mockImplementation(
		() =>
			new Promise((resolve) => {
				release = () => resolve(BANNER_READS[read].answer);
			}),
	);
	return () => act(() => release());
}

beforeEach(() => {
	providerLoading = [];
	sessionStorage.clear();
	localStorage.clear();
	for (const read of READ_NAMES) {
		const { fetcher, answer } = BANNER_READS[read];
		fetcher().mockReset();
		fetcher().mockResolvedValue(answer);
	}
	for (const fn of [
		h.fetchAllOutletShifts,
		h.fetchAllOutletAssignments,
		h.fetchAllOutletPrs,
		h.fetchSubscriptionInvoiceGroups,
		h.fetchOutletMembers,
	]) {
		fn.mockReset();
		fn.mockResolvedValue({ data: [] });
	}
});

afterEach(() => {
	cleanup();
	for (const client of clients) client.clear();
	clients = [];
	useStore.setState({ outletSubRole: null });
	sessionStorage.clear();
	localStorage.clear();
});

describe("Outlet Today — the To do panel waits for its banners' reads", () => {
	it("the owner holds viewBilling, so the statement check is one of its strips", () => {
		// The instrument for the statement-check cases below.
		expect(outletCan("outlet_owner", "viewBilling")).toBe(true);
	});

	it.each(
		READ_NAMES,
	)("stays on 'Checking…' while %s is loading, and reaches All clear when it answers", async (read) => {
		signIn("outlet_owner");
		const release = held(read);
		const { client, container } = mount();
		// Every OTHER read has answered — the provider's and the other
		// banners' — so what holds the panel is this one read alone.
		await waitFor(() => {
			expect(providerLoading.at(-1)).toBe(false);
			for (const other of READ_NAMES.filter((r) => r !== read)) {
				expect(
					client.getQueryState(BANNER_READS[other].key)?.status,
					other,
				).toBe("success");
			}
		});
		expect(client.getQueryState(BANNER_READS[read].key)?.status).toBe(
			"pending",
		);
		expect(panel(container)).toEqual(CHECKING);

		release();
		await waitFor(() => expect(panel(container)).toEqual(ALL_CLEAR));
	});

	it("asks the server nothing more: each banner read is ONE request on ONE shared key", async () => {
		signIn("outlet_owner");
		const { client, container } = mount();
		await waitFor(() => expect(panel(container)).toEqual(ALL_CLEAR));
		for (const read of READ_NAMES) {
			const { fetcher, key } = BANNER_READS[read];
			expect(fetcher(), read).toHaveBeenCalledTimes(1);
			// The page's flag and the banner observe the SAME cache entry: one
			// key, two (or more) observers, one request.
			const query = client.getQueryCache().find({ queryKey: key, exact: true });
			expect(query?.getObserversCount(), read).toBeGreaterThanOrEqual(2);
		}
	});
});

describe("Outlet Today — a strip that cannot show never holds the panel", () => {
	it("a lane without viewBilling is not held by the statement check it never sees", async () => {
		// Ops Head runs the floor but not the venue's bills.
		expect(outletCan("outlet_ops", "viewBilling")).toBe(false);
		signIn("outlet_ops");
		held("collections");
		held("salesReport");
		const { client, container } = mount();
		await waitFor(() => expect(panel(container)).toEqual(ALL_CLEAR));
		// The instrument: both reads really are still out on the wire.
		expect(client.getQueryState(BANNER_READS.collections.key)?.status).toBe(
			"pending",
		);
		expect(client.getQueryState(BANNER_READS.salesReport.key)?.status).toBe(
			"pending",
		);
		expect(h.fetchCollectionInvoices).toHaveBeenCalledTimes(1);
	});

	it("a demo session (no venue identity) is not held by the agency links", async () => {
		useStore.setState({ outletSubRole: "outlet_owner" });
		held("agencyLinks");
		const { client, container } = mount();
		await waitFor(() => expect(panel(container)).toEqual(ALL_CLEAR));
		// The links read is still out (the page asks it on every session), but
		// the strip behind it shows only on a real one.
		expect(client.getQueryState(BANNER_READS.agencyLinks.key)?.status).toBe(
			"pending",
		);
		// The real-session-only reads are switched off, so they ask nothing.
		expect(h.fetchOutletWorkspace).not.toHaveBeenCalled();
		expect(h.fetchCollectionInvoices).not.toHaveBeenCalled();
		expect(h.fetchShiftSaleReport).not.toHaveBeenCalled();
	});
});
