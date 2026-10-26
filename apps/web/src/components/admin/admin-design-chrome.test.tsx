import {
	act,
	cleanup,
	fireEvent,
	render,
	renderHook,
	screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sectionBadgeTotal, useAdminNavSections } from "./admin-design-chrome";
import { AdminFilters } from "./admin-filters";

const mode = vi.hoisted(() => ({ mobile: true }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => mode.mobile }));
afterEach(() => {
	cleanup();
	localStorage.clear();
	vi.restoreAllMocks();
	mode.mobile = true;
});

describe("Admin navigation and mobile filter presentation", () => {
	it("restores open and closed sections without changing the other portals", () => {
		localStorage.setItem("iz-agency-navigation-sections", '{"workspace":true}');
		const first = renderHook(useAdminNavSections);
		act(() => first.result.current.toggleSection("operation"));
		act(() => first.result.current.toggleSection("service"));
		act(() => first.result.current.toggleSection("service"));
		first.unmount();
		const next = renderHook(useAdminNavSections);
		expect(next.result.current.sections).toEqual({
			operation: true,
			service: false,
		});
		expect(localStorage.getItem("iz-agency-navigation-sections")).toBe(
			'{"workspace":true}',
		);
	});
	it("opens the current page's group on a first visit and over a stored close", () => {
		const fresh = renderHook(() => useAdminNavSections("service"));
		expect(fresh.result.current.sections.service).toBe(true);
		fresh.unmount();
		localStorage.setItem("iz-admin-navigation-sections", '{"service":false}');
		const stored = renderHook(() => useAdminNavSections("service"));
		expect(stored.result.current.sections.service).toBe(true);
		// The admin can still fold it away while staying on the page.
		act(() => stored.result.current.toggleSection("service"));
		expect(stored.result.current.sections.service).toBe(false);
	});
	it("opens the next group when the admin navigates into it", () => {
		const { result, rerender } = renderHook(
			({ active }: { active?: string }) => useAdminNavSections(active),
			{ initialProps: { active: "overview" } },
		);
		expect(result.current.sections).toMatchObject({ overview: true });
		rerender({ active: "service" });
		expect(result.current.sections).toMatchObject({
			overview: true,
			service: true,
		});
	});
	it("sums a closed group's waiting counts for its header", () => {
		expect(sectionBadgeTotal([1, undefined, 0, 2, null, -1])).toBe(3);
		expect(sectionBadgeTotal([])).toBe(0);
	});
	it("keeps navigation usable with unavailable storage", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("Blocked");
		});
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("Blocked");
		});
		const { result } = renderHook(useAdminNavSections);
		act(() => result.current.toggleSection("overview"));
		expect(result.current.sections.overview).toBe(true);
	});
	it("retains entered filters while closed and exposes them on desktop", () => {
		const view = render(
			<AdminFilters title="Filters">
				<input aria-label="Search records" defaultValue="" />
			</AdminFilters>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Filters" }));
		fireEvent.change(screen.getByRole("textbox"), {
			target: { value: "Cedar" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Filters" }));
		expect(screen.queryByRole("textbox")).toBeNull();
		mode.mobile = false;
		view.rerender(
			<AdminFilters title="Filters">
				<input aria-label="Search records" defaultValue="" />
			</AdminFilters>,
		);
		expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
			"Cedar",
		);
		expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();
	});
});
