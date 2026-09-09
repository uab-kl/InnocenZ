/**
 * How an organisation's member ids read on screen.
 *
 * An organisation does not HAVE a member id — its people do (INNATAGY0001,
 * INNATAGY0002, …). What the organisation owns is the stem those ids are cut
 * from, so that is what every org-level surface shows: `INNATAGY`, in full,
 * never truncated. It replaced `agency_code` everywhere on screen (owner,
 * 9 Sep 2026: *"no this agency code , all use the member id"*).
 *
 * `agency_code` itself is NOT deleted — three seed scripts still match agencies
 * by it and it is the organisation's own registration number, not a person's
 * id. It simply stopped being something an admin is shown.
 *
 * Null in, null out: a prefix is absent only until the first id is minted
 * there, and an em-dash decided at the call site reads better than a fake stem.
 */
export function orgMemberIdStem(
	kind: "agency" | "outlet",
	prefix: string | null | undefined,
): string | null {
	if (!prefix) return null;
	return `INN${prefix}${kind === "agency" ? "AGY" : "OLT"}`;
}

/**
 * The registration number as SSM itself prints it: the 12-digit number, with
 * the pre-2019 one in brackets when the company still carries it —
 * `202601024567 (1456789-W)`.
 *
 * They are the SAME registration in two notations, which is why they share one
 * line: two fields would invite a reader to count two companies. The 12 digits
 * are `YYYY` (incorporation) + `XX` (entity code, 01 for a local company) +
 * a running number — so the year is readable off the front, and a value that
 * is not twelve digits is not an SSM number at all.
 */
export function ssmDisplay(
	ssmNo: string | null | undefined,
	registrationNoOld: string | null | undefined,
): string | null {
	if (!ssmNo) return registrationNoOld ?? null;
	return registrationNoOld ? `${ssmNo} (${registrationNoOld})` : ssmNo;
}
