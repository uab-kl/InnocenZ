import { describe, expect, it } from "vitest";
import { AuthFlowError } from "./auth-flow-client";
import {
	confirmStepOutcome,
	identityStepOutcome,
	keepsLineOnStepThree,
} from "./contact-change-outcome";

/**
 * WHERE A REFUSAL LEAVES THE PERSON — the web half of the PR app's rule.
 *
 * The sentences below are the backend's own, copied from
 * account-code/contact-change.controller.ts and delivery.ts (17 Sep 2026), not
 * from the module under test — a test that read the module's list would pass
 * on a list that had drifted from the server.
 */
const refusal = (message: string, status: number | null) =>
	new AuthFlowError(message, status);

describe("identityStepOutcome", () => {
	it("a code #2 that failed to go out moves ON — code #1 is already spent", () => {
		expect(
			identityStepOutcome(
				refusal("Could not send the code — try again later", 503),
			),
		).toBe("identitySpent");
		expect(identityStepOutcome(refusal("Could not send the code", 500))).toBe(
			"identitySpent",
		);
		expect(identityStepOutcome(refusal("Internal Server Error", 500))).toBe(
			"identitySpent",
		);
	});

	it("a double tap that lost the race moves on too", () => {
		expect(
			identityStepOutcome(refusal("This code was already used", 409)),
		).toBe("identitySpent");
	});

	it("a contact taken meanwhile goes back to the field", () => {
		expect(
			identityStepOutcome(
				refusal("That email is already used by another account", 409),
			),
		).toBe("taken");
		expect(
			identityStepOutcome(
				refusal("That phone number is already used by another account.", 409),
			),
		).toBe("taken");
	});

	it("a wrong code, a cooldown, a limiter or no response stays put", () => {
		for (const [message, status] of [
			["Invalid code", 400],
			["This change has expired — start again", 400],
			["Too many attempts — request a new code", 429],
			["Wait 42s before requesting another code", 429],
			["Too many attempts. Please try again later.", 429],
			["Network Error", null],
		] as const) {
			expect(identityStepOutcome(refusal(message, status)), message).toBe(
				"stay",
			);
		}
	});
});

describe("confirmStepOutcome", () => {
	it("only a taken contact leaves step 3", () => {
		expect(
			confirmStepOutcome(
				refusal("That email is already used by another account", 409),
			),
		).toBe("taken");
		expect(confirmStepOutcome(refusal("Invalid code", 400))).toBe("stay");
		expect(
			confirmStepOutcome(
				refusal("This code has expired — request a new one", 400),
			),
		).toBe("stay");
		expect(confirmStepOutcome(refusal("Internal Server Error", 500))).toBe(
			"stay",
		);
	});
});

describe("keepsLineOnStepThree", () => {
	it("drops the delivery failure — step 3 with nothing sent already says it", () => {
		expect(
			keepsLineOnStepThree(
				refusal("Could not send the code — try again later", 503),
			),
		).toBe(false);
		expect(
			keepsLineOnStepThree(refusal("This code was already used", 409)),
		).toBe(false);
	});

	it("keeps an unexplained server error", () => {
		expect(keepsLineOnStepThree(refusal("Internal Server Error", 500))).toBe(
			true,
		);
		expect(keepsLineOnStepThree(refusal("Could not send the code", 500))).toBe(
			true,
		);
	});
});
