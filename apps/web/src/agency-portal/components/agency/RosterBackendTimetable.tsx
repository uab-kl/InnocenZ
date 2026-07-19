import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { formatRM } from "@agency-portal/components/iz/ui";
import type {
	AgencyRosterSlot,
	RosterSlotStatus,
} from "@agency-portal/lib/agency-demo";
import type { RosterTimetableFilterState } from "@agency-portal/lib/roster-shift-filters";
import {
	dayColumnLabel,
	weekDayIsos,
	weekRangeLabel,
} from "@agency-portal/lib/roster-week-plan";
import { cn } from "@agency-portal/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchOutlets } from "@/services/outlet/outlet";
import { fetchPrPersonnel, type PrPersonnel } from "@/services/pr-personnel";
import { fetchShifts, type Shift } from "@/services/shift";

const STATUS_CELL: Record<string, { className: string; label: string }> = {
	scheduled: {
		className: "iz-roster-week-cell--scheduled",
		label: "Scheduled",
	},
	"assignment-pending": {
		className: "iz-roster-week-cell--scheduled",
		label: "Pending",
	},
	unavailable: { className: "iz-roster-week-cell--off", label: "Off" },
};

function toneFor(status: RosterSlotStatus) {
	return (
		STATUS_CELL[status] ?? {
			className: "iz-roster-week-cell--scheduled",
			label: "Scheduled",
		}
	);
}

type RosterBackendTimetableProps = {
	weekStartIso: string;
	/** Backend-derived roster slots for the week (from useRosterSlots). */
	roster: AgencyRosterSlot[];
	filters: RosterTimetableFilterState;
	canAssign: boolean;
	onEditSlot: (slotId: string) => void;
	onWeekChange: (anchorDateIso: string) => void;
	/** Cell-tap assign: schedule a backend PR onto an open backend shift. */
	onAssign: (shiftId: string, prId: string) => void;
	todayIso?: string;
};

/**
 * Backend-driven weekly planning grid. Rows are backend PRs, columns are the
 * week's days, and each cell reflects real backend state: a filled cell maps to
 * a shift-assignment (tap to edit), a free cell lets the agency assign the PR to
 * an open backend shift on that day (tap → pick shift → `onAssign`). All ids are
 * backend ids, so what the grid shows and what it writes stay in sync — unlike
 * the demo timetable, whose rows/shifts are demo-shaped. Honors the PR-name and
 * outlet filters from the shared filter bar; the time/payout/status filters are
 * demo-only and don't apply here.
 */
