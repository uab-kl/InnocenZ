import type { CutlostModel } from "@agency-portal/lib/outlet-cutlost-recommendations";

export type CutlostRequestKind = "release_prs" | "cut_slots" | "best_effort";

export type PendingCutlostRequest = {
	id: string;
	shiftId: string;
	outletName: string;
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
	requestedAt: string;
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
	shiftDate: string;
	slot: string | null;
	eventName: string | null;
	releasedAssignments: Array<{ prId: string; prName: string | null }>;
}): PendingCutlostRequest {
	return {
		id: live.id,
		shiftId: live.shiftId,
		outletName: live.outletName ?? "Venue",
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
		declineReason: live.declineReason ?? undefined,
		rationale: live.rationale ?? undefined,
	};
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
