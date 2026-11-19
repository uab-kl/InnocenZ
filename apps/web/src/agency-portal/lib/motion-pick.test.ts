import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listenForPicks, PICK_ATTR, PICK_MS, pickRootFor } from "./motion-pick";

function mount(html: string): HTMLElement {
	const host = document.createElement("div");
	host.innerHTML = html;
	document.body.append(host);
	return host;
}

describe("pickRootFor", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	it("marks the strip a tab sits in", () => {
		const host = mount(
			'<div class="iz-payroll-tabs"><button class="iz-payroll-tab">A</button></div>',
		);
		const strip = host.querySelector(".iz-payroll-tabs");
		const span = document.createElement("span");
		host.querySelector("button")?.append(span);
		expect(pickRootFor(span)).toBe(strip);
	});

	it("marks a role=tablist for a role=tab", () => {
		const host = mount(
			'<div role="tablist"><div role="tab" tabindex="0">A</div></div>',
		);
		expect(pickRootFor(host.querySelector('[role="tab"]'))).toBe(
			host.querySelector('[role="tablist"]'),
		);
	});

	it("marks a rail section heading itself", () => {
		const host = mount(
			'<nav class="iz-portal-sidebar"><button class="iz-outlet-nav-heading">Money</button></nav>',
		);
		const heading = host.querySelector(".iz-outlet-nav-heading");
		expect(pickRootFor(heading)).toBe(heading);
	});

	it("ignores a disabled tab (a view-only lane picks nothing)", () => {
		const host = mount(
			'<div class="iz-agency-home-tabs"><button disabled>A</button><button aria-disabled="true">B</button></div>',
		);
		for (const button of host.querySelectorAll("button")) {
			expect(pickRootFor(button)).toBeNull();
		}
	});

	it("ignores ordinary buttons and non-elements", () => {
		const host = mount('<div><button class="iz-btn">Save</button></div>');
		expect(pickRootFor(host.querySelector("button"))).toBeNull();
		expect(pickRootFor(null)).toBeNull();
		expect(pickRootFor(window)).toBeNull();
	});
});

describe("listenForPicks", () => {
	let stop: () => void;

	beforeEach(() => {
		vi.useFakeTimers();
		stop = listenForPicks(document);
	});
	afterEach(() => {
		stop();
		vi.useRealTimers();
		document.body.innerHTML = "";
	});

	it("marks on a click and unmarks after the motion window", () => {
		const host = mount(
			'<div class="iz-roster-toggle"><button>Live</button></div>',
		);
		const strip = host.querySelector(".iz-roster-toggle") as HTMLElement;
		host.querySelector("button")?.click();
		expect(strip.hasAttribute(PICK_ATTR)).toBe(true);
		vi.advanceTimersByTime(PICK_MS - 1);
		expect(strip.hasAttribute(PICK_ATTR)).toBe(true);
		vi.advanceTimersByTime(1);
		expect(strip.hasAttribute(PICK_ATTR)).toBe(false);
	});

	it("a second pick restarts the window instead of ending early", () => {
		const host = mount(
			'<div class="iz-payroll-tabs"><button>A</button><button>B</button></div>',
		);
		const strip = host.querySelector(".iz-payroll-tabs") as HTMLElement;
		const [a, b] = host.querySelectorAll("button");
		a.click();
		vi.advanceTimersByTime(PICK_MS - 100);
		b.click();
		vi.advanceTimersByTime(PICK_MS - 1);
		expect(strip.hasAttribute(PICK_ATTR)).toBe(true);
		vi.advanceTimersByTime(1);
		expect(strip.hasAttribute(PICK_ATTR)).toBe(false);
	});

	it("focus alone never marks (returning to the window is not a pick)", () => {
		const host = mount(
			'<div class="iz-payroll-tabs"><button class="on">A</button></div>',
		);
		const strip = host.querySelector(".iz-payroll-tabs") as HTMLElement;
		(host.querySelector("button") as HTMLButtonElement).focus();
		window.dispatchEvent(new Event("focus"));
		expect(strip.hasAttribute(PICK_ATTR)).toBe(false);
	});

	it("cleanup removes the listener and any pending mark", () => {
		const host = mount('<div class="iz-payroll-tabs"><button>A</button></div>');
		const strip = host.querySelector(".iz-payroll-tabs") as HTMLElement;
		host.querySelector("button")?.click();
		stop();
		expect(strip.hasAttribute(PICK_ATTR)).toBe(false);
		host.querySelector("button")?.click();
		expect(strip.hasAttribute(PICK_ATTR)).toBe(false);
		stop = () => {};
	});
});
