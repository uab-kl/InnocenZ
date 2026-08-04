import {
	effectiveShiftDrinkMenu,
	OUTLET_SERVICE_ENTITLEMENT_SECTION_ID,
} from "@agency-portal/lib/outlet-demo";
import { outletShiftDisplayLiveSales } from "@agency-portal/lib/outlet-financial-sync";
import { useStore } from "@agency-portal/lib/store";
import { cn } from "@agency-portal/lib/utils";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Minus, ScanLine, Wine } from "lucide-react";
import { useState } from "react";

type OutletShiftSalesPanelProps = {
	shiftId: string;
	sealed?: boolean;
	label?: string;
	compact?: boolean;
	collapsible?: boolean;
};

export function OutletShiftSalesPanel({
	shiftId,
	sealed = false,
	label,
	compact = false,
	collapsible = false,
}: OutletShiftSalesPanelProps) {
	const shift = useStore((s) => s.shifts.find((sh) => sh.id === shiftId));
	const workspaceMenu = useStore((s) => s.outletWorkspace.drinkMenu ?? []);
	const drinkMenu = shift
		? effectiveShiftDrinkMenu(shift, workspaceMenu)
		: workspaceMenu;
	const adjustOutletDrinkSale = useStore((s) => s.adjustOutletDrinkSale);
	const toast = useStore((s) => s.toast);
	const [open, setOpen] = useState(!collapsible);

	if (!shift) return null;

	const liveSales = outletShiftDisplayLiveSales(shift);
	const drinkCounts = shift.drinkUnitCounts ?? {};

	if (sealed) {
		return (
			<p
				className={`text-[10px] text-[var(--iz-muted)] ${compact ? "mt-2" : "mt-3"}`}
			>
				Sales locked after seal.
			</p>
		);
	}

	const controls = (
		<>
			<div className="space-y-2">
				<div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--iz-muted)]">
					Drinks
				</div>
				{drinkMenu.length === 0 ? (
					<p className="iz-tiny iz-muted">Add drink prices in Workspace.</p>
				) : (
					<div className="flex flex-wrap gap-1.5">
						{drinkMenu.map((drink) => {
							const qty = drinkCounts[drink.id] ?? 0;
							return (
								<div
									key={drink.id}
									className="flex min-w-0 items-center gap-0.5"
								>
									<button
										type="button"
										onClick={() => adjustOutletDrinkSale(shiftId, drink.id, -1)}
										disabled={qty === 0}
										className="iz-chip flex h-7 w-7 shrink-0 items-center justify-center !p-0 disabled:opacity-40"
										aria-label={`Remove ${drink.name}`}
									>
										<Minus className="h-3 w-3" />
									</button>
									<button
										type="button"
										onClick={() => adjustOutletDrinkSale(shiftId, drink.id, 1)}
										className="iz-btn iz-btn-soft iz-btn-sm min-w-0 flex-1 !py-1.5 text-[10px]"
									>
										<Wine className="h-3 w-3 shrink-0" />
										<span className="truncate">{drink.name}</span>
										<span className="shrink-0 text-[var(--iz-muted)]">
											RM{drink.priceRm}
											{qty > 0 ? ` · ${qty}` : ""}
										</span>
									</button>
								</div>
							);
						})}
					</div>
				)}
			</div>
			<div className="mt-2 flex gap-2">
				<button
					type="button"
					onClick={() => toast("Barcode scan · sale logged", "success")}
					className="iz-chip flex-1 justify-center text-[11px]"
					aria-label="Scan barcode"
				>
					<ScanLine className="h-3.5 w-3.5" /> Scan
				</button>
				<Link
					to="/outlet/workspace"
					hash={OUTLET_SERVICE_ENTITLEMENT_SECTION_ID}
					className="iz-chip flex-1 justify-center text-[11px]"
				>
					Service Entitlement
				</Link>
			</div>
		</>
	);

	if (collapsible) {
		return (
			<div className="mt-2.5 rounded-xl border border-[var(--iz-line)] bg-white/[0.02]">
				<button
					type="button"
					onClick={() => setOpen((v) => !v)}
					className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
				>
					<span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--iz-muted)]">
						{label ?? "Log sales"}
					</span>
					<span className="font-sora ml-auto text-xs font-bold text-[var(--iz-green)]">
						RM {liveSales.toLocaleString()}
					</span>
					<ChevronDown
						className={cn(
							"h-3.5 w-3.5 text-[var(--iz-muted)]",
							open && "rotate-180",
						)}
					/>
				</button>
				{open && (
					<div className="border-t border-[var(--iz-line)] px-2.5 pb-2.5 pt-2">
						{controls}
					</div>
				)}
			</div>
		);
	}

	return (
		<div
			className={
				compact
					? "mt-2.5 rounded-xl border border-[var(--iz-line)] p-2.5"
					: "mt-3 !mb-0"
			}
		>
			<div className="flex items-center gap-2">
				<span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--iz-muted)]">
					{label ?? "Log sales"}
				</span>
				<span className="font-sora ml-auto text-sm font-bold text-[var(--iz-green)]">
					RM {liveSales.toLocaleString()}
				</span>
			</div>
			<div className="mt-2">{controls}</div>
		</div>
	);
}

/** Unit rates live in Workspace — no duplicate block on Home */
export function OutletSaleUnitCosts() {
	return null;
}
