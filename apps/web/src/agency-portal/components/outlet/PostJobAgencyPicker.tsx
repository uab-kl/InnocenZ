import { useOutletAgencyLinks } from "@agency-portal/hooks/use-outlet-agency-links";
import { cn } from "@agency-portal/lib/utils";
import { Building2, Check } from "lucide-react";
import { useMemo } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

/**
 * Which agencies this job goes to (`shift_agency`, migration 0124).
 *
 * SHARED fulfilment, not a race: every ticked agency may send PRs to the same
 * shift until the headcount is met. Ticking three agencies for an 8-slot shift
 * does not create 24 slots — it means three rosters can fill the same 8.
 *
 * Only APPROVED links are offered. A pending request is not permission, so
 * listing it here would invite the operator to post into a void; the server
 * would drop it anyway, and a silently-dropped agency is worse than one that
 * was never offered.
 */
export function PostJobAgencyPicker({
	outletId,
	value,
	onChange,
}: {
	outletId?: string | null;
	/** Selected agency ids. Empty means "every approved agency" — the server reads it the same way. */
	value: string[];
	onChange: (agencyIds: string[]) => void;
}) {
	const { t } = usePortalLocale();
	// The SHARED hook, not a private query: the Post button and the Today banner
	// gate on the same thing, and three copies of "is there an approved agency"
	// is three chances for them to disagree.
	const { approved, isLoading } = useOutletAgencyLinks(outletId);

	/**
	 * What is actually selected, DERIVED rather than synced into state.
	 *
	 * An empty `value` already means "every approved agency" to the server, so
	 * seeding state through an effect would only restate a default the backend
	 * holds anyway — and an effect that calls `onChange` on mount fights the
	 * parent for ownership of the value.
	 *
	 * The filter matters on its own: an agency can unlink between opening this
	 * form and posting, and a stale id would ride along in the request to be
	 * discarded server-side, leaving the operator believing they posted to an
	 * agency that never heard about it.
	 */
	const selected = useMemo(() => {
		const ids = approved.map((a) => a.agencyId);
		return value.length === 0 ? ids : value.filter((id) => ids.includes(id));
	}, [approved, value]);

	if (isLoading) {
		return <p className="iz-tiny iz-muted">{t.agencyLinks.loading}</p>;
	}

	if (approved.length === 0) {
		return (
			<p className="iz-tiny rounded-lg border border-dashed border-amber-300/40 bg-amber-300/5 px-2.5 py-2 text-amber-300">
				{t.postJob.noApprovedAgencyYet}
			</p>
		);
	}

	const toggle = (agencyId: string) => {
		const next = selected.includes(agencyId)
			? selected.filter((id) => id !== agencyId)
			: [...selected, agencyId];
		// Never allow zero: an empty list means "all approved" to the server, so
		// unticking the last one would post to EVERYBODY — the exact opposite of
		// what the operator just asked for. The last remaining row is disabled
		// rather than silently refusing the click, so the rule is visible instead
		// of feeling like the checkbox is broken.
		if (next.length === 0) return;
		onChange(next);
	};

	const allSelected = selected.length === approved.length;

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-baseline justify-between gap-2">
				<p className="iz-tiny iz-muted">
					{approved.length === 1
						? t.postJob.onlyAgency
						: t.postJob.chooseWhoCanFill}
				</p>
				{/* Only worth offering once there is something to restore, and only
				    when there is more than one agency to restore it to. */}
				{approved.length > 1 && !allSelected && (
					<button
						type="button"
						className="iz-tiny shrink-0 underline decoration-dotted underline-offset-2 hover:text-[var(--iz-gold)]"
						onClick={() => onChange(approved.map((a) => a.agencyId))}
					>
						{t.postJob.selectAll}
					</button>
				)}
			</div>

			<div className="flex flex-col gap-1.5">
				{approved.map((link) => {
					const on = selected.includes(link.agencyId);
					// Unticking this one would leave nothing selected.
					const isLastSelected = on && selected.length === 1;
					return (
						<button
							key={link.id}
							type="button"
							aria-pressed={on}
							disabled={isLastSelected}
							title={
								isLastSelected
									? t.postJob.atLeastOneAgency
									: on
										? fill(t.postJob.dontSendTo, { name: link.agencyName })
										: fill(t.postJob.alsoSendTo, { name: link.agencyName })
							}
							onClick={() => toggle(link.agencyId)}
							className={cn(
								"flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
								on
									? "border-[var(--iz-gold)]/50 bg-[var(--iz-gold)]/10"
									: "border-[var(--iz-line)] hover:border-[var(--iz-gold)]/40",
								isLastSelected && "cursor-not-allowed opacity-80",
							)}
						>
							{/* A real tick box, not a coloured pill. Two selected pills side
							    by side are indistinguishable from two static labels, which is
							    why this control read as a status line and nobody could tell
							    the agencies were choosable at all. */}
							<span
								className={cn(
									"grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors",
									on
										? "border-[var(--iz-gold)] bg-[var(--iz-gold)] text-black"
										: "border-[var(--iz-line)]",
								)}
							>
								{on && <Check className="h-3 w-3" strokeWidth={3} />}
							</span>
							<Building2 className="iz-muted h-3.5 w-3.5 shrink-0" />
							<span className="iz-tiny min-w-0 flex-1 truncate font-medium">
								{link.agencyName}
							</span>
						</button>
					);
				})}
			</div>

			<p className="iz-tiny iz-muted">
				{allSelected && approved.length > 1
					? fill(t.postJob.allAgencies, { n: approved.length })
					: fill(t.postJob.goingToSome, {
							n: selected.length,
							total: approved.length,
						})}
			</p>
		</div>
	);
}
