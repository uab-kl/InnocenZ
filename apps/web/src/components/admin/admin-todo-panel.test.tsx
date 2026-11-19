import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminTodoCounts } from "@/hooks/use-sidebar-badges";
import { translations } from "@/lib/portal-i18n/translations";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
	...(await importOriginal<typeof import("@tanstack/react-router")>()),
	Link: ({
		to,
		children,
		...props
	}: {
		to: string;
		children: ReactNode;
		className?: string;
	}) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));

vi.mock("@/lib/portal-i18n/context", () => ({
	usePortalLocale: () => ({ t: translations.en, locale: "en" }),
}));

let state: { counts: AdminTodoCounts; loading: boolean };
vi.mock("@/hooks/use-sidebar-badges", () => ({
	useAdminTodoCounts: () => state,
}));

const { AdminTodoPanel } = await import("./admin-todo-panel");

const ZERO: AdminTodoCounts = {
	agencies: 0,
	outlets: 0,
	planRequests: 0,
	planChanges: 0,
	jobs: 0,
};
const t = translations.en;

afterEach(cleanup);

describe("AdminTodoPanel", () => {
	/*
	 * THE RULE THAT MATTERS. A panel saying "All clear" before its counts
	 * arrive tells an admin there is nothing to do when there may be.
	 */
	it("says it is checking — never all clear — while counts load", () => {
		state = { counts: ZERO, loading: true };
		render(<AdminTodoPanel />);
		expect(screen.getByText(t.todo.checking)).toBeTruthy();
		expect(screen.queryByText(t.todo.allClearTitle)).toBeNull();
	});

	it("says all clear only once every count is known and zero", () => {
		state = { counts: ZERO, loading: false };
		render(<AdminTodoPanel />);
		expect(screen.getByText(t.todo.allClearTitle)).toBeTruthy();
	});

	it("draws a row per waiting queue, most urgent first, linking to its page", () => {
		state = {
			counts: { ...ZERO, planRequests: 2, agencies: 1, planChanges: 3 },
			loading: false,
		};
		render(<AdminTodoPanel />);
		const links = screen.getAllByRole("link");
		expect(links.map((a) => a.getAttribute("href"))).toEqual([
			"/admin/user-management/agency",
			"/admin/service/plan-changes",
			"/admin/service/requests",
		]);
		// Only the FIRST row owns the filled button.
		expect(links[0].className).toContain("admin-todo__row--first");
		expect(links[1].className).not.toContain("admin-todo__row--first");
		// The count is on the row, not just implied by its presence.
		expect(links[1].textContent).toContain("3");
	});

	// Rows that HAVE arrived still show, even while another queue is loading.
	it("shows the rows it has while another count is still loading", () => {
		state = { counts: { ...ZERO, outlets: 4 }, loading: true };
		render(<AdminTodoPanel />);
		expect(screen.getByText(t.todo.adminOutletsTitle)).toBeTruthy();
		expect(screen.queryByText(t.todo.allClearTitle)).toBeNull();
	});
});
