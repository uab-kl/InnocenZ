import { AgencyOutletDetailView } from "@agency-portal/components/agency/AgencyOutletDetailView";
import { AgencyOutletFilters } from "@agency-portal/components/agency/AgencyOutletFilters";
import { ManageOutletGridCard } from "@agency-portal/components/agency/ManageOutletGridCard";
import { IzCard, IzPageTitle } from "@agency-portal/components/iz/ui";
import { useAgencyOutletDemand } from "@agency-portal/hooks/use-agency-outlet-demand";
import { rosterSlotsForAgency } from "@agency-portal/lib/agency-demo";
import {
	buildAgencyOutletSummaries,
	buildOutletDayDemandSummaries,
	collectOutletShiftDateIsos,
	EMPTY_AGENCY_OUTLET_FILTERS,
	filterAgencyOutletSummaries,
} from "@agency-portal/lib/agency-outlet-shifts";
import { agencyCan } from "@agency-portal/lib/agency-rbac";
import { PR_AGENCY_TIED_OFFERS } from "@agency-portal/lib/pr-features";
import { DEFAULT_ROSTER_DATE_ISO } from "@agency-portal/lib/roster-availability";
import { useStore } from "@agency-portal/lib/store";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MousePointerClick, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/agency/outlets")({
	component: AgencyManageOutlets,
	validateSearch: (search: Record<string, unknown>) => ({
		outlet:
			typeof search.outlet === "string" && search.outlet.trim()
				? search.outlet.trim()
				: undefined,
	}),
});

