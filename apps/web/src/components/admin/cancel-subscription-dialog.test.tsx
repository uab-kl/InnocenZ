import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { AxiosError, type AxiosResponse } from "axios";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Admin → Current Plan → "Cancel subscription".
 *
 * The admin had NO way to end a subscription row from any screen — the one
 * they most needed to end (an ACTIVE Premier row opened for an outlet that
 * exists nowhere) could only be closed by hand in the database. These tests
 * pin what the admin must be able to SEE and DO: the action is offered only on
 * a row the org is still on, it asks first, and the SERVER's own sentence is
 * what they read — success in a toast, a refusal inside the dialog.
 *
 * The service is mocked: this runs the screen, never the API, and so never
 * writes a billing row.
 */

const mockFetch = vi.fn();
const mockCancel = vi.fn();
const mockToastSuccess = vi.fn();
const logout = vi.fn();

vi.mock("@/services/member-subscription", () => ({
	fetchMemberSubscriptions: (...args: unknown[]) => mockFetch(...args),
	cancelMemberSubscription: (...args: unknown[]) => mockCancel(...args),
}));
vi.mock("@/services/outlet", () => ({
	fetchOutlets: async () => ({ data: [] }),
}));
vi.mock("@/services/agency", () => ({
	fetchAgencies: async () => ({ data: [] }),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ logout }) }));
vi.mock("sonner", () => ({
	toast: { success: (...args: unknown[]) => mockToastSuccess(...args) },
}));
// The page chrome has its own tests and pulls in router/calendar modules.
vi.mock("@/components/admin/page-header", () => ({
	PageHeader: () => null,
	PageShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/admin/source-toggle", () => ({
	SourceToggle: () => null,
}));
vi.mock("@/components/admin/date-multi-filter", () => ({
	DateMultiFilter: () => null,
	datesToQueryParam: () => undefined,
}));
vi.mock("@/lib/portal-i18n/context", () => ({
	usePortalLocale: () => ({
		// Echo the key back so an assertion cannot pass on a missing string.
		t: new Proxy(
			{},
			{
				get: (_t, section: string) =>
					new Proxy({}, { get: (_s, key: string) => `${section}.${key}` }),
			},
		),
	}),
}));

import { Route } from "@/routes/admin/business/history";
import {
	CancelSubscriptionDialog,
	isCancellable,
} from "./cancel-subscription-dialog";

const HistoryPage = Route.options.component as ComponentType;

const row = (over: Record<string, unknown> = {}) => ({
	id: "ms-live",
	subscriberType: "outlet",
	subscriberId: "o-1",
	subscriberName: "Velvet 23",
	subscriptionId: "p-pro",
	planName: "Pro",
	amount: "2999.00",
	billingCycle: "monthly",
	currency: "MYR",
	status: "active",
	startedAt: "2026-09-01T00:00:00.000Z",
	endedAt: null,
	createdAt: "2026-09-01T00:00:00.000Z",
	updatedAt: "2026-09-01T00:00:00.000Z",
	createdBy: "admin",
	updatedBy: "admin",
	...over,
});

function renderPage() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<HistoryPage />
		</QueryClientProvider>,
	);
}

function refusal(message: string, status = 409) {
	return new AxiosError(
		"Request failed",
		String(status),
		undefined,
		undefined,
		{
			status,
			data: { success: false, message, data: null },
		} as AxiosResponse,
	);
}

const CANCEL_ROW = "adminBusiness.cancelSubscriptionFor";
const CONFIRM = "adminBusiness.cancelSubscription";

afterEach(() => cleanup());

describe("isCancellable", () => {
	it("offers the action only on a row the org is still on", () => {
		expect(isCancellable({ endedAt: null, status: "active" })).toBe(true);
		// Behind on payment has not left.
		expect(isCancellable({ endedAt: null, status: "past_due" })).toBe(true);
		expect(isCancellable({ endedAt: null, status: "cancelled" })).toBe(false);
		expect(isCancellable({ endedAt: null, status: "expired" })).toBe(false);
		expect(
			isCancellable({ endedAt: "2026-09-10T00:00:00.000Z", status: "active" }),
		).toBe(false);
	});
});

