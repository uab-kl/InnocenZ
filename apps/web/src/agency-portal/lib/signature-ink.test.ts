import { describe, expect, it } from "vitest";
import { type SignatureInk, signatureInkBounds } from "./signature-ink";

/**
 * A SIGNATURE MUST NOT BE SIZED BY THE DEVICE IT WAS DRAWN ON.
 *
 * Reported 3 Sep 2026: on PV-000010 the agency's mark printed at less than half
 * the size of the PR's, in the same box. The agency signed on a 1794x160 web
 * pad and used a third of it; the PR signed on a 354x120 phone. Rendering the
 * pad scaled all that empty canvas along with the ink.
 */
describe("signatureInkBounds", () => {
	it("returns the strokes' box, not the pad's", () => {
		const box = signatureInkBounds({
			w: 1000,
			h: 100,
			strokes: [
				[
					[400, 40],
					[600, 60],
				],
			],
		});
		// 200x20 of ink, plus 6% of the longer side (12) on every edge.
		expect(box).toEqual({ x: 388, y: 28, w: 224, h: 44 });
	});

	it("keeps the MARK's aspect ratio, not the pad's", () => {
		const ink: SignatureInk = {
			w: 1794,
			h: 160,
			strokes: [
				[
					[655, 12],
					[1251, 191],
				],
			],
		};
		const box = signatureInkBounds(ink);
		if (!box) throw new Error("expected bounds");
		// The PAD is 11.2:1. The raw mark inside it is 3.3:1, and the box comes
		// out at 2.7:1 because the 6% margin is UNIFORM — the same number of
		// units on every edge — which is air around a mark rather than a scaling
		// of it, and therefore moves a non-square ratio slightly. What matters is
		// that the box describes the mark and not the canvas.
		expect(ink.w / ink.h).toBeCloseTo(11.2, 1);
		expect(box.w / box.h).toBeCloseTo(2.7, 1);
		expect(box.w / box.h).toBeLessThan(ink.w / ink.h / 3);
	});

	it("does NOT clamp to the pad — PV-000010's ink runs past its canvas", () => {
		// 179 tall inside a 160-tall pad: the old full-pad viewBox cut the
		// bottom off the signature.
		const box = signatureInkBounds({
			w: 1794,
			h: 160,
			strokes: [
				[
					[655, 12],
					[1251, 191],
				],
			],
		});
		expect(box?.y ?? 0).toBeLessThan(12);
		expect((box?.y ?? 0) + (box?.h ?? 0)).toBeGreaterThan(160);
	});

	it("refuses a mark with no extent rather than dividing by zero", () => {
		expect(
			signatureInkBounds({
				w: 100,
				h: 100,
				strokes: [
					[
						[10, 10],
						[10, 10],
					],
				],
			}),
		).toBeNull();
	});

	it("refuses a perfectly flat line, which has no height to fit", () => {
		expect(
			signatureInkBounds({
				w: 100,
				h: 100,
				strokes: [
					[
						[10, 50],
						[90, 50],
					],
				],
			}),
		).toBeNull();
	});

	it("ignores non-finite points instead of poisoning the box", () => {
		const box = signatureInkBounds({
			w: 100,
			h: 100,
			strokes: [
				[
					[10, 10],
					[Number.NaN, 50],
					[30, 30],
				],
			],
		});
		expect(box).not.toBeNull();
		expect(Number.isFinite(box?.w)).toBe(true);
	});
});
