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

/** The rectangle the ink actually occupies, in the pad's own coordinates. */
export interface SignatureInkBounds {
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * A little air around the mark, as a fraction of its longer side, so a stroke
 * does not sit flush against the edge of its box.
 */
const INK_BOUNDS_PAD = 0.06;

/**
 * WHERE THE MARK IS — not where the pad was.
 *
 * A signature is stored with the dimensions of the CANVAS it was drawn on, and
 * those differ wildly by device: the agency's web pad is 1794 x 160 while a
 * phone's is 354 x 120. Rendering the whole pad scales the empty canvas along
 * with the ink, so on PV-000010 the owner's signature — which occupies 33% of
 * its pad's width, starting a third of the way in — drew 59px wide beside a
 * PR signature that drew 126px. Same box, same rules, one mark less than half
 * the size of the other, purely because of what it was signed on.
 *
 * Trimming to the strokes is NOT distortion: the aspect ratio of the mark
 * itself is untouched, only the blank margins around it are dropped. That
 * distinction is why this returns a box rather than a scale factor — callers
 * fit the mark into their own space and must keep preserving its ratio.
 *
 * Returns null when the ink has no extent in a direction (a single point, or a
 * perfectly straight horizontal line). Those cannot be trimmed without dividing
 * by zero, and the caller falls back to the pad — a rare mark drawn small is a
 * better outcome than one that fails to render.
 *
 * ⚠️ The bounds are NOT clamped to the pad. PV-000010's agency ink is 179 tall
 * inside a 160-tall pad: the capture let strokes run past the canvas, and the
 * old full-pad viewBox therefore cut the bottom off the signature. Honouring
 * the real extent shows the whole mark.
 */
export function signatureInkBounds(
	ink: SignatureInk,
): SignatureInkBounds | null {
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const stroke of ink.strokes) {
		for (const [x, y] of stroke) {
			if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
		}
	}
	const w = maxX - minX;
	const h = maxY - minY;
	if (!(w > 0) || !(h > 0)) return null;
	const pad = Math.max(w, h) * INK_BOUNDS_PAD;
	return { x: minX - pad, y: minY - pad, w: w + pad * 2, h: h + pad * 2 };
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
