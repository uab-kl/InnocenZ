import { Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { resolveProofPhotoUrl } from "@/lib/proof-photo";

/**
 * A proof photo is an opaque string — the PR app sends a data URL or an R2
 * object key (resolve keys with `resolveProofPhotoUrl` FIRST), older rows hold
 * a path. Rendering a path as an image gives a broken icon, which reads as
 * "the evidence is missing" — the one thing these panels must never say by
 * accident. So render only what is certainly renderable, and print the rest as
 * the reference it is.
 *
 * Lived as a private copy in THREE components before this (PayrollVerifyPanel,
 * AgencyReceiptsPanel, DisputeQueuePanel). One rule about what counts as
 * evidence, in one place.
 */
export const isRenderablePhoto = (photo: string) =>
	photo.startsWith("data:image/") ||
	photo.startsWith("https://") ||
	photo.startsWith("http://");

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const STEP = 0.5;

/**
 * Full-screen viewer with zoom and pan.
 *
 * WHY IN-APP rather than opening the data URL in a tab, which is what these
 * panels did: a receipt photographed on a phone is often unreadable at thumbnail
 * size — the order number and the printed total are the two things the agency
 * must check against the screen, and both are small, angled and low contrast. A
 * new tab shows it fit-to-window, frequently still too small, and it takes the
 * reviewer off the voucher they were deciding.
 *
 * Pan is enabled only above 1× — dragging an unzoomed photo does nothing useful
 * and makes the backdrop feel broken. Escape closes, matching every other
 * dismissable surface in the portal.
 */
export function PhotoLightbox({
	photo,
	alt,
	onClose,
	children,
}: {
	/** Ignored when `children` is given. */
	photo?: string;
	alt: string;
	onClose: () => void;
	/**
	 * Render this instead of an <img> — for things that are composed rather
	 * than photographed, like a comcard. Same zoom and pan either way.
	 */
	children?: ReactNode;
}) {
	const [zoom, setZoom] = useState(1);
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const [dragFrom, setDragFrom] = useState<{ x: number; y: number } | null>(
		null,
	);

	const zoomTo = useCallback((next: number) => {
		const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
		setZoom(clamped);
		// Snapping back to centre at 1× stops the photo being left parked
		// off-screen from an earlier pan, which looks like a failed load.
		if (clamped === MIN_ZOOM) setOffset({ x: 0, y: 0 });
	}, []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
			if (e.key === "+" || e.key === "=") zoomTo(zoom + STEP);
			if (e.key === "-") zoomTo(zoom - STEP);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose, zoom, zoomTo]);

	// PORTALLED TO <body>, and z-300 rather than z-50. Callers inside a sheet hit
	// a wall otherwise: sheets are translucent, transformed panels, and an
	// ancestor with transform/filter becomes the containing block for
	// `position: fixed` and traps z-index in its own stacking context — the
	// viewer came out washed-out and clipped inside its parent. No z-index wins
	// that from within; the layer has to leave the subtree. Harmless for the
	// three panels that already used this: it was full-screen fixed anyway.
	return createPortal(
		<div
			// This layer IS a modal — naming it one gives the mouse handler below a
			// role to hang off, and tells assistive tech that the portal behind it
			// is inert while the photo is open.
			role="dialog"
			aria-modal="true"
			aria-label={alt}
			className="fixed inset-0 z-[300] flex flex-col bg-black/85 backdrop-blur-sm"
			// Backdrop click closes; clicks on the image itself must not, or a pan
			// ending over the backdrop would dismiss the viewer mid-drag.
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div className="flex items-center gap-2 p-3">
				<span className="iz-tiny iz-muted2 mr-auto truncate">{alt}</span>
				<button
					type="button"
					className="iz-btn iz-btn-soft iz-btn-sm !h-8 !px-2"
					onClick={() => zoomTo(zoom - STEP)}
					disabled={zoom <= MIN_ZOOM}
					aria-label="Zoom out"
				>
					<Minus className="h-4 w-4" />
				</button>
				<span className="iz-tiny iz-ledger w-12 text-center">
					{Math.round(zoom * 100)}%
				</span>
				<button
					type="button"
					className="iz-btn iz-btn-soft iz-btn-sm !h-8 !px-2"
					onClick={() => zoomTo(zoom + STEP)}
					disabled={zoom >= MAX_ZOOM}
					aria-label="Zoom in"
				>
					<Plus className="h-4 w-4" />
				</button>
				<button
					type="button"
					className="iz-btn iz-btn-soft iz-btn-sm !h-8 !px-2"
					onClick={() => zoomTo(MIN_ZOOM)}
					aria-label="Reset zoom"
				>
					<RotateCcw className="h-4 w-4" />
				</button>
				<button
					type="button"
					className="iz-btn iz-btn-soft iz-btn-sm !h-8 !px-2"
					onClick={onClose}
					aria-label="Close"
				>
					<X className="h-4 w-4" />
				</button>
			</div>

			<div
				// role="none" (the current spelling of role="presentation") on purpose:
				// this wrapper is only the MOUSE viewport for wheel-zoom and drag-pan
				// and carries no meaning of its own, so it should not appear in the
				// accessibility tree at all — the <img> inside keeps its own name.
				// Nothing is withheld from a keyboard user either: zoom in, zoom out
				// and reset are real buttons on the toolbar above, and +/-/Escape are
				// bound in the effect at the top of this component.
				role="none"
				className="flex flex-1 items-center justify-center overflow-hidden"
				onWheel={(e) => zoomTo(zoom + (e.deltaY < 0 ? STEP : -STEP))}
				onMouseDown={(e) => {
					if (zoom > MIN_ZOOM) {
						setDragFrom({ x: e.clientX - offset.x, y: e.clientY - offset.y });
					}
				}}
				onMouseMove={(e) => {
					if (dragFrom) {
						setOffset({ x: e.clientX - dragFrom.x, y: e.clientY - dragFrom.y });
					}
				}}
				onMouseUp={() => setDragFrom(null)}
				onMouseLeave={() => setDragFrom(null)}
			>
				{children ? (
					<div
						className="select-none"
						style={{
							transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
							cursor:
								zoom > MIN_ZOOM ? (dragFrom ? "grabbing" : "grab") : "default",
						}}
					>
						{children}
					</div>
				) : (
					<img
						src={photo}
						alt={alt}
						draggable={false}
						className="max-h-full max-w-full select-none object-contain"
						style={{
							transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
							cursor:
								zoom > MIN_ZOOM ? (dragFrom ? "grabbing" : "grab") : "default",
						}}
					/>
				)}
			</div>
		</div>,
		document.body,
	);
}

