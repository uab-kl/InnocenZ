import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * THE EDITOR SAYS WHAT A COMMISSION FIGURE COVERS (28 Sep 2026 audit).
 *
 * A line's `amount` is the commission for the WHOLE line — the voucher subtotal
 * sums `amount` and never multiplies it by the quantity — while the RM beside
 * each catalogue item is the outlet's price for ONE unit. The editor put the two
 * side by side under the bare word "Commission", so a reviewer correcting "2 ×
 * Lemon Drop" could not tell whether to type one drink's cut or both.
 *
 * Rendered with the REAL English dictionary: this pins the words the reviewer
 * reads, which is the whole of the fix. The data hooks are mocked.
 */

vi.mock("@agency-portal/hooks/use-agency-receipt-edit", () => ({
	useAgencyReceiptEdit: () => ({
		editLine: vi.fn(),
		addLine: vi.fn(),
		editReceipt: vi.fn(),
		resetError: vi.fn(),
		isSaving: false,
		error: null,
	}),
}));

vi.mock("@agency-portal/hooks/use-receipt-catalogue", () => ({
	useReceiptCatalogue: () => ({
		items: [
			{
				id: "i1",
				name: "Lemon Drop",
				priceRm: "60.00",
				category: "drink",
				kind: "drinks",
			},
		],
		outlet: "Velvet 23",
		outletId: "o1",
		message: null,
		isLoading: false,
	}),
}));

vi.mock("@/lib/portal-i18n/context", async () => {
	const { translations } = await import("@/lib/portal-i18n/translations");
	return { usePortalLocale: () => ({ t: translations.en, locale: "en" }) };
});

import { translations } from "@/lib/portal-i18n/translations";
import { AgencyReceiptEditor } from "./AgencyReceiptEditor";

const en = translations.en.agencyReceipts;

function renderEditor() {
	render(
		<AgencyReceiptEditor
			receipt={{
				id: "r1",
				receiptNo: "RCP-000007",
				orderNo: "ORD0389",
				receiptDate: "2026-09-15",
				receiptTime: "21:45",
				status: "approved",
			}}
			lines={[
				{
					id: "l1",
					description: "Lemon Drop",
					quantity: 2,
					amount: "24.00",
					kind: "drinks",
				},
			]}
		/>,
	);
}

describe("AgencyReceiptEditor — per unit or whole line", () => {
	it("heads the commission column as the line's total", () => {
		renderEditor();
		expect(screen.getByText(en.colCommission)).toBeTruthy();
		expect(en.colCommission.toLowerCase()).toContain("line total");
	});

	it("says under the lines that the figure covers every unit, and a qty edit does not re-price it", () => {
		renderEditor();
		const note = screen.getByText(en.commissionIsPrCut);
		expect(note.textContent).toMatch(/whole line/);
		expect(note.textContent).toMatch(/does not recalculate/);
	});

	it("names each commission box as the whole line's, for a screen reader too", () => {
		renderEditor();
		expect(
			screen.getByLabelText("Whole-line commission in RM for Lemon Drop"),
		).toBeTruthy();
	});

	it("tells the reviewer adding a line that the outlet price is for ONE unit", () => {
		renderEditor();
		fireEvent.click(screen.getByText(en.paperShowsMissingItem));
		expect(screen.getByText(/selling price for ONE unit/)).toBeTruthy();
	});

	it("says the same in 中文", () => {
		const zh = translations.zh.agencyReceipts;
		expect(zh.colCommission).toContain("整行");
		expect(zh.commissionIsPrCut).toContain("整行");
		expect(zh.outletPriceVsCommission).toContain("单件");
	});
});
