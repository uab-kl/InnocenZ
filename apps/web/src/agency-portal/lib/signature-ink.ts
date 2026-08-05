/**
 * The one place a stored signature becomes something you can look at.
 *
 * `payment_voucher.pr_signature` (migration 0071) and `finance_head_signature`
 * (0080) both hold the SAME shape: the `{w, h, strokes}` capture the signature
 * pad wrote, in the pad's own pixel box. The backend PDF re-draws those strokes
 * with pdfkit; this module re-draws them as inline SVG for the print view, so
 * the agency's document and the PR's document render one drawing rather than
 * two renderings that merely look similar.
 *
 * It deliberately CANNOT invent a signature. `buildDemoESignatureDataUrl` draws
 * a person's name in a script font, which is a picture of a name, not a mark
 * anyone made — every real path reads from here instead.
 */

export interface SignatureInk {
	/** Pad width in its own capture units — the SVG viewBox, not a screen size. */
	w: number;
	h: number;
	/** One polyline per pen-down..pen-up, as [x, y] pairs in the w×h box. */
	strokes: [number, number][][];
}

/**
 * Ink colour and weight, matched to `payment-voucher-pdf.ts` so both documents
 * draw the same mark in the same blue at the same thickness.
 */
const INK_COLOR = "#22345f";
const INK_WIDTH = 1.1;

function round(n: number): number {
	return Math.round(n * 100) / 100;
}

/**
 * Parse a stored signature, or null.
 *
 * Null for every failure mode — absent column, empty string, corrupt JSON, a
 * zero-sized box, no strokes. Callers fall back to the printed-name line,
 * because a money document must not fail over a drawing, and must not pretend a
 * broken one is a signature either.
 */
export function parseSignatureInk(
	raw: string | null | undefined,
): SignatureInk | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<SignatureInk> | null;
		if (!parsed) return null;
		const { w, h, strokes } = parsed;
		if (typeof w !== "number" || typeof h !== "number") return null;
		if (!(w > 0) || !(h > 0)) return null;
		if (!Array.isArray(strokes)) return null;
		const clean = strokes.filter(
			(s): s is [number, number][] => Array.isArray(s) && s.length >= 2,
		);
		if (clean.length === 0) return null;
		return { w, h, strokes: clean };
	} catch {
		return null;
	}
}

function pointsAttr(stroke: [number, number][]): string {
	return stroke
		.filter((p) => Array.isArray(p) && p.length >= 2)
		.map(([x, y]) => `${round(x)},${round(y)}`)
		.join(" ");
}

/**
 * The ink as an inline `<svg>` string, scaled to fit `maxWidth × maxHeight` and
 * sitting on the signature rule.
 *
 * `vector-effect="non-scaling-stroke"` keeps the pen weight constant however far
 * the drawing is scaled down — without it a wide signature squeezed into a
 * narrow box thins out to nothing on the page, which reads as an unsigned
 * voucher.
 */
export function signatureInkToSvg(
	ink: SignatureInk,
	opts: { maxWidth?: number; maxHeight?: number; title?: string } = {},
): string {
	const maxWidth = opts.maxWidth ?? 150;
	const maxHeight = opts.maxHeight ?? 34;
	const scale = Math.min(maxWidth / ink.w, maxHeight / ink.h);
	const width = round(ink.w * scale);
	const height = round(ink.h * scale);
	const polylines = ink.strokes
		.map(
			(stroke) =>
				`<polyline points="${pointsAttr(stroke)}" fill="none" stroke="${INK_COLOR}" stroke-width="${INK_WIDTH}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />`,
		)
		.join("");
	const title = opts.title
		? `<title>${opts.title.replace(/[<>&]/g, "")}</title>`
		: "";
	return `<svg class="sig-ink" width="${width}" height="${height}" viewBox="0 0 ${round(ink.w)} ${round(ink.h)}" preserveAspectRatio="xMinYMax meet" xmlns="http://www.w3.org/2000/svg" role="img">${title}${polylines}</svg>`;
}

/** Parse-and-render in one step — null when there is no usable signature. */
export function renderSignatureInk(
	raw: string | null | undefined,
	opts?: Parameters<typeof signatureInkToSvg>[1],
): string | null {
	const ink = parseSignatureInk(raw);
	return ink ? signatureInkToSvg(ink, opts) : null;
}
