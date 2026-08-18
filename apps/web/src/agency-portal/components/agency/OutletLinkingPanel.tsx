import { OutletLogoTile } from "@agency-portal/components/agency/OutletLogoTile";
import { IzPill } from "@agency-portal/components/iz/ui";
import { useAgencyOutletLinks } from "@agency-portal/hooks/use-agency-outlet-links";
import { cn } from "@agency-portal/lib/utils";
import { Calendar, Check, FileText, MapPin, X } from "lucide-react";
import { useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import type {
	AgencyOutletApproveStatus,
	AgencyOutletLink,
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
};

const FILTERS = ["pending", "approved", "rejected"] as const;

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

/** One labelled fact. Renders nothing at all when the venue has no value for it. */
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
		<div className="flex items-start gap-2">
			<Icon className="iz-muted mt-0.5 h-4 w-4 shrink-0" />
			<div className="min-w-0">
				<dt className="iz-tiny iz-muted">{label}</dt>
				<dd className="text-sm">{value}</dd>
			</div>
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
			<div className="iz-approvals-tabs">
				{FILTERS.map((status) => (
					<button
						key={status}
						type="button"
						className={cn("iz-approvals-tab", filter === status && "on")}
						onClick={() => onFilterChange(status)}
					>
						{STATUS_LABEL[status](t)}
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

	return (
		<div className="flex flex-col gap-4">
			<div className="iz-approvals-detail-head">
				<div className="flex items-start gap-3">
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
			</div>

			<dl className="flex flex-col gap-2">
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
				<DetailRow
					icon={Calendar}
					label={t.approvals.requestedOn}
					value={formatRequestedOn(link.createdAt)}
				/>
			</dl>

			{link.approveStatus === "rejected" && link.rejectReason && (
				<p className="iz-tiny rounded-lg border border-rose-400/30 bg-rose-400/5 px-3 py-2 text-rose-400">
					{link.rejectReason}
				</p>
			)}

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
		</div>
	);
}
