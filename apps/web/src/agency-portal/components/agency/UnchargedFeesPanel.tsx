import { IzCard } from "@agency-portal/components/iz/ui";
import { useAgencyPenaltyProposals } from "@agency-portal/hooks/use-agency-penalty-proposals";
import { useAgencyUncharged } from "@agency-portal/hooks/use-agency-uncharged";
import { useStore } from "@agency-portal/lib/store";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import type {
	PenaltyProposal,
	UnchargedCancellation,
	UnchargedPenalty,
} from "@/services/agency-uncharged";

/**
 * Money this agency is owed and has not billed — the Finance head's reference.
 *
 * Every fee here was SEALED when the PR cancelled, against the bands in force
 * at that moment, and none has been put on a voucher. Before migration 0116 the
 * PR app showed a cancellation charge that no code ever collected, so this list
 * did not merely go unread — it could not be computed.
 *
 * "Add to voucher" DOES move money: it writes a `deduction` line onto that PR's
 * voucher for the week the breach belongs to. It stays a deliberate press —
 * the same restraint overtime carries, because a charge that takes pay away
 * from a worker gets a human signature — but nothing here is a dry run.
 *
 * The list is NOT scoped to the selected week tab; rows for other weeks appear
 * under "Carried over". Filtering by week would hide the fee that has gone
 * uncollected longest, which is the one most worth chasing.
 */

/** Three-letter month, so a date reads as a date and not as an id. */
const MONTH = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

/**
 * "2–8 Aug", or "28 Jul – 3 Aug" when the week straddles a month.
 *
 * `week 2026-08-02 – 2026-08-08` was 25 characters of mostly-repeated digits on
 * a line of its own under every carried-over row. The ISO pair survives in the
 * cell's `title`, so nothing is lost to someone who needs the exact dates.
 */
function formatWeekRange(startIso: string, endIso: string): string {
	const s = String(startIso ?? "")
		.slice(0, 10)
		.split("-")
		.map(Number);
	const e = String(endIso ?? "")
		.slice(0, 10)
		.split("-")
		.map(Number);
	if (s.length !== 3 || e.length !== 3 || s.some(Number.isNaN)) {
		return String(startIso ?? "");
	}
	return s[0] === e[0] && s[1] === e[1]
		? `${s[2]}–${e[2]} ${MONTH[e[1] - 1]}`
		: `${s[2]} ${MONTH[s[1] - 1]} – ${e[2]} ${MONTH[e[1] - 1]}`;
}

/** "Sat 16 Aug" — the night the shift was, not a database value. */
function formatShiftDay(iso: string | null): string {
	if (!iso) return "—";
	const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
	if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
	return d.toLocaleDateString("en-GB", {
		weekday: "short",
		day: "numeric",
		month: "short",
	});
}

/**
 * ONE ROW SHAPE for every kind of money on this panel.
 *
 * Weekly penalties, cancellation fees and not-yet-recorded proposals were three
 * near-identical blocks of JSX, repeated five times between them — and they had
 * already drifted apart (the carried-over copies print a week line the in-week
 * ones do not). Reading them as one shape is what lets the panel lay them out
 * as one ledger: name, what it is for, when, how much, aligned down the page.
 */
type FeeRow = {
	id: string;
	name: string;
	/** What the money is FOR — the rule broken, or the shift dropped. */
	detail: string;
	/**
	 * HOW IT WAS PRICED. Kept beside the figure rather than dropped: a fee is
	 * only defensible if the band and the notice that produced it are visible.
	 */
	basis?: string;
	/** The PR's own words when they cancelled. */
	note?: string;
	/** WHEN it happened: the week for a penalty, the night for a cancellation. */
	when?: string;
	/** The unabbreviated form, for the hover — `2–8 Aug` loses the year. */
	whenTitle?: string;
	amountRm: number;
	/** Absent = this row cannot be selected (a proposal has no charge to add). */
	onToggle?: () => void;
	checked?: boolean;
};

/**
 * One fee, on ONE LINE.
 *
 * It was a bordered card three lines tall with the name at the far left and the
 * amount at the far right, so at portal width each row spent about a quarter of
 * itself on content and the rest on air — three fees filled the screen. The
 * columns are fixed-width so names, reasons and figures line up down the page,
 * which is what makes a column of money scannable at all.
 *
 * Truncation is deliberate and safe: the row's full text is on its `title`, so
 * a long outlet name is shortened on screen, never lost.
 */
