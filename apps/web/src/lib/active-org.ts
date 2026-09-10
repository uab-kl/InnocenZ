/**
 * Which organisation this tab is working in.
 *
 * A person may staff several agencies or venues. Nothing used to ask them which
 * one: `resolveOrgScope` on the server took the FIRST active membership — after
 * its ordering, the OLDEST — and `pickPrimaryMembership` here took the highest
 * sub-role. Neither is a choice, and between them somebody at two agencies
 * operated only one, with the other unreachable. This is where their answer
 * lives (owner, 10 Sep 2026).
 *
 * PER TAB, with localStorage as a seed for brand-new tabs — the same rule the
 * tokens and the portal identity beside them follow, and for the same reason:
 * signing into a second organisation in another tab must not silently move this
 * one. It also buys the useful shape for free — two agencies open side by side
 * in two tabs.
 *
 * ⚠️ THE SERVER NEVER TRUSTS THIS. It travels as `x-org-id` and is honoured only
 * when it matches a membership that is active for the caller; anything else
 * falls back to the previous behaviour rather than failing the request. So a
 * stale value here is harmless — it cannot reach an organisation the person does
 * not belong to, and it cannot lock them out of one they do.
 *
 * Sign-out clears it (`clearAuthTokens`), so the next person to sign in on this
 * machine cannot inherit the last one's choice.
 */
import {
	readTabScoped,
	removeTabScoped,
	writeTabScoped,
} from "@/lib/auth/tab-scoped-storage";

const KEY = "innocenz.activeOrg";

export type ActiveOrg = {
	kind: "agency" | "outlet";
	id: string;
};

/** The stored choice, or null when there is none or storage refuses to answer. */
export function getActiveOrg(): ActiveOrg | null {
	try {
		const raw = readTabScoped(KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<ActiveOrg>;
		if (typeof parsed?.id !== "string" || !parsed.id) return null;
		if (parsed.kind !== "agency" && parsed.kind !== "outlet") return null;
		return { kind: parsed.kind, id: parsed.id };
	} catch {
		/*
		 * JSON.parse on a value some other build wrote in a different shape.
		 * The caller behaves as though nothing was chosen, which is the safe
		 * direction: both sides fall back to the membership they would have
		 * picked anyway. (readTabScoped already swallows storage failures.)
		 */
		return null;
	}
}

/** The chosen id, but only when it is a choice about `kind`. */
export function getActiveOrgId(kind: "agency" | "outlet"): string | null {
	const org = getActiveOrg();
	return org && org.kind === kind ? org.id : null;
}

export function setActiveOrg(org: ActiveOrg): void {
	writeTabScoped(KEY, JSON.stringify(org));
}

export function clearActiveOrg(): void {
	removeTabScoped(KEY);
}
