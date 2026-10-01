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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefundDue } from "@/services/subscription-payment";

/**
 * Admin → Plan Payment → red card → "Mark refunded" (30 Sep 2026).
 *
 * What the admin must be able to SEE and DO: each line's button opens a dialog
 * for THAT bill; confirming waits for a refund reference the server would
 * accept; the confirmation is the SERVER's sentence in the admin's language; a
 * refusal stays in the dialog, translated; and the card refreshes. Driven
 * through the card, as it is clicked. The service is mocked — nothing is sent.
 */

const locale = vi.hoisted(() => ({ current: "en" as "en" | "zh" }));
const mockMarkRefunded = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("@/services/subscription-payment", async () => {
	const actual = await vi.importActual<
		typeof import("@/services/subscription-payment")
	>("@/services/subscription-payment");
	return {
		...actual,
		markPaymentRefunded: (...args: unknown[]) => mockMarkRefunded(...args),
	};
});
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock("sonner", () => ({
	toast: {
		success: (...args: unknown[]) => toastSuccess(...args),
		error: (...args: unknown[]) => toastError(...args),
	},
}));
vi.mock("@/lib/portal-i18n/context", async () => {
	const actual = await vi.importActual<
		typeof import("@/lib/portal-i18n/translations")
	>("@/lib/portal-i18n/translations");
	return {
		usePortalLocale: () => ({ t: actual.translations[locale.current] }),
	};
});

import { translations } from "@/lib/portal-i18n/translations";
import {
	REFUND_REFERENCE_MAX,
	REFUNDS_DUE_QUERY_KEY,
} from "@/services/subscription-payment";
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
		paidAt: null,
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
	reason: "paid_twice",
});

/** The server's own confirmation, as `refundedMessage` words it. */
const CONFIRMED =
	"INV-000050: RM 1,234.50 marked refunded — reference MBB-20260930-0001";

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

function renderCard() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	const invalidate = vi.spyOn(client, "invalidateQueries");
	render(
		<QueryClientProvider client={client}>
			<RefundsDueCard
				rows={[owed(), SECOND]}
				failed={false}
				onRetry={vi.fn()}
				onOpenInvoice={vi.fn()}
			/>
		</QueryClientProvider>,
	);
	return { invalidate };
}

/** Press "Mark refunded" on one line and hand back the dialog it opened. */
function openFor(invoiceNo: string) {
	const t = translations[locale.current].adminService;
	fireEvent.click(
		screen.getByRole("button", {
			name: t.markRefundedFor.replace("{invoice}", invoiceNo),
		}),
	);
	const dialog = screen.getByRole("dialog");
	return {
		dialog,
		input: within(dialog).getByLabelText(t.refundReference),
		confirm: within(dialog).getByRole("button", { name: t.confirmRefunded }),
	};
}

beforeEach(() => {
	locale.current = "en";
	mockMarkRefunded.mockReset();
	toastSuccess.mockReset();
	toastError.mockReset();
});
afterEach(cleanup);