function FeeLine({ row, canSelect }: { row: FeeRow; canSelect: boolean }) {
	const selectable = Boolean(row.onToggle);
	const detail = [row.detail, row.basis, row.note].filter(Boolean).join(" · ");
	/* Everything RIGHT of the checkbox. The checkbox itself is written inline in
	   the label below rather than hoisted in here with the rest: a11y linting
	   reads the JSX, and an <input> reached through a variable is an <input> it
	   cannot see, so a label holding one would be flagged as holding none. */
	const cells = (
		<>
			<b className="iz-sm w-20 shrink-0 truncate text-[var(--iz-txt)] sm:w-28">
				{row.name}
			</b>
			<span className="iz-tiny iz-muted2 min-w-0 flex-1 truncate">
				{detail}
			</span>
			{/* WHEN, on every row — a fixed column rather than a line of its own
			    under the ones that happened to carry it. A ledger repeats the date
			    on every line for the same reason a bank statement does: it is what
			    you scan for, and it is what was filling the right of the row with
			    nothing. */}
			<span
				className="iz-tiny iz-muted2 w-[6.5rem] shrink-0 text-right tabular-nums"
				title={row.whenTitle}
			>
				{row.when ?? ""}
			</span>
			<b className="iz-sm w-[5.5rem] shrink-0 text-right tabular-nums text-[var(--iz-gold-l)]">
				RM {row.amountRm.toFixed(2)}
			</b>
		</>
	);

	// Selection has to survive the loss of the card outline: the tint is what
	// says "this one is going on the voucher" from across the list.
	const className = `flex items-center gap-2 px-1 py-1.5 ${
		row.checked ? "bg-[rgba(201,155,78,0.10)]" : ""
	}`;

	// A <label> with no control inside it is a lie to a screen reader, so an
	// unselectable row is a plain row.
	return selectable ? (
		<label
			className={`${className} cursor-pointer hover:bg-[rgba(255,255,255,0.03)]`}
			title={`${row.name} · ${detail}`}
		>
			<input
				type="checkbox"
				className="h-3.5 w-3.5 shrink-0"
				checked={row.checked ?? false}
				onChange={row.onToggle}
				disabled={!canSelect}
			/>
			{cells}
		</label>
	) : (
		<div className={className} title={`${row.name} · ${detail}`}>
			{/* The column still exists on an unselectable row: without it every name
			    in that group would sit 22px left of the names above it. */}
			<span className="h-3.5 w-3.5 shrink-0" aria-hidden />
			{cells}
		</div>
	);
}

/**
 * A titled run of fees, with its own subtotal on the heading line.
 *
 * The subtotal used to exist on "Carried over" alone, so the two groups above
 * it could only be added up by hand. It costs no vertical space — the heading
 * row was already there.
 */
