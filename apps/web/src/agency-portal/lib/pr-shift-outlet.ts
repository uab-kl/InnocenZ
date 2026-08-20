import {
	type AgencyRosterSlot,
	getOutletRule,
	rosterSlotAgencyName,
} from "@agency-portal/lib/agency-demo";
import {
	type GeoCoord,
	mapsDirectionsUrl,
	OUTLET_GPS,
} from "@agency-portal/lib/gps-locations";
import type { PrShiftOffer } from "@agency-portal/lib/pr-demo";
import { formatRMPlain } from "@agency-portal/lib/pr-demo";

export type PrShiftOutletBrief = {
	name: string;
	event: string;
	address: string;
	streetAddress: string;
	shiftTime: string;
	shiftDate: string;
	dressCode: string;
	distance: string;
	mapsUrl: string;
	directionsUrl: string;
	estPayout: string;
	agencyNote?: string;
	heroGradient: string;
	opsContact?: string;
	rating: string;
	vip: boolean;
};

const OUTLET_META: Record<
	string,
	{ gradient: string; street: string; dressCode: string; opsContact: string }
> = {
	"Velvet 23": {
		gradient: "linear-gradient(145deg,#2d1f4a 0%,#120a1c 48%,#8a5e22 100%)",
		street: "23, Jalan Changkat, Bukit Bintang, 50200 Kuala Lumpur",
		dressCode: "Black elegant",
		opsContact: "Ops · Ahmad Razif",
	},
	"Onyx KL": {
		gradient: "linear-gradient(145deg,#1a2332 0%,#0a0e14 50%,#4a5568 100%)",
		street: "88, Jalan P. Ramlee, Kuala Lumpur City Centre",
		dressCode: "Cocktail attire",
		opsContact: "Floor · Sarah Lim",
	},
	"Urban Soul": {
		gradient: "linear-gradient(145deg,#1f2937 0%,#0f1419 50%,#7c3aed 100%)",
		street: "Lot 12, Bukit Bintang Walk, Kuala Lumpur",
		dressCode: "Smart casual",
		opsContact: "Host · Daniel Ng",
	},
	"Bear Lounge": {
		gradient: "linear-gradient(145deg,#3d2817 0%,#1a1008 50%,#b45309 100%)",
		street: "45, Changkat Bukit Bintang, Kuala Lumpur",
		dressCode: "Brand uniform",
		opsContact: "Manager · Priya K.",
	},
	Mermate: {
		gradient: "linear-gradient(145deg,#0c4a6e 0%,#082f49 50%,#22d3ee 100%)",
		street: "Level 3, Pavilion KL, 168 Jalan Bukit Bintang",
		dressCode: "Formal gown",
		opsContact: "Events · Michelle T.",
	},
};

/**
 * What an outlet NOT in the demo table gets — which is every real venue.
 *
 * ⚠️ This was `OUTLET_META["Velvet 23"]`, so an unknown outlet was handed
 * another venue's street address, dress code and ops contact. Paired with the
 * `OUTLET_GPS[...] ?? OUTLET_GPS["Velvet 23"]` on the line below it, the brief
 * would have told a PR to travel to the wrong building and given them a Google
 * Maps link to prove it. A blank field reads as "not set yet"; a plausible
 * wrong one reads as fact, and nobody checks a fact.
 *
 * Empty, not substituted. `getPrShiftOutletBrief` has NO callers today — this is
 * defusing a landmine in code that is not wired, not fixing a live screen. The
 * real decision is whether to wire it against the outlet registry or delete it,
 * the way `RosterAssignDialog` was deleted on 19 Aug 2026.
 */
const DEFAULT_META = {
	gradient: "linear-gradient(145deg,#1f2937 0%,#0f1419 50%,#374151 100%)",
	street: "",
	dressCode: "",
	opsContact: "",
};

/** Check-in hero — agency assigns; outlets may request PRs but cannot assign directly. */
export function getPrCheckInAssignmentLabel(
	slot: AgencyRosterSlot | undefined,
): string {
	if (!slot) return "Tonight's shift";
	// Was a hand-rolled copy of `rosterSlotAgencyName`'s chain, minus its
	// `agencyId` arm — so a REAL slot, which carries only an id, skipped straight
	// to the demo literal and told the PR that Atlas had assigned them whoever
	// actually booked them. Three copies of one rule are three places to fix it;
	// this now calls the rule.
	const agency = rosterSlotAgencyName(slot);
	if (slot.status === "outlet-pending") {
		return "Outlet requested you · pending agency & PR approval";
	}
	// An unnamed agency drops the suffix rather than trailing a bare separator.
	return agency ? `Agency assigned · ${agency}` : "Agency assigned";
}

export function getPrShiftOutletBrief(
	offer: PrShiftOffer,
	opts?: {
		shiftDateLabel?: string;
		rosterSlot?: AgencyRosterSlot | null;
		prCoord?: GeoCoord;
	},
): PrShiftOutletBrief {
	const gps = OUTLET_GPS[offer.outlet] ?? OUTLET_GPS["Velvet 23"];
	const meta = OUTLET_META[offer.outlet] ?? DEFAULT_META;
	const outletCoord = { lat: gps.lat, lng: gps.lng };
	const directionsUrl = opts?.prCoord
		? mapsDirectionsUrl(opts.prCoord, outletCoord)
		: `https://www.google.com/maps?q=${gps.lat},${gps.lng}`;
	const rule = getOutletRule(offer.outlet);
	const estWages = rule.wagePerHour;

	return {
		name: offer.outlet,
		event: offer.event,
		address: gps.address,
		streetAddress: meta.street,
		shiftTime: offer.time,
		shiftDate: opts?.shiftDateLabel ?? "",
		dressCode: meta.dressCode,
		distance: offer.distance,
		mapsUrl: `https://www.google.com/maps?q=${gps.lat},${gps.lng}`,
		directionsUrl,
		estPayout: `${formatRMPlain(estWages)} shift pay · RM ${rule.wagePerHour.toLocaleString("en-MY")}/shift`,
		agencyNote: opts?.rosterSlot?.agencyAssignment?.agencyNote,
		heroGradient: meta.gradient,
		opsContact: meta.opsContact,
		rating: offer.rating,
		vip: offer.vip,
	};
}
