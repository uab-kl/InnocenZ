import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { Move, RotateCcw, X, ZoomIn } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

/**
 * Where the frame was left, in units that survive a different frame SIZE.
 *
 * The offsets are stored as a FRACTION of the frame's edge, never in pixels:
 * the frame is `min(300px, 72vw)`, so a crop saved on a wide screen and
 * reopened on a narrow one would otherwise come back framed somewhere else.
 * Everything scales with the frame — `baseScale` is `frame / natural` — so a
 * fraction of the frame means the same part of the image at any size.
 */
export type CropState = { zoom: number; fx: number; fy: number };

/** What the sheet hands back — bytes, and the two fields the upload needs. */
export type AvatarCropResult = {
	/** `data:image/…;base64,…` of the CROPPED square. */
	dataUrl: string;
	/** Carries the extension the backend derives the R2 key from. */
	fileName: string;
	contentType: string;
	/** Hand this back as `pick.state` to reopen on the SAME framing. */
	state: CropState;
};

/** The picked file, held un-cropped until the sheet is confirmed. */
export type PendingAvatarPick = {
	dataUrl: string;
	fileName: string;
	contentType: string;
	/**
	 * Reopen where the last pass left off, rather than re-centred at 1×.
	 *
	 * This is what makes Adjust an EDIT instead of a redo: the caller keeps the
	 * ORIGINAL image plus this state, so a nudge re-crops the full-resolution
	 * source. Re-cropping the previous OUTPUT would throw away everything
	 * outside the old frame and soften what is left, a little more each pass.
	 */
	state?: CropState;
};

/** Square edge of the saved image. Small enough to post, sharp on a 96px hero. */
const MAX_OUTPUT_PX = 512;
const MIN_OUTPUT_PX = 160;
const MAX_ZOOM = 4;
const KEY_NUDGE_PX = 8;

function clamp(v: number, lo: number, hi: number) {
	return Math.min(hi, Math.max(lo, v));
}

/**
 * JPEG cannot hold transparency, so a PNG/WebP logo re-encoded as JPEG turns
 * its transparent corners BLACK. Everything that is not already a photo-style
 * JPEG therefore comes back out as PNG — and the returned fileName carries the
 * matching extension, because the backend derives the R2 object key (and the
 * stored content type) from the FILENAME first. Returning PNG bytes under a
 * `.jpg` name is how a logo gets stored as a file nothing can open.
 */
function outputFormat(sourceType: string): { type: string; ext: string } {
	return sourceType === "image/jpeg" || sourceType === "image/jpg"
		? { type: "image/jpeg", ext: ".jpg" }
		: { type: "image/png", ext: ".png" };
}

function renamed(fileName: string, ext: string): string {
	const base = fileName.replace(/\.[^.]+$/, "").trim() || "logo";
	return `${base}${ext}`;
}

/**
 * The same crop as a `File`, for the endpoints that take multipart rather than
 * base64 (the personal avatar posts `FormData`, the org logo posts a data URL).
 *
 * It lives beside the encoder on purpose: `fileName` and `contentType` have to
 * keep describing the bytes `toDataURL` actually wrote, and the profile-image
 * middleware filters on the FILENAME EXTENSION — so a name that drifts from the
 * encoding is rejected at the door, or worse, stored mislabelled.
 */
export function fileFromCropResult(result: AvatarCropResult): File {
	const base64 = result.dataUrl.slice(result.dataUrl.indexOf(",") + 1);
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return new File([bytes], result.fileName, { type: result.contentType });
}

/**
 * Choose WHICH PART of a picked image becomes the profile picture, with the
 * result shown at the sizes it will actually appear in.
 *
 * The upload used to store the raw file and let CSS `object-fit: cover` decide
 * what survived — which silently centre-crops, so a logo with its wordmark low
 * in the frame lost the wordmark and nobody could do anything about it. Here
 * the frame IS the crop: what sits inside it is exactly what `drawImage` writes
 * to the canvas, so the preview cannot disagree with the saved file.
 */
