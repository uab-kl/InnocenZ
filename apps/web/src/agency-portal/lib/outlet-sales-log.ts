/**
 * LOG SALES, PER PR — what the venue types, checked and shaped for the POST.
 *
 * Owner default (29 Sep 2026): "Log Sales becomes a real write, per PR." The
 * backend has recorded floor sales PER PR all along (`shift_sale`, unique on
 * shift + PR — what Reports, History and the reconciliation banner read); the
 * old panel counted units per DRINK into the demo store, so a real session
 * rendered nothing. Pure and DB-free so every rule below is unit-tested.
 *
 * ⚠️ `POST /shift-sale` UPSERTS the whole row. Every field it is sent REPLACES
 * the stored one, and a unit count or tip figure it is NOT sent is written as
 * 0 (shift-sale.controller `create`). So the input carries back what the
 * operator did not type — the recorded drink units, tips and SERVICES — and
 * only the drink RM changes.
 *
 * SERVICES COUNT, AND EVERY ROW IS EDITABLE (owner, 29 Sep 2026: "Count services
 * too"). The server's total is now drinks + tips + services, so a row holding a
 * receipt's service sales no longer loses them when the venue logs its drinks —
 * the old rule that made such a row read-only is gone. The services are sent
 * back exactly as recorded, like the tips (the server would also keep them if
 * they were left out; sending them says what this write means).
 *
 * A receipt the agency approves later RECOMPUTES the row from the receipts
 * (shift-sale-from-receipts), replacing whatever was typed; the panel says so.
 */
import type { LogShiftSaleInput, ShiftSale } from "@/services/shift-sale";

/**
 * A typo guard, not a business rule: `shift_sale` holds numeric(12,2), and one
 * PR's drink sales on one night above this are a slipped key, not a sale.
 */
export const MAX_LOGGED_SALE_RM = 999_999.99;

export type SaleAmountParse =
	| { ok: true; rm: number }
	| { ok: false; reason: "empty" | "invalid" | "tooLarge" };

/** Plain digits, or digits grouped by commas in threes; at most two decimals. */
const AMOUNT = /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;

/** "1,250.50" → 1250.5. An optional "RM" prefix is tolerated; nothing negative. */
export function parseSaleAmount(raw: string): SaleAmountParse {
	const trimmed = raw.trim().replace(/^rm\s*/i, "");
	if (trimmed === "") return { ok: false, reason: "empty" };
	if (!AMOUNT.test(trimmed)) return { ok: false, reason: "invalid" };
	const rm = Number(trimmed.replace(/,/g, ""));
	if (!Number.isFinite(rm)) return { ok: false, reason: "invalid" };
	if (rm > MAX_LOGGED_SALE_RM) return { ok: false, reason: "tooLarge" };
	return { ok: true, rm: Math.round(rm * 100) / 100 };
}

type RecordedRow = Pick<
	ShiftSale,
	| "shiftId"
	| "prId"
	| "drinkUnits"
	| "drinkSalesRm"
	| "tipUnits"
	| "tipSalesRm"
	| "serviceUnits"
	| "serviceSalesRm"
>;

/** This PR's recorded row on this shift — `shift_sale` holds at most one. */
export function recordedSaleFor<T extends Pick<ShiftSale, "shiftId" | "prId">>(
	rows: T[],
	shiftId: string,
	prId: string,
): T | undefined {
	return rows.find((row) => row.shiftId === shiftId && row.prId === prId);
}

