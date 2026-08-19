import { IzCard } from "@agency-portal/components/iz/ui";
import { OutletDrinkMenuEditor } from "@agency-portal/components/outlet/OutletDrinkMenuEditor";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import {
	OutletPage,
	OutletPageHeader,
} from "@agency-portal/components/outlet/outlet-portal-ui";
import { WorkspaceTierRatesEditor } from "@agency-portal/components/outlet/WorkspaceTierRatesEditor";
import { useOutletWorkspace } from "@agency-portal/hooks/use-outlet-workspace";
import {
	buildDefaultTierRates,
	defaultHappyHourDrinkPct,
	OUTLET_BASE_TIER,
	OUTLET_PR_TIERS,
	type OutletPrTier,
	type OutletTierRateSettings,
	snapTierWage,
} from "@agency-portal/lib/agency-demo";
import {
	drinkMenuPriceRange,
	OUTLET_DRINKS_PRICE_SECTION_ID,
	OUTLET_PRICES_SECTION_ID,
	OUTLET_SERVICE_ENTITLEMENT_SECTION_ID,
	type OutletDrinkPrice,
	outletDrinkCategory,
	sortOutletDrinkMenuByPrice,
	withOutletMenuNamesResolved,
} from "@agency-portal/lib/outlet-demo";
import { useStore } from "@agency-portal/lib/store";
import { useOutletCan } from "@agency-portal/lib/use-portal-can";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

export const Route = createFileRoute("/outlet/workspace")({
	component: OutletWorkspacePage,
});

function TimeField({
	label,
	value,
	onChange,
	readOnly,
}: {
	label: string;
	value: string;
	onChange?: (v: string) => void;
	readOnly?: boolean;
}) {
	return (
		<div className="min-w-0 flex-1">
			<div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--iz-muted)]">
				{label}
			</div>
			<input
				type="text"
				value={value}
				readOnly={readOnly}
				onChange={(e) => onChange?.(e.target.value)}
				className="w-full rounded-xl border border-[var(--iz-line2)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-sm font-semibold outline-none"
			/>
		</div>
	);
}

function NumField({
	label,
	value,
	onChange,
	suffix,
	readOnly,
}: {
	label: string;
	value: number | string;
	onChange?: (n: number) => void;
	suffix?: string;
	readOnly?: boolean;
}) {
	const [text, setText] = useState(String(value));

	useEffect(() => {
		setText(String(value));
	}, [value]);

	const commit = () => {
		if (!onChange) return;
		const n = parseFloat(text.replace(/,/g, ""));
		if (!Number.isNaN(n)) onChange(n);
	};
	return (
		<div className="min-w-0 flex-1">
			<div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--iz-muted)]">
				{label}
			</div>
			<div className="flex items-center gap-1.5 rounded-xl border border-[var(--iz-line2)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5">
				{suffix === "RM" && (
					<span className="text-[11px] font-semibold text-[var(--iz-muted)]">
						RM
					</span>
				)}
				<input
					type="text"
					inputMode="decimal"
					value={text}
					readOnly={readOnly}
					onChange={(e) =>
						!readOnly && setText(e.target.value.replace(/[^\d.:]/g, ""))
					}
					onBlur={commit}
					className="min-w-0 flex-1 bg-transparent text-sm font-semibold tabular-nums outline-none"
				/>
				{suffix && suffix !== "RM" && (
					<span className="text-[11px] text-[var(--iz-muted)]">{suffix}</span>
				)}
			</div>
		</div>
	);
}

