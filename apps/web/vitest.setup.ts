/**
 * Give the tests a real `localStorage` back.
 *
 * NODE 25 BROKE IT, NOT THIS REPO. Node now defines a global `localStorage` of
 * its own, and it lands on the jsdom `window` too — verified rather than
 * guessed: inside the vitest environment `globalThis.localStorage` and
 * `window.localStorage` are the SAME object, and neither has `.clear`. Node
 * warns `--localstorage-file was provided without a valid path` on every run,
 * which is that stub announcing it has nowhere to persist to. `sessionStorage`
 * is untouched and still jsdom's, because Node only defines the one — which is
 * why `sessionStorage.clear()` succeeded on the line directly above the
 * `localStorage.clear()` that threw.
 *
 * That cost 20 tests across `agency-identity.test.ts` and
 * `outlet-identity.test.ts` — every one of them a real assertion about which
 * user a cached identity belongs to, so they are worth having back rather than
 * rewriting to avoid the call.
 *
 * jsdom's original is NOT recoverable — Node replaced it on `window`, so there
 * is nothing to restore and a compliant Storage has to be installed instead.
 *
 * GUARDED, so this disappears on its own. It only replaces a `localStorage`
 * that is already broken; on a Node/jsdom pairing that behaves, the ambient one
 * is left exactly as it is and this file does nothing. It is a shim for a
 * runtime bug, not a permanent second implementation of the browser.
 *
 * Spec-compliant past what the app needs on purpose. The four methods used in
 * `src/` today are clear/getItem/setItem/removeItem, but `length` and `key()`
 * cost nothing here and a half-Storage would fail the first test that reaches
 * for them — which is the shape of the bug being fixed.
 */

function createMemoryStorage(): Storage {
	const entries = new Map<string, string>();

	const storage: Storage = {
		get length(): number {
			return entries.size;
		},
		key(index: number): string | null {
			// Storage is index-ordered by insertion, which a Map preserves.
			return [...entries.keys()][index] ?? null;
		},
		getItem(key: string): string | null {
			// A miss is `null`, never `undefined` — callers branch on `=== null`.
			return entries.has(String(key)) ? (entries.get(String(key)) as string) : null;
		},
		setItem(key: string, value: string): void {
			// Real Storage stringifies both sides: setItem('n', 1) reads back "1".
			entries.set(String(key), String(value));
		},
		removeItem(key: string): void {
			entries.delete(String(key));
		},
		clear(): void {
			entries.clear();
		},
	};

	return storage;
}

const ambient = (globalThis as { localStorage?: Storage }).localStorage;
const usable = typeof ambient?.clear === 'function' && typeof ambient?.getItem === 'function';

if (!usable) {
	const storage = createMemoryStorage();
	// Defined on both bindings because application code reads it either way, and
	// `configurable` so a test that wants to stub it further still can.
	for (const target of new Set<object>([globalThis, globalThis.window ?? globalThis])) {
		Object.defineProperty(target, 'localStorage', {
			value: storage,
			configurable: true,
			writable: true,
		});
	}
}
