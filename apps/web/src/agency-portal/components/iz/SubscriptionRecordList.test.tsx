import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The org's own Payment history (agency and outlet Subscription screens) with a
 * VOIDED bill in it — owner, 29 Sep 2026: "Add Void". A void bill is owed by
 * nobody: it is not in the Unpaid total, it has no tick box, and it stays
 * readable under its own disclosure with its reason.
 */
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock("@/services/subscription-payment", () => ({ createCheckout: vi.fn() }));
vi.mock("@agency-portal/components/iz/InvoiceReceipt", () => ({
	InvoiceReceipt: () => null,
}));
vi.mock("@/lib/portal-i18n/context", () => ({
	usePortalLocale: () => ({
		t: new Proxy(
			{},
			{
				get: (_t, section: string) =>
					new Proxy({}, { get: (_s, key: string) => `${section}.${key}` }),
			},
		),
	}),
}));

import type { SubscriptionInvoice } from "@/services/subscription-invoice";
import { PaymentHistoryList } from "./SubscriptionRecordList";

const bill = (over: Partial<SubscriptionInvoice>): SubscriptionInvoice => ({
	id: "inv-1",
	memberSubscriptionId: "ms-1",
	invoiceNo: "INV-000049",
	kind: "period",
	baseAmount: "125.00",
	creditApplied: "0.00",
	note: null,
	periodStart: "2026-09-20",
	periodEnd: "2026-09-26",
	amount: "125.00",
	currency: "MYR",
	status: "unpaid",
	paidAt: null,
	createdAt: "2026-09-20T00:00:00Z",
	updatedAt: "2026-09-20T00:00:00Z",
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

function renderList(invoices: SubscriptionInvoice[]) {
	const client = new QueryClient();
	return render(
		<QueryClientProvider client={client}>
			<PaymentHistoryList invoices={invoices} canPay />
		</QueryClientProvider>,
	);
}

afterEach(cleanup);

describe("PaymentHistoryList with a voided bill", () => {
	const invoices = [
		bill({}),
		bill({
			id: "inv-2",
			invoiceNo: "INV-000050",
			periodStart: "2026-07-05",
			periodEnd: "2026-07-11",
			amount: "999.00",
			status: "void",
			note: "Voided: billed for weeks the organisation held no plan on this lane",
		}),
	];

	it("the Unpaid tile counts the unpaid bill only — never the voided RM 999", () => {
		renderList(invoices);
		const unpaidTile = screen
			.getByText("subscription.statusUnpaid", { selector: "p" })
			.closest("button") as HTMLElement;
		expect(unpaidTile.textContent).toMatch(/125/);
		expect(unpaidTile.textContent).not.toMatch(/999/);
	});

	it("offers exactly one tick box — the owed period; a void bill can never be paid", () => {
		renderList(invoices);
		expect(screen.getAllByRole("checkbox")).toHaveLength(1);
	});

	it("keeps the voided bill on record under its own disclosure, with its reason", () => {
		renderList(invoices);
		const disclosure = screen
			.getByText("subscription.voidedPeriods")
			.closest("button") as HTMLElement;
		fireEvent.click(disclosure);
		// Open the period card to read the lane row inside it.
		fireEvent.click(
			screen.getAllByRole("button", { expanded: false }).at(-1) as HTMLElement,
		);
		expect(screen.getByText("subscription.statusVoid")).toBeTruthy();
		expect(screen.getByText("adminService.voidedReason")).toBeTruthy();
	});

	it("shows no voided disclosure when nothing was voided", () => {
		renderList([bill({})]);
		expect(screen.queryByText("subscription.voidedPeriods")).toBeNull();
	});
});