/**
 * Thumbnails that open the zoomable viewer.
 *
 * `label` names what these photos ARE — "What the PR attached" vs "RCP-000012
 * scan" — and is carried into the viewer's header, because once a photo fills
 * the screen there is nothing else on it to say which of the two you are
 * looking at.
 */
export function ProofPhotos({
	photos,
	label,
}: {
	photos: string[];
	label: string;
}) {
	const [open, setOpen] = useState<string | null>(null);
	if (photos.length === 0) return null;

	return (
		<>
			<div className="mt-1.5 flex flex-wrap gap-1.5">
				{photos.map((photo, i) => {
					// R2 object keys become https URLs here; legacy data URLs pass
					// through. The RAW string stays the identity (keys, dedupe) — only
					// what <img>/the lightbox receive is resolved.
					const url = resolveProofPhotoUrl(photo);
					return isRenderablePhoto(url) ? (
						<button
							// biome-ignore lint/suspicious/noArrayIndexKey: photos are opaque strings with no id
							key={`${label}-${i}`}
							type="button"
							className="group relative"
							onClick={() => setOpen(url)}
							title="Click to zoom"
						>
							<img
								src={url}
								alt={`${label} ${i + 1}`}
								className="h-16 w-16 rounded border border-[var(--iz-line)] object-cover"
							/>
							<span className="absolute inset-0 flex items-center justify-center rounded bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
								<Maximize2 className="h-4 w-4 text-white" />
							</span>
						</button>
					) : (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: photos are opaque strings with no id
							key={`${label}-${i}`}
							className="iz-tiny iz-muted2 break-all"
						>
							{photo}
						</span>
					);
				})}
			</div>
			{open && (
				<PhotoLightbox photo={open} alt={label} onClose={() => setOpen(null)} />
			)}
		</>
	);
}
