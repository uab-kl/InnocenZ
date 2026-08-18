import {
	Comcard3dPreviewVisual,
	type ComcardPreviewData,
} from "@agency-portal/components/agency/Comcard3dPreview";
import { PrFaceBubble } from "@agency-portal/components/agency/PrFaceBubble";
import { PhotoLightbox } from "@agency-portal/components/agency/ProofPhotoViewer";
import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { IzCard, IzPill } from "@agency-portal/components/iz/ui";
import {
	canGeneratePortfolioComcard,
	PortfolioComcardVisual,
	portfolioPhotosForComcard,
	StaticComcardVisual,
} from "@agency-portal/components/pr/PortfolioComcardVisual";
import { portfolioFilledCount } from "@agency-portal/components/pr/PortfolioGalleryPicker";
import { useAgencyApprovalQueue } from "@agency-portal/hooks/use-agency-approval-queue";
import { usePrPhotoById } from "@agency-portal/hooks/use-pr-photo";
import { useRosterMutations } from "@agency-portal/hooks/use-roster-mutations";
import { nowAgencyDateTime } from "@agency-portal/lib/agency-demo";
import type { PendingCutlostRequest } from "@agency-portal/lib/outlet-cutlost-requests";
import {
	cutlostRequestDetail,
	cutlostRequestTitle,
} from "@agency-portal/lib/outlet-cutlost-requests";
import { prPhotoSrc } from "@agency-portal/lib/public-asset";
import type { PendingAgencyLink, PendingPR } from "@agency-portal/lib/store";
import { useStore } from "@agency-portal/lib/store";
import { useAgencyCan } from "@agency-portal/lib/use-portal-can";
import { cn } from "@agency-portal/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	Calendar,
	Camera,
	Check,
	Clock,
	Contact,
	Image,
	Mail,
	Phone,
	Sparkles,
	Store,
	TrendingDown,
	UserMinus,
	UserPlus,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { resolveProofPhotoUrl } from "@/lib/proof-photo";
import { fetchOutlets } from "@/services/outlet/outlet";
import type { ShiftAssignment } from "@/services/shift-assignment";

/**
 * Every image on this screen goes through the PR photo resolver.
 *
 * This used to call `publicAssetPath`, which is the /public deploy-base helper
 * — it leaves an R2 object key (`user/<id>/…`) untouched and prepends the Vite
 * base, producing a URL nothing serves. It only looked fine because the hook
 * feeding it hardcoded empty photo lists; the moment those were wired to the
 * real profile it would have rendered raw keys.
 */
function docImageSrc(src: string) {
	return prPhotoSrc(src) ?? undefined;
}

function pendingPRToComcardPreview(signup: PendingPR): ComcardPreviewData {
	return {
		id: signup.id,
		name: signup.name,
		// The exact COMCARD_FALLBACK triple {165, 52, 24} that was deleted from
		// the comcard components — still alive here, describing a body no
		// applicant had entered on the one screen where an agency decides whether
		// to take them on. 0 is "not on file" and renders as an em-dash.
		height: signup.height ?? 0,
		weight: signup.weight ?? 0,
		age: signup.age ?? 0,
		portfolioPhotos: signup.portfolioPhotos,
		comcardImageUrl: signup.comcardImageUrl,
	};
}

function comcardTabMeta(signup: PendingPR) {
	if (signup.comcardImageUrl) return { ready: true, label: "Photo comcard" };
	if (canGeneratePortfolioComcard(signup.portfolioPhotos ?? []))
		return { ready: true, label: "Photo comcard" };
	if (signup.name) return { ready: true, label: "3D preview" };
	return { ready: false, label: "Empty" };
}

function PendingComcardVisual({
	signup,
	className,
	compact,
}: {
	signup: PendingPR;
	className?: string;
	compact?: boolean;
}) {
	const pr = pendingPRToComcardPreview(signup);
	// Not pre-resolved here: the comcard visuals resolve their own photos now
	// (portfolioImageSrc), so mapping them first would double-resolve.
	const photos = portfolioPhotosForComcard(signup.portfolioPhotos ?? []);

	if (signup.comcardImageUrl) {
		return (
			<StaticComcardVisual src={signup.comcardImageUrl} className={className} />
		);
	}
	// The SHARED gate, not a local count: 3 photos build the tri-layout comcard
	// (hero left, two stacked right), 4+ the 2×2 — a hand-rolled `>= 4` here is
	// exactly how this panel kept showing the 3D silhouette after the rule moved.
	if (canGeneratePortfolioComcard(signup.portfolioPhotos ?? [])) {
		return (
			<PortfolioComcardVisual photos={photos} pr={pr} className={className} />
		);
	}
	return (
		<Comcard3dPreviewVisual
			pr={pr}
			className={className}
			showName={!compact}
			compact={compact}
			showStats={!compact}
		/>
	);
}

type Tab = "signups" | "cutlost" | "leaves";

const AVATAR_VARIANTS = ["rose", "sky", "violet", "amber", "mint"] as const;

function avatarVariant(id: string) {
	let hash = 0;
	for (const c of id) hash = (hash + c.charCodeAt(0)) % AVATAR_VARIANTS.length;
	return AVATAR_VARIANTS[hash];
}

function ApprovalsAvatar({
	name,
	id,
	photo,
	size = "md",
}: {
	name: string;
	id: string;
	/**
	 * The PR's own photo, UNRESOLVED — a raw R2 key or demo path; this component
	 * runs it through `prPhotoSrc`. Every approvals row used to be a coloured
	 * initial and nothing else, so the agency approved, rejected and excused
	 * people it could not see, while History showed the same PR's face.
	 */
	photo?: string | null;
	size?: "sm" | "md" | "lg";
}) {
	return (
		<PrFaceBubble
			name={name}
			photo={photo}
			className={cn(
				"iz-approvals-avatar",
				`iz-approvals-avatar--${avatarVariant(id)}`,
				size,
			)}
			photoClassName="iz-approvals-avatar--photo"
		/>
	);
}

/**
 * The applicant's own face, best available. A sign-up has no `avatarPhoto` yet
 * — they are not on the roster — so the order mirrors `resolveAgencyPrPhoto`:
 * the selfie they submitted, then the comcard, then the first portfolio slot.
 */
function pendingPrPhoto(signup: PendingPR) {
	return (
		signup.selfiePhoto ??
		signup.comcardImageUrl ??
		signup.portfolioPhotos?.find(Boolean) ??
		null
	);
}

/**
 * "Mon · 10 Aug 2026" — the weekday spelled out beside the date.
 *
 * Built from the date PARTS, never `new Date(iso)`: a bare `YYYY-MM-DD` parses
 * as UTC midnight, which in Asia/Kuala_Lumpur renders as the PREVIOUS day. An
 * MC request for the 10th showing as the 9th is the kind of error an agency
 * acts on before anyone notices.
 */
function leaveDayLabel(iso: string | null | undefined): string {
	if (!iso) return "—";
	const [y, m, d] = iso.split("-").map(Number);
	if (!y || !m || !d) return iso;
	const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
		new Date(Date.UTC(y, m - 1, d)).getUTCDay()
	];
	const mo = [
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
	][m - 1];
	return `${wd} · ${d} ${mo} ${y}`;
}

/** "Special event" / "Normal shift" — the outlet's toggle, worded as the PR app words it. */
function leaveEventKindLabel(kind: string | null | undefined): string {
	return kind === "special" ? "Special event" : "Normal shift";
}

function pendingFloorNickname(signup: PendingPR) {
	return signup.name.trim() || "PR";
}

