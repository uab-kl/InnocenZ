import { describe, expect, it } from "vitest";
import { bellTarget } from "./header";

describe("the bell's count matches the page it opens", () => {
	it("counts Plan Request when requests are waiting there", () => {
		expect(bellTarget(1, 2)).toEqual({
			to: "/admin/service/requests",
			count: 1,
		});
	});

	it("opens Plan Change with its own count when only plan changes wait", () => {
		expect(bellTarget(0, 2)).toEqual({
			to: "/admin/service/plan-changes",
			count: 2,
		});
	});

	it("reads zero on Plan Request when nothing waits", () => {
		expect(bellTarget(0, 0)).toEqual({
			to: "/admin/service/requests",
			count: 0,
		});
	});
});
