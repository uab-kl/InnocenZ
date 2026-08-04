export type TrafficLevel = "red" | "yellow" | "green";

/**
 * red = alert/caution (nothing supplied yet), yellow = warning (partially filled),
 * green = demand met or exceeded. Thresholds are ratio-based so callers don't need
 * to special-case units (PRs, RM, drinks, etc).
 */
export function trafficLevelForRatio(
	actual: number,
	target: number,
): TrafficLevel {
	if (target <= 0) return actual > 0 ? "green" : "yellow";
	const ratio = actual / target;
	if (ratio >= 1) return "green";
	if (ratio > 0) return "yellow";
	return "red";
}
