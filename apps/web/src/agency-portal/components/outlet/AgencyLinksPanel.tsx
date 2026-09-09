import { IzCard, IzSectionLabel } from "@agency-portal/components/iz/ui";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@agency-portal/components/ui/alert-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Ban,
	Building2,
	Check,
	Clock,
	Plus,
	RotateCcw,
	Trash2,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { kickToLogin } from "@/lib/auth/guards";
import { orgMemberIdStem } from "@/lib/member-code";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { dateLocaleTag } from "@/lib/portal-i18n/date-label";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalLocale } from "@/lib/portal-i18n/locale-prefs";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import {
	type AgencyOutletApproveStatus,
	fetchAgencyDirectory,
	fetchMyAgencyLinks,
	type OutletAgencyLink,
	saveMyAgencyLinks,
} from "@/services/agency-outlet";

/**
 * Which agencies this venue works with (`agency_outlet`, migration 0123).
 *
 * A venue may work with several agencies, but each link is the agency's to
 * accept: adding one here REQUESTS it, and only an `approved` link can be
 * posted to. That is the same contract a PR gets when joining an agency —
 * approved once, then used freely — which is why the status vocabulary here is
 * deliberately identical.
 *
 * Removing a link ENDS it rather than erasing it (0127). Shifts already posted
 * to that agency keep their own record and are untouched, the row stays with
 * its history, and asking again is a request like any other — approved once
 * more before any new work can be sent.
 */

const STATUS_META: Record<
	AgencyOutletApproveStatus,
	{
		label: (t: PortalTranslations) => string;
		className: string;
		Icon: typeof Check;
	}
> = {
	approved: {
		label: (t) => t.agencyLinks.statusApproved,
		className: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
		Icon: Check,
	},
	pending: {
		label: (t) => t.agencyLinks.statusPending,
		className: "text-amber-300 border-amber-300/30 bg-amber-300/10",
		Icon: Clock,
	},
	rejected: {
		label: (t) => t.agencyLinks.statusRejected,
		className: "text-rose-400 border-rose-400/30 bg-rose-400/10",
		Icon: X,
	},
	// Deliberately NOT sharing `rejected`'s red. Declined means they never
	// agreed; ended means they did and it is over. Collapsing the two into one
	// badge would tell a venue its long-standing partner had refused it.
	ended: {
		label: (t) => t.agencyLinks.statusEnded,
		className: "iz-muted border-[var(--iz-line)]",
		Icon: Ban,
	},
};

/**
 * A day, not a timestamp — "ended on 12 Aug 2026" is the whole useful fact, and
 * the minute it happened only adds noise to a line about a business decision.
 *
 * The date follows the READER, not the house: it is spliced into a translated
 * sentence, so an English day-month-year inside a 中文 line reads as a bug. This
 * used to hardcode `en-GB` "to match the rest of the outlet portal" — the rest
 * of the outlet portal now resolves the tag from the portal's own language via
 * `dateLocaleTag`, and so does this. `en-GB` is still what English gets, so the
 * day-before-month ordering is unchanged.
 *
 * `locale` is a required LAST parameter: this is module scope, it cannot call
 * `usePortalLocale`, and a default would pin one language forever.
 */
