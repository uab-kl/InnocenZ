import { isOrgSuspended } from "@/components/organization/org-status";

/**
 * WHO the outlet Profile card describes.
 *
 * ⚠️ A REAL SESSION NEVER READS THE DEMO STORE HERE. The card used to print
 * `useStore().user`, which is not persisted — so after any reload a real
 * operator saw the demo identity: "Manager", "guest@innocenz.app", a
 * hard-coded "Verified" shield, and the store's venue whenever the backend row
 * had not answered yet. The signed-in person comes from `/auth/me`, the venue
 * from the outlet row, and anything missing reads "—" rather than a stand-in.
 *
 * Demo sessions keep the demo store — that is what they are for.
 */
export interface OutletProfileCard {
	name: string;
	email: string;
	/** One letter for the avatar — the old code upper-cased the WHOLE name. */
	initial: string;
	venue: string;
	location: string;
	status: "verified" | "pending" | "suspended";
}

const MISSING = "—";

export function outletProfileCard(input: {
	backed: boolean;
	/** `/auth/me`, mapped — the signed-in account. */
	me?: {
		username?: string | null;
		email?: string | null;
		contactNo?: string | null;
	} | null;
	/** The venue row, via `useOutletProfile().settings`. */
	settings?: { venueName?: string; location?: string } | null;
	/** `outlet.status` — decides the shield line, as on Settings. */
	orgStatus?: string | null;
	/** Demo-session sources only. */
	demo: {
		user: { name: string; email: string } | null;
		venueName: string;
		location: string;
		fallbackName: string;
	};
}): OutletProfileCard {
	const { backed, me, settings, orgStatus, demo } = input;
	const name = backed
		? me?.username?.trim() || me?.email?.trim() || MISSING
		: demo.user?.name?.trim() || demo.fallbackName;
	const email = backed
		? me?.email?.trim() || me?.contactNo?.trim() || MISSING
		: demo.user?.email?.trim() || "guest@innocenz.app";
	const initial = name === MISSING ? "?" : name.charAt(0).toUpperCase();
	const venue = backed
		? settings?.venueName?.trim() || MISSING
		: demo.venueName || MISSING;
	const location = backed
		? settings?.location?.trim() || MISSING
		: demo.location || MISSING;
	const status: OutletProfileCard["status"] = !backed
		? "verified"
		: isOrgSuspended(orgStatus)
			? "suspended"
			: orgStatus === "active"
				? "verified"
				: "pending";
	return { name, email, initial, venue, location, status };
}
