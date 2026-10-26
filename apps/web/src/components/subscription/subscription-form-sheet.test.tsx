import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubscriptionFormSheet } from "./subscription-form-sheet";

/**
 * Admin → Plan → Create Plan: "Plan name is required" must wait for the admin.
 *
 * Seen in the browser on 22 Oct 2026: Plan Name opens focused, so closing the
 * sheet (or moving to Audience) blurred it and the reopened sheet greeted the
 * admin with the error before a single key was typed.
 */

const REQUIRED = "Plan name is required";

function sheet(open: boolean) {
	return (
		<SubscriptionFormSheet
			open={open}
			onOpenChange={() => {}}
			onSubmit={vi.fn()}
			isSubmitting={false}
			error={null}
		/>
	);
}

// jsdom has no ResizeObserver; the sheet's select measures itself with one.
globalThis.ResizeObserver ??= class {
	observe() {}
	unobserve() {}
	disconnect() {}
} as unknown as typeof ResizeObserver;

afterEach(cleanup);

describe("Create Plan — plan name validation", () => {
	it("stays quiet when Plan Name is only focused and left", () => {
		render(sheet(true));
		const name = document.getElementById("sub-name") as HTMLInputElement;
		fireEvent.focus(name);
		fireEvent.blur(name);
		expect(screen.queryByText(REQUIRED)).toBeNull();
	});

	it("comes back clean after the sheet is closed and reopened", () => {
		const { rerender } = render(sheet(true));
		const name = document.getElementById("sub-name") as HTMLInputElement;
		fireEvent.focus(name);
		rerender(sheet(false));
		fireEvent.blur(name);
		rerender(sheet(true));
		expect(screen.queryByText(REQUIRED)).toBeNull();
	});

	it("shows the error once a save is attempted with no name", async () => {
		render(sheet(true));
		const name = document.getElementById("sub-name") as HTMLInputElement;
		fireEvent.submit(name.closest("form") as HTMLFormElement);
		expect(await screen.findByText(REQUIRED)).toBeTruthy();
	});

	it("shows the error when a typed name is cleared again", async () => {
		render(sheet(true));
		const name = document.getElementById("sub-name") as HTMLInputElement;
		fireEvent.change(name, { target: { value: "Gold" } });
		fireEvent.change(name, { target: { value: "" } });
		expect(await screen.findByText(REQUIRED)).toBeTruthy();
	});
});