function AgencyManageOutlets() {
	const { outlet: outletFromSearch } = Route.useSearch();
	const shifts = useStore((s) => s.shifts);
	const activeAgencyId = useStore((s) => s.activeAgencyId);
	const allAgencyRoster = useStore((s) => s.agencyRoster);
	const allAgencyPRs = useStore((s) => s.agencyPRs);
	// Tenant scoping — outlet demand/sales summaries reflect only this agency's PRs.
	const agencyRoster = useMemo(
		() => rosterSlotsForAgency(allAgencyRoster, allAgencyPRs, activeAgencyId),
		[allAgencyRoster, allAgencyPRs, activeAgencyId],
	);
	const outletCommissionRules = useStore((s) => s.outletCommissionRules);
	const outletWorkspace = useStore((s) => s.outletWorkspace);
	const agencySubRole = useStore((s) => s.agencySubRole);
	const [filters, setFilters] = useState(EMPTY_AGENCY_OUTLET_FILTERS);
	const [detailOutlet, setDetailOutlet] = useState<string | null>(
		outletFromSearch ?? null,
	);
	const [selectMode, setSelectMode] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	useEffect(() => {
		if (outletFromSearch) setDetailOutlet(outletFromSearch);
	}, [outletFromSearch]);

	const canManage = agencyCan(agencySubRole, "managePr");

	// Real session → backend shift-demand summaries; demo store otherwise.
	// commissionRules / outletWorkspace have no backend source, so the backed
	// path keeps them as demo placeholders (they only feed cosmetic pay tiers).
	const demand = useAgencyOutletDemand();

	const demoSummaries = useMemo(
		() =>
			buildAgencyOutletSummaries({
				shifts,
				roster: agencyRoster,
				tiedOffers: PR_AGENCY_TIED_OFFERS,
				todayIso: DEFAULT_ROSTER_DATE_ISO,
				commissionRules: outletCommissionRules,
				outletWorkspace,
			}),
		[shifts, agencyRoster, outletCommissionRules, outletWorkspace],
	);
	const summaries = demand.backed ? demand.summaries : demoSummaries;

	const shiftDateIsos = useMemo(
		() => collectOutletShiftDateIsos(summaries),
		[summaries],
	);

	const filtered = useMemo(
		() => filterAgencyOutletSummaries(summaries, filters),
		[summaries, filters],
	);

	const detail = summaries.find((s) => s.outlet === detailOutlet) ?? null;
	const detailShifts = useMemo(() => {
		if (!detail) return [];
		return (
			filterAgencyOutletSummaries([detail], filters)[0]?.shifts ?? detail.shifts
		);
	}, [detail, filters]);

	const detailDayDemand = useMemo(() => {
		if (!detail) return [];
		// Rebuild from the same source as the cards: backend shifts + roster (no
		// tied offers) when backed, demo store otherwise.
		return buildOutletDayDemandSummaries({
			outlet: detail.outlet,
			posted: demand.backed ? demand.shifts : shifts,
			roster: demand.backed ? demand.roster : agencyRoster,
			tiedOffers: demand.backed ? [] : PR_AGENCY_TIED_OFFERS,
			todayIso: DEFAULT_ROSTER_DATE_ISO,
		});
	}, [
		detail,
		demand.backed,
		demand.shifts,
		demand.roster,
		shifts,
		agencyRoster,
	]);

	if (!canManage) {
		return (
			<div className="iz-screen">
				<header>
					<IzPageTitle>Access restricted</IzPageTitle>
				</header>
				<IzCard className="text-center">
					<p className="iz-sm iz-muted">Finance role cannot manage outlets.</p>
				</IzCard>
			</div>
		);
	}

	if (detail) {
		return (
			<AgencyOutletDetailView
				summary={detail}
				shifts={detailShifts}
				dayDemand={detailDayDemand}
				onBack={() => setDetailOutlet(null)}
			/>
		);
	}

	const toggleSelect = (outlet: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(outlet)) next.delete(outlet);
			else next.add(outlet);
			return next;
		});
	};

	const selectAllFiltered = () =>
		setSelected(new Set(filtered.map((s) => s.outlet)));

	return (
		<div className="iz-screen iz-outlet-manage-page">
			<header className="iz-pr-manage-header">
				<div className="min-w-0">
					<IzPageTitle>Manage Outlet</IzPageTitle>
					<p className="iz-tiny iz-muted mt-0.5">
						Browse venues · open shifts · assign from roster
					</p>
				</div>
				<div className="iz-pr-manage-header__actions">
					<button
						type="button"
						className={`iz-pr-manage-header__btn${selectMode ? " iz-pr-manage-header__btn--active" : ""}`}
						onClick={() => {
							setSelectMode(!selectMode);
							setSelected(new Set());
						}}
					>
						<MousePointerClick className="h-4 w-4" />
						{selectMode ? "Cancel" : "Select"}
					</button>
				</div>
			</header>

			<IzCard flat className="border-[var(--iz-line2)]">
				<p className="iz-tiny iz-muted2 leading-relaxed">
					Outlets post shifts and request PRs through your agency. Assignments
					stay <b className="text-[var(--iz-amber)]">awaiting PR</b> until the
					PR approves on their portal.
				</p>
			</IzCard>

			<IzCard flat className="iz-outlet-manage-filters-card">
				<AgencyOutletFilters
					inline
					filters={filters}
					onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
					shiftDateIsos={shiftDateIsos}
				/>
			</IzCard>

			<section className="mt-4">
				<div className="iz-pr-manage-stats">
					<span className="iz-pr-manage-stats__count">
						{filtered.length} OUTLET{filtered.length !== 1 ? "S" : ""}
					</span>
				</div>

				{selectMode && (
					<p className="iz-tiny iz-muted2 mb-2">
						{selected.size === 0
							? "Tap outlet cards to multi-select"
							: `${selected.size} selected`}
						{selected.size > 0 && (
							<>
								{" · "}
								<button
									type="button"
									className="iz-link"
									onClick={selectAllFiltered}
								>
									Select all
								</button>
							</>
						)}
					</p>
				)}
				{selectMode && selected.size > 0 && (
					<Link
						to="/agency/roster"
						className="iz-btn iz-btn-primary mb-3 flex w-full items-center justify-center gap-1.5 !py-2.5"
					>
						<Users className="h-3.5 w-3.5" /> Open roster to assign (
						{selected.size})
					</Link>
				)}

				<div className="iz-outlet-manage-grid">
					{filtered.map((summary) => (
						<ManageOutletGridCard
							key={summary.outlet}
							summary={summary}
							selectMode={selectMode}
							picked={selectMode && selected.has(summary.outlet)}
							onActivate={() => {
								if (selectMode) toggleSelect(summary.outlet);
								else setDetailOutlet(summary.outlet);
							}}
						/>
					))}
				</div>
			</section>
		</div>
	);
}
