import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefundDue } from "@/services/subscription-payment";

/**
 * Admin → Plan Payment → the red "refund due" card (30 Sep 2026).
 *
 * Money that lands on a voided or already-paid bill settles nothing and is owed
 * back; the server lists it at GET /subscription-payment/refunds-due and this
 * card is where the admin finally SEES it and opens it. Rendered with the real
 * dictionaries, both languages — no request is made: the page owns the query.
 */

const locale = vi.hoisted(() => ({ current: "en" as "en" | "zh" }));
// The line's "Mark refunded" dialog signs requests out through this; never called here.
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock("@/lib/portal-i18n/context", async () => {
	const actual = await vi.importActual<
		typeof import("@/lib/portal-i18n/translations")
	>("@/lib/portal-i18n/translations");
	return {
		usePortalLocale: () => ({ t: actual.translations[locale.current] }),
	};
});

import { translations } from "@/lib/portal-i18n/translations";
import { RefundsDueCard } from "./refunds-due-card";

function owed(over: Partial<RefundDue> = {}): RefundDue {
	return {
		paymentId: "pay-1",
		invoiceId: "inv-1",
		invoiceNo: "INV-000049",
		subscriberType: "agency",
		subscriberName: "Atlas Agency",
		amount: "125.00",
		currency: "MYR",
		methodType: "fpx",
		gateway: "fiuu",
		paidAt: "2026-09-29T10:00:00.000Z",
		reason: "voided",
		...over,
	};
}

const SECOND = owed({
	paymentId: "pay-2",
	invoiceId: "inv-2",
	invoiceNo: "INV-000050",
	subscriberType: "outlet",
	subscriberName: "JK House",
	amount: "1234.5",
	methodType: "card",
	paidAt: null,
	reason: "paid_twice",
});

function renderCard(
	rows: RefundDue[] | undefined,
	{ failed = false }: { failed?: boolean } = {},
) {
	const onOpenInvoice = vi.fn();
	const onRetry = vi.fn();
	// The provider draws nothing; it is there for the "Mark refunded" dialog.
	const view = render(
		<QueryClientProvider client={new QueryClient()}>
			<RefundsDueCard
				rows={rows}
				failed={failed}
				onRetry={onRetry}
				onOpenInvoice={onOpenInvoice}
			/>
		</QueryClientProvider>,
	);
	return { ...view, onOpenInvoice, onRetry };
}

const en = translations.en.adminService;
const zh = translations.zh.adminService;

beforeEach(() => {
	locale.current = "en";
});
afterEach(cleanup);

describe("RefundsDueCard", () => {
	it("nothing owed → nothing on the page", () => {
		const { container } = renderCard([]);
		expect(container.innerHTML).toBe("");
		// Still loading reads the same: no card until there is something to say.
		cleanup();
		expect(renderCard(undefined).container.innerHTML).toBe("");
	});

	it("one payment → the singular title, and the line says which bill, who, how much and why", () => {
		renderCard([owed()]);

		expect(screen.getByRole("alert")).toBeTruthy();
		expect(screen.getByText(en.refundsDueTitleOne)).toBeTruthy();
		const line = screen.getByRole("button", { name: /^INV-000049/ });
		expect(line.textContent).toContain("Atlas Agency");
		expect(line.textContent).toContain("RM 125.00");
		expect(line.textContent).toContain(en.refundReasonVoided);
	});

	it("several → the count, and each line opens ITS invoice's payment panel", () => {
		const { onOpenInvoice } = renderCard([owed(), SECOND]);

		expect(
			screen.getByText(en.refundsDueTitleMany.replace("{n}", "2")),
		).toBeTruthy();
		const second = screen.getByRole("button", { name: /^INV-000050/ });
		expect(second.textContent).toContain("JK House");
		expect(second.textContent).toContain("RM 1,234.50");
		expect(second.textContent).toContain(en.refundReasonPaidTwice);

		fireEvent.click(second);
		expect(onOpenInvoice).toHaveBeenCalledWith("inv-2");
		fireEvent.click(screen.getByRole("button", { name: /^INV-000049/ }));
		expect(onOpenInvoice).toHaveBeenLastCalledWith("inv-1");
	});

	it('every line carries its own "Mark refunded", named for ITS bill', () => {
		const { onOpenInvoice } = renderCard([owed(), SECOND]);

		for (const invoice of ["INV-000049", "INV-000050"]) {
			const button = screen.getByRole("button", {
				name: en.markRefundedFor.replace("{invoice}", invoice),
			});
			expect(button.textContent).toBe(en.markRefunded);
		}
		// It is not the line: pressing it opens no payment panel.
		fireEvent.click(
			screen.getByRole("button", {
				name: en.markRefundedFor.replace("{invoice}", "INV-000049"),
			}),
		);
		expect(onOpenInvoice).not.toHaveBeenCalled();
	});

	it.each([
		"en",
		"zh",
	] as const)("the button's name CONTAINS what it shows (%s, WCAG 2.5.3)", (lang) => {
		locale.current = lang;
		const t = translations[lang].adminService;
		renderCard([owed()]);

		const button = screen.getByRole("button", {
			name: t.markRefundedFor.replace("{invoice}", "INV-000049"),
		});
		expect(button.getAttribute("aria-label")).toContain(t.markRefunded);
		expect(button.textContent).toBe(t.markRefunded);
	});

	it("an org whose row is gone still shows its refund — a dash, never a copied name", () => {
		renderCard([owed({ subscriberName: null })]);
		const line = screen.getByRole("button", { name: /^INV-000049/ });
		expect(line.textContent).toContain("—");
		expect(line.textContent).toContain("RM 125.00");
	});

	it('a failed read SAYS so, with a retry — never an empty page that reads as "none owed"', () => {
		const { onRetry } = renderCard(undefined, { failed: true });

		expect(screen.getByRole("alert").textContent).toContain(
			en.refundsDueLoadFailed,
		);
		fireEvent.click(
			screen.getByRole("button", { name: translations.en.admin.tryAgain }),
		);
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("rows already on screen stay when a later refresh fails", () => {
		renderCard([owed()], { failed: true });
		expect(screen.getByText(en.refundsDueTitleOne)).toBeTruthy();
		expect(screen.queryByText(en.refundsDueLoadFailed)).toBeNull();
	});

	it("中文 — title, hint and both reasons come from the zh dictionary", () => {
		locale.current = "zh";
		renderCard([owed(), SECOND]);

		expect(
			screen.getByText(zh.refundsDueTitleMany.replace("{n}", "2")),
		).toBeTruthy();
		expect(screen.getByText(zh.refundsDueHint)).toBeTruthy();
		expect(screen.getByText(zh.refundReasonVoided)).toBeTruthy();
		expect(screen.getByText(zh.refundReasonPaidTwice)).toBeTruthy();
	});

	it("a reason kind a newer server adds shows as sent, never a crash", () => {
		renderCard([owed({ reason: "chargeback" as RefundDue["reason"] })]);
		expect(
			screen.getByRole("button", { name: /^INV-000049/ }).textContent,
		).toContain("chargeback");
	});
});
