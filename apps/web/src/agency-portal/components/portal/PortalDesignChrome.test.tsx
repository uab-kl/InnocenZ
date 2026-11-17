import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePortalNavSections } from "./PortalDesignChrome";

afterEach(() => {
	cleanup();
	localStorage.clear();
	vi.restoreAllMocks();
});

describe("Portal navigation presentation", () => {
	/*
	 * ⚠️ A FIRST VISIT OPENS EVERY GROUP (16 Nov 2026). Groups used to start
	 * closed, so a reader who had never touched the rail met three shut
	 * headings with no way to tell what was behind them — the outlet Today
	 * page was the report. The four tests below used to start from that closed
	 * default while actually testing something else (independence, remount,
	 * broken storage); they now start from the open one and still test exactly
	 * what they tested before.
	 */
	it("opens every group on a first visit, with nothing saved", () => {
		const { result } = renderHook(usePortalNavSections);
		expect(result.current.sections).toEqual({
			workspace: true,
			management: true,
			organization: true,
		});
	});
	it("honours a saved all-closed choice instead of reopening it", () => {
		localStorage.setItem(
			"iz-outlet-navigation-sections",
			JSON.stringify({
				workspace: false,
				management: false,
				organization: false,
			}),
		);
		const { result } = renderHook(usePortalNavSections);
		expect(result.current.sections).toEqual({
			workspace: false,
			management: false,
			organization: false,
		});
	});
	it("opens the group holding the current page, over a saved closed state", () => {
		localStorage.setItem(
			"iz-outlet-navigation-sections",
			JSON.stringify({
				workspace: false,
				management: false,
				organization: false,
			}),
		);
		const { result } = renderHook(() =>
			usePortalNavSections("outlet", "management"),
		);
		expect(result.current.sections.management).toBe(true);
		// The reader's other choices are left exactly as they left them.
		expect(result.current.sections.workspace).toBe(false);
		expect(result.current.sections.organization).toBe(false);
	});
	it("keeps Agency and Outlet section choices independent", () => {
		const agency = renderHook(() => usePortalNavSections("agency"));
		// Toggled OFF from the open default, so the two portals hold DIFFERENT
		// values and the assertion below cannot pass by their simply agreeing.
		act(() => agency.result.current.toggleSection("management"));
		const outlet = renderHook(() => usePortalNavSections("outlet"));
		expect(outlet.result.current.sections.management).toBe(true);
		agency.unmount();
		const refreshed = renderHook(() => usePortalNavSections("agency"));
		expect(refreshed.result.current.sections.management).toBe(false);
	});
	it("remembers both open and closed section choices after remount", () => {
		const first = renderHook(usePortalNavSections);
		expect(first.result.current.sections.workspace).toBe(true);
		act(() => first.result.current.toggleSection("workspace"));
		act(() => first.result.current.toggleSection("management"));
		act(() => first.result.current.toggleSection("workspace"));
		first.unmount();
		const refreshed = renderHook(usePortalNavSections);
		// workspace toggled twice (back to open), management once (closed), so
		// the remount still has to carry one of each — which is the point.
		expect(refreshed.result.current.sections).toEqual({
			workspace: true,
			management: false,
			organization: true,
		});
	});
	it("recovers from malformed saved preferences", () => {
		localStorage.setItem("iz-outlet-navigation-sections", "{bad json");
		const { result } = renderHook(usePortalNavSections);
		act(() => result.current.toggleSection("organization"));
		expect(result.current.sections.organization).toBe(false);
	});
	it("still works when storage is unavailable", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("Storage denied");
		});
		const { result } = renderHook(usePortalNavSections);
		act(() => result.current.toggleSection("workspace"));
		expect(result.current.sections.workspace).toBe(false);
	});
});
