import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthFlowError } from "./auth-flow-client";

/**
 * THE TWO-STEP PASSWORD CHANGE: WHAT IT SENDS, WHAT IT KEEPS, AND WHERE A
 * REFUSAL LEAVES THE PERSON.
 *
 * Owner, 21 Sep 2026, asked what the signed-in change should become: "Current
 * password + a code". What this pins:
 *  - NEITHER password is kept in the flow — the current one goes to `start` and
 *    the new one to `submitCode`, both as arguments, so a resend can carry
 *    neither;
 *  - a resend REPLACES the requestId, or confirm spends a row the server has
 *    already expired;
 *  - a refusal keeps the code step open so the code can be retyped, and never
 *    resolves as a success;
 *  - a confirm that saved but returned no tokens says so, because that is the
 *    only signal that this tab's token is already dead.
 *
 * The api module is mocked; the refusals are real AuthFlowErrors carrying the
 * backend's own sentences.
 */

const api = vi.hoisted(() => ({
	startPasswordChange: vi.fn(),
	resendPasswordChangeCode: vi.fn(),
	confirmPasswordChange: vi.fn(),
}));

vi.mock("@/lib/auth/password-api", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/lib/auth/password-api")>();
	return { ...actual, ...api };
});

import { usePasswordChange } from "./use-password-change";

const SENT = [
	{ channel: "whatsapp", to: "+60 ••••• 6789", status: "sent" },
	{ channel: "email", to: "o••••@atlas-agency.my", status: "sent" },
];
const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";

function started(requestId: string) {
	return { requestId, sentTo: SENT, expiresInSec: 600, resendAfterSec: 60 };
}

function setup() {
	return renderHook(() => usePasswordChange());
}

/** Through `start` to the code step, with a valid code typed in. */
async function toCodeStep(result: ReturnType<typeof setup>["result"]) {
	api.startPasswordChange.mockResolvedValueOnce(started(FIRST_ID));
	await act(async () => {
		await result.current.start("s3cret");
	});
	act(() => result.current.setCode("123456"));
	expect(result.current.stage).toBe("code");
}

describe("usePasswordChange", () => {
	beforeEach(() => {
		for (const fn of Object.values(api)) fn.mockReset();
	});

	it("start sends only the current password and opens the code step", async () => {
		const { result } = setup();
		await toCodeStep(result);

		expect(api.startPasswordChange).toHaveBeenCalledWith({
			currentPassword: "s3cret",
		});
		expect(result.current.codeOpen).toBe(true);
		expect(result.current.sentTo).toEqual(SENT);
		// The countdown starts from the server's own resendAfterSec.
		expect(result.current.resendIn).toBe(60);
	});

	it("confirm carries the NEW password and the flow keeps neither password", async () => {
		const { result } = setup();
		await toCodeStep(result);
		api.confirmPasswordChange.mockResolvedValueOnce({
			message: "Password updated",
			tokensStored: true,
		});

		let confirmed: unknown;
		await act(async () => {
			confirmed = await result.current.submitCode("brand-new-pw");
		});

		expect(api.confirmPasswordChange).toHaveBeenCalledWith({
			requestId: FIRST_ID,
			code: "123456",
			newPassword: "brand-new-pw",
		});
		expect(confirmed).toEqual({
			message: "Password updated",
			tokensStored: true,
		});
		expect(result.current.stage).toBe("done");
		// Nothing the hook returns carries either password.
		expect(JSON.stringify(result.current)).not.toContain("s3cret");
		expect(JSON.stringify(result.current)).not.toContain("brand-new-pw");
	});

	it("resend REPLACES the requestId, and sends no password", async () => {
		const { result } = setup();
		await toCodeStep(result);
		api.resendPasswordChangeCode.mockResolvedValueOnce(started(SECOND_ID));

		await act(async () => {
			await result.current.resend();
		});

		expect(api.resendPasswordChangeCode).toHaveBeenCalledWith({
			requestId: FIRST_ID,
		});
		// The code box is cleared: the old code is dead with its row.
		expect(result.current.code).toBe("");

		act(() => result.current.setCode("654321"));
		api.confirmPasswordChange.mockResolvedValueOnce({
			message: "Password updated",
			tokensStored: true,
		});
		await act(async () => {
			await result.current.submitCode("brand-new-pw");
		});
		expect(api.confirmPasswordChange).toHaveBeenCalledWith({
			requestId: SECOND_ID,
			code: "654321",
			newPassword: "brand-new-pw",
		});
	});

	it("a short code never reaches the server", async () => {
		const { result } = setup();
		await toCodeStep(result);
		act(() => result.current.setCode("12"));

		await act(async () => {
			expect(await result.current.submitCode("brand-new-pw")).toBeNull();
		});
		expect(api.confirmPasswordChange).not.toHaveBeenCalled();
		expect(result.current.problem).toEqual({ kind: "codeRequired" });
		expect(result.current.stage).toBe("code");
	});

	it("a wrong code keeps the code step open with the reason", async () => {
		const { result } = setup();
		await toCodeStep(result);
		api.confirmPasswordChange.mockRejectedValueOnce(
			new AuthFlowError("Invalid code", 400),
		);

		await act(async () => {
			expect(await result.current.submitCode("brand-new-pw")).toBeNull();
		});
		expect(result.current.stage).toBe("code");
		expect(result.current.codeOpen).toBe(true);
		expect(result.current.problem).toEqual({
			kind: "server",
			error: expect.objectContaining({ message: "Invalid code" }),
		});
	});

	it("a wrong current password leaves the flow at step 1 with the reason", async () => {
		const { result } = setup();
		api.startPasswordChange.mockRejectedValueOnce(
			new AuthFlowError("Current password is incorrect", 400),
		);

		await act(async () => {
			expect(await result.current.start("nope")).toBe(false);
		});
		expect(result.current.stage).toBe("idle");
		expect(result.current.codeOpen).toBe(false);
		expect(result.current.problem).toEqual({
			kind: "server",
			error: expect.objectContaining({
				message: "Current password is incorrect",
			}),
		});
	});

	/** A lockout's seconds drive the countdown, so Resend is not offered early. */
	it("a 429 with retryAfterSec starts the countdown", async () => {
		const { result } = setup();
		api.startPasswordChange.mockRejectedValueOnce(
			new AuthFlowError(
				"Too many failed attempts. Try again in 5 minutes.",
				429,
				300,
			),
		);

		await act(async () => {
			await result.current.start("nope");
		});
		expect(result.current.resendIn).toBe(300);
	});

	it("saved with no tokens is reported, not swallowed", async () => {
		const { result } = setup();
		await toCodeStep(result);
		api.confirmPasswordChange.mockResolvedValueOnce({
			message: "Password updated",
			tokensStored: false,
		});

		let confirmed: unknown;
		await act(async () => {
			confirmed = await result.current.submitCode("brand-new-pw");
		});
		expect(confirmed).toEqual({
			message: "Password updated",
			tokensStored: false,
		});
	});
});
