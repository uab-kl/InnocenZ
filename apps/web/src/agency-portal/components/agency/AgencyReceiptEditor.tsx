import { IzSelect } from "@agency-portal/components/iz/ui";
import { useAgencyReceiptEdit } from "@agency-portal/hooks/use-agency-receipt-edit";
import { useReceiptCatalogue } from "@agency-portal/hooks/use-receipt-catalogue";
import { Plus } from "lucide-react";
import { useState } from "react";
import type {
	AgencyAddedLineKind,
	PaymentVoucherReceiptStatus,
} from "@/services/payment-voucher";

/**
 * What the editor needs off a LINE.
 *
 * Structural on purpose: the two panels that open this editor hold different
 * line shapes — the cross-voucher feed's `AgencyReceiptLine` and the voucher
 * detail's `PaymentVoucherLine` — and both already carry these four fields.
 * Asking for the intersection is what lets one editor serve both without either
 * panel mapping its rows into a third shape first.
 */
export interface ReceiptEditorLine {
	id: string;
	description: string;
	quantity: number;
	/** numeric(12,2), serialized as a string on both line shapes. */
	amount: string;
	/**
	 * Which bucket this line sits in. Optional because the cross-voucher feed's
	 * raw row does not carry it — absent simply means the editor cannot tell what
	 * kind of receipt this is and falls back to letting the reviewer choose.
	 */
	kind?: "drinks" | "tips" | "wages" | "others";
}

/** What it needs off the receipt itself — again the intersection of both shapes. */
export interface ReceiptEditorReceipt {
	id: string;
	receiptNo: string;
	orderNo: string | null;
	receiptDate: string | null;
	/**
	 * The clock time printed on the paper, as stored — `21:45`.
	 *
	 * Rendered in an `<input type="time">`, which needs HH:MM. A legacy value in
	 * any other shape simply shows blank rather than corrupting: the reviewer
	 * types the right time and the correct format is what gets saved.
	 */
	receiptTime: string | null;
	status: PaymentVoucherReceiptStatus;
}

type Draft = { qty: string; amount: string };

const money2 = (raw: string) => Number(raw || 0).toFixed(2);

/** Quantity is a count of drinks, not a measurement — the server agrees. */
const badQuantity = (raw: string): boolean => {
	const n = Number(raw.trim());
	return raw.trim() === "" || !Number.isInteger(n) || n < 1 || n > 999;
};

/**
 * Blank is NOT zero.
 *
 * `Number("")` is 0, so a cleared field would post a real instruction to pay
 * nothing. The server refuses to coerce for exactly this reason; refusing here
 * too means the reviewer sees why instead of watching a figure vanish.
 */
const badAmount = (raw: string): boolean => {
	const n = Number(raw.trim());
	return raw.trim() === "" || !Number.isFinite(n) || n < 0;
};

/**
 * The agency's correction surface for one receipt — the "Edit" half of Approve.
 *
 * ONE component, opened by both the Receipts feed and the per-voucher Verify
 * card. A second copy would be a second set of rules about what may be changed,
 * and the two would disagree the first time either was touched.
 *
 * Three targeted writes, never a voucher rewrite: PATCH a line id (quantity and
 * commission), POST a new drinks/tips line onto the receipt, PATCH the receipt's
 * own order number and date. Each saves on its own button, because each is a
 * separate request the server can accept or refuse on its own terms — a single
 * "Save all" would leave the reviewer guessing which half of it landed.
 *
 * WHAT AN EDIT COSTS is stated in the editor rather than discovered afterwards:
 * an approved receipt drops back to waiting, and any change to the MONEY makes
 * that day's approval stale, so the day has to be approved again before the
 * voucher can be sent.
 */
