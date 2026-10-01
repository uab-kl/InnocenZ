import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * APPROVE MUST WAIT FOR THE DECISION IN FLIGHT (28 Sep 2026 audit).
 *
 * Approving releases people and seals a pro-rated wage on each of them, and
 * the button stayed live while the request was out — a second press fired a
 * second decision behind the first. The locale is mocked; this is about what
 * the buttons allow.
 */
vi.mock("@/lib/portal-i18n/context", () => ({
	usePortalLocale: () => ({
		locale: "en",
		t: new Proxy(
			{},
			{
				get: (_t, section: string) =>
					new Proxy({}, { get: (_s, key: string) => `${section}.${key}` }),
			},
		),
	}),
}));

import type { PendingCutlostRequest } from "@agency-portal/lib/outlet-cutlost-requests";
import { CutlostDetailPanel } from "./CutlostDetailPanel";

const REQ: PendingCutlostRequest = {
	id: "req-1",
	shiftId: "shift-1",
	outletName: "Venue",
	shiftEvent: "Lunch",
	shiftLabel: "09:00 - 15:00",
	dateLabel: "2026-08-06",
	kind: "cut_slots",
	status: "pending",
	slotsCut: 1,
	estimatedSavings: 55,
	cutlostBefore: 0,
	requestedAt: "2026-08-06T08:12:25.416Z",
	requestedAtIso: "2026-08-06T08:12:25.416Z",
};

function renderPanel(busy: boolean) {
	const onApprove = vi.fn();
	const onDecline = vi.fn();
	render(
		<CutlostDetailPanel
			req={REQ}
			canDecide
			busy={busy}
			onApprove={onApprove}
			onDecline={onDecline}
		/>,
	);
	const approve = screen
		.getByText("common.approve")
		.closest("button") as HTMLButtonElement;
	const decline = screen
		.getByText("common.decline")
		.closest("button") as HTMLButtonElement;
	return { approve, decline, onApprove, onDecline };
}

describe("CutlostDetailPanel", () => {
	it("disables both decisions while one is in flight", () => {
		const { approve, decline, onApprove, onDecline } = renderPanel(true);
		expect(approve.disabled).toBe(true);
		expect(decline.disabled).toBe(true);
		fireEvent.click(approve);
		fireEvent.click(decline);
		expect(onApprove).not.toHaveBeenCalled();
		expect(onDecline).not.toHaveBeenCalled();
	});

	it("allows a decision when nothing is in flight", () => {
		const { approve, onApprove } = renderPanel(false);
		expect(approve.disabled).toBe(false);
		fireEvent.click(approve);
		expect(onApprove).toHaveBeenCalledTimes(1);
	});

	it("never prints the raw UTC instant, nor a zero loss chip", () => {
		renderPanel(false);
		expect(screen.queryByText(/T08:12/)).toBeNull();
		expect(screen.queryByText(/approvals\.cutlost RM/)).toBeNull();
	});
});
