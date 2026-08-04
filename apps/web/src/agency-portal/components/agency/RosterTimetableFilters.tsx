import { IzSelect, IzTimeInput } from "@agency-portal/components/iz/ui";
import { OUTLET_NAMES } from "@agency-portal/lib/agency-demo";
import type { RosterTimetableFilterState } from "@agency-portal/lib/roster-shift-filters";
import { rosterTimetableFiltersActive } from "@agency-portal/lib/roster-shift-filters";
import { RotateCcw, Search } from "lucide-react";

export function RosterTimetableFilters({
	filters,
	onChange,
	prCount,
	totalPrs,
	shiftCount,
	totalShifts,
}: {
	filters: RosterTimetableFilterState;
	onChange: (patch: Partial<RosterTimetableFilterState>) => void;
	prCount: number;
	totalPrs: number;
	shiftCount: number;
	totalShifts: number;
}) {
	const active = rosterTimetableFiltersActive(filters);

	return (
		<div className="iz-roster-shift-filters iz-roster-timetable-filters iz-roster-timetable-filters--compact">
			<div className="iz-roster-shift-filters-head">
				<span className="iz-roster-timetable-filters-title">Filters</span>
				<span className="iz-roster-timetable-filters-stats">
					{prCount} PR{prCount === 1 ? "" : "s"} · {shiftCount} shift
					{shiftCount === 1 ? "" : "s"}
					{active ? ` (of ${totalPrs} · ${totalShifts})` : ""}
				</span>
			</div>

			<div className="iz-roster-timetable-filters-primary">
				<label className="iz-roster-filter-field iz-roster-filter-field--search">
					<span className="iz-roster-filter-label">Name</span>
					<span className="iz-roster-filter-input-wrap">
						<Search className="h-3.5 w-3.5 shrink-0 text-[var(--iz-muted2)]" />
						<input
							type="search"
							className="iz-roster-filter-input"
							placeholder="Search"
							value={filters.nameQuery}
							onChange={(e) => onChange({ nameQuery: e.target.value })}
						/>
					</span>
				</label>

				<label className="iz-roster-filter-field">
					<span className="iz-roster-filter-label">PR type</span>
					<IzSelect
						block
						value={filters.prType}
						onChange={(e) =>
							onChange({
								prType: e.target.value as RosterTimetableFilterState["prType"],
							})
						}
					>
						<option value="">All PRs</option>
						<option value="agency">Agency-tied only</option>
					</IzSelect>
				</label>

				<label className="iz-roster-filter-field">
					<span className="iz-roster-filter-label">Show PRs</span>
					<IzSelect
						block
						value={filters.showPrs}
						onChange={(e) =>
							onChange({
								showPrs: e.target
									.value as RosterTimetableFilterState["showPrs"],
							})
						}
					>
						<option value="">Everyone</option>
						<option value="scheduled">With shifts</option>
						<option value="free">Free some days</option>
					</IzSelect>
				</label>

				<label className="iz-roster-filter-field">
					<span className="iz-roster-filter-label">Outlet</span>
					<IzSelect
						block
						value={filters.outlet}
						onChange={(e) => onChange({ outlet: e.target.value })}
					>
						<option value="">All outlets</option>
						{OUTLET_NAMES.map((o) => (
							<option key={o} value={o}>
								{o}
							</option>
						))}
					</IzSelect>
				</label>

				<label className="iz-roster-filter-field">
					<span className="iz-roster-filter-label">Shift status</span>
					<IzSelect
						block
						value={filters.status}
						onChange={(e) =>
							onChange({
								status: e.target.value as RosterTimetableFilterState["status"],
							})
						}
					>
						<option value="">Any status</option>
						<option value="scheduled">Scheduled</option>
						<option value="assignment-pending">Awaiting PR</option>
						<option value="outlet-request-pending">Outlet request</option>
						<option value="on-duty">On duty</option>
						<option value="swap-pending">Swap pending</option>
						<option value="unavailable">Unavailable</option>
					</IzSelect>
				</label>
			</div>

			<div className="iz-roster-timetable-filters-secondary">
				<label className="iz-roster-filter-field">
					<span className="iz-roster-filter-label">Start from</span>
					<IzTimeInput
						value={filters.startTime}
						onChange={(v) => onChange({ startTime: v })}
						showIcon={false}
						placeholder="Start Time"
						className="iz-roster-filter-time"
						aria-label="Shift start from"
					/>
				</label>

				<label className="iz-roster-filter-field">
					<span className="iz-roster-filter-label">End by</span>
					<IzTimeInput
						value={filters.endTime}
						onChange={(v) => onChange({ endTime: v })}
						showIcon={false}
						placeholder="End Time"
						className="iz-roster-filter-time"
						aria-label="Shift end by"
					/>
				</label>
			</div>

			{active && (
				<button
					type="button"
					className="iz-roster-filter-clear"
					onClick={() => onChange({ ...EMPTY_TIMETABLE_CLEAR })}
				>
					<RotateCcw className="h-3 w-3" />
					Clear filters
				</button>
			)}
		</div>
	);
}

const EMPTY_TIMETABLE_CLEAR: RosterTimetableFilterState = {
	nameQuery: "",
	outlet: "",
	status: "",
	payoutMin: "",
	payoutMax: "",
	startTime: "",
	endTime: "",
	prType: "",
	showPrs: "",
};
