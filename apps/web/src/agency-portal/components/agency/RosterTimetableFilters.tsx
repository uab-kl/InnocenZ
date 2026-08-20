import { IzSelect, IzTimeInput } from "@agency-portal/components/iz/ui";
import type { RosterTimetableFilterState } from "@agency-portal/lib/roster-shift-filters";
import {
	countActiveRosterTimetableFilters,
	EMPTY_ROSTER_TIMETABLE_FILTERS,
} from "@agency-portal/lib/roster-shift-filters";
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
	outletNames,
}: {
	filters: RosterTimetableFilterState;
	onChange: (patch: Partial<RosterTimetableFilterState>) => void;
	prCount: number;
	totalPrs: number;
	shiftCount: number;
	totalShifts: number;
	/**
	 * The outlets to offer, from the SAME rows the grid renders. Required for the
	 * reason it is required on `AgencyOutletFilters` and `RosterShiftFilters`: an
	 * optional prop defaulting to the `OUTLET_NAMES` demo constant is exactly how
	 * five demo venues ended up in front of real agencies here.
	 */
	outletNames: string[];
}) {
	const { t } = usePortalLocale();
	const activeCount = countActiveRosterTimetableFilters(filters);

	return (
		<div className="iz-roster-filterbar">
			<div className="iz-roster-filterbar__head">
				<span className="iz-roster-filterbar__title">{t.filters.filters}</span>
				<span className="iz-roster-filterbar__spacer" />
				<span className="iz-roster-filterbar__count">
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
					{activeCount > 0
						? fill(t.rosterGrid.ofTotals, {
								prs: totalPrs,
								shifts: totalShifts,
							})
						: ""}
				</span>
				{activeCount > 0 && (
					<button
						type="button"
						className="iz-roster-filterbar__clear"
						onClick={() => onChange({ ...EMPTY_ROSTER_TIMETABLE_FILTERS })}
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

				{/*
				 * The "PR type" select that used to sit here is GONE. It offered
				 * "All PRs / Agency-tied only" and was written but never read: no
				 * predicate in the codebase consulted `prType`, and
				 * `RosterBackendTimetable` said so in its own comment — every backend PR
				 * is agency-scoped, so it never excluded anyone. Its one real effect was
				 * to flip the "filters are active" flag, which made the header append an
				 * "of N · M" suffix claiming a narrowing that had not happened.
				 */}

				<label className="iz-roster-filterbar__field">
					<span className="iz-roster-filterbar__label">
						{t.filters.showPrs}
					</span>
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
					<span className="iz-roster-filterbar__label">
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
						{/*
						 * `outlet-request-pending` removed: there is no outlet-request
						 * feature server-side — no table, no endpoint — so it matched
						 * nothing and always would. `swap-pending` stays and now works,
						 * derived from real pending `outlet_swap` rows.
						 */}
						<option value="">{t.filters.anyStatus}</option>
						<option value="scheduled">{t.roster.scheduled}</option>
						<option value="ended">{t.roster.ended}</option>
						<option value="assignment-pending">
							{t.rosterGrid.leaveAwaitingAgency}
						</option>
						<option value="on-duty">{t.roster.onDuty}</option>
						<option value="swap-pending">{t.rosterGrid.swapPending}</option>
						<option value="unavailable">{t.roster.unavailable}</option>
					</IzSelect>
				</label>

				{/* One range, not two peer fields — see RosterShiftFilters. */}
				<div className="iz-roster-filterbar__range">
					<span className="iz-roster-filterbar__label">
						{t.filters.shiftTime}
					</span>
					<div className="iz-roster-filterbar__rangerow">
						<IzTimeInput
							value={filters.startTime}
							onChange={(v) => onChange({ startTime: v })}
							showIcon={false}
							placeholder={t.filters.startTime}
							className="iz-roster-filterbar__time"
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
			</div>
		</div>
	);
}