function FeeGroup({
	title,
	rows,
	canSelect,
}: {
	title: ReactNode;
	rows: FeeRow[];
	canSelect: boolean;
}) {
	if (rows.length === 0) return null;
	const total = rows.reduce((sum, r) => sum + r.amountRm, 0);
	/*
	 * EVERY group takes the two-column grid, including a group of ONE (owner,
	 * 26 Aug 2026).
	 *
	 * It first bounded a lone fee to a single column, on the reasoning that one
	 * row across half the width with a hole beside it is the same emptiness with
	 * a harder edge. On screen that was worse: the last group's rows ended at a
	 * different x than the group above it and its subtotal sat at a different
	 * right edge, so the panel looked like two layouts stacked. One grid for
	 * every group — the column a fee lands in is the only thing that varies.
	 */
	return (
		/*
		 * BOUNDED, not full-bleed. Stretched across a 1600px portal the amount
		 * column ended up a thousand pixels from the text it belonged to, and a
		 * gap that size inside one row reads as a rendering fault rather than as
		 * a column. Whitespace to the RIGHT of a finished block reads as
		 * deliberate; the heading's subtotal is bounded with it, so the ledger has
		 * one right edge instead of two.
		 */
		/*
		 * Bounded below `xl`, full width from `xl` up, where the second column
		 * starts. 62rem halved would leave each row too narrow for the reason to
		 * survive, so the cap and the second column change at the same moment.
		 *
		 * ⚠️ Static string, deliberately. When this was
		 * `` `…max-w-[62rem]${twoUp ? …}` `` Tailwind v4's scanner dropped the
		 * class entirely — an arbitrary value glued to an interpolation emits no
		 * rule at all — and nothing failed: the class was in the markup and did
		 * nothing. Classes ending in a letter or digit survive that position,
		 * which is what makes it easy to miss.
		 */
		<div className="mt-2.5 max-w-[62rem] xl:max-w-none">
			<div className="flex items-baseline justify-between gap-2 pb-1">
				<b className="iz-tiny iz-muted2 uppercase tracking-wide">{title}</b>
				<span className="iz-tiny iz-muted2 shrink-0 tabular-nums">
					{rows.length} · RM {total.toFixed(2)}
				</span>
			</div>
			{/*
			 * TWO COLUMNS from `xl` up, one below it.
			 *
			 * A single bounded column left a portal-width screen two-thirds empty;
			 * two columns spend that width on fees instead, and halve the height of
			 * a long list. The cap comes off at the same breakpoint — 62rem split
			 * in two would leave each row too narrow for the reason to survive.
			 *
			 * Hairlines, not a box per row: a card each cost two borders and 8px of
			 * padding per fee, and made a list of six read as six panels. The rule
			 * is a `border-t` on EVERY cell rather than `divide-y`, which skips its
			 * first child — in a grid that is the top-LEFT cell only, so row one
			 * would come out with a rule over its right half and none over its
			 * left. With border-t on all of them the rules line up across both
			 * columns and the one under the heading is the first row's own.
			 */}
			<div className="grid [&>*]:border-t [&>*]:border-[var(--iz-line)] xl:grid-cols-2 xl:gap-x-10">
				{rows.map((row) => (
					<FeeLine key={row.id} row={row} canSelect={canSelect} />
				))}
			</div>
		</div>
	);
}

