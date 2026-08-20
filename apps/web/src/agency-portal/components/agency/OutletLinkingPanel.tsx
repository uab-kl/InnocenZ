import { OutletLogoTile } from "@agency-portal/components/agency/OutletLogoTile";
import { IzPill } from "@agency-portal/components/iz/ui";
import { useAgencyOutletLinks } from "@agency-portal/hooks/use-agency-outlet-links";
import { cn } from "@agency-portal/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
	Ban,
	Calendar,
	Check,
	ChevronDown,
	FileText,
	Handshake,
	History,
	MapPin,
	X,
} from "lucide-react";
import { useState } from "react";
import { kickToLogin } from "@/lib/auth/guards";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import {
	type AgencyOutletApproveStatus,
	type AgencyOutletLink,
	type AgencyOutletLinkEvent,
	fetchOutletLinkHistory,
} from "@/services/agency-outlet";

/**
 * Venues asking to work with this agency (`agency_outlet`, migration 0123).
 *
 * The mirror of the PR sign-up queue: an outlet names an agency, the agency
 * accepts once, and from then on that venue can post jobs here. Approving is
 * what makes the venue visible in the rest of the portal — the outlet list is
 * derived from exactly these rows — so this tab gates real work, not paperwork.
 *
 * Split into LIST and DETAIL because this page is a master/detail layout: the
 * list lives in the `<aside>` and the detail in the `<main>`. The first cut
 * rendered both inside the list column and left the whole right-hand pane
 * blank, which read as a broken screen rather than a deliberate one.
 */

/*
 * Resolver functions, not strings and not dictionary keys — this map is
 * module-scope, so it cannot read `t` directly, and a key would type-check
 * while rendering its own name to screen. The record KEYS stay the backend
 * status enum: they drive the query filter.
 */
const STATUS_LABEL: Record<
	AgencyOutletApproveStatus,
	(t: PortalTranslations) => string
> = {
	pending: (t) => t.approvals.linkPending,
	approved: (t) => t.approvals.linkApproved,
	rejected: (t) => t.approvals.linkRejected,
	ended: (t) => t.approvals.linkEnded,
};

/**
 * `ended` earns its own tab rather than hiding inside `rejected`.
 *
 * They are opposite facts wearing similar words: rejected means this agency
 * never agreed, ended means it did and the arrangement is over. Filing a former
 * partner under "declined" would misrepresent the agency's own history back to
 * it — and this is the tab someone opens to answer "who did we used to work
 * with".
 */
const FILTERS = ["pending", "approved", "rejected", "ended"] as const;

/**
 * Colour for the status pill on the detail pane.
 *
 * `ended` is INK, deliberately not red: red is the colour this portal uses for
 * something wrong or refused, and a partnership that simply ran its course is
 * neither. Sharing `rejected`'s red would tell an agency it had turned away a
 * venue it actually worked with for months.
 */
const STATUS_PILL_VARIANT: Record<
	AgencyOutletApproveStatus,
	"amber" | "green" | "red" | "ink"
> = {
	pending: "amber",
	approved: "green",
	rejected: "red",
	ended: "ink",
};

/**
 * The venue's postal address on one line, skipping whatever is missing.
 *
 * Joined from the parts rather than shown field-by-field: most of these are null
 * on the live registry, and six labelled rows reading "—" tells the agency less
 * about the venue than one line that simply says where it is.
 */
function formatOutletAddress(link: AgencyOutletLink): string | null {
	const cityLine = [link.postcode, link.city].filter(Boolean).join(" ");
	return (
		[link.addressLine1, link.addressLine2, cityLine, link.state, link.country]
			.map((part) => part?.trim())
			.filter(Boolean)
			.join(", ") || null
	);
}

/**
 * "18 Aug 2026" from the link row's timestamp.
 *
 * Formatted from the parsed Date rather than sliced off the ISO string: this one
 * IS a real timestamp (not a bare `YYYY-MM-DD`), so it carries a zone and
 * rendering it locally is correct here.
 */
