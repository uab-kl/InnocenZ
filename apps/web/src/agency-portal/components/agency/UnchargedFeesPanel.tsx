import { IzCard } from "@agency-portal/components/iz/ui";
import { useAgencyUncharged } from "@agency-portal/hooks/use-agency-uncharged";
import { useStore } from "@agency-portal/lib/store";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { useState } from "react";
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
	weekLabel,
}: {
	canMark: boolean;
	weekStart?: string;
	weekEnd?: string;
	/** Human label for the selected week tab, e.g. "02 Aug – 08 Aug". */
	weekLabel?: string;
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
		isSealing,
		markCharged,
		sealWeek,
	} = useAgencyUncharged();
	const toast = useStore((s) => s.toast);
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
	const sealButton =
		canMark && weekStart && weekEnd ? (
			<button
				type="button"
				disabled={isSealing}
				onClick={(e) => {
					e.stopPropagation();
					// "0 recorded" is a real and common answer — a clean week, or one
					// already sealed. Saying so beats a button that appears to do
					// nothing.
					void sealWeek(weekStart, weekEnd)
						.then((res) => toast(res.message, "success"))
						.catch(() => toast(t.payroll.couldNotRecordPenalties, "warn"));
				}}
				className="rounded-lg border border-[var(--iz-line2)] px-2 py-1 text-[11px] font-semibold text-[var(--iz-txt)] disabled:opacity-60"
			>
				{/* Names the week it will seal. t.payroll.thisWeeksPenalties was a lie on
				    the Last Week tab: the button follows the tab, so on Last Week it
				    sealed 02–08 Aug while calling it "this week". */}
				{isSealing
					? t.payroll.recording
					: `${t.payroll.recordPenaltiesFor} ${weekLabel ?? t.payroll.thisWeekFallback}`}
			</button>
		) : null;

	/**
	 * Does this row belong to the week tab currently selected?
	 *
	 * The list itself is NOT week-filtered, deliberately — a fee left uncollected
	 * for three weeks is exactly the one worth surfacing, and filtering would
	 * hide it the moment it aged out of the cycle. But an unlabelled all-weeks
	 * list inside a week-tabbed page reads as "this week's", which is how the
	 * same RM 50 appeared to belong to both tabs. So the rows are SPLIT rather
	 * than filtered: the selected week first, everything older beneath it under
	 * its own heading.
	 */
	const inSelectedWeek = (rowWeekStart: string | null | undefined): boolean => {
		if (!weekStart || !weekEnd || !rowWeekStart) return false;
		const d = String(rowWeekStart).slice(0, 10);
		return d >= weekStart && d <= weekEnd;
	};

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
	if (count === 0) {
		return (
			<IzCard flat className="border-[var(--iz-line2)]">
				<div className="flex flex-wrap items-center gap-1.5">
					<b className="iz-tiny uppercase tracking-wide iz-muted">
						{t.payroll.unchargedPenaltiesFees}
					</b>
					<span className="iz-tiny iz-muted2">
						· {t.payroll.nothingOutstanding}
					</span>
					<span className="ml-auto">{sealButton}</span>
				</div>
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
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				className="flex w-full items-center gap-1.5 text-left"
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
				</span>
			</button>

			{open && (
				<>
					{/* This used to end "it does not edit the voucher" — true when the
					    action only stamped a row, and FALSE since it started writing the
					    deduction line. Copy describing the old behaviour is worse than no
					    copy: it tells Finance the voucher is untouched while money moves. */}
					<p className="iz-tiny iz-muted2 mt-2">
						Sealed when accepted, at the rules in force then. Adding one writes
						a deduction line onto that PR's voucher for the week the breach
						belongs to.
					</p>
					<p className="iz-tiny mt-1 text-[var(--iz-gold-l)]">
						⚠ Add penalties BEFORE sending the PV. A voucher already sent to the
						PR cannot take a new line — the charge stays outstanding here and
						has to wait for another week's voucher.
					</p>
					{sealButton && <div className="mt-2">{sealButton}</div>}

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
										<span className="iz-tiny iz-muted2 block">
											week {p.weekStart} – {p.weekEnd}
										</span>
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
						<details className="mt-3">
							<summary className="cursor-pointer iz-tiny uppercase tracking-wide iz-muted2">
								Carried over from other weeks · {olderCount} · RM{" "}
								{olderRm.toFixed(2)}
							</summary>
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
						</details>
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
