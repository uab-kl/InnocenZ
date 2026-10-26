import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	portal: "agency" as "agency" | "outlet",
	kind: "real" as "real" | "demo",
	profileError: false,
	profileFetching: false,
	refetchProfile: vi.fn(),
	pathname: "/agency/prs",
	profile: undefined as
		| {
				id: string;
				modulePermissions: {
					moduleKey: string;
					permissionType: string;
					portalCode: string;
					orgId: string;
				}[];
				portals?: string[];
				roles?: string[];
				organisations?: {
					kind: "agency" | "outlet";
					id: string;
					enterable: boolean;
				}[];
		  }
		| undefined,
	state: {} as Record<string, unknown>,
	navigate: vi.fn(),
	guard: vi.fn(),
	resolveAgency: vi.fn(),
	resolveOutlet: vi.fn(),
	blankReset: vi.fn(() => ({})),
	activeOrg: null as { kind: "agency" | "outlet"; id: string } | null,
	hardNavigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-router")>()),
	useNavigate: () => mocks.navigate,
	useLocation: () => ({ pathname: mocks.pathname }),
	Outlet: () => <div data-testid="requested-page" />,
}));
vi.mock("@/lib/auth/guards", () => ({
	ensurePortal: vi.fn(),
	guardPortalClient: (...args: unknown[]) => mocks.guard(...args),
}));
vi.mock("@/lib/auth/use-profile", () => ({
	useProfile: () => ({
		data: mocks.profile,
		isError: mocks.profileError,
		isFetching: mocks.profileFetching,
		refetch: mocks.refetchProfile,
	}),
}));
vi.mock("@/lib/auth/agency-demo-session", () => ({
	getPortalSessionKind: () => mocks.kind,
}));
vi.mock("@/lib/active-org", () => ({
	getActiveOrg: () => mocks.activeOrg,
}));
vi.mock("@/lib/hard-navigate", () => ({
	hardNavigate: (...args: unknown[]) => mocks.hardNavigate(...args),
}));
vi.mock("@agency-portal/lib/store", () => ({
	useStore: Object.assign(
		(selector: (state: Record<string, unknown>) => unknown) =>
			selector(mocks.state),
		{
			getState: () => mocks.state,
			setState: (
				patch:
					| Record<string, unknown>
					| ((state: Record<string, unknown>) => Record<string, unknown>),
			) => {
				Object.assign(
					mocks.state,
					typeof patch === "function" ? patch(mocks.state) : patch,
				);
			},
		},
	),
}));
vi.mock("@agency-portal/lib/demo-seed", () => ({
	buildBlankPortalReset: () => mocks.blankReset(),
}));
vi.mock("@agency-portal/lib/agency-demo", () => ({ BLANK_AGENCY_OWNER: {} }));
vi.mock("@agency-portal/lib/outlet-demo", () => ({ BLANK_OUTLET_OWNER: {} }));
vi.mock("@agency-portal/lib/agency-identity", () => ({
	getAgencyIdentity: () => null,
	saveAgencyIdentity: vi.fn(),
}));
vi.mock("@agency-portal/lib/outlet-identity", () => ({
	getOutletIdentity: () => null,
	saveOutletIdentity: vi.fn(),
}));
vi.mock("@agency-portal/lib/resolve-session-identity", () => ({
	resolveAgencyIdentityForUser: (...args: unknown[]) =>
		mocks.resolveAgency(...args),
	resolveOutletIdentityForUser: (...args: unknown[]) =>
		mocks.resolveOutlet(...args),
}));
vi.mock("@agency-portal/components/portal/PortalShell", () => ({
	PortalShell: ({ children }: { children: ReactNode }) => (
		<main>{children}</main>
	),
}));
vi.mock("@agency-portal/components/Toasts", () => ({ Toasts: () => null }));
vi.mock("@/components/landing/BrandLogo", () => ({
	BrandLogo: () => <span>InnocenZ</span>,
}));
vi.mock("@/lib/portal-i18n/context", async () => ({
	PortalLocaleProvider: ({ children }: { children: ReactNode }) => (
		<>{children}</>
	),
	usePortalLocale: () => ({ t: translations.en }),
}));

import { translations } from "@/lib/portal-i18n/translations";
import { Route as AgencyRoute } from "@/routes/agency/route";
import { Route as OutletRoute } from "@/routes/outlet/route";

