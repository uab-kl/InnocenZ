import type { CutlostModel } from "@agency-portal/lib/outlet-cutlost-recommendations";

export type CutlostRequestKind = "release_prs" | "cut_slots" | "best_effort";

export type PendingCutlostRequest = {
	id: string;
	shiftId: string;
	outletName: string;
	/**
	 * The venue's COMPANY logo (`outlet.logo_image`) — not the outlet owner's
	 * personal account avatar. Optional: demo rows carry none, and an outlet
	 * that has uploaded nothing has none, so the tile keeps its initial.
	 */
	outletLogo?: string | null;
	shiftEvent: string;
	shiftLabel: string;
	dateLabel: string;
	kind: CutlostRequestKind;
	model?: CutlostModel;
	status: "pending" | "approved" | "rejected";
	releasedPrIds?: string[];
	releasedPrNames?: string[];
	slotsCut?: number;
	estimatedSavings: number;
	cutlostBefore: number;
	/** A display label on demo rows ("13 Jul 2026 · 12:40"). */
	requestedAt: string;
	/**
	 * The backend's `created_at`, an ISO instant in UTC. Formatted for the
	 * reader at render time (`cutlostRequestedAtLabel`) — printing it raw showed
	 * "2026-08-06T08:12:25.416Z", a UTC clock eight hours off the venue's.
	 */
	requestedAtIso?: string;
	declineReason?: string;
	rationale?: string[];
};

/**
 * A backend cut-loss request in the shape these screens already render.
 *
 * The two differ because the backend stores nothing it can reach by FK: outlet
 * name, event, slot and date all arrive joined, and the PR names come from the
 * assignment rows. Mapping here rather than reshaping the components keeps the
 * demo store and the real endpoint on ONE rendering path.
 *
 * `cutlostBefore` has no server-side counterpart — it is a display figure the
 * prototype computed from its own store — so it is 0 rather than invented.
 */
export function toPendingCutlostRequest(live: {
	id: string;
	shiftId: string;
	kind: CutlostRequestKind;
	status: "pending" | "approved" | "rejected";
	slotsCut: number | null;
	estimatedSavings: string;
	rationale: string[] | null;
	declineReason: string | null;
	createdAt: string;
	outletName: string | null;
	outletLogo?: string | null;
	shiftDate: string;
	slot: string | null;
	eventName: string | null;
	releasedAssignments: Array<{ prId: string; prName: string | null }>;
}): PendingCutlostRequest {
	return {
		id: live.id,
		shiftId: live.shiftId,
		outletName: live.outletName ?? "Venue",
		outletLogo: live.outletLogo ?? null,
		shiftEvent: live.eventName ?? live.slot ?? "Shift",
		shiftLabel: live.slot ?? "",
		dateLabel: live.shiftDate,
		kind: live.kind,
		status: live.status,
		releasedPrIds: live.releasedAssignments.map((a) => a.prId),
		releasedPrNames: live.releasedAssignments.map((a) => a.prName ?? "a PR"),
		slotsCut: live.slotsCut ?? undefined,
		estimatedSavings: Number(live.estimatedSavings) || 0,
		cutlostBefore: 0,
		requestedAt: live.createdAt,
		requestedAtIso: live.createdAt,
		declineReason: live.declineReason ?? undefined,
		rationale: live.rationale ?? undefined,
	};
}

/**
 * When the venue asked, in the reader's language and on their clock.
 *
 * A live row carries an ISO instant; a demo row carries a finished label and
 * passes through. `timeZone` exists for tests — screens omit it and read the
 * browser's own zone, like every other stamp in the portal.
 */
export function cutlostRequestedAtLabel(
	req: Pick<PendingCutlostRequest, "requestedAt" | "requestedAtIso">,
	localeTag: string,
	timeZone?: string,
): string {
	if (!req.requestedAtIso) return req.requestedAt;
	const at = new Date(req.requestedAtIso);
	if (Number.isNaN(at.getTime())) return req.requestedAt;
	return at.toLocaleString(localeTag, {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		...(timeZone ? { timeZone } : {}),
	});
}

/**
 * The shift's day as a reader says it ("Thu, 6 Aug 2026"). The backend sends
 * the `date` column as `YYYY-MM-DD`, parsed here as a LOCAL calendar day so no
 * zone can move it; anything else is a demo label and passes through.
 */
export function cutlostShiftDateLabel(
	dateLabel: string,
	localeTag: string,
): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateLabel);
	if (!m) return dateLabel;
	const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
	return day.toLocaleDateString(localeTag, {
		weekday: "short",
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

/**
 * The "Cutlost RM …" chip's figure, or null to leave the chip out.
 *
 * `cutlostBefore` has no server-side counterpart — the mapper above sets it to
 * 0 for every live row — so the chip read "Cutlost RM 0" on each one. Nothing
 * to show is not a loss of zero.
 */
export function cutlostLossChipRm(
	req: Pick<PendingCutlostRequest, "cutlostBefore">,
): number | null {
	return req.cutlostBefore > 0 ? Math.round(req.cutlostBefore) : null;
}

export function cutlostRequestTitle(
	req: Pick<
		PendingCutlostRequest,
		"kind" | "model" | "releasedPrNames" | "slotsCut"
	>,
): string {
	if (req.kind === "best_effort" || req.model === "best_effort") {
		return "Best-effort cutlost plan";
	}
	if (req.kind === "release_prs") {
		const names = req.releasedPrNames ?? [];
		if (names.length === 1) return `Release ${names[0]} early`;
		if (names.length === 2) return "Release 2 PRs early";
		return `Release ${names.length} PRs early`;
	}
	const n = req.slotsCut ?? 0;
	return n === 1 ? "Cut 1 open slot" : `Cut ${n} open slots`;
}

export function cutlostRequestDetail(req: PendingCutlostRequest): string {
	if (req.kind === "best_effort") {
		const parts: string[] = [];
		if ((req.slotsCut ?? 0) > 0) {
			parts.push(`${req.slotsCut} slot${req.slotsCut === 1 ? "" : "s"} cut`);
		}
		if (req.releasedPrNames?.length) {
			parts.push(
				`release ${req.releasedPrNames.join(", ")} (80% unused wages)`,
			);
		}
		return `${req.outletName} · ${parts.join(" · ") || "Early-release plan"}`;
	}
	if (req.kind === "release_prs") {
		const names = req.releasedPrNames?.join(", ") ?? "Selected PRs";
		return `${req.outletName} · ${names}`;
	}
	return `${req.outletName} · ${req.slotsCut ?? 0} unfilled slot${(req.slotsCut ?? 0) === 1 ? "" : "s"} off plan`;
}