function formatEndedOn(iso: string, locale: PortalLocale): string {
	return new Date(iso).toLocaleDateString(dateLocaleTag(locale), {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function StatusBadge({ status }: { status: AgencyOutletApproveStatus }) {
	const { t } = usePortalLocale();
	const meta = STATUS_META[status];
	return (
		<span
			className={`iz-tiny inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${meta.className}`}
		>
			<meta.Icon className="h-3 w-3" />
			{meta.label(t)}
		</span>
	);
}

export function AgencyLinksPanel({
	outletId,
	canManage,
}: {
	/** Which venue. `null` while the profile loads; the hook derives it server-side when omitted. */
	outletId?: string | null;
	canManage: boolean;
}) {
	const { t, locale } = usePortalLocale();
	const queryClient = useQueryClient();
	const [picked, setPicked] = useState("");
	const [saveFailed, setSaveFailed] = useState(false);

	const linksQuery = useQuery({
		queryKey: ["agency-outlet", "mine", outletId ?? "self"],
		queryFn: () => fetchMyAgencyLinks(kickToLogin, outletId ?? undefined),
		staleTime: 30_000,
	});

	const directoryQuery = useQuery({
		queryKey: ["agency-outlet", "directory"],
		queryFn: () => fetchAgencyDirectory(kickToLogin),
		staleTime: 5 * 60_000,
	});

	const links = useMemo<OutletAgencyLink[]>(
		() => linksQuery.data ?? [],
		[linksQuery.data],
	);

	/**
	 * Only agencies with no link row at all.
	 *
	 * An ENDED partnership is still a row, so it stays out of this picker and is
	 * re-requested from its own list entry instead. Offering it here as if it
	 * were a stranger would throw away the one thing the row knows — that these
	 * two have worked together before.
	 */
	const addable = useMemo(() => {
		const taken = new Set(links.map((l) => l.agencyId));
		return (directoryQuery.data ?? []).filter((a) => !taken.has(a.id));
	}, [directoryQuery.data, links]);

	/**
	 * The agencies this venue is asking to work with RIGHT NOW — the list the
	 * save endpoint wants.
	 *
	 * Ended links are excluded, which is what makes every action below a
	 * one-line set operation: ending an agency is this list minus one, and
	 * reviving one is this list plus one. Building the payload from `links`
	 * instead would silently revive EVERY ended partnership on the screen,
	 * because the server reads an id's presence as "I want this".
	 */
	const activeAgencyIds = useMemo(
		() =>
			links.filter((l) => l.approveStatus !== "ended").map((l) => l.agencyId),
		[links],
	);

	const save = useMutation({
		// The endpoint takes the WHOLE desired list, not a delta. Agencies that
		// were already approved keep that status server-side, so saving here can
		// never push an existing partner back into the queue.
		mutationFn: (agencyIds: string[]) =>
			saveMyAgencyLinks(agencyIds, kickToLogin, outletId ?? undefined),
		onSuccess: (fresh) => {
			queryClient.setQueryData(
				["agency-outlet", "mine", outletId ?? "self"],
				fresh,
			);
			// The agency portal's outlet list is derived from these links.
			queryClient.invalidateQueries({ queryKey: ["agency", "outlets"] });
			setPicked("");
			setSaveFailed(false);
		},
		onError: () => setSaveFailed(true),
	});

	const requestLink = () => {
		if (!picked) return;
		save.mutate([...activeAgencyIds, picked]);
	};

	/**
	 * Ask an ended partnership to start again.
	 *
	 * Goes back to AWAITING APPROVAL, never straight to approved — including
	 * when this venue is the side that ended it. The case that forces the rule
	 * is the other one: if the agency ended it, restoring on the venue's say-so
	 * would undo the agency's own decision without telling anyone. A rule that
	 * depended on who ended it would be invisible here and would fail quietly,
	 * so coming back always needs a yes.
	 */
	const requestAgain = (agencyId: string) => {
		save.mutate([...activeAgencyIds, agencyId]);
	};

	/**
	 * The link the operator has asked to end, held until they confirm.
	 *
	 * Ending is consequential in a way a bin icon does not suggest: an APPROVED
	 * link took a human decision at the agency to obtain, ending it stops all
	 * new work, and the only route back is to ask again and wait. One misplaced
	 * click should not be able to do that.
	 */
	const [pendingRemoval, setPendingRemoval] = useState<OutletAgencyLink | null>(
		null,
	);

	const endLink = (agencyId: string) => {
		save.mutate(activeAgencyIds.filter((id) => id !== agencyId));
		setPendingRemoval(null);
	};

	const approvedCount = links.filter(
		(l) => l.approveStatus === "approved",
	).length;
	// Whether anyone is actually still deciding. Without this, a venue whose
	// links have all ENDED would be told it is "waiting for an agency to
	// accept" — waiting on nobody, with no hint that the next move is its own.
	const hasPending = links.some((l) => l.approveStatus === "pending");

	return (
		<>
			<IzSectionLabel>{t.agencyLinks.agencies}</IzSectionLabel>
			<IzCard className="mt-2">
				<p className="iz-tiny iz-muted mb-3">{t.agencyLinks.blurb}</p>

				{linksQuery.isLoading ? (
					<p className="iz-tiny iz-muted">{t.agencyLinks.loading}</p>
				) : links.length === 0 ? (
					<p className="iz-tiny iz-muted rounded-lg border border-dashed border-[var(--iz-line)] px-2.5 py-2">
						{t.agencyLinks.noneYet}
					</p>
				) : (
					<ul className="flex flex-col gap-2">
						{links.map((link) => (
							<li
								key={link.id}
								className="flex items-center gap-3 rounded-xl border border-[var(--iz-line)] px-3 py-2.5"
							>
								<span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[var(--iz-line)] text-[var(--iz-gold)]">
									<Building2 className="h-4 w-4" />
								</span>

								{/* min-w-0 is load-bearing: without it a flex child refuses to
								    shrink below its content and `truncate` never engages, so a
								    long agency name would push the badge off the row. */}
								<div className="min-w-0 flex-1">
									<div className="truncate text-sm font-semibold leading-tight">
										{link.agencyName}
									</div>
									<div className="iz-tiny iz-muted truncate leading-tight">
										{orgMemberIdStem("agency", link.memberCodePrefix) ?? "—"}
									</div>
									{link.approveStatus === "rejected" && link.rejectReason && (
										<div className="iz-tiny mt-1 text-rose-400">
											{link.rejectReason}
										</div>
									)}
									{/* WHO ended it, not just that it ended. "You ended this"
									    and "they ended this" are the same status and entirely
									    different news — one is a decision to reconsider, the
									    other is a refusal to respect. `system` and `admin`
									    endings fall through to neither line rather than being
									    attributed to a side that did not act. */}
									{link.approveStatus === "ended" && link.endedAt && (
										<div className="iz-tiny iz-muted mt-1">
											{link.endedBySide === "outlet"
												? fill(t.agencyLinks.endedByYou, {
														date: formatEndedOn(link.endedAt, locale),
													})
												: link.endedBySide === "agency"
													? fill(t.agencyLinks.endedByThem, {
															name: link.agencyName,
															date: formatEndedOn(link.endedAt, locale),
														})
													: null}
										</div>
									)}
								</div>

								<StatusBadge status={link.approveStatus} />

								{canManage && link.approveStatus === "ended" && (
									/* Reviving is the one action an ended row offers, and it is
									   spelled out rather than left as an icon: nothing else on
									   this screen restarts a relationship, so there is no
									   established meaning for the operator to lean on. */
									<button
										type="button"
										title={t.agencyLinks.requestAgainHint}
										className="iz-tiny inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--iz-line)] px-2.5 py-1.5 transition-colors hover:border-[var(--iz-gold)]/50 hover:text-[var(--iz-gold)] disabled:opacity-40"
										disabled={save.isPending}
										onClick={() => requestAgain(link.agencyId)}
									>
										<RotateCcw className="h-3.5 w-3.5" />
										{t.agencyLinks.requestAgain}
									</button>
								)}

								{canManage && link.approveStatus !== "ended" && (
									/* Deliberately NOT `iz-btn`: that class is `width: 100%`
									   with 14px padding — a full-width CTA. Using it for an icon
									   made the button swallow the row and collapse the name to
									   zero width, which is why the agency looked nameless. */
									<button
										type="button"
										aria-label={fill(
											link.approveStatus === "approved"
												? t.agencyLinks.endNamed
												: t.agencyLinks.withdrawNamed,
											{ name: link.agencyName },
										)}
										title={fill(
											link.approveStatus === "approved"
												? t.agencyLinks.endNamed
												: t.agencyLinks.withdrawNamed,
											{ name: link.agencyName },
										)}
										className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--iz-line)] iz-muted transition-colors hover:border-rose-400/40 hover:text-rose-400 disabled:opacity-40"
										disabled={save.isPending}
										onClick={() => setPendingRemoval(link)}
									>
										<Trash2 className="h-4 w-4" />
									</button>
								)}
							</li>
						))}
					</ul>
				)}

				{/* `iz-field-input` is the house select style — the same one the Team
				    members panel above uses, so the two read as one screen. `iz-input`
				    (what this used before) does not exist in the theme at all, which is
				    why the control collapsed to its content width. */}
				{canManage && (
					<div className="mt-3 flex flex-wrap items-center gap-2">
						<select
							className="iz-field-input min-w-[16rem] flex-1 !text-sm"
							value={picked}
							disabled={save.isPending || addable.length === 0}
							onChange={(e) => setPicked(e.target.value)}
						>
							<option value="">
								{addable.length === 0
									? t.agencyLinks.allAdded
									: t.agencyLinks.chooseAgency}
							</option>
							{addable.map((agency) => (
								<option key={agency.id} value={agency.id}>
									{agency.name} ·{" "}
									{orgMemberIdStem("agency", agency.memberCodePrefix) ?? "—"}
								</option>
							))}
						</select>
						{/* `!w-auto` because `iz-btn` is width:100% — without the override
						    this button takes the whole row and squeezes the select to
						    nothing, which is exactly what it was doing. */}
						<button
							type="button"
							className="iz-btn iz-btn-primary !w-auto shrink-0 !px-5 !py-2.5 !text-sm"
							disabled={!picked || save.isPending}
							onClick={requestLink}
						>
							<Plus className="h-4 w-4" />
							{save.isPending ? t.common.saving : t.agencyLinks.request}
						</button>
					</div>
				)}

				{saveFailed && (
					<p className="iz-tiny mt-2 text-rose-400">
						{t.agencyLinks.couldNotSave}
					</p>
				)}

				{approvedCount === 0 && hasPending && (
					<p className="iz-tiny iz-muted mt-2">{t.agencyLinks.noApprovedYet}</p>
				)}
			</IzCard>

			{/* Names what is actually lost, not just "are you sure". The two branches
			    are two different acts wearing the same button: ENDING a partnership
			    the agency agreed to, versus WITHDRAWING a request nobody has
			    answered. Only the first costs anything, and giving the second the
			    same grave warning would train people to click through both. */}
			<AlertDialog
				open={pendingRemoval !== null}
				onOpenChange={(open) => {
					if (!open) setPendingRemoval(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{fill(
								pendingRemoval?.approveStatus === "approved"
									? t.agencyLinks.endApprovedTitle
									: t.agencyLinks.withdrawPendingTitle,
								{ name: pendingRemoval?.agencyName ?? "" },
							)}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{pendingRemoval?.approveStatus === "approved"
								? t.agencyLinks.removeApprovedWarning
								: t.agencyLinks.removePendingWarning}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => pendingRemoval && endLink(pendingRemoval.agencyId)}
						>
							{pendingRemoval?.approveStatus === "approved"
								? t.agencyLinks.confirmEnd
								: t.agencyLinks.confirmWithdraw}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
