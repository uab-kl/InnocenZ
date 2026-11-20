import { Fragment, type ReactNode } from "react";

/**
 * `fill()` for a sentence where ONE value must be drawn differently — a money
 * figure in its state colour inside an otherwise quiet line (owner, 20 Nov 2026:
 * "the money RM make more obvious colour to let people easily know").
 *
 * The sentence stays one whole translatable template with named holes, exactly
 * as `fill()` wants (see fill.ts for why fragments glued in English order cannot
 * be translated); only the values may be React nodes. Unmatched placeholders are
 * left verbatim, as in `fill()`.
 *
 * A separate module so `fill.ts` stays a leaf with no imports at all.
 */
export function fillNodes(
	template: string,
	values: Record<string, ReactNode>,
): ReactNode[] {
	const out: ReactNode[] = [];
	const pattern = /\{(\w+)\}/g;
	let last = 0;
	let match = pattern.exec(template);
	while (match) {
		const [whole, key] = match;
		out.push(template.slice(last, match.index));
		out.push(
			key in values ? (
				<Fragment key={`${key}-${match.index}`}>{values[key]}</Fragment>
			) : (
				whole
			),
		);
		last = match.index + whole.length;
		match = pattern.exec(template);
	}
	out.push(template.slice(last));
	return out;
}
