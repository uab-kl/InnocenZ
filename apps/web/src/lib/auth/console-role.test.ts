import { describe, expect, it } from "vitest";
import { adminConsoleRoleName } from "./console-role";

/**
 * 28 Sep 2026 follow-up: "`/auth/me` roles still drive a `roles[0]` label".
 * One admin on the test data holds `admin, Finance, Finance`, in no set order.
 */
describe("adminConsoleRoleName", () => {
	it("names the admin role wherever it sits in the list", () => {
		expect(adminConsoleRoleName(["Finance", "admin", "Finance"])).toBe("admin");
		expect(adminConsoleRoleName(["admin", "Finance"])).toBe("admin");
	});

	it("never titles an admin by another lane it happens to hold", () => {
		expect(adminConsoleRoleName(["Finance", "admin"])).not.toBe("Finance");
	});

	it("keeps the old default while the profile has not loaded", () => {
		expect(adminConsoleRoleName(undefined)).toBe("Admin");
		expect(adminConsoleRoleName([])).toBe("Admin");
	});
});
