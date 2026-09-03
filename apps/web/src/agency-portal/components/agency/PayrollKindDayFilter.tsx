import {
	type KindSelection,
	MONEY_KINDS,
	type MoneyKind,
	toggleKind,
	weekDays,
} from "@agency-portal/lib/payroll-kind-day";
import { useMemo } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { weekdayShortLabel } from "@/lib/portal-i18n/date-label";

/**
 * WHICH MONEY, ON WHICH NIGHT — the Payroll page's second filter, drawn once and
 * rendered by both the Receipts feed and the Dispute queue.
 *
 * Owner, 3 Sep 2026: *"in the agency payroll page receipt and the disputes
 * section make the user can see and select the drinks or tips or both on which
 * date"*.
 *
 * Two rows, because they are two different questions and collapsing them into
 * one dropdown would hide the answer to both:
 *
 *   Show  [ Drinks (2) ] [ Tips (3) ]                          Clear
 *   Day   [ All days (5) ] [ Sun 30 – ] … [ Thu 3 (5) ] [ Fri 4 – ]
 *
 * The bucket chips TOGGLE and the day chips CHOOSE, and the shapes say so: two
 * independent switches against a row with exactly one on. That is what makes
 * "or both" expressible — neither on means no filter at all, one means that
 * bucket, and both means drinks and tips but NOT wages, which is a question the
 * screen could not previously be asked.
 *
 * ## The counts are cross-faceted, and that is load-bearing
 *
 * Each row's counts are computed with the OTHER row's choice applied but not its
 * own — the panels do this, since only they know their own status chips and
 * search. Apply a facet to its own counts and every chip reads (0) the moment
 * you pick one; apply neither and a chip promising (2) opens an empty list. Both
 * are the same defect this codebase keeps naming: a count that disagrees with
 * the list under it reads as data that vanished on click.
 */

export interface PayrollKindDayFilterProps {
	weekStartIso: string;
	weekEndIso: string;
	kinds: KindSelection;
	/** `null` = every day of the week. */
	day: string | null;
	onKindsChange: (next: MoneyKind[]) => void;
	onDayChange: (next: string | null) => void;
	/** Rows in each bucket, with the DAY choice applied but not the bucket one. */
	kindCounts: Record<MoneyKind, number>;
	/** Rows per `yyyy-MM-dd`, with the BUCKET choice applied but not the day one. */
	dayCounts: Record<string, number>;
	/** Rows across the whole week under the bucket choice — the "All days" count. */
	allDaysCount: number;
	/**
	 * The feed carries no `kind` on any line, so the two bucket chips cannot mean
	 * anything. Offered as a stated refusal rather than an absence — see below.
	 */
	kindsUnavailable?: boolean;
}

const CHIP = "iz-filter-chip !gap-1 !px-2.5 !py-1 !text-[11px]";

export function PayrollKindDayFilter({
	weekStartIso,
	weekEndIso,
	kinds,
	day,
	onKindsChange,
	onDayChange,
	kindCounts,
	dayCounts,
	allDaysCount,
	kindsUnavailable = false,
}: PayrollKindDayFilterProps) {
	const { t } = usePortalLocale();
	const days = useMemo(
		() => weekDays(weekStartIso, weekEndIso),
		[weekStartIso, weekEndIso],
	);
	const dirty = kinds.length > 0 || day !== null;

	return (
		<div className="mt-2 rounded-xl border border-[var(--iz-line)] bg-[var(--iz-bg2)]/60 p-2">
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="iz-tiny iz-muted w-9 shrink-0">
					{t.payroll.showMoney}
				</span>
				{MONEY_KINDS.map((kind) => {
					const on = kinds.includes(kind);
					return (
						<button
							key={kind}
							type="button"
							className={`${CHIP}${on ? " on" : ""}`}
							aria-pressed={on}
							disabled={kindsUnavailable}
							onClick={() => onKindsChange(toggleKind(kinds, kind))}
						>
							{/* The `money` namespace, not a private spelling: the PR argued
							    about this bucket using these words on their phone, and the
							    agency has to be reading the same one. */}
							{t.money[kind]}
							<span className="iz-filter-chip__count">
								({kindCounts[kind]})
							</span>
						</button>
					);
				})}
				{/* An absent chip explains nothing — the codebase's rule for every
				    button a rule removes. Against a backend that predates `line.kind`
				    both chips would silently match nothing, and the screen would read
				    as a week with no drinks and no tips rather than as a build that
				    cannot tell them apart. */}
				{kindsUnavailable && (
					<span className="iz-tiny iz-muted2">{t.payroll.kindUnlabelled}</span>
				)}
				{dirty && (
					<button
						type="button"
						className="iz-tiny ml-auto text-[var(--iz-gold-l)]"
						onClick={() => {
							onKindsChange([]);
							onDayChange(null);
						}}
					>
						{t.payroll.clearSelection}
					</button>
				)}
			</div>

			<div className="mt-1.5 flex flex-wrap items-center gap-1.5">
				<span className="iz-tiny iz-muted w-9 shrink-0">{t.table.day}</span>
				<button
					type="button"
					className={`${CHIP}${day === null ? " on" : ""}`}
					aria-pressed={day === null}
					onClick={() => onDayChange(null)}
				>
					{t.payroll.allDays}
					<span className="iz-filter-chip__count">({allDaysCount})</span>
				</button>
				{days.map((iso) => {
					const count = dayCounts[iso] ?? 0;
					const on = day === iso;
					// UTC, matching `weekDays`. `new Date("2026-09-03")` is parsed as
					// midnight UTC and read back in LOCAL time, which lands on the
					// previous day everywhere west of Greenwich and would label the whole
					// strip one night early.
					const at = new Date(`${iso}T00:00:00Z`);
					return (
						<button
							key={iso}
							type="button"
							// Empty nights stay on the row, greyed. Dropping them would
							// re-flow the strip on every toggle, and "nothing happened on
							// Tuesday" is an answer worth being able to read.
							className={`${CHIP}${on ? " on" : ""}${
								count === 0 ? " opacity-40" : ""
							}`}
							aria-pressed={on}
							disabled={count === 0}
							title={count === 0 ? t.payroll.nothingLoggedThatDay : undefined}
							onClick={() => onDayChange(on ? null : iso)}
						>
							{weekdayShortLabel(at.getUTCDay(), t)} {at.getUTCDate()}
							<span className="iz-filter-chip__count">
								{count === 0 ? "–" : `(${count})`}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
