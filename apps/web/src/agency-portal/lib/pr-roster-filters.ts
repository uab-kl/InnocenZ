/**
 * Manage PR's race filter, over a free-text column.
 *
 * `user_profile.race` is typed by whoever filled the profile in, so one value
 * lives in the database under several spellings — 19 rostered profiles hold
 * `chinese` and 22 hold `Chinese` (read-only count, 29 Sep 2026). Deduplicating
 * on the RAW value offered "Chinese" twice (both render through `raceLabel`,
 * which already folds case), and picking either option hid the other spelling's
 * PRs. The filter now folds the way the label does: one option per race, and
 * an option matches every spelling of it. Display-side only — no row is
 * rewritten.
 */

/** The comparison key: case and surrounding space do not make a new race. */
export function foldRace(value: string | null | undefined): string {
	return (value ?? "").trim().toLowerCase();
}

/**
 * One option per race. `value` is the folded key the filter matches on;
 * `label` is a spelling as stored — the most common one — for `raceLabel`,
 * which translates the races it knows and passes free text through.
 */
export function raceFilterOptions(
	prs: readonly { race?: string | null }[],
): { value: string; label: string }[] {
	const spellings = new Map<string, Map<string, number>>();
	for (const pr of prs) {
		const raw = pr.race?.trim();
		if (!raw) continue;
		const key = foldRace(raw);
		const counts = spellings.get(key) ?? new Map<string, number>();
		counts.set(raw, (counts.get(raw) ?? 0) + 1);
		spellings.set(key, counts);
	}
	return [...spellings.entries()]
		.map(([value, counts]) => ({
			value,
			label: [...counts.entries()].sort(
				(a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
			)[0][0],
		}))
		.sort((a, b) => a.value.localeCompare(b.value));
}

/** Does this PR match the picked option? An empty pick matches everybody. */
export function raceMatches(
	prRace: string | null | undefined,
	picked: string,
): boolean {
	return !picked || foldRace(prRace) === foldRace(picked);
}
