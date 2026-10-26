import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePortalNavSections } from "./PortalDesignChrome";

afterEach(() => {
	cleanup();
	localStorage.clear();
	vi.restoreAllMocks();
});

describe("Portal navigation presentation", () => {
	it("keeps Agency and Outlet section choices independent", () => {
		const agency = renderHook(() => usePortalNavSections("agency"));
		act(() => agency.result.current.toggleSection("management"));
		const outlet = renderHook(() => usePortalNavSections("outlet"));
		expect(outlet.result.current.sections.management).toBe(false);
		agency.unmount();
		const refreshed = renderHook(() => usePortalNavSections("agency"));
		expect(refreshed.result.current.sections.management).toBe(true);
	});
	it("remembers both open and closed section choices after remount", () => {
		const first = renderHook(usePortalNavSections);
		expect(first.result.current.sections.workspace).toBe(false);
		act(() => first.result.current.toggleSection("workspace"));
		act(() => first.result.current.toggleSection("management"));
		act(() => first.result.current.toggleSection("workspace"));
		first.unmount();
		const refreshed = renderHook(usePortalNavSections);
		expect(refreshed.result.current.sections).toEqual({
			workspace: false,
			management: true,
			organization: false,
		});
	});
	it("recovers from malformed saved preferences", () => {
		localStorage.setItem("iz-outlet-navigation-sections", "{bad json");
		const { result } = renderHook(usePortalNavSections);
		act(() => result.current.toggleSection("organization"));
		expect(result.current.sections.organization).toBe(true);
	});
	it("still opens navigation when storage is unavailable", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("Storage denied");
		});
		const { result } = renderHook(usePortalNavSections);
		act(() => result.current.toggleSection("workspace"));
		expect(result.current.sections.workspace).toBe(true);
	});
});