export function AvatarCropSheet({
	open,
	pick,
	onCancel,
	onConfirm,
}: {
	open: boolean;
	pick: PendingAvatarPick | null;
	onCancel: () => void;
	onConfirm: (result: AvatarCropResult) => void;
}) {
	const { t } = usePortalLocale();
	const frameRef = useRef<HTMLButtonElement>(null);
	const imageRef = useRef<HTMLImageElement | null>(null);
	const dragRef = useRef<{
		x: number;
		y: number;
		ox: number;
		oy: number;
	} | null>(null);

	const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
	const [frame, setFrame] = useState(0);
	const [zoom, setZoom] = useState(1);
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const [error, setError] = useState<string | null>(null);

	const src = pick?.dataUrl ?? null;

	// Load the picked bytes to learn their real dimensions — every bit of the
	// crop maths is expressed in SOURCE pixels, so nothing can be computed
	// before this resolves.
	useEffect(() => {
		if (!src) {
			imageRef.current = null;
			setNatural(null);
			return;
		}
		setError(null);
		const img = new Image();
		let cancelled = false;
		img.onload = () => {
			if (cancelled) return;
			imageRef.current = img;
			setNatural({ w: img.naturalWidth, h: img.naturalHeight });
		};
		img.onerror = () => {
			if (cancelled) return;
			imageRef.current = null;
			setNatural(null);
			setError(t.profile.cropFailed);
		};
		img.src = src;
		return () => {
			cancelled = true;
		};
	}, [src, t.profile.cropFailed]);

	// The frame's rendered edge, measured rather than assumed: it is `min(…, vw)`
	// so a narrow phone gets a smaller square, and the maths must follow it.
	useEffect(() => {
		if (!open) return;
		const el = frameRef.current;
		if (!el) return;
		// `offsetWidth`, NOT `getBoundingClientRect().width`. The rect includes
		// transforms, and the sheet animates in with a scale — so the frame was
		// measured at 291px while it renders at 300, and every number derived
		// from it (cover fit, the drawn size, the source window handed to
		// `drawImage`) was ~3% off. A crop sheet whose output is a few per cent
		// tighter than the frame it showed is exactly the bug this component
		// exists to end. offsetWidth is the untransformed layout width.
		const measure = () => setFrame(el.offsetWidth);
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	}, [open]);

	// Seed the framing ONCE per opening: the state the caller kept, or centred
	// at 1×. Keyed on the pick OBJECT rather than on its data URL, so reopening
	// the same image re-seeds instead of inheriting whatever the last drag left
	// behind — and guarded so it never fights the user's own dragging, which is
	// what a plain `[src, frame]` effect would do on every resize.
	const seededFor = useRef<PendingAvatarPick | null>(null);
	useEffect(() => {
		if (!pick || !natural || frame <= 0) return;
		if (seededFor.current === pick) return;
		seededFor.current = pick;
		const st = pick.state;
		setZoom(st ? clamp(st.zoom, 1, MAX_ZOOM) : 1);
		setOffset(st ? { x: st.fx * frame, y: st.fy * frame } : { x: 0, y: 0 });
	}, [pick, natural, frame]);

	// Cover fit is the FLOOR, not the starting size: below it the square would
	// show background where the image ran out, so zoom 1 always fills the frame.
	const baseScale = natural
		? Math.max(frame / natural.w, frame / natural.h)
		: 1;
	const scale = baseScale * zoom;
	const drawnW = natural ? natural.w * scale : 0;
	const drawnH = natural ? natural.h * scale : 0;
	const maxOffX = Math.max(0, (drawnW - frame) / 2);
	const maxOffY = Math.max(0, (drawnH - frame) / 2);

	const clampOffset = useCallback(
		(next: { x: number; y: number }, mx: number, my: number) => ({
			x: clamp(next.x, -mx, mx),
			y: clamp(next.y, -my, my),
		}),
		[],
	);

	// Re-clamp after a zoom OUT: the offsets that were legal at 3× can push the
	// image off its own frame at 1.2×, which would show empty corners.
	useEffect(() => {
		setOffset((o) => {
			const x = clamp(o.x, -maxOffX, maxOffX);
			const y = clamp(o.y, -maxOffY, maxOffY);
			return x === o.x && y === o.y ? o : { x, y };
		});
	}, [maxOffX, maxOffY]);

	const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
		if (!natural) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		dragRef.current = {
			x: e.clientX,
			y: e.clientY,
			ox: offset.x,
			oy: offset.y,
		};
	};

	const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
		const start = dragRef.current;
		if (!start) return;
		setOffset(
			clampOffset(
				{
					x: start.ox + (e.clientX - start.x),
					y: start.oy + (e.clientY - start.y),
				},
				maxOffX,
				maxOffY,
			),
		);
	};

	const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
		if (e.currentTarget.hasPointerCapture(e.pointerId)) {
			e.currentTarget.releasePointerCapture(e.pointerId);
		}
		dragRef.current = null;
	};

	const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
		const nudge: Record<string, [number, number]> = {
			ArrowLeft: [-KEY_NUDGE_PX, 0],
			ArrowRight: [KEY_NUDGE_PX, 0],
			ArrowUp: [0, -KEY_NUDGE_PX],
			ArrowDown: [0, KEY_NUDGE_PX],
		};
		const step = nudge[e.key];
		if (step) {
			e.preventDefault();
			setOffset((o) =>
				clampOffset({ x: o.x + step[0], y: o.y + step[1] }, maxOffX, maxOffY),
			);
			return;
		}
		if (e.key === "+" || e.key === "=") {
			e.preventDefault();
			setZoom((z) => clamp(z + 0.1, 1, MAX_ZOOM));
		}
		if (e.key === "-" || e.key === "_") {
			e.preventDefault();
			setZoom((z) => clamp(z - 0.1, 1, MAX_ZOOM));
		}
	};

	const reset = () => {
		setZoom(1);
		setOffset({ x: 0, y: 0 });
	};

	const confirm = () => {
		const img = imageRef.current;
		if (!img || !natural || !pick || frame <= 0) {
			setError(t.profile.cropFailed);
			return;
		}
		// The frame's own coordinates, mapped back into source pixels: the left
		// edge of the frame sits `imgLeft` away from the image's left edge, and
		// one frame pixel is `1 / scale` source pixels.
		const imgLeft = frame / 2 - drawnW / 2 + offset.x;
		const imgTop = frame / 2 - drawnH / 2 + offset.y;
		const sw = clamp(frame / scale, 1, natural.w);
		const sh = clamp(frame / scale, 1, natural.h);
		const sx = clamp(-imgLeft / scale, 0, Math.max(0, natural.w - sw));
		const sy = clamp(-imgTop / scale, 0, Math.max(0, natural.h - sh));

		// Never upscale past the pixels that exist — a 200px logo blown up to
		// 512 is a bigger file that carries no extra detail.
		const out = Math.round(
			clamp(Math.min(sw, sh), MIN_OUTPUT_PX, MAX_OUTPUT_PX),
		);
		const canvas = document.createElement("canvas");
		canvas.width = out;
		canvas.height = out;
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			setError(t.profile.cropFailed);
			return;
		}
		const format = outputFormat(pick.contentType);
		if (format.type === "image/jpeg") {
			// JPEG has no alpha channel: without this, a transparent source's
			// corners are written as black rather than as the page behind them.
			ctx.fillStyle = "#ffffff";
			ctx.fillRect(0, 0, out, out);
		}
		ctx.imageSmoothingQuality = "high";
		try {
			ctx.drawImage(img, sx, sy, sw, sh, 0, 0, out, out);
			const dataUrl = canvas.toDataURL(format.type, 0.92);
			if (!dataUrl.startsWith("data:image/")) throw new Error("encode failed");
			onConfirm({
				dataUrl,
				fileName: renamed(pick.fileName, format.ext),
				contentType: format.type,
				state: { zoom, fx: offset.x / frame, fy: offset.y / frame },
			});
		} catch {
			setError(t.profile.cropFailed);
		}
	};

	/** The same crop, drawn at the size the avatar really renders at. */
	const Preview = ({ size, radius }: { size: number; radius: number }) => {
		const k = frame > 0 ? size / frame : 0;
		return (
			<div
				className="iz-avatar-crop__preview-tile"
				style={{ width: size, height: size, borderRadius: radius }}
			>
				{src && natural && (
					<img
						src={src}
						alt=""
						draggable={false}
						style={{
							width: drawnW * k,
							height: drawnH * k,
							left: size / 2 - (drawnW * k) / 2 + offset.x * k,
							top: size / 2 - (drawnH * k) / 2 + offset.y * k,
						}}
					/>
				)}
			</div>
		);
	};

	return (
		<IzSheet open={open && Boolean(pick)} onClose={onCancel}>
			<div className="iz-sheet-head">
				<h3>{t.profile.cropTitle}</h3>
				<button
					type="button"
					className="iz-sheet-close"
					onClick={onCancel}
					aria-label={t.common.close}
				>
					<X className="h-4 w-4" />
				</button>
			</div>

			<div className="iz-avatar-crop">
				<p className="iz-avatar-crop__hint">
					<Move className="h-3.5 w-3.5 shrink-0" aria-hidden />
					{t.profile.cropHint}
				</p>

				{/*
				 * A real <button>, not a div with a tabIndex bolted on. The frame has
				 * to take focus for the arrow keys to nudge the crop, and a
				 * non-interactive element that steals a tab stop is exactly what the
				 * a11y rules are there to stop. The label says what the keys do,
				 * since the pointer gesture cannot be read out.
				 */}
				<button
					type="button"
					ref={frameRef}
					className="iz-avatar-crop__frame"
					aria-label={t.profile.cropFrameLabel}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={endDrag}
					onPointerCancel={endDrag}
					onKeyDown={onKeyDown}
				>
					{src && natural && (
						<img
							src={src}
							alt=""
							draggable={false}
							style={{
								width: drawnW,
								height: drawnH,
								left: frame / 2 - drawnW / 2 + offset.x,
								top: frame / 2 - drawnH / 2 + offset.y,
							}}
						/>
					)}
					<div className="iz-avatar-crop__mask" aria-hidden />
				</button>

				<div className="iz-avatar-crop__zoom">
					<ZoomIn className="h-4 w-4 shrink-0" aria-hidden />
					<input
						type="range"
						className="iz-avatar-crop__slider"
						min={1}
						max={MAX_ZOOM}
						step={0.01}
						value={zoom}
						aria-label={t.profile.cropZoom}
						onChange={(e) => setZoom(Number(e.target.value))}
					/>
					<button
						type="button"
						className="iz-avatar-crop__reset"
						onClick={reset}
					>
						<RotateCcw className="h-3.5 w-3.5" aria-hidden />
						{t.profile.cropReset}
					</button>
				</div>

				<div className="iz-avatar-crop__previews">
					<span className="iz-avatar-crop__previews-label">
						{t.profile.cropPreview}
					</span>
					<div className="iz-avatar-crop__previews-row">
						<Preview size={72} radius={20} />
						<Preview size={40} radius={12} />
						<Preview size={28} radius={999} />
					</div>
				</div>

				{error && <p className="iz-avatar-crop__error">{error}</p>}

				<div className="iz-avatar-crop__actions">
					<button
						type="button"
						className="iz-btn iz-btn-soft"
						onClick={onCancel}
					>
						{t.common.cancel}
					</button>
					<button
						type="button"
						className="iz-btn iz-btn-primary"
						onClick={confirm}
						disabled={!natural}
					>
						{t.profile.cropUse}
					</button>
				</div>
			</div>
		</IzSheet>
	);
}
