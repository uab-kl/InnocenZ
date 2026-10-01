import { describe, expect, it } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import {
	emptyQueueMessage,
	type MemberQueueFilter,
} from "./PendingMembersPanel";

/**
 * THE DEACTIVATED TAB SAID NOBODY WAS WAITING (29 Sep 2026 audit, live).
 *
 * Every empty filter fell through to the Waiting sentence, so an owner opening
 * Deactivated — or Declined — was told "No one is waiting to join right now",
 * a statement about a different list. Each filter now says its own thing.
 */
const FILTERS: MemberQueueFilter[] = [
	"waiting",
	"declined",
	"deactivated",
	"all",
];

describe("emptyQueueMessage", () => {
	it.each([
		"en",
		"zh",
	] as const)("gives every filter its own sentence (%s)", (locale) => {
		const t = translations[locale];
		const messages = FILTERS.map((filter) => emptyQueueMessage(filter, t));
		expect(new Set(messages).size).toBe(FILTERS.length);
		expect(messages.every((m) => m.trim().length > 0)).toBe(true);
	});

	it("the Deactivated tab no longer talks about people waiting to join", () => {
		const t = translations.en;
		expect(emptyQueueMessage("deactivated", t)).toBe(
			t.portalUi.noDeactivatedMembers,
		);
		expect(emptyQueueMessage("deactivated", t)).not.toBe(
			t.portalUi.noPendingMembers,
		);
		// Waiting keeps the sentence it always had.
		expect(emptyQueueMessage("waiting", t)).toBe(t.portalUi.noPendingMembers);
	});
});