function pendingLegalIcName(signup: PendingPR) {
	const legal = signup.icName?.trim();
	if (!legal) return "";
	if (legal.toLowerCase() === pendingFloorNickname(signup).toLowerCase())
		return "";
	return legal;
}

function VerificationBadge({
	ok,
	label,
	count,
	variant,
}: {
	ok: boolean;
	label: string;
	count?: number;
	variant?: "gallery" | "comcard";
}) {
	return (
		<span
			className={cn(
				"iz-approvals-verify-badge",
				variant === "comcard" && (ok ? "comcard" : "bad"),
				variant !== "comcard" &&
					(count !== undefined ? "gallery" : ok ? "ok" : "bad"),
			)}
		>
			{label}
			{ok ? " ✓" : " ✕"}
			{count !== undefined && count > 0 ? ` · ${count}` : ""}
		</span>
	);
}

function RejectSheet({
	open,
	title,
	subtitle,
	placeholder,
	confirmLabel,
	onClose,
	onConfirm,
}: {
	open: boolean;
	title: string;
	subtitle?: string;
	placeholder: string;
	confirmLabel: string;
	onClose: () => void;
	onConfirm: (reason: string) => void;
}) {
	const [reason, setReason] = useState("");
	useEffect(() => {
		if (open) setReason("");
	}, [open]);

	if (!open) return null;

	return (
		<IzSheet open onClose={onClose}>
			<div className="iz-sheet-head">
				<div>
					<button
						type="button"
						className="iz-chip mb-2 !px-2 !py-1 !text-[10px]"
						onClick={onClose}
					>
						← Back
					</button>
					<h3>{title}</h3>
					{subtitle && <p className="iz-tiny iz-muted mt-1">{subtitle}</p>}
				</div>
				<button
					type="button"
					className="iz-sheet-close"
					onClick={onClose}
					aria-label="Close"
				>
					<X className="h-4 w-4" />
				</button>
			</div>
			<textarea
				className="iz-field-input min-h-[80px] !text-sm"
				value={reason}
				onChange={(e) => setReason(e.target.value)}
				placeholder={placeholder}
			/>
			<button
				type="button"
				className="iz-btn iz-btn-primary mt-3 w-full"
				disabled={!reason.trim()}
				onClick={() => onConfirm(reason.trim())}
			>
				{confirmLabel}
			</button>
		</IzSheet>
	);
}

function DocPreviewSheet({
	preview,
	signup,
	icPhotoFront,
	icPhotoBack,
	selfiePhoto,
	gallerySlots,
	onClose,
}: {
	preview: "ic" | "selfie" | "gallery" | "comcard" | null;
	signup: PendingPR;
	icPhotoFront?: string;
	icPhotoBack?: string;
	selfiePhoto?: string;
	gallerySlots: string[];
	onClose: () => void;
}) {
	// An IC scan at thumbnail size is not readable, which is the whole point of
	// this panel — tap any document to open it in the shared PhotoLightbox, the
	// same zoom-and-pan viewer the proof photos use. The comcard is a composed
	// visual rather than one image, hence a union rather than just a src.
	//
	// `from` records which document the zoom belongs to. The sheet stays mounted
	// across previews (it only returns null), so without this a zoom left open
	// on the IC would reappear over the next document opened. Tagging it is
	// exact where a reset-on-change effect was merely close.
	const [zoom, setZoom] = useState<
		| { kind: "img"; from: DocTab; src: string; alt: string }
		| { kind: "comcard"; from: DocTab }
		| null
	>(null);
	const openZoom = (z: NonNullable<typeof zoom>) => setZoom(z);
	const closeZoom = () => setZoom(null);

	// Hooks must run before this — the sheet renders nothing when closed.
	if (!preview) return null;

	/** Wrap an image so tapping it opens the lightbox. */
	const zoomable = (
		src: string,
		alt: string,
		imgClassName: string,
		wrapClassName?: string,
	) => (
		<button
			type="button"
			className={cn("block w-full cursor-zoom-in", wrapClassName)}
			onClick={() => openZoom({ kind: "img", from: preview, src, alt })}
			aria-label={`Enlarge ${alt}`}
		>
			<img src={docImageSrc(src)} alt={alt} className={imgClassName} />
		</button>
	);
	const title =
		preview === "ic"
			? "IC photos"
			: preview === "selfie"
				? "Profile picture"
				: preview === "comcard"
					? "Comcard"
					: "Portfolio gallery";

	return (
		<IzSheet open onClose={onClose}>
			<div className="iz-sheet-head">
				<div>
					<button
						type="button"
						className="iz-chip mb-2 !px-2 !py-1 !text-[10px]"
						onClick={onClose}
					>
						← Back
					</button>
					<h3>{title}</h3>
				</div>
				<button
					type="button"
					className="iz-sheet-close"
					onClick={onClose}
					aria-label="Close"
				>
					<X className="h-4 w-4" />
				</button>
			</div>
			{preview === "ic" && (
				<div className="grid grid-cols-2 gap-3 px-4 pb-4">
					{(
						[
							{ side: "Front", src: icPhotoFront },
							{ side: "Back", src: icPhotoBack },
						] as const
					).map(({ side, src }) => (
						<div key={side} className="space-y-1">
							<p className="iz-tiny iz-muted2">{side}</p>
							{src ? (
								zoomable(
									src,
									`IC ${side.toLowerCase()}`,
									"aspect-[3/2] w-full rounded-xl border border-[var(--iz-line)] object-cover",
								)
							) : (
								<div className="aspect-[3/2] rounded-xl bg-gradient-to-br from-[var(--iz-bg3)] to-[var(--iz-line)]" />
							)}
						</div>
					))}
				</div>
			)}
			{preview === "selfie" && (
				<div className="px-4 pb-4">
					{selfiePhoto ? (
						zoomable(
							selfiePhoto,
							"Profile picture",
							"aspect-[3/4] w-full rounded-xl border border-[var(--iz-line)] object-cover",
							"mx-auto max-w-[220px]",
						)
					) : (
						<div className="mx-auto aspect-[3/4] max-w-[220px] rounded-xl bg-gradient-to-br from-[var(--iz-violet-bg)] to-[var(--iz-bg3)]" />
					)}
				</div>
			)}
			{preview === "gallery" && (
				<div className="grid grid-cols-3 gap-2 px-4 pb-4">
					{gallerySlots.map((src, i) => (
						<div
							key={i}
							className="aspect-square overflow-hidden rounded-lg border border-[var(--iz-line)]"
						>
							{zoomable(
								src,
								`Portfolio ${i + 1}`,
								"h-full w-full object-cover",
								"h-full",
							)}
						</div>
					))}
				</div>
			)}
			{preview === "comcard" && (
				<div className="px-4 pb-4">
					<button
						type="button"
						className="block w-full cursor-zoom-in"
						onClick={() => openZoom({ kind: "comcard", from: preview })}
						aria-label="Enlarge comcard"
					>
						<PendingComcardVisual signup={signup} className="mx-auto" />
					</button>
				</div>
			)}

			{/* Lightbox. The backdrop is a real <button> rather than a div with an
			    onClick so it is keyboard-reachable and passes a11y lint; the
			    content sits above it and is click-through, so tapping the image
			    closes too — the usual lightbox behaviour. z-index clears the
			    sheet's own stacking context (max in the theme is 200). */}
			{zoom && zoom.from === preview && (
				<PhotoLightbox
					alt={zoom.kind === "img" ? zoom.alt : `${signup.name} · comcard`}
					onClose={closeZoom}
				>
					{zoom.kind === "img" ? (
						<img
							src={docImageSrc(zoom.src)}
							alt={zoom.alt}
							className="max-h-[92vh] max-w-[92vw] rounded-lg object-contain"
						/>
					) : (
						<PendingComcardVisual signup={signup} />
					)}
				</PhotoLightbox>
			)}
		</IzSheet>
	);
}

