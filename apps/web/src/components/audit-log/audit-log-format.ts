/**
 * An audit timestamp in the admin's date format — "22 Oct 2026, 03:15:07 pm".
 *
 * `formatAuditDate` printed "10/05/2026 …", month first, on a page whose date
 * filters read dd/mm/yyyy and inside an admin that writes "22 Oct 2026"
 * everywhere else, so 10 May and 5 Oct looked the same. Same `en-MY` pattern as
 * `formatDate`; seconds are kept because an audit trail orders events by them.
 */
export function formatAuditTimestamp(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat("en-MY", {
		day: "numeric",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: true,
	}).format(date);
}

/** Keys whose readable name is not just their words title-cased. */
const ENTITY_NAMES: Record<string, string> = {
	cutlost: "Cut Loss",
};

/** Words that are acronyms in the product, wherever they sit in a key. */
const ENTITY_ACRONYMS: Record<string, string> = {
	pr: "PR",
	pv: "PV",
	pos: "POS",
	otp: "OTP",
	mfa: "MFA",
	rbac: "RBAC",
	ssm: "SSM",
};

/**
 * The Table column of an audit row, readable — "Shift Template", never the
 * raw route slug `shift-template` the middleware records.
 *
 * `entity` is written two ways: the RBAC paths go through the backend's
 * `ENTITY_MAP` (`Role`, `UserRole`, `Auth`), and every other mutation records
 * the first path segment as it stands (`shift-template`, `payment-voucher`,
 * `pr-availability`). So the column read "Auth" on one row and
 * "shift-template" on the next (22 Oct 2026). It replaces `formatAuditEntity`
 * here, which only touched `Role` — and lower-cased it to "role".
 *
 * Kept in English like the recorded action beside it (`CREATE`, `UPDATE`):
 * this is the stored key made readable, the same rule as `formatSubRole`, not
 * copy to translate. Display only — the filter still SENDS the stored key.
 */
export function auditEntityLabel(entity: string): string {
	const raw = entity.trim();
	if (!raw) return "—";
	const named = ENTITY_NAMES[raw.toLowerCase()];
	if (named) return named;
	return raw
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.split(/[\s_-]+/)
		.filter(Boolean)
		.map((word) => {
			const lower = word.toLowerCase();
			return (
				ENTITY_ACRONYMS[lower] ?? lower.charAt(0).toUpperCase() + lower.slice(1)
			);
		})
		.join(" ");
}