export function UnchargedFeesPanel({
	canMark,
	weekStart,
	weekEnd,
}: {
	canMark: boolean;
	/*
	 * There is no `canRecord` any more. It existed for the Payment Week tab —
	 * vouchers already signed and queued to pay, which cannot take another line —
	 * and left behind a panel whose every action was disabled. That is not
	 * information, it is furniture: the payroll page now simply does not mount
	 * this on that tab.
	 */
	weekStart?: string;
	weekEnd?: string;
	/*
	 * `weekLabel` went with the button. It existed only to name the week the
	 * seal would cover, and a label with nothing left to label is decoration.
	 */
}) {
	const { t } = usePortalLocale();
	const {
		backed,
		cancellations,
		penalties,
		cancellationsRm,
		penaltiesRm,
		totalRm,
		count,
		isLoading,
		isError,
		isMarking,
		markCharged,
	} = useAgencyUncharged();
	/*
	 * Who is in breach, computed server-side and read-only.
	 *
	 * The list below it holds SEALED charges — rows that exist only after someone
	 * presses "record". So until that press, a week with real breaches in it read
	 * "nothing outstanding", and the only way to find out otherwise was to take
	 * the one action that also creates the debt. Looking should not require
	 * committing: proposals are a GET, so they are simply shown.
	 */
	const proposalWeek = useMemo(
		() => (weekStart && weekEnd ? { weekStart, weekEnd } : undefined),
		[weekStart, weekEnd],
	);
	const {
		proposals,
		isLoading: proposalsLoading,
		isError: proposalsError,
	} = useAgencyPenaltyProposals(proposalWeek);
	/**
	 * Does this row belong to the week tab currently selected?
	 *
	 * Declared up here because the proposal list needs it too — see `pending`.
	 */
	const inSelectedWeek = (rowWeekStart: string | null | undefined): boolean => {
		if (!weekStart || !weekEnd || !rowWeekStart) return false;
		const d = String(rowWeekStart).slice(0, 10);
		return d >= weekStart && d <= weekEnd;
	};

	/*
	 * Exactly what THIS tab's "record" would charge, and nothing else.
	 *
	 * Two filters, each for its own reason. Not sealed: a sealed proposal is
	 * already a charge and appears below under its own heading. In the selected
	 * week: for a week still RUNNING the backend answers with the PREVIOUS
	 * week's minimum-shifts — a preview this tab's seal cannot record, because
	 * "1 of 3 shifts" is not a verdict until the week closes. Left in, it would
	 * be a fine visible on two tabs and recordable on only one; the tab that
	 * owns the week shows it, and can act on it.
	 */
	const pending = proposals.filter(
		(p) => !p.sealed && inSelectedWeek(p.weekStart),
	);
	const pendingRm = pending.reduce((n, p) => n + Number(p.fineRm ?? 0), 0);

	const toast = useStore((s) => s.toast);
	/* Open by default. A panel about money owed and not billed should never need
	   a click to admit it has contents; collapsing it is a choice the operator
	   makes after reading, not a state it starts in. */
	const [open, setOpen] = useState(true);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [selectedCharges, setSelectedCharges] = useState<Set<string>>(
		new Set(),
	);

	const toggle = (id: string) =>
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	const toggleCharge = (id: string) =>
		setSelectedCharges((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	/* The three adapters — the ONLY place each kind of fee decides how it reads.
	   Everything below lays rows out; nothing below knows what a cancellation is. */
	const penaltyRow = (p: UnchargedPenalty): FeeRow => ({
		id: p.chargeId,
		name: p.prName ?? "PR",
		detail: `${p.ruleType.replace(/_/g, " ")} · ${p.detail}`,
		// On EVERY row, including this week's. It was carried-over only, on the
		// reasoning that the tab above already names the week — true, and it still
		// left the column blank on two rows out of three and the week itself
		// unstated beside the fine it produced.
		when: formatWeekRange(p.weekStart, p.weekEnd),
		whenTitle: `week ${p.weekStart} – ${p.weekEnd}`,
		amountRm: Number(p.fineRm ?? 0),
		checked: selectedCharges.has(p.chargeId),
		onToggle: () => toggleCharge(p.chargeId),
	});

	const cancellationRow = (c: UnchargedCancellation): FeeRow => ({
		id: c.assignmentId,
		name: c.prName ?? "PR",
		// The night moves to the `when` column, where the penalty weeks are, so
		// one column answers "when" for both kinds of money instead of the date
		// hiding at the head of a sentence on one of them.
		when: formatShiftDay(c.shiftDate),
		whenTitle: String(c.shiftDate ?? ""),
		detail:
			[c.slot, c.outletName].filter(Boolean).join(" · ") || "cancelled shift",
		basis: `${c.feePct ?? 0}% of RM ${Number(c.dailyWageRm ?? 0).toFixed(2)}${
			c.noticeHours != null
				? Number(c.noticeHours) < 0
					? " · after start"
					: ` · ${Number(c.noticeHours).toFixed(1)}h notice`
				: ""
		}`,
		note: c.reason ? `"${c.reason}"` : undefined,
		amountRm: Number(c.feeRm ?? 0),
		checked: selected.has(c.assignmentId),
		onToggle: () => toggle(c.assignmentId),
	});

	/* A proposal carries NO chargeId, so there is nothing for "Add to voucher" to
	   add — it is shown, not selectable. See the sealing note below. */
	const proposalRow = (p: PenaltyProposal): FeeRow => ({
		id: `${p.prId}-${p.ruleType}-${p.weekStart}`,
		name: p.prName ?? "PR",
		detail: `${p.ruleType.replace(/_/g, " ")} · ${p.detail}`,
		amountRm: Number(p.fineRm ?? 0),
	});

	// A demo session has no real agency, so there is nothing truthful to show.
	if (!backed || isLoading) return null;
	if (isError) {
		return (
			<IzCard flat className="border-[var(--iz-line2)]">
				<p className="iz-sm text-[var(--iz-red,#e5484d)]">
					Could not load uncharged fees — the agency uncharged endpoint failed.
				</p>
			</IzCard>
		);
	}
	/*
	 * There is no "record penalties" button here any more (owner, 24 Aug).
	 *
	 * It was the last control on the panel that asked to be pressed before it
	 * would tell you anything, and it kept reading as the way to SEE penalties
	 * even after the list started showing them. The list IS the answer.
	 *
	 * ⚠️ It was also the ONLY caller of POST /agency/:id/penalties/seal in the
	 * whole web app, so nothing turns a proposal into a penalty_charge row now —
	 * and "Add to voucher" needs a chargeId, which only sealing creates. The
	 * "Not yet recorded" rows below are therefore read-only until sealing gets a
	 * home: folded into "Add to voucher", or moved to Manage PR. The hook's
	 * `sealWeek` and the service call are left in place for whichever it becomes.
	 */

	/*
	 * Breaches the backend can already see, shown without asking for anything.
	 *
	 * Read-only on purpose: these are not debts yet. "Record" is what turns them
	 * into penalty_charge rows, and that stays a deliberate press — but deciding
	 * whether to press it requires seeing what it would charge, which is exactly
	 * what was missing.
	 */
	const pendingBlock = (
		<FeeGroup
			title={t.payroll.notYetRecorded}
			rows={pending.map(proposalRow)}
			canSelect={false}
		/>
	);

	/*
	 * The SEALED lists below are NOT week-filtered the way `pending` is — a fee
	 * left uncollected for three weeks is exactly the one worth surfacing, and
	 * filtering would hide it the moment it aged out of the cycle. But an
	 * unlabelled all-weeks list inside a week-tabbed page reads as "this
	 * week's", which is how the same RM 50 appeared to belong to both tabs. So
	 * those rows are SPLIT rather than filtered: the selected week first,
	 * everything older beneath it under its own heading.
	 */
	const weekPenalties = penalties.filter((p) => inSelectedWeek(p.weekStart));
	const olderPenalties = penalties.filter((p) => !inSelectedWeek(p.weekStart));
	const weekCancellations = cancellations.filter((c) =>
		inSelectedWeek(c.shiftDate),
	);
	const olderCancellations = cancellations.filter(
		(c) => !inSelectedWeek(c.shiftDate),
	);
	const olderCount = olderPenalties.length + olderCancellations.length;

	// Nothing outstanding is a real, good answer. Say it rather than rendering an
	// empty card that reads as broken.
	/* Nothing BILLED is not the same as nothing HAPPENING. This branch used to
	   say "nothing outstanding" and stop, which is what made an unrecorded week
	   indistinguishable from a clean one. */
	/* Is there anything for the chevron to reveal here? A truly clean week has
	   only the one-line header, and offering a control that opens onto nothing
	   is the empty-toggle version of the bug this panel already fixed once. */
	const hasEmptyStateBody = proposalsError || pending.length > 0;
	if (count === 0) {
		return (
			<IzCard flat className="border-[var(--iz-line2)]">
				{/* The same header control as the populated card, so the panel does not
				    change its nature between a clean week and a busy one. The chevron
				    dims and goes inert when there is genuinely nothing beneath it —
				    a toggle that reveals nothing is worse than no toggle at all. */}
				<button
					type="button"
					onClick={() => setOpen((v) => !v)}
					aria-expanded={hasEmptyStateBody ? open : undefined}
					disabled={!hasEmptyStateBody}
					className="flex w-full flex-wrap items-center gap-1.5 text-left"
				>
					<ChevronDown
						className={`h-3.5 w-3.5 shrink-0 transition-transform ${
							hasEmptyStateBody
								? `text-[var(--iz-muted)] ${open ? "" : "-rotate-90"}`
								: "text-[var(--iz-muted)] opacity-25"
						}`}
					/>
					<b className="iz-tiny iz-muted uppercase tracking-wide">
						{t.payroll.unchargedPenaltiesFees}
					</b>
					{/* The headline number, not just a word. "nothing billed yet" alone
					    was technically true of a week carrying RM 150 of unrecorded
					    breaches, and read like a clean one at a glance. */}
					<span className="iz-tiny iz-muted2">
						·{" "}
						{proposalsLoading
							? t.payroll.checkingPenalties
							: pending.length > 0
								? `${t.payroll.nothingBilledYet} · ${pending.length} · RM ${pendingRm.toFixed(2)}`
								: t.payroll.nothingOutstanding}
					</span>
				</button>
				{open &&
					(proposalsError ? (
						<p className="iz-tiny iz-muted2 mt-1">
							{t.payroll.couldNotLoadPenalties}
						</p>
					) : (
						pendingBlock
					))}
			</IzCard>
		);
	}

	const selectedTotal =
		cancellations
			.filter((c) => selected.has(c.assignmentId))
			.reduce((sum, c) => sum + Number(c.feeRm ?? 0), 0) +
		penalties
			.filter((p) => selectedCharges.has(p.chargeId))
			.reduce((sum, p) => sum + Number(p.fineRm ?? 0), 0);

	return (
		<IzCard flat className="border-[var(--iz-line2)]">
			{/* One dropdown for the whole card, open by default — and the only one
			    left. The inner "Carried over" <details> stays gone: a disclosure
			    nested in a disclosure put the oldest debt two clicks deep. Collapsing
			    is now the operator's choice; it was the panel's before. */}
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				className="flex w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 text-left"
			>
				<ChevronDown
					className={`h-3.5 w-3.5 shrink-0 text-[var(--iz-muted)] transition-transform ${
						open ? "" : "-rotate-90"
					}`}
				/>
				<AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[var(--iz-gold-l)]" />
				<b className="iz-tiny uppercase tracking-wide text-[var(--iz-gold-l)]">
					{t.payroll.unchargedPenaltiesFees}
				</b>
				<span className="iz-tiny iz-muted2">
					· {count} not yet billed · RM {totalRm} outstanding
					{penalties.length > 0 && cancellations.length > 0
						? ` (RM ${penaltiesRm} weekly + RM ${cancellationsRm} cancellations)`
						: ""}
					{/* Sealed and unrecorded are different debts. Summing only the
					    sealed ones here hid the half nobody had accepted yet. */}
					{pending.length > 0
						? ` · ${t.payroll.notYetRecorded}: ${pending.length} · RM ${pendingRm.toFixed(2)}`
						: ""}
				</span>
				{/* The one sentence that changes what somebody DOES — a voucher already
				    sent refuses the line, so the order of the two actions matters. It
				    rides on the header rather than taking a row of its own: it is a
				    standing condition, not news, and it was costing a full line above
				    a list whose whole problem was vertical space. */}
				<span className="iz-tiny ml-auto shrink-0 text-[var(--iz-gold-l)]">
					⚠ Add these before sending the PV
				</span>
			</button>

			{open && (
				<>
					{/* No standalone "record" button here — it travels with the list of
					    what it would charge, inside `pendingBlock`. */}
					{pendingBlock}

					<FeeGroup
						title={t.payroll.weeklyPenalties}
						rows={weekPenalties.map(penaltyRow)}
						canSelect={canMark}
					/>

					<FeeGroup
						title={t.payroll.cancellationFees}
						rows={weekCancellations.map(cancellationRow)}
						canSelect={canMark}
					/>

					{/* Everything owed from OTHER weeks, kept visible but plainly
					    separated. Filtering it away would hide a fee that has gone
					    uncollected for a month — the one most worth chasing — while
					    leaving it unlabelled is what made the same RM 50 look like it
					    belonged to both the This Week and Last Week tabs.
					    Was a <details>: the oldest debt is the one most worth chasing,
					    and it was the one folded away by default. */}
					{olderCount > 0 && (
						<FeeGroup
							title={t.payroll.carriedOverFromOtherWeeks}
							rows={[
								...olderPenalties.map(penaltyRow),
								...olderCancellations.map(cancellationRow),
							]}
							canSelect={canMark}
						/>
					)}

					{canMark && selected.size + selectedCharges.size > 0 && (
						<div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--iz-line)] pt-2">
							<span className="iz-tiny iz-muted2">
								{selected.size + selectedCharges.size} selected · RM{" "}
								{selectedTotal.toFixed(2)}
							</span>
							<button
								type="button"
								disabled={isMarking}
								onClick={() => {
									// Always report the outcome. The most important case is
									// the SILENT one: a voucher already sent refuses the line,
									// the row stays outstanding, and without this the operator
									// sees the list simply not change and assumes it worked.
									void markCharged(
										{
											assignmentIds: [...selected],
											chargeIds: [...selectedCharges],
										},
										null,
									)
										.then((res) => {
											const d = res?.data as
												| { charged?: number; failed?: { reason: string }[] }
												| null
												| undefined;
											const failed = d?.failed ?? [];
											if ((d?.charged ?? 0) > 0 && failed.length === 0) {
												toast(res.message, "success");
											} else if ((d?.charged ?? 0) > 0) {
												toast(
													`${res.message} · ${failed[0]?.reason ?? ""}`,
													"warn",
												);
											} else {
												toast(
													failed[0]?.reason ?? t.payroll.nothingWasAdded,
													"warn",
												);
											}
											setSelected(new Set());
											setSelectedCharges(new Set());
										})
										.catch(() => toast(t.payroll.couldNotAddToVoucher, "warn"));
								}}
								className="rounded-lg border border-[var(--iz-line2)] px-2.5 py-1.5 text-xs font-semibold text-[var(--iz-txt)] disabled:opacity-60"
							>
								{isMarking ? t.payroll.adding : t.payroll.addToVoucher}
							</button>
						</div>
					)}
				</>
			)}
		</IzCard>
	);
}
