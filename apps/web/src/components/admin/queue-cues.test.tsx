import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";

vi.mock("@/lib/portal-i18n/context", () => ({
	usePortalLocale: () => ({ t: translations.en, locale: "en" }),
}));

const { QueueRowButton, QueueWaitingStrip, queueRowState } = await import(
	"./queue-cues"
);
const t = translations.en;

afterEach(cleanup);

describe("queueRowState", () => {
	it("stamps the state the CSS and the page sweep read", () => {
		expect(queueRowState("decide")).toEqual({ "data-queue-state": "decide" });
		expect(queueRowState("open")).toEqual({ "data-queue-state": "open" });
		expect(queueRowState("done")).toEqual({ "data-queue-state": "done" });
	});
});

describe("QueueRowButton", () => {
	/*
	 * A row that can still be decided offers the decision; a closed one only
	 * offers a look. Both open the SAME sheet — the word is the only change.
	 */
	it.each([
		["decide", t.rbac.review],
		["open", t.rbac.review],
		["done", t.common.view],
	] as const)("a %s row reads %s and opens the sheet once", (state, word) => {
		const onOpen = vi.fn();
		const onRow = vi.fn();
		render(
			// The row is clickable too: the button must not open the sheet twice.
			// biome-ignore lint/a11y/useKeyWithClickEvents: test harness row
			// biome-ignore lint/a11y/noStaticElementInteractions: test harness row
			<div onClick={onRow}>
				<QueueRowButton state={state} onOpen={onOpen} />
			</div>,
		);
		const button = screen.getByRole("button", { name: word });
		fireEvent.click(button);
		expect(onOpen).toHaveBeenCalledTimes(1);
		expect(onRow).not.toHaveBeenCalled();
	});

	it("fills only the buttons that act (decide/open), never a closed row's", () => {
		const { rerender } = render(
			<QueueRowButton state="decide" onOpen={() => {}} />,
		);
		expect(screen.getByRole("button").dataset.variant).toBe("default");
		rerender(<QueueRowButton state="done" onOpen={() => {}} />);
		expect(screen.getByRole("button").dataset.variant).toBe("ghost");
	});
});

describe("QueueWaitingStrip", () => {
	const noop = () => {};

	it("renders nothing at zero — an empty amber strip is itself noise", () => {
		const { container } = render(
			<QueueWaitingStrip
				count={0}
				showingWaiting={false}
				onShowWaiting={noop}
				onShowAll={noop}
			/>,
		);
		expect(container.firstChild).toBeNull();
	});

	it("says one and many in whole sentences", () => {
		const { rerender } = render(
			<QueueWaitingStrip
				count={1}
				showingWaiting={false}
				onShowWaiting={noop}
				onShowAll={noop}
			/>,
		);
		expect(screen.getByText(t.admin.queueWaitingOne)).toBeTruthy();
		rerender(
			<QueueWaitingStrip
				count={3}
				showingWaiting={false}
				onShowWaiting={noop}
				onShowAll={noop}
			/>,
		);
		expect(screen.getByText("3 waiting for your decision")).toBeTruthy();
	});

	it("offers the filter shortcut, then the way back", () => {
		const onShowWaiting = vi.fn();
		const onShowAll = vi.fn();
		const { rerender } = render(
			<QueueWaitingStrip
				count={2}
				showingWaiting={false}
				onShowWaiting={onShowWaiting}
				onShowAll={onShowAll}
			/>,
		);
		fireEvent.click(
			screen.getByRole("button", { name: t.admin.queueShowWaiting }),
		);
		expect(onShowWaiting).toHaveBeenCalledTimes(1);
		rerender(
			<QueueWaitingStrip
				count={2}
				showingWaiting
				onShowWaiting={onShowWaiting}
				onShowAll={onShowAll}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: t.admin.queueShowAll }));
		expect(onShowAll).toHaveBeenCalledTimes(1);
	});

	it("every new word exists in Chinese too", () => {
		const zh = translations.zh.admin;
		for (const key of [
			"queueWaitingOne",
			"queueWaitingMany",
			"queueShowWaiting",
			"queueShowAll",
		] as const) {
			expect(zh[key]).toBeTruthy();
			expect(zh[key]).not.toBe(t.admin[key]);
		}
		expect(zh.queueWaitingMany).toContain("{count}");
	});
});