describe("Mark refunded", () => {
	it("opens for THAT line's bill, waits for a reference, sends it trimmed, confirms in the server's words and refreshes the card", async () => {
		const en = translations.en.adminService;
		mockMarkRefunded.mockResolvedValue({
			success: true,
			message: CONFIRMED,
			data: {},
		});
		const { invalidate } = renderCard();

		const { dialog, input, confirm } = openFor("INV-000050");
		expect(
			within(dialog).getByText(
				en.markRefundedTitle.replace("{invoice}", "INV-000050"),
			),
		).toBeTruthy();
		expect(dialog.textContent).toContain("RM 1,234.50");
		expect(dialog.textContent).toContain("JK House");
		// Nothing to send yet: the server requires a reference.
		expect((confirm as HTMLButtonElement).disabled).toBe(true);

		fireEvent.change(input, { target: { value: "  MBB-20260930-0001  " } });
		expect((confirm as HTMLButtonElement).disabled).toBe(false);
		fireEvent.click(confirm);

		await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith(CONFIRMED));
		expect(mockMarkRefunded).toHaveBeenCalledWith(
			"pay-2",
			"MBB-20260930-0001",
			expect.any(Function),
		);
		expect(invalidate).toHaveBeenCalledWith({
			queryKey: REFUNDS_DUE_QUERY_KEY,
		});
		expect(invalidate).toHaveBeenCalledWith({
			queryKey: ["invoice-payment-detail"],
		});
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});

	it("中文 — the dialog and the server's confirmation are both in Chinese; the values pass through", async () => {
		locale.current = "zh";
		const zh = translations.zh.adminService;
		mockMarkRefunded.mockResolvedValue({
			success: true,
			message: CONFIRMED,
			data: {},
		});
		renderCard();

		const { dialog, input, confirm } = openFor("INV-000050");
		expect(
			within(dialog).getByText(
				zh.markRefundedTitle.replace("{invoice}", "INV-000050"),
			),
		).toBeTruthy();
		expect(within(dialog).getByText(zh.refundReference)).toBeTruthy();

		fireEvent.change(input, { target: { value: "MBB-20260930-0001" } });
		fireEvent.click(confirm);

		await waitFor(() =>
			expect(toastSuccess).toHaveBeenCalledWith(
				zh.serverRefunded
					.replace("{invoice}", "INV-000050")
					.replace("{amount}", "RM 1,234.50")
					.replace("{reference}", "MBB-20260930-0001"),
			),
		);
	});

	it.each([
		["en", "This payment is already marked refunded"],
		["zh", translations.zh.adminService.serverRefundAlreadyDone],
	] as const)("a refusal (%s) stays in the dialog, translated — and the stale line is refreshed", async (lang, shown) => {
		locale.current = lang;
		mockMarkRefunded.mockRejectedValue(
			refusal(409, "This payment is already marked refunded"),
		);
		const { invalidate } = renderCard();

		const { dialog, input, confirm } = openFor("INV-000049");
		fireEvent.change(input, { target: { value: "MBB-1" } });
		fireEvent.click(confirm);

		const alert = await within(dialog).findByRole("alert");
		expect(alert.textContent).toBe(shown);
		expect(toastSuccess).not.toHaveBeenCalled();
		// The row moved under the dialog (another tab) — the card refetches.
		expect(invalidate).toHaveBeenCalledWith({
			queryKey: REFUNDS_DUE_QUERY_KEY,
		});
		expect(screen.getByRole("dialog")).toBeTruthy();
	});

	it("a blank reference cannot be sent", () => {
		renderCard();
		const { input, confirm } = openFor("INV-000049");

		fireEvent.change(input, { target: { value: "    " } });
		expect((confirm as HTMLButtonElement).disabled).toBe(true);
		expect(mockMarkRefunded).not.toHaveBeenCalled();
	});

	it.each([
		"en",
		"zh",
	] as const)("a pasted reference over the bound is KEPT whole and shown as too long (%s)", (lang) => {
		locale.current = lang;
		const t = translations[lang].adminService;
		renderCard();
		const { dialog, input, confirm } = openFor("INV-000049");
		const pasted = "R".repeat(REFUND_REFERENCE_MAX + 1);

		fireEvent.change(input, { target: { value: pasted } });

		// Never silently cut short: the field holds all of it...
		expect((input as HTMLInputElement).value).toBe(pasted);
		expect(input.hasAttribute("maxlength")).toBe(false);
		// ...and says why Confirm waits.
		expect((confirm as HTMLButtonElement).disabled).toBe(true);
		expect(input.getAttribute("aria-invalid")).toBe("true");
		expect(dialog.textContent).toContain(
			t.refundReferenceTooLong
				.replace("{n}", String(REFUND_REFERENCE_MAX + 1))
				.replace("{max}", String(REFUND_REFERENCE_MAX)),
		);

		fireEvent.change(input, {
			target: { value: "R".repeat(REFUND_REFERENCE_MAX) },
		});
		expect((confirm as HTMLButtonElement).disabled).toBe(false);
		expect(mockMarkRefunded).not.toHaveBeenCalled();
	});

	it("a refusal is cleared as soon as the reference is edited", async () => {
		mockMarkRefunded.mockRejectedValue(
			refusal(409, "This payment is already marked refunded"),
		);
		renderCard();
		const { dialog, input, confirm } = openFor("INV-000049");
		fireEvent.change(input, { target: { value: "MBB-1" } });
		fireEvent.click(confirm);
		await within(dialog).findByRole("alert");

		fireEvent.change(input, { target: { value: "MBB-2" } });

		await waitFor(() => expect(within(dialog).queryByRole("alert")).toBeNull());
	});

	it("a payment that is gone (404) also refreshes the card, in the reader's words", async () => {
		locale.current = "zh";
		mockMarkRefunded.mockRejectedValue(refusal(404, "Not Found"));
		const { invalidate } = renderCard();
		const { dialog, input, confirm } = openFor("INV-000049");

		fireEvent.change(input, { target: { value: "MBB-1" } });
		fireEvent.click(confirm);

		const alert = await within(dialog).findByRole("alert");
		expect(alert.textContent).toBe(
			translations.zh.adminService.serverRefundPaymentGone,
		);
		expect(invalidate).toHaveBeenCalledWith({
			queryKey: REFUNDS_DUE_QUERY_KEY,
		});
	});

	it("Cancel closes it without a request", async () => {
		renderCard();
		const { dialog } = openFor("INV-000049");

		fireEvent.click(
			within(dialog).getByRole("button", {
				name: translations.en.common.cancel,
			}),
		);

		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(mockMarkRefunded).not.toHaveBeenCalled();
	});
});
