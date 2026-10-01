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
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Admin → Plan Payment → the payment panel → "Void" (owner, 29 Sep 2026: "Add
 * Void").
 *
 * What the admin must be able to SEE and DO: Void is offered only on an UNPAID
 * bill, it asks for a reason, and the SERVER's own sentence is what they read —
 * success and refusal alike. A voided bill is grey, takes no action, shows its
 * reason, and is never counted as owed. The services are mocked: this runs the
 * panel, never the API, so nothing is written.
 */

const mockDetail = vi.fn();
const mockVoid = vi.fn();
const mockSetStatus = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const logout = vi.fn();

vi.mock("@/services/subscription-payment", async () => {
	// The real pure helpers (`isRefundDue`) with only the request faked.
	const actual = await vi.importActual<
		typeof import("@/services/subscription-payment")
	>("@/services/subscription-payment");
	return {
		...actual,
		fetchInvoicePaymentDetail: (...args: unknown[]) => mockDetail(...args),
	};
});
vi.mock("@/services/subscription-invoice", async () => {
	const actual = await vi.importActual<
		typeof import("@/services/subscription-invoice")
	>("@/services/subscription-invoice");
	return {
		...actual,
		voidSubscriptionInvoice: (...args: unknown[]) => mockVoid(...args),
		setSubscriptionInvoiceStatus: (...args: unknown[]) =>
			mockSetStatus(...args),
	};
});
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ logout }) }));
vi.mock("sonner", () => ({
	toast: {
		success: (...args: unknown[]) => toastSuccess(...args),
		error: (...args: unknown[]) => toastError(...args),
	},
}));
vi.mock("@tanstack/react-router", () => ({
	Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));
// The sheet's header parts are Radix dialog pieces that need a dialog around them.
vi.mock("@/components/ui/sheet", () => ({
	SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
	SheetDescription: ({ children }: { children: ReactNode }) => (
		<p>{children}</p>
	),
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

import { InvoicePaymentSheet } from "./invoice-payment-sheet";

const bill = (over: Record<string, unknown> = {}) => ({
	id: "inv-1",
	memberSubscriptionId: "ms-1",
	invoiceNo: "INV-000049",
	kind: "period",
	baseAmount: "125.00",
	creditApplied: "0.00",
	note: null,
	periodStart: "2026-08-02",
	periodEnd: "2026-08-08",
	amount: "125.00",
	currency: "MYR",
	status: "unpaid",
	paidAt: null,
	createdAt: "2026-08-02T00:00:00Z",
	updatedAt: "2026-08-02T00:00:00Z",
	createdBy: "system",
	updatedBy: "system",
	subscriberType: "agency",
	subscriberId: "agency-1",
	subscriberName: "Test Agency",
	planName: "Starter",
	billingCycle: "weekly",
	proRata: null,
	...over,
});

function detail(history: ReturnType<typeof bill>[]) {
	return {
		invoice: history[0],
		payments: [],
		methods: [],
		org: { id: "agency-1", name: "Test Agency", logoImage: null },
		lanes: [],
		history,
		actors: {},
		r2PublicUrl: null,
	};
}

function renderSheet() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<InvoicePaymentSheet invoiceId="inv-1" />
		</QueryClientProvider>,
	);
}

function refusal(status: number, message: string): AxiosError {
	const response = {
		data: { success: false, message, data: null },
		status,
		statusText: String(status),
		headers: {},
		config: { headers: {} },
		request: {},
	} as unknown as AxiosResponse;
	return new AxiosError(
		`Request failed with status code ${status}`,
		AxiosError.ERR_BAD_REQUEST,
		undefined,
		{},
		response,
	);
}

beforeEach(() => {
	mockDetail.mockReset();
	mockVoid.mockReset();
	mockSetStatus.mockReset();
	toastSuccess.mockReset();
	toastError.mockReset();
});
afterEach(cleanup);

describe("InvoicePaymentSheet — Void", () => {
	it("offers Void on an unpaid bill only; a void one is grey, final, and says why", async () => {
		mockDetail.mockResolvedValue(
			detail([
				bill(),
				bill({
					id: "inv-2",
					invoiceNo: "INV-000050",
					periodStart: "2026-08-09",
					periodEnd: "2026-08-15",
					status: "void",
					note: "Voided: Billed before the venue existed",
				}),
				bill({
					id: "inv-3",
					invoiceNo: "INV-000051",
					periodStart: "2026-08-16",
					periodEnd: "2026-08-22",
					status: "paid",
				}),
			]),
		);
		renderSheet();

		await screen.findByText("adminService.billingHistory");
		const buttons = screen.getAllByRole("button", {
			name: "adminService.voidInvoice",
		});
		// Exactly one Void — on the one unpaid bill.
		expect(buttons).toHaveLength(1);
		// The void bill's badge and its reason, with no action beside it.
		expect(screen.getByText("subscription.statusVoid")).toBeTruthy();
		expect(screen.getByText("adminService.voidedReason")).toBeTruthy();
		expect(screen.getAllByText("adminService.markPaid")).toHaveLength(1);
		expect(screen.getAllByText("adminService.markUnpaid")).toHaveLength(1);
	});

	it("never counts a void bill as owed — the Unpaid tile holds the unpaid bill alone", async () => {
		mockDetail.mockResolvedValue(
			detail([
				bill({ amount: "125.00" }),
				bill({
					id: "inv-2",
					periodStart: "2026-08-09",
					periodEnd: "2026-08-15",
					status: "void",
					amount: "999.00",
				}),
			]),
		);
		renderSheet();

		const unpaidTile = (
			await screen.findByText("subscription.statusUnpaid", { selector: "p" })
		).closest("button") as HTMLElement;
		expect(within(unpaidTile).getByText(/125/)).toBeTruthy();
		expect(within(unpaidTile).queryByText(/999/)).toBeNull();
	});

	it("asks for a reason, then confirms in the SERVER's own sentence", async () => {
		mockDetail.mockResolvedValue(detail([bill()]));
		mockVoid.mockResolvedValue({
			success: true,
			message:
				"INV-000049 voided — it no longer counts as owed, and the reason is kept on its record.",
			data: bill({ status: "void" }),
		});
		renderSheet();

		fireEvent.click(
			await screen.findByRole("button", { name: "adminService.voidInvoice" }),
		);
		const confirm = screen.getByRole("button", {
			name: "adminService.voidInvoiceConfirm",
		}) as HTMLButtonElement;
		// No reason, no void — the button waits for one the server would accept.
		expect(confirm.disabled).toBe(true);
		fireEvent.change(screen.getByLabelText("adminService.voidReason"), {
			target: { value: "  Duplicate charge " },
		});
		expect(confirm.disabled).toBe(false);
		fireEvent.click(confirm);

		await waitFor(() =>
			expect(mockVoid).toHaveBeenCalledWith(
				"inv-1",
				"Duplicate charge",
				logout,
			),
		);
		await waitFor(() =>
			expect(toastSuccess).toHaveBeenCalledWith(
				"INV-000049 voided — it no longer counts as owed, and the reason is kept on its record.",
			),
		);
	});

	it("a refusal is shown in the server's words, and nothing pretends it worked", async () => {
		mockDetail.mockResolvedValue(detail([bill()]));
		mockVoid.mockRejectedValue(
			refusal(
				409,
				"A payment for INV-000049 is still in progress — let it finish or fail before voiding the bill. Nothing was changed.",
			),
		);
		renderSheet();

		fireEvent.click(
			await screen.findByRole("button", { name: "adminService.voidInvoice" }),
		);
		fireEvent.change(screen.getByLabelText("adminService.voidReason"), {
			target: { value: "Duplicate charge" },
		});
		fireEvent.click(
			screen.getByRole("button", { name: "adminService.voidInvoiceConfirm" }),
		);

		await waitFor(() =>
			expect(toastError).toHaveBeenCalledWith(
				"A payment for INV-000049 is still in progress — let it finish or fail before voiding the bill. Nothing was changed.",
			),
		);
		expect(toastSuccess).not.toHaveBeenCalled();
	});
});

/**
 * Review, 30 Sep 2026: money that landed on a voided or already-paid bill is
 * stored `pending` (it must stay outside the one-settlement index), so the panel
 * showed it as an amber "Awaiting the bank". It is money owed BACK.
 */
describe("InvoicePaymentSheet — refund due", () => {
	const attempt = (over: Record<string, unknown>) => ({
		id: "pay-1",
		subscriptionInvoiceId: "inv-1",
		paymentMethodId: null,
		methodType: "fpx",
		gateway: "fiuu",
		gatewayPaymentId: "G1",
		reference: "TRAN1",
		amount: "125.00",
		currency: "MYR",
		status: "pending",
		failureReason:
			"PAID FOR A VOIDED BILL — money taken for INV-000049, which was voided; refund due",
		paidAt: null,
		createdAt: "2026-09-30T00:00:00Z",
		updatedAt: "2026-09-30T00:00:00Z",
		createdBy: "gateway:fiuu",
		updatedBy: "gateway:fiuu",
		...over,
	});

	it("a pending attempt carrying a refund-due marker is a red Refund due — not an amber Pending", async () => {
		mockDetail.mockResolvedValue({
			...detail([bill({ status: "void" })]),
			payments: [attempt({})],
		});
		renderSheet();

		const badge = await screen.findByText("adminService.attemptRefundDue");
		expect(badge.className).toContain("text-red-300");
		expect(screen.queryByText("adminService.attemptPending")).toBeNull();
	});

	it("once refunded it reads as a closed refund — grey, its reason no longer red", async () => {
		mockDetail.mockResolvedValue({
			...detail([bill({ status: "void" })]),
			payments: [
				attempt({ status: "refunded", reference: "TRAN1 · Refund: MBB-1" }),
			],
		});
		renderSheet();

		const badge = await screen.findByText("adminService.attemptRefunded");
		expect(badge.className).toContain("text-muted-foreground");
		expect(screen.queryByText("adminService.attemptRefundDue")).toBeNull();
		const reason = screen.getByText(/^PAID FOR A VOIDED BILL — /);
		expect(reason.className).toContain("text-muted-foreground");
	});

	it("an ordinary pending attempt keeps its amber Pending", async () => {
		mockDetail.mockResolvedValue({
			...detail([bill()]),
			payments: [attempt({ failureReason: null })],
		});
		renderSheet();

		const badge = await screen.findByText("adminService.attemptPending");
		expect(badge.className).toContain("text-amber-300");
	});
});
