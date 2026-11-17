import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

/**
 * WHAT IS WAITING FOR ME, ON A QUEUE PAGE (owner, 17 Nov 2026 — users "don't
 * know … where and what he need to decide"). `DESIGN.md` §7, the Queue pattern.
 *
 * Every admin queue used to give EVERY row the same outline "Review" button, a
 * declined request from August looking exactly as urgent as one filed this
 * morning. These pieces say it three ways, all presentation, none of them a new
 * action:
 *
 *   - the row: `queueRowState` stamps `data-queue-state`; the admin CSS draws
 *     an amber leading edge on "decide" rows only;
 *   - the button: FILLED "Review" on a row that can still be acted on, a quiet
 *     "View" on a finished one. Both call the SAME `onOpen` the row click already
 *     does — the word changes because there is nothing left to review on a
 *     closed row;
 *   - the page: `QueueWaitingStrip`, "N waiting for your decision", with a
 *     shortcut onto the page's OWN status filter.
 *
 * THREE states, because the badge and the server draw two different lines:
 *   decide — NEW and untouched; exactly the rows the rail badge counts, so the
 *            strip's number always equals the amber rows it describes;
 *   open   — already in hand (e.g. "contacted") but still decidable: filled
 *            button, no amber edge, not counted;
 *   done   — closed; quiet "View".
 *
 * ⚠️ "decide" + "open" together must be the SAME set the server accepts a
 * decision on (e.g. `isAwaitingAnswer`) — a filled "Review" on a row the server
 * then refuses would be worse than no cue at all.
 */
export type QueueRowStateValue = "decide" | "open" | "done";

export function queueRowState(state: QueueRowStateValue): {
	"data-queue-state": QueueRowStateValue;
} {
	return { "data-queue-state": state };
}

export function QueueRowButton({
	state,
	onOpen,
}: {
	state: QueueRowStateValue;
	onOpen: () => void;
}) {
	const { t } = usePortalLocale();
	const actionable = state !== "done";
	return (
		<Button
			type="button"
			size="sm"
			variant={actionable ? "default" : "ghost"}
			className="iz-queue-action"
			onClick={(event) => {
				// The row is clickable too; one click must open the sheet once.
				event.stopPropagation();
				onOpen();
			}}
		>
			{actionable ? t.rbac.review : t.common.view}
		</Button>
	);
}

/**
 * "N waiting for your decision" above a queue table. Renders nothing at 0 —
 * an empty amber strip would itself be noise (`DESIGN.md` §2, show less).
 *
 * `count` must be the SAME number the rail badge shows for this page, so the
 * strip and the badge can never disagree.
 */
export function QueueWaitingStrip({
	count,
	showingWaiting,
	onShowWaiting,
	onShowAll,
}: {
	count: number;
	/** True while the page's status filter already narrows to waiting rows. */
	showingWaiting: boolean;
	onShowWaiting: () => void;
	onShowAll: () => void;
}) {
	const { t } = usePortalLocale();
	if (count <= 0) return null;
	const words =
		count === 1
			? t.admin.queueWaitingOne
			: fill(t.admin.queueWaitingMany, { count });
	return (
		<div className="iz-queue-waiting">
			<Clock aria-hidden className="size-5 shrink-0" />
			<p className="iz-queue-waiting__text">{words}</p>
			<Button
				type="button"
				size="sm"
				variant="outline"
				onClick={showingWaiting ? onShowAll : onShowWaiting}
			>
				{showingWaiting ? t.admin.queueShowAll : t.admin.queueShowWaiting}
			</Button>
		</div>
	);
}
