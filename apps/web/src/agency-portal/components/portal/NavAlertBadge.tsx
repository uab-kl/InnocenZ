import type { NavAlertMap } from "@agency-portal/lib/portal-nav-alerts";
import { createContext, useContext, useEffect, useState } from "react";

/**
 * A LEAF module: the context and the badge that reads it, and nothing else.
 *
 * `Nav.tsx` and `PortalShell.tsx` both draw a badge, and the counts behind one
 * come from `PortalNavAlerts.tsx`, which imports half a dozen data hooks. Had
 * the context lived there, `Nav.tsx` would import that whole graph to draw a
 * pill — and this app has already lost the entire agency portal once to a
 * latent import cycle that only bit when `tsr generate` re-ordered the route
 * imports (see the import-cycle memory). A leaf that imports React and one pure
 * module cannot take part in a cycle.
 */
const NO_ALERTS: NavAlertMap = Object.freeze({});

export const NavAlertContext = createContext<NavAlertMap>(NO_ALERTS);

/**
 * The SEPARATE counts behind the badges, for the Today page's To do panel
 * (owner, 16 Nov 2026: "everything at todo and todays page will guide the user
 * where they need todo actions"). The rail sums payroll's four queues into one
 * pill; the panel names each one with its own button. Fed by the SAME provider
 * and the same queries, so the panel and the rail can never disagree.
 */
export interface PortalTodoCounts {
	/**
	 * True while any count behind the panel is still loading. The panel must
	 * not say "All clear" until it KNOWS — an empty list mid-load is not a
	 * finding, and an all-clear that turns into four rows a second later
	 * teaches people not to trust it.
	 */
	loading: boolean;
	counts: Readonly<Record<string, number>>;
}
export const PortalTodoCountsContext = createContext<PortalTodoCounts>(
	Object.freeze({ loading: false, counts: Object.freeze({}) }),
);
export function usePortalTodoCounts(): PortalTodoCounts {
	return useContext(PortalTodoCountsContext);
}

/**
 * The menu paths THIS role can open, as the shell built them. A To do row is
 * shown only when its destination is one of them — a row the role cannot act
 * on is a button that leads to a refusal. `null` outside the shell.
 */
export const PortalNavPathsContext = createContext<ReadonlySet<string> | null>(
	null,
);
export function usePortalNavPaths(): ReadonlySet<string> | null {
	return useContext(PortalNavPathsContext);
}

/**
 * What each nav row should badge, keyed by its `to` path.
 *
 * Returns `{}` outside a provider rather than throwing. Every nav surface in
 * this app renders in places the provider may not wrap — the mobile tab bar on
 * a route that mounts its own shell, a story, a test — and a rail that renders
 * without its badges is correct; a rail that white-screens is not.
 */
export function useNavAlerts(): NavAlertMap {
	return useContext(NavAlertContext);
}

/**
 * Whether the counts behind the badges have SETTLED: every query that feeds
 * one has given its first answer. `PortalNavAlerts` provides it from those
 * queries' own loading flags — not from a timer, which would be a guess about
 * the network.
 *
 * It exists for one rule (owner, 18 Nov 2026 — "Pop only on change"): a badge
 * stays still while a page opens or reloads, and pops only when its number
 * CHANGES while the user is on the page. A hard load used to pop every badge
 * at once as the counts arrived, which is not news — it is the page loading.
 *
 * `true` outside a provider: a badge mounted there has no first load to wait
 * for, so it takes the number it mounts with as already known.
 */
export const NavAlertSettledContext = createContext<boolean>(true);

/**
 * How long a pop stays stamped on the pill. Longer than the longest motion it
 * gates — M4 in portal-motion.css: the 360ms pop, then the red ring's 700ms
 * after it, 1060ms in all — so taking the stamp off never cuts a motion short.
 *
 * Why the stamp comes OFF at all: a CSS animation restarts whenever its element
 * goes from `display: none` back to shown, and a closed rail section hides its
 * rows. A stamp left on would replay the pop the moment someone opened that
 * section — a pop with no change behind it. Same pattern, same reason, as
 * `PICK_MS` in lib/motion-pick.ts.
 */
