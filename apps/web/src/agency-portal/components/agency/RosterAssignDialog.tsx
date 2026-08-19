import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { IzSelect } from "@agency-portal/components/iz/ui";
import { useRosterMutations } from "@agency-portal/hooks/use-roster-mutations";
import { formatPayeeLabel } from "@agency-portal/lib/agency-payroll";
import {
	bucketForPrTier,
	mergeCrossAgencyStaffing,
	type ShiftBlockReason,
	shiftBlockedFor,
} from "@agency-portal/lib/auto-assign";
import {
	shiftBlockLong,
	shiftBlockShort,
} from "@agency-portal/lib/shift-block-label";
import { windowMinutes } from "@agency-portal/lib/shift-slot-clash";
import {
	type OccupiedWindow,
	reachProblem,
	type VenuePin,
} from "@agency-portal/lib/travel-gap";
import { useQuery } from "@tanstack/react-query";
import { UserPlus, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { fetchOutlets } from "@/services/outlet/outlet";
import {
	blockedDatesByPr,
	fetchPrAvailability,
} from "@/services/pr-availability";
import { fetchPrPersonnel } from "@/services/pr-personnel";
import { fetchShifts } from "@/services/shift";
import {
	fetchShiftAssignments,
	type ShiftAssignmentStatus,
} from "@/services/shift-assignment";

/** Statuses that free the slot again — mirrors the backend's NON_STAFFING_STATUSES. */
const NON_STAFFING_ASSIGNMENT_STATUSES: readonly ShiftAssignmentStatus[] = [
	"cancelled",
	"no_show",
	"leave_approved",
];

interface RosterAssignDialogProps {
	open: boolean;
	onClose: () => void;
	fromDate: string;
	toDate: string;
}

/**
 * Planning-view dialog to assign a PR to an open backend shift. Reads the same
 * roster queries the page already loads (shifts for the week + PRs + outlets),
 * lets the user pick an open shift (one with remaining capacity) and a PR, then
 * calls the roster `assign` mutation (→ createShiftAssignment). The mutation
 * invalidates the roster queries, so the new assignment shows up as a slot and
 * the shift's filled count updates. Uses real backend ids throughout.
 */
export function RosterAssignDialog({
	open,
	onClose,
	fromDate,
	toDate,
}: RosterAssignDialogProps) {
	const { logout } = useAuth();
	const { assign } = useRosterMutations();
	// The blocked-seat wording is SHARED with the planning grid's assign sheet
	// (t.rosterGrid.*) — the same refusal must read the same on both screens, and
	// tier LABELS stay English in either language because they are product terms.
	const { t } = usePortalLocale();

	// Same query keys as useRosterSlots, so this reads from the roster cache the
	// page already populated. (It used to name RosterAddShiftDialog too — that
	// component is gone: only an OUTLET posts shifts, so the agency portal has no
	// add-shift surface to keep in step.)
	const shiftsQuery = useQuery({
		queryKey: ["roster", "shifts", fromDate, toDate],
		// Paged out: the server clamps to 100, and this key is shared — see
		// lib/fetch-all-pages.ts. A truncated read here offers seats that are
		// already taken, which is the exact failure this dialog exists to prevent.
		queryFn: () =>
			fetchAllPages((page) =>
				fetchShifts({ fromDate, toDate, page, pageSize: 100 }, logout),
			),
		staleTime: 30_000,
		enabled: open,
	});
	const prsQuery = useQuery({
		queryKey: ["roster", "prs"],
		queryFn: () =>
			fetchAllPages((page) =>
				fetchPrPersonnel({ page, pageSize: 100 }, logout),
			),
		staleTime: 60_000,
		enabled: open,
	});
	const outletsQuery = useQuery({
		queryKey: ["roster", "outlets"],
		queryFn: () => fetchOutlets({ pageSize: 500 }, logout),
		staleTime: 60_000,
		enabled: open,
	});

	const outletNameById = useMemo(
		() => new Map((outletsQuery.data?.data ?? []).map((o) => [o.id, o.name])),
		[outletsQuery.data],
	);

	// Staffing COUNTED from live assignments, never `shift.filled` — nothing in
	// the backend increments that column, so it reads 0 on a full shift and this
	// list offered shifts the API then refused. Same fix as the planning grid's
	// assign sheet; the two must not disagree about what "open" means.
	const assignmentsQuery = useQuery({
		queryKey: ["roster", "assignments"],
		queryFn: () =>
			fetchAllPages((page) =>
				fetchShiftAssignments({ page, pageSize: 100 }, logout),
			),
		staleTime: 30_000,
		enabled: open,
	});
	// Tier per PR, so a staffed seat can be attributed to the BUCKET it consumed.
	// `PrPersonnel.id` IS the user id, which is also what `shift_assignment.pr_id`
	// holds after 0089 — the two line up without a translation step.
	const tierByPrId = useMemo(
		() => new Map((prsQuery.data?.data ?? []).map((p) => [p.id, p.tier])),
		[prsQuery.data],
	);

	// OCCUPANCY COMES FROM THE SHIFT, not from the assignment rows we can see —
	// and it is needed PER TIER, not merely as a headcount.
	//
	// `/shift-assignment` is scoped to our own agency, so counting it on a shift
	// shared with another agency (0124) reports OUR contribution as the total — the
	// dialog then offers seats the other agency has already filled, and the assign
	// 409s with no way the user could have known. `staffedCount`/`staffedBuckets`
	// are counted server-side across every agency; the local rows stay as the
	// fallback for a backend that does not send them yet.
	//
	// The tiers matter as much as the total, and this dialog used to merge only the
	// total: on a 2-seat shift asking Tier I ×1 + Tier II ×1 whose Tier I is already
	// taken, "1 of 2 filled" is true and completely useless — the one remaining seat
	// is not for a Tier I, and offering it to one is a promise the API then breaks.
	const staffingByShift = useMemo(() => {
		const map = new Map<
			string,
			{ staffed: number; tiers: (string | null)[]; unknown?: number }
		>();
		for (const a of assignmentsQuery.data?.data ?? []) {
			if (NON_STAFFING_ASSIGNMENT_STATUSES.includes(a.status)) continue;
			const prev = map.get(a.shiftId) ?? { staffed: 0, tiers: [] };
			map.set(a.shiftId, {
				staffed: prev.staffed + 1,
				// ⚠️ CONVERTED to the outlet bucket, never the raw membership tier.
				// `agency_pr.tier` is `'tier_1'`, while the demand rows
				// (`shift_pay_tier.tier`) and the server's `staffedBuckets` both speak
				// `'Tier I'`. Pushing the raw enum makes our OWN filled seats match
				// nothing, so the tier we just filled still reads as open — and only
				// for the agency that supplied the PR, which is why that units bug
				// looked like a sharing bug when it bit RosterBackendTimetable.
				tiers: [...prev.tiers, bucketForPrTier(tierByPrId.get(a.prId) ?? null)],
			});
		}
		// Applied AFTER the loop so the server's cross-agency figures overwrite our
		// own count instead of adding to it — see mergeCrossAgencyStaffing.
		for (const s of shiftsQuery.data?.data ?? []) {
			const merged = mergeCrossAgencyStaffing(s, map.get(s.id)?.tiers ?? []);
			map.set(s.id, {
				staffed: merged.staffed,
				tiers: merged.buckets,
				// Seats taken that no tier can be put against — see the note beside the
				// caution below, and `mergeCrossAgencyStaffing`.
				unknown: merged.unknownBuckets,
			});
		}
		return map;
	}, [assignmentsQuery.data, shiftsQuery.data, tierByPrId]);

	// EVERY non-sealed shift in the week, including the ones nobody can be put on.
	// Full shifts used to be dropped from this list, which made "already staffed"
	// indistinguishable from "never posted": a venue the agency knew about was
	// simply absent, and an absence gives them nothing to act on. They are listed
	// and disabled with the reason instead — the same call RosterBackendTimetable
	// made for its day cards.
	const listedShifts = useMemo(
		() =>
			(shiftsQuery.data?.data ?? [])
				.filter((s) => s.status !== "sealed")
				.sort((a, b) => a.shiftDate.localeCompare(b.shiftDate)),
		[shiftsQuery.data],
	);
	const prs = prsQuery.data?.data ?? [];

	// Days the roster's PRs marked unavailable. Shared query key, so this reads
	// the cache the roster page already filled.
	const availabilityQuery = useQuery({
		queryKey: ["roster", "availability", fromDate, toDate],
		queryFn: () => fetchPrAvailability({ from: fromDate, to: toDate }, logout),
		staleTime: 30_000,
		enabled: open,
	});
	const blockedDates = useMemo(
		() => blockedDatesByPr(availabilityQuery.data ?? []),
		[availabilityQuery.data],
	);
	// HOW LONG IT TAKES TO GET THERE, per PR, for the shift currently selected.
	//
	// The same rule the auto-assign planner applies and the server warns about, put
	// where the choice is actually made: an agency picking a name should see the trip
	// BEFORE the click, not read a toast about it afterwards.
	const outletPinById = useMemo<ReadonlyMap<string, VenuePin>>(
		() =>
			new Map(
				(outletsQuery.data?.data ?? []).map((o) => [
					o.id,
					{
						outletId: o.id,
						// `lat`/`lng` arrive as decimal STRINGS, and null means the venue
						// never dropped a pin. Kept as null rather than coerced: Number(null)
						// is 0, which is a real coordinate in the Gulf of Guinea.
						lat: o.lat === null ? null : Number(o.lat),
						lng: o.lng === null ? null : Number(o.lng),
					},
				]),
			),
		[outletsQuery.data],
	);

	const occupiedByPr = useMemo(() => {
		const shiftRowById = new Map(
			(shiftsQuery.data?.data ?? []).map((sh) => [sh.id, sh]),
		);
		const map = new Map<string, OccupiedWindow[]>();
		for (const a of assignmentsQuery.data?.data ?? []) {
			if (NON_STAFFING_ASSIGNMENT_STATUSES.includes(a.status)) continue;
			const row = shiftRowById.get(a.shiftId);
			if (!row) continue;
			const w = windowMinutes({
				dateIso: row.shiftDate,
				shift: row.slot ?? "",
			});
			if (!w) continue;
			map.set(a.prId, [
				...(map.get(a.prId) ?? []),
				{ outletId: row.outletId, start: w.start, end: w.end },
			]);
		}
		return map;
	}, [shiftsQuery.data, assignmentsQuery.data]);

	const [shiftId, setShiftId] = useState("");
	const [prId, setPrId] = useState("");

	const selectedShift = listedShifts.find((s) => s.id === shiftId) ?? null;
	const selectedPr = prs.find((p) => p.id === prId) ?? null;

	/**
	 * Why each listed shift cannot take the PR currently selected — `null` when it
	 * can. The same two rules `POST /shift-assignment` applies, in the same order
	 * (total headcount, then the tier mix), so nothing selectable here can be
	 * refused there.
	 *
	 * This dialog previously asked the headcount question ALONE and never called
	 * `shiftBlockedFor` at all, so on a shift shared between agencies it offered a
	 * PR whose tier was already spoken for and the API answered 409 — after the
	 * operator had promised the shift to someone by name.
	 *
	 * With no PR chosen there is no tier to test, so only the headcount half of the
	 * answer is kept: asking with a null tier runs the "a tier the shift never
	 * named" branch, which would grey shifts out on behalf of nobody in particular.
	 */
	const shiftBlockById = useMemo(() => {
		const map = new Map<string, ShiftBlockReason | null>();
		for (const s of listedShifts) {
			const staffing = staffingByShift.get(s.id) ?? { staffed: 0, tiers: [] };
			const reason = shiftBlockedFor({
				shift: s,
				staffed: staffing.staffed,
				staffedTiers: staffing.tiers,
				prTier: selectedPr?.tier ?? null,
			});
			// `full` and `not-assignable` are facts about the SHIFT, so both are true
			// with nobody selected. Only the tier answer needs a PR to be about.
			const answerable =
				selectedPr !== null ||
				reason?.kind === "full" ||
				reason?.kind === "not-assignable";
			map.set(s.id, answerable ? reason : null);
		}
		return map;
	}, [listedShifts, staffingByShift, selectedPr]);

	/**
	 * `prId -> why the SELECTED shift has no seat for them`.
	 *
	 * Empty until a shift is picked, for the same reason the blocked-date list is:
	 * with no shift there is no quota to ask about, and annotating the whole roster
	 * would look like a broken screen.
	 *
	 * Only `tier-full` is kept. A shift that is FULL is full for everybody — that is
	 * a fact about the shift, already stated on its own row, and repeating it beside
	 * all 32 names says nothing new while making every name look individually at
	 * fault.
	 */
	const tierBlockByPr = useMemo(() => {
		// Typed to the tier-full ARM, not the whole union: "only tier-full lives in
		// here" is an invariant of this map, and stating it in the type is what lets
		// the option below read `.bucket` without re-testing `kind` at the one place
		// that would still compile if the filter below were ever loosened.
		const map = new Map<
			string,
			Extract<ShiftBlockReason, { kind: "tier-full" }>
		>();
		if (!selectedShift) return map;
		const staffing = staffingByShift.get(selectedShift.id) ?? {
			staffed: 0,
			tiers: [],
		};
		for (const p of prs) {
			const reason = shiftBlockedFor({
				shift: selectedShift,
				staffed: staffing.staffed,
				staffedTiers: staffing.tiers,
				prTier: p.tier,
			});
			if (reason?.kind === "tier-full") map.set(p.id, reason);
		}
		return map;
	}, [selectedShift, staffingByShift, prs]);

	/**
	 * `prId -> "· needs 45 min to travel from Bukit Bintang, only 20 min free"`.
	 *
	 * Empty until a shift is picked: with no destination there is no trip to price,
	 * and annotating the whole list would be noise. Empty too for any venue without a
	 * map pin — this fails OPEN like every other reader of the rule, so a missing
	 * coordinate shows nothing rather than a guess.
	 */
	const travelNoteByPr = useMemo(() => {
		const notes = new Map<string, string>();
		const shift = selectedShift;
		if (!shift) return notes;
		const pin = outletPinById.get(shift.outletId);
		const w = windowMinutes({
			dateIso: shift.shiftDate,
			shift: shift.slot ?? "",
		});
		if (!pin || !w) return notes;

		for (const p of prs) {
			const problem = reachProblem({
				shift: { ...pin, start: w.start, end: w.end },
				pinById: outletPinById,
				occupied: occupiedByPr.get(p.id) ?? [],
			});
			if (!problem) continue;
			const from = outletNameById.get(problem.otherOutletId) ?? "another venue";
			notes.set(
				p.id,
				` · needs ${problem.needMinutes} min to travel from ${from}, only ${problem.haveMinutes} min free`,
			);
		}
		return notes;
	}, [selectedShift, outletPinById, occupiedByPr, outletNameById, prs]);

	// Which PRs cannot take the SELECTED shift, because they blocked its date.
	// Empty until a shift is picked — with no date there is no question to ask,
	// and greying the whole list would look like a broken screen.
	const selectedShiftDate = selectedShift?.shiftDate;
	const blockedPrIds = useMemo(() => {
		if (!selectedShiftDate) return new Set<string>();
		const ids = new Set<string>();
		for (const [blockedPrId, dates] of blockedDates) {
			if (dates.has(selectedShiftDate)) ids.add(blockedPrId);
		}
		return ids;
	}, [blockedDates, selectedShiftDate]);

	// Reset the form each time the dialog opens.
	useEffect(() => {
		if (!open) return;
		setShiftId("");
		setPrId("");
	}, [open]);

	const handleClose = () => {
		assign.reset();
		onClose();
	};

	/**
	 * Why the pair sitting in the two boxes RIGHT NOW cannot be written.
	 *
	 * A disabled `<option>` stops a blocked row being CHOSEN, but not one that was
	 * chosen while it still fitted: swapping the shift under an already-picked PR,
	 * or another agency taking the last Tier I between two refetches, both leave a
	 * stale selection sitting in the box that the browser goes on displaying. The
	 * submit button stayed enabled over exactly that, and the 409 was the first
	 * anyone heard of it — so the guard is re-asked here rather than inferred from
	 * the options being disabled.
	 */
	const selectionBlock = selectedShift
		? (shiftBlockById.get(selectedShift.id) ?? null)
		: null;
	const selectionDateBlocked = prId !== "" && blockedPrIds.has(prId);
	// `selectedShift !== null`, not just a non-empty `shiftId`: the two come apart
	// when a refetch drops the chosen shift out of the list — it seals, or its date
	// leaves the week. `selectionBlock` is derived FROM `selectedShift`, so it goes
	// null at the same moment, and every other term here would have gone on
	// reading as satisfied while the box still displayed the stale name.
	const isValid =
		selectedShift !== null &&
		prId !== "" &&
		!selectionBlock &&
		!selectionDateBlocked;

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		if (!isValid || assign.isPending) return;
		const pr = prs.find((p) => p.id === prId);
		assign.mutate(
			{ shiftId, prId, userId: pr?.userId ?? undefined },
			{ onSuccess: handleClose },
		);
	};

	const shiftsLoading = shiftsQuery.isLoading || outletsQuery.isLoading;

	return (
		<IzSheet open={open} onClose={assign.isPending ? () => {} : handleClose}>
			<form onSubmit={handleSubmit}>
				<div className="iz-sheet-head">
					<div>
						<p className="iz-tiny iz-muted2 uppercase tracking-widest">
							Planning
						</p>
						<h3>Assign PR</h3>
					</div>
					<button
						type="button"
						className="iz-sheet-close"
						onClick={handleClose}
						disabled={assign.isPending}
						aria-label="Close"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div>
					<span className="iz-field-label">Shift</span>
					<IzSelect
						block
						value={shiftId}
						onChange={(e) => setShiftId(e.target.value)}
						disabled={shiftsLoading}
						aria-label="Shift"
					>
						<option value="">
							{shiftsLoading
								? "Loading shifts…"
								: listedShifts.length === 0
									? "No shifts this week"
									: "Select shift…"}
						</option>
						{/* A shift the selected PR cannot take is LISTED AND DISABLED, with
						    the reason spelled out on the row. Two things it must not do:
						    disappear (an absent venue reads as a data fault, and the agency
						    cannot act on something that is not there), or grey out mutely
						    (which reads as a broken screen and sends them to support). The
						    reason also distinguishes the two remedies — "fully staffed" is
						    answered by finding another shift, "no Tier I seat left" by
						    picking a different tier or asking the outlet to edit the mix. */}
						{listedShifts.map((s) => {
							const outlet = outletNameById.get(s.outletId) ?? s.outletId;
							const label = s.slot || s.eventName || "Shift";
							const blocked = shiftBlockById.get(s.id) ?? null;
							return (
								<option key={s.id} value={s.id} disabled={Boolean(blocked)}>
									{outlet} · {s.shiftDate} · {label} ·{" "}
									{staffingByShift.get(s.id)?.staffed ?? 0}/{s.quantity}
									{blocked ? ` · ${shiftBlockShort(blocked, t)}` : ""}
								</option>
							);
						})}
					</IzSelect>
				</div>

				<div className="mt-4">
					<span className="iz-field-label">PR</span>
					<IzSelect
						block
						value={prId}
						onChange={(e) => setPrId(e.target.value)}
						disabled={prsQuery.isLoading}
						aria-label="PR"
					>
						<option value="">
							{prsQuery.isLoading ? "Loading PRs…" : "Select PR…"}
						</option>
						{/* "(Vicky) Victoria Tan Mei Lin" — the one payee formatter. This
						    option built `${p.name} (${p.nickname})` by hand: brackets on
						    the wrong half, halves in the wrong order, and a third spelling
						    of the same person inside one screen. */}
						{/* A PR who blocked this shift's date is shown but not
						    selectable — the assign would 409. Shown rather than hidden
						    so the agency can see WHY someone they expected is missing;
						    a name that silently vanishes reads as a data fault. */}
						{/* The travel note is a CAUTION, not a bar: the option stays
						    selectable. The agency knows things the distance model does not
						    — the two venues share a car park, the PR lives upstairs — and
						    the server takes the same view, warning rather than refusing.
						    A blocked DATE is different: that one the API would 409. */}
						{/* So is a FULL TIER, and it is the half this list never asked
						    about. The shift's seats are per tier, not one pool: a PR whose
						    bucket is already spoken for is refused however many seats the
						    shift has left overall, and the count beside the shift ("1/2")
						    says nothing about which tier the remaining one is for. */}
						{prs.map((p) => {
							const dateBlocked = blockedPrIds.has(p.id);
							const tierBlocked = tierBlockByPr.get(p.id);
							return (
								<option
									key={p.id}
									value={p.id}
									disabled={dateBlocked || Boolean(tierBlocked)}
								>
									{formatPayeeLabel(p.nickname, p.name)}
									{dateBlocked
										? " · unavailable that day"
										: tierBlocked
											? ` · ${fill(t.rosterGrid.noSeatLeft, {
													bucket: tierBlocked.bucket ?? t.rosterGrid.thisTier,
												})}`
											: (travelNoteByPr.get(p.id) ?? "")}
								</option>
							);
						})}
					</IzSelect>
				</div>

				{/* WHY THE BUTTON IS DEAD, said out loud. A disabled submit with two
				    filled-in boxes above it is the most confusing state this sheet can
				    reach — the operator has made both choices and the screen simply
				    stops responding — and it is reachable without touching a disabled
				    option, by another agency taking the last seat between two refetches
				    while the sheet sits open. */}
				{selectionBlock && (
					<p className="iz-tiny iz-muted2 mt-3">
						{shiftBlockLong(selectionBlock, t)}
					</p>
				)}

				{/* THE TIER CHECK COULD NOT RUN — see the same note in
				    RosterBackendTimetable. Every disabled option above is a promise
				    that the rest are assignable, and that promise rests on knowing
				    which tier each taken seat consumed; when the server's split does
				    not account for a cross-agency seat, it silently does not. */}
				{(staffingByShift.get(selectedShift?.id ?? "")?.unknown ?? 0) > 0 && (
					<p className="iz-tiny iz-muted2 mt-3 leading-snug">
						{fill(t.rosterGrid.tierSplitUnavailable, {
							n: staffingByShift.get(selectedShift?.id ?? "")?.unknown ?? 0,
						})}
					</p>
				)}

				{assign.isError && (
					<p className="iz-tiny mt-3 text-[var(--iz-danger,#dc2626)]">
						Couldn't assign the PR. Please try again.
					</p>
				)}

				<button
					type="submit"
					className="iz-btn iz-btn-primary mt-5 w-full"
					disabled={!isValid || assign.isPending}
				>
					{assign.isPending ? "Assigning…" : "Assign PR"}
				</button>

				<p className="iz-tiny iz-muted mt-3 flex items-center gap-1">
					<UserPlus className="h-3 w-3" />
					Schedules the PR onto the shift and adds a roster slot.
				</p>
			</form>
		</IzSheet>
	);
}
