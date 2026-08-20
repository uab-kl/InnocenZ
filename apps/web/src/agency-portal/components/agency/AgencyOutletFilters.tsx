import { RosterPlanningDatePicker } from "@agency-portal/components/agency/RosterPlanningDatePicker";
import { IzSelect } from "@agency-portal/components/iz/ui";
import {
	type AgencyOutletFilterState,
	countActiveAgencyOutletFilters,
	EMPTY_AGENCY_OUTLET_FILTERS,
} from "@agency-portal/lib/agency-outlet-shifts";
import { RotateCcw } from "lucide-react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

/**
 * Filter bar for Manage Outlet.
 *
 * There used to be two layouts in here behind an `inline` prop: a labelled grid
 * and a row of bare chips. Only one caller existed and it passed `inline`, so
 * the labelled version was unreachable code and every user got four unlabelled
 * boxes whose meaning lived entirely in their placeholder text — which vanishes
 * the moment you pick a value. Both are gone; this is the same
 * `iz-roster-filterbar` the roster tabs use, so there is one bar to style and
 * one to fix.
 */
export function AgencyOutletFilters({
	filters,
	onChange,
	shiftDateIsos,
	outletNames,
	resultCount,
	totalCount,
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
	/** Venues shown after filtering, and the total before it. */
	resultCount: number;
	totalCount: number;
}) {
	const { t } = usePortalLocale();
	const activeCount = countActiveAgencyOutletFilters(filters);

	return (
		<div className="iz-roster-filterbar">
			<div className="iz-roster-filterbar__head">
				<span className="iz-roster-filterbar__title">
					{t.filters.filterOutlets}
				</span>
				<span className="iz-roster-filterbar__spacer" />
				<span className="iz-roster-filterbar__count">
					{resultCount} {t.roster.countOf} {totalCount}
				</span>
				{activeCount > 0 && (
					<button
						type="button"
						className="iz-roster-filterbar__clear"
						onClick={() => onChange({ ...EMPTY_AGENCY_OUTLET_FILTERS })}
					>
						<RotateCcw className="h-3.5 w-3.5" />
						{t.rosterGrid.clearFilters}
						<span className="iz-roster-filterbar__badge">{activeCount}</span>
					</button>
				)}
			</div>

			<div className="iz-roster-filterbar__row">
				<label className="iz-roster-filterbar__field iz-roster-filterbar__field--grow">
					<span className="iz-roster-filterbar__label">{t.filters.outlet}</span>
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

				<div className="iz-roster-filterbar__field">
					{/*
					 * A <div>, not a <label>: the picker renders a <button>, and a label
					 * wrapping a button forwards the click to nothing.
					 */}
					<span className="iz-roster-filterbar__label">{t.filters.date}</span>
					<RosterPlanningDatePicker
						value={filters.date}
						onChange={(date) => onChange({ date })}
						rosterDates={shiftDateIsos}
						placeholder={t.filters.allDates}
						allowClear
						hint={t.manageOutlet.dotsMarkOpenShifts}
						className="iz-roster-filterbar__date"
					/>
				</div>

				<label className="iz-roster-filterbar__field">
					<span className="iz-roster-filterbar__label">{t.filters.source}</span>
					<IzSelect
						block
						value={filters.source}
						onChange={(e) =>
							onChange({
								source: e.target.value as AgencyOutletFilterState["source"],
							})
						}
					>
						{/*
						 * Two options for three union members. `tied-offer` has no entry
						 * because it is not a distinction a viewer can see — it carries the
						 * same badge as `posted`, and the predicate matches the pair
						 * together, so "Posted shift" keeps every row that reads as one.
						 */}
						<option value="">{t.manageOutlet.anySource}</option>
						<option value="posted">{t.manageOutlet.postedShift}</option>
						<option value="assignment-pending">
							{t.manageOutlet.awaitingPr}
						</option>
					</IzSelect>
				</label>

				<label className="iz-roster-filterbar__field">
					<span className="iz-roster-filterbar__label">
						{t.manageOutlet.minOpenSlots}
					</span>
					<input
						type="number"
						min={1}
						className="iz-roster-filterbar__input iz-roster-filterbar__input--num"
						placeholder={t.manageOutlet.egTwo}
						value={filters.minOpenSlots}
						onChange={(e) => onChange({ minOpenSlots: e.target.value })}
					/>
				</label>
			</div>
		</div>
	);
}
