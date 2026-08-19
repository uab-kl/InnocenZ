/**
 * Substitute `{name}` placeholders in a dictionary string.
 *
 * Needed because several portal labels are SENTENCES with numbers in the middle,
 * and until now they were built by gluing fragments:
 *
 *     `AI auto-assign · ${n} PRs for ${slots} open slots · ${day}`
 *
 * Two things go wrong with that. The obvious one is that a concatenated string
 * is invisible to every sweep that looks for English between JSX tags, which is
 * how these survived three passes. The subtler one is that fragment order is
 * English grammar: Chinese puts the day first and the measure word after the
 * number, so a translation that can only fill the gaps between fixed fragments
 * cannot be written correctly at all.
 *
 * A whole-sentence template with named holes fixes both — the sweep sees one
 * literal, and the translator moves the holes wherever the language needs them.
 *
 * Unmatched placeholders are left verbatim rather than blanked: `{day}` on
 * screen is a visible bug report, whereas an empty gap reads as a missing value
 * and gets misfiled as a data problem.
 *
 * Deliberately a LEAF module with no imports — not even the dictionary it is
 * used with. `translations.ts` and `context.tsx` are pulled in by nearly every
 * portal component, and an import cycle through them has taken the agency
 * portal down before.
 */
export function fill(
	template: string,
	values: Record<string, string | number>,
): string {
	return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
		key in values ? String(values[key]) : whole,
	);
}
