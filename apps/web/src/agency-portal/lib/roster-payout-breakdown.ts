/**
 * THE EST. PAYOUT BREAKDOWN, FROM THE ROWS A REAL ROSTER ALREADY LOADED.
 *
 * The agency Roster's Est. payout column is, on a real session, each booking's
 * server wage: `rosterSlotsFromBackend` puts `shift_assignment.pay_amount` on
 * the slot as `wageRm`, and `estimateRosterSlotPayout` returns it unchanged.
 * The sheet that opens from that figure did not — it rebuilt every row from the
 * DEMO store (`shifts`, receipt scans, the placeholder rate card), which a real
 * login blanks, so it found no shift and answered "No PR floor sales logged
 * tonight yet" beneath a column reading RM 500. A breakdown that cannot add up
 * to the number it breaks down.
 *
 * So a slot carrying `wageRm` is broken down by the SAME figures the column
 * shows, for the same shift — `rosterSlotsForShiftBreakdown`, the grouping the
 * demo sheet already uses. Demo slots carry no `wageRm` and keep the fixture.
 */
import type { AgencyRosterSlot } from "@agency-portal/lib/agency-demo";
import { rosterSlotsForShiftBreakdown } from "@agency-portal/lib/outlet-financial-sync";

export interface RosterWageRow {
	slotId: string;
	prId: string;
	prName: string;
	/** The PR's training tier on this roster, when the record carries one. */
	tier?: string;
	wageRm: number;
}

/** The discriminator `estimateRosterSlotPayout` uses: the server priced it. */
export function slotHasServerWage(slot: Pick<AgencyRosterSlot, "wageRm">) {
	return slot.wageRm !== undefined;
}

export function rosterServerWageRows(
	anchor: AgencyRosterSlot,
	rosterScope: AgencyRosterSlot[],
	prs: { id: string; trainingLevel?: string }[],
): { rows: RosterWageRow[]; totalRm: number } {
	const tierById = new Map(prs.map((p) => [p.id, p.trainingLevel]));
	const rows = rosterSlotsForShiftBreakdown(anchor, rosterScope).map(
		(slot): RosterWageRow => ({
			slotId: slot.id,
			prId: slot.prId,
			prName: slot.prName,
			tier: tierById.get(slot.prId) || undefined,
			// `estPayout` is the same server figure on every backend slot; it is
			// only the fallback for a slot mapped before `wageRm` existed.
			wageRm: slot.wageRm ?? slot.estPayout ?? 0,
		}),
	);
	// In sen, like every other money total on the portal.
	const totalSen = rows.reduce((sum, r) => sum + Math.round(r.wageRm * 100), 0);
	return { rows, totalRm: totalSen / 100 };
}
