import { RosterPlanningDatePicker } from "@agency-portal/components/agency/RosterPlanningDatePicker";
import { IzSelect } from "@agency-portal/components/iz/ui";
import {
	type AgencyOutletFilterState,
	agencyOutletFiltersActive,
	EMPTY_AGENCY_OUTLET_FILTERS,
} from "@agency-portal/lib/agency-outlet-shifts";
import { RotateCcw } from "lucide-react";

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
						<option value="">All outlets</option>
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
						placeholder="All dates"
						allowClear
						hint="Dots mark days with open shifts."
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
						<option value="">Any source</option>
						<option value="posted">Posted shift</option>
						<option value="assignment-pending">Awaiting PR</option>
					</IzSelect>
				</label>
				<label className="iz-outlet-manage-filter-chip">
					<input
						type="number"
						min={1}
						placeholder="Min open slots"
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
					<span className="iz-roster-filter-label">Outlet</span>
					<IzSelect
						block
						className="!text-sm"
						value={filters.outlet}
						onChange={(e) => onChange({ outlet: e.target.value })}
					>
						<option value="">All outlets</option>
						{outletNames.map((o) => (
							<option key={o} value={o}>
								{o}
							</option>
						))}
					</IzSelect>
				</label>

				<label className="iz-outlet-manage-filter-field">
					<span className="iz-roster-filter-label">Date</span>
					<RosterPlanningDatePicker
						value={filters.date}
						onChange={(date) => onChange({ date })}
						rosterDates={shiftDateIsos}
						placeholder="All dates"
						allowClear
						hint="Dots mark days with open shifts."
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
						<option value="">Any source</option>
						<option value="posted">Posted shift</option>
						<option value="assignment-pending">Awaiting PR</option>
					</IzSelect>
				</label>

				<label className="iz-outlet-manage-filter-field">
					<span className="iz-roster-filter-label">Min open slots</span>
					<input
						type="number"
						min={1}
						placeholder="e.g. 2"
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
