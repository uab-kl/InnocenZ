/** PR spec features beyond base pr-demo — marketplace, notifications, swaps */

import {
	type AgencyRosterSlot,
	SEED_AGENCY_ROSTER,
} from "@agency-portal/lib/agency-demo";
import {
	getLiveTodayIso,
	isoOnWeekday,
	migrateDemoYmd,
	weekdayEventName,
	ymdFromIso,
} from "@agency-portal/lib/demo-clock";
import { outletMatches } from "@agency-portal/lib/portal-sync";
import type { PrShiftOffer } from "@agency-portal/lib/pr-demo";
import {
	fmtDateLabelFromIso,
	fmtDtable,
	PR_SHIFT_OFFERS,
	SHIFT_TODAY,
	shiftTodayIso,
} from "@agency-portal/lib/pr-demo";
import type { PrNotification } from "@agency-portal/lib/pr-notifications";
import {
	DEFAULT_ROSTER_DATE_ISO,
	isDemoDateOnOrAfter,
} from "@agency-portal/lib/roster-availability";

export type {
	PrNotification,
	PrNotificationKind,
} from "@agency-portal/lib/pr-notifications";
export { prNotificationsForRecipient } from "@agency-portal/lib/pr-notifications";

export interface TierSlot {
	tier: string;
	count: number;
	hours: string;
}

export interface MarketplaceListing extends PrShiftOffer {
	id: string;
	area: string;
	rate: number;
	role: string;
	languages: string[];
	tierMin: number;
	tierSlots: TierSlot[];
	briefing: string;
	lat: number;
	lng: number;
}

export interface AgencyTiedOffer extends PrShiftOffer {
	id: string;
	agencyName: string;
	briefing: string;
	/** Total PR headcount for this outlet event (defaults to 12 in agency outlet views). */
	headcount?: number;
	/** PRs already confirmed for this event. */
	supplied?: number;
}

export interface PrUpcomingShift {
	id: string;
	outlet: string;
	date: [number, number, number];
	time: string;
	status: "confirmed" | "pending";
}

export type PrSwapRequestStatus =
	| "pending_agency"
	| "pending_replacement"
	| "approved"
	| "declined";

export interface PrSwapRequest {
	id: string;
	/** PR's current shift being vacated */
	rosterSlotId: string;
	requestingPrId: string;
	requestingPrName: string;
	outlet: string;
	date: string;
	dateIso: string;
	shift: string;
	/** Shift the PR wants to move to — optional for swaps saved before target field existed */
	targetOutlet?: string;
	targetDate?: string;
	targetDateIso?: string;
	targetShift?: string;
	targetRosterSlotId?: string;
	targetOfferId?: string;
	reason: string;
	status: PrSwapRequestStatus;
	requestedAt: string;
	/** Set when agency picks a replacement — awaiting their accept/decline */
	replacementPrId?: string;
	replacementPrName?: string;
	replacementOfferedAt?: string;
	/** Set when replacement declines — agency picks another PR */
	replacementDeclineReason?: string;
	replacementDeclinedAt?: string;
}

/** Pending PR-initiated swap tied to a roster row (shown in agency live roster). */
export function activePrSwapForRosterSlot(
	swaps: PrSwapRequest[],
	slotId: string,
): PrSwapRequest | undefined {
	return swaps.find(
		(s) =>
			s.rosterSlotId === slotId &&
			(s.status === "pending_agency" || s.status === "pending_replacement"),
	);
}

/** Swap blocks the requesting PR from treating the shift as active (awaiting replacement or done). */
export function swapBlocksRequestingPrShift(
	swaps: PrSwapRequest[],
	prId: string,
	rosterSlotId?: string,
	dateIso: string = DEFAULT_ROSTER_DATE_ISO,
): PrSwapRequest | undefined {
	return swaps.find((s) => {
		if (s.requestingPrId !== prId) return false;
		if (s.status !== "pending_replacement") return false;
		if (rosterSlotId && s.rosterSlotId === rosterSlotId) return true;
		if (s.dateIso === dateIso) return true;
		return false;
	});
}