function formatRequestedOn(iso: string): string | null {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return null;
	return d.toLocaleDateString("en-GB", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

/**
 * One labelled fact inside an info card. Renders nothing at all when the venue
 * has no value for it.
 *
 * Skipping rather than printing "—" is what lets the two cards below carry a
 * different number of rows each without either looking broken: on the live
 * registry most of these fields are empty, and six labelled dashes tell the
 * agency less about a venue than two lines that actually say something.
 */
function DetailRow({
	icon: Icon,
	label,
	value,
}: {
	icon: typeof MapPin;
	label: string;
	value: string | null | undefined;
}) {
	if (!value?.trim()) return null;
	return (
		<div className="mt-2 flex items-start gap-2 first-of-type:mt-0">
			<Icon className="iz-muted mt-0.5 h-3.5 w-3.5 shrink-0" />
			<div className="min-w-0">
				<div className="iz-tiny iz-muted leading-tight">{label}</div>
				<div className="text-sm leading-snug break-words">{value}</div>
			</div>
		</div>
	);
}

/**
 * "We have worked together before" — the fact that turns a hard decision into
 * an easy one.
 *
 * A venue whose partnership was ended and then requested again arrives in the
 * pending queue as an ordinary row, identical to a stranger's. The information
 * that settles it already exists in `agency_outlet_event`; the only reason the
 * decision was hard is that nobody was shown it.
 *
 * Renders nothing when there is no ending to report, so a genuinely new request
 * stays clean. The two branches matter: a partnership that RAN gets its dates,
 * while a request withdrawn before anyone answered has no dates to give and
 * should not be dressed up as a working relationship.
 */
function ReturningPartnerNote({
	link,
	variant = "line",
}: {
	link: AgencyOutletLink;
	/**
	 * `line` is the one-line version for a list row, where it competes with the
	 * venue name and must stay quiet. `callout` is the detail-pane version,
	 * where this is the fact that changes the decision and truncating it would
	 * hide the half that matters.
	 */
	variant?: "line" | "callout";
}) {
	const { t } = usePortalLocale();
	if (!link.endedAt) return null;
	// ⚠️ NEVER ON A LIVE PARTNERSHIP. `endedAt` is the latest `ended` event for a
	// link that has EVER ended, so a venue that was ended, asked again and was
	// re-approved still carries one — and gating on it alone printed
	// "they ended it" across a partnership currently running, on the approved
	// tab. Past tense belongs to a past relationship; the current status is what
	// says which one this is.
	if (link.approveStatus === "approved") return null;

	const endedOn = formatRequestedOn(link.endedAt);
	if (!endedOn) return null;

	const by =
		link.endedBySide === "agency"
			? t.approvals.returningEndedByYou
			: link.endedBySide === "outlet"
				? t.approvals.returningEndedByOutlet
				: null;

	const worked = link.firstApprovedAt
		? fill(t.approvals.returningWorkedWith, {
				from: formatRequestedOn(link.firstApprovedAt) ?? "",
				to: endedOn,
			})
		: fill(t.approvals.returningAskedBefore, { date: endedOn });

	if (variant === "callout") {
		return (
			<div className="flex items-start gap-2 rounded-xl border border-[var(--iz-gold)]/25 bg-[var(--iz-gold)]/[0.06] px-3.5 py-2.5">
				<History className="mt-0.5 h-4 w-4 shrink-0 text-[var(--iz-gold)]" />
				<div className="min-w-0">
					<div className="text-sm font-semibold leading-snug">{worked}</div>
					{by && <div className="iz-tiny iz-muted mt-0.5">{by}</div>}
				</div>
			</div>
		);
	}

	return (
		<div className="iz-tiny iz-muted mt-0.5 flex items-center gap-1">
			<History className="h-3 w-3 shrink-0" />
			<span className="truncate">{by ? `${worked} · ${by}` : worked}</span>
		</div>
	);
}

/**
 * What one transition MEANS, in the agency's own words.
 *
 * Keyed on the PAIR, not just where it landed: `approved → ended` is a
 * partnership that ran and is over, while `pending → ended` is a request the
 * venue withdrew before anyone answered. Both are `ended` rows, and reading them
 * as the same event would put a partnership in the log that never happened.
 *
 * `fromStatus === null` is the first event — the link did not exist yet — and
 * `system` marks the migration backfill, so a carried-over partnership is never
 * presented as something a person did.
 */
function eventLabel(
	event: AgencyOutletLinkEvent,
	t: PortalTranslations,
): string {
	if (event.actorSide === "system" && event.fromStatus === null) {
		return t.approvals.evCarriedOver;
	}
	if (event.fromStatus === null) return t.approvals.evRequested;
	switch (event.toStatus) {
		case "pending":
			return t.approvals.evAskedAgain;
		case "approved":
			return t.approvals.evApproved;
		case "rejected":
			return t.approvals.evDeclined;
		default:
			return event.fromStatus === "approved"
				? t.approvals.evEnded
				: t.approvals.evWithdrawn;
	}
}

function actorLabel(
	side: AgencyOutletLinkEvent["actorSide"],
	t: PortalTranslations,
): string | null {
	if (side === "outlet") return t.approvals.bySideOutlet;
	if (side === "agency") return t.approvals.bySideAgency;
	// `admin` and `system` are deliberately unattributed — neither side did it,
	// and naming a side that did not act is worse than naming none.
	return null;
}

/**
 * One partnership's whole timeline — `GET /links/:outletId/history`.
 *
 * Collapsed by default and fetched only once opened. The returning-partner line
 * above already answers the common question ("have we worked together?") off
 * rows the queue holds anyway; this answers the rare one — "when exactly did we
 * stop, the FIRST time" — which is what gets asked in a payment dispute months
 * later, and is unanswerable from the link row alone because a re-link
 * overwrites its status.
 */
function LinkHistory({ outletId }: { outletId: string }) {
	const { t } = usePortalLocale();
	const [open, setOpen] = useState(false);
	const query = useQuery({
		queryKey: ["agency-outlet", "history", outletId],
		queryFn: () => fetchOutletLinkHistory(outletId, kickToLogin),
		// Nobody pays for a timeline they did not open — this pane re-renders on
		// every row selection.
		enabled: open,
		staleTime: 60_000,
	});
	const events = query.data ?? [];

	return (
		<div className="rounded-xl border border-[var(--iz-line)] px-3.5 py-2.5">
			<button
				type="button"
				className="flex w-full items-center gap-2 text-left"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
			>
				<History className="iz-muted h-3.5 w-3.5 shrink-0" />
				<span className="iz-approvals-info-title !mb-0 flex-1">
					{t.approvals.historyTitle}
				</span>
				<ChevronDown
					className={cn(
						"iz-muted h-4 w-4 shrink-0 transition-transform",
						open && "rotate-180",
					)}
				/>
			</button>

			{open &&
				(query.isLoading ? (
					<p className="iz-tiny iz-muted mt-2">{t.common.loading}</p>
				) : events.length === 0 ? (
					<p className="iz-tiny iz-muted mt-2">{t.approvals.historyEmpty}</p>
				) : (
					<ol className="mt-2 flex flex-col gap-2">
						{events.map((event) => {
							const by = actorLabel(event.actorSide, t);
							return (
								<li key={event.id} className="flex gap-2.5">
									<span
										aria-hidden
										className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--iz-gold)]/70"
									/>
									<div className="min-w-0">
										<div className="text-sm leading-snug">
											{eventLabel(event, t)}
											{by && <span className="iz-muted"> · {by}</span>}
										</div>
										<div className="iz-tiny iz-muted2">
											{formatRequestedOn(event.createdAt) ?? event.createdAt}
										</div>
										{/* Reject reasons and end notes both land here. */}
										{event.reason && (
											<div className="iz-tiny iz-muted mt-0.5 break-words">
												{event.reason}
											</div>
										)}
									</div>
								</li>
							);
						})}
					</ol>
				))}
		</div>
	);
}

