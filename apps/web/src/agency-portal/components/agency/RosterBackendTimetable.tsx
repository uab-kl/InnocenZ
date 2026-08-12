import {
	PrComcardIdentity,
	toComcardPreview,
} from "@agency-portal/components/agency/PrComcardIdentity";
import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { formatRM } from "@agency-portal/components/iz/ui";
import type {
	AgencyRosterSlot,
	RosterSlotStatus,
} from "@agency-portal/lib/agency-demo";
import { formatPayeeLabel } from "@agency-portal/lib/agency-payroll";
import {
	type ShiftBlockReason,
	shiftBlockedFor,
	tierLabel,
} from "@agency-portal/lib/auto-assign";
import { managedPrFromBackend } from "@agency-portal/lib/pr-personnel-map";
import { getPrScheduleState } from "@agency-portal/lib/roster-availability";
import {
	filterRosterShifts,
	type RosterTimetableFilterState,
	rosterShiftFiltersActive,
	timetableSlotMatches,
} from "@agency-portal/lib/roster-shift-filters";
import {
	dayColumnLabel,
	weekDayIsos,
	weekRangeLabel,
} from "@agency-portal/lib/roster-week-plan";
import { hasShiftEnded } from "@agency-portal/lib/shift-window";
import { cn } from "@agency-portal/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import { fetchOutlets } from "@/services/outlet/outlet";
import { fetchPrPersonnel, type PrPersonnel } from "@/services/pr-personnel";
import { fetchShifts, type Shift } from "@/services/shift";
import {
	fetchShiftAssignments,
	fetchWagePreview,
	type ShiftAssignmentStatus,
	type TierWagePreview,
} from "@/services/shift-assignment";

/**
 * What this shift pays THIS PR, in the sheet's one line of space.
 *
 * Never falls back to a number when the answer is unknown: the card previously
 * showed the shift's own `pay_per_hour`, which is the same for every PR, so a
 * Servant and a Tier I read one wage and only the sealed voucher disagreed.
 * Absence is reported as absence — `unpriced` in particular is the case the
 * assign call REFUSES, so quietly printing RM0.00 would hide the reason.
 */
function wageLabel(
	wage: TierWagePreview | undefined,
	loading: boolean,
	tierUnwanted: boolean,
	prTier: string | null,
): string {
	// The shift declared a mix with no place for this tier, so the resolver's
	// fallback — the OUTLET's list price for it — is a number this shift can
	// never pay: the assign is refused on the tier rule before money is reached.
	// Quoting RM700 for a shift posted at RM40 was true of the rate card and
	// false of the shift, which is the most convincing kind of wrong.
	if (tierUnwanted) return `${tierLabel(prTier)} not on this shift`;
	if (loading) return "checking rate…";
	if (!wage) return "rate unavailable";
	switch (wage.kind) {
		case "commission_only":
			return "Commission only · no day rate";
		case "unpriced":
			return `No rate set for ${wage.tierLabel ?? "this tier"}`;
		default:
			return `${formatRM(Number(wage.wage))}/day`;
	}
}

