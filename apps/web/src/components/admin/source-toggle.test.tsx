import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";

vi.mock("@/lib/portal-i18n/context", () => ({
	usePortalLocale: () => ({ t: translations.en, locale: "en" }),
}));

const { SourceToggle } = await import("./source-toggle");
const t = translations.en;

afterEach(cleanup);

const pressed = (name: string) =>
	screen.getByRole("button", { name }).getAttribute("aria-pressed");

describe("SourceToggle", () => {
	/*
	 * "user dont know this can click" (owner, 17 Nov 2026): on the default
	 * "all" NOTHING used to be selected, so the control read as a heading.
	 */
	it("shows All as the visible choice on the default", () => {
		render(<SourceToggle value="all" onChange={() => {}} />);
		expect(pressed(t.admin.sourceAll)).toBe("true");
		expect(pressed(t.table.outlet)).toBe("false");
		expect(pressed(t.adminService.agency)).toBe("false");
		expect(
			screen.getByRole("group", { name: t.admin.sourceFilter }),
		).toBeTruthy();
	});

	it("sends the same values it always did", () => {
		const onChange = vi.fn();
		const { rerender } = render(
			<SourceToggle value="all" onChange={onChange} />,
		);
		fireEvent.click(screen.getByRole("button", { name: t.table.outlet }));
		expect(onChange).toHaveBeenLastCalledWith("outlet");

		// Clicking the selected source still clears back to "all".
		rerender(<SourceToggle value="outlet" onChange={onChange} />);
		expect(pressed(t.table.outlet)).toBe("true");
		fireEvent.click(screen.getByRole("button", { name: t.table.outlet }));
		expect(onChange).toHaveBeenLastCalledWith("all");

		// …and so does the new All segment, from any source.
		fireEvent.click(screen.getByRole("button", { name: t.admin.sourceAll }));
		expect(onChange).toHaveBeenLastCalledWith("all");
	});

	it("offers PR only where the page asks for it", () => {
		const { rerender } = render(
			<SourceToggle value="all" onChange={() => {}} />,
		);
		expect(screen.queryByRole("button", { name: t.table.pr })).toBeNull();
		rerender(
			<SourceToggle
				value="pr"
				onChange={() => {}}
				sources={["outlet", "agency", "pr"]}
			/>,
		);
		expect(pressed(t.table.pr)).toBe("true");
	});
});
