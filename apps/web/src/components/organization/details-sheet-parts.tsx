import {
	Ban,
	CalendarDays,
	CheckCircle2,
	CircleCheckBig,
	Clock,
	Info,
	Loader2,
	Minus,
	Plus,
	RotateCcw,
	UserCog,
	UserRound,
	X,
} from "lucide-react";
import {
	type ComponentType,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { env } from "@/env";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { getR2PublicBase } from "@/lib/proof-photo";
import { formatDate } from "@/lib/utils";
import {
	type OrgStatus,
	orgStatusBadgeColors,
	orgStatusLabel,
} from "./org-status";

const DEFAULT_PROFILE_IMAGE = "/img/blank-profile-picture.png";

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const ZOOM_STEP = 0.5;

/**
 * Full-screen image viewer with zoom and pan, for identity scans.
 *
 * WHY IT EXISTS when `agency-portal/.../ProofPhotoViewer.tsx` already has a
 * `PhotoLightbox`: that one is styled with `iz-*` classes from
 * `agency-portal/prototype-theme.css`, which the agency shell imports and
 * `styles.css` does not. Reusing it here would have rendered its whole toolbar
 * unstyled on the admin pages. The behaviour below is deliberately the same
 * design as that component's, including the two lessons it paid for:
 *
 *  1. PORTALLED TO <body>, z-300. This opens from inside a Sheet, and a
 *     translucent transformed ancestor becomes the containing block for
 *     `position: fixed`, trapping z-index in its own stacking context. No
 *     z-index wins that from within the subtree; the layer has to leave it.
 *  2. Wheel zoom on a NATIVE listener with `{ passive: false }`. React registers
 *     wheel handlers passively, so `preventDefault` inside `onWheel` is ignored
 *     and warns — the scan would zoom AND the page behind the backdrop would
 *     scroll away underneath it.
 *
 * Pan is enabled only above 1×: dragging an unzoomed image does nothing useful
 * and makes the backdrop feel broken.
 */
export function ScanLightbox({
	src,
	alt,
	onClose,
}: {
	src: string;
	alt: string;
	onClose: () => void;
}) {
	const { t } = usePortalLocale();
	const [zoom, setZoom] = useState(1);
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const [dragFrom, setDragFrom] = useState<{ x: number; y: number } | null>(
		null,
	);

	// The wheel handler needs the CURRENT zoom without re-binding a native
	// listener on every zoom change, so it reads this rather than the state.
	const zoomRef = useRef(1);
	zoomRef.current = zoom;
	const surfaceRef = useRef<HTMLDivElement | null>(null);

	const zoomTo = useCallback((next: number) => {
		const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
		setZoom(clamped);
		// Snapping back to centre at 1× stops the scan being left parked
		// off-screen from an earlier pan, which reads as a failed load.
		if (clamped === MIN_ZOOM) setOffset({ x: 0, y: 0 });
	}, []);

	useEffect(() => {
		const el = surfaceRef.current;
		if (!el) return;
		// Exponential rather than a fixed step: a trackpad emits many small deltas
		// and a mouse wheel a few large ones, and multiplying keeps both feeling
		// like one gesture. The buttons keep their coarse step.
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			zoomTo(zoomRef.current * Math.exp(-e.deltaY * 0.0015));
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [zoomTo]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
			if (e.key === "+" || e.key === "=") zoomTo(zoomRef.current + ZOOM_STEP);
			if (e.key === "-") zoomTo(zoomRef.current - ZOOM_STEP);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose, zoomTo]);

	return createPortal(
		<div
			// This layer IS a modal: the role gives the mouse handler something to
			// hang off, and tells assistive tech the sheet behind it is inert.
			role="dialog"
			aria-modal="true"
			aria-label={alt}
			ref={surfaceRef}
			className="fixed inset-0 z-[300] flex flex-col bg-black/85 backdrop-blur-sm"
			/**
			 * `pointerEvents: auto` is LOAD-BEARING, not defensive styling.
			 *
			 * Radix sets `pointer-events: none` on <body> for as long as a modal
			 * Sheet is open, so that nothing behind it can be clicked. This layer is
			 * portalled to <body> to escape the Sheet's stacking context, which puts
			 * it OUTSIDE the subtree Radix re-enables — so it inherited the block and
			 * every button in the toolbar silently did nothing.
			 *
			 * The symptom is worth remembering: a programmatic `.click()` still
			 * worked and the zoom state updated correctly, because dispatching an
			 * event bypasses hit-testing entirely. Only a real pointer was refused.
			 * "The handler is fine, so the button is fine" is exactly the wrong
			 * conclusion — the handler was never the thing being blocked.
			 */
			style={{ pointerEvents: "auto" }}
			// Backdrop click closes; a click on the image must not, or a pan that
			// ends over the backdrop would dismiss the viewer mid-drag.
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div className="flex items-center gap-2 p-3">
				<span className="mr-auto truncate text-sm text-white/70">{alt}</span>
				<Button
					size="sm"
					variant="secondary"
					className="h-8 px-2"
					onClick={() => zoomTo(zoom - ZOOM_STEP)}
					disabled={zoom <= MIN_ZOOM}
					aria-label={t.adminPr.zoomOut}
				>
					<Minus className="h-4 w-4" />
				</Button>
				<span className="w-14 text-center text-sm tabular-nums text-white/70">
					{Math.round(zoom * 100)}%
				</span>
				<Button
					size="sm"
					variant="secondary"
					className="h-8 px-2"
					onClick={() => zoomTo(zoom + ZOOM_STEP)}
					disabled={zoom >= MAX_ZOOM}
					aria-label={t.adminPr.zoomIn}
				>
					<Plus className="h-4 w-4" />
				</Button>
				<Button
					size="sm"
					variant="secondary"
					className="h-8 px-2"
					onClick={() => {
						setZoom(1);
						setOffset({ x: 0, y: 0 });
					}}
					aria-label={t.adminPr.zoomReset}
				>
					<RotateCcw className="h-4 w-4" />
				</Button>
				<Button
					size="sm"
					variant="secondary"
					className="h-8 px-2"
					onClick={onClose}
					aria-label={t.common.close}
				>
					<X className="h-4 w-4" />
				</Button>
			</div>

			<div className="flex flex-1 items-center justify-center overflow-hidden p-4">
				{/* A real <button> carries the gesture, not the <img>.
				    Putting `role="button"` on the image satisfied nothing: an image
				    is non-interactive, so the role was flagged twice over, and the
				    hand-rolled Enter/Space handler was re-implementing what a button
				    does natively. Dragging still pans, because mousedown calls
				    preventDefault before the button can start a selection, and the
				    click that ends a drag is ignored while zoomed in. */}
				<button
					type="button"
					aria-label={alt}
					className={
						zoom > MIN_ZOOM
							? dragFrom
								? "flex max-h-full cursor-grabbing items-center justify-center"
								: "flex max-h-full cursor-grab items-center justify-center"
							: "flex max-h-full cursor-zoom-in items-center justify-center"
					}
					onMouseDown={(e) => {
						if (zoom <= MIN_ZOOM) return;
						e.preventDefault();
						setDragFrom({ x: e.clientX - offset.x, y: e.clientY - offset.y });
					}}
					onMouseMove={(e) => {
						if (!dragFrom) return;
						setOffset({ x: e.clientX - dragFrom.x, y: e.clientY - dragFrom.y });
					}}
					onMouseUp={() => setDragFrom(null)}
					onMouseLeave={() => setDragFrom(null)}
					// Click-to-zoom, so the first instinct on a too-small scan works
					// without hunting for the toolbar. Enter and Space reach this too.
					onClick={() => zoomTo(zoom > MIN_ZOOM ? MIN_ZOOM : 2.5)}
				>
					<img
						src={src}
						alt={alt}
						draggable={false}
						className="max-h-full max-w-full select-none"
						style={{
							transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
							transition: dragFrom ? "none" : "transform 120ms ease-out",
						}}
					/>
				</button>
			</div>
		</div>,
		document.body,
	);
}

/** Resolve a stored asset ref (R2 key, full URL, or /img/…) to a browser URL. */
export function apiAssetUrl(
	path: string | null | undefined,
): string | undefined {
	if (!path || path === DEFAULT_PROFILE_IMAGE) return undefined;
	if (/^https?:\/\//.test(path) || path.startsWith("data:")) return path;
	// R2 object key stored in DB — prepend public base from env or /auth/me.
	if (
		path.startsWith("user/") ||
		path.startsWith("agency/") ||
		path.startsWith("outlet/")
	) {
		const r2 = getR2PublicBase();
		return r2 ? `${r2}/${path}` : undefined;
	}
	const normalized = path.startsWith("/") ? path : `/${path}`;
	// In local Vite, backend /img paths (users/pr/outlets/agencies) are proxied
	// same-origin so gallery photos and logos load without CORP issues.
	if (import.meta.env.DEV && normalized.startsWith("/img/")) {
		return normalized;
	}
	// Static assets are served at the server root (/img/...), not under /api.
	const base = env.VITE_API_URL.replace(/\/$/, "").replace(/\/api(\/v1)?$/, "");
	return `${base}${normalized}`;
}

export function DetailsHero({
	name,
	subtitle,
	status,
	meta,
	imageUrl,
}: {
	name: string;
	subtitle?: string | null;
	status: OrgStatus | string;
	meta?: ReactNode;
	imageUrl?: string;
}) {
	const { t } = usePortalLocale();
	const initial = name.trim().charAt(0).toUpperCase() || "?";
	const badgeClass =
		orgStatusBadgeColors[status as OrgStatus] ??
		"border-muted-foreground/30 bg-muted text-muted-foreground";
	const badgeLabel = orgStatusLabel(status, t);
	const [broken, setBroken] = useState(false);
	const showImage = Boolean(imageUrl) && !broken;

	// biome-ignore lint/correctness/useExhaustiveDependencies(imageUrl): imageUrl is the reset TRIGGER, not a value the effect reads — a new photo has to clear the previous one's load failure. Drop it and `broken` only ever resets on mount, so once one image 404s every later one stays hidden behind the initial.
	useEffect(() => {
		setBroken(false);
	}, [imageUrl]);

	return (
		<div className="flex flex-col items-center gap-2 py-5 text-center">
			{showImage ? (
				<img
					src={imageUrl}
					alt={fill(t.adminOrg.profilePhotoAlt, { name })}
					onError={() => setBroken(true)}
					className="h-28 w-28 rounded-full border border-(--lavender-soft)/40 bg-black object-contain p-1.5"
				/>
			) : (
				<div className="flex h-28 w-28 items-center justify-center rounded-full bg-[color:var(--lavender-soft)] text-3xl font-bold text-lavender">
					{initial}
				</div>
			)}
			<div className="mt-2 text-2xl font-bold leading-tight">{name}</div>
			{subtitle && (
				<div className="text-base text-muted-foreground">{subtitle}</div>
			)}
			<Badge variant="outline" className={`capitalize ${badgeClass}`}>
				{badgeLabel}
			</Badge>
			{meta}
		</div>
	);
}

export function DetailField({
	icon: Icon,
	label,
	value,
	href,
}: {
	icon: ComponentType<{ className?: string }>;
	label: string;
	value: string | null | undefined;
	href?: string;
}) {
	return (
		<div className="flex items-start gap-3">
			<Icon className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
			<div className="min-w-0">
				<div className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
					{label}
				</div>
				{value && href ? (
					<a
						href={href}
						className="break-words text-lg font-medium text-primary hover:underline"
					>
						{value}
					</a>
				) : (
					<div className="break-words text-lg font-medium">{value || "—"}</div>
				)}
			</div>
		</div>
	);
}

export function DetailSection({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<div className="space-y-3">
			<div>
				<p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
					{title}
				</p>
				{description && (
					<p className="text-base text-muted-foreground/80">{description}</p>
				)}
			</div>
			<div className="grid grid-cols-1 gap-5 rounded-md border border-(--lavender-soft)/25 bg-muted/30 px-5 py-5 sm:grid-cols-2">
				{children}
			</div>
		</div>
	);
}

/** Shorten uuid-like actor ids for display; keep names like "system" as-is. */
function formatActor(actor: string | null | undefined): string {
	if (!actor) return "—";
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
		actor,
	)
		? `${actor.slice(0, 8)}…`
		: actor;
}

export function SystemInfoCard({
	createdBy,
	createdAt,
	updatedBy,
	updatedAt,
}: {
	createdBy: string | null | undefined;
	createdAt: string | null | undefined;
	updatedBy: string | null | undefined;
	updatedAt: string | null | undefined;
}) {
	const { t } = usePortalLocale();
	return (
		<div className="space-y-3 rounded-lg border border-(--lavender-soft)/30 bg-card p-5">
			<div className="flex items-center gap-2 text-base font-bold">
				<Info className="h-5 w-5 text-lavender" />
				{t.adminOrg.systemInformation}
			</div>
			<div className="grid grid-cols-1 gap-5 rounded-md bg-muted/30 px-5 py-5 sm:grid-cols-2">
				<DetailField
					icon={UserRound}
					label={t.adminOrg.createdBy}
					value={formatActor(createdBy)}
				/>
				<DetailField
					icon={CalendarDays}
					label={t.adminOrg.createdAt}
					value={createdAt ? formatDate(createdAt) : null}
				/>
				<DetailField
					icon={UserCog}
					label={t.adminOrg.updatedBy}
					value={formatActor(updatedBy)}
				/>
				<DetailField
					icon={Clock}
					label={t.adminOrg.updatedAt}
					value={updatedAt ? formatDate(updatedAt) : null}
				/>
			</div>
		</div>
	);
}

/**
 * Colour only. The card's heading is `orgStatusLabel`, so the badge in the hero
 * and the heading here cannot drift into two wordings for one status.
 */
const approvalStatusClass: Record<OrgStatus, string> = {
	pending_review:
		"border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
	active:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
	suspended:
		"border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
	inactive: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

/**
 * The same Approval Status card for a PERSON — a PR or an admin account — where
 * the status lives on `user.status` (active | inactive | blocked) and the
 * switch is PATCH /user/:id/status. The confirm is the page's own account
 * dialog (`useAccountActions`), so this card only asks; it never writes.
 * Owner, 2 Sep 2026: "for all the roles, admin can set the user approval
 * status to inactive to make the user cannot login — activate and deactivate
 * button". `inactive` is refused at login and on every request.
 */
export function AccountStatusCard({
	status,
	busy,
	onSetStatus,
}: {
	status: string;
	busy: boolean;
	onSetStatus: (next: "active" | "inactive") => void;
}) {
	const { t } = usePortalLocale();
	const active = status === "active";
	const label = active
		? t.admin.statusActive
		: status === "inactive"
			? t.admin.statusInactive
			: status;
	const description = active
		? t.adminOrg.accountActiveBody
		: status === "inactive"
			? t.adminOrg.accountInactiveBody
			: t.adminOrg.accountBlockedBody;
	const tone = active
		? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
		: status === "inactive"
			? "border-muted-foreground/30 bg-muted text-muted-foreground"
			: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400";
	return (
		<div className="space-y-3 rounded-lg border-l-4 border-(--lavender-soft) bg-card p-4">
			<div className="flex items-center gap-2 text-base font-bold">
				<CircleCheckBig className="h-5 w-5 text-lavender" />
				{t.adminOrg.approvalStatus}
			</div>
			<div className={`rounded-md border px-4 py-3 ${tone}`}>
				<div className="text-base font-bold">{label}</div>
				<div className="text-sm opacity-90">{description}</div>
			</div>
			<div className="flex flex-wrap gap-2 pt-1">
				{active ? (
					<Button
						size="sm"
						variant="destructive"
						disabled={busy}
						onClick={() => onSetStatus("inactive")}
					>
						{busy ? (
							<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
						) : (
							<Ban className="mr-1 h-3.5 w-3.5" />
						)}
						{t.adminOrg.setInactive}
					</Button>
				) : (
					<Button
						size="sm"
						disabled={busy}
						onClick={() => onSetStatus("active")}
					>
						{busy ? (
							<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
						) : (
							<CheckCircle2 className="mr-1 h-3.5 w-3.5" />
						)}
						{t.adminOrg.activate}
					</Button>
				)}
			</div>
		</div>
	);
}

export function ApprovalStatusCard({
	status,
	entityLabel,
	busy,
	onApprove,
	onDeactivate,
}: {
	status: OrgStatus;
	/**
	 * The word for the kind of organisation, landing MID-sentence in all four
	 * descriptions below. It must arrive already translated — the call site
	 * passes `t.adminOrg.entityAgency` / `t.adminOrg.entityOutlet`, never the
	 * stored "agency" / "outlet".
	 */
	entityLabel: string;
	busy: boolean;
	onApprove: () => void;
	/** The hard off switch — `inactive` refuses every login; confirmed in place. */
	onDeactivate: () => void;
}) {
	const { t } = usePortalLocale();
	const [confirmingInactive, setConfirmingInactive] = useState(false);
	const description =
		status === "pending_review"
			? fill(t.adminOrg.approvalPendingBody, { entity: entityLabel })
			: status === "active"
				? fill(t.adminOrg.approvalActiveBody, { entity: entityLabel })
				: status === "suspended"
					? fill(t.adminOrg.approvalSuspendedBody, { entity: entityLabel })
					: fill(t.adminOrg.approvalInactiveBody, { entity: entityLabel });

	return (
		<div className="space-y-3 rounded-lg border-l-4 border-(--lavender-soft) bg-card p-4">
			<div className="flex items-center gap-2 text-base font-bold">
				<CircleCheckBig className="h-5 w-5 text-lavender" />
				{t.adminOrg.approvalStatus}
			</div>
			<div
				className={`rounded-md border px-4 py-3 ${approvalStatusClass[status]}`}
			>
				<div className="text-base font-bold">{orgStatusLabel(status, t)}</div>
				<div className="text-sm opacity-90">{description}</div>
			</div>
			<div className="flex flex-wrap gap-2 pt-1">
				{status === "pending_review" && (
					<Button size="sm" disabled={busy} onClick={onApprove}>
						{busy ? (
							<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
						) : (
							<CheckCircle2 className="mr-1 h-3.5 w-3.5" />
						)}
						{t.common.approve}
					</Button>
				)}
				{status === "suspended" && (
					<Button size="sm" disabled={busy} onClick={onApprove}>
						{busy ? (
							<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
						) : (
							<CheckCircle2 className="mr-1 h-3.5 w-3.5" />
						)}
						{t.adminOrg.activate}
					</Button>
				)}
				{status === "inactive" && (
					<Button size="sm" disabled={busy} onClick={onApprove}>
						{busy ? (
							<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
						) : (
							<CheckCircle2 className="mr-1 h-3.5 w-3.5" />
						)}
						{t.adminOrg.activate}
					</Button>
				)}
				{/* INACTIVE is the state that actually locks people out (owner, 2 Sep
				    2026); Suspend keeps a profile-only session. Two presses, and the
				    second names what happens, because this ends every open session. */}
				{(status === "active" || status === "suspended") &&
					!confirmingInactive && (
						<Button
							size="sm"
							variant="destructive"
							disabled={busy}
							onClick={() => setConfirmingInactive(true)}
						>
							<Ban className="mr-1 h-3.5 w-3.5" />
							{t.adminOrg.setInactive}
						</Button>
					)}
				{status === "pending_review" && (
					<span className="flex items-center gap-1 text-sm text-muted-foreground">
						<Clock className="h-4 w-4" />
						{t.adminOrg.awaitingFirstApproval}
					</span>
				)}
			</div>
			{confirmingInactive && (
				<div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm">
					<p>{fill(t.adminOrg.setInactiveBody, { entity: entityLabel })}</p>
					<div className="mt-2 flex flex-wrap gap-2">
						<Button
							size="sm"
							variant="outline"
							disabled={busy}
							onClick={() => setConfirmingInactive(false)}
						>
							{t.common.cancel}
						</Button>
						<Button
							size="sm"
							variant="destructive"
							disabled={busy}
							onClick={() => {
								setConfirmingInactive(false);
								onDeactivate();
							}}
						>
							{t.adminOrg.confirmSetInactive}
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
