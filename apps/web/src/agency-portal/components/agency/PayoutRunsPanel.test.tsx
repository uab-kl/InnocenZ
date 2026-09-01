import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The one behaviour this panel exists to guarantee: A SIGNED-OFF PR WHO CANNOT
 * BE PAID IS SHOWN, NOT FILTERED OUT.
 *
 * The API deliberately returns blocked candidates flagged rather than omitting
 * them, and a UI that quietly drops them recreates the exact failure the whole
 * payout lane was built against — a run that pays 57 of 59 and tells nobody.
 * A screen can undo that server-side care in one `.filter()`, which is why it
 * is asserted here and not only in the backend tests.
 *
 * The data hook and the locale are mocked: this is about what the component
 * DOES with candidates, not about react-query or the dictionary. The date
 * picker is mocked too — it pulls in the whole roster module and has its own
 * tests.
 */

const mockUsePayoutBatches = vi.fn();
const mockUsePayoutBatch = vi.fn();

vi.mock("@agency-portal/hooks/use-payout-batches", () => ({
	usePayoutBatches: () => mockUsePayoutBatches(),
	usePayoutBatch: () => mockUsePayoutBatch(),
}));

vi.mock("@agency-portal/components/agency/RosterPlanningDatePicker", () => ({
	RosterPlanningDatePicker: () => null,
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

import { PayoutRunsPanel } from "./PayoutRunsPanel";

const candidate = (over: Record<string, unknown> = {}) => ({
	voucherId: "v1",
	voucherNo: "PV-000004",
	prName: "Victoria Tan",
	net: "700.00",
	weekStart: "2026-08-30",
	weekEnd: "2026-09-05",
	payeeName: "Victoria Tan",
	payeeIc: null,
	bankName: null as string | null,
	bankAccountMasked: null as string | null,
	payable: false,
	alreadyBatched: false,
	...over,
});

const hookValue = (candidates: ReturnType<typeof candidate>[]) => ({
	batches: [],
	batchesLoading: false,
	candidatesLoading: false,
	candidates: {
		weekStart: "2026-08-30",
		weekEnd: "2026-09-05",
		candidates,
		summary: {
			total: candidates.length,
			ready: candidates.filter((c) => c.payable && !c.alreadyBatched).length,
			blocked: candidates.filter((c) => !c.payable).length,
			alreadyBatched: candidates.filter((c) => c.alreadyBatched).length,
			readyTotalCents: 0,
		},
		providerConfigured: false,
	},
	create: { mutate: vi.fn(), isPending: false },
	cancel: { mutate: vi.fn() },
	markSubmitted: { mutate: vi.fn() },
	settle: { mutate: vi.fn() },
	importResponse: { mutate: vi.fn() },
	exportCsv: { mutate: vi.fn() },
});

beforeEach(() => {
	vi.clearAllMocks();
	mockUsePayoutBatch.mockReturnValue({ data: undefined });
});

describe("PayoutRunsPanel", () => {
	it("SHOWS a signed-off PR who has no bank details", () => {
		mockUsePayoutBatches.mockReturnValue(hookValue([candidate()]));
		render(<PayoutRunsPanel canPay />);
		// The person is on screen, named — not silently dropped from the week.
		expect(screen.getByText("Victoria Tan")).toBeTruthy();
		expect(screen.getByText(/payouts.noBankDetails/)).toBeTruthy();
	});

	it("disables Create while nothing is payable", () => {
		mockUsePayoutBatches.mockReturnValue(hookValue([candidate()]));
		render(<PayoutRunsPanel canPay />);
		const create = screen
			.getAllByRole("button")
			.find((b) => b.textContent?.includes("payouts.createRun"));
		expect(create).toBeTruthy();
		expect((create as HTMLButtonElement).disabled).toBe(true);
	});

	it("enables Create once someone is payable", () => {
		mockUsePayoutBatches.mockReturnValue(
			hookValue([
				candidate({
					payable: true,
					bankName: "Maybank",
					bankAccountMasked: "••••8901",
				}),
			]),
		);
		render(<PayoutRunsPanel canPay />);
		const create = screen
			.getAllByRole("button")
			.find((b) => b.textContent?.includes("payouts.createRun"));
		expect((create as HTMLButtonElement).disabled).toBe(false);
	});

	it("shows a blocked person to a viewer but offers them no Create button", () => {
		// canPay is the web twin of the backend's agencyOwnerOrFinance gate.
		mockUsePayoutBatches.mockReturnValue(hookValue([candidate()]));
		render(<PayoutRunsPanel canPay={false} />);
		expect(screen.getByText("Victoria Tan")).toBeTruthy();
		expect(
			screen
				.queryAllByRole("button")
				.some((b) => b.textContent?.includes("createRun")),
		).toBe(false);
	});

	it("never renders a full account number, only the masked form", () => {
		mockUsePayoutBatches.mockReturnValue(
			hookValue([
				candidate({
					payable: true,
					bankName: "Maybank",
					bankAccountMasked: "••••8901",
				}),
			]),
		);
		const { container } = render(<PayoutRunsPanel canPay />);
		expect(container.textContent).toContain("••••8901");
		expect(container.textContent).not.toMatch(/\d{9,}/);
	});
});