/** Statuses that free the slot again — mirrors the backend's NON_STAFFING_STATUSES. */
const NON_STAFFING_ASSIGNMENT_STATUSES: readonly ShiftAssignmentStatus[] = [
	"cancelled",
	"no_show",
	"leave_approved",
];

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
	/**
	 * Cell-tap assign: schedule a backend PR onto an open backend shift. Must
	 * reject on failure — the sheet reports the reason and stays open rather than
	 * closing on a write that never landed.
	 */
	onAssign: (
		shiftId: string,
		prId: string,
		userId?: string,
	) => Promise<unknown>;
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
	// Staffing is COUNTED from live assignments. `shift.filled` is a dead column —
	// nothing in the backend increments it (the swap repo and cut-loss both say so
	// and route around it), so it reads 0 on a fully-staffed shift. Trusting it is
	// why this sheet offered a 2/2 shift as "2 open" and the API then refused the
	// write with "already fully staffed (2/2)".
	const assignmentsQuery = useQuery({
		queryKey: ["roster", "assignments"],
		queryFn: () => fetchShiftAssignments({ pageSize: 500 }, logout),
		staleTime: 30_000,
	});

	const outletNameById = useMemo(
		() => new Map((outletsQuery.data?.data ?? []).map((o) => [o.id, o.name])),
		[outletsQuery.data],
	);

	const shiftFiltersOn = rosterShiftFiltersActive(filters);

	// ALL slots per (PR, day) — a PR can work two different-time shifts on the
	// same day, so a cell holds a list. Filter matching is applied per-cell
	// below via timetableSlotMatches, so a slot that fails the active filters
	// reads as free rather than removing the whole row.
	const slotsByPrDay = useMemo(() => {
		const map = new Map<string, AgencyRosterSlot[]>();
		for (const slot of roster) {
			const key = `${slot.prId}__${slot.dateIso}`;
			const list = map.get(key) ?? [];
			list.push(slot);
			map.set(key, list);
		}
		return map;
	}, [roster]);

	// Tier per PR, so a staffed seat can be attributed to the bucket it consumed.
	// `PrPersonnel.id` IS the user id, which is also what `shift_assignment.pr_id`
	// holds after 0089 — the two line up without a translation step.
	const tierByPrId = useMemo(
		() => new Map((prsQuery.data?.data ?? []).map((p) => [p.id, p.tier])),
		[prsQuery.data],
	);

	const staffingByShift = useMemo(() => {
		const map = new Map<
			string,
			{ staffed: number; tiers: (string | null)[] }
		>();
		for (const a of assignmentsQuery.data?.data ?? []) {
			if (NON_STAFFING_ASSIGNMENT_STATUSES.includes(a.status)) continue;
			const entry = map.get(a.shiftId) ?? { staffed: 0, tiers: [] };
			entry.staffed += 1;
			entry.tiers.push(tierByPrId.get(a.prId) ?? null);
			map.set(a.shiftId, entry);
		}
		return map;
	}, [assignmentsQuery.data, tierByPrId]);

	// Backend shifts for the day: not sealed, and NOT already finished. The
	// grouping key is a DATE, so a shift stayed assignable for the rest of the day
	// after it ended, and every shift on an earlier day of the week stayed
	// assignable outright. Assigning there produces a slot nobody can check into.
	// `hasShiftEnded` is overnight-aware; see shift-window.ts for why that is not
	// optional (most rows in this table cross midnight).
	//
	// Full shifts are NO LONGER dropped from this list — they are listed and
	// greyed out. Hiding them made a full shift indistinguishable from one that
	// was never posted, and the agency had no way to tell why a venue they knew
	// about was missing from the day.
	const openShiftsByDay = useMemo(() => {
		const map: Record<string, Shift[]> = {};
		const now = new Date();
		for (const s of shiftsQuery.data?.data ?? []) {
			if (s.status === "sealed") continue;
			if (hasShiftEnded(s.shiftDate, s.slot, now)) continue;
			const outletName = outletNameById.get(s.outletId) ?? s.outletId;
			if (filters.outlet && outletName !== filters.outlet) continue;
			const list = map[s.shiftDate];
			if (list) list.push(s);
			else map[s.shiftDate] = [s];
		}
		return map;
	}, [shiftsQuery.data, outletNameById, filters.outlet]);

	// Row filter mirrors the demo timetable's filterTimetablePrs, adapted to
	// backend PRs: name/nickname search, the scheduled/free toggle, and — when
	// any shift filter is active — keep only PRs with a matching slot or a free
	// day. prType only offers "agency" and every backend PR is agency-scoped, so
	// it never excludes anyone here.
	const prRows = useMemo(() => {
		const q = filters.nameQuery.trim().toLowerCase();
		return (prsQuery.data?.data ?? [])
			.filter((pr) => {
				if (
					q &&
					!(
						pr.name.toLowerCase().includes(q) ||
						(pr.nickname?.toLowerCase().includes(q) ?? false)
					)
				) {
					return false;
				}
				const weekSlots = roster.filter(
					(s) => s.prId === pr.id && days.includes(s.dateIso),
				);
				const matchingSlots = filterRosterShifts(weekSlots, filters);
				const hasFreeDay = days.some(
					(d) => getPrScheduleState(pr.id, roster, d) === "free",
				);
				if (filters.showPrs === "scheduled") return matchingSlots.length > 0;
				if (filters.showPrs === "free") return hasFreeDay;
				if (shiftFiltersOn) return matchingSlots.length > 0 || hasFreeDay;
				return true;
			})
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [prsQuery.data, roster, days, filters, shiftFiltersOn]);

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
								prRows.map((pr) => {
									const profile = managedPrFromBackend(pr);
									// Nickname FIRST: "(Vicky) Victoria Tan Mei Lin". This row
									// had the two halves the other way round, so the same PR
									// read one way here and the other way on every payment
									// voucher. `formatPayeeLabel` is the single spelling.
									const displayName = formatPayeeLabel(pr.nickname, pr.name);
									return (
										<tr key={pr.id}>
											<th scope="row" className="iz-roster-week-pr">
												<div className="iz-roster-week-pr-inner">
													<PrComcardIdentity
														pr={toComcardPreview(profile)}
														profile={profile}
														size="week"
													/>
													<div className="min-w-0">
														<span className="name">{displayName}</span>
														{pr.tier && (
															<span className="meta">
																<span className="rating">{pr.tier}</span>
															</span>
														)}
													</div>
												</div>
											</th>
											{days.map((dateIso) => {
												const rawSlots =
													slotsByPrDay.get(`${pr.id}__${dateIso}`) ?? [];
												// Slots that fail the active filters read as free, so
												// the outlet/status/payout/time filters narrow the grid.
												const daySlots = rawSlots.filter(
													(s) =>
														!shiftFiltersOn || timetableSlotMatches(s, filters),
												);
												const open = openShiftsByDay[dateIso] ?? [];
												const hasOpen = open.length > 0;
												if (daySlots.length > 0) {
													return (
														<td key={dateIso} className="iz-roster-week-td">
															{daySlots.map((slot) => {
																const tone = toneFor(slot.status);
																return (
																	<button
																		key={slot.id}
																		type="button"
																		className={`iz-roster-week-cell iz-roster-week-cell--filled ${tone.className}`}
																		onClick={() =>
																			canAssign && onEditSlot(slot.id)
																		}
																		disabled={!canAssign}
																		aria-label={`${pr.name} at ${slot.outlet} on ${dateIso}`}
																	>
																		<span className="outlet">
																			{slot.outlet}
																		</span>
																		<span className="shift">
																			{slot.shift || "Shift"}
																		</span>
																		<span className="status">{tone.label}</span>
																	</button>
																);
															})}
															{/* Same day, second shift — allowed at a different
															    time (the backend refuses overlaps). */}
															{canAssign && hasOpen && (
																<button
																	type="button"
																	className="iz-roster-week-cell iz-roster-week-cell--empty"
																	style={{ marginTop: 4, minHeight: 28 }}
																	onClick={() =>
																		setAssignTarget({ pr, dateIso })
																	}
																	aria-label={`Assign ${pr.name} another shift on ${dateIso}`}
																	title="Add another shift this day (different time)"
																>
																	<Plus className="h-3 w-3" />
																</button>
															)}
														</td>
													);
												}

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
									);
								})
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
					staffingByShift={staffingByShift}
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
	staffingByShift,
	outletNameById,
	onAssign,
	onClose,
}: {
	pr: PrPersonnel;
	dateIso: string;
	shifts: Shift[];
	staffingByShift: Map<string, { staffed: number; tiers: (string | null)[] }>;
	outletNameById: Map<string, string>;
	onAssign: (
		shiftId: string,
		prId: string,
		userId?: string,
	) => Promise<unknown>;
	onClose: () => void;
}) {
	// Why each shift can or cannot take THIS PR — the same two rules the API
	// applies, in the same order, so nothing selectable here can be refused there.
	const blockedById = useMemo(() => {
		const map = new Map<string, ShiftBlockReason | null>();
		for (const s of shifts) {
			const staffing = staffingByShift.get(s.id) ?? { staffed: 0, tiers: [] };
			map.set(
				s.id,
				shiftBlockedFor({
					shift: s,
					staffed: staffing.staffed,
					staffedTiers: staffing.tiers,
					prTier: pr.tier,
				}),
			);
		}
		return map;
	}, [shifts, staffingByShift, pr.tier]);

	const selectable = useMemo(
		() => shifts.filter((s) => !blockedById.get(s.id)),
		[shifts, blockedById],
	);

	// Would this shift take this PR's tier AT ALL, ignoring how full it is?
	//
	// The same rule as above, asked at zero staffing on purpose: `shiftBlockedFor`
	// reports `full` before it reports the tier, so a 2/2 shift hides the fact
	// that the tier was never wanted. A shift with unallocated headcount still
	// answers "yes" here, and it should — an unnamed tier legitimately takes a
	// leftover seat at the outlet's own rate.
	const tierUnwantedById = useMemo(() => {
		const map = new Map<string, boolean>();
		for (const s of shifts) {
			map.set(
				s.id,
				shiftBlockedFor({
					shift: s,
					staffed: 0,
					staffedTiers: [],
					prTier: pr.tier,
				})?.kind === "tier-full",
			);
		}
		return map;
	}, [shifts, pr.tier]);

	// The wage each card shows is THIS PR's, resolved by the server off the same
	// rule that seals the shift later (per-shift Post Job override, else the
	// outlet's tier rate). One call for the whole day — the server batches it.
	const { logout } = useAuth();
	const shiftIds = useMemo(() => shifts.map((s) => s.id), [shifts]);
	const wageQuery = useQuery({
		queryKey: ["roster", "wage-preview", pr.id, shiftIds.join(",")],
		queryFn: () => fetchWagePreview(pr.id, shiftIds, logout),
		enabled: shiftIds.length > 0,
		staleTime: 60_000,
	});
	const wageByShift = useMemo(
		() => new Map((wageQuery.data ?? []).map((w) => [w.shiftId, w])),
		[wageQuery.data],
	);

	const [pickId, setPickId] = useState(selectable[0]?.id ?? "");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Default to the first ASSIGNABLE shift, never a greyed-out one — otherwise
	// Schedule PR starts enabled on a row that cannot be written.
	useEffect(() => {
		setPickId((current) =>
			current && selectable.some((s) => s.id === current)
				? current
				: (selectable[0]?.id ?? ""),
		);
	}, [selectable]);

	const picked = selectable.find((s) => s.id === pickId);

	// Closing before the write resolved was indistinguishable from success: a
	// 403, a 409 for a PR already on the shift, or an unreachable API all left
	// the sheet shut and the cell empty with nothing said.
	const confirm = async () => {
		if (busy || !picked) return;
		setBusy(true);
		setError(null);
		try {
			await onAssign(picked.id, pr.id, pr.userId ?? undefined);
			onClose();
		} catch (err) {
			setError(
				toMutationError(err, "Couldn't assign the PR.")?.message ??
					"Couldn't assign the PR.",
			);
			setBusy(false);
		}
	};

	return (
		<IzSheet open onClose={busy ? () => {} : onClose}>
			<div className="iz-sheet-head">
				<div>
					<p className="iz-tiny iz-muted2 uppercase tracking-widest">
						Planning · {dateIso}
					</p>
					{/* Same spelling as the row that opened this sheet, and as the
					    voucher that eventually pays the shift — see formatPayeeLabel. */}
					<h3>Assign {formatPayeeLabel(pr.nickname, pr.name)}</h3>
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
					{/* No "add a shift" instruction: posting shifts is the OUTLET's
					    job, so telling the agency to do it sends them somewhere they
					    cannot act. */}
					No shifts posted for this day.
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
								const blocked = blockedById.get(shift.id) ?? null;
								const staffed = staffingByShift.get(shift.id)?.staffed ?? 0;
								return (
									<button
										key={shift.id}
										type="button"
										className={cn(
											"iz-roster-shift-pick",
											selected && !blocked && "on",
											blocked && "is-blocked",
										)}
										onClick={() => !blocked && setPickId(shift.id)}
										disabled={busy || Boolean(blocked)}
										aria-disabled={Boolean(blocked)}
										title={
											blocked?.kind === "full"
												? `Fully staffed (${blocked.staffed}/${blocked.quantity})`
												: blocked
													? `No ${blocked.bucket} seat left (${blocked.asked} requested)`
													: undefined
										}
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
											{/*
												What the shift IS, not just where and when. Four cards
												all reading "Emhub Testing" differ only by a time the
												agency has to squint at; the event is what tells them
												apart. Both facts are already on the row — `event_name`
												and `event_kind` — they were simply never rendered.
												`event_name` is nullable, so an unnamed shift says so
												rather than leaving a gap that reads as a load failure.
											*/}
											<p className="iz-tiny iz-muted2 mt-0.5 truncate">
												{shift.eventName?.trim() || "No event name"} ·{" "}
												{shift.eventKind === "special"
													? "Special event"
													: "Normal shift"}
											</p>
											<p
												className={cn(
													"iz-tiny mt-1",
													blocked ? "iz-muted2" : "text-[var(--iz-gold-l)]",
												)}
											>
												{blocked?.kind === "full"
													? "Fully staffed"
													: blocked
														? `No ${blocked.bucket} seat left`
														: `${shift.quantity - staffed} open`}{" "}
												·{" "}
												{/* NOT `shift.payPerHour`: that is the shift's own
												    figure and does not move when you pick a different
												    PR, so every tier read the same wage here and only
												    the sealed voucher disagreed. This is the server's
												    answer for THIS PR's tier. */}
												<span
													className={cn(
														// Amber flags a CONFIG fault (a tier the outlet never
														// costed). "Not on this shift" is an ordinary answer,
														// so it must not borrow the warning colour.
														!tierUnwantedById.get(shift.id) &&
															wageByShift.get(shift.id)?.kind === "unpriced" &&
															"text-[var(--iz-amber)]",
													)}
												>
													{wageLabel(
														wageByShift.get(shift.id),
														wageQuery.isLoading,
														tierUnwantedById.get(shift.id) ?? false,
														pr.tier,
													)}
												</span>
											</p>
										</div>
										<span className="iz-tiny iz-muted2 shrink-0 text-right leading-tight">
											{staffed}/{shift.quantity}
										</span>
									</button>
								);
							})}
						</div>
					</div>

					{error && (
						<p className="iz-tiny mt-3 text-[var(--iz-danger,#dc2626)]">
							{error}
						</p>
					)}

					{/* Every shift on the day exists but none can take this PR. Said
					    plainly, because a disabled button over a list of visible cards
					    otherwise reads as a broken screen. */}
					{selectable.length === 0 && (
						<p className="iz-tiny iz-muted2 mt-3 leading-snug">
							Every shift this day is already staffed for{" "}
							{formatPayeeLabel(pr.nickname, pr.name)} — raise a headcount, or
							pick another day.
						</p>
					)}

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
