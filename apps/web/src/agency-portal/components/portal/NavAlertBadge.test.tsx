import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	NAV_ALERT_POP_MS,
	NavAlertBadge,
	NavAlertSettledContext,
} from "./NavAlertBadge";

/*
 * POP ONLY ON CHANGE (owner, 18 Nov 2026). A rail badge stays still while a
 * page opens or reloads, and pops only when its number CHANGES once the counts
 * have loaded. The pop is the `data-iz-pop` stamp; portal-motion.css M4
 * animates nothing else.
 */

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

function Badge({
	count,
	settled,
	tone = "amber",
}: {
	count: number;
	settled: boolean;
	tone?: "amber" | "red";
}) {
	return (
		<NavAlertSettledContext.Provider value={settled}>
			<NavAlertBadge count={count} tone={tone} />
		</NavAlertSettledContext.Provider>
	);
}

function pill(container: HTMLElement): HTMLElement | null {
	return container.querySelector<HTMLElement>(".iz-nav-alert");
}

/** Mount, then walk the first load: loading → the counts land → settled. */
function settledAt(count: number) {
	const view = render(<Badge count={0} settled={false} />);
	view.rerender(<Badge count={count} settled={false} />);
	view.rerender(<Badge count={count} settled />);
	return view;
}

describe("NavAlertBadge — pop only on change", () => {
	it("stays still through the first load, even when the last count lands as it settles", () => {
		const view = render(<Badge count={0} settled={false} />);
		expect(pill(view.container)).toBeNull();
		view.rerender(<Badge count={3} settled={false} />);
		expect(pill(view.container)?.hasAttribute("data-iz-pop")).toBe(false);
		// The last query and the loading flag land in the SAME render.
		view.rerender(<Badge count={5} settled />);
		expect(pill(view.container)?.textContent).toBe("5");
		expect(pill(view.container)?.hasAttribute("data-iz-pop")).toBe(false);
	});

	it("pops when the number changes after the counts settled", () => {
		const view = settledAt(5);
		const before = pill(view.container);
		view.rerender(<Badge count={6} settled />);
		const after = pill(view.container);
		expect(after?.textContent).toBe("6");
		expect(after?.hasAttribute("data-iz-pop")).toBe(true);
		// A fresh node, so the animation starts from its first frame.
		expect(after).not.toBe(before);
	});

	it("does not pop again for a refetch that returns the same number", () => {
		vi.useFakeTimers();
		const view = settledAt(5);
		view.rerender(<Badge count={6} settled />);
		act(() => {
			vi.advanceTimersByTime(NAV_ALERT_POP_MS);
		});
		const rested = pill(view.container);
		expect(rested?.hasAttribute("data-iz-pop")).toBe(false);
		view.rerender(<Badge count={6} settled />);
		expect(pill(view.container)).toBe(rested);
		expect(pill(view.container)?.hasAttribute("data-iz-pop")).toBe(false);
	});

	it("pops 0 → 1 after the page has settled", () => {
		const view = settledAt(0);
		expect(pill(view.container)).toBeNull();
		view.rerender(<Badge count={1} settled />);
		expect(pill(view.container)?.hasAttribute("data-iz-pop")).toBe(true);
	});

	it("does not pop a badge that MOUNTS after the counts settled (a folded group)", () => {
		const view = render(<Badge count={4} settled />);
		expect(pill(view.container)?.hasAttribute("data-iz-pop")).toBe(false);
	});

	it("takes the stamp off after the pop, so a hidden row cannot replay it later", () => {
		vi.useFakeTimers();
		const view = settledAt(2);
		view.rerender(<Badge count={3} settled tone="red" />);
		expect(pill(view.container)?.hasAttribute("data-iz-pop")).toBe(true);
		act(() => {
			vi.advanceTimersByTime(NAV_ALERT_POP_MS - 1);
		});
		expect(pill(view.container)?.hasAttribute("data-iz-pop")).toBe(true);
		act(() => {
			vi.advanceTimersByTime(1);
		});
		expect(pill(view.container)?.hasAttribute("data-iz-pop")).toBe(false);
	});

	it("restarts the pop for a second change inside the window", () => {
		vi.useFakeTimers();
		const view = settledAt(1);
		view.rerender(<Badge count={2} settled />);
		const first = pill(view.container);
		act(() => {
			vi.advanceTimersByTime(NAV_ALERT_POP_MS / 2);
		});
		view.rerender(<Badge count={3} settled />);
		const second = pill(view.container);
		expect(second).not.toBe(first);
		expect(second?.hasAttribute("data-iz-pop")).toBe(true);
		// The window restarts from the second pop.
		act(() => {
			vi.advanceTimersByTime(NAV_ALERT_POP_MS / 2 + 1);
		});
		expect(pill(view.container)?.hasAttribute("data-iz-pop")).toBe(true);
	});

	it("is silent while the counts reload, and adopts what they settle on", () => {
		const view = settledAt(5);
		view.rerender(<Badge count={0} settled={false} />);
		view.rerender(<Badge count={8} settled />);
		expect(pill(view.container)?.hasAttribute("data-iz-pop")).toBe(false);
	});

	it("does not pop when the number shown stays 99+", () => {
		const view = settledAt(120);
		view.rerender(<Badge count={130} settled />);
		expect(pill(view.container)?.textContent).toBe("99+");
		expect(pill(view.container)?.hasAttribute("data-iz-pop")).toBe(false);
	});

	it("keeps the pill hidden from screen readers and capped at 99+", () => {
		const view = render(<Badge count={250} settled />);
		expect(pill(view.container)?.getAttribute("aria-hidden")).toBe("true");
		expect(pill(view.container)?.textContent).toBe("99+");
	});
});

describe("portal-motion.css M4 — animates only a stamped badge", () => {
	// Found from either the web app or the repo root, so the check holds
	// however vitest is started (the neighbouring file-reading tests do the same).
	const path =
		[
			resolve("src/agency-portal/portal-motion.css"),
			resolve("apps/web/src/agency-portal/portal-motion.css"),
		].find((p) => existsSync(p)) ?? "portal-motion.css (not found)";

	it("keeps the stamp on for the whole pop and red ring", () => {
		// The stamp's removal ENDS the animation, so a token raised past the
		// stamp would cut the red ring off part-way with nothing else failing.
		expect(existsSync(path)).toBe(true);
		const css = readFileSync(path, "utf8");
		const ms = (token: string) => {
			const m = css.match(new RegExp(`${token}:\\s*(\\d+)ms`));
			expect(m, `${token} not found in portal-motion.css`).not.toBeNull();
			return Number(m?.[1]);
		};
		expect(NAV_ALERT_POP_MS).toBeGreaterThanOrEqual(
			ms("--iz-motion-enter") + ms("--iz-motion-ring"),
		);
	});

	it("never selects a bare .iz-nav-alert", () => {
		// Prove the instrument first: a missing file or a renamed selector would
		// otherwise pass the check below with nothing found.
		expect(existsSync(path)).toBe(true);
		const rules = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
		expect(rules).toContain(".iz-nav-alert[data-iz-pop]");
		expect(rules.match(/\.iz-nav-alert(?!\[data-iz-pop\])/g)).toBeNull();
	});
});