function OutletWorkspacePage() {
	const { t } = usePortalLocale();
	const outletWorkspace = useStore((s) => s.outletWorkspace);
	const saveOutletWorkspace = useStore((s) => s.saveOutletWorkspace);
	const toast = useStore((s) => s.toast);
	const canEdit = useOutletCan()("manageWorkspace");
	// Real login → backend workspace (rates persist via PUT); demo store otherwise.
	const backend = useOutletWorkspace();
	const source =
		backend.backed && backend.workspace ? backend.workspace : outletWorkspace;
	const [draft, setDraft] = useState(source);
	const draftDirtyRef = useRef(false);

	useEffect(() => {
		if (!draftDirtyRef.current) {
			setDraft(source);
		}
	}, [source]);

	// Both price lists start collapsed; a deep link opens the ones it names. They
	// are controlled (not defaultOpen) so arriving on #prices can open both.
	const [drinksOpen, setDrinksOpen] = useState(false);
	const [servicesOpen, setServicesOpen] = useState(false);

	useEffect(() => {
		const openLinkedSection = () => {
			const hash = window.location.hash.replace("#", "");
			const wantsDrinks =
				hash === OUTLET_DRINKS_PRICE_SECTION_ID ||
				hash === OUTLET_PRICES_SECTION_ID;
			const wantsServices =
				hash === OUTLET_SERVICE_ENTITLEMENT_SECTION_ID ||
				hash === OUTLET_PRICES_SECTION_ID;
			if (!wantsDrinks && !wantsServices) return;
			if (wantsDrinks) setDrinksOpen(true);
			if (wantsServices) setServicesOpen(true);
			const targetId = wantsDrinks
				? OUTLET_DRINKS_PRICE_SECTION_ID
				: OUTLET_SERVICE_ENTITLEMENT_SECTION_ID;
			// Scroll after the newly expanded body has laid out, or the section
			// lands off-screen at its collapsed height.
			requestAnimationFrame(() => {
				document
					.getElementById(targetId)
					?.scrollIntoView({ behavior: "smooth", block: "start" });
			});
		};
		openLinkedSection();
		window.addEventListener("hashchange", openLinkedSection);
		return () => window.removeEventListener("hashchange", openLinkedSection);
	}, []);

	const markDirty = () => {
		draftDirtyRef.current = true;
	};
	const patch = (p: Partial<typeof draft>) => {
		markDirty();
		setDraft((d) => ({ ...d, ...p }));
	};
	const patchTier = (
		tier: OutletPrTier,
		tierPatch: Partial<OutletTierRateSettings>,
	) => {
		markDirty();
		setDraft((d) => {
			const patch = { ...tierPatch };
			if (patch.wagePerHour != null)
				patch.wagePerHour = snapTierWage(patch.wagePerHour);
			if (patch.drinkPct != null && patch.happyHourDrinkPct == null) {
				const prev = d.tierRates[tier];
				const wasDefaultHappy =
					prev.happyHourDrinkPct == null ||
					prev.happyHourDrinkPct === prev.drinkPct ||
					prev.happyHourDrinkPct === defaultHappyHourDrinkPct(prev.drinkPct);
				if (wasDefaultHappy) {
					patch.happyHourDrinkPct = defaultHappyHourDrinkPct(patch.drinkPct);
				}
			}
			let nextTierRates = {
				...d.tierRates,
				[tier]: { ...d.tierRates[tier], ...patch },
			};
			if (patch.otAfterHours != null) {
				nextTierRates = { ...nextTierRates };
				for (const t of OUTLET_PR_TIERS) {
					nextTierRates[t] = {
						...nextTierRates[t],
						otAfterHours: patch.otAfterHours,
					};
				}
			}
			if (tier === OUTLET_BASE_TIER && patch.wagePerHour != null) {
				const rebuilt = buildDefaultTierRates(nextTierRates[OUTLET_BASE_TIER]);
				nextTierRates = { ...nextTierRates };
				for (const t of OUTLET_PR_TIERS) {
					nextTierRates[t] = {
						...nextTierRates[t],
						wagePerHour: rebuilt[t].wagePerHour,
					};
				}
			}
			const baseTier = nextTierRates[OUTLET_BASE_TIER];
			return {
				...d,
				tierRates: nextTierRates,
				basePayPerHour: baseTier.wagePerHour,
				drinkPct: baseTier.drinkPct,
				tipPct: baseTier.tipPct,
				tablePct: baseTier.tablePct,
				otAfterHours: baseTier.otAfterHours,
			};
		});
	};
	const patchCommissionOnly = (
		patch: Partial<typeof draft.commissionOnlyRates>,
	) => {
		markDirty();
		setDraft((d) => {
			const next = { ...d.commissionOnlyRates, ...patch };
			if (patch.drinkPct != null && patch.happyHourDrinkPct == null) {
				const prev = d.commissionOnlyRates;
				const wasDefaultHappy =
					prev.happyHourDrinkPct == null ||
					prev.happyHourDrinkPct === prev.drinkPct ||
					prev.happyHourDrinkPct === defaultHappyHourDrinkPct(prev.drinkPct);
				if (wasDefaultHappy) {
					next.happyHourDrinkPct = defaultHappyHourDrinkPct(patch.drinkPct);
				}
			}
			return { ...d, commissionOnlyRates: next };
		});
	};
	const fullMenu = draft.drinkMenu ?? [];
	const drinkItems = fullMenu.filter((d) => outletDrinkCategory(d) === "drink");
	const serviceItems = fullMenu.filter(
		(d) => outletDrinkCategory(d) === "service",
	);
	const drinkPriceRange = drinkMenuPriceRange(drinkItems);
	const serviceRange = drinkMenuPriceRange(serviceItems);

	// Merge one category's edited slice back with the untouched other slice.
	const commitMenuSlice = (
		edited: OutletDrinkPrice[],
		keep: OutletDrinkPrice[],
	) => {
		patch({ drinkMenu: sortOutletDrinkMenuByPrice([...edited, ...keep]) });
	};

	// Flip a single item's category (moves it to the other list).
	const moveMenuItem = (id: string, to: "drink" | "service") => {
		patch({
			drinkMenu: sortOutletDrinkMenuByPrice(
				fullMenu.map((d) => (d.id === id ? { ...d, category: to } : d)),
			),
		});
	};

	return (
		<OutletPage>
			<OutletPageHeader
				title={t.nav.workspace}
				iconKey="Workspace"
				hint={fill(t.workspace.ratesForNewShifts, { outlet: draft.outletName })}
			/>
			{!canEdit && (
				<p className="iz-tiny iz-muted rounded-lg border border-dashed border-[var(--iz-line)] px-2.5 py-1.5">
					{t.workspace.readOnlyFinance}
				</p>
			)}

			<OutletSection
				title={t.workspace.ratesByPrTier}
				iconKey="Rates by PR tier"
				className="!mt-4"
				collapsible
				defaultOpen={false}
			>
				<IzCard className="!py-3">
					<WorkspaceTierRatesEditor
						tierRates={draft.tierRates}
						commissionOnlyRates={draft.commissionOnlyRates}
						onPatchTier={patchTier}
						onPatchCommissionOnly={patchCommissionOnly}
						readOnly={!canEdit}
					/>
				</IzCard>
			</OutletSection>

			<OutletSection
				id={OUTLET_DRINKS_PRICE_SECTION_ID}
				title={t.workspace.drinksPrice}
				iconKey="Drinks Price"
				hint={
					drinkItems.length
						? fill(t.workspace.drinksSummary, {
								n: drinkItems.length,
								min: drinkPriceRange.min,
								max: drinkPriceRange.max,
							})
						: t.workspace.addDrinksBelow
				}
				collapsible
				open={drinksOpen}
				onOpenChange={setDrinksOpen}
			>
				<IzCard className="!py-3">
					<OutletDrinkMenuEditor
						drinks={drinkItems}
						category="drink"
						itemLabel={t.workspace.drink}
						readOnly={!canEdit}
						onChange={
							canEdit
								? (edited) => commitMenuSlice(edited, serviceItems)
								: () => {}
						}
						onMoveItem={
							canEdit ? (id) => moveMenuItem(id, "service") : undefined
						}
						moveHint={t.workspace.moveToServices}
					/>
				</IzCard>
			</OutletSection>

			<OutletSection
				id={OUTLET_SERVICE_ENTITLEMENT_SECTION_ID}
				title={t.workspace.serviceEntitlement}
				iconKey="Service Entitlement"
				hint={
					serviceItems.length
						? fill(t.workspace.servicesSummary, {
								n: serviceItems.length,
								min: serviceRange.min,
								max: serviceRange.max,
							})
						: t.workspace.addServicesBelow
				}
				collapsible
				open={servicesOpen}
				onOpenChange={setServicesOpen}
			>
				<IzCard className="!py-3">
					<OutletDrinkMenuEditor
						drinks={serviceItems}
						category="service"
						itemLabel={t.workspace.service}
						readOnly={!canEdit}
						onChange={
							canEdit
								? (edited) => commitMenuSlice(edited, drinkItems)
								: () => {}
						}
						onMoveItem={canEdit ? (id) => moveMenuItem(id, "drink") : undefined}
						moveHint={t.workspace.moveToDrinks}
					/>
				</IzCard>
			</OutletSection>

			<OutletSection
				title={t.workspace.happyHour}
				iconKey="Happy hour"
				hint={fill(t.workspace.happyHourSummary, {
					start: draft.happyHourStart,
					end: draft.happyHourEnd,
					pct: draft.happyHourDrinkDiscountPct,
				})}
				collapsible
				defaultOpen={false}
			>
				<IzCard className="!py-3">
					<div className="flex gap-3">
						<TimeField
							label={t.workspace.start}
							value={draft.happyHourStart}
							readOnly={!canEdit}
							onChange={
								canEdit ? (v) => patch({ happyHourStart: v }) : undefined
							}
						/>
						<TimeField
							label={t.workspace.end}
							value={draft.happyHourEnd}
							readOnly={!canEdit}
							onChange={canEdit ? (v) => patch({ happyHourEnd: v }) : undefined}
						/>
						<NumField
							label={t.workspace.drinkDiscount}
							value={draft.happyHourDrinkDiscountPct}
							suffix="%"
							readOnly={!canEdit}
							onChange={
								canEdit
									? (n) =>
											patch({
												happyHourDrinkDiscountPct: Math.min(
													100,
													Math.max(0, Math.round(n)),
												),
											})
									: undefined
							}
						/>
					</div>
				</IzCard>
			</OutletSection>

			{canEdit && (
				<button
					type="button"
					className="iz-btn iz-btn-primary mt-5"
					onClick={() => {
						// A row the outlet added but never named is still showing its
						// placeholder; bank that name so nothing saves as a blank line.
						const toSave = {
							...draft,
							drinkMenu: withOutletMenuNamesResolved(fullMenu),
						};
						setDraft(toSave);
						if (backend.backed) {
							backend
								.save(toSave)
								.then(() => toast(t.workspace.workspaceSaved, "success"))
								.catch(() => toast(t.workspace.couldNotSaveWorkspace, "warn"));
						} else {
							saveOutletWorkspace(toSave);
						}
						draftDirtyRef.current = false;
					}}
				>
					{t.workspace.saveWorkspace}
				</button>
			)}
		</OutletPage>
	);
}