/** Removed from demo — drop on hydrate / reset so agency inbox stays clean */
export const RETIRED_DEMO_SWAP_IDS = new Set(["swap-seed-1"]);

/** Drop resolved / stale swap inbox rows after hydrate. */
export function mergePrSwapRequests(
	persisted: PrSwapRequest[] | undefined,
	seed: PrSwapRequest[] = SEED_PR_SWAP_REQUESTS,
	agencyRoster: AgencyRosterSlot[] = SEED_AGENCY_ROSTER,
): PrSwapRequest[] {
	const withoutRetired = (list: PrSwapRequest[]) =>
		list.filter((s) => !RETIRED_DEMO_SWAP_IDS.has(s.id));
	const persistedClean = withoutRetired(persisted ?? []);
	const seedClean = withoutRetired(seed);
	const base = persistedClean.length ? persistedClean : seedClean;
	return base.filter((swap) => {
		if (
			swap.status !== "pending_agency" &&
			swap.status !== "pending_replacement"
		)
			return true;
		const slot = agencyRoster.find((s) => s.id === swap.rosterSlotId);
		if (!slot) return false;
		if (slot.prId !== swap.requestingPrId) return false;
		return true;
	});
}

export function pendingSwapOffersForPr(
	swaps: PrSwapRequest[],
	prId: string,
): PrSwapRequest[] {
	return swaps.filter(
		(s) => s.status === "pending_replacement" && s.replacementPrId === prId,
	);
}

export interface PrSwapTargetOption {
	id: string;
	kind: "roster" | "offer";
	outlet: string;
	date: string;
	dateIso: string;
	shift: string;
	rosterSlotId?: string;
	offerId?: string;
}

/** Shifts a PR can swap into — excludes their current booked shift. */
export function swapTargetOptionsForPr(
	roster: AgencyRosterSlot[],
	prId: string,
	sourceSlot: AgencyRosterSlot | undefined,
	tiedOffers: AgencyTiedOffer[],
	declinedOfferIds: string[] = [],
): PrSwapTargetOption[] {
	if (!sourceSlot) return [];

	const seen = new Set<string>();
	const targets: PrSwapTargetOption[] = [];

	const add = (option: PrSwapTargetOption) => {
		if (
			outletMatches(option.outlet, sourceSlot.outlet) &&
			option.dateIso === sourceSlot.dateIso
		) {
			return;
		}
		const key = `${option.outlet}|${option.dateIso}`;
		if (seen.has(key)) return;
		seen.add(key);
		targets.push(option);
	};

	for (const slot of roster) {
		if (slot.id === sourceSlot.id) continue;
		if (slot.prId !== prId || slot.status !== "assignment-pending") continue;
		if (!isDemoDateOnOrAfter(slot.dateIso)) continue;
		add({
			id: `roster-${slot.id}`,
			kind: "roster",
			outlet: slot.outlet,
			date: slot.date,
			dateIso: slot.dateIso,
			shift: slot.shift,
			rosterSlotId: slot.id,
		});
	}

	for (const offer of tiedOffers) {
		if (declinedOfferIds.includes(offer.id)) continue;
		if (outletMatches(offer.outlet, sourceSlot.outlet)) continue;
		const dateIso = `${offer.date[0]}-${String(offer.date[1]).padStart(2, "0")}-${String(offer.date[2]).padStart(2, "0")}`;
		if (!isDemoDateOnOrAfter(dateIso)) continue;
		add({
			id: `offer-${offer.id}`,
			kind: "offer",
			outlet: offer.outlet,
			date: fmtDateLabelFromIso(dateIso),
			dateIso,
			shift: offer.time,
			offerId: offer.id,
		});
	}

	return targets.sort(
		(a, b) =>
			a.dateIso.localeCompare(b.dateIso) || a.outlet.localeCompare(b.outlet),
	);
}

export const SEED_PR_SWAP_REQUESTS: PrSwapRequest[] = [];

