import { IzCard } from "@agency-portal/components/iz/ui";
import { WorkspaceTierRatesEditor } from "@agency-portal/components/outlet/WorkspaceTierRatesEditor";
import { useAgencyOutletWorkspace } from "@agency-portal/hooks/use-agency-outlet-workspace";
import { formatTierWageRange } from "@agency-portal/lib/agency-demo";
import { resolveOutletTierRates } from "@agency-portal/lib/outlet-agency-sync";
import { drinkMenuPriceRange } from "@agency-portal/lib/outlet-demo";
import { outletMatches } from "@agency-portal/lib/portal-sync";
import { useStore } from "@agency-portal/lib/store";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

export function AgencyCommissionRulesPanel({
	outlet,
	tableOnly = false,
}: {
	outlet: string;
	tableOnly?: boolean;
}) {
	const { t } = usePortalLocale();
	const outletCommissionRules = useStore((s) => s.outletCommissionRules);
	const demoWorkspace = useStore((s) => s.outletWorkspace);
	// Real agency session → the rates this outlet actually saved from its own
	// Workspace screen (same row, read by id). Demo sessions keep the demo store.
	const backend = useAgencyOutletWorkspace(outlet);
	const workspace = backend.backed ? backend.workspace : demoWorkspace;

	// Only a backed session can land here with nothing (the demo store always has
	// a workspace), and it must never fall back to the demo rate card: those
	// defaults are a fixture outlet's money, and rendering them is exactly what
	// made the agency look out of sync with the outlet.
	if (!workspace) {
		return (
			<p className="iz-tiny iz-muted2">
				{backend.isLoading
					? t.outletDetail.loadingRates
					: t.outletDetail.noWorkspaceRates}
			</p>
		);
	}

	const tierRates = resolveOutletTierRates(
		outlet,
		outletCommissionRules,
		workspace,
	);
	const syncedFromWorkspace = outletMatches(outlet, workspace.outletName);
	const tierHint = fill(t.outletDetail.syncedFromWorkspace, {
		range: formatTierWageRange(tierRates),
	});
	const drinkMenu = workspace.drinkMenu ?? [];
	const drinkRange =
		drinkMenu.length > 0 ? drinkMenuPriceRange(drinkMenu) : null;

	return (
		<>
			{!tableOnly && (
				<p className="iz-tiny iz-muted2 mb-2">
					{syncedFromWorkspace
						? `${tierHint} · read-only`
						: "Outlet tier rates · read-only on agency"}
				</p>
			)}

			<div className={tableOnly ? "iz-outlet-detail-tier-table" : undefined}>
				<IzCard flat className="!py-3">
					<WorkspaceTierRatesEditor
						tierRates={tierRates}
						commissionOnlyRates={workspace.commissionOnlyRates}
						onPatchTier={() => {}}
						onPatchCommissionOnly={() => {}}
						readOnly
						hideTargetSales
					/>
				</IzCard>
			</div>

			{!tableOnly && syncedFromWorkspace && drinkRange && (
				<IzCard flat className="mt-3 !py-3">
					<p className="iz-tiny iz-muted2 mb-1.5">
						Drink prices · synced from outlet
					</p>
					<p className="iz-tiny iz-muted mb-2">
						{drinkMenu.length} drinks · RM {drinkRange.min}–{drinkRange.max}
					</p>
					<div className="flex flex-wrap gap-1.5">
						{drinkMenu.map((drink) => (
							<span
								key={drink.id}
								className="iz-tiny rounded-md bg-white/[0.04] px-2 py-0.5 font-semibold text-[var(--iz-gold-l)]"
							>
								{drink.name} RM{drink.priceRm}
							</span>
						))}
					</div>
				</IzCard>
			)}
		</>
	);
}
