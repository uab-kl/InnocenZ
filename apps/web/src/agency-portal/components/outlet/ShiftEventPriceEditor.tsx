import { OutletDrinkMenuEditor } from "@agency-portal/components/outlet/OutletDrinkMenuEditor";
import {
	drinkMenuPriceRange,
	type OutletDrinkCategory,
	type OutletDrinkPrice,
	outletDrinkCategory,
	sortOutletDrinkMenuByPrice,
} from "@agency-portal/lib/outlet-demo";
import type { ReactNode } from "react";

function priceListHint(items: OutletDrinkPrice[], noun: string): string {
	if (items.length === 0) return `Add ${noun}s below`;
	const range = drinkMenuPriceRange(items);
	return `${items.length} ${noun}${items.length === 1 ? "" : "s"} · RM ${range.min}–${range.max}`;
}

function ShiftEventPriceGroup({
	title,
	hint,
	children,
}: {
	title: string;
	hint: string;
	children: ReactNode;
}) {
	return (
		<div className="rounded-2xl border border-[var(--iz-line)] bg-[rgba(255,255,255,0.02)] p-2.5">
			<div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
				<span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--iz-txt)]">
					{title}
				</span>
				<span className="text-[10px] text-[var(--iz-muted)]">{hint}</span>
			</div>
			{children}
		</div>
	);
}

/**
 * Event-only price lists, split into Drinks / Services the same way the
 * Workspace page shows them. Edits stay on this event's own menu — the
 * workspace price list is never written here, so later events keep using it.
 */
export function ShiftEventPriceEditor({
	menu,
	onChange,
}: {
	menu: OutletDrinkPrice[];
	onChange: (next: OutletDrinkPrice[]) => void;
}) {
	const drinkItems = menu.filter((d) => outletDrinkCategory(d) === "drink");
	const serviceItems = menu.filter((d) => outletDrinkCategory(d) === "service");

	// Each editor hands back only its own list — merge with the untouched one.
	const commitSlice = (
		edited: OutletDrinkPrice[],
		keep: OutletDrinkPrice[],
	) => {
		onChange(sortOutletDrinkMenuByPrice([...edited, ...keep]));
	};

	// Flip a single row's category (moves it to the other list).
	const moveItem = (id: string, to: OutletDrinkCategory) => {
		onChange(
			sortOutletDrinkMenuByPrice(
				menu.map((d) => (d.id === id ? { ...d, category: to } : d)),
			),
		);
	};

	return (
		<div className="space-y-2.5">
			<ShiftEventPriceGroup
				title="Drinks Price"
				hint={priceListHint(drinkItems, "drink")}
			>
				<OutletDrinkMenuEditor
					drinks={drinkItems}
					category="drink"
					itemLabel="Drink"
					onChange={(edited) => commitSlice(edited, serviceItems)}
					onMoveItem={(id) => moveItem(id, "service")}
					moveHint="Move to Services"
				/>
			</ShiftEventPriceGroup>

			<ShiftEventPriceGroup
				title="Service Entitlement"
				hint={priceListHint(serviceItems, "service")}
			>
				<OutletDrinkMenuEditor
					drinks={serviceItems}
					category="service"
					itemLabel="Service"
					onChange={(edited) => commitSlice(edited, drinkItems)}
					onMoveItem={(id) => moveItem(id, "drink")}
					moveHint="Move to Drinks"
				/>
			</ShiftEventPriceGroup>
		</div>
	);
}