/** Demo: tied 8 months ago — under 1-year lock */
export const PR_AGENCY_CODES: Record<string, string> = {
	ATLAS2026: "atlas",
	LUNA26: "luna",
	NOVA26: "nova",
	DELTA26: "delta",
};

function tiedOfferYmd(
	weekday: number,
	allowToday = false,
): [number, number, number] {
	return ymdFromIso(isoOnWeekday(getLiveTodayIso(), weekday, allowToday));
}

export const PR_AGENCY_TIED_OFFERS: AgencyTiedOffer[] = [
	{
		id: "tied-velvet",
		agencyName: "Atlas Agency",
		outlet: "Velvet 23",
		event: "Private VIP — Hennessy Launch · Agency offer",
		date: ymdFromIso(getLiveTodayIso()),
		time: "22:00 — 04:00",
		endNext: true,
		distance: "1.2 km",
		addr: "Jalan Changkat, KL",
		base: 280,
		comm: 40,
		vip: true,
		rating: "4.8",
		briefing:
			"Black dress code. VIP tables 1–8. Mandarin preferred for host table.",
		headcount: 15,
		supplied: 11,
	},
	{
		id: "tied-mermate",
		agencyName: "Atlas Agency",
		outlet: "Mermate",
		event: weekdayEventName(5, "regular"),
		date: tiedOfferYmd(5),
		time: "21:00 — 02:00",
		endNext: true,
		distance: "2.8 km",
		addr: "Bangsar, KL",
		base: 260,
		comm: 35,
		vip: false,
		rating: "4.7",
		briefing: "Casual smart. Agency pre-confirmed rate RM260 + comm.",
		headcount: 13,
		supplied: 8,
	},
	{
		id: "tied-onyx",
		agencyName: "Atlas Agency",
		outlet: "Onyx KL",
		event: weekdayEventName(4, "lounge"),
		date: tiedOfferYmd(4, true),
		time: "21:00 — 03:00",
		endNext: true,
		distance: "3.4 km",
		addr: "Jalan P. Ramlee, KL",
		base: 240,
		comm: 40,
		vip: false,
		rating: "4.6",
		briefing: "Same-night coverage. Smart casual. English + Cantonese helpful.",
		headcount: 14,
		supplied: 10,
	},
	{
		id: "tied-bear",
		agencyName: "Atlas Agency",
		outlet: "Bear Lounge",
		event: weekdayEventName(5, "lounge launch"),
		date: tiedOfferYmd(5),
		time: "22:30 — 04:30",
		endNext: true,
		distance: "4.5 km",
		addr: "Damansara, PJ",
		base: 270,
		comm: 38,
		vip: true,
		rating: "4.8",
		briefing:
			"Launch night floor. Black dress code. High table turnover expected.",
		headcount: 16,
		supplied: 9,
	},
	{
		id: "tied-urban",
		agencyName: "Atlas Agency",
		outlet: "Urban Soul",
		event: weekdayEventName(5, "party"),
		date: tiedOfferYmd(5),
		time: "20:00 — 01:00",
		endNext: true,
		distance: "5.1 km",
		addr: "Bukit Bintang, KL",
		base: 220,
		comm: 40,
		vip: true,
		rating: "4.9",
		briefing: "Launch party energy. Heels required. Tier III+ preferred.",
		headcount: 18,
		supplied: 11,
	},
	{
		id: "tied-mermate-sat",
		agencyName: "Atlas Agency",
		outlet: "Mermate",
		event: weekdayEventName(6, "VIP"),
		date: tiedOfferYmd(6),
		time: "21:00 — 02:00",
		endNext: true,
		distance: "2.8 km",
		addr: "Bangsar, KL",
		base: 280,
		comm: 45,
		vip: true,
		rating: "4.8",
		briefing: "VIP tables only. Mandarin preferred. Agency pre-approved rate.",
		headcount: 14,
		supplied: 7,
	},
	{
		id: "tied-onyx-sat",
		agencyName: "Atlas Agency",
		outlet: "Onyx KL",
		event: weekdayEventName(6, "rooftop"),
		date: tiedOfferYmd(6),
		time: "20:00 — 02:00",
		endNext: true,
		distance: "3.4 km",
		addr: "Jalan P. Ramlee, KL",
		base: 290,
		comm: 45,
		vip: true,
		rating: "4.7",
		briefing: "Rooftop VIP. Smart casual. English + Cantonese helpful.",
		headcount: 15,
		supplied: 8,
	},
];

