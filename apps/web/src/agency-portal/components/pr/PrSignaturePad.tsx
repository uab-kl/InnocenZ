import { useEffect, useRef, useState } from "react";

/** Vector ink — the shape `pr_signature` / `finance_head_signature` store. */
export type SignatureInk = {
	w: number;
	h: number;
	strokes: [number, number][][];
};

type PrSignaturePadProps = {
	label?: string;
	signerName?: string;
	onConfirm: (dataUrl: string) => void;
	/**
	 * The same signature as STROKE POINTS, for callers that persist it.
	 *
	 * Additive and optional — `onConfirm` still hands back the PNG data URL. The
	 * backend stores strokes rather than a bitmap (migration 0071): the PDF
	 * re-draws them as crisp vector ink at any size, and a few KB of points beats a
	 * base64 PNG in a money row.
	 */
	onConfirmInk?: (ink: SignatureInk) => void;
	onCancel?: () => void;
};

export function PrSignaturePad({
	label,
	signerName,
	onConfirm,
	onConfirmInk,
	onCancel,
}: PrSignaturePadProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const drawing = useRef(false);
	const [hasInk, setHasInk] = useState(false);
	// Points are recorded as they are drawn, in CSS pixels — the same coordinate
	// space `w`/`h` report, so the ink re-draws at any size without rescaling.
	const strokes = useRef<[number, number][][]>([]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const setup = () => {
			const rect = canvas.getBoundingClientRect();
			if (rect.width < 1 || rect.height < 1) return;
			const dpr = window.devicePixelRatio || 1;
			canvas.width = Math.floor(rect.width * dpr);
			canvas.height = Math.floor(rect.height * dpr);
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.strokeStyle = "#e8c27a";
			ctx.lineWidth = 2.5;
			ctx.lineCap = "round";
			ctx.lineJoin = "round";
		};

		setup();
		const ro = new ResizeObserver(setup);
		ro.observe(canvas);
		return () => ro.disconnect();
	}, []);

	const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current!;
		const rect = canvas.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	};

	const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;
		drawing.current = true;
		canvas.setPointerCapture(e.pointerId);
		const { x, y } = getPos(e);
		ctx.beginPath();
		ctx.moveTo(x, y);
		strokes.current.push([[x, y]]);
	};

	const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
		if (!drawing.current) return;
		const ctx = canvasRef.current?.getContext("2d");
		if (!ctx) return;
		const { x, y } = getPos(e);
		ctx.lineTo(x, y);
		ctx.stroke();
		strokes.current[strokes.current.length - 1]?.push([x, y]);
		setHasInk(true);
	};

	const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
		drawing.current = false;
		canvasRef.current?.releasePointerCapture(e.pointerId);
	};

	const clear = () => {
		const canvas = canvasRef.current;
		const ctx = canvas?.getContext("2d");
		if (!canvas || !ctx) return;
		const rect = canvas.getBoundingClientRect();
		ctx.clearRect(0, 0, rect.width, rect.height);
		strokes.current = [];
		setHasInk(false);
	};

	const confirm = () => {
		const canvas = canvasRef.current;
		if (!canvas || !hasInk) return;
		onConfirm(canvas.toDataURL("image/png"));
		if (onConfirmInk) {
			const rect = canvas.getBoundingClientRect();
			// A single tap records one point; the server requires at least two per
			// stroke, so those are dropped rather than sent to be rejected.
			const drawn = strokes.current.filter((s) => s.length >= 2);
			if (drawn.length > 0) {
				onConfirmInk({
					w: Math.round(rect.width),
					h: Math.round(rect.height),
					strokes: drawn,
				});
			}
		}
	};

	return (
		<div className="iz-pv-sign-pad">
			{label && <p className="iz-tiny iz-muted mb-2">{label}</p>}
			{signerName && (
				<p className="iz-sm mb-2 font-semibold">
					Sign as <span className="text-[var(--iz-gold-l)]">{signerName}</span>
				</p>
			)}
			<div className="iz-pv-sign-canvas-wrap">
				<canvas
					ref={canvasRef}
					className="iz-pv-sign-canvas"
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerLeave={onPointerUp}
					aria-label="Signature pad — draw with finger or mouse"
				/>
				{!hasInk && (
					<div className="iz-pv-sign-hint">Draw your signature here</div>
				)}
			</div>
			<p className="iz-tiny iz-muted2 mt-2 text-center">
				Timestamp is recorded automatically when you confirm.
			</p>
			<div className="iz-pv-sign-actions mt-3">
				<button type="button" className="iz-btn iz-btn-soft" onClick={clear}>
					Clear
				</button>
				{onCancel && (
					<button
						type="button"
						className="iz-btn iz-btn-ghost"
						onClick={onCancel}
					>
						Cancel
					</button>
				)}
				<button
					type="button"
					className="iz-btn iz-btn-primary"
					disabled={!hasInk}
					onClick={confirm}
				>
					Confirm signature
				</button>
			</div>
		</div>
	);
}
