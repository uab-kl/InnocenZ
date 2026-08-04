import type { AgencyRosterSlot } from "@agency-portal/lib/agency-demo";
import { findOutletShiftForRosterSlot } from "@agency-portal/lib/outlet-demo";
import { outletMatches } from "@agency-portal/lib/portal-sync";
import {
	PR_SHIFT_OFFERS,
	type PrActiveShiftSession,
	type PrShiftOffer,
	type PrSubRole,
	parseYmdIso,
	TIED_DEMO_ROSTER_PR_ID,
} from "@agency-portal/lib/pr-demo";
import { swapBlocksRequestingPrShift } from "@agency-portal/lib/pr-features";
import { DEFAULT_ROSTER_DATE_ISO } from "@agency-portal/lib/roster-availability";
import { primarySlotForPrOnDate } from "@agency-portal/lib/roster-week-plan";
export type PrMarketplaceApplicationState = {
	listingId: string;
	status: "pending" | "accepted" | "declined";
	applicantId?: string;
	shiftId?: string;
} | null;

export type PrCheckInMetaState = {
	late?: boolean;
	noShowRisk?: boolean;
	selfieDataUrl?: string | null;
	gpsFallback?: boolean;
	/** Preserved after check-out for attendance summary */
	closedShift?: PrActiveShiftSession | null;
};

export interface PrShiftSessionState {
	shiftAccepted: boolean;
	pendingApproval: boolean;
	acceptedShiftIndex: number | null;
	checkedIn: boolean;
	checkedOut: boolean;
	drinks: number;
	tables: number;
	prActiveShift: PrActiveShiftSession | null;
	prCheckInMeta: PrCheckInMetaState;
	prMarketplaceApplication: PrMarketplaceApplicationState;
}

export type PrSessionContext = {
	agencyRoster: AgencyRosterSlot[];
	prSwapRequests?: import("@agency-portal/lib/pr-features").PrSwapRequest[];
};

export const EMPTY_PR_SHIFT_SESSION: PrShiftSessionState = {
	shiftAccepted: false,
	pendingApproval: false,
	acceptedShiftIndex: null,
	checkedIn: false,
	checkedOut: false,
	drinks: 0,
	tables: 0,
	prActiveShift: null,
	prCheckInMeta: {},
	prMarketplaceApplication: null,
};

export function shiftIndexForOutlet(outlet: string): number {
	const idx = PR_SHIFT_OFFERS.findIndex((o) => outletMatches(o.outlet, outlet));
	return idx >= 0 ? idx : 0;
}

const ACTIVE_ROSTER_STATUSES = new Set<AgencyRosterSlot["status"]>([
	"on-duty",
	"en-route",
	"scheduled",
	"assignment-pending",
	"outlet-pending",
]);

function shiftEndsNextDay(shiftStart: string, shiftEnd: string): boolean {
	const sh = Number(shiftStart.split(":")[0]);
	const eh = Number(shiftEnd.split(":")[0]);
	return !Number.isNaN(sh) && !Number.isNaN(eh) && eh <= sh;
}

/** Canonical shift time label — matches PR portal display. */
export function formatRosterShiftTime(
	slot: Pick<AgencyRosterSlot, "shift" | "shiftStart" | "shiftEnd">,
): string {
	return slot.shift || `${slot.shiftStart} — ${slot.shiftEnd}`;
}

export type OutletShiftRef = {
	outletName: string;
	shift: string;
	event?: string;
};

/** Build PR shift card from agency roster slot (+ optional outlet shift for event name). */
export function resolvePrShiftOfferFromRoster(
	slot: AgencyRosterSlot | null | undefined,
	fallbackIndex = 0,
	outletShift?: OutletShiftRef | null,
): PrShiftOffer {
	const template = PR_SHIFT_OFFERS[fallbackIndex] ?? PR_SHIFT_OFFERS[0];
	if (!slot) return template;

	const outletIdx = shiftIndexForOutlet(slot.outlet);
	const outletTemplate = outletIdx >= 0 ? PR_SHIFT_OFFERS[outletIdx] : template;
	const [y, m, d] = parseYmdIso(slot.dateIso);
	const comm = outletTemplate.comm;
	const base =
		slot.estPayout != null
			? Math.max(0, slot.estPayout - comm)
			: outletTemplate.base;

	return {
		outlet: slot.outlet,
		event: outletShift?.event ?? outletTemplate.event,
		date: [y, m, d],
		time: formatRosterShiftTime(slot),
		endNext: shiftEndsNextDay(slot.shiftStart, slot.shiftEnd),
		distance: outletTemplate.distance,
		addr: outletTemplate.addr,
		base,
		comm,
		vip: outletTemplate.vip,
		rating: outletTemplate.rating,
	};
}

