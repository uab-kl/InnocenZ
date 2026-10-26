import { describe, expect, it } from "vitest";
import {
	isImplausibleClockedHours,
	MAX_PLAUSIBLE_SHIFT_HOURS,
} from "./shift-clocked-hours";

describe("isImplausibleClockedHours", () => {
	it("flags the 119.13 h Velvet 23 night", () => {
		expect(isImplausibleClockedHours(119.13)).toBe(true);
	});

	it("flags anything over 16 h — the 23.61 h JK House night too", () => {
		expect(isImplausibleClockedHours(23.61)).toBe(true);
		expect(isImplausibleClockedHours(16.01)).toBe(true);
	});

	it("keeps exactly 16 h as a shift — the server's own line is inclusive", () => {
		expect(MAX_PLAUSIBLE_SHIFT_HOURS).toBe(16);
		expect(isImplausibleClockedHours(16)).toBe(false);
	});

	it("leaves ordinary nights and an un-clocked row alone", () => {
		expect(isImplausibleClockedHours(6)).toBe(false);
		expect(isImplausibleClockedHours(0)).toBe(false);
		expect(isImplausibleClockedHours(Number.NaN)).toBe(false);
	});
});
