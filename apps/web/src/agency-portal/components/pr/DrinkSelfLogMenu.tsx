import { formatRM } from "@agency-portal/components/iz/ui";
import type { OutletDrinkPrice } from "@agency-portal/lib/outlet-drink-menu";
import { Minus, Plus, Wine } from "lucide-react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

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
	const { t } = usePortalLocale();
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
						{fill(t.prMedia.menuHint, { n: drinkMenu.length })}
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
									{fill(t.prMedia.eachPrice, {
										price: formatRM(drink.priceRm),
									})}
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
									aria-label={fill(t.prMedia.decreaseNamed, {
										name: drink.name,
									})}
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
									aria-label={fill(t.prMedia.increaseNamed, {
										name: drink.name,
									})}
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
						{/* Both counts are spelled out per number rather than spliced with
						    an "s" — Chinese has no plural, so a template that appends one
						    cannot be translated at all. */}
						<span className="iz-self-log-summary__label">
							{fill(
								selectedCount === 1
									? t.prMedia.drinkCountOne
									: t.prMedia.drinkCountMany,
								{ n: selectedCount },
							)}
							{" · "}
							{fill(
								totalUnits === 1 ? t.today.unitCountOne : t.today.unitCountMany,
								{ n: totalUnits },
							)}
						</span>
						<span className="iz-self-log-summary__total">
							{formatRM(total)}
						</span>
					</div>
					{commissionPreview != null && commissionPreview > 0 && (
						<p className="iz-tiny iz-muted2 mt-1.5">
							{t.prMedia.commissionPreview}{" "}
							<b className="text-[var(--iz-gold-l)]">
								{formatRM(commissionPreview)}
							</b>
						</p>
					)}
				</div>
			) : (
				<p className="iz-tiny iz-muted2 mt-2 text-center">
					{t.prMedia.pickAtLeastOneDrink}
				</p>
			)}

			<label className="iz-self-log-form__label mt-3" htmlFor="self-log-note">
				{t.prMedia.noteForAgency}
			</label>
			<textarea
				id="self-log-note"
				className="iz-self-log-form__note"
				rows={2}
				placeholder={t.prMedia.notePlaceholder}
				value={note}
				onChange={(e) => onNoteChange(e.target.value)}
			/>
		</div>
	);
}
