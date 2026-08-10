/**
 * Per-tab session values, with localStorage as a seed for brand-new tabs only.
 *
 * This is the pattern `auth-storage.ts` already uses for tokens, extracted so
 * identity and session-kind can share it. Tokens were fixed for exactly this bug
 * ("my agency tab suddenly became the outlet") but the identity beside them was
 * left on one shared localStorage slot — so signing into a second portal in
 * another tab still overwrote the first tab's org name, sub-role and org status,
 * and a sign-out there emptied the slot and dropped the surviving tab back to
 * demo data on a real session.
 *
 * A tab copies the seed ONCE and then stays pinned: only a write performed in
 * that tab can change what it holds. `remove` deliberately keeps the pin, so a
 * sign-out cannot be undone by a later re-seed from a stale mirror.
 */
function tabStore(): Storage | null {
	return typeof window === "undefined" ? null : window.sessionStorage;
}

function seedStore(): Storage | null {
	return typeof window === "undefined" ? null : window.localStorage;
}

function pinFlag(key: string): string {
	return `${key}::pinned`;
}

/** Copies the shared seed into this tab exactly once, then pins the tab. */
function ensureSeeded(tab: Storage, key: string): void {
	const pin = pinFlag(key);
	if (tab.getItem(pin)) return;
	const seed = seedStore();
	const value = seed?.getItem(key) ?? null;
	if (value !== null && tab.getItem(key) === null) tab.setItem(key, value);
	tab.setItem(pin, "1");
}

export function readTabScoped(key: string): string | null {
	try {
		const tab = tabStore();
		if (!tab) return null;
		ensureSeeded(tab, key);
		return tab.getItem(key);
	} catch {
		// Storage unavailable (SSR / privacy mode) — behave as "nothing stored".
		return null;
	}
}

export function writeTabScoped(key: string, value: string): void {
	try {
		const tab = tabStore();
		if (tab) {
			// A write in this tab IS the pin — never re-seed over it.
			tab.setItem(pinFlag(key), "1");
			tab.setItem(key, value);
		}
		// Tabs opened after this write inherit it via the seed.
		seedStore()?.setItem(key, value);
	} catch {
		// Storage unavailable — nothing to persist.
	}
}

export function removeTabScoped(key: string): void {
	try {
		// The pin STAYS: clearing must not invite a re-seed of the value we just
		// deleted, the next time this tab reads the key.
		tabStore()?.setItem(pinFlag(key), "1");
		tabStore()?.removeItem(key);
		seedStore()?.removeItem(key);
	} catch {
		// Storage unavailable — nothing to clear.
	}
}