export const PR_MARKETPLACE_LISTINGS: MarketplaceListing[] =
	PR_SHIFT_OFFERS.map((s, i) => ({
		...s,
		id: `mkt-${i}`,
		area: i === 0 ? "Changkat" : i === 1 ? "KLCC" : "Bukit Bintang",
		rate: s.base + s.comm,
		role: "PR Host",
		languages:
			i === 0
				? ["English", "Mandarin"]
				: i === 1
					? ["English", "Cantonese"]
					: ["English", "Mandarin", "Cantonese"],
		tierMin: i === 0 ? 4 : 3,
		tierSlots: [
			{ tier: "Tier IV", count: 2, hours: "22:00–01:00" },
			{ tier: "Tier III", count: 3, hours: "23:00–03:00" },
		],
		briefing:
			i === 0
				? "Rooftop VIP. Smart casual. Outlet scans your QR to attribute sales."
				: i === 1
					? "Lounge floor. Heels required. Apply — outlet confirms within 2h."
					: "Launch party. High energy. Split blocks by tier shown below.",
		lat: 3.1478 + i * 0.01,
		lng: 101.7005 + i * 0.01,
	}));

export function remapSeedUpcomingShift(
	shift: PrUpcomingShift,
): PrUpcomingShift {
	return { ...shift, date: migrateDemoYmd(shift.date) };
}

export function remapSeedUpcomingShifts(
	shifts: PrUpcomingShift[],
): PrUpcomingShift[] {
	return shifts.map(remapSeedUpcomingShift);
}

export const SEED_UPCOMING_SHIFTS: PrUpcomingShift[] = [];

export const SEED_PR_NOTIFICATIONS: PrNotification[] = [
	{
		id: "n-pv-1",
		kind: "pv",
		title: "Payment Voucher ready",
		body: "PV-2026-0512 · RM1,630 net — Finance Head pre-signed. Review & sign.",
		at: "10 May · 09:20",
		read: false,
		href: "/host/PaymentVoucher",
		pvId: "PV-2026-0512",
		prId: "p1",
	},
];

/** @deprecated Use SosIncident from @/lib/ops-notifications */
export type { SosIncident } from "@agency-portal/lib/ops-notifications";

/** Demo: tied 8 months ago — under 1-year lock */
export const DEMO_AGENCY_TIED_AT = "2025-10-04";

export function listingById(id: string): MarketplaceListing | undefined {
	return PR_MARKETPLACE_LISTINGS.find((l) => l.id === id);
}

export function tiedOfferById(id: string): AgencyTiedOffer | undefined {
	return PR_AGENCY_TIED_OFFERS.find((o) => o.id === id);
}

export function offerToShiftIndex(listingId: string): number {
	const listing = listingById(listingId);
	if (!listing) return 0;
	return PR_SHIFT_OFFERS.findIndex((s) => s.outlet === listing.outlet);
}

export function tiedOfferToShiftIndex(offerId: string): number {
	const offer = tiedOfferById(offerId);
	if (!offer) return 0;
	return PR_SHIFT_OFFERS.findIndex((s) => s.outlet === offer.outlet);
}

export function monthsSinceTied(isoDate: string): number {
	const start = new Date(isoDate);
	const now = new Date(2026, 5, 4);
	return (
		(now.getFullYear() - start.getFullYear()) * 12 +
		(now.getMonth() - start.getMonth())
	);
}

export function isWithinOneYearTie(isoDate: string): boolean {
	return monthsSinceTied(isoDate) < 12;
}
