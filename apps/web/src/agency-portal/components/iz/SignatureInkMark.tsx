import {
	parseSignatureInk,
	signatureInkBounds,
} from "@agency-portal/lib/signature-ink";

/**
 * A stored signature, on screen.
 *
 * The React twin of `signatureInkToSvg` — same strokes, same blue, same
 * constant pen weight — so the preview on the PV screen shows the mark the
 * printed voucher will carry, rather than a picture built from the signer's
 * name. Renders nothing when the row holds no usable ink, which is the caller's
 * cue to fall back to a name-and-date line.
 */
export function SignatureInkMark({
	ink,
	label,
	className,
}: {
	ink: string | null | undefined;
	label: string;
	className?: string;
}) {
	const parsed = parseSignatureInk(ink);
	if (!parsed) return null;
	/*
	 * The viewBox is the MARK, not the pad it was drawn on — see
	 * `signatureInkBounds`. With the pad as the viewBox, a signature drawn in
	 * the middle third of a 1794px-wide web canvas rendered at less than half
	 * the size of one drawn on a 354px phone pad, in the same box, on the same
	 * document. Falls back to the pad when the ink has no extent to trim to.
	 */
	const box = signatureInkBounds(parsed);
	const viewBox = box
		? `${box.x} ${box.y} ${box.w} ${box.h}`
		: `0 0 ${parsed.w} ${parsed.h}`;
	return (
		<svg
			className={className}
			viewBox={viewBox}
			preserveAspectRatio="xMinYMax meet"
			role="img"
			aria-label={label}
		>
			<title>{label}</title>
			{parsed.strokes.map((stroke) => {
				const points = stroke.map(([x, y]) => `${x},${y}`).join(" ");
				return (
					<polyline
						key={points}
						points={points}
						fill="none"
						stroke="#22345f"
						strokeWidth={1.1}
						strokeLinecap="round"
						strokeLinejoin="round"
						vectorEffect="non-scaling-stroke"
					/>
				);
			})}
		</svg>
	);
}
