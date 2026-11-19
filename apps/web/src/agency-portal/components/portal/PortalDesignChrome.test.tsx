import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearAuthTokens, saveAuthTokens } from "@/lib/auth/auth-storage";
import { navSectionsKey } from "@/lib/nav-sections-storage";
import { usePortalNavSections } from "./PortalDesignChrome";

afterEach(() => {
	cleanup();
	localStorage.clear();
	sessionStorage.clear();
	vi.restoreAllMocks();
});

describe("Portal navigation presentation", () => {
	/*
	 * ⚠️ A FRESH SESSION OPENS ONLY THE CURRENT PAGE'S GROUP (owner, 19 Nov
	 * 2026: "in default when the user log in to the agency and the outlet,
	 * their side panel all close it, just opened the today page"). This
	 * reverses 16 Nov's "a first visit opens every group"; the cases below still
	 * test what they always tested (saved choices, independence, remount,
	 * broken storage), now starting from the closed default.
	 */
	it("opens only the group holding the current page on a fresh session", () => {
		const { result } = renderHook(() =>
			usePortalNavSections("agency", "workspace"),
		);
		expect(result.current.sections).toEqual({
			workspace: true,
			management: false,
			organization: false,
		});
	});
	it("opens nothing on its own when no page group is named", () => {
		const { result } = renderHook(usePortalNavSections);
		expect(result.current.sections).toEqual({
			workspace: false,
			management: false,
			organization: false,
		});
	});
	it("honours a saved all-closed choice instead of reopening it", () => {
		localStorage.setItem(
			navSectionsKey("outlet"),
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
			navSectionsKey("outlet"),
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
		// Toggled ON from the closed default, so the two portals hold DIFFERENT
		// values and the assertion below cannot pass by their simply agreeing.
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
		// workspace toggled twice (back to closed), management once (open), so
		// the remount still has to carry one of each — which is the point.
		expect(refreshed.result.current.sections).toEqual({
			workspace: false,
			management: true,
			organization: false,
		});
	});
	it("a sign-in and a sign-out each forget every portal's saved choice", () => {
		const saved = JSON.stringify({
			workspace: true,
			management: true,
			organization: true,
		});
		const portals = ["agency", "outlet", "admin"] as const;
		const plant = () => {
			for (const p of portals) localStorage.setItem(navSectionsKey(p), saved);
		};
		plant();
		saveAuthTokens("access", "refresh", Date.now() + 60_000);
		for (const p of portals)
			expect(localStorage.getItem(navSectionsKey(p))).toBeNull();
		plant();
		clearAuthTokens();
		for (const p of portals)
			expect(localStorage.getItem(navSectionsKey(p))).toBeNull();
		// …so the next session starts from the default again.
		const { result } = renderHook(() =>
			usePortalNavSections("outlet", "workspace"),
		);
		expect(result.current.sections).toEqual({
			workspace: true,
			management: false,
			organization: false,
		});
	});
	it("recovers from malformed saved preferences", () => {
		localStorage.setItem(navSectionsKey("outlet"), "{bad json");
		const { result } = renderHook(usePortalNavSections);
		act(() => result.current.toggleSection("organization"));
		expect(result.current.sections.organization).toBe(true);
	});
	it("still works when storage is unavailable", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("Storage denied");
		});
		const { result } = renderHook(usePortalNavSections);
		act(() => result.current.toggleSection("workspace"));
		expect(result.current.sections.workspace).toBe(true);
	});
});