function rmOf(value: string | number | null | undefined): number {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

function unitsOf(value: number | null | undefined): number {
	const n = Number(value);
	return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

type RecordedMoney = Pick<
	ShiftSale,
	"drinkSalesRm" | "tipSalesRm" | "serviceSalesRm"
>;

/** Sen, so a night's buckets add up without a float drifting by a sen. */
const senOf = (value: string | number | null | undefined) =>
	Math.round(rmOf(value) * 100);

/**
 * What this PR's row RECORDS, whole: drinks + tips + services — the rule the
 * server writes its total by. Added up here from the buckets rather than read
 * off `totalSalesRm`, so the figure beside the box can only ever be that sum.
 */
export function recordedSaleTotalRm(
	recorded: RecordedMoney | undefined,
): number {
	if (!recorded) return 0;
	return (
		(senOf(recorded.drinkSalesRm) +
			senOf(recorded.tipSalesRm) +
			senOf(recorded.serviceSalesRm)) /
		100
	);
}

/**
 * The part of that total a save here does NOT change — the tips and services,
 * which travel back exactly as recorded. Zero means the box is the whole row.
 */
export function keptBesideDrinksRm(
	recorded: RecordedMoney | undefined,
): number {
	if (!recorded) return 0;
	return (senOf(recorded.tipSalesRm) + senOf(recorded.serviceSalesRm)) / 100;
}

/** The figure the input opens on: what is recorded, or blank when nothing is. */
export function initialSaleInput(
	recorded: Pick<ShiftSale, "drinkSalesRm"> | undefined,
): string {
	const rm = rmOf(recorded?.drinkSalesRm);
	return rm > 0 ? rm.toFixed(2) : "";
}

/** Is `rm` the drink figure already recorded? Then there is nothing to write. */
export function isUnchangedSale(
	rm: number,
	recorded: Pick<ShiftSale, "drinkSalesRm"> | undefined,
): boolean {
	return (
		Math.round(rm * 100) === Math.round(rmOf(recorded?.drinkSalesRm) * 100)
	);
}

/**
 * The body for `POST /shift-sale`: the typed drink figure, and everything else
 * on the row carried back unchanged — see the note at the top of this file.
 */
export function buildShiftSaleInput(args: {
	shiftId: string;
	/** The assignment's `pr_id` — the PR's user id, which `shift_sale` keys on. */
	prId: string;
	drinkSalesRm: number;
	recorded?: Omit<RecordedRow, "shiftId" | "prId">;
}): LogShiftSaleInput {
	const { recorded } = args;
	return {
		shiftId: args.shiftId,
		prId: args.prId,
		drinkSalesRm: Math.round(args.drinkSalesRm * 100) / 100,
		drinkUnits: unitsOf(recorded?.drinkUnits),
		tipSalesRm: rmOf(recorded?.tipSalesRm),
		tipUnits: unitsOf(recorded?.tipUnits),
		// The recorded services, sent back unchanged. With NO row on screen they
		// are left out, not sent as zero: the server then keeps whatever services
		// the row holds — a receipt approved after this panel last read the rows
		// must not have its services wiped by a figure typed against nothing.
		...(recorded
			? {
					serviceSalesRm: rmOf(recorded.serviceSalesRm),
					serviceUnits: unitsOf(recorded.serviceUnits),
				}
			: {}),
	};
}

/**
 * WHICH Log Sales a shift sheet draws, or none.
 *
 * The sheet (Calendar, and every card that opens one) passed a real session
 * nothing to log against, so Log Sales existed on Today alone. Now:
 *
 *   · "perPr"       — a REAL session: the same per-PR panel as Today
 *                     (`OutletPrSalesLog`), behind the same `logSales` grant
 *                     (`sales:create`, what `POST /shift-sale` checks). The
 *                     panel applies its own live-or-ended and sealed rules, so
 *                     a future night draws nothing and a sealed one says why.
 *   · "demoCounter" — a DEMO session keeps its per-drink counter on a
 *                     confirmed shift, exactly as before.
 *   · "lockedNote"  — the one-line "sales locked" note on a sealed shift, for
 *                     every sheet that does not draw the per-PR panel (it
 *                     carries its own).
 *
 * `hidden` is a host that draws Log Sales itself — Today renders ONE panel for
 * the selected shift below its cards, and must not get a second in the card.
 */
export type ShiftSheetSalesLog = "perPr" | "demoCounter" | "lockedNote" | null;

export function shiftSheetSalesLog(args: {
	/** A real outlet session — `getOutletIdentity() !== null`. */
	backed: boolean;
	hidden: boolean;
	/** `can("logSales")` for the signed-in lane. */
	canLogSales: boolean;
	status: string;
}): ShiftSheetSalesLog {
	const { backed, hidden, canLogSales, status } = args;
	if (!canLogSales) return null;
	if (backed && !hidden) return "perPr";
	if (status === "sealed") return "lockedNote";
	if (!backed && !hidden && status === "confirmed") return "demoCounter";
	return null;
}

/**
 * The server's success sentence, in the reader's words — or as the server wrote
 * it, when it is one this map does not know. Its only sentence today is
 * "Sale logged" (shift-sale.controller `create`).
 */
export function saleLoggedText(
	message: string | null | undefined,
	t: { saleLoggedServer: string },
): string {
	const trimmed = message?.trim() ?? "";
	if (trimmed === "" || trimmed.replace(/\.$/, "") === "Sale logged") {
		return t.saleLoggedServer;
	}
	return trimmed;
}
