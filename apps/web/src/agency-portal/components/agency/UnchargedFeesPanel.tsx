import { IzCard } from "@agency-portal/components/iz/ui";
import { useAgencyPenaltyProposals } from "@agency-portal/hooks/use-agency-penalty-proposals";
import { useAgencyUncharged } from "@agency-portal/hooks/use-agency-uncharged";
import { useStore } from "@agency-portal/lib/store";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

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
	const pendingBlock =
		pending.length > 0 ? (
			<div className="mt-2 flex flex-col gap-1.5">
				<b className="iz-tiny uppercase tracking-wide iz-muted2">
					{t.payroll.notYetRecorded} · {pending.length} · RM{" "}
					{pendingRm.toFixed(2)}
				</b>
				{/* The heading above already says "Not yet recorded · 2 · RM 100.00",
				    and the button below says what pressing it does. A sentence
				    restating both was the third way of saying one thing. */}
				{pending.map((p) => (
					<div
						key={`${p.prId}-${p.ruleType}-${p.weekStart}`}
						className="rounded-lg border border-[var(--iz-line)] bg-[rgba(255,255,255,0.02)] p-2"
					>
						<span className="flex items-baseline justify-between gap-2">
							<b className="iz-sm text-[var(--iz-txt)]">{p.prName ?? "PR"}</b>
							<b className="iz-sm shrink-0 tabular-nums text-[var(--iz-gold-l)]">
								RM {Number(p.fineRm ?? 0).toFixed(2)}
							</b>
						</span>
						<span className="iz-tiny iz-muted2 block">
							{p.ruleType.replace(/_/g, " ")} · {p.detail}
						</span>
					</div>
				))}
			</div>
		) : null;

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
	const olderRm =
		olderPenalties.reduce((s, p) => s + Number(p.fineRm ?? 0), 0) +
		olderCancellations.reduce((s, c) => s + Number(c.feeRm ?? 0), 0);

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
					<b className="iz-tiny uppercase tracking-wide iz-muted">
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

	const toggle = (id: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

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
				className="flex w-full flex-wrap items-center gap-1.5 text-left"
			>
				<ChevronDown
					className={`h-3.5 w-3.5 shrink-0 text-[var(--iz-muted)] transition-transform ${
						open ? "" : "-rotate-90"
					}`}
				/>
				<AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[var(--iz-gold-l)]" />
				<b className="iz-tiny uppercase tracking-wide text-[var(--iz-gold-l)]">
					Uncharged penalties &amp; fees
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
			</button>

			{open && (
				<>
					{/* One line where there were three. What survived the cut is the only
			    sentence that changes what someone DOES: a voucher already sent
			    refuses the line, so the order of the two actions matters. How
			    sealing works was background — each row below already carries its
			    rule, its week and its amount. */}
					<p className="iz-tiny mt-1.5 text-[var(--iz-gold-l)]">
						⚠ Add these before sending the PV — a voucher already sent cannot
						take a new line.
					</p>
					{/* No standalone "record" button here — it travels with the list of
					    what it would charge, inside `pendingBlock`. */}
					{pendingBlock}

					{weekPenalties.length > 0 && (
						<div className="mt-2 flex flex-col gap-1.5">
							<b className="iz-tiny uppercase tracking-wide iz-muted2">
								Weekly penalties
							</b>
							{weekPenalties.map((p) => (
								<label
									key={p.chargeId}
									className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--iz-line)] bg-[rgba(255,255,255,0.02)] p-2"
								>
									<input
										type="checkbox"
										className="mt-1 shrink-0"
										checked={selectedCharges.has(p.chargeId)}
										onChange={() =>
											setSelectedCharges((prev) => {
												const next = new Set(prev);
												if (next.has(p.chargeId)) next.delete(p.chargeId);
												else next.add(p.chargeId);
												return next;
											})
										}
										disabled={!canMark}
									/>
									<span className="min-w-0 flex-1">
										<span className="flex items-baseline justify-between gap-2">
											<b className="iz-sm text-[var(--iz-txt)]">
												{p.prName ?? "PR"}
											</b>
											<b className="iz-sm shrink-0 tabular-nums text-[var(--iz-gold-l)]">
												RM {Number(p.fineRm ?? 0).toFixed(2)}
											</b>
										</span>
										<span className="iz-tiny iz-muted2 block">
											{p.ruleType.replace(/_/g, " ")} · {p.detail}
										</span>
										{/* No week line here — these rows ARE the selected week and
										    the tab above says which. It stays on the carried-over
										    rows, where the week is the whole point. */}
									</span>
								</label>
							))}
						</div>
					)}

					{weekCancellations.length > 0 && (
						<b className="iz-tiny uppercase tracking-wide iz-muted2 mt-3 block">
							Cancellation fees
						</b>
					)}
					<div className="mt-2 flex flex-col gap-1.5">
						{weekCancellations.map((c) => (
							<label
								key={c.assignmentId}
								className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--iz-line)] bg-[rgba(255,255,255,0.02)] p-2"
							>
								<input
									type="checkbox"
									className="mt-1 shrink-0"
									checked={selected.has(c.assignmentId)}
									onChange={() => toggle(c.assignmentId)}
									disabled={!canMark}
								/>
								<span className="min-w-0 flex-1">
									<span className="flex items-baseline justify-between gap-2">
										<b className="iz-sm text-[var(--iz-txt)]">
											{c.prName ?? "PR"}
										</b>
										<b className="iz-sm shrink-0 tabular-nums text-[var(--iz-gold-l)]">
											RM {Number(c.feeRm ?? 0).toFixed(2)}
										</b>
									</span>
									<span className="iz-tiny iz-muted2 block">
										{c.shiftDate ?? "—"}
										{c.slot ? ` · ${c.slot}` : ""}
										{c.outletName ? ` · ${c.outletName}` : ""}
									</span>
									{/* The evidence, not just the number: a fee is only
									    defensible if the band and the notice that produced it
									    are visible beside it. */}
									<span className="iz-tiny iz-muted2 block">
										{c.feePct ?? 0}% of RM{" "}
										{Number(c.dailyWageRm ?? 0).toFixed(2)}
										{c.noticeHours != null
											? ` · ${
													Number(c.noticeHours) < 0
														? "after start"
														: `${Number(c.noticeHours).toFixed(1)}h notice`
												}`
											: ""}
									</span>
									{c.reason && (
										<span className="iz-tiny iz-muted2 block italic">
											"{c.reason}"
										</span>
									)}
								</span>
							</label>
						))}
					</div>
					{/* Everything owed from OTHER weeks, kept visible but plainly
						    separated. Filtering it away would hide a fee that has gone
						    uncollected for a month — the one most worth chasing — while
						    leaving it unlabelled is what made the same RM 50 look like it
						    belonged to both the This Week and Last Week tabs. */}
					{olderCount > 0 && (
						<div className="mt-3">
							{/* Was a <details>. The oldest debt is the one most worth
							    chasing, and it was the one folded away by default. */}
							<b className="iz-tiny uppercase tracking-wide iz-muted2 block">
								Carried over from other weeks · {olderCount} · RM{" "}
								{olderRm.toFixed(2)}
							</b>
							<div className="mt-2 flex flex-col gap-1.5">
								{olderPenalties.map((p) => (
									<label
										key={p.chargeId}
										className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--iz-line)] bg-[rgba(255,255,255,0.02)] p-2"
									>
										<input
											type="checkbox"
											className="mt-1 shrink-0"
											checked={selectedCharges.has(p.chargeId)}
											onChange={() =>
												setSelectedCharges((prev) => {
													const next = new Set(prev);
													if (next.has(p.chargeId)) next.delete(p.chargeId);
													else next.add(p.chargeId);
													return next;
												})
											}
											disabled={!canMark}
										/>
										<span className="min-w-0 flex-1">
											<span className="flex items-baseline justify-between gap-2">
												<b className="iz-sm text-[var(--iz-txt)]">
													{p.prName ?? "PR"}
												</b>
												<b className="iz-sm shrink-0 tabular-nums text-[var(--iz-gold-l)]">
													RM {Number(p.fineRm ?? 0).toFixed(2)}
												</b>
											</span>
											<span className="iz-tiny iz-muted2 block">
												{p.ruleType.replace(/_/g, " ")} · {p.detail}
											</span>
											<span className="iz-tiny iz-muted2 block">
												week {p.weekStart} – {p.weekEnd}
											</span>
										</span>
									</label>
								))}
								{olderCancellations.map((c) => (
									<label
										key={c.assignmentId}
										className="flex cursor-pointer items-start gap-2 rounded-lg border border-[var(--iz-line)] bg-[rgba(255,255,255,0.02)] p-2"
									>
										<input
											type="checkbox"
											className="mt-1 shrink-0"
											checked={selected.has(c.assignmentId)}
											onChange={() => toggle(c.assignmentId)}
											disabled={!canMark}
										/>
										<span className="min-w-0 flex-1">
											<span className="flex items-baseline justify-between gap-2">
												<b className="iz-sm text-[var(--iz-txt)]">
													{c.prName ?? "PR"}
												</b>
												<b className="iz-sm shrink-0 tabular-nums text-[var(--iz-gold-l)]">
													RM {Number(c.feeRm ?? 0).toFixed(2)}
												</b>
											</span>
											<span className="iz-tiny iz-muted2 block">
												{String(c.shiftDate ?? "—").slice(0, 10)}
												{c.outletName ? ` · ${c.outletName}` : ""} ·{" "}
												{c.feePct ?? 0}% of RM{" "}
												{Number(c.dailyWageRm ?? 0).toFixed(2)}
											</span>
										</span>
									</label>
								))}
							</div>
						</div>
					)}

					{canMark && selected.size + selectedCharges.size > 0 && (
						<div className="mt-2 flex items-center justify-between gap-2">
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