function OutletPlace({ link }: { link: AgencyOutletLink }) {
	if (!link.city && !link.state) return null;
	return (
		<div className="iz-tiny iz-muted mt-0.5 flex items-center gap-1">
			<MapPin className="h-3 w-3" />
			{[link.city, link.state].filter(Boolean).join(", ")}
		</div>
	);
}

/** LEFT COLUMN — filter chips + the venue rows. */
export function OutletLinkingList({
	filter,
	onFilterChange,
	selectedOutletId,
	onSelect,
}: {
	filter: AgencyOutletApproveStatus;
	onFilterChange: (next: AgencyOutletApproveStatus) => void;
	selectedOutletId: string | null;
	onSelect: (outletId: string) => void;
}) {
	const { t } = usePortalLocale();
	const queue = useAgencyOutletLinks(filter);

	return (
		<div className="flex flex-col gap-2">
			{/* Chips, not queue tabs: this narrows ONE queue by status, exactly
			    like the PR side's Current/Approved/Rejected/All. Wearing the
			    `iz-approvals-tab` look made it read as a third level of
			    navigation. */}
			<div className="iz-approvals-subfilter">
				{FILTERS.map((status) => (
					<button
						key={status}
						type="button"
						className={cn("iz-chip iz-tiny", filter === status && "on")}
						onClick={() => onFilterChange(status)}
					>
						{STATUS_LABEL[status](t)} ({queue.counts[status] ?? "…"})
					</button>
				))}
			</div>

			{queue.isLoading ? (
				<p className="iz-tiny iz-muted px-1 py-4 text-center">
					{t.common.loading}
				</p>
			) : queue.links.length === 0 ? (
				<p className="iz-tiny iz-muted px-1 py-4 text-center">
					{filter === "pending"
						? t.approvals.noOutletsPending
						: filter === "approved"
							? t.approvals.noOutletsApproved
							: filter === "ended"
								? t.approvals.noOutletsEnded
								: t.approvals.noOutletsRejected}
				</p>
			) : (
				queue.links.map((link) => (
					<button
						key={link.id}
						type="button"
						className={cn(
							"iz-approvals-list-item",
							selectedOutletId === link.outletId && "on",
						)}
						onClick={() => onSelect(link.outletId)}
					>
						{/* Real logo here too, so the row and the detail agree. */}
						<OutletLogoTile
							logo={link.logoImage}
							className="iz-approvals-outlet-tile h-9 w-9"
							iconClassName="h-4 w-4"
						/>
						<div className="min-w-0 flex-1 text-left">
							<div className="truncate font-semibold">{link.outletName}</div>
							<OutletPlace link={link} />
							<ReturningPartnerNote link={link} />
						</div>
					</button>
				))
			)}
		</div>
	);
}

