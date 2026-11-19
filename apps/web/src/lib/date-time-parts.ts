/**
 * A timestamp split into the two things a reader sorts by.
 *
 * Every list rendered a timestamp as ONE glued string — `formatDate` returns
 * "28 Aug 2026, 10:52 pm" — so a narrow column broke it mid-value and neither
 * half could be sorted on its own.
 *
 * ⚠️ `dayKey` and `minuteOfDay` are the SORT keys and are never shown. Sorting
 * on the rendered words would put "28 Aug" before "8 Sep" alphabetically,
 * which is the classic bug this exists to prevent.
 *
 * ⚠️ `minuteOfDay` is TIME OF DAY, deliberately detached from the date: that
 * is what "sort by time" means to a reader looking down a column of clock
 * readings. Ordering by the instant is what sorting by DATE already does.
 */
export type DateTimeParts = {
	/** "28 Aug 2026", or the raw input when it cannot be parsed. */
	date: string;
	/** "10:52 pm", or null when the source carries no time at all. */
	time: string | null;
	/** Sort key for the date half: days since the epoch, or null if unparsed. */
	dayKey: number | null;
	/** Sort key for the time half: 0–1439, or null when there is no time. */
	minuteOfDay: number | null;
};

const EMPTY: DateTimeParts = {
	date: "—",
	time: null,
	dayKey: null,
	minuteOfDay: null,
};

/**
 * True when the value is a bare calendar date with no time component —
 * `2026-09-29`, the shape a Postgres `date` column returns.
 *
 * It matters: `payment_voucher.issued_date` IS such a column, so Issued has no
 * time to show and must never be given one. `new Date("2026-09-29")` would
 * report midnight UTC — a fabricated time — and in a UTC+8 timezone it also
 * reports the WRONG DAY.
 */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const DAY_MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

function dayLabel(year: number, month: number, day: number): string {
	return `${day} ${DAY_MONTHS[month - 1] ?? month} ${year}`;
}

/** Whole days since the epoch — a stable integer to order dates by. */
function toDayKey(year: number, month: number, day: number): number {
	return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function dateTimeParts(value: string | null | undefined): DateTimeParts {
	if (!value) return EMPTY;

	// A date-only value is read as calendar numbers, never through `new Date`:
	// see DATE_ONLY above — parsing it as an instant invents a time and can
	// shift the day.
	const dateOnly = DATE_ONLY.exec(value);
	if (dateOnly) {
		const year = Number(dateOnly[1]);
		const month = Number(dateOnly[2]);
		const day = Number(dateOnly[3]);
		return {
			date: dayLabel(year, month, day),
			time: null,
			dayKey: toDayKey(year, month, day),
			minuteOfDay: null,
		};
	}

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		// Unparseable: show it verbatim rather than "—", so a reader can see what
		// the server actually sent. It sorts last, having no keys.
		return { date: value, time: null, dayKey: null, minuteOfDay: null };
	}

	const hours = parsed.getHours();
	const minutes = parsed.getMinutes();
	const hour12 = hours % 12 === 0 ? 12 : hours % 12;
	return {
		date: dayLabel(
			parsed.getFullYear(),
			parsed.getMonth() + 1,
			parsed.getDate(),
		),
		time: `${hour12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "am" : "pm"}`,
		dayKey: toDayKey(
			parsed.getFullYear(),
			parsed.getMonth() + 1,
			parsed.getDate(),
		),
		minuteOfDay: hours * 60 + minutes,
	};
}

/**
 * Order two sort keys, putting MISSING values last in BOTH directions.
 *
 * A row with no timestamp is not "the earliest"; it is unknown, and a reader
 * sorting newest-first should not meet a column of blanks at the top.
 */
export function compareNullableKeys(
	a: number | null,
	b: number | null,
	direction: "asc" | "desc",
): number {
	if (a === null && b === null) return 0;
	if (a === null) return 1;
	if (b === null) return -1;
	return direction === "asc" ? a - b : b - a;
}