export const NAV_ALERT_POP_MS = 1200;

/** "99+" shows for anything above 99, so 120 → 130 is not a change anyone sees. */
function shownCount(count: number): number {
	return count <= 0 ? 0 : Math.min(count, 100);
}

interface PopMemory {
	/** The number this pill last showed (0 = nothing shown). */
	seen: number;
	/** Whether the counts had settled when it last looked. */
	settled: boolean;
	/** Bumped on every pop; the pill's `key`, so a second pop restarts the first. */
	seq: number;
	/** True for `NAV_ALERT_POP_MS` after a pop. */
	popping: boolean;
}

/**
 * When the pill should pop, and nothing else.
 *
 * It pops only when the counts had ALREADY settled on the previous look and
 * the shown number differs now. That one condition gives every case:
 * - first load (still loading → settled, whatever the number is by then): the
 *   look where it settles adopts the number silently — the last query and the
 *   "loading" flag land in the same render, so comparing there would pop the
 *   very first answer;
 * - a pill that MOUNTS after the counts settled (a rail section folded shut, a
 *   second shell): it starts from what it shows, so mounting is not a change;
 * - a refetch with the same number: nothing differs, nothing pops;
 * - 0 → 1, n → m once settled: pops. This is why the rail keeps the badge
 *   MOUNTED at 0 — an instance that unmounted at 0 would forget it was 0.
 *
 * The memory is adjusted DURING render (React's "storing information from
 * previous renders" pattern), so the new number and its pop reach the screen
 * in the same paint — an effect would paint the new number first, then blank
 * it into the pop.
 */
export function useNavAlertPop(
	count: number,
	settled: boolean,
): { seq: number; popping: boolean } {
	const shown = shownCount(count);
	const [memory, setMemory] = useState<PopMemory>(() => ({
		seen: shown,
		settled,
		seq: 0,
		popping: false,
	}));
	let current = memory;
	if (memory.seen !== shown || memory.settled !== settled) {
		const changed =
			settled && memory.settled && shown !== memory.seen && shown > 0;
		current = {
			seen: shown,
			settled,
			seq: changed ? memory.seq + 1 : memory.seq,
			popping: changed || memory.popping,
		};
		setMemory(current);
	}
	const { seq, popping } = current;
	useEffect(() => {
		if (!popping) return;
		const timer = setTimeout(
			() => setMemory((m) => (m.seq === seq ? { ...m, popping: false } : m)),
			NAV_ALERT_POP_MS,
		);
		return () => clearTimeout(timer);
	}, [seq, popping]);
	return { seq, popping };
}

/**
 * The count pill beside a nav label.
 *
 * `aria-hidden` on the number with the whole thing announced on the LINK
 * instead (see `navAlertAriaSuffix`): a screen reader reading "Payroll" then a
 * bare "7" gives no clue what seven is. Nothing renders at zero — see
 * `portal-nav-alerts.ts` for why an absent badge beats a grey 0.
 *
 * `data-iz-pop` is set for a moment after the number CHANGES once the counts
 * have settled (see `useNavAlertPop`); portal-motion.css M4 pops only a pill
 * that carries it, on the desktop rail. Presentation only: nothing reads it.
 */
export function NavAlertBadge({
	count,
	tone,
}: {
	count: number;
	tone: "amber" | "red";
}) {
	const settled = useContext(NavAlertSettledContext);
	const { seq, popping } = useNavAlertPop(count, settled);
	if (count <= 0) return null;
	return (
		<span
			key={seq}
			className="iz-nav-alert"
			data-tone={tone}
			data-iz-pop={popping ? "" : undefined}
			aria-hidden="true"
		>
			{count > 99 ? "99+" : count}
		</span>
	);
}

/**
 * ", 7 waiting" — appended to a nav item's accessible name.
 *
 * The suffix word is a PARAMETER, not a default: module scope cannot call a
 * hook to read the dictionary, and a hardcoded English fallback here is exactly
 * how a translated portal ends up with one English word in it.
 */
export function navAlertAriaSuffix(
	count: number | undefined,
	waitingWord: string,
): string {
	return count && count > 0 ? `, ${count} ${waitingWord}` : "";
}
