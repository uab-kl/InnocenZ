import { IzSelect, IzTimeInput } from "@agency-portal/components/iz/ui";
import { OUTLET_NAMES } from "@agency-portal/lib/agency-demo";
import type { RosterTimetableFilterState } from "@agency-portal/lib/roster-shift-filters";
import { rosterTimetableFiltersActive } from "@agency-portal/lib/roster-shift-filters";
import { RotateCcw, Search } from "lucide-react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

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
	const { t } = usePortalLocale();
	const active = rosterTimetableFiltersActive(filters);

	return (
		<div className="iz-roster-shift-filters iz-roster-timetable-filters iz-roster-timetable-filters--compact">
			<div className="iz-roster-shift-filters-head">
				<span className="iz-roster-timetable-filters-title">
					{t.filters.filters}
				</span>
				<span className="iz-roster-timetable-filters-stats">
					{/*
					 * Counts go through the dictionary rather than an inline "s" ternary:
					 * that ternary IS the English plural rule, and it left "shift" on a
					 * Chinese screen where no sweep looking for whole words could see it.
					 */}
					{fill(t.rosterGrid.prsAndShifts, {
						prs: fill(
							prCount === 1
								? t.rosterGrid.prCountOne
								: t.rosterGrid.prCountMany,
							{ n: prCount },
						),
						shifts: fill(
							shiftCount === 1
								? t.rosterGrid.shiftCountOne
								: t.rosterGrid.shiftCountMany,
							{ n: shiftCount },
						),
					})}
					{active
						? fill(t.rosterGrid.ofTotals, {
								prs: totalPrs,
								shifts: totalShifts,
							})
						: ""}
				</span>
			</div>

			<div className="iz-roster-timetable-filters-primary">
				<label className="iz-roster-filter-field iz-roster-filter-field--search">
					<span className="iz-roster-filter-label">{t.filters.name}</span>
					<span className="iz-roster-filter-input-wrap">
						<Search className="h-3.5 w-3.5 shrink-0 text-[var(--iz-muted2)]" />
						<input
							type="search"
							className="iz-roster-filter-input"
							placeholder={t.filters.search}
							value={filters.nameQuery}
							onChange={(e) => onChange({ nameQuery: e.target.value })}
						/>
					</span>
				</label>

				<label className="iz-roster-filter-field">
					<span className="iz-roster-filter-label">{t.filters.prType}</span>
					<IzSelect
						block
						value={filters.prType}
						onChange={(e) =>
							onChange({
								prType: e.target.value as RosterTimetableFilterState["prType"],
							})
						}
					>
						<option value="">{t.filters.allPrs}</option>
						<option value="agency">{t.filters.agencyTiedOnly}</option>
					</IzSelect>
				</label>

				<label className="iz-roster-filter-field">
					<span className="iz-roster-filter-label">{t.filters.showPrs}</span>
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
						<option value="">{t.filters.everyone}</option>
						<option value="scheduled">{t.filters.withShifts}</option>
						<option value="free">{t.filters.freeSomeDays}</option>
					</IzSelect>
				</label>

				<label className="iz-roster-filter-field">
					<span className="iz-roster-filter-label">{t.filters.outlet}</span>
					<IzSelect
						block
						value={filters.outlet}
						onChange={(e) => onChange({ outlet: e.target.value })}
					>
						<option value="">{t.filters.allOutlets}</option>
						{OUTLET_NAMES.map((o) => (
							<option key={o} value={o}>
								{o}
							</option>
						))}
					</IzSelect>
				</label>

				<label className="iz-roster-filter-field">
					<span className="iz-roster-filter-label">
						{t.filters.shiftStatus}
					</span>
					<IzSelect
						block
						value={filters.status}
						onChange={(e) =>
							onChange({
								status: e.target.value as RosterTimetableFilterState["status"],
							})
						}
					>
						<option value="">{t.filters.anyStatus}</option>
						<option value="scheduled">{t.roster.scheduled}</option>
						<option value="assignment-pending">
							{t.rosterGrid.awaitingPr}
						</option>
						<option value="outlet-request-pending">
							{t.rosterGrid.outletRequest}
						</option>
						<option value="on-duty">{t.roster.onDuty}</option>
						<option value="swap-pending">{t.rosterGrid.swapPending}</option>
						<option value="unavailable">{t.roster.unavailable}</option>
					</IzSelect>
				</label>
			</div>

			<div className="iz-roster-timetable-filters-secondary">
				<label className="iz-roster-filter-field">
					<span className="iz-roster-filter-label">{t.filters.startFrom}</span>
					<IzTimeInput
						value={filters.startTime}
						onChange={(v) => onChange({ startTime: v })}
						showIcon={false}
						placeholder={t.filters.startTime}
						className="iz-roster-filter-time"
						aria-label={t.filters.shiftStartFrom}
					/>
				</label>

				<label className="iz-roster-filter-field">
					<span className="iz-roster-filter-label">{t.filters.endBy}</span>
					<IzTimeInput
						value={filters.endTime}
						onChange={(v) => onChange({ endTime: v })}
						showIcon={false}
						placeholder={t.filters.endTime}
						className="iz-roster-filter-time"
						aria-label={t.filters.shiftEndBy}
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
					{t.rosterGrid.clearFilters}
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
