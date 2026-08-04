import { formatRM } from "@agency-portal/components/iz/ui";
import type { OutletDrinkPrice } from "@agency-portal/lib/outlet-drink-menu";
import { Minus, Plus, Wine } from "lucide-react";

type DrinkSelfLogMenuProps = {
	outlet: string;
	drinkMenu: OutletDrinkPrice[];
	qtys: Record<string, number>;
	onQtyChange: (drinkId: string, qty: number) => void;
	note: string;
	onNoteChange: (value: string) => void;
	total: number;
	commissionPreview: number | null;
};

export function emptyDrinkQtys(
	menu: OutletDrinkPrice[],
): Record<string, number> {
	return Object.fromEntries(menu.map((d) => [d.id, 0]));
}

export function drinkQtysFromScanItems(
	menu: OutletDrinkPrice[],
	items: { label: string; qty: number; unitPrice: number; category: string }[],
): Record<string, number> {
	const qtys = emptyDrinkQtys(menu);
	for (const item of items.filter((i) => i.category === "drinks")) {
		const match =
			menu.find((d) => d.name === item.label) ??
			menu.find((d) => d.priceRm === item.unitPrice);
		if (match) qtys[match.id] = Math.max(qtys[match.id] ?? 0, item.qty);
	}
	return qtys;
}

export function DrinkSelfLogMenu({
	outlet,
	drinkMenu,
	qtys,
	onQtyChange,
	note,
	onNoteChange,
	total,
	commissionPreview,
}: DrinkSelfLogMenuProps) {
	const selectedCount = drinkMenu.reduce(
		(n, d) => n + (qtys[d.id] > 0 ? 1 : 0),
		0,
	);
	const totalUnits = drinkMenu.reduce((n, d) => n + (qtys[d.id] ?? 0), 0);

	return (
		<div className="iz-self-log-form">
			<div className="iz-self-log-outlet-head">
				<Wine className="h-4 w-4 shrink-0 text-[var(--iz-gold-l)]" />
				<div className="min-w-0">
					<p className="iz-self-log-outlet-head__title">{outlet}</p>
					<p className="iz-self-log-outlet-head__sub">
						{drinkMenu.length} drinks on menu · tap +/− for each item sold
					</p>
				</div>
			</div>

			<div className="iz-self-log-drink-menu">
				{drinkMenu.map((drink) => {
					const qty = qtys[drink.id] ?? 0;
					const lineTotal = drink.priceRm * qty;
					return (
						<div
							key={drink.id}
							className={`iz-self-log-drink-row${qty > 0 ? " iz-self-log-drink-row--active" : ""}`}
						>
							<div className="iz-self-log-drink-row__info">
								<p className="iz-self-log-drink-row__name">{drink.name}</p>
								<p className="iz-self-log-drink-row__price">
									{formatRM(drink.priceRm)} each
								</p>
								{qty > 0 && (
									<p className="iz-self-log-drink-row__line-total">
										{formatRM(drink.priceRm)} × {qty} ={" "}
										<b className="text-[var(--iz-gold-l)]">
											{formatRM(lineTotal)}
										</b>
									</p>
								)}
							</div>
							<div className="iz-self-log-drink-row__qty">
								<button
									type="button"
									className="iz-chip flex h-8 w-8 shrink-0 items-center justify-center !p-0"
									onClick={() => onQtyChange(drink.id, Math.max(0, qty - 1))}
									disabled={qty <= 0}
									aria-label={`Decrease ${drink.name}`}
								>
									<Minus className="h-3.5 w-3.5" />
								</button>
								<span
									className="iz-self-log-drink-row__qty-val"
									aria-live="polite"
								>
									{qty}
								</span>
								<button
									type="button"
									className="iz-chip flex h-8 w-8 shrink-0 items-center justify-center !p-0"
									onClick={() => onQtyChange(drink.id, qty + 1)}
									aria-label={`Increase ${drink.name}`}
								>
									<Plus className="h-3.5 w-3.5" />
								</button>
							</div>
						</div>
					);
				})}
			</div>

			{total > 0 ? (
				<div className="iz-self-log-summary">
					<div className="iz-self-log-summary__row">
						<span className="iz-self-log-summary__label">
							{selectedCount} drink{selectedCount !== 1 ? "s" : ""} ·{" "}
							{totalUnits} unit
							{totalUnits !== 1 ? "s" : ""}
						</span>
						<span className="iz-self-log-summary__total">
							{formatRM(total)}
						</span>
					</div>
					{commissionPreview != null && commissionPreview > 0 && (
						<p className="iz-tiny iz-muted2 mt-1.5">
							Commission preview:{" "}
							<b className="text-[var(--iz-gold-l)]">
								{formatRM(commissionPreview)}
							</b>
						</p>
					)}
				</div>
			) : (
				<p className="iz-tiny iz-muted2 mt-2 text-center">
					Set quantity for at least one drink to submit
				</p>
			)}

			<label className="iz-self-log-form__label mt-3" htmlFor="self-log-note">
				Note for agency (optional)
			</label>
			<textarea
				id="self-log-note"
				className="iz-self-log-form__note"
				rows={2}
				placeholder="Receipt water-damaged / OCR unreadable"
				value={note}
				onChange={(e) => onNoteChange(e.target.value)}
			/>
		</div>
	);
}
