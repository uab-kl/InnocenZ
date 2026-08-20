import { IzSelect, IzTimeInput } from "@agency-portal/components/iz/ui";
import type { RosterShiftFilterState } from "@agency-portal/lib/roster-shift-filters";
import {
	countActiveRosterShiftFilters,
	EMPTY_ROSTER_SHIFT_FILTERS,
} from "@agency-portal/lib/roster-shift-filters";
import { RotateCcw, Search } from "lucide-react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

export function RosterShiftFilters({
	filters,
	onChange,
	resultCount,
	totalCount,
	outletNames,
}: {
	filters: RosterShiftFilterState;
	onChange: (patch: Partial<RosterShiftFilterState>) => void;
	resultCount: number;
	totalCount: number;
	/**
	 * The outlets to offer, from the SAME rows the list renders.
	 *
	 * This was the hardcoded `OUTLET_NAMES` demo constant — five venues derived
	 * from `OUTLET_COMMISSION_RULES` — so a real agency saw "Velvet 23 / Mermate
	 * / Bear Lounge / Onyx KL / Urban Soul" while its actual venues sat in the
	 * grid below, and picking one filtered everything away. The sibling
	 * `AgencyOutletFilters` already fixed exactly this and left a written warning
	 * that this bar never picked up.
	 *
	 * REQUIRED on purpose, for the reason it is required there: an optional prop
	 * falling back to the demo constant is how the wrong list arrived, and it
	 * would arrive again the first time a new caller forgot to pass it.
	 */
	outletNames: string[];
}) {
	const { t } = usePortalLocale();
	const activeCount = countActiveRosterShiftFilters(filters);

	return (
		<div className="iz-roster-filterbar">
			<div className="iz-roster-filterbar__head">
				<span className="iz-roster-filterbar__title">
					{t.filters.filterShifts}
				</span>
				<span className="iz-roster-filterbar__spacer" />
				<span className="iz-roster-filterbar__count">
					{resultCount} {t.roster.countOf} {totalCount}
				</span>
				{activeCount > 0 && (
					<button
						type="button"
						className="iz-roster-filterbar__clear"
						onClick={() => onChange({ ...EMPTY_ROSTER_SHIFT_FILTERS })}
					>
						<RotateCcw className="h-3.5 w-3.5" />
						{t.rosterGrid.clearFilters}
						<span className="iz-roster-filterbar__badge">{activeCount}</span>
					</button>
				)}
			</div>

			<div className="iz-roster-filterbar__row">
				<label className="iz-roster-filterbar__field iz-roster-filterbar__field--grow">
					<span className="iz-roster-filterbar__label">{t.filters.name}</span>
					<span className="iz-roster-filterbar__inputwrap">
						<Search className="h-4 w-4 shrink-0 text-[var(--iz-muted2)]" />
						<input
							type="search"
							className="iz-roster-filterbar__input"
							placeholder={t.filters.search}
							value={filters.nameQuery}
							onChange={(e) => onChange({ nameQuery: e.target.value })}
						/>
					</span>
				</label>

				<label className="iz-roster-filterbar__field">
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

				<label className="iz-roster-filterbar__field">
					<span className="iz-roster-filterbar__label">{t.filters.status}</span>
					<IzSelect
						block
						value={filters.status}
						onChange={(e) =>
							onChange({
								status: e.target.value as RosterShiftFilterState["status"],
							})
						}
					>
						{/*
						 * Only states the backend can actually reach. `outlet-request-pending`
						 * is gone — there is no outlet-request feature server-side at all, no
						 * table and no endpoint, so it could never match a row. `swap-pending`
						 * and `late` stay and now WORK: both are derived from real data (a
						 * pending `outlet_swap` row, and a check-in later than the shift
						 * start), where before they existed only in demo fixtures.
						 */}
						<option value="">{t.filters.anyStatus}</option>
						<option value="on-duty">{t.roster.onDuty}</option>
						<option value="scheduled">{t.roster.scheduled}</option>
						<option value="ended">{t.roster.ended}</option>
						<option value="swap-pending">{t.rosterGrid.swapPending}</option>
						<option value="assignment-pending">
							{t.rosterGrid.leaveAwaitingAgency}
						</option>
						<option value="unavailable">{t.roster.unavailable}</option>
						<option value="late">{t.rosterGrid.lateFlag}</option>
						<option value="no-show">{t.rosterGrid.noShowFlag}</option>
					</IzSelect>
				</label>

				{/*
				 * Two paired RANGES rather than four peer fields. "Start from" and
				 * "End by" are one question, and so are min/max payout — as four equal
				 * labels in a flat grid the bar read as seven unrelated controls.
				 */}
				<div className="iz-roster-filterbar__range">
					<span className="iz-roster-filterbar__label">
						{t.filters.shiftTime}
					</span>
					<div className="iz-roster-filterbar__rangerow">
						<IzTimeInput
							value={filters.startTime}
							onChange={(v) => onChange({ startTime: v })}
							showIcon={false}
							className="iz-roster-filterbar__time"
							placeholder={t.filters.startTime}
							aria-label={t.filters.shiftStartFrom}
						/>
						<span className="iz-roster-filterbar__dash" aria-hidden>
							–
						</span>
						<IzTimeInput
							value={filters.endTime}
							onChange={(v) => onChange({ endTime: v })}
							showIcon={false}
							placeholder={t.filters.endTime}
							className="iz-roster-filterbar__time"
							aria-label={t.filters.shiftEndBy}
						/>
					</div>
				</div>

				<div className="iz-roster-filterbar__range">
					<span className="iz-roster-filterbar__label">
						{t.filters.payoutRange}
					</span>
					<div className="iz-roster-filterbar__rangerow">
						<input
							type="number"
							min={0}
							step={50}
							className="iz-roster-filterbar__input iz-roster-filterbar__input--num"
							placeholder={t.filters.egAmount300}
							aria-label={t.filters.minPayout}
							value={filters.payoutMin}
							onChange={(e) => onChange({ payoutMin: e.target.value })}
						/>
						<span className="iz-roster-filterbar__dash" aria-hidden>
							–
						</span>
						<input
							type="number"
							min={0}
							step={50}
							className="iz-roster-filterbar__input iz-roster-filterbar__input--num"
							placeholder={t.filters.egAmount500}
							aria-label={t.filters.maxPayout}
							value={filters.payoutMax}
							onChange={(e) => onChange({ payoutMax: e.target.value })}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