/** RIGHT COLUMN — the selected venue, and the decision. */
export function OutletLinkingDetail({
	filter,
	selectedOutletId,
	onDecided,
}: {
	filter: AgencyOutletApproveStatus;
	selectedOutletId: string | null;
	/** Clear the selection once a row leaves the current filter. */
	onDecided: () => void;
}) {
	const { t } = usePortalLocale();
	const queue = useAgencyOutletLinks(filter);
	const [rejecting, setRejecting] = useState(false);
	/**
	 * Ending is behind its own confirm step, like declining — and for a stronger
	 * reason. Declining answers a question that is already open; ending closes a
	 * working relationship that nobody asked about, and the venue finds out by
	 * discovering it can no longer post.
	 */
	const [ending, setEnding] = useState(false);
	const [reason, setReason] = useState("");

	const link = queue.links.find((l) => l.outletId === selectedOutletId) ?? null;

	if (!link) {
		return (
			<p className="iz-tiny iz-muted px-1 py-8 text-center">
				{t.approvals.selectOutletToReview}
			</p>
		);
	}

	const decide = async (approveStatus: "approved" | "rejected") => {
		await queue.decide({
			outletId: link.outletId,
			approveStatus,
			rejectReason: approveStatus === "rejected" ? reason : undefined,
		});
		setRejecting(false);
		setReason("");
		// The row has just left this filter, so the selection now points at
		// nothing — clearing it is what stops the pane showing a stale venue.
		onDecided();
	};

	const endPartnership = async () => {
		await queue.end({
			outletId: link.outletId,
			reason: reason.trim() || undefined,
		});
		setEnding(false);
		setReason("");
		// Same reason as `decide`: the row has moved from "Working with you" to
		// "Ended" and is no longer in this filter's results.
		onDecided();
	};

	return (
		<div className="flex flex-col gap-4">
			<div className="iz-approvals-detail-head">
				<div className="iz-approvals-detail-profile">
					{/* The venue's REAL logo. `logoImage` is an R2 object key, so it goes
					    through the shared tile rather than into a bare <img> — that
					    component owns the resolver and the map-pin fallback for the
					    venues (most of them, today) that never uploaded a mark. */}
					<OutletLogoTile
						logo={link.logoImage}
						className="iz-approvals-outlet-tile h-14 w-14"
						iconClassName="h-6 w-6"
					/>
					<div className="min-w-0 flex-1">
						<h2 className="iz-approvals-detail-name truncate">
							{link.outletName}
						</h2>
						<OutletPlace link={link} />
						{/* The VENUE's own state, not this link's. Worth surfacing before
						    a decision: approving a venue that has not cleared platform
						    review does not put it to work. */}
						{link.outletStatus !== "active" && (
							<IzPill variant="amber" className="mt-1">
								{link.outletStatus.replace(/_/g, " ")}
							</IzPill>
						)}
					</div>
				</div>
				{/* WHICH STATE this link is in, stated on the detail rather than left
				    to be inferred from which tab happens to be selected. The pane is
				    deep-linkable and the tab strip is off to the left; a screen whose
				    only answer to "are we working with them?" is a highlighted chip
				    somewhere else is a screen that gets misread. */}
				<div className="iz-approvals-detail-actions">
					<IzPill variant={STATUS_PILL_VARIANT[link.approveStatus]}>
						{STATUS_LABEL[link.approveStatus](t)}
					</IzPill>
				</div>
			</div>

			{/* Full width and boxed, not a caption under the name. This is the fact
			    that changes the decision, so it gets the weight of a finding rather
			    than the weight of a timestamp. */}
			<ReturningPartnerNote link={link} variant="callout" />

			<div className="iz-approvals-info-grid">
				<div className="iz-approvals-info-card">
					<div className="iz-approvals-info-title">
						{t.approvals.detailVenueTitle}
					</div>
					<DetailRow
						icon={MapPin}
						label={t.approvals.address}
						value={formatOutletAddress(link)}
					/>
					<DetailRow
						icon={FileText}
						label={t.approvals.companyRegistration}
						value={link.ssmNo ?? link.businessLicense}
					/>
				</div>

				{/* The RELATIONSHIP, kept apart from the venue's own particulars.
				    They answer different questions — "who are these people" versus
				    "what is our history with them" — and one flat list of six rows
				    made the reader do that sorting themselves. */}
				<div className="iz-approvals-info-card">
					<div className="iz-approvals-info-title">
						{t.approvals.detailPartnershipTitle}
					</div>
					<DetailRow
						icon={Calendar}
						label={t.approvals.requestedOn}
						value={formatRequestedOn(link.createdAt)}
					/>
					{/* Both render nothing when null, so a brand-new request shows one
					    line here instead of two empty labelled slots. */}
					<DetailRow
						icon={Handshake}
						label={t.approvals.partnerSince}
						value={
							link.firstApprovedAt
								? formatRequestedOn(link.firstApprovedAt)
								: null
						}
					/>
					{/* Same rule as the note above: a re-approved partnership still
					    carries the date it ended once, and labelling a running
					    relationship "Ended on" is simply false. */}
					<DetailRow
						icon={Ban}
						label={t.approvals.endedOn}
						value={
							link.approveStatus !== "approved" && link.endedAt
								? formatRequestedOn(link.endedAt)
								: null
						}
					/>
				</div>
			</div>

			{link.approveStatus === "rejected" && link.rejectReason && (
				<p className="iz-tiny rounded-lg border border-rose-400/30 bg-rose-400/5 px-3 py-2 text-rose-400">
					{link.rejectReason}
				</p>
			)}

			{/* Below the facts and above the decision: it is reference material, not
			    something to read before every approval. */}
			<LinkHistory outletId={link.outletId} />

			{link.approveStatus === "pending" &&
				(rejecting ? (
					<div className="flex flex-col gap-2">
						<textarea
							className="iz-field-input w-full !text-sm"
							rows={3}
							placeholder={t.approvals.declineReasonHint}
							value={reason}
							onChange={(e) => setReason(e.target.value)}
						/>
						<div className="flex gap-2">
							<button
								type="button"
								className="iz-btn iz-btn-ghost flex-1"
								onClick={() => {
									setRejecting(false);
									setReason("");
								}}
							>
								{t.common.cancel}
							</button>
							<button
								type="button"
								className="iz-btn iz-btn-primary flex-1"
								disabled={queue.isDeciding}
								onClick={() => void decide("rejected")}
							>
								{t.approvals.confirmDecline}
							</button>
						</div>
					</div>
				) : (
					<div className="flex gap-2">
						<button
							type="button"
							className="iz-btn iz-btn-ghost flex-1"
							disabled={queue.isDeciding}
							onClick={() => setRejecting(true)}
						>
							<X className="mr-1 h-4 w-4" />
							{t.approvals.decline}
						</button>
						<button
							type="button"
							className="iz-btn iz-btn-primary flex-1"
							disabled={queue.isDeciding}
							onClick={() => void decide("approved")}
						>
							<Check className="mr-1 h-4 w-4" />
							{t.approvals.approve}
						</button>
					</div>
				))}

			{/* The agency's own way out of a partnership it accepted.
			    Only on an APPROVED link: there is nothing to end while a request is
			    still open (decline it), and nothing to end on one already declined
			    or ended.
			    Its own titled, rose-bordered section rather than a lone chip. The
			    first cut was a small ghost button floating under the address and
			    nobody could find it — but the answer is not a big red button either,
			    since that would read as the main thing to do on a page where the
			    main thing is usually nothing. A labelled section is findable by
			    someone looking for it and ignorable by someone who is not. */}
			{link.approveStatus === "approved" && (
				<div className="mt-1 rounded-xl border border-rose-400/25 bg-rose-400/[0.04] px-4 py-3">
					<div className="iz-approvals-info-title !mb-1.5 text-rose-300/80">
						{t.approvals.endSectionTitle}
					</div>
					<p className="iz-tiny iz-muted">
						{t.approvals.endPartnershipWarning}
					</p>

					{ending ? (
						<div className="mt-2.5 flex flex-col gap-2">
							<textarea
								className="iz-field-input w-full !text-sm"
								rows={3}
								placeholder={t.approvals.endReasonHint}
								value={reason}
								onChange={(e) => setReason(e.target.value)}
							/>
							<div className="flex gap-2">
								<button
									type="button"
									className="iz-btn iz-btn-ghost flex-1"
									onClick={() => {
										setEnding(false);
										setReason("");
									}}
								>
									{t.common.cancel}
								</button>
								{/* The confirm is the ONLY thing on this screen wearing solid
								    rose. It appears one deliberate click in, so by the time it
								    is on screen the operator has already said what they want
								    and the colour is confirmation, not decoration. */}
								<button
									type="button"
									className="iz-btn !w-auto flex-1 !border-rose-400/50 !bg-rose-500/90 !text-white hover:!bg-rose-500 disabled:opacity-40"
									disabled={queue.isEnding}
									onClick={() => void endPartnership()}
								>
									<Ban className="mr-1 h-4 w-4" />
									{queue.isEnding
										? t.common.saving
										: t.approvals.confirmEndPartnership}
								</button>
							</div>
						</div>
					) : (
						<button
							type="button"
							className="iz-btn !mt-2.5 !w-auto !border-rose-400/40 !bg-transparent !text-rose-300 hover:!border-rose-400/70 hover:!bg-rose-400/10 disabled:opacity-40"
							disabled={queue.isEnding}
							onClick={() => setEnding(true)}
						>
							<Ban className="mr-1 h-4 w-4" />
							{t.approvals.endPartnership}
						</button>
					)}
				</div>
			)}
		</div>
	);
}
