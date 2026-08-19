import { IzSelect, IzTimeInput } from "@agency-portal/components/iz/ui";
import { OUTLET_NAMES } from "@agency-portal/lib/agency-demo";
import type { RosterShiftFilterState } from "@agency-portal/lib/roster-shift-filters";
import { rosterShiftFiltersActive } from "@agency-portal/lib/roster-shift-filters";
import { RotateCcw, Search } from "lucide-react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

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
	const { t } = usePortalLocale();
	const active = rosterShiftFiltersActive(filters);

	return (
		<div className="iz-roster-shift-filters">
			<div className="iz-roster-shift-filters-head">
				<span className="iz-tiny font-semibold uppercase tracking-wider text-[#e8dff7]">
					{t.filters.filterShifts}
				</span>
				<span className="iz-tiny iz-muted">
					{resultCount} {t.roster.countOf} {totalCount}
				</span>
			</div>

			<div className="iz-roster-shift-filters-grid">
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
					<span className="iz-roster-filter-label">{t.filters.status}</span>
					<IzSelect
						block
						value={filters.status}
						onChange={(e) =>
							onChange({
								status: e.target.value as RosterShiftFilterState["status"],
							})
						}
					>
						<option value="">{t.filters.anyStatus}</option>
						<option value="on-duty">{t.roster.onDuty}</option>
						<option value="scheduled">{t.roster.scheduled}</option>
						<option value="swap-pending">{t.rosterGrid.swapPending}</option>
						<option value="assignment-pending">
							{t.rosterGrid.awaitingPr}
						</option>
						<option value="outlet-request-pending">
							{t.rosterGrid.outletRequest}
						</option>
						<option value="unavailable">{t.roster.unavailable}</option>
						<option value="late">{t.rosterGrid.lateFlag}</option>
						<option value="no-show">{t.rosterGrid.noShowFlag}</option>
					</IzSelect>
				</label>

				<label className="iz-roster-filter-field">
					<span className="iz-roster-filter-label">{t.filters.startFrom}</span>
					<IzTimeInput
						value={filters.startTime}
						onChange={(v) => onChange({ startTime: v })}
						showIcon={false}
						className="iz-roster-filter-time"
						placeholder={t.filters.startTime}
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

				<label className="iz-roster-filter-field">
					<span className="iz-roster-filter-label">{t.filters.minPayout}</span>
					<input
						type="number"
						min={0}
						step={50}
						className="iz-roster-filter-input iz-roster-filter-input--plain"
						placeholder={t.filters.egAmount300}
						value={filters.payoutMin}
						onChange={(e) => onChange({ payoutMin: e.target.value })}
					/>
				</label>

				<label className="iz-roster-filter-field">
					<span className="iz-roster-filter-label">{t.filters.maxPayout}</span>
					<input
						type="number"
						min={0}
						step={50}
						className="iz-roster-filter-input iz-roster-filter-input--plain"
						placeholder={t.filters.egAmount500}
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
					{t.rosterGrid.clearFilters}
				</button>
			)}
		</div>
	);
}
