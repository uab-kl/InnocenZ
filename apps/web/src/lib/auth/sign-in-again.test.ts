import { beforeEach, describe, expect, it, vi } from "vitest";

const kickToLogin = vi.fn();
vi.mock("@/lib/auth/guards", () => ({
	kickToLogin: () => kickToLogin(),
}));

import {
	clearSignInAgainNotice,
	markSignInAgain,
	peekSignInAgainNotice,
	signInAgain,
} from "./sign-in-again";

/**
 * A change that SAVED but returned no tokens must reach the login page with its
 * reason — whether the person taps "Sign in again" or a background request's
 * 401 gets there first.
 */
describe("sign-in-again notice", () => {
	beforeEach(() => {
		sessionStorage.clear();
		localStorage.clear();
		kickToLogin.mockClear();
	});

	it("signInAgain remembers WHY before it leaves", () => {
		kickToLogin.mockImplementation(() => {
			// At the moment of the kick the reason must already be written — the
			// hard navigation that follows gives no later chance.
			expect(peekSignInAgainNotice()).toBe("password");
		});
		signInAgain("password");
		expect(kickToLogin).toHaveBeenCalledTimes(1);
		kickToLogin.mockReset();
	});

	it("is kept for this tab only — never seeded into tabs opened later", () => {
		markSignInAgain("email");
		expect(peekSignInAgainNotice()).toBe("email");
		expect(localStorage.length).toBe(0);
	});

	it("peek does not consume; clear does", () => {
		markSignInAgain("phone");
		expect(peekSignInAgainNotice()).toBe("phone");
		expect(peekSignInAgainNotice()).toBe("phone");
		clearSignInAgainNotice();
		expect(peekSignInAgainNotice()).toBeNull();
	});

	it("ignores anything it did not write", () => {
		sessionStorage.setItem("iz-signed-out-after-change", "admin");
		expect(peekSignInAgainNotice()).toBeNull();
	});
});