export function resolvePrShiftOfferForPr(
	roster: AgencyRosterSlot[],
	prId: string,
	fallbackIndex: number | null | undefined,
	outletShifts?: OutletShiftRef[],
	dateIso: string = DEFAULT_ROSTER_DATE_ISO,
): PrShiftOffer {
	const slot = findAgencyRosterTonight(roster, prId, dateIso);
	const idx = fallbackIndex ?? (slot ? shiftIndexForOutlet(slot.outlet) : 0);
	const outletShift =
		slot && outletShifts
			? findOutletShiftForRosterSlot(outletShifts, slot)
			: undefined;
	return resolvePrShiftOfferFromRoster(slot, idx, outletShift);
}

export function findAgencyRosterTonight(
	roster: AgencyRosterSlot[],
	prId: string,
	dateIso: string = DEFAULT_ROSTER_DATE_ISO,
): AgencyRosterSlot | undefined {
	const slot = primarySlotForPrOnDate(roster, prId, dateIso);
	if (!slot || !ACTIVE_ROSTER_STATUSES.has(slot.status)) return undefined;
	return slot;
}

/** Bootstrap the tied PR shift flow from the agency roster. */
export function defaultPrShiftSessionForRole(
	_role: PrSubRole,
	ctx: PrSessionContext,
): PrShiftSessionState {
	const swaps = ctx.prSwapRequests ?? [];
	if (swapBlocksRequestingPrShift(swaps, TIED_DEMO_ROSTER_PR_ID)) {
		return { ...EMPTY_PR_SHIFT_SESSION };
	}

	const slot = findAgencyRosterTonight(
		ctx.agencyRoster,
		TIED_DEMO_ROSTER_PR_ID,
	);
	if (!slot) return { ...EMPTY_PR_SHIFT_SESSION };

	const pending =
		slot.status === "outlet-pending" ||
		slot.status === "outlet-request-pending";

	return {
		shiftAccepted: !pending,
		pendingApproval: pending,
		acceptedShiftIndex: shiftIndexForOutlet(slot.outlet),
		// Roster on-duty is for agency/outlet floor view — PR app check-in requires prActiveShift.
		checkedIn: false,
		checkedOut: false,
		drinks: slot.floorDrinks ?? 0,
		tables: 0,
		prActiveShift: null,
		prCheckInMeta: {},
		prMarketplaceApplication: null,
	};
}

export function extractPrShiftSession(st: {
	shiftAccepted: boolean;
	pendingApproval: boolean;
	acceptedShiftIndex: number | null;
	checkedIn: boolean;
	checkedOut: boolean;
	drinks: number;
	tables: number;
	prActiveShift: PrActiveShiftSession | null;
	prCheckInMeta: PrCheckInMetaState;
	prMarketplaceApplication: PrMarketplaceApplicationState;
}): PrShiftSessionState {
	return {
		shiftAccepted: st.shiftAccepted,
		pendingApproval: st.pendingApproval,
		acceptedShiftIndex: st.acceptedShiftIndex,
		checkedIn: st.checkedIn,
		checkedOut: st.checkedOut,
		drinks: st.drinks,
		tables: st.tables,
		prActiveShift: st.prActiveShift,
		prCheckInMeta: { ...st.prCheckInMeta },
		prMarketplaceApplication: st.prMarketplaceApplication
			? { ...st.prMarketplaceApplication }
			: null,
	};
}

/** PR portal is only on-duty when a live shift session exists (set by prCheckIn). */
export function normalizePrShiftSession(
	session: PrShiftSessionState,
): PrShiftSessionState {
	if (session.checkedIn && !session.checkedOut && !session.prActiveShift) {
		return { ...session, checkedIn: false };
	}
	return session;
}

export function applyPrShiftSession(
	session: PrShiftSessionState,
): PrShiftSessionState {
	const normalized = normalizePrShiftSession(session);
	return {
		...normalized,
		prCheckInMeta: { ...normalized.prCheckInMeta },
		prMarketplaceApplication: normalized.prMarketplaceApplication
			? { ...normalized.prMarketplaceApplication }
			: null,
	};
}

export function clearPrShiftSession(): PrShiftSessionState {
	return {
		...EMPTY_PR_SHIFT_SESSION,
		prCheckInMeta: {},
		prMarketplaceApplication: null,
	};
}

/** Clear the cached session when a swap completes for that PR. */
export function patchPrSessionForRole(
	st: {
		prSubRole: PrSubRole | null;
		prSessionByRole: Partial<Record<PrSubRole, PrShiftSessionState>>;
		agencyRoster: AgencyRosterSlot[];
	},
	role: PrSubRole,
	patch: Partial<PrShiftSessionState>,
): {
	prSessionByRole: Partial<Record<PrSubRole, PrShiftSessionState>>;
} & Partial<PrShiftSessionState> {
	const base =
		st.prSessionByRole[role] ??
		defaultPrShiftSessionForRole(role, { agencyRoster: st.agencyRoster });
	const next = { ...base, ...patch };
	const prSessionByRole = { ...st.prSessionByRole, [role]: next };

	if (st.prSubRole === role) {
		return { prSessionByRole, ...applyPrShiftSession(next) };
	}
	return { prSessionByRole };
}