const layouts = [
	{
		portal: "agency" as const,
		path: "/agency/prs",
		component: AgencyRoute.options.component as ComponentType,
	},
	{
		portal: "outlet" as const,
		path: "/outlet/workspace",
		component: OutletRoute.options.component as ComponentType,
	},
];

function ownerIdentity(portal: "agency" | "outlet") {
	return portal === "agency"
		? {
				agencyId: "qa-org",
				orgName: "QA Agency",
				agencyStatus: "active",
				subRole: "agency_owner",
			}
		: {
				outletId: "qa-org",
				outletName: "QA Outlet",
				outletStatus: "active",
				subRole: "outlet_owner",
			};
}

function profile(portal: "agency" | "outlet", allowed: boolean) {
	return {
		id: "qa-owner",
		modulePermissions: [
			{
				moduleKey: "dashboard",
				permissionType: "read",
				portalCode: portal,
				orgId: "qa-org",
			},
			...(allowed
				? [
						{
							moduleKey: portal === "agency" ? "workforce" : "workspace",
							permissionType: portal === "agency" ? "update" : "read",
							portalCode: portal,
							orgId: "qa-org",
						},
					]
				: []),
		],
	};
}

describe.each(layouts)("$portal direct-link initialization", ({
	portal,
	path,
	component: Layout,
}) => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.portal = portal;
		mocks.activeOrg = { kind: portal, id: "qa-org" };
		mocks.kind = "real";
		mocks.pathname = path;
		mocks.profile = undefined;
		mocks.profileError = false;
		mocks.profileFetching = false;
		mocks.guard.mockResolvedValue(true);
		mocks.resolveAgency.mockResolvedValue(ownerIdentity("agency"));
		mocks.resolveOutlet.mockResolvedValue(ownerIdentity("outlet"));
		mocks.state = {
			agencySubRole: null,
			outletSubRole: null,
			agencyOwner: {},
			outletOwner: {},
			outletWorkspace: {},
			setOutletSubRole: (role: string) => {
				mocks.state.outletSubRole = role;
			},
		};
	});
	afterEach(cleanup);

	it("keeps the requested URL while profile and then organization identity are loading", async () => {
		let resolveIdentity!: (identity: ReturnType<typeof ownerIdentity>) => void;
		const identity = new Promise<ReturnType<typeof ownerIdentity>>(
			(resolve) => {
				resolveIdentity = resolve;
			},
		);
		const resolver =
			portal === "agency" ? mocks.resolveAgency : mocks.resolveOutlet;
		resolver.mockReturnValue(identity);
		const view = render(<Layout />);
		await act(async () => {});
		expect(screen.getByRole("status").textContent).toContain(
			translations.en.webShell.gettingReady,
		);
		expect(screen.queryByTestId("requested-page")).toBeNull();
		expect(mocks.navigate).not.toHaveBeenCalled();
		expect(mocks.blankReset).not.toHaveBeenCalled();
		expect(resolver).not.toHaveBeenCalled();

		mocks.profile = profile(portal, true);
		view.rerender(<Layout />);
		await waitFor(() => expect(resolver).toHaveBeenCalledWith("qa-owner"));
		expect(screen.queryByTestId("requested-page")).toBeNull();
		expect(mocks.navigate).not.toHaveBeenCalled();

		await act(async () => {
			resolveIdentity(ownerIdentity(portal));
		});
		await waitFor(() =>
			expect(screen.getByTestId("requested-page")).not.toBeNull(),
		);
		expect(mocks.state[`${portal}SubRole`]).toBe(`${portal}_owner`);
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	it("still redirects an authenticated account without the requested module permission", async () => {
		mocks.profile = profile(portal, false);
		render(<Layout />);
		await waitFor(() =>
			expect(mocks.navigate).toHaveBeenCalledWith({
				to: `/${portal}`,
				replace: true,
			}),
		);
	});

	it("offers retry after a profile error without redirecting or opening the gate", async () => {
		mocks.profileError = true;
		const view = render(<Layout />);
		await act(async () => {});
		expect(screen.getByRole("status").textContent).toContain(
			translations.en.chooseOrg.failed,
		);
		fireEvent.click(
			screen.getByRole("button", { name: translations.en.common.retry }),
		);
		expect(mocks.refetchProfile).toHaveBeenCalledTimes(1);
		expect(mocks.navigate).not.toHaveBeenCalled();
		expect(screen.queryByTestId("requested-page")).toBeNull();

		mocks.profileFetching = true;
		view.rerender(<Layout />);
		const busyButton = screen.getByRole("button", {
			name: translations.en.common.loading,
		}) as HTMLButtonElement;
		expect(busyButton.disabled).toBe(true);
		fireEvent.click(busyButton);
		expect(mocks.refetchProfile).toHaveBeenCalledTimes(1);

		mocks.profileError = false;
		mocks.profileFetching = false;
		mocks.profile = profile(portal, true);
		view.rerender(<Layout />);
		await waitFor(() =>
			expect(screen.getByTestId("requested-page")).not.toBeNull(),
		);
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	it("does not require a backend profile for the existing demo session", async () => {
		mocks.kind = "demo";
		mocks.state[`${portal}SubRole`] = `${portal}_owner`;
		render(<Layout />);
		await waitFor(() =>
			expect(screen.getByTestId("requested-page")).not.toBeNull(),
		);
		expect(mocks.navigate).not.toHaveBeenCalled();
		expect(mocks.blankReset).not.toHaveBeenCalled();
	});

	it("keeps the page closed when the portal session gate refuses entry", async () => {
		mocks.profile = profile(portal, true);
		mocks.guard.mockResolvedValue(false);
		render(<Layout />);
		await act(async () => {});
		expect(screen.getByRole("status")).not.toBeNull();
		expect(screen.queryByTestId("requested-page")).toBeNull();
		expect(mocks.navigate).not.toHaveBeenCalled();
	});

	/*
	 * ACTIVE ORGANISATION ENFORCED. With none chosen in this tab no `x-org-id`
	 * travels and the server picks — an account holding an agency AND a venue
	 * was shown the agency's invoices under the venue's name. The layout asks
	 * the chooser's question before it renders or resolves anything.
	 */
	const twoOrgs = () => ({
		...profile(portal, true),
		portals: ["agency", "outlet"],
		roles: [],
		organisations: [
			{ kind: portal, id: "qa-org", enterable: true },
			{
				kind: portal === "agency" ? ("outlet" as const) : ("agency" as const),
				id: "other-org",
				enterable: true,
			},
		],
	});

	it("sends a two-organisation account with no active organisation to the chooser", async () => {
		mocks.profile = twoOrgs();
		mocks.activeOrg = null;
		render(<Layout />);
		await waitFor(() =>
			expect(mocks.hardNavigate).toHaveBeenCalledWith(
				expect.stringMatching(/^\/choose-organisation/),
			),
		);
		expect(screen.queryByTestId("requested-page")).toBeNull();
		expect(mocks.blankReset).not.toHaveBeenCalled();
		expect(mocks.resolveAgency).not.toHaveBeenCalled();
		expect(mocks.resolveOutlet).not.toHaveBeenCalled();
	});

	it("sends it to the chooser when the active organisation belongs to the OTHER portal", async () => {
		mocks.profile = twoOrgs();
		mocks.activeOrg = {
			kind: portal === "agency" ? "outlet" : "agency",
			id: "other-org",
		};
		render(<Layout />);
		await waitFor(() => expect(mocks.hardNavigate).toHaveBeenCalled());
		expect(screen.queryByTestId("requested-page")).toBeNull();
	});

	it("renders a two-organisation account that chose one of this portal's", async () => {
		mocks.profile = twoOrgs();
		render(<Layout />);
		await waitFor(() =>
			expect(screen.getByTestId("requested-page")).not.toBeNull(),
		);
		expect(mocks.hardNavigate).not.toHaveBeenCalled();
	});

	it("leaves a one-organisation account alone even with nothing chosen", async () => {
		mocks.profile = {
			...profile(portal, true),
			portals: [portal],
			roles: [],
			organisations: [{ kind: portal, id: "qa-org", enterable: true }],
		};
		mocks.activeOrg = null;
		render(<Layout />);
		await waitFor(() =>
			expect(screen.getByTestId("requested-page")).not.toBeNull(),
		);
		expect(mocks.hardNavigate).not.toHaveBeenCalled();
	});
});
