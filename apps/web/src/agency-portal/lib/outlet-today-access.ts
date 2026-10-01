/**
 * WHAT THE TODAY PAGE'S "PR TONIGHT" PANEL MAY SHOW — asked of the grants.
 *
 * The panel returned `null` for anyone without `ratePrs` (`rating:create`), so
 * a Director — who opens Today on `dashboard:read` and holds `booking:read`,
 * `sales:read`, `history:read` and `rating:read` in `role_permission` — saw the
 * shift cards and then nothing about who was working them. Rating is ONE button
 * on that panel; gating the whole panel on it hid a read the database grants.
 *
 * Each part now asks for the permission ITS data needs:
 *   · the panel itself — who is on the floor — `viewLiveDashboard`, the same
 *     permission that admits the Today page (`canAccessOutletPath`);
 *   · the live-sales figures — `viewSalesDashboard` (`sales:read`);
 *   · a PR's shift history — `viewHistory` (`history:read`);
 *   · the Rate button and the rating sheet — `ratePrs` (`rating:create`),
 *     which is the only WRITE on the panel and stays exactly as gated as before.
 *
 * `ratePrs` still opens the panel on its own, so no lane that saw it before
 * loses it.
 */
export type TodayPrPanelPermission =
	| "viewLiveDashboard"
	| "viewSalesDashboard"
	| "viewHistory"
	| "ratePrs";

export interface TodayPrPanelAccess {
	/** Render the panel at all. */
	show: boolean;
	/** The Rate button, the post-seal rate prompt and the rating sheet. */
	canRate: boolean;
	/** The Live sales section and each card's Live sales button. */
	canSeeSales: boolean;
	/** Each card's Shift history button. */
	canSeeHistory: boolean;
}

export function todayPrPanelAccess(
	can: (permission: TodayPrPanelPermission) => boolean,
): TodayPrPanelAccess {
	const canRate = can("ratePrs");
	return {
		show: canRate || can("viewLiveDashboard"),
		canRate,
		canSeeSales: can("viewSalesDashboard"),
		canSeeHistory: can("viewHistory"),
	};
}
