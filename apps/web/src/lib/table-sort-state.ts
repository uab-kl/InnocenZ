/**
 * The one rule for what clicking a sortable column header does — shared by
 * the admin console's shadcn tables and the agency/outlet portals' plain
 * tables, so a header behaves the same whichever portal it is in.
 *
 * Pure, so the rule is tested without rendering a table.
 */
export type SortDirection = "asc" | "desc";

export type SortState<Field extends string> = {
	field: Field;
	direction: SortDirection;
};

/**
 * Toggle the sort for a clicked column.
 *
 * A NEW column starts at the direction that answers the first question asked
 * of it: dates and money newest/largest first, names A–Z — the caller passes
 * which. Clicking the column already sorted reverses it.
 */
export function nextSortState<Field extends string>(
	current: SortState<Field> | null,
	field: Field,
	firstDirection: SortDirection = "desc",
): SortState<Field> {
	if (current?.field === field) {
		return { field, direction: current.direction === "asc" ? "desc" : "asc" };
	}
	return { field, direction: firstDirection };
}

/** The `aria-sort` value for a header, read from the `<th>` by screen readers. */
export function ariaSortFor<Field extends string>(
	sort: SortState<Field> | null,
	field: Field,
): "ascending" | "descending" | "none" {
	if (sort?.field !== field) return "none";
	return sort.direction === "asc" ? "ascending" : "descending";
}
