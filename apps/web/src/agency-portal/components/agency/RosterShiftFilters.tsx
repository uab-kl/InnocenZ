import { IzSelect, IzTimeInput } from "@agency-portal/components/iz/ui";
import { OUTLET_NAMES } from "@agency-portal/lib/agency-demo";
import type { RosterShiftFilterState } from "@agency-portal/lib/roster-shift-filters";
import { rosterShiftFiltersActive } from "@agency-portal/lib/roster-shift-filters";
import { RotateCcw, Search } from "lucide-react";

export function RosterShiftFilters({
	filters,
	onChange,
	resultCount,
	totalCount,
}: {
	filters: RosterShiftFilterState;
	onChange: (patch: Partial<RosterShiftFilterState>) => void;
	resultCount: number;
	totalCount: number;
}) {
	const active = rosterShiftFiltersActive(filters);

	return (
		<div className="iz-roster-shift-filters">
			<div className="iz-roster-shift-filters-head">
				<span className="iz-tiny font-semibold uppercase tracking-wider text-[#e8dff7]">
					Filter shifts
				</span>
				<span className="iz-tiny iz-muted">
					{resultCount} of {totalCount}
				</span>
			</div>

			<div className="iz-roster-shift-filters-grid">
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
					<span className="iz-roster-filter-label">Status</span>
					<IzSelect
						block
						value={filters.status}
						onChange={(e) =>
							onChange({
								status: e.target.value as RosterShiftFilterState["status"],
							})
						}
					>
						<option value="">Any status</option>
						<option value="on-duty">On duty</option>
						<option value="scheduled">Scheduled</option>
						<option value="swap-pending">Swap pending</option>
						<option value="assignment-pending">Awaiting PR</option>
						<option value="outlet-request-pending">Outlet request</option>
						<option value="unavailable">Unavailable</option>
						<option value="late">Late flag</option>
						<option value="no-show">No-show flag</option>
					</IzSelect>
				</label>

				<label className="iz-roster-filter-field">
					<span className="iz-roster-filter-label">Start from</span>
					<IzTimeInput
						value={filters.startTime}
						onChange={(v) => onChange({ startTime: v })}
						showIcon={false}
						className="iz-roster-filter-time"
						placeholder="Start Time"
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

				<label className="iz-roster-filter-field">
					<span className="iz-roster-filter-label">Min payout (RM)</span>
					<input
						type="number"
						min={0}
						step={50}
						className="iz-roster-filter-input iz-roster-filter-input--plain"
						placeholder="e.g. 300"
						value={filters.payoutMin}
						onChange={(e) => onChange({ payoutMin: e.target.value })}
					/>
				</label>

				<label className="iz-roster-filter-field">
					<span className="iz-roster-filter-label">Max payout (RM)</span>
					<input
						type="number"
						min={0}
						step={50}
						className="iz-roster-filter-input iz-roster-filter-input--plain"
						placeholder="e.g. 500"
						value={filters.payoutMax}
						onChange={(e) => onChange({ payoutMax: e.target.value })}
					/>
				</label>
			</div>

			{active && (
				<button
					type="button"
					className="iz-roster-filter-clear"
					onClick={() =>
						onChange({
							nameQuery: "",
							outlet: "",
							status: "",
							payoutMin: "",
							payoutMax: "",
							startTime: "",
							endTime: "",
						})
					}
				>
					<RotateCcw className="h-3 w-3" />
					Clear filters
				</button>
			)}
		</div>
	);
}
