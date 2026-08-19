import type { ShiftBlockReason } from "@agency-portal/lib/auto-assign";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/**
 * Why a shift cannot take a PR, in words.
 *
 * `shiftBlockedFor` returns DATA and no prose on purpose — it is a pure planning
 * function shared with the auto-assign planner, and wording baked in there is an
 * untranslatable fragment sitting inside a rule. The cost of that choice is that
 * every caller writes its own ternary over the union, and there are four of them
 * across two screens.
 *
 * ⚠️ Which is why this exists rather than a fifth ternary. Adding the
 * `not-assignable` arm made all four wrong at once: each ends in a bare
 * `: blocked ?` branch that assumes anything not `full` is `tier-full`, so a
 * draft shift would have rendered "No undefined seat left". TypeScript catches it
 * at the property access — but only because the arms happen to carry different
 * fields. A fourth arm shaped like `tier-full` would have compiled and shipped
 * the wrong sentence. One function, one place to update.
 */
export function shiftBlockShort(
	reason: ShiftBlockReason,
	t: PortalTranslations,
): string {
	switch (reason.kind) {
		case "not-assignable":
			return reason.status === "draft"
				? t.rosterGrid.notPublishedYet
				: t.rosterGrid.sealedClosed;
		case "full":
			return t.rosterGrid.fullyStaffed;
		case "tier-full":
			return fill(t.rosterGrid.noSeatLeft, {
				bucket: reason.bucket ?? t.rosterGrid.thisTier,
			});
	}
}

/**
 * The same answer with its numbers — for a tooltip, or the line under a dead
 * submit button, where the agency needs something to act on rather than a label.
 *
 * The two forms differ by more than length: "Fully staffed" is answered by
 * finding another shift, "no Tier I seat left" by picking a different tier or
 * asking the outlet to edit the mix, and a draft by asking the venue to publish
 * it. One generic string would collapse three different remedies into one dead
 * end.
 */
export function shiftBlockLong(
	reason: ShiftBlockReason,
	t: PortalTranslations,
): string {
	switch (reason.kind) {
		case "not-assignable":
			return reason.status === "draft"
				? t.rosterGrid.notPublishedYetWhy
				: t.rosterGrid.sealedClosedWhy;
		case "full":
			return fill(t.rosterGrid.fullyStaffedOf, {
				staffed: reason.staffed,
				quantity: reason.quantity,
			});
		case "tier-full":
			return fill(t.rosterGrid.noSeatLeftRequested, {
				bucket: reason.bucket ?? t.rosterGrid.thisTier,
				asked: reason.asked,
			});
	}
}
