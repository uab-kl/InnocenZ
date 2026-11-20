import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * WHO MAY DECIDE A DISPUTE — the queue is readable by every agency lane, but
 * `POST /payment-voucher/disputes/:id/resolve` carries `agencyOwnerOrFinance`
 * (`requirePermission('payment_voucher', 'update')`). The rows used to offer
 * Accept / Reject and a note box to a Director, whose click could only 403.
 *
 * The data hooks, the store, the permission and the locale are mocked — this is
 * about which CONTROLS a lane is shown, not about react-query or the dictionary.
 */

const mockCan = vi.fn<(perm: string) => boolean>();
// Read at call time, so a test can swap in a claim with shifts behind it.
let mockDisputes: unknown[] = [];

vi.mock("@agency-portal/hooks/use-agency-disputes", () => ({
	useAgencyDisputes: () => ({
		disputes: mockDisputes,
		isLoading: false,
		resolve: vi.fn(),
		isResolving: false,
	}),
}));

vi.mock("@agency-portal/hooks/use-agency-receipts", () => ({
	useAgencyReceipts: () => ({ receipts: [] }),
}));

vi.mock("@agency-portal/lib/store", () => ({
	useStore: (selector: (s: { toast: () => void }) => unknown) =>
		selector({ toast: vi.fn() }),
}));

vi.mock("@agency-portal/lib/use-portal-can", () => ({
	useAgencyCan: () => (perm: string) => mockCan(perm),
}));

// The strip is its own component with its own tests; it is not what this asserts.
vi.mock("@agency-portal/components/agency/PayrollKindDayFilter", () => ({
	PayrollKindDayFilter: () => null,
}));

vi.mock("@/lib/portal-i18n/context", () => ({
	usePortalLocale: () => ({
		locale: "en",
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

const OPEN_DISPUTE = {
	id: "d1",
	voucherId: "v1",
	receiptId: null,
	shifts: [],
	disputeDate: "2026-10-20",
	component: "tips",
	reason: "Missing tips",
	note: null,
	raisedAt: "2026-10-21T02:00:00Z",
	disputedAmount: "40.00",
	claimedAmount: "80.00",
	disputedItems: null,
	proofPhotos: null,
	outcome: null,
	resolvedAt: null,
	resolvedBy: null,
	resolutionNote: null,
	voucher: {
		id: "v1",
		prId: "pr1",
		prName: "Victoria Tan",
		prNickname: null,
		weekStart: "2026-10-18",
		weekEnd: "2026-10-24",
		status: "disputed",
		net: "500.00",
	},
};

import { DisputeQueuePanel } from "./DisputeQueuePanel";

function renderPanel() {
	render(
		<DisputeQueuePanel
			weekStartIso="2026-10-18"
			weekEndIso="2026-10-24"
			kinds={[]}
			day={null}
			onKindsChange={vi.fn()}
			onDayChange={vi.fn()}
		/>,
	);
}

/** The card's folded header — the button that names the PR. */
function cardHeader(): HTMLElement {
	const button = screen.getByText(/Victoria Tan/).closest("button");
	if (!button) throw new Error("dispute card header not found");
	return button;
}

/** Every claim starts collapsed (owner, 20 Nov 2026), so open it first. */
function openCard() {
	fireEvent.click(cardHeader());
}

describe("DisputeQueuePanel decision gate", () => {
	beforeEach(() => {
		mockCan.mockReset();
		mockDisputes = [OPEN_DISPUTE];
	});

	it("starts every claim collapsed, the figures still on the header", () => {
		mockCan.mockImplementation((perm) => perm === "raisePv");
		renderPanel();
		// Owner, 20 Nov 2026: "the dispute and the receipt part normally collapse it".
		expect(cardHeader().getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByText("adminService.accept")).toBeNull();
		expect(screen.queryByText(/Missing tips/)).toBeNull();
		// Folded, it still says it is open and how much it is about.
		expect(within(cardHeader()).getByText("payroll.open")).toBeTruthy();
		expect(within(cardHeader()).getByText("RM 40.00")).toBeTruthy();
		expect(within(cardHeader()).getByText("RM 80.00")).toBeTruthy();
		openCard();
		expect(cardHeader().getAttribute("aria-expanded")).toBe("true");
	});

	it("offers Accept, Reject and the note box to a lane that may resolve", () => {
		mockCan.mockImplementation((perm) => perm === "raisePv");
		renderPanel();
		expect(screen.getByText(/Victoria Tan/)).toBeTruthy();
		openCard();
		expect(screen.getByText("adminService.accept")).toBeTruthy();
		expect(screen.getByText("common.reject")).toBeTruthy();
		expect(
			screen.getByPlaceholderText("payroll.noteToPrRequired"),
		).toBeTruthy();
		expect(
			screen.queryByText("agencyQueues.onlyOwnerFinanceDecideDisputes"),
		).toBeNull();
	});

	it("shows a read-only lane the claim but none of the decision controls", () => {
		mockCan.mockReturnValue(false);
		renderPanel();
		openCard();
		// Still SEES the dispute and its figures…
		expect(screen.getByText(/Victoria Tan/)).toBeTruthy();
		expect(screen.getByText(/Missing tips/)).toBeTruthy();
		// …but nothing it could only collect a 403 from.
		expect(screen.queryByText("adminService.accept")).toBeNull();
		expect(screen.queryByText("common.reject")).toBeNull();
		expect(
			screen.queryByPlaceholderText("payroll.noteToPrRequired"),
		).toBeNull();
		expect(
			screen.getByText("agencyQueues.onlyOwnerFinanceDecideDisputes"),
		).toBeTruthy();
	});

	it("asks the same permission the server's agencyOwnerOrFinance mirrors", () => {
		mockCan.mockReturnValue(false);
		renderPanel();
		expect(mockCan).toHaveBeenCalledWith("raisePv");
	});
});

/** A shift behind the claim, in the shape the queue's `shifts` carry. */
const shiftAt = (assignmentId: string, outletName: string | null) => ({
	assignmentId,
	outletName,
	eventName: null,
	eventKind: "normal",
	shiftDate: "2026-10-20",
	slot: "22:00 - 04:00",
	checkInAt: null,
	checkOutAt: null,
	overtimeMinutes: null,
	coverImage: null,
});

describe("DisputeQueuePanel header names the outlet", () => {
	beforeEach(() => {
		mockCan.mockReturnValue(false);
	});

	it("puts the claim's outlet between the PR and the bucket", () => {
		// Owner, 20 Nov 2026: "need show from what outlet when she dispute".
		mockDisputes = [{ ...OPEN_DISPUTE, shifts: [shiftAt("a1", "UAB Emhub")] }];
		renderPanel();
		expect(cardHeader().textContent).toContain(
			"Victoria Tan · UAB Emhub · money.tips",
		);
	});

	it("names every distinct venue of a whole-day claim, never just the first", () => {
		mockDisputes = [
			{
				...OPEN_DISPUTE,
				shifts: [
					shiftAt("a1", "UAB Emhub"),
					shiftAt("a2", "JK House"),
					shiftAt("a3", "UAB Emhub"),
				],
			},
		];
		renderPanel();
		expect(cardHeader().textContent).toContain(
			"Victoria Tan · UAB Emhub / JK House · money.tips",
		);
	});

	it("reads as before when no shift is linked", () => {
		mockDisputes = [OPEN_DISPUTE];
		renderPanel();
		expect(cardHeader().textContent).toContain("Victoria Tan · money.tips");
	});
});