export function AgencyReceiptEditor({
	receipt,
	lines,
}: {
	receipt: ReceiptEditorReceipt;
	lines: ReceiptEditorLine[];
}) {
	const { editLine, addLine, editReceipt, resetError, isSaving, error } =
		useAgencyReceiptEdit();

	// Only what the reviewer actually typed. Everything else reads straight off
	// the props, so the fields refresh themselves when the refetch lands rather
	// than holding the figures the row had before the save.
	const [drafts, setDrafts] = useState<Record<string, Draft>>({});
	const [orderNo, setOrderNo] = useState(receipt.orderNo ?? "");
	const [receiptDate, setReceiptDate] = useState(receipt.receiptDate ?? "");
	// Trimmed to HH:MM: the column is a free string (the paper prints what it
	// prints) but the time input refuses anything else, and a value it cannot
	// parse renders as blank — which would read as "no time on this receipt".
	const [receiptTime, setReceiptTime] = useState(
		(receipt.receiptTime ?? "").slice(0, 5),
	);
	const [kind, setKind] = useState<AgencyAddedLineKind>("drinks");
	/**
	 * The add form is CLOSED until asked for.
	 *
	 * Adding a line is the exception, not the step: the OCR usually reads the
	 * paper correctly, and a permanent set of empty fields under the items reads
	 * as work still to do. Owner's rule (4 Aug): *"the add comes out unless the
	 * PR OCR really missed the item — if the items show all, no need that ADD A
	 * MISSING LINE section"*. So it collapses to one link, and the reviewer opens
	 * it only when the paper says something the list does not.
	 */
	const [adding, setAdding] = useState(false);
	const [newItem, setNewItem] = useState("");
	const [newQty, setNewQty] = useState("1");
	const [newAmount, setNewAmount] = useState("");
	/** The server's own words after a write — they say whether to re-approve. */
	const [notice, setNotice] = useState<string | null>(null);
	/** Caught before the request, so a typo is not answered with a 400. */
	const [problem, setProblem] = useState<string | null>(null);

	/**
	 * WHAT THE OUTLET ON THIS RECEIPT ACTUALLY SELLS.
	 *
	 * Fetched only once the add form is OPEN, and by receipt id alone — the server
	 * derives the outlet from the receipt's own shift FK, so neither this form nor
	 * the panel that opened it has to carry an outlet the caller could get wrong.
	 */
	const catalogue = useReceiptCatalogue(receipt.id, adding);

	const draftFor = (line: ReceiptEditorLine): Draft =>
		drafts[line.id] ?? {
			qty: String(line.quantity),
			amount: money2(line.amount),
		};

	const putDraft = (line: ReceiptEditorLine, patch: Partial<Draft>) =>
		setDrafts((all) => ({
			...all,
			[line.id]: { ...draftFor(line), ...patch },
		}));

	/**
	 * Wipe the last outcome so this save is judged on its own answer. The server's
	 * refusals live on three separate mutations and each resets only itself, so a
	 * rejected line correction would otherwise still be sitting in red under a
	 * date change the server had just accepted.
	 */
	const beginSave = () => {
		setProblem(null);
		setNotice(null);
		resetError();
	};

	const clearDraft = (lineId: string) =>
		setDrafts((all) => {
			const next = { ...all };
			delete next[lineId];
			return next;
		});

	const saveLine = async (line: ReceiptEditorLine) => {
		beginSave();
		const draft = draftFor(line);
		if (badQuantity(draft.qty)) {
			setProblem("Quantity has to be a whole number from 1 to 999.");
			return;
		}
		if (badAmount(draft.amount)) {
			setProblem("Commission has to be RM 0.00 or more — leave it filled in.");
			return;
		}
		// Send only what moved: the endpoint takes quantity, amount or both, and a
		// field resent unchanged is a write with no correction behind it.
		const patch: { quantity?: number; amount?: number } = {};
		const nextQty = Number(draft.qty);
		const nextAmount = Number(draft.amount);
		if (nextQty !== line.quantity) patch.quantity = nextQty;
		if (nextAmount.toFixed(2) !== money2(line.amount))
			patch.amount = nextAmount;
		if (patch.quantity === undefined && patch.amount === undefined) {
			setProblem(`Nothing changed on "${line.description}".`);
			return;
		}
		try {
			const result = await editLine({
				receiptId: receipt.id,
				lineId: line.id,
				...patch,
			});
			clearDraft(line.id);
			setNotice(result.message);
		} catch {
			// The hook renders the server's refusal verbatim below.
		}
	};

	const saveReceipt = async () => {
		beginSave();
		const typed = orderNo.trim();
		const patch: {
			orderNo?: string | null;
			receiptDate?: string;
			receiptTime?: string | null;
		} = {};
		// Absent leaves the stored number alone; null clears it. An OCR guess off a
		// blurred photo has to be removable, not only replaceable.
		if (typed !== (receipt.orderNo ?? "")) patch.orderNo = typed || null;
		if (receiptDate && receiptDate !== (receipt.receiptDate ?? "")) {
			patch.receiptDate = receiptDate;
		}
		// Compared against the same 5-char slice the field was seeded with, or a
		// stored "21:45:00" would look changed the moment the editor opened and
		// post a write nobody asked for.
		if (receiptTime !== (receipt.receiptTime ?? "").slice(0, 5)) {
			patch.receiptTime = receiptTime || null;
		}
		if (
			patch.orderNo === undefined &&
			patch.receiptDate === undefined &&
			patch.receiptTime === undefined
		) {
			setProblem("The order number, the date and the time are all unchanged.");
			return;
		}
		try {
			const result = await editReceipt({ receiptId: receipt.id, ...patch });
			setNotice(
				result.movedLines > 0
					? `${result.message} · ${result.movedLines} line${
							result.movedLines === 1 ? "" : "s"
						} moved to ${receiptDate}`
					: result.message,
			);
		} catch {
			// Verbatim below — a clashing order number names the receipt it clashes
			// with, and that name is the whole point of the refusal.
		}
	};

	const addNewLine = async () => {
		beginSave();
		const description = newItem.trim();
		if (!description) {
			// The picker holds the outlet's own names, so this is the only way the
			// field can be empty: nothing was chosen yet.
			setProblem(
				"Pick the item from the outlet's list — a line has to name something that outlet sells.",
			);
			return;
		}
		if (badQuantity(newQty)) {
			setProblem("Quantity has to be a whole number from 1 to 999.");
			return;
		}
		if (badAmount(newAmount)) {
			setProblem("Commission has to be RM 0.00 or more.");
			return;
		}
		try {
			const result = await addLine({
				receiptId: receipt.id,
				kind: addKind,
				description,
				quantity: Number(newQty),
				amount: Number(newAmount),
			});
			setNewItem("");
			setNewQty("1");
			setNewAmount("");
			// Collapse again: the line is now in the list above, and leaving the form
			// open invites a second one nobody meant to add.
			setAdding(false);
			setNotice(result.message);
		} catch {
			// Verbatim below.
		}
	};

	// Enough to total the paper against the screen. The reviewer is holding a
	// receipt, and the one piece of arithmetic they actually do is "does this add
	// up to what is printed" — making them do it in their head is how line-level
	// errors survive a review.
	const linesTotal = lines.reduce((sum, l) => sum + Number(l.amount || 0), 0);
	const dirtyCount = lines.filter((l) => drafts[l.id]).length;

	/**
	 * A receipt is one kind of paper, so a line added to it is that kind too.
	 *
	 * OWNER RULE (4 Aug 2026): *"this is the edit receipt from the tips, so the
	 * add missing line cannot choose drink — unless it is the edit drinks
	 * receipt"*. Offering the choice invited exactly the mis-bucketing the picker
	 * was supposed to prevent: a drinks line added to a tips receipt lands in the
	 * PR's Drinks column while its evidence sits under Tips, and the day totals
	 * then disagree with the paper they came from.
	 *
	 * Derived from the lines rather than stored: the receipt row carries no kind
	 * of its own, and inventing a column for something the lines already say
	 * would be a second source of truth. A receipt whose lines disagree, or which
	 * has no lines yet, leaves the choice open — there is nothing to infer from.
	 */
	const kindsPresent = [
		...new Set(
			lines
				.map((l) => l.kind)
				.filter((k): k is "drinks" | "tips" => k === "drinks" || k === "tips"),
		),
	];
	const lockedKind = kindsPresent.length === 1 ? kindsPresent[0] : null;
	// The value actually posted. Reading `lockedKind` first means the select's
	// leftover state can never be sent once a kind is known.
	const addKind: AgencyAddedLineKind = lockedKind ?? kind;

	/**
	 * The items this receipt's outlet sells IN THIS BUCKET.
	 *
	 * Filtered on the server's own `kind`, never re-derived from `category` here:
	 * the split that decides what the add endpoint accepts lives in one place, and
	 * a second copy of it in the form would offer an item the write then refuses.
	 * A row the server marks `null` belongs to neither bucket and is never offered.
	 */
	const options = catalogue.items.filter((i) => i.kind === addKind);
	/** The chosen row, or null — the select's value IS the catalogue's spelling. */
	const picked = options.find((i) => i.name === newItem) ?? null;
	/**
	 * Why there is nothing to pick — the server's own sentence wherever it has
	 * one, so the form says exactly what the write would have said. Never a
	 * fallback to free text: an outlet with no list means the line cannot be
	 * verified at all, and a field that lets you type something guaranteed to be
	 * refused is worse than one that explains itself.
	 */
	const noOptions =
		catalogue.isLoading || options.length > 0
			? null
			: catalogue.items.length > 0
				? // The outlet publishes a list, just not the section this paper needs.
					`${catalogue.outlet ?? "This outlet"} has no ${
						addKind === "drinks" ? "drinks list" : "Service Entitlement list"
					} configured, so a line cannot be verified — ask the outlet to set it up first.`
				: (catalogue.message ??
					"The outlet's list is not available, so a line cannot be verified.");
	// Nothing is posted until an item off the outlet's list is chosen — and never
	// while the list is still loading, which is when a stale pick could slip out.
	const canAdd =
		picked !== null &&
		!catalogue.isLoading &&
		!badQuantity(newQty) &&
		!badAmount(newAmount);

	/**
	 * ONE grid template for the header and every row, so the Qty and RM columns
	 * line up instead of landing wherever the description pushes them.
	 *
	 * The previous layout was `flex flex-wrap`, which wrapped each row's Save onto
	 * a line of its own — and since `.iz-btn` is `width:100%`, every one rendered
	 * as a full-width slab. A three-item receipt showed three of them, each as
	 * loud as Approve.
	 */
	const ROW =
		"grid grid-cols-[minmax(0,1fr)_3.5rem_6.75rem_5.25rem] items-center gap-2";

	return (
		<div className="mt-2 rounded-xl border border-[var(--iz-line)] bg-[var(--iz-bg2)]/60 p-3">
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<p className="iz-tiny font-bold tracking-wide">
					Correcting {receipt.receiptNo}
				</p>
				<p className="iz-tiny iz-muted2 iz-ledger">
					{lines.length} item{lines.length === 1 ? "" : "s"} · RM{" "}
					{linesTotal.toFixed(2)}
				</p>
			</div>

			{/* The consequence stays one sentence; the full rule is one click away. A
			    paragraph nobody finishes reading protects nobody — but the cost of a
			    save is not something a reviewer should discover afterwards either. */}
			<p className="iz-tiny iz-muted2 mt-1">
				Saving re-opens this receipt, and any change to the money makes that
				day's approval stale.
			</p>
			<details className="iz-tiny iz-muted2 mt-1">
				<summary className="cursor-pointer select-none text-[var(--iz-gold-l,#d9b97a)]">
					What that means
				</summary>
				<span className="mt-1 block">
					An approved receipt drops back to waiting on you. A quantity, a
					commission, a new line or a change of date all move money, so the day
					has to be approved again before the voucher can be sent. Correcting
					only the order number moves no money — only the receipt re-opens.
				</span>
			</details>

			{problem && (
				<p className="iz-tiny mt-2 rounded-lg border border-[var(--iz-line2)] px-2 py-1.5 text-[var(--iz-amber,#d9b97a)]">
					{problem}
				</p>
			)}
			{error && (
				<p className="iz-tiny mt-2 rounded-lg border border-[var(--iz-line2)] px-2 py-1.5 text-[var(--iz-red,#c0554f)]">
					{error}
				</p>
			)}
			{notice && !error && (
				<p className="iz-tiny mt-2 rounded-lg border border-[var(--iz-line2)] px-2 py-1.5 text-[var(--iz-green,#5aa06f)]">
					{notice}
				</p>
			)}

			<div className="mt-3 flex items-center justify-between gap-2">
				<p className="iz-tiny iz-muted2 font-bold uppercase tracking-[0.14em]">
					Items
				</p>
				{dirtyCount > 0 && (
					<p className="iz-tiny text-[var(--iz-amber,#d9b97a)]">
						{dirtyCount} unsaved
					</p>
				)}
			</div>

			{lines.length === 0 ? (
				<p className="iz-tiny iz-muted2 mt-1">
					Nothing is logged against this receipt yet — add the drinks or tips
					the paper shows below.
				</p>
			) : (
				<div className="mt-1.5">
					{/* Column headers instead of a caption underneath explaining that the
					    right-hand figure is commission. A label above the column gets
					    read; a caption below it gets read once the mistake is made. */}
					<div
						className={`${ROW} iz-tiny iz-muted2 border-b border-[var(--iz-line)] pb-1 uppercase tracking-[0.12em]`}
					>
						<span>Item</span>
						<span className="text-center">Qty</span>
						<span className="text-right">Commission</span>
						<span />
					</div>
					{lines.map((line) => {
						const draft = draftFor(line);
						const isDirty = Boolean(drafts[line.id]);
						return (
							<div
								key={line.id}
								className={`${ROW} iz-tiny border-b border-[var(--iz-line)]/60 py-1.5 ${
									isDirty
										? "-ml-3 border-l-2 border-l-[var(--iz-gold,#c99b4e)] pl-[0.625rem]"
										: ""
								}`}
							>
								<span className="truncate" title={line.description}>
									{line.description}
								</span>
								<input
									className="iz-field-input iz-ledger !h-7 !w-full !px-1 !text-center !text-[12px]"
									inputMode="numeric"
									value={draft.qty}
									onChange={(e) => putDraft(line, { qty: e.target.value })}
									aria-label={`Quantity for ${line.description}`}
								/>
								<div className="relative">
									<span className="iz-muted2 pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px]">
										RM
									</span>
									<input
										className="iz-field-input iz-ledger !h-7 !w-full !pl-7 !pr-2 !text-right !text-[12px]"
										inputMode="decimal"
										value={draft.amount}
										onChange={(e) => putDraft(line, { amount: e.target.value })}
										aria-label={`Commission in RM for ${line.description}`}
									/>
								</div>
								{/* The cell holds its width whether or not the row is dirty, so
								    typing never shoves the columns sideways. */}
								<div className="flex items-center justify-end gap-1.5">
									{isDirty && (
										<>
											<button
												type="button"
												className="iz-btn iz-btn-soft iz-btn-sm !h-7 !px-2 !text-[11px]"
												disabled={isSaving}
												onClick={() => void saveLine(line)}
											>
												Save
											</button>
											<button
												type="button"
												className="iz-tiny iz-muted2 underline decoration-dotted underline-offset-2"
												onClick={() => clearDraft(line.id)}
											>
												Undo
											</button>
										</>
									)}
								</div>
							</div>
						);
					})}
					<p className="iz-tiny iz-muted2 mt-1.5">
						Commission is the PR's cut, not the price printed on the paper.
					</p>
				</div>
			)}

			{!adding ? (
				<button
					type="button"
					className="iz-tiny iz-muted2 mt-3 flex items-center gap-1 underline decoration-dotted underline-offset-2"
					onClick={() => setAdding(true)}
				>
					<Plus className="h-3 w-3" /> The paper shows an item this list is
					missing
				</button>
			) : (
				<>
					<div className="mt-4 flex items-center justify-between gap-2">
						<p className="iz-tiny iz-muted2 font-bold uppercase tracking-[0.14em]">
							Add a missing line
						</p>
						<button
							type="button"
							className="iz-tiny iz-muted2 underline decoration-dotted underline-offset-2"
							onClick={() => {
								setAdding(false);
								setNewItem("");
								setNewQty("1");
								setNewAmount("");
							}}
						>
							Cancel
						</button>
					</div>
					<div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-[7rem_minmax(0,1fr)_3.5rem_6.75rem_auto]">
						{lockedKind ? (
							// Shown, not chosen. The reviewer still needs to see which bucket the
							// line will land in — a hidden decision is how the wrong one gets made.
							<span className="iz-tiny iz-muted2 flex h-8 items-center rounded-lg border border-[var(--iz-line2)] px-2 capitalize">
								{lockedKind}
							</span>
						) : (
							<IzSelect
								block
								className="!text-xs"
								value={kind}
								onChange={(e) => {
									setKind(e.target.value as AgencyAddedLineKind);
									// The two buckets are two different sections of the outlet's
									// list, so a pick made under the old one is no longer offered
									// — keeping it would post a name this bucket cannot verify.
									setNewItem("");
								}}
								aria-label="Category"
							>
								<option value="drinks">Drinks</option>
								<option value="tips">Tips</option>
							</IzSelect>
						)}
						{/* PICKED, NOT TYPED (owner, 4 Aug 2026). The outlet's price list is
						    the only record of what was on sale that night, so the reviewer
						    chooses from it — free text let the agency invent an item, and a
						    line with nothing behind it is one the PR cannot dispute. */}
						<IzSelect
							block
							className="!h-8 !text-[12px] disabled:cursor-not-allowed disabled:opacity-40"
							value={newItem}
							onChange={(e) => setNewItem(e.target.value)}
							disabled={catalogue.isLoading || options.length === 0}
							aria-label={`Item from ${catalogue.outlet ?? "the outlet"}'s list`}
						>
							<option value="">
								{catalogue.isLoading
									? "Loading the outlet's list…"
									: options.length === 0
										? "Nothing to pick"
										: "Pick the item off the paper…"}
							</option>
							{options.map((item) => (
								// The outlet's SELLING price beside each name, so the reviewer can
								// match the option against the figure printed on the receipt.
								<option key={item.id} value={item.name}>
									{item.name} · outlet RM {item.priceRm}
								</option>
							))}
						</IzSelect>
						<input
							className="iz-field-input iz-ledger !h-8 !px-1 !text-center !text-[12px]"
							inputMode="numeric"
							value={newQty}
							onChange={(e) => setNewQty(e.target.value)}
							placeholder="Qty"
							aria-label="Quantity"
						/>
						<div className="relative">
							<span className="iz-muted2 pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px]">
								RM
							</span>
							<input
								className="iz-field-input iz-ledger !h-8 !w-full !pl-7 !pr-2 !text-right !text-[12px]"
								inputMode="decimal"
								value={newAmount}
								onChange={(e) => setNewAmount(e.target.value)}
								placeholder="0.00"
								aria-label="Commission in RM"
							/>
						</div>
						<button
							type="button"
							className="iz-btn iz-btn-soft iz-btn-sm !h-8 !px-2.5 !text-[11px]"
							disabled={isSaving || !canAdd}
							onClick={() => void addNewLine()}
						>
							<Plus className="mr-1 h-3 w-3" /> Add
						</button>
					</div>
					{noOptions ? (
						// Stated where the picker is, not discovered on a refusal: the add is
						// already disabled, and a disabled control with no reason beside it
						// reads as the screen being broken.
						<p className="iz-tiny mt-1.5 rounded-lg border border-[var(--iz-line2)] px-2 py-1.5 text-[var(--iz-amber,#d9b97a)]">
							{noOptions}
						</p>
					) : (
						// The two RM figures on this row are NOT the same money, and the only
						// place that can be said is next to them.
						<p className="iz-tiny iz-muted2 mt-1.5">
							The RM beside each item is {catalogue.outlet ?? "the outlet"}'s
							selling price, for matching against the paper. The box you fill in
							is the PR's commission — a different figure, and yours to state.
						</p>
					)}
					<p className="iz-tiny iz-muted2 mt-1.5">
						{lockedKind
							? `This is a ${lockedKind} receipt, so a line added here is ${lockedKind} — one paper is one kind.`
							: "Drinks and tips only — wages and overtime come from the check-in and check-out stamps, so those are fixed on the attendance record."}
					</p>
				</>
			)}

			<p className="iz-tiny iz-muted2 mt-4 font-bold uppercase tracking-[0.14em]">
				The receipt itself
			</p>
			{/* Labelled, because a bare date box beside a bare text box is a guess.
			    The browser renders the date in its own locale — 06/16/2026 — so the
			    label is the only thing saying which date this even is. */}
			<div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_auto] sm:items-end">
				<label className="iz-tiny iz-muted2 block">
					Order no on the paper
					<input
						className="iz-field-input mt-1 !h-8 !text-[12px]"
						value={orderNo}
						onChange={(e) => setOrderNo(e.target.value)}
						placeholder="e.g. ORD1111"
					/>
				</label>
				<label className="iz-tiny iz-muted2 block">
					Receipt date
					<input
						type="date"
						className="iz-field-input mt-1 !h-8 !text-[12px]"
						value={receiptDate}
						onChange={(e) => setReceiptDate(e.target.value)}
					/>
				</label>
				{/* OCR reads the clock off a photographed receipt and gets it wrong
				    (owner, 4 Aug). Unlike the date this moves no money — a line's day
				    is its own line_date — so correcting it stales nothing. */}
				<label className="iz-tiny iz-muted2 block">
					Time printed
					<input
						type="time"
						className="iz-field-input mt-1 !h-8 !text-[12px]"
						value={receiptTime}
						onChange={(e) => setReceiptTime(e.target.value)}
					/>
				</label>
				<button
					type="button"
					className="iz-btn iz-btn-soft iz-btn-sm !h-8 !px-2.5 !text-[11px]"
					disabled={isSaving}
					onClick={() => void saveReceipt()}
				>
					Save receipt
				</button>
			</div>
			<p className="iz-tiny iz-muted2 mt-1.5">
				Clearing the order number removes it. Changing the date MOVES this
				receipt's money onto that day — the day it left and the day it lands on
				both need approving again, and the date must fall inside this voucher's
				week.
			</p>
		</div>
	);
}