describe("CancelSubscriptionDialog", () => {
	it("names the subscriber and plan, and never labels the dismiss button plain Cancel", () => {
		render(
			<CancelSubscriptionDialog
				record={{ subscriberName: "Velvet 23", planName: "Pro" }}
				onOpenChange={() => {}}
				onConfirm={() => {}}
				isPending={false}
				error={null}
			/>,
		);
		const dialog = screen.getByRole("dialog");
		expect(
			within(dialog).getByText("adminBusiness.cancelSubscriptionConfirm"),
		).toBeTruthy();
		expect(
			within(dialog).getByRole("button", {
				name: "adminBusiness.keepSubscription",
			}),
		).toBeTruthy();
		expect(within(dialog).getByRole("button", { name: CONFIRM })).toBeTruthy();
	});

	it("shows the server's refusal above the buttons", () => {
		render(
			<CancelSubscriptionDialog
				record={{ subscriberName: "Velvet 23", planName: "Pro" }}
				onOpenChange={() => {}}
				onConfirm={() => {}}
				isPending={false}
				error={new Error("This is the organisation's only active plan.")}
			/>,
		);
		expect(screen.getByRole("alert").textContent).toBe(
			"This is the organisation's only active plan.",
		);
	});

	it("cannot be confirmed twice while the request is in flight", () => {
		const onConfirm = vi.fn();
		render(
			<CancelSubscriptionDialog
				record={{ subscriberName: "Velvet 23", planName: "Pro" }}
				onOpenChange={() => {}}
				onConfirm={onConfirm}
				isPending
				error={null}
			/>,
		);
		const confirm = within(screen.getByRole("dialog")).getByRole("button", {
			name: "rbac.processing",
		});
		expect((confirm as HTMLButtonElement).disabled).toBe(true);
		fireEvent.click(confirm);
		expect(onConfirm).not.toHaveBeenCalled();
	});

	it("renders nothing while no row is chosen", () => {
		render(
			<CancelSubscriptionDialog
				record={null}
				onOpenChange={() => {}}
				onConfirm={() => {}}
				isPending={false}
				error={null}
			/>,
		);
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});

describe("Current Plan page — cancelling a subscription", () => {
	beforeEach(() => {
		mockFetch.mockReset();
		mockCancel.mockReset();
		mockToastSuccess.mockReset();
		mockFetch.mockResolvedValue({
			success: true,
			message: "OK",
			data: [
				row(),
				row({
					id: "ms-ended",
					subscriberName: "Emhub Testing",
					status: "expired",
					endedAt: "2026-09-10T00:00:00.000Z",
				}),
			],
			pagination: {
				page: 1,
				pageSize: 10,
				totalCount: 2,
				totalPages: 1,
				hasNextPage: false,
				hasPrevPage: false,
			},
		});
	});

	it("offers Cancel on the live row only", async () => {
		renderPage();
		const buttons = await screen.findAllByRole("button", { name: CANCEL_ROW });
		expect(buttons).toHaveLength(1);
	});

	it("asks first, calls the cancel route for that row, and toasts the server's sentence", async () => {
		const serverSentence =
			"Subscription cancelled — Velvet 23 is no longer on Pro from today.";
		mockCancel.mockResolvedValue({
			success: true,
			message: serverSentence,
			data: row({ status: "cancelled", endedAt: "2026-09-28T00:00:00.000Z" }),
		});
		renderPage();

		fireEvent.click(await screen.findByRole("button", { name: CANCEL_ROW }));
		// Nothing is sent until the admin confirms.
		expect(mockCancel).not.toHaveBeenCalled();
		const dialog = await screen.findByRole("dialog");

		fireEvent.click(within(dialog).getByRole("button", { name: CONFIRM }));

		await waitFor(() =>
			expect(mockToastSuccess).toHaveBeenCalledWith(serverSentence),
		);
		expect(mockCancel).toHaveBeenCalledWith("ms-live", logout);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});

	it("keeps the dialog open with the server's refusal when it says no", async () => {
		const serverSentence =
			"This is the organisation's only active plan. Move it onto another plan instead of ending it.";
		mockCancel.mockRejectedValue(refusal(serverSentence));
		renderPage();

		fireEvent.click(await screen.findByRole("button", { name: CANCEL_ROW }));
		const dialog = await screen.findByRole("dialog");
		fireEvent.click(within(dialog).getByRole("button", { name: CONFIRM }));

		const alert = await within(dialog).findByRole("alert");
		expect(alert.textContent).toBe(serverSentence);
		expect(mockToastSuccess).not.toHaveBeenCalled();
		expect(screen.getByRole("dialog")).toBeTruthy();
	});
});