type DocTab = "ic" | "selfie" | "gallery" | "comcard";

function DocumentTabs({
	activeTab,
	onTabChange,
	hasIcPhotos,
	hasSelfie,
	galleryCount,
	comcardMeta,
}: {
	activeTab: DocTab;
	onTabChange: (tab: DocTab) => void;
	hasIcPhotos: boolean;
	hasSelfie: boolean;
	galleryCount: number;
	comcardMeta: { ready: boolean; label: string };
}) {
	return (
		<div
			className="iz-approvals-doc-tabs"
			role="tablist"
			aria-label="Document types"
		>
			<button
				type="button"
				role="tab"
				aria-selected={activeTab === "ic"}
				className={cn(
					"iz-approvals-doc-tab",
					hasIcPhotos && "ok",
					activeTab === "ic" && "on",
				)}
				onClick={() => onTabChange("ic")}
			>
				{hasIcPhotos ? (
					<Check className="h-4 w-4 text-[var(--iz-green)]" />
				) : (
					<Camera className="h-4 w-4 text-[var(--iz-muted)]" />
				)}
				<span className="t">IC photos</span>
				<span className="s">{hasIcPhotos ? "Verified" : "Missing"}</span>
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={activeTab === "selfie"}
				className={cn(
					"iz-approvals-doc-tab",
					hasSelfie && "ok",
					activeTab === "selfie" && "on",
				)}
				onClick={() => onTabChange("selfie")}
			>
				{hasSelfie ? (
					<Check className="h-4 w-4 text-[var(--iz-green)]" />
				) : (
					<Camera className="h-4 w-4 text-[var(--iz-muted)]" />
				)}
				<span className="t">Profile picture</span>
				<span className="s">{hasSelfie ? "Verified" : "Missing"}</span>
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={activeTab === "gallery"}
				className={cn(
					"iz-approvals-doc-tab",
					galleryCount > 0 && "gallery",
					activeTab === "gallery" && "on",
				)}
				onClick={() => onTabChange("gallery")}
			>
				<Image className="h-4 w-4" />
				<span className="t">Gallery</span>
				<span className="s">
					{galleryCount > 0 ? `${galleryCount} photos` : "Empty"}
				</span>
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={activeTab === "comcard"}
				className={cn(
					"iz-approvals-doc-tab",
					comcardMeta.ready && "comcard",
					activeTab === "comcard" && "on",
				)}
				onClick={() => onTabChange("comcard")}
			>
				<Contact className="h-4 w-4" />
				<span className="t">Comcard</span>
				<span className="s">{comcardMeta.label}</span>
			</button>
		</div>
	);
}

