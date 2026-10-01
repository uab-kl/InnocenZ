import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatDate, formatDay } from "./utils";

/**
 * "08:00 am" ON DATE-ONLY FIELDS (28 Sep 2026 audit, admin, live).
 *
 * `formatDate` is for instants: it hands the string to `new Date`, which reads
 * a bare `YYYY-MM-DD` as UTC midnight and prints it with a time — "08:00 am"
 * in Kuala Lumpur. A date of birth, an issued date, a pay-by date or a payroll
 * week has no time of day, so any time printed beside one is invented.
 */

describe("formatDay — a date-only value is printed as a day and nothing else", () => {
	it("prints the day, month and year from the string itself", () => {
		expect(formatDay("1999-01-02")).toBe("2 Jan 1999");
		expect(formatDay("2026-09-21")).toBe("21 Sep 2026");
	});

	it("never carries a time — whatever the reader's zone", () => {
		expect(formatDay("2026-08-01")).not.toMatch(/\d:\d/);
	});

	it("an empty value is a dash, not 'Invalid Date'", () => {
		expect(formatDay(null)).toBe("—");
		expect(formatDay("")).toBe("—");
	});

	it("the instrument: formatDate on the same value DOES print a time — the bug", () => {
		expect(formatDate("2026-08-01")).toMatch(/\d:\d/);
	});
});

/**
 * THE RATCHET: no admin screen hands a known date-only column to `formatDate`.
 * Proved to bite — before 29 Sep it found `user.dob`, `account.profile.dob`
 * and `voucher.issuedDate`.
 */
const DATE_ONLY =
	/formatDate\([^)]*\b(dob|issuedDate|dueDate|weekStart|weekEnd|lineDate|receiptDate|disputeDate|periodStart|periodEnd|shiftDate)\b/;

/**
 * `apps/web/src`, from the runner's working directory — `nx test web` starts
 * vitest in `apps/web`; a run from the repo root is allowed for too. (jsdom
 * gives `import.meta.url` an http scheme, so the file cannot locate itself.)
 */
const SRC =
	[join(process.cwd(), "src"), join(process.cwd(), "apps", "web", "src")].find(
		(dir) => existsSync(join(dir, "routes", "admin")),
	) ?? join(process.cwd(), "src");

const ADMIN_TREES = [
	"routes/admin",
	"components/admin",
	"components/organization",
	"components/pr",
	"components/subscription",
	"components/audit-log",
	"components/rbac",
].map((tree) => join(SRC, tree));

function sourceFiles(dir: string): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
		else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
			out.push(path);
	}
	return out;
}

describe("admin screens print date-only columns with formatDay", () => {
	it("the scan reads real files (a zero is evidence about the instrument)", () => {
		const files = ADMIN_TREES.flatMap(sourceFiles);
		expect(files.length).toBeGreaterThan(20);
		expect(DATE_ONLY.test("formatDate(user.dob)")).toBe(true);
	});

	it("no admin file passes a date-only column to formatDate", () => {
		const offenders = ADMIN_TREES.flatMap(sourceFiles).flatMap((file) =>
			readFileSync(file, "utf8")
				.split("\n")
				.map((line, index) => ({ line, at: `${file}:${index + 1}` }))
				.filter(({ line }) => DATE_ONLY.test(line))
				.map(({ at }) => at),
		);
		expect(offenders).toEqual([]);
	});
});