export function RosterBackendTimetable({
	weekStartIso,
	roster,
	filters,
	canAssign,
	onEditSlot,
	onWeekChange,
	onAssign,
	todayIso,
}: RosterBackendTimetableProps) {
	const { logout } = useAuth();
	const [assignTarget, setAssignTarget] = useState<{
		pr: PrPersonnel;
		dateIso: string;
	} | null>(null);

	const days = useMemo(() => weekDayIsos(weekStartIso), [weekStartIso]);
	const fromDate = days[0] ?? weekStartIso;
	const toDate = days[days.length - 1] ?? weekStartIso;

	// Same query keys as useRosterSlots, so these read the already-loaded cache.
	const prsQuery = useQuery({
		queryKey: ["roster", "prs"],
		queryFn: () => fetchPrPersonnel({ pageSize: 500 }, logout),
		staleTime: 60_000,
	});
	const shiftsQuery = useQuery({
		queryKey: ["roster", "shifts", fromDate, toDate],
		queryFn: () => fetchShifts({ fromDate, toDate, pageSize: 200 }, logout),
		staleTime: 30_000,
	});
	const outletsQuery = useQuery({
		queryKey: ["roster", "outlets"],
		queryFn: () => fetchOutlets({ pageSize: 500 }, logout),
		staleTime: 60_000,
	});

	const outletNameById = useMemo(
		() => new Map((outletsQuery.data?.data ?? []).map((o) => [o.id, o.name])),
		[outletsQuery.data],
	);

	// One slot per (PR, day); apply the outlet filter here so filtered slots read
	// as free cells rather than vanishing rows.
	const slotByPrDay = useMemo(() => {
		const map = new Map<string, AgencyRosterSlot>();
		for (const slot of roster) {
			if (filters.outlet && slot.outlet !== filters.outlet) continue;
			map.set(`${slot.prId}__${slot.dateIso}`, slot);
		}
		return map;
	}, [roster, filters.outlet]);

	// Open backend shifts (remaining capacity, not sealed) grouped by day.
	const openShiftsByDay = useMemo(() => {
		const map: Record<string, Shift[]> = {};
		for (const s of shiftsQuery.data?.data ?? []) {
			if (s.status === "sealed" || s.filled >= s.quantity) continue;
			const outletName = outletNameById.get(s.outletId) ?? s.outletId;
			if (filters.outlet && outletName !== filters.outlet) continue;
			const list = map[s.shiftDate];
			if (list) list.push(s);
			else map[s.shiftDate] = [s];
		}
		return map;
	}, [shiftsQuery.data, outletNameById, filters.outlet]);

	const prRows = useMemo(() => {
		const q = filters.nameQuery.trim().toLowerCase();
		return (prsQuery.data?.data ?? [])
			.filter((p) => {
				if (!q) return true;
				return (
					p.name.toLowerCase().includes(q) ||
					(p.nickname?.toLowerCase().includes(q) ?? false)
				);
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [prsQuery.data, filters.nameQuery]);

	const weekLabel = weekRangeLabel(weekStartIso);
	const loading = prsQuery.isLoading || shiftsQuery.isLoading;

	return (
		<>
			<div className="iz-roster-week">
				<div className="iz-roster-week-head">
					<button
						type="button"
						className="iz-roster-week-nav"
						aria-label="Previous week"
						onClick={() => onWeekChange(shiftWeekAnchor(weekStartIso, -1))}
					>
						<ChevronLeft className="h-4 w-4" />
					</button>
					<div className="min-w-0 text-center">
						<p className="font-sora text-sm font-bold text-[var(--iz-txt)]">
							Week · {weekLabel}
						</p>
						<p className="iz-tiny iz-muted2">
							Live backend roster · tap a free cell to assign a PR
						</p>
					</div>
					<button
						type="button"
						className="iz-roster-week-nav"
						aria-label="Next week"
						onClick={() => onWeekChange(shiftWeekAnchor(weekStartIso, 1))}
					>
						<ChevronRight className="h-4 w-4" />
					</button>
				</div>

				<div className="iz-roster-week-scroll">
					<table className="iz-roster-week-table">
						<colgroup>
							<col className="iz-roster-week-col-pr" />
							{days.map((dateIso) => (
								<col key={dateIso} className="iz-roster-week-col-day" />
							))}
						</colgroup>
						<thead>
							<tr>
								<th className="iz-roster-week-pr-col">PR</th>
								{days.map((dateIso) => {
									const { dow, dom } = dayColumnLabel(dateIso);
									const isToday = todayIso === dateIso;
									return (
										<th
											key={dateIso}
											className={cn("iz-roster-week-day-col", isToday && "on")}
										>
											<span className="dow">{dow}</span>
											<span className="dom">{dom}</span>
										</th>
									);
								})}
							</tr>
						</thead>
						<tbody>
							{prRows.length === 0 ? (
								<tr>
									<td
										colSpan={days.length + 1}
										className="iz-roster-week-empty"
									>
										{loading
											? "Loading roster…"
											: "No PRs yet · add a PR to start assigning shifts"}
									</td>
								</tr>
							) : (
								prRows.map((pr) => (
									<tr key={pr.id}>
										<th scope="row" className="iz-roster-week-pr">
											<div className="iz-roster-week-pr-inner">
												<div className="min-w-0">
													<span className="name">
														{pr.nickname
															? `${pr.name} (${pr.nickname})`
															: pr.name}
													</span>
													{pr.tier && (
														<span className="meta">
															<span className="rating">{pr.tier}</span>
														</span>
													)}
												</div>
											</div>
										</th>
										{days.map((dateIso) => {
											const slot = slotByPrDay.get(`${pr.id}__${dateIso}`);
											if (slot) {
												const tone = toneFor(slot.status);
												return (
													<td key={dateIso} className="iz-roster-week-td">
														<button
															type="button"
															className={`iz-roster-week-cell iz-roster-week-cell--filled ${tone.className}`}
															onClick={() => canAssign && onEditSlot(slot.id)}
															disabled={!canAssign}
															aria-label={`${pr.name} at ${slot.outlet} on ${dateIso}`}
														>
															<span className="outlet">{slot.outlet}</span>
															<span className="shift">
																{slot.shift || "Shift"}
															</span>
															<span className="status">{tone.label}</span>
														</button>
													</td>
												);
											}

											const open = openShiftsByDay[dateIso] ?? [];
											const hasOpen = open.length > 0;
											return (
												<td key={dateIso} className="iz-roster-week-td">
													<button
														type="button"
														className={`iz-roster-week-cell iz-roster-week-cell--empty${canAssign && !hasOpen ? " iz-roster-week-cell--no-shifts" : ""}`}
														disabled={!canAssign}
														onClick={() =>
															canAssign && setAssignTarget({ pr, dateIso })
														}
														aria-label={`Assign ${pr.name} on ${dateIso}`}
														title={
															canAssign && !hasOpen
																? "No open shifts this day"
																: undefined
														}
													>
														{canAssign ? (
															<Plus className="h-4 w-4" />
														) : (
															<span className="dash">—</span>
														)}
													</button>
												</td>
											);
										})}
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>

			{assignTarget && (
				<AssignBackendCellSheet
					pr={assignTarget.pr}
					dateIso={assignTarget.dateIso}
					shifts={openShiftsByDay[assignTarget.dateIso] ?? []}
					outletNameById={outletNameById}
					onAssign={onAssign}
					onClose={() => setAssignTarget(null)}
				/>
			)}
		</>
	);
}

function shiftWeekAnchor(weekStartIso: string, delta: number): string {
	const [y, m, d] = weekStartIso.split("-").map(Number);
	const next = new Date(y, m - 1, d + delta * 7);
	return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

function shiftLabel(s: Shift): string {
	return s.slot || s.eventName || "Shift";
}

function AssignBackendCellSheet({
	pr,
	dateIso,
	shifts,
	outletNameById,
	onAssign,
	onClose,
}: {
	pr: PrPersonnel;
	dateIso: string;
	shifts: Shift[];
	outletNameById: Map<string, string>;
	onAssign: (shiftId: string, prId: string) => void;
	onClose: () => void;
}) {
	const [pickId, setPickId] = useState(shifts[0]?.id ?? "");
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		setPickId(shifts[0]?.id ?? "");
	}, [shifts]);

	const picked = shifts.find((s) => s.id === pickId);

	const confirm = () => {
		if (busy || !picked) return;
		setBusy(true);
		onAssign(picked.id, pr.id);
		onClose();
	};

	return (
		<IzSheet open onClose={busy ? () => {} : onClose}>
			<div className="iz-sheet-head">
				<div>
					<p className="iz-tiny iz-muted2 uppercase tracking-widest">
						Planning · {dateIso}
					</p>
					<h3>
						Assign {pr.nickname ? `${pr.name} (${pr.nickname})` : pr.name}
					</h3>
				</div>
				<button
					type="button"
					className="iz-sheet-close"
					onClick={onClose}
					disabled={busy}
					aria-label="Close"
				>
					<X className="h-4 w-4" />
				</button>
			</div>

			{shifts.length === 0 ? (
				<p className="iz-tiny iz-muted mt-4 rounded-xl border border-dashed border-[var(--iz-line)] px-4 py-6 text-center">
					No open backend shifts on this date. Add a shift first, then assign.
				</p>
			) : (
				<>
					<p className="iz-field-label mt-3">Open shifts · {shifts.length}</p>
					<div className="iz-roster-shift-pick-scroll mt-1.5">
						<div className="iz-roster-shift-pick-list">
							{shifts.map((shift) => {
								const selected = shift.id === pickId;
								const outlet =
									outletNameById.get(shift.outletId) ?? shift.outletId;
								return (
									<button
										key={shift.id}
										type="button"
										className={cn("iz-roster-shift-pick", selected && "on")}
										onClick={() => setPickId(shift.id)}
										disabled={busy}
									>
										<div className="min-w-0 flex-1 text-left">
											<div className="flex flex-wrap items-center gap-1.5">
												<span className="font-sora text-sm font-bold text-[var(--iz-txt)]">
													{outlet}
												</span>
												<span className="iz-tiny iz-muted">
													{shiftLabel(shift)}
												</span>
											</div>
											<p className="iz-tiny mt-1 text-[var(--iz-gold-l)]">
												{shift.quantity - shift.filled} open ·{" "}
												{formatRM(Number(shift.payPerHour))}/hr
											</p>
										</div>
										<span className="iz-tiny iz-muted2 shrink-0 text-right leading-tight">
											{shift.filled}/{shift.quantity}
										</span>
									</button>
								);
							})}
						</div>
					</div>

					<button
						type="button"
						className="iz-btn iz-btn-primary mt-4 w-full"
						disabled={busy || !picked}
						onClick={confirm}
					>
						{busy ? "Assigning…" : "Schedule PR"}
					</button>
				</>
			)}
		</IzSheet>
	);
}