function DocumentPreviewStack({
	activeTab,
	signup,
	hasIcPhotos,
	hasSelfie,
	icPhotoFront,
	icPhotoBack,
	selfiePhoto,
	gallerySlots,
	onPreview,
}: {
	activeTab: DocTab;
	signup: PendingPR;
	hasIcPhotos: boolean;
	hasSelfie: boolean;
	icPhotoFront?: string;
	icPhotoBack?: string;
	selfiePhoto?: string;
	gallerySlots: string[];
	onPreview: (kind: "ic" | "selfie" | "gallery" | "comcard") => void;
}) {
	const galleryPlaceholders = gallerySlots.length > 0 ? 0 : 4;

	const icCell = (label: string, src: string | undefined, aria: string) => (
		<button
			type="button"
			className="iz-approvals-doc-cell verified ic"
			onClick={() => onPreview("ic")}
			aria-label={aria}
		>
			<span className="cell-label">{label}</span>
			<div className="cell-media">
				{src ? (
					<img src={docImageSrc(src)} alt={aria} />
				) : (
					<span className="cell-fill ic" />
				)}
			</div>
		</button>
	);

	return (
		<div className="iz-approvals-doc-previews" role="tabpanel">
			{activeTab === "ic" && (
				<div className="iz-approvals-doc-row iz-approvals-doc-row--ic">
					{hasIcPhotos ? (
						<>
							{icCell("IC · Front", icPhotoFront, "IC front")}
							{icCell("IC · Back", icPhotoBack, "IC back")}
						</>
					) : (
						<>
							<div className="iz-approvals-doc-cell empty" aria-hidden>
								<Camera className="h-6 w-6 opacity-30" />
							</div>
							<div className="iz-approvals-doc-cell empty" aria-hidden>
								<Camera className="h-6 w-6 opacity-30" />
							</div>
						</>
					)}
				</div>
			)}

			{activeTab === "selfie" && (
				<div className="iz-approvals-doc-row iz-approvals-doc-row--selfie">
					{hasSelfie ? (
						<button
							type="button"
							className="iz-approvals-doc-cell verified selfie"
							onClick={() => onPreview("selfie")}
							aria-label="Profile picture"
						>
							<span className="cell-label">Profile picture</span>
							<div className="cell-media">
								{selfiePhoto ? (
									<img src={docImageSrc(selfiePhoto)} alt={signup.name} />
								) : (
									<span className="cell-fill selfie" />
								)}
							</div>
						</button>
					) : (
						<div className="iz-approvals-doc-cell empty" aria-hidden>
							<Camera className="h-6 w-6 opacity-30" />
						</div>
					)}
				</div>
			)}

			{activeTab === "gallery" && (
				<div className="iz-approvals-doc-row iz-approvals-doc-row--gallery">
					{gallerySlots.length > 0
						? gallerySlots.map((src, i) => (
								<button
									key={i}
									type="button"
									className="iz-approvals-doc-cell gallery has-photo"
									onClick={() => onPreview("gallery")}
									aria-label={`Portfolio ${i + 1}`}
								>
									<img src={docImageSrc(src)} alt={`Portfolio ${i + 1}`} />
								</button>
							))
						: Array.from({ length: galleryPlaceholders }).map((_, i) => (
								<div
									key={i}
									className="iz-approvals-doc-cell empty"
									aria-hidden
								>
									<Image className="h-6 w-6 opacity-30" />
								</div>
							))}
				</div>
			)}

			{activeTab === "comcard" && (
				<div className="iz-approvals-doc-row iz-approvals-doc-row--comcard">
					{comcardTabMeta(signup).ready ? (
						<button
							type="button"
							className="iz-approvals-doc-cell comcard-preview"
							onClick={() => onPreview("comcard")}
							aria-label="View comcard"
						>
							<PendingComcardVisual signup={signup} compact />
						</button>
					) : (
						<div className="iz-approvals-doc-cell empty" aria-hidden>
							<Contact className="h-6 w-6 opacity-30" />
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function SignupDetailPanel({
	signup,
	onApprove,
	onReject,
}: {
	signup: PendingPR;
	onApprove: () => void;
	onReject: (reason: string) => void;
}) {
	const [rejectOpen, setRejectOpen] = useState(false);
	const [preview, setPreview] = useState<
		"ic" | "selfie" | "gallery" | "comcard" | null
	>(null);
	const [docTab, setDocTab] = useState<DocTab>("ic");
	// Which WAY the request runs, and whether it is history. Approving a join
	// takes the PR under the agency; approving a leave lets them go — the
	// button must say which, or an exit gets approved as an entry.
	const isLeave = signup.requestKind === "leave";
	const decided = signup.status !== "pending";
	const galleryCount = portfolioFilledCount(signup.portfolioPhotos ?? []);
	const gallerySlots = (signup.portfolioPhotos ?? []).filter(
		Boolean,
	) as string[];
	const comcardMeta = comcardTabMeta(signup);

	useEffect(() => {
		setDocTab("ic");
		setPreview(null);
	}, [signup.id]);

	return (
		<>
			<div className="iz-approvals-detail-head">
				<div className="iz-approvals-detail-profile">
					<ApprovalsAvatar
						name={pendingFloorNickname(signup)}
						id={signup.id}
						photo={pendingPrPhoto(signup)}
						size="lg"
					/>
					<div className="min-w-0">
						<h2 className="iz-approvals-detail-name">
							{pendingFloorNickname(signup)}
						</h2>
						{pendingLegalIcName(signup) && (
							<p className="iz-approvals-detail-meta">
								Legal · {pendingLegalIcName(signup)}
							</p>
						)}
						<p className="iz-approvals-detail-meta">
							{signup.languages}
							{signup.submittedAt ? ` · Applied ${signup.submittedAt}` : ""}
						</p>
						{signup.source === "owner-invite" && (
							<IzPill variant="amber" className="mt-1.5">
								Owner invite
							</IzPill>
						)}
						<IzPill variant={isLeave ? "amber" : "violet"} className="mt-1.5">
							{isLeave ? "Leave request" : "Join request"}
						</IzPill>
						{decided && (
							<p className="iz-approvals-detail-meta mt-1">
								{signup.status === "approved"
									? isLeave
										? "Departure approved — no longer under this agency"
										: "Membership approved"
									: isLeave
										? "Departure rejected — membership continues"
										: "Join rejected"}
								{signup.rejectReason ? ` · ${signup.rejectReason}` : ""}
							</p>
						)}
					</div>
				</div>
				{/* History is the record — it gets no buttons. Re-deciding a decided
				    request happens through a fresh request, not by editing history. */}
				{!decided && (
					<div className="iz-approvals-detail-actions">
						<button
							type="button"
							className="iz-btn iz-btn-primary !py-2 !text-xs"
							onClick={onApprove}
						>
							{isLeave ? "Approve departure" : "Approve"}
						</button>
						<button
							type="button"
							className="iz-btn iz-btn-soft !py-2 !text-xs"
							onClick={() => setRejectOpen(true)}
						>
							Reject
						</button>
					</div>
				)}
			</div>

			<div className="iz-approvals-info-grid">
				<div className="iz-approvals-info-card">
					<h3 className="iz-approvals-info-title">Personal info</h3>
					<div className="iz-approvals-info-chips">
						{signup.race && <IzPill variant="violet">{signup.race}</IzPill>}
						{signup.age && <IzPill variant="violet">Age {signup.age}</IzPill>}
						{signup.height && (
							<IzPill variant="violet">{signup.height} cm</IzPill>
						)}
						{signup.weight && (
							<IzPill variant="violet">{signup.weight} kg</IzPill>
						)}
					</div>
					{signup.ic && (
						<p className="iz-approvals-info-line">
							<Calendar className="h-3.5 w-3.5 shrink-0" />
							IC {signup.ic}
						</p>
					)}
					{pendingLegalIcName(signup) && (
						<p className="iz-approvals-info-line">
							<Contact className="h-3.5 w-3.5 shrink-0" />
							{pendingLegalIcName(signup)}
						</p>
					)}
				</div>
				<div className="iz-approvals-info-card">
					<h3 className="iz-approvals-info-title">Contact</h3>
					{signup.email && (
						<p className="iz-approvals-info-line">
							<Mail className="h-3.5 w-3.5 shrink-0" />
							{signup.email}
						</p>
					)}
					{signup.mobile && (
						<p className="iz-approvals-info-line">
							<Phone className="h-3.5 w-3.5 shrink-0" />
							{signup.mobile}
						</p>
					)}
				</div>
			</div>

			<section className="iz-approvals-docs">
				<h3 className="iz-approvals-info-title">Documents</h3>
				<DocumentTabs
					activeTab={docTab}
					onTabChange={setDocTab}
					hasIcPhotos={!!signup.hasIcPhotos}
					hasSelfie={!!signup.hasSelfie}
					galleryCount={galleryCount}
					comcardMeta={comcardMeta}
				/>
				<DocumentPreviewStack
					activeTab={docTab}
					signup={signup}
					hasIcPhotos={!!signup.hasIcPhotos}
					hasSelfie={!!signup.hasSelfie}
					icPhotoFront={signup.icPhotoFront}
					icPhotoBack={signup.icPhotoBack}
					selfiePhoto={signup.selfiePhoto}
					gallerySlots={gallerySlots}
					onPreview={setPreview}
				/>
			</section>

			<RejectSheet
				open={rejectOpen}
				title={
					isLeave
						? `Reject ${pendingFloorNickname(signup)}'s departure`
						: `Reject ${pendingFloorNickname(signup)}`
				}
				subtitle={
					isLeave
						? "Reason is sent to PR — required to reject a departure. The membership continues."
						: "Reason is sent to PR (mandatory)"
				}
				placeholder="e.g. Incomplete IC verification…"
				confirmLabel="Confirm reject"
				onClose={() => setRejectOpen(false)}
				onConfirm={(reason) => {
					onReject(reason);
					setRejectOpen(false);
				}}
			/>
			<DocPreviewSheet
				preview={preview}
				signup={signup}
				icPhotoFront={signup.icPhotoFront}
				icPhotoBack={signup.icPhotoBack}
				selfiePhoto={signup.selfiePhoto}
				gallerySlots={gallerySlots}
				onClose={() => setPreview(null)}
			/>
		</>
	);
}

function CutlostDetailPanel({
	req,
	onApprove,
	onReject,
}: {
	req: PendingCutlostRequest;
	onApprove: () => void;
	onReject: (reason: string) => void;
}) {
	const [rejectOpen, setRejectOpen] = useState(false);
	const Icon =
		req.kind === "best_effort"
			? Sparkles
			: req.kind === "release_prs"
				? UserMinus
				: TrendingDown;

	return (
		<>
			<div className="iz-approvals-detail-head">
				<div className="iz-approvals-detail-profile">
					<span className="iz-approvals-cutlost-icon">
						<Icon className="h-5 w-5" />
					</span>
					<div className="min-w-0">
						<h2 className="iz-approvals-detail-name">{req.outletName}</h2>
						<p className="iz-approvals-detail-meta">{req.shiftEvent}</p>
						<p className="iz-approvals-detail-meta mt-0.5">
							<Clock className="mr-1 inline h-3 w-3" />
							Requested {req.requestedAt}
						</p>
					</div>
				</div>
				<div className="iz-approvals-detail-actions">
					<button
						type="button"
						className="iz-btn iz-btn-primary !py-2 !text-xs"
						onClick={onApprove}
					>
						Approve
					</button>
					<button
						type="button"
						className="iz-btn iz-btn-soft !py-2 !text-xs"
						onClick={() => setRejectOpen(true)}
					>
						Decline
					</button>
				</div>
			</div>

			<div className="iz-approvals-cutlost-summary">
				<Icon className="h-4 w-4 shrink-0 text-[var(--iz-gold-l)]" />
				<div className="min-w-0">
					<p className="font-sora text-sm font-bold text-[var(--iz-txt)]">
						{cutlostRequestTitle(req)}
					</p>
					<p className="iz-tiny iz-muted2 mt-0.5">
						{cutlostRequestDetail(req)}
					</p>
				</div>
			</div>

			<div className="iz-approvals-info-chips mt-3">
				<IzPill variant="violet">{req.dateLabel}</IzPill>
				<IzPill variant="violet">{req.shiftLabel}</IzPill>
				{req.model === "best_effort" && (
					<IzPill variant="violet">Best effort</IzPill>
				)}
				<IzPill variant="red">
					Cutlost RM {Math.round(req.cutlostBefore).toLocaleString("en-MY")}
				</IzPill>
				<IzPill variant="green">
					Saves ~RM {Math.round(req.estimatedSavings).toLocaleString("en-MY")}
				</IzPill>
			</div>

			{req.releasedPrNames?.length ? (
				<div className="iz-approvals-info-card mt-3">
					<h3 className="iz-approvals-info-title">PRs affected</h3>
					<p className="iz-tiny iz-muted">{req.releasedPrNames.join(", ")}</p>
					<p className="iz-tiny iz-muted2 mt-2">
						On approve: paid for hours worked + commissions. They are sent home
						unless you reassign them to another outlet on the roster.
					</p>
				</div>
			) : null}

			{req.rationale?.length ? (
				<div className="iz-approvals-info-card mt-3">
					<h3 className="iz-approvals-info-title">Rationale</h3>
					<ul className="iz-approvals-rationale">
						{req.rationale.map((line) => (
							<li key={line}>{line}</li>
						))}
					</ul>
				</div>
			) : null}

			<RejectSheet
				open={rejectOpen}
				title="Decline cutlost request"
				subtitle={`${req.outletName} · ${cutlostRequestTitle(req)}`}
				placeholder="Reason for declining…"
				confirmLabel="Confirm decline"
				onClose={() => setRejectOpen(false)}
				onConfirm={(reason) => {
					onReject(reason);
					setRejectOpen(false);
				}}
			/>
		</>
	);
}

function LinkRequestDetailPanel({
	link,
	onApprove,
	onReject,
}: {
	link: PendingAgencyLink;
	onApprove: () => void;
	onReject: () => void;
}) {
	const prPhoto = usePrPhotoById()(link.prId, link.prName);
	return (
		<>
			<div className="iz-approvals-detail-head">
				<div className="iz-approvals-detail-profile">
					<ApprovalsAvatar
						name={link.prName}
						id={link.id}
						photo={prPhoto}
						size="lg"
					/>
					<div className="min-w-0">
						<h2 className="iz-approvals-detail-name">{link.prName}</h2>
						<p className="iz-approvals-detail-meta">
							Wants to link to {link.agencyName} · {link.requestedAt}
						</p>
						<IzPill variant="amber" className="mt-1.5">
							Agency-link request
						</IzPill>
					</div>
				</div>
				<div className="iz-approvals-detail-actions">
					<button
						type="button"
						className="iz-btn iz-btn-primary !py-2 !text-xs"
						onClick={onApprove}
					>
						Approve link
					</button>
					<button
						type="button"
						className="iz-btn iz-btn-soft !py-2 !text-xs"
						onClick={onReject}
					>
						Reject
					</button>
				</div>
			</div>

			<div className="iz-approvals-info-grid">
				<div className="iz-approvals-info-card">
					<h3 className="iz-approvals-info-title">Link request</h3>
					<p className="iz-approvals-info-line">
						<UserPlus className="h-3.5 w-3.5 shrink-0" />
						{link.prName} is asking to join {link.agencyName}.
					</p>
					<p className="iz-tiny iz-muted2 mt-1">
						Approve to add them to your roster — they can then be scheduled like
						any tied PR.
					</p>
				</div>
			</div>
		</>
	);
}

/**
 * A PR's MC / leave request on one of its own shifts (a backend assignment
 * sitting at `leave_pending`). Approve excuses the shift with no penalty and
 * releases the slot; reject puts the PR back on it. The backend takes no reason
 * on either decision, so unlike the sign-up and cutlost tabs there is no reason
 * sheet here — asking for one would only discard it.
 */
function LeaveDetailPanel({
	req,
	outletName,
	busy,
	onApprove,
	onReject,
}: {
	req: ShiftAssignment;
	outletName: string;
	busy: boolean;
	onApprove: () => void;
	onReject: () => void;
}) {
	const prName = req.prName ?? "PR";
	const mcPhotos = req.leaveProofPhotos ?? [];
	const prPhoto = usePrPhotoById()(req.prId, req.prName);

	return (
		<>
			<div className="iz-approvals-detail-head">
				<div className="iz-approvals-detail-profile">
					<ApprovalsAvatar
						name={prName}
						id={req.id}
						photo={prPhoto}
						size="lg"
					/>
					<div className="min-w-0">
						<h2 className="iz-approvals-detail-name">{prName}</h2>
						<p className="iz-approvals-detail-meta">
							{outletName} · {req.shiftDate ?? "—"}
						</p>
						<IzPill variant="amber" className="mt-1.5">
							MC / leave request
						</IzPill>
					</div>
				</div>
				{/* Decided requests are the RECORD, not work: the backend rejects a
				    second decision ("Only a pending leave request can be…"), so
				    offering the buttons here would only produce an error. Show what
				    was decided, and when, instead. */}
				{req.leaveStatus && req.leaveStatus !== "pending" ? (
					<div className="iz-approvals-detail-actions">
						<IzPill variant={req.leaveStatus === "approved" ? "green" : "red"}>
							{req.leaveStatus === "approved" ? "Approved" : "Rejected"}
							{req.leaveDecidedAt
								? ` · ${new Date(req.leaveDecidedAt).toLocaleString(undefined, {
										day: "2-digit",
										month: "short",
										year: "numeric",
										hour: "2-digit",
										minute: "2-digit",
									})}`
								: ""}
						</IzPill>
					</div>
				) : (
					<div className="iz-approvals-detail-actions">
						<button
							type="button"
							className="iz-btn iz-btn-primary !py-2 !text-xs"
							disabled={busy}
							onClick={onApprove}
						>
							Approve · excuse shift
						</button>
						<button
							type="button"
							className="iz-btn iz-btn-soft !py-2 !text-xs"
							disabled={busy}
							onClick={onReject}
						>
							Reject
						</button>
					</div>
				)}
			</div>

			{/* The MC picture the PR uploaded — the thing this decision rests on,
			    so it sits above the fold, full width. Click opens the original. */}
			<div className="iz-approvals-info-card mb-3">
				<h3 className="iz-approvals-info-title">MC / supporting document</h3>
				{mcPhotos.length === 0 ? (
					<p className="iz-tiny iz-muted2">
						No photo attached — this request predates the MC-photo rule.
					</p>
				) : (
					<div className="mt-2 flex flex-wrap gap-2">
						{mcPhotos.map((src, i) => (
							<a
								key={`${req.id}-mc-${i}`}
								href={resolveProofPhotoUrl(src)}
								target="_blank"
								rel="noreferrer"
								title="Open full size"
							>
								<img
									src={resolveProofPhotoUrl(src)}
									alt={`MC document ${i + 1} from ${prName}`}
									className="h-32 w-32 rounded-lg border border-white/10 object-cover transition hover:brightness-110"
								/>
							</a>
						))}
					</div>
				)}
			</div>

			<div className="iz-approvals-info-grid">
				<div className="iz-approvals-info-card">
					<h3 className="iz-approvals-info-title">Reason given</h3>
					<p className="iz-tiny iz-muted">
						{req.notes?.trim() ? (
							<>&ldquo;{req.notes.trim()}&rdquo;</>
						) : (
							"No reason given."
						)}
					</p>
				</div>
				<div className="iz-approvals-info-card">
					<h3 className="iz-approvals-info-title">Shift</h3>
					{/*
					 * The night the agency is deciding about: which event, when it runs,
					 * and where. The venue used to sit behind the CLOCK icon — a place
					 * labelled as a time — because the list endpoint was the one query in
					 * the file that never selected `slot`, so there was no time to show.
					 */}
					{req.eventName?.trim() && (
						<p className="iz-approvals-info-line iz-approvals-info-line--lead">
							{req.eventName.trim()}
							<span className="iz-approvals-event-tag">
								{leaveEventKindLabel(req.eventKind)}
							</span>
						</p>
					)}
					<p className="iz-approvals-info-line">
						<Calendar className="h-3.5 w-3.5 shrink-0" />
						{leaveDayLabel(req.shiftDate)}
					</p>
					<p className="iz-approvals-info-line">
						<Clock className="h-3.5 w-3.5 shrink-0" />
						{/* Null when the shift records no window — said plainly rather than
						    left blank, which reads as "still loading". */}
						{req.slot?.trim() || "Shift time not recorded"}
					</p>
					<p className="iz-approvals-info-line">
						<Store className="h-3.5 w-3.5 shrink-0" />
						{outletName}
					</p>
					<p className="iz-tiny iz-muted2 mt-2">
						Approving excuses the PR with no penalty and leaves the shift short
						— it shows up on the roster's backfill worklist for a replacement.
						Rejecting puts the PR back on the shift.
					</p>
				</div>
			</div>
		</>
	);
}

export const Route = createFileRoute("/agency/pending")({
	component: AgencyPending,
	validateSearch: (search: Record<string, unknown>): { tab?: Tab } => ({
		tab:
			search.tab === "cutlost"
				? "cutlost"
				: search.tab === "leaves"
					? "leaves"
					: undefined,
	}),
});

function AgencyPending() {
	const { tab: tabFromSearch } = Route.useSearch();
	const {
		approvePendingPR,
		rejectPendingPR,
		approveCutlostRequest,
		rejectCutlostRequest,
		invitePendingPR,
		approveAgencyLink,
		rejectAgencyLink,
	} = useStore();
	// Decisions must SAY what happened — the server's own sentence, success or
	// the settlement gate's 409. Silence reads as failure and invites a second,
	// harmful click.
	const toast = useStore((s) => s.toast);
	const canApprovePrSignups = useAgencyCan()("approvePrSignups");
	const { date, time } = nowAgencyDateTime();
	const prPhotoById = usePrPhotoById();
	const [tab, setTab] = useState<Tab>("signups");
	const [selectedSignupId, setSelectedSignupId] = useState<string | null>(null);
	const [selectedCutlostId, setSelectedCutlostId] = useState<string | null>(
		null,
	);
	const [selectedLeaveId, setSelectedLeaveId] = useState<string | null>(null);
	const [addOpen, setAddOpen] = useState(false);
	const [invite, setInvite] = useState({
		name: "",
		ic: "",
		mobile: "",
		email: "",
	});

	useEffect(() => {
		if (tabFromSearch) setTab(tabFromSearch);
	}, [tabFromSearch]);

	// The queue itself — sign-ups, link requests, cutlost and MC/leave — comes
	// from the shared hook, so this page and the Today hub's "Pending approvals"
	// tile count the same rows. The tile used to assemble its own from the demo
	// store and read 0 while this page listed real work.
	const queue = useAgencyApprovalQueue();
	const {
		signups,
		linkRequests: agencyLinkRequests,
		cutlostRequests,
		leaveRequests,
		leaveHistory,
		backend,
		cutlost: liveCutlost,
	} = queue;

	/*
	 * Every filter carries its own count. Two of the four had none, so an empty
	 * result was indistinguishable from an unvisited one without clicking —
	 * and "MC/Leaves (0)" sitting above "All (2)" reads as a contradiction
	 * until you know the TAB counts work-to-do while the sub-filter counts the
	 * record.
	 */
	const approvedCount = leaveHistory.filter(
		(r) => r.leaveStatus === "approved",
	).length;
	const rejectedCount = leaveHistory.filter(
		(r) => r.leaveStatus === "rejected",
	).length;

	/**
	 * Which MC/leave rows the list shows. "pending" is the work queue (the
	 * default, so the tab still opens on what needs deciding); the rest are
	 * history. Filtering on leave_status, never `status` — a rejection reverts
	 * `status` to `assigned` and would otherwise be invisible.
	 */
	const [leaveFilter, setLeaveFilter] = useState<
		"pending" | "approved" | "rejected" | "all"
	>("pending");

	/**
	 * The Agency-Tied chips, mirroring the MC/Leaves tuple-map below. "pending"
	 * is the work queue (Current); the rest is the record. Cards carry a
	 * COMPOSITE key: the same membership row can legitimately sit in Approved
	 * history as its approved JOIN and in Rejected history as its refused
	 * DEPARTURE — two decisions about one row — so `userId` alone would
	 * collide under "All".
	 */
	const [tiedFilter, setTiedFilter] = useState<
		"pending" | "approved" | "rejected" | "all"
	>("pending");
	const tiedList = useMemo(() => {
		const withKeys = (list: PendingPR[]) =>
			list.map((p) => ({
				...p,
				cardKey: `${p.id}:${p.status}:${p.requestKind ?? "join"}`,
			}));
		if (tiedFilter === "pending") return withKeys(signups);
		if (tiedFilter === "approved") return withKeys(backend.approvedHistory);
		if (tiedFilter === "rejected") return withKeys(backend.rejectedHistory);
		return withKeys([
			...signups,
			...backend.approvedHistory,
			...backend.rejectedHistory,
		]);
	}, [tiedFilter, signups, backend.approvedHistory, backend.rejectedHistory]);
	const leaveList = useMemo(() => {
		// Newest decision first — history is read backwards.
		const decided = [...leaveHistory].sort((a, b) =>
			(b.leaveDecidedAt ?? "").localeCompare(a.leaveDecidedAt ?? ""),
		);
		if (leaveFilter === "pending") return leaveRequests;
		if (leaveFilter === "all") return [...leaveRequests, ...decided];
		return decided.filter((r) => r.leaveStatus === leaveFilter);
	}, [leaveFilter, leaveRequests, leaveHistory]);

	// The MC/leave decision lives here — this page is its only review surface.
	// The "roster"-prefixed query keys are deliberate: the roster's planning grid
	// and backfill panel share them, so a decision here refreshes those too.
	const { logout } = useAuth();
	const rosterMut = useRosterMutations();
	const outletsQuery = useQuery({
		queryKey: ["roster", "outlets"],
		queryFn: () => fetchOutlets({ pageSize: 500 }, logout),
		staleTime: 60_000,
	});
	const outletNameById = useMemo(
		() => new Map((outletsQuery.data?.data ?? []).map((o) => [o.id, o.name])),
		[outletsQuery.data],
	);
	const leaveOutletName = (req: ShiftAssignment) =>
		(req.outletId ? outletNameById.get(req.outletId) : undefined) ?? "Outlet";
	const leaveBusy =
		rosterMut.approveLeave.isPending || rosterMut.rejectLeave.isPending;

	useEffect(() => {
		if (tab === "signups") {
			setSelectedSignupId((id) => {
				// Selection is by CARD KEY (id:status:kind), not bare userId — one
				// row can appear twice under "All" as two different decisions.
				const ids = [
					...tiedList.map((s) => s.cardKey),
					...agencyLinkRequests.map((l) => l.id),
				];
				return id && ids.includes(id) ? id : (ids[0] ?? null);
			});
		} else if (tab === "cutlost") {
			setSelectedCutlostId((id) =>
				id && cutlostRequests.some((r) => r.id === id)
					? id
					: (cutlostRequests[0]?.id ?? null),
			);
		} else {
			setSelectedLeaveId((id) =>
				id && leaveList.some((r) => r.id === id)
					? id
					: (leaveList[0]?.id ?? null),
			);
		}
	}, [tab, tiedList, agencyLinkRequests, cutlostRequests, leaveList]);

	const selectedSignup =
		tiedList.find((s) => s.cardKey === selectedSignupId) ?? null;
	const selectedLink =
		agencyLinkRequests.find((l) => l.id === selectedSignupId) ?? null;
	const selectedCutlost =
		cutlostRequests.find((r) => r.id === selectedCutlostId) ?? null;
	// Searched across BOTH lists: a request stays selected after you decide it,
	// when it moves out of the queue and into history.
	const selectedLeave =
		leaveRequests.find((r) => r.id === selectedLeaveId) ??
		leaveHistory.find((r) => r.id === selectedLeaveId) ??
		null;

	if (!canApprovePrSignups) {
		return (
			<div className="iz-screen iz-approvals-page">
				<IzCard className="text-center">
					<p className="iz-sm iz-muted">
						Finance role cannot approve PR sign-ups.
					</p>
				</IzCard>
			</div>
		);
	}

	return (
		<div className="iz-screen iz-approvals-page">
			<div className="iz-approvals-layout">
				<aside className="iz-approvals-sidebar">
					<header className="iz-approvals-sidebar-head">
						<h1 className="iz-approvals-title">Approvals</h1>
						<p className="iz-tiny iz-muted2 mt-0.5">
							{date} · {time}
						</p>
					</header>

					<div className="iz-approvals-tabs">
						<button
							type="button"
							className={cn("iz-approvals-tab", tab === "signups" && "on")}
							onClick={() => setTab("signups")}
						>
							Agency-Tied ({signups.length + agencyLinkRequests.length})
						</button>
						<button
							type="button"
							className={cn("iz-approvals-tab", tab === "cutlost" && "on")}
							onClick={() => setTab("cutlost")}
						>
							Cutlost ({cutlostRequests.length})
						</button>
						<button
							type="button"
							className={cn("iz-approvals-tab", tab === "leaves" && "on")}
							onClick={() => setTab("leaves")}
						>
							{/* "(0)" while the query is still in flight reads as "there are
							    none", which is a different claim from "not known yet" — and
							    it is the claim that made a pending request look deleted. */}
							MC/Leaves ({queue.leaveIsLoading ? "…" : leaveRequests.length})
						</button>
					</div>

					{tab === "signups" && (
						<button
							type="button"
							className="iz-approvals-add-btn"
							onClick={() => setAddOpen(true)}
						>
							<UserPlus className="h-3.5 w-3.5" />
							Add PR
						</button>
					)}

					<div className="iz-approvals-list">
						{tab === "signups" ? (
							<>
								{/* Same tuple-map as the MC/Leaves chips below — Current is
								    the work queue, the rest is the record. */}
								<div className="iz-approvals-subfilter mb-2 flex flex-wrap gap-1">
									{(
										[
											[
												"pending",
												`Current (${signups.length + agencyLinkRequests.length})`,
											],
											[
												"approved",
												`Approved (${backend.approvedHistory.length})`,
											],
											[
												"rejected",
												`Rejected (${backend.rejectedHistory.length})`,
											],
											[
												"all",
												`All (${signups.length + agencyLinkRequests.length + backend.approvedHistory.length + backend.rejectedHistory.length})`,
											],
										] as const
									).map(([value, label]) => (
										<button
											key={value}
											type="button"
											className={cn(
												"iz-chip iz-tiny",
												tiedFilter === value && "on",
											)}
											onClick={() => setTiedFilter(value)}
										>
											{label}
										</button>
									))}
								</div>
								{tiedList.length === 0 &&
								((tiedFilter !== "pending" && tiedFilter !== "all") ||
									agencyLinkRequests.length === 0) ? (
									<p className="iz-tiny iz-muted px-1 py-4 text-center">
										{tiedFilter === "pending"
											? "No pending sign-ups"
											: "No records here"}
									</p>
								) : (
									<>
										{tiedList.map((p) => {
											const galleryCount = portfolioFilledCount(
												p.portfolioPhotos ?? [],
											);
											const comcardReady = comcardTabMeta(p).ready;
											const floorName = pendingFloorNickname(p);
											const legalName = pendingLegalIcName(p);
											return (
												<button
													key={p.cardKey}
													type="button"
													className={cn(
														"iz-approvals-list-item",
														selectedSignupId === p.cardKey && "on",
													)}
													onClick={() => setSelectedSignupId(p.cardKey)}
												>
													<ApprovalsAvatar
														name={floorName}
														id={p.id}
														photo={pendingPrPhoto(p)}
														size="sm"
													/>
													<div className="min-w-0 flex-1">
														<span className="name">{floorName}</span>
														<span className="sub">
															{legalName ? `Legal · ${legalName} · ` : ""}
															{p.languages}
														</span>
														<span className="badges">
															{/* WHICH WAY the request runs — approving a
														    join takes the PR under the agency;
														    approving a leave lets them go. The two
														    must never look alike. */}
															<span
																className={cn(
																	"iz-approvals-verify-badge",
																	p.requestKind === "leave"
																		? "missing"
																		: "gallery",
																)}
															>
																{p.requestKind === "leave"
																	? p.status === "approved"
																		? "Departure approved"
																		: p.status === "rejected"
																			? "Departure rejected"
																			: "Leave request"
																	: p.status === "approved"
																		? "Member"
																		: p.status === "rejected"
																			? "Join rejected"
																			: "Join request"}
															</span>
															<VerificationBadge
																ok={!!p.hasIcPhotos}
																label="IC"
															/>
															<VerificationBadge
																ok={!!p.hasSelfie}
																label="Profile picture"
															/>
															<VerificationBadge
																ok={galleryCount > 0}
																label="Gallery"
																count={galleryCount}
															/>
															<VerificationBadge
																ok={comcardReady}
																label="Comcard"
																variant="comcard"
															/>
														</span>
													</div>
												</button>
											);
										})}
										{/* Demo link requests are CURRENT work (join semantics, no
										    leave analog) — they have no place under history chips. */}
										{(tiedFilter === "pending" || tiedFilter === "all") &&
											agencyLinkRequests.map((l) => (
												<button
													key={l.id}
													type="button"
													className={cn(
														"iz-approvals-list-item",
														selectedSignupId === l.id && "on",
													)}
													onClick={() => setSelectedSignupId(l.id)}
												>
													<ApprovalsAvatar
														name={l.prName}
														id={l.id}
														photo={prPhotoById(l.prId, l.prName)}
														size="sm"
													/>
													<div className="min-w-0 flex-1">
														<span className="name">{l.prName}</span>
														<span className="sub">
															Wants to link · {l.requestedAt}
														</span>
														<span className="badges">
															<span className="iz-approvals-verify-badge gallery">
																Link request
															</span>
														</span>
													</div>
												</button>
											))}
									</>
								)}
							</>
						) : tab === "leaves" ? (
							<>
								{/* Current vs history. Counts come from the two queries, so
								    "Pending" is work-to-do and the rest is the record. */}
								<div className="iz-approvals-subfilter mb-2 flex flex-wrap gap-1">
									{(
										[
											["pending", `Current (${leaveRequests.length})`],
											["approved", `Approved (${approvedCount})`],
											["rejected", `Rejected (${rejectedCount})`],
											[
												"all",
												`All (${leaveRequests.length + leaveHistory.length})`,
											],
										] as const
									).map(([value, label]) => (
										<button
											key={value}
											type="button"
											className={cn(
												"iz-chip iz-tiny",
												leaveFilter === value && "on",
											)}
											onClick={() => setLeaveFilter(value)}
										>
											{label}
										</button>
									))}
								</div>
								{queue.leaveIsLoading || queue.leaveHistoryIsLoading ? (
									<p className="iz-tiny iz-muted px-1 py-4 text-center">
										Loading MC / leave requests…
									</p>
								) : leaveList.length === 0 ? (
									<p className="iz-tiny iz-muted px-1 py-4 text-center">
										{leaveFilter === "pending"
											? "No MC / leave requests waiting"
											: "No MC / leave records here"}
									</p>
								) : (
									leaveList.map((req) => (
										<button
											key={req.id}
											type="button"
											className={cn(
												"iz-approvals-list-item",
												selectedLeaveId === req.id && "on",
											)}
											onClick={() => setSelectedLeaveId(req.id)}
										>
											<ApprovalsAvatar
												name={req.prName ?? "PR"}
												id={req.id}
												photo={prPhotoById(req.prId, req.prName)}
												size="sm"
											/>
											<div className="min-w-0 flex-1">
												<span className="name">{req.prName ?? "PR"}</span>
												<span className="sub">
													{leaveOutletName(req)} · {req.shiftDate ?? "—"}
												</span>
												<span className="badges">
													<span
														className={cn(
															"iz-approvals-verify-badge",
															req.leaveStatus === "approved"
																? "ok"
																: req.leaveStatus === "rejected"
																	? "bad"
																	: "gallery",
														)}
													>
														{req.leaveStatus === "approved"
															? "Approved"
															: req.leaveStatus === "rejected"
																? "Rejected"
																: "Awaiting decision"}
													</span>
													{req.leaveDecidedAt ? (
														<span className="iz-tiny iz-muted">
															{new Date(req.leaveDecidedAt).toLocaleDateString(
																undefined,
																{ day: "2-digit", month: "short" },
															)}
														</span>
													) : null}
												</span>
											</div>
										</button>
									))
								)}
							</>
						) : cutlostRequests.length === 0 ? (
							<p className="iz-tiny iz-muted px-1 py-4 text-center">
								No cutlost requests
							</p>
						) : (
							cutlostRequests.map((req) => (
								<button
									key={req.id}
									type="button"
									className={cn(
										"iz-approvals-list-item",
										selectedCutlostId === req.id && "on",
									)}
									onClick={() => setSelectedCutlostId(req.id)}
								>
									<span className="iz-approvals-cutlost-icon sm">
										{req.kind === "best_effort" ? (
											<Sparkles className="h-3.5 w-3.5" />
										) : req.kind === "release_prs" ? (
											<UserMinus className="h-3.5 w-3.5" />
										) : (
											<TrendingDown className="h-3.5 w-3.5" />
										)}
									</span>
									<div className="min-w-0 flex-1">
										<span className="name">{req.outletName}</span>
										<span className="sub">{cutlostRequestTitle(req)}</span>
										<span className="badges">
											<span className="iz-approvals-verify-badge gallery">
												~RM{" "}
												{Math.round(req.estimatedSavings).toLocaleString(
													"en-MY",
												)}
											</span>
										</span>
									</div>
								</button>
							))
						)}
					</div>
				</aside>

				<main className="iz-approvals-detail">
					{tab === "signups" ? (
						selectedSignup ? (
							<SignupDetailPanel
								signup={selectedSignup}
								onApprove={() =>
									backend.backed
										? backend.approve(selectedSignup.id, {
												// The server's OWN sentence, both ways — "Departure
												// approved", or the settlement gate's 409 listing
												// what is still unsettled. Never silence.
												onSuccess: (m) => toast(m, "success"),
												onError: (m) => toast(m, "warn"),
											})
										: approvePendingPR(selectedSignup.id)
								}
								onReject={(reason) =>
									backend.backed
										? backend.reject(selectedSignup.id, reason, {
												onSuccess: (m) => toast(m, "success"),
												onError: (m) => toast(m, "warn"),
											})
										: rejectPendingPR(selectedSignup.id, reason)
								}
							/>
						) : selectedLink ? (
							<LinkRequestDetailPanel
								link={selectedLink}
								onApprove={() => approveAgencyLink(selectedLink.id)}
								onReject={() => rejectAgencyLink(selectedLink.id)}
							/>
						) : (
							<div className="iz-approvals-empty">
								<p className="iz-sm iz-muted">Select a sign-up to review</p>
							</div>
						)
					) : tab === "leaves" ? (
						selectedLeave ? (
							<LeaveDetailPanel
								req={selectedLeave}
								outletName={leaveOutletName(selectedLeave)}
								busy={leaveBusy}
								onApprove={() =>
									rosterMut.approveLeave.mutate(selectedLeave.id)
								}
								onReject={() => rosterMut.rejectLeave.mutate(selectedLeave.id)}
							/>
						) : (
							<div className="iz-approvals-empty">
								<p className="iz-sm iz-muted">
									Select an MC / leave request to review
								</p>
							</div>
						)
					) : selectedCutlost ? (
						<CutlostDetailPanel
							req={selectedCutlost}
							// Approving is what RELEASES people — it seals a pro-rated wage
							// on every named PR — so on a real session it must reach the
							// server. The store actions stay for the demo logins.
							onApprove={() => {
								if (liveCutlost.backed) {
									void liveCutlost.decide({
										id: selectedCutlost.id,
										decision: "approve",
									});
									return;
								}
								approveCutlostRequest(selectedCutlost.id);
							}}
							onReject={(reason) => {
								if (liveCutlost.backed) {
									void liveCutlost.decide({
										id: selectedCutlost.id,
										decision: "reject",
										reason,
									});
									return;
								}
								rejectCutlostRequest(selectedCutlost.id, reason);
							}}
						/>
					) : (
						<div className="iz-approvals-empty">
							<p className="iz-sm iz-muted">
								Select a cutlost request to review
							</p>
						</div>
					)}
				</main>
			</div>

			{addOpen && (
				<IzSheet open onClose={() => setAddOpen(false)}>
					<div className="iz-sheet-head">
						<div>
							<button
								type="button"
								className="iz-chip mb-2 !px-2 !py-1 !text-[10px]"
								onClick={() => setAddOpen(false)}
							>
								← Back
							</button>
							<h3>Owner-initiated onboarding</h3>
						</div>
						<button
							type="button"
							className="iz-sheet-close"
							onClick={() => setAddOpen(false)}
							aria-label="Close"
						>
							<X className="h-4 w-4" />
						</button>
					</div>
					<p className="iz-tiny iz-muted mb-3">
						Enter IC + contact → invite sent to complete profile
					</p>
					{(["name", "ic", "mobile", "email"] as const).map((field) => (
						<div key={field} className="mb-2">
							<span className="iz-field-label capitalize">{field}</span>
							<input
								className="iz-field-input !text-sm"
								value={invite[field]}
								onChange={(e) =>
									setInvite((v) => ({ ...v, [field]: e.target.value }))
								}
							/>
						</div>
					))}
					<button
						type="button"
						className="iz-btn iz-btn-primary mt-2 w-full"
						disabled={!invite.name || !invite.ic}
						onClick={() => {
							if (backend.backed) backend.invite(invite);
							else invitePendingPR(invite);
							setAddOpen(false);
							setInvite({ name: "", ic: "", mobile: "", email: "" });
						}}
					>
						Send invite
					</button>
				</IzSheet>
			)}
		</div>
	);
}
