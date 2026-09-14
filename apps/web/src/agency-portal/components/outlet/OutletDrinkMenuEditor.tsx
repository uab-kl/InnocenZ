import type {
	OutletDrinkCategory,
	OutletDrinkPrice,
} from "@agency-portal/lib/outlet-demo";
import {
	defaultOutletMenuItemName,
	isOutletTipsRow,
} from "@agency-portal/lib/outlet-demo";
import { ArrowLeftRight, Lock, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

function DrinkPriceInput({
	value,
	onChange,
	readOnly,
}: {
	value: number;
	onChange: (n: number) => void;
	readOnly?: boolean;
}) {
	const [text, setText] = useState(String(value));

	useEffect(() => {
		setText(String(value));
	}, [value]);

	const commitText = (raw: string) => {
		const cleaned = raw.replace(/[^\d.]/g, "");
		if (cleaned === "" || cleaned === ".") {
			setText("0");
			onChange(0);
			return;
		}
		let next = cleaned;
		if (
			text === "0" &&
			next !== "0" &&
			next.startsWith("0") &&
			!next.startsWith("0.")
		) {
			next = next.replace(/^0+/, "") || "0";
		}
		setText(next);
		const n = parseFloat(next);
		if (!Number.isNaN(n)) onChange(n);
	};

	return (
		<input
			type="text"
			inputMode="decimal"
			value={text}
			readOnly={readOnly}
			onChange={(e) => !readOnly && commitText(e.target.value)}
			onFocus={(e) => {
				if (!readOnly && text === "0") e.target.select();
			}}
			className="min-w-0 flex-1 bg-transparent text-sm font-semibold tabular-nums outline-none"
		/>
	);
}

export function OutletDrinkMenuEditor({
	drinks,
	onChange,
	readOnly,
	category = "service",
	itemLabel,
	onMoveItem,
	moveHint,
}: {
	drinks: OutletDrinkPrice[];
	onChange: (next: OutletDrinkPrice[]) => void;
	readOnly?: boolean;
	/** Category new rows are created under. */
	category?: OutletDrinkCategory;
	/** Field label above each row (e.g. "Drink" / "Service"). */
	itemLabel?: string;
	/** When provided, renders a per-row control that moves the item to the
	 *  other list (flips its category). */
	onMoveItem?: (id: string) => void;
	/** Accessible label for the move control (e.g. "Move to Services"). */
	moveHint?: string;
}) {
	const { t } = usePortalLocale();
	// Default resolved here, not in the parameter list: a default parameter is
	// evaluated before hooks run and cannot read `t`.
	const label = itemLabel ?? t.workspace.service;
	const updateDrink = (id: string, patch: Partial<OutletDrinkPrice>) => {
		onChange(drinks.map((d) => (d.id === id ? { ...d, ...patch } : d)));
	};

	const removeDrink = (id: string) => {
		onChange(drinks.filter((d) => d.id !== id));
	};

	const placeholderName = defaultOutletMenuItemName(category);

	// A new row starts EMPTY — the name and price below render as placeholders,
	// so there is nothing to select and delete before typing. Saving fills the
	// name back in (withOutletMenuNamesResolved); the price stays whatever it
	// says, because a seeded RM 100 is a plausible wrong price and RM 0 is an
	// obviously unset one.
	const addDrink = () => {
		onChange([
			...drinks,
			{
				id: `${category}-${Date.now()}`,
				name: "",
				priceRm: 0,
				category,
			},
		]);
	};

	return (
		<div className="space-y-2">
			{drinks.map((drink) => {
				// What this row is CALLED, for the controls that must name it out loud
				// even while the field itself is still showing its placeholder.
				const drinkName = drink.name.trim() || placeholderName;
				/*
				 * The tips row is the venue's to PRICE, never to remove.
				 *
				 * It is seeded at outlet creation because nobody thinks to type it,
				 * and the API puts it back if a save arrives without it — so a Delete
				 * here would look like it worked and be undone on the next load. Its
				 * name is fixed for the same reason: renaming it is deleting it by
				 * another route, and every receipt already says "Tips". The price is
				 * the whole point and stays editable.
				 */
				const locked = isOutletTipsRow(drink);
				return (
					<div key={drink.id} className="flex items-end gap-2">
						<div className="min-w-0 flex-1">
							<div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--iz-muted)]">
								{label}
							</div>
							<input
								type="text"
								value={drink.name}
								placeholder={placeholderName}
								readOnly={readOnly || locked}
								title={locked ? t.workspace.tipsRowLocked : undefined}
								onChange={(e) =>
									updateDrink(drink.id, { name: e.target.value })
								}
								className={`w-full rounded-xl border border-[var(--iz-line2)] px-2.5 py-1.5 text-sm font-semibold outline-none ${
									locked
										? "bg-[rgba(255,255,255,0.01)] text-[var(--iz-muted)]"
										: "bg-[rgba(255,255,255,0.03)]"
								}`}
							/>
						</div>
						<div className="w-24 shrink-0">
							<div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--iz-muted)]">
								{t.workspace.price}
							</div>
							<div className="flex items-center gap-1.5 rounded-xl border border-[var(--iz-line2)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5">
								<span className="text-[11px] font-semibold text-[var(--iz-muted)]">
									RM
								</span>
								<DrinkPriceInput
									value={drink.priceRm}
									readOnly={readOnly}
									onChange={(priceRm) => updateDrink(drink.id, { priceRm })}
								/>
							</div>
						</div>
						{/* Empty slot, not a missing one: dropping the control would slide
						    the locked row's price box out of line with every other row. */}
						{!readOnly && onMoveItem && locked && (
							<div className="h-[38px] w-[38px] shrink-0" aria-hidden="true" />
						)}
						{!readOnly && onMoveItem && !locked && (
							<button
								type="button"
								onClick={() => onMoveItem(drink.id)}
								className="iz-chip flex h-[38px] w-[38px] shrink-0 items-center justify-center !p-0 text-[var(--iz-muted)]"
								aria-label={
									moveHint
										? fill(t.workspace.moveNamedTo, {
												hint: moveHint,
												name: drinkName,
											})
										: fill(t.workspace.moveNamed, { name: drinkName })
								}
								title={moveHint}
							>
								<ArrowLeftRight className="h-3.5 w-3.5" />
							</button>
						)}
						{/*
						 * Every row a venue added is deletable — INCLUDING THE LAST ONE.
						 * This used to be `drinks.length > 1`, which meant a venue that
						 * had pared a list down to one wrong item could not remove it:
						 * they could only rename it, and there was no way to get to the
						 * empty list the section's own "Add drinks below" state describes.
						 * The one row that must survive is Tips, and that is now said
						 * exactly — by name, not by counting what is left.
						 */}
						{!readOnly &&
							(locked ? (
								<button
									type="button"
									disabled
									title={t.workspace.tipsRowLocked}
									aria-label={t.workspace.tipsRowLocked}
									className="iz-chip flex h-[38px] w-[38px] shrink-0 cursor-not-allowed items-center justify-center !p-0 text-[var(--iz-muted)] opacity-60"
								>
									<Lock className="h-3.5 w-3.5" />
								</button>
							) : (
								<button
									type="button"
									onClick={() => removeDrink(drink.id)}
									className="iz-chip flex h-[38px] w-[38px] shrink-0 items-center justify-center !p-0 text-[var(--iz-red)]"
									aria-label={fill(t.workspace.removeNamed, {
										name: drinkName,
									})}
								>
									<Trash2 className="h-3.5 w-3.5" />
								</button>
							))}
					</div>
				);
			})}
			{!readOnly && (
				<button
					type="button"
					onClick={addDrink}
					className="iz-chip w-full justify-center text-[11px]"
				>
					<Plus className="h-3.5 w-3.5" /> {t.workspace.addMore}
				</button>
			)}
		</div>
	);
}
