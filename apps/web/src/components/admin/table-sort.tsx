import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { TableHead } from "@/components/ui/table";
import { dateTimeParts } from "@/lib/date-time-parts";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { ariaSortFor, type SortState } from "@/lib/table-sort-state";

/*
 * The sort rule lives in `lib/table-sort-state.ts` so the agency and outlet
 * portals share it; re-exported here so admin imports keep working.
 */
export {
	nextSortState,
	type SortDirection,
	type SortState,
} from "@/lib/table-sort-state";

/**
 * A column header you can sort by.
 *
 * No table in this console had one: every list arrived in whatever order the
 * server chose and the reader could not change it. The control is the WHOLE
 * header, not a small icon beside it — a 16px target in the corner of a cell
 * is a control only to someone who already knows it is there.
 *
 * ⚠️ `aria-sort` goes on the `<th>`, not on the button. A screen reader
 * announces the column's state from the header cell; on the button it is
 * simply not read, and the table sounds unsorted however it looks.
 */
export function SortableHead<Field extends string>({
	field,
	sort,
	onSort,
	children,
	className,
	align = "left",
}: {
	field: Field;
	sort: SortState<Field> | null;
	onSort: (field: Field) => void;
	children: ReactNode;
	className?: string;
	align?: "left" | "right";
}) {
	const { t } = usePortalLocale();
	const active = sort?.field === field;
	const direction = active ? sort.direction : null;
	const Icon =
		direction === "asc"
			? ArrowUp
			: direction === "desc"
				? ArrowDown
				: ChevronsUpDown;
	return (
		<TableHead aria-sort={ariaSortFor(sort, field)} className={className}>
			<button
				type="button"
				onClick={() => onSort(field)}
				className={`iz-admin-sort-head${active ? " iz-admin-sort-head--on" : ""}${
					align === "right" ? " iz-admin-sort-head--end" : ""
				}`}
				/*
				 * The accessible name says what the CLICK will do, not what the
				 * column currently is — "Issued — sort ascending" — because that is
				 * the question someone reaching for the control is asking.
				 */
				aria-label={`${typeof children === "string" ? children : field} — ${
					direction === "asc" ? t.table.sortDescending : t.table.sortAscending
				}`}
			>
				<span className="iz-admin-sort-head__label">{children}</span>
				<Icon aria-hidden className="iz-admin-sort-head__icon" />
			</button>
		</TableHead>
	);
}

/**
 * A timestamp as two lines: the date, and the clock time beneath it.
 *
 * One glued string ("28 Aug 2026, 10:52 pm") broke mid-value in a narrow
 * column. Two lines cannot, and the date — the half a reader scans for —
 * keeps full strength while the time steps back.
 *
 * ⚠️ A DATE-ONLY value renders no second line at all. `payment_voucher
 * .issued_date` is a Postgres `date`, so there is no time to show, and
 * printing one would invent a fact the database does not hold.
 */
export function DateTimeCell({
	value,
	className,
}: {
	value: string | null | undefined;
	className?: string;
}) {
	const parts = dateTimeParts(value);
	return (
		<span className={`iz-admin-datetime${className ? ` ${className}` : ""}`}>
			<span className="iz-admin-datetime__date">{parts.date}</span>
			{parts.time && (
				<span className="iz-admin-datetime__time iz-nums">{parts.time}</span>
			)}
		</span>
	);
}
