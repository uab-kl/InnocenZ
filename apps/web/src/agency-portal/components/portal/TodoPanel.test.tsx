import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { useLayoutEffect, useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { PortalTodoCountsContext } from "./NavAlertBadge";
import { TodoPanel } from "./TodoPanel";

/*
 * THE "START HERE" RING PLAYS ONCE, AFTER THE COUNTS ARE KNOWN (owner, 18 Nov
 * 2026 — "yes fix the to do panel").
 *
 * Every row's button ran its ring at MOUNT and only the first child was gold,
 * so a row whose count landed late and mounted ABOVE one that had already rung
 * became the first child and rang gold a second time. TodoPanel now marks the
 * list `data-iz-settled` the first render nothing is loading, and keeps it;
 * portal-motion.css M3 rings only inside a settled list.
 */

afterEach(cleanup);

/** One commit as the list saw it: was the footer "All clear", and was it settled? */
type Commit = { clear: boolean; checking: boolean; settled: boolean };
let commits: Commit[] = [];

/** A To do row, shaped like the real ones (`a.iz-alert` with a `.iz-alert__cta`). */
function Row({ name }: { name: string }) {
	const ref = useRef<HTMLAnchorElement>(null);
	// Runs after the DOM is updated on every commit this row is part of, so it
	// sees exactly what that commit painted.
	useLayoutEffect(() => {
		const panel = ref.current?.closest(".iz-todo");
		const list = panel?.querySelector(".iz-todo__list");
		commits.push({
			clear: panel?.querySelector(".iz-todo__clear") != null,
			checking: panel?.querySelector(".iz-todo__checking") != null,
			settled: list?.hasAttribute("data-iz-settled") ?? false,
		});
	});
	return (
		<a ref={ref} href={`#${name}`} className="iz-alert iz-todo__row">
			<span className="iz-alert__cta">{name}</span>
		</a>
	);
}

function Panel({
	loading,
	pageLoading,
	rows = ["first", "second"],
}: {
	loading: boolean;
	pageLoading?: boolean;
	rows?: string[];
}) {
	return (
		<PortalTodoCountsContext.Provider value={{ loading, counts: {} }}>
			<TodoPanel loading={pageLoading}>
				{rows.map((name) => (
					<Row key={name} name={name} />
				))}
			</TodoPanel>
		</PortalTodoCountsContext.Provider>
	);
}

function seen(container: HTMLElement) {
	const list = container.querySelector(".iz-todo__list");
	return {
		rows: list?.querySelectorAll(":scope > a.iz-alert").length ?? 0,
		settled: list?.getAttribute("data-iz-settled") ?? null,
		checking: container.querySelector(".iz-todo__checking") !== null,
		allClear: container.querySelector(".iz-todo__clear") !== null,
	};
}

describe("TodoPanel — the list is marked settled once, and stays so", () => {
	afterEach(() => {
		commits = [];
	});

	it("renders its rows while checking, without marking the list settled", () => {
		const view = render(<Panel loading />);
		expect(seen(view.container)).toEqual({
			rows: 2,
			settled: null,
			checking: true,
			allClear: false,
		});
	});

	it("marks the list settled on the render loading ends", () => {
		const view = render(<Panel loading />);
		view.rerender(<Panel loading={false} />);
		expect(seen(view.container)).toEqual({
			rows: 2,
			settled: "true",
			checking: false,
			allClear: true,
		});
	});

	it("never paints the all-clear on an unsettled list, even for one frame", () => {
		const view = render(<Panel loading />);
		view.rerender(<Panel loading={false} />);
		view.rerender(<Panel loading={false} rows={["late", "first", "second"]} />);
		// The instrument: the probe really did see the checking commit AND the
		// all-clear ones, so "no bad commit" below is about the panel.
		expect(commits.some((c) => c.checking && !c.settled)).toBe(true);
		expect(commits.some((c) => c.clear && c.settled)).toBe(true);
		expect(commits.filter((c) => c.clear && !c.settled)).toEqual([]);
	});

	it("KEEPS the mark when loading comes back (a refetch after an error)", () => {
		const view = render(<Panel loading />);
		view.rerender(<Panel loading={false} />);
		view.rerender(<Panel loading />);
		const back = seen(view.container);
		// The footer still answers the flag as it always has…
		expect(back.checking).toBe(true);
		// …but the list stays settled, so no ring can replay.
		expect(back.settled).toBe("true");
		view.rerender(<Panel loading={false} />);
		expect(seen(view.container).settled).toBe("true");
	});

	it("is settled from the first paint when the counts are already known", () => {
		const view = render(<Panel loading={false} />);
		expect(seen(view.container).settled).toBe("true");
		expect(commits.length).toBeGreaterThan(0);
		expect(commits.every((c) => c.settled)).toBe(true);
	});

	it("keeps a row that mounts after settle inside the settled list", () => {
		const view = render(<Panel loading />);
		view.rerender(<Panel loading={false} />);
		view.rerender(<Panel loading={false} rows={["late", "first", "second"]} />);
		const list = view.container.querySelector(".iz-todo__list");
		expect(list?.firstElementChild?.textContent).toBe("late");
		expect(list?.getAttribute("data-iz-settled")).toBe("true");
	});
});

describe("TodoPanel — a page's own loading flag", () => {
	it("holds the footer on 'Checking…', and the list unsettled, while the page is loading", () => {
		const view = render(<Panel loading={false} pageLoading />);
		expect(seen(view.container)).toEqual({
			rows: 2,
			settled: null,
			checking: true,
			allClear: false,
		});
		view.rerender(<Panel loading={false} pageLoading={false} />);
		expect(seen(view.container)).toEqual({
			rows: 2,
			settled: "true",
			checking: false,
			allClear: true,
		});
	});

	it("cannot clear a panel whose counts are still loading", () => {
		const view = render(<Panel loading pageLoading={false} />);
		expect(seen(view.container).checking).toBe(true);
		expect(seen(view.container).settled).toBeNull();
	});

	it("defaults to not loading, so a page that passes nothing (agency Today) is unchanged", () => {
		const view = render(
			<PortalTodoCountsContext.Provider value={{ loading: false, counts: {} }}>
				<TodoPanel>{null}</TodoPanel>
			</PortalTodoCountsContext.Provider>,
		);
		expect(seen(view.container).allClear).toBe(true);
		expect(seen(view.container).settled).toBe("true");
	});
});

/*
 * THE CSS HALF. The latch only matters if M3 keys its ring on it — a ring rule
 * written for a bare `.iz-todo__list` would ring at mount again and every test
 * above would still pass.
 */
describe("portal-motion.css M3 — the To do ring needs a settled list", () => {
	// Found from either the web app or the repo root, the way NavAlertBadge.test
	// finds the same file.
	function cssPath(rel: string) {
		return (
			[resolve(rel), resolve("apps/web", rel)].find((p) => existsSync(p)) ??
			`${rel} (not found)`
		);
	}
	const motionPath = cssPath("src/agency-portal/portal-motion.css");
	const panelPath = cssPath(
		"src/agency-portal/components/portal/todo-panel.css",
	);

	/** Every innermost `selector { declarations }` rule, comments removed. */
	function leafRules(path: string) {
		const css = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
		return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
			selector: m[1].replace(/\s+/g, " ").trim(),
			body: m[2],
		}));
	}
	/** A rule that RUNS the ring or SETS its colour (not the keyframes reading it). */
	const ringsOrTones = (body: string) =>
		/animation[^;]*\biz-m-ring\b/.test(body) || /--iz-ring-tone\s*:/.test(body);
	/** A rule that can reach a To do row's button. */
	const reachesTodo = (selector: string) =>
		/\.iz-(todo|alert)\b/.test(selector);

	it("finds both files", () => {
		expect(existsSync(motionPath)).toBe(true);
		expect(existsSync(panelPath)).toBe(true);
	});

	it("keys every To do ring and ring colour on [data-iz-settled]", () => {
		const rules = leafRules(motionPath);
		// The instrument: it sees M4's red badge ring too, so a ring rule anywhere
		// in the file is one this scan finds.
		const allRings = rules.filter((r) => ringsOrTones(r.body));
		expect(allRings.some((r) => r.selector.includes(".iz-nav-alert"))).toBe(
			true,
		);
		const todoRings = rules.filter(
			(r) => ringsOrTones(r.body) && reachesTodo(r.selector),
		);
		// The ring itself AND the gold tone on the first row — both, or a rename
		// has moved one where this check cannot see it.
		expect(
			todoRings.some((r) => /animation[^;]*\biz-m-ring\b/.test(r.body)),
		).toBe(true);
		expect(
			todoRings.some(
				(r) =>
					/--iz-ring-tone\s*:/.test(r.body) &&
					r.selector.includes(":first-child"),
			),
		).toBe(true);
		for (const rule of todoRings) {
			expect(rule.selector, rule.selector).toContain(
				".iz-todo__list[data-iz-settled]",
			);
			expect(
				rule.selector.match(/\.iz-todo__list(?!\[data-iz-settled\])/g),
				rule.selector,
			).toBeNull();
		}
	});

	it("still lets every row RISE as it mounts, settled or not", () => {
		const rise = leafRules(motionPath).filter(
			(r) =>
				/animation[^;]*\biz-m-rise\b/.test(r.body) &&
				r.selector.includes(".iz-todo__list"),
		);
		expect(rise.length).toBeGreaterThan(0);
		for (const rule of rise) {
			expect(rule.selector).not.toContain("[data-iz-settled]");
		}
	});

	it("leaves no To do ring in todo-panel.css, where the gate would not reach", () => {
		const rules = leafRules(panelPath);
		// The instrument: the scan does read this file's first-row button rule.
		expect(
			rules.some((r) =>
				r.selector.includes(
					".iz-todo__list > a.iz-alert:first-child .iz-alert__cta",
				),
			),
		).toBe(true);
		expect(
			rules.filter((r) => ringsOrTones(r.body) && reachesTodo(r.selector)),
		).toEqual([]);
	});
});
