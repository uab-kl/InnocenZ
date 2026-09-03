/**
 * The venue's named-PR requests, collapsed to one row PER PERSON (0131).
 *
 * A request is stored per (shift, person, agency) because each agency may only
 * read the asks addressed to it. Since 3 Sep 2026 one pick fans out to EVERY
 * invited agency that holds that PR, so a PR on two of the venue's agencies now
 * has two rows on the same shift.
 *
 * That is right for the agencies — the server hands each of them only its own
 * row — and wrong for the OUTLET, which reads them all and would otherwise list
 * the same face twice. The venue asked for a person once; it should see her
 * once, with the agencies it is waiting on named beside her.
 *
 * Order is the order the rows arrived, so the first mention of a person fixes
 * her position and a second agency only appends to her label.
 */
export interface RequestedPrRow {
	userId: string;
	agencyId: string;
}

export interface RequestedPerson {
	userId: string;
	/** Every agency asked for this person, in arrival order, deduped. */
	agencyNames: string[];
	/** The agencies as one label, or null when none of them resolved a name. */
	agencyName: string | null;
}

export function groupRequestsByPerson(
	rows: RequestedPrRow[],
	agencyNameById: Map<string, string>,
): RequestedPerson[] {
	const byPerson = new Map<string, string[]>();
	for (const row of rows) {
		const names = byPerson.get(row.userId) ?? [];
		const name = agencyNameById.get(row.agencyId);
		// An unresolved agency id still has to CREATE the person's entry, or a PR
		// whose only request came from an agency this venue cannot name would
		// vanish from the list entirely rather than showing without a label.
		if (name && !names.includes(name)) names.push(name);
		byPerson.set(row.userId, names);
	}
	return [...byPerson].map(([userId, agencyNames]) => ({
		userId,
		agencyNames,
		agencyName: agencyNames.length > 0 ? agencyNames.join(", ") : null,
	}));
}
