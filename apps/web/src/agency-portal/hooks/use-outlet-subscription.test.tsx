import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * TWO SUBSCRIPTION-PAGE FAULTS (29 Sep 2026 audit).
 *
 * 1. "Billed monthly" printed the PLAN price alone. A venue on the POS add-on is
 *    billed for both lanes every month, so the line under-stated the charge.
 * 2. Every non-owner lane (Finance, Director, Ops Head, Guarantor) collected a
 *    403 on Subscription: the hook asked `GET /payment-method/mine`, which the
 *    server gives the OWNER alone, for a card section those lanes never see.
 */

const h = vi.hoisted(() => ({ isOwner: true }));
const fetchMyPaymentMethod = vi.fn(async () => null);

vi.mock("@agency-portal/lib/use-portal-can", () => ({
	useOutletIsOwner: () => h.isOwner,
}));
vi.mock("@agency-portal/lib/outlet-identity", () => ({
	getOutletIdentity: () => ({
		outletId: "11111111-1111-4111-8111-111111111111",
		outletName: "Emhub",
	}),
}));
vi.mock("@/lib/auth-context", () => ({
	useAuth: () => ({ logout: vi.fn() }),
}));
vi.mock("@/services/payment-method", () => ({
	fetchMyPaymentMethod: () => fetchMyPaymentMethod(),
	saveMyPaymentMethod: vi.fn(),
	removeMyPaymentMethod: vi.fn(),
}));
vi.mock("@/services/member-subscription", () => ({
	fetchMemberSubscriptions: vi.fn(async () => ({ data: [] })),
}));
vi.mock("@/services/subscription", () => ({
	fetchSubscriptions: vi.fn(async () => ({ data: [] })),
}));
vi.mock("@/services/subscription-invoice", () => ({
	fetchSubscriptionInvoices: vi.fn(async () => ({ data: [] })),
}));
vi.mock("@/services/admin-request", () => ({
	createAdminRequest: vi.fn(),
	fetchMyPlanChange: vi.fn(async () => null),
	fetchMyPosQuote: vi.fn(async () => null),
	withdrawMyAdminRequest: vi.fn(),
}));

import {
	outletMonthlyBill,
	useOutletSubscription,
} from "./use-outlet-subscription";

function renderSubscription() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	return renderHook(() => useOutletSubscription(), { wrapper });
}

beforeEach(() => {
	h.isOwner = true;
	fetchMyPaymentMethod.mockClear();
});

describe("outletMonthlyBill", () => {
	it("adds the POS add-on to the plan", () => {
		expect(outletMonthlyBill(6999, 200)).toEqual({
			totalRm: 7199,
			planRm: 6999,
			addonRm: 200,
		});
	});

	it("is the plan alone when there is no add-on", () => {
		expect(outletMonthlyBill(2999, null)).toEqual({
			totalRm: 2999,
			planRm: 2999,
			addonRm: null,
		});
	});

	it("sums in cents, so sen do not drift", () => {
		expect(outletMonthlyBill(0.1, 0.2)?.totalRm).toBe(0.3);
	});

	it("says nothing when no plan price is known", () => {
		expect(outletMonthlyBill(null, 200)).toBeNull();
	});
});

describe("the payment-method read is the owner's alone", () => {
	it("reads the saved card for the owner", async () => {
		const { result } = renderSubscription();
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		await waitFor(() => expect(fetchMyPaymentMethod).toHaveBeenCalledTimes(1));
	});

	it("never asks for it on a non-owner lane — the server would 403", async () => {
		h.isOwner = false;
		const { result } = renderSubscription();
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(fetchMyPaymentMethod).not.toHaveBeenCalled();
		expect(result.current.card).toBeNull();
	});
});
