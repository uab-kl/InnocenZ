import { AgencyOutletDetailView } from "@agency-portal/components/agency/AgencyOutletDetailView";
import { AgencyOutletFilters } from "@agency-portal/components/agency/AgencyOutletFilters";
import { ManageOutletGridCard } from "@agency-portal/components/agency/ManageOutletGridCard";
import { IzCard, IzPageTitle } from "@agency-portal/components/iz/ui";
import { useAgencyEndedOutlets } from "@agency-portal/hooks/use-agency-ended-outlets";
import { useAgencyOutletDemand } from "@agency-portal/hooks/use-agency-outlet-demand";
import { useAgencyOutletLogos } from "@agency-portal/hooks/use-agency-outlet-logos";
import { rosterSlotsForAgency } from "@agency-portal/lib/agency-demo";
import {
	buildAgencyOutletSummaries,
	buildOutletDayDemandSummaries,
	collectOutletShiftDateIsos,
	EMPTY_AGENCY_OUTLET_FILTERS,
	filterAgencyOutletSummaries,
} from "@agency-portal/lib/agency-outlet-shifts";
import { PR_AGENCY_TIED_OFFERS } from "@agency-portal/lib/pr-features";
import { DEFAULT_ROSTER_DATE_ISO } from "@agency-portal/lib/roster-availability";
import { useStore } from "@agency-portal/lib/store";
import { useAgencyCan } from "@agency-portal/lib/use-portal-can";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MousePointerClick, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

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
	const { t } = usePortalLocale();
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
	const [filters, setFilters] = useState(EMPTY_AGENCY_OUTLET_FILTERS);
	const [detailOutlet, setDetailOutlet] = useState<string | null>(
		outletFromSearch ?? null,
	);
	const [selectMode, setSelectMode] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	useEffect(() => {
		if (outletFromSearch) setDetailOutlet(outletFromSearch);
	}, [outletFromSearch]);

	const canManage = useAgencyCan()("managePr");

	// Real session → backend shift-demand summaries; demo store otherwise.
	// commissionRules / outletWorkspace have no backend source, so the backed
	// path keeps them as demo placeholders (they only feed cosmetic pay tiers).
	const demand = useAgencyOutletDemand();
	/**
	 * The venue marks. A separate lookup because the summaries above are built from
	 * SHIFTS — they identify a venue by name and carry no outlet id, let alone a
	 * logo — while `logo_image` lives on the outlet registry. Keyed by name for
	 * that reason, and it refuses rather than guesses when two venues share one.
	 */
	const outletLogo = useAgencyOutletLogos();
	// Which of these venues are ENDED partnerships still finishing their shifts.
	const outletEnded = useAgencyEndedOutlets();

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

	// The dropdown offers exactly what the grid shows. Derived from `summaries`
	// rather than a constant so a real agency can never be offered a demo venue
	// it does not own — picking one filtered the page down to nothing.
	const outletFilterNames = useMemo(
		() => [...new Set(summaries.map((s) => s.outlet))].sort(),
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
					<IzPageTitle>{t.managePr.accessRestricted}</IzPageTitle>
				</header>
				<IzCard className="text-center">
					<p className="iz-sm iz-muted">
						{t.managePr.financeCannotManageOutlets}
					</p>
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
				logo={outletLogo(detail.outlet)}
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
					<IzPageTitle>{t.managePr.manageOutletTitle}</IzPageTitle>
					<p className="iz-tiny iz-muted mt-0.5">{t.manageOutlet.subtitle}</p>
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
						{selectMode ? t.common.cancel : t.managePr.select}
					</button>
				</div>
			</header>

			<IzCard flat className="border-[var(--iz-line2)]">
				<p className="iz-tiny iz-muted2 leading-relaxed">
					{t.manageOutlet.explainerBefore}{" "}
					<b className="text-[var(--iz-amber)]">
						{t.manageOutlet.explainerAwaiting}
					</b>{" "}
					{t.manageOutlet.explainerAfter}
				</p>
			</IzCard>

			{/* The bar draws its own frame, so it is no longer wrapped in an IzCard
			    that drew a second one around it. */}
			<AgencyOutletFilters
				filters={filters}
				onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
				shiftDateIsos={shiftDateIsos}
				// The venues actually on this page — deduped and sorted where it is
				// defined above. Left to a default the dropdown listed a demo
				// constant instead: venues this agency never onboarded, so picking
				// one emptied the page.
				outletNames={outletFilterNames}
				resultCount={filtered.length}
				totalCount={summaries.length}
			/>

			<section className="mt-4">
				<div className="iz-pr-manage-stats">
					<span className="iz-pr-manage-stats__count">
						{filtered.length} OUTLET{filtered.length !== 1 ? "S" : ""}
					</span>
				</div>

				{selectMode && (
					<p className="iz-tiny iz-muted2 mb-2">
						{/* Both branches translated. The second was left as a hardcoded
						    template while the first was converted, so this one element
						    flipped from Chinese to English the instant a venue was
						    picked — a half-converted ternary is worse than an
						    unconverted one, because it reads as correct until the state
						    changes. `nSelected` already existed for exactly this. */}
						{selected.size === 0
							? t.managePr.tapOutletCardsToMultiSelect
							: fill(t.managePr.nSelected, { n: selected.size })}
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
							logo={outletLogo(summary.outlet)}
							ended={outletEnded(summary.outlet)}
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
