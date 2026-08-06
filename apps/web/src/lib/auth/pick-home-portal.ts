/**
 * Pick which web portal a signed-in user should land on.
 * Prefer an explicit role name over a multi-portal list (agency must not
 * win just because it is checked first when both agency + outlet appear).
 */
export type HomePortal = "admin" | "agency" | "outlet";

export function pickHomePortal(
	portals: string[] | null | undefined,
	roleNames: string[] | null | undefined,
): HomePortal | null {
	const names = (roleNames ?? []).map((r) => r.toLowerCase());
	const set = new Set(
		(portals ?? []).map((p) => p.toLowerCase()).filter(Boolean),
	);

	for (const n of names) {
		if (n === "admin") set.add("admin");
		if (n === "agency" || n.startsWith("agency_") || n.startsWith("agency ")) {
			set.add("agency");
		}
		if (n === "outlet" || n.startsWith("outlet_") || n.startsWith("outlet ")) {
			set.add("outlet");
		}
	}

	// Prefer the first portal-bearing role on the account (signup / invite order).
	for (const n of names) {
		if (n === "outlet" || n.startsWith("outlet_") || n.startsWith("outlet ")) {
			return "outlet";
		}
		if (n === "agency" || n.startsWith("agency_") || n.startsWith("agency ")) {
			return "agency";
		}
		if (n === "admin") return "admin";
	}

	if (set.has("outlet") && !set.has("agency")) return "outlet";
	if (set.has("agency") && !set.has("outlet")) return "agency";
	if (set.has("admin") && !set.has("agency") && !set.has("outlet")) {
		return "admin";
	}
	// Both org portals, no decisive role name — stay on outlet last to avoid
	// the old agency-first bias sending outlet operators to /agency.
	if (set.has("outlet")) return "outlet";
	if (set.has("agency")) return "agency";
	if (set.has("admin")) return "admin";
	return null;
}
