import { RosterPlanningDatePicker } from "@agency-portal/components/agency/RosterPlanningDatePicker";
import { IzSelect } from "@agency-portal/components/iz/ui";
import {
	type AgencyOutletFilterState,
	agencyOutletFiltersActive,
	EMPTY_AGENCY_OUTLET_FILTERS,
} from "@agency-portal/lib/agency-outlet-shifts";
import { RotateCcw } from "lucide-react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

export function AgencyOutletFilters({
	filters,
	onChange,
	shiftDateIsos,
	outletNames,
	inline = false,
}: {
	filters: AgencyOutletFilterState;
	onChange: (patch: Partial<AgencyOutletFilterState>) => void;
	shiftDateIsos: string[];
	/**
	 * The outlets to offer, from the SAME list that renders the cards.
	 *
	 * This used to be the hardcoded OUTLET_NAMES demo constant, so a real agency
	 * login saw "Velvet 23 / Mermate / Bear Lounge / Urban Soul" in the dropdown
	 * while its actual venues sat in the grid below — picking one filtered
	 * everything away. Sourcing it from the caller keeps the two in step.
	 *
	 * REQUIRED on purpose: an optional prop defaulting to that demo constant is
	 * how the wrong list got here, and it would put demo venues in front of a
	 * real agency again the moment a new caller forgot to pass it.
	 */
	outletNames: string[];
	/** Compact pill row — Manage Outlet page layout */
	inline?: boolean;
}) {
	const { t } = usePortalLocale();
	const active = agencyOutletFiltersActive(filters);

	if (inline) {
		return (
			<div className="iz-outlet-manage-filters iz-outlet-manage-filters--inline">
				<label className="iz-outlet-manage-filter-chip iz-outlet-manage-filter-chip--wide">
					<IzSelect
						block
						value={filters.outlet}
						onChange={(e) => onChange({ outlet: e.target.value })}
					>
						<option value="">{t.filters.allOutlets}</option>
						{outletNames.map((o) => (
							<option key={o} value={o}>
								{o}
							</option>
						))}
					</IzSelect>
				</label>
				<label className="iz-outlet-manage-filter-chip iz-outlet-manage-filter-chip--wide">
					<RosterPlanningDatePicker
						value={filters.date}
						onChange={(date) => onChange({ date })}
						rosterDates={shiftDateIsos}
						placeholder={t.filters.allDates}
						allowClear
						hint={t.manageOutlet.dotsMarkOpenShifts}
						className="iz-outlet-manage-filter-date iz-outlet-manage-filter-date--inline"
					/>
				</label>
				<label className="iz-outlet-manage-filter-chip">
					<IzSelect
						block
						value={filters.source}
						onChange={(e) =>
							onChange({
								source: e.target.value as AgencyOutletFilterState["source"],
							})
						}
					>
						<option value="">{t.manageOutlet.anySource}</option>
						<option value="posted">{t.manageOutlet.postedShift}</option>
						<option value="assignment-pending">
							{t.manageOutlet.awaitingPr}
						</option>
					</IzSelect>
				</label>
				<label className="iz-outlet-manage-filter-chip">
					<input
						type="number"
						min={1}
						placeholder={t.manageOutlet.minOpenSlots}
						className="iz-roster-filter-input iz-roster-filter-input--plain"
						value={filters.minOpenSlots}
						onChange={(e) => onChange({ minOpenSlots: e.target.value })}
					/>
				</label>
				{active && (
					<button
						type="button"
						className="iz-outlet-manage-filter-clear"
						onClick={() => onChange(EMPTY_AGENCY_OUTLET_FILTERS)}
					>
						<RotateCcw className="h-3.5 w-3.5" />
					</button>
				)}
			</div>
		);
	}

	return (
		<div className="iz-outlet-manage-filters">
			<div className="iz-outlet-manage-filters-grid">
				<label className="iz-outlet-manage-filter-field">
					<span className="iz-roster-filter-label">{t.filters.outlet}</span>
					<IzSelect
						block
						className="!text-sm"
						value={filters.outlet}
						onChange={(e) => onChange({ outlet: e.target.value })}
					>
						<option value="">{t.filters.allOutlets}</option>
						{outletNames.map((o) => (
							<option key={o} value={o}>
								{o}
							</option>
						))}
					</IzSelect>
				</label>

				<label className="iz-outlet-manage-filter-field">
					<span className="iz-roster-filter-label">{t.filters.date}</span>
					<RosterPlanningDatePicker
						value={filters.date}
						onChange={(date) => onChange({ date })}
						rosterDates={shiftDateIsos}
						placeholder={t.filters.allDates}
						allowClear
						hint={t.manageOutlet.dotsMarkOpenShifts}
						className="iz-outlet-manage-filter-date"
					/>
				</label>

				<label className="iz-outlet-manage-filter-field">
					<span className="iz-roster-filter-label">Source</span>
					<IzSelect
						block
						className="!text-sm"
						value={filters.source}
						onChange={(e) =>
							onChange({
								source: e.target.value as AgencyOutletFilterState["source"],
							})
						}
					>
						<option value="">{t.manageOutlet.anySource}</option>
						<option value="posted">{t.manageOutlet.postedShift}</option>
						<option value="assignment-pending">
							{t.manageOutlet.awaitingPr}
						</option>
					</IzSelect>
				</label>

				<label className="iz-outlet-manage-filter-field">
					<span className="iz-roster-filter-label">
						{t.manageOutlet.minOpenSlots}
					</span>
					<input
						type="number"
						min={1}
						placeholder={t.manageOutlet.egTwo}
						className="iz-roster-filter-input iz-roster-filter-input--plain"
						value={filters.minOpenSlots}
						onChange={(e) => onChange({ minOpenSlots: e.target.value })}
					/>
				</label>
			</div>

			{active && (
				<button
					type="button"
					className="iz-roster-filter-clear"
					onClick={() => onChange(EMPTY_AGENCY_OUTLET_FILTERS)}
				>
					<RotateCcw className="h-3 w-3" />
					Clear filters
				</button>
			)}
		</div>
	);
}
