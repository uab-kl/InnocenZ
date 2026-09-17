/**
 * "YOUR CHANGE IS SAVED — SIGN IN AGAIN", carried across the hop to /login.
 *
 * A password, email or phone change stamps `sessions_valid_from`, retiring the
 * token this tab holds, and answers with a fresh pair. When that answer carries
 * NO pair (the write committed, the re-issue failed), the tab is holding a dead
 * token. The PR app says so and signs out on the next tap; the web used to say
 * "Password updated" and carry on, and the next request's 401 threw the person
 * to the login page with nothing to explain why — right after a change that had
 * worked.
 *
 * So the sheets show the notice and offer Sign in again, and the SAME fact is
 * written here first: if any background request collects that 401 before the
 * person taps (a refetch on focus, a poll), the interceptor's kick still lands
 * on a login page that knows why.
 *
 * sessionStorage, not the tab-scoped token helpers: the notice belongs to THIS
 * tab's hop and must never seed a tab opened later.
 *
 * ⚠️ Imports `guards` only for the kick. `guards` must never import this back.
 */
import { kickToLogin } from "@/lib/auth/guards";

export type ChangedCredential = "password" | "email" | "phone";

const KEY = "iz-signed-out-after-change";

function isChangedCredential(value: unknown): value is ChangedCredential {
	return value === "password" || value === "email" || value === "phone";
}

/** Remember, for the login page, that a change was saved and why we left. */
export function markSignInAgain(changed: ChangedCredential): void {
	try {
		window.sessionStorage.setItem(KEY, changed);
	} catch {
		// Storage unavailable — the sheet still says it; only the banner is lost.
	}
}

/** What the login page should say, if anything. Read-only — see `clear…`. */
export function peekSignInAgainNotice(): ChangedCredential | null {
	try {
		const value = window.sessionStorage.getItem(KEY);
		return isChangedCredential(value) ? value : null;
	} catch {
		return null;
	}
}

/** Said once: the login page clears it after reading, so a reload is silent. */
export function clearSignInAgainNotice(): void {
	try {
		window.sessionStorage.removeItem(KEY);
	} catch {
		// Nothing stored, nothing to clear.
	}
}

/**
 * Leave cleanly: remember why, clear the dead tokens and go to /login — with
 * `next` pointing back here, so signing in again returns to the same page.
 */
export function signInAgain(changed: ChangedCredential): void {
	markSignInAgain(changed);
	kickToLogin();
}
