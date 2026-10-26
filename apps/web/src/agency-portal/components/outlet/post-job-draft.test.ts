import { describe, expect, it } from "vitest";
import { newDraftShift } from "./post-job-fields";

describe("queued post-job drafts", () => {
	it("preserves the template, dates, rates and selections when a shift becomes a tab", () => {
		const original = newDraftShift({
			templateId: "template-1",
			templateName: "Friday lounge",
			templateCoverImage: "events/friday.jpg",
			event: "Custom title",
			selectedDateIsos: ["2026-11-01"],
			quantity: 2,
			prIds: ["pr-1"],
			langs: ["English"],
		});
		const queued = newDraftShift(original);
		expect(queued.id).not.toBe(original.id);
		expect(queued).toEqual({ ...original, id: queued.id });
		queued.prIds.push("pr-2");
		queued.langs.push("Malay");
		queued.payTierRows[0].prCount = 10;
		expect(original.prIds).toEqual(["pr-1"]);
		expect(original.langs).toEqual(["English"]);
		expect(original.payTierRows[0].prCount).not.toBe(10);
	});
});
