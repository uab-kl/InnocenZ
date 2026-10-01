import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthFlowError } from "./auth-flow-client";

/**
 * THE EMAIL-CODE STEP, AS STATE: WHAT IT SENDS, WHAT IT KEEPS, AND WHERE A
 * REFUSED SIGN-UP LEAVES IT (owner, 30 Sep 2026 — no account until the code
 * sent to the typed email comes back).
 *
 * The api module is mocked, so no code is ever sent from here; the refusals
 * are real `AuthFlowError`s carrying the contract's own sentences.
 */

const api = vi.hoisted(() => ({ requestSignupEmailCode: vi.fn() }));
vi.mock("@/lib/auth/signup-email-code-api", () => api);

import { useSignupEmailCode } from "./use-signup-email-code";

const CODE_ID = "0b0c8d62-7a64-4d3e-9d8f-3c0b4b1f2a11";
const SECOND_ID = "5f3c1d20-1b6e-4c52-9a0e-7d9e2b8c4f33";
const SENT = "We sent a 6-digit code to that email — it expires in 10 minutes";

function sentReply(codeId = CODE_ID, resendAfterSec = 60) {
	return { codeId, expiresInSec: 600, resendAfterSec, message: SENT };
}

function setup(initial = "owner@venue.com") {
	return renderHook(({ email }) => useSignupEmailCode(email), {
		initialProps: { email: initial },
	});
}

type Hook = ReturnType<typeof setup>;

/** Send for the current address and type a whole code. */
async function toCodeTyped(hook: Hook, code = "123456") {
	api.requestSignupEmailCode.mockResolvedValueOnce(sentReply());
	await act(async () => {
		await hook.result.current.send();
	});
	act(() => hook.result.current.setCode(code));
}

beforeEach(() => {
	api.requestSignupEmailCode.mockReset();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("useSignupEmailCode · send", () => {
	it("offers Send only for something that could be an address", () => {
		const hook = setup("");
		expect(hook.result.current.canSend).toBe(false);
		hook.rerender({ email: "owner@venue" });
		expect(hook.result.current.canSend).toBe(false);
		hook.rerender({ email: "owner@venue.com" });
		expect(hook.result.current.canSend).toBe(true);
		expect(hook.result.current.sentTo).toBeNull();
		expect(hook.result.current.proof).toBeNull();
	});

	it("sends the typed address and opens the code state with the server's sentence", async () => {
		const hook = setup(" Owner@Venue.com ");
		api.requestSignupEmailCode.mockResolvedValueOnce(sentReply());

		let outcome: Awaited<ReturnType<Hook["result"]["current"]["send"]>> = null;
		await act(async () => {
			outcome = await hook.result.current.send();
		});

		expect(api.requestSignupEmailCode).toHaveBeenCalledWith(
			" Owner@Venue.com ",
		);
		expect(outcome).toEqual({ ok: true, message: SENT });
		expect(hook.result.current.sentTo).toBe("owner@venue.com");
		expect(hook.result.current.notice).toEqual({ kind: "sent", message: SENT });
		// The server's resend window, for this address.
		expect(hook.result.current.resendIn).toBe(60);
		expect(hook.result.current.canSend).toBe(false);
	});

	it("proves nothing until all six digits are typed — and keeps digits only", async () => {
		const hook = setup();
		await toCodeTyped(hook, "12 3-4");
		expect(hook.result.current.code).toBe("1234");
		expect(hook.result.current.proof).toBeNull();

		act(() => hook.result.current.setCode("123456789"));
		expect(hook.result.current.code).toBe("123456");
		expect(hook.result.current.proof).toEqual({
			emailCodeId: CODE_ID,
			emailCode: "123456",
		});
	});

	it("will not send twice while one is in flight, nor inside the window", async () => {
		const hook = setup();
		let resolve: (value: ReturnType<typeof sentReply>) => void = () => {};
		api.requestSignupEmailCode.mockReturnValueOnce(
			new Promise((r) => {
				resolve = r;
			}),
		);
		let first: Promise<unknown> = Promise.resolve();
		act(() => {
			first = hook.result.current.send();
		});
		expect(hook.result.current.sending).toBe(true);
		await act(async () => {
			expect(await hook.result.current.send()).toBeNull();
		});
		await act(async () => {
			resolve(sentReply());
			await first;
		});
		// Inside the resend window now.
		await act(async () => {
			expect(await hook.result.current.send()).toBeNull();
		});
		expect(api.requestSignupEmailCode).toHaveBeenCalledTimes(1);
	});

	it("the window runs down, then Resend replaces the code and clears the digits", async () => {
		vi.useFakeTimers();
		const hook = setup();
		await toCodeTyped(hook);
		for (let i = 0; i < 60; i++) {
			act(() => {
				vi.advanceTimersByTime(1000);
			});
		}
		expect(hook.result.current.resendIn).toBe(0);
		expect(hook.result.current.canSend).toBe(true);

		api.requestSignupEmailCode.mockResolvedValueOnce(sentReply(SECOND_ID));
		await act(async () => {
			await hook.result.current.send();
		});
		expect(hook.result.current.code).toBe("");
		act(() => hook.result.current.setCode("654321"));
		expect(hook.result.current.proof).toEqual({
			emailCodeId: SECOND_ID,
			emailCode: "654321",
		});
	});

	it("a refused send says the server's sentence and honours its wait", async () => {
		const hook = setup();
		api.requestSignupEmailCode.mockRejectedValueOnce(
			new AuthFlowError("Wait 42s before requesting another code", 429, 42),
		);
		let outcome: Awaited<ReturnType<Hook["result"]["current"]["send"]>> = null;
		await act(async () => {
			outcome = await hook.result.current.send();
		});
		expect(outcome).toEqual({
			ok: false,
			message: "Wait 42s before requesting another code",
		});
		expect(hook.result.current.sentTo).toBeNull();
		expect(hook.result.current.resendIn).toBe(42);
		expect(hook.result.current.notice).toEqual({
			kind: "sendRefused",
			message: "Wait 42s before requesting another code",
		});
	});

	it("a refused RESEND leaves the code already sent standing", async () => {
		vi.useFakeTimers();
		const hook = setup();
		await toCodeTyped(hook);
		for (let i = 0; i < 60; i++) {
			act(() => {
				vi.advanceTimersByTime(1000);
			});
		}
		api.requestSignupEmailCode.mockRejectedValueOnce(
			new AuthFlowError(
				"Too many verification codes requested for that email. Please try again later.",
				429,
			),
		);
		await act(async () => {
			await hook.result.current.send();
		});
		expect(hook.result.current.proof).toEqual({
			emailCodeId: CODE_ID,
			emailCode: "123456",
		});
		expect(hook.result.current.notice?.kind).toBe("sendRefused");
	});
});

describe("useSignupEmailCode · one code, one address", () => {
	it("typing a different address clears the code, and going back does not restore it", async () => {
		const hook = setup();
		await toCodeTyped(hook);

		hook.rerender({ email: "someone@else.com" });
		expect(hook.result.current.sentTo).toBeNull();
		expect(hook.result.current.code).toBe("");
		expect(hook.result.current.proof).toBeNull();
		expect(hook.result.current.notice).toBeNull();
		// The window belongs to the first address, not to this one.
		expect(hook.result.current.canSend).toBe(true);

		hook.rerender({ email: "owner@venue.com" });
		expect(hook.result.current.sentTo).toBeNull();
		expect(hook.result.current.proof).toBeNull();
		// …where the server's window is still running.
		expect(hook.result.current.resendIn).toBeGreaterThan(0);
		expect(hook.result.current.canSend).toBe(false);
	});

	it("case and surrounding spaces are the same address, as the server reads it", async () => {
		const hook = setup();
		await toCodeTyped(hook);
		hook.rerender({ email: "  OWNER@venue.COM " });
		expect(hook.result.current.proof).toEqual({
			emailCodeId: CODE_ID,
			emailCode: "123456",
		});
	});

	it("a code that lands after the address changed is not kept", async () => {
		const hook = setup();
		let resolve: (value: ReturnType<typeof sentReply>) => void = () => {};
		api.requestSignupEmailCode.mockReturnValueOnce(
			new Promise((r) => {
				resolve = r;
			}),
		);
		let pending: Promise<unknown> = Promise.resolve();
		act(() => {
			pending = hook.result.current.send();
		});
		hook.rerender({ email: "someone@else.com" });
		await act(async () => {
			resolve(sentReply());
			await pending;
		});
		expect(hook.result.current.sentTo).toBeNull();
		hook.rerender({ email: "owner@venue.com" });
		expect(hook.result.current.sentTo).toBeNull();
	});

	it("Change email goes back to the send state", async () => {
		const hook = setup();
		await toCodeTyped(hook);
		act(() => hook.result.current.changeEmail());
		expect(hook.result.current.sentTo).toBeNull();
		expect(hook.result.current.proof).toBeNull();
	});
});

describe("useSignupEmailCode · after a refused sign-up", () => {
	it.each([
		[
			409,
			"We couldn't complete sign-up — if you already have an account, sign in or reset your password",
		],
		[
			409,
			"That email already has an account — sign in, or reset your password",
		],
		// Any 409 at all: an accepted code is spent whatever the sentence.
		[409, "Something the contract did not name"],
		[400, "That code has expired — request a new one"],
		[400, "Verify your email first — we will send you a 6-digit code"],
		[429, "Too many attempts — request a new code"],
	])(
		"%i %s → back to Send code, the window still running",
		async (status, message) => {
			const hook = setup();
			await toCodeTyped(hook);

			let outcome = "";
			act(() => {
				outcome = hook.result.current.afterRefusal(message, status);
			});

			expect(outcome).toBe("resend");
			expect(hook.result.current.sentTo).toBeNull();
			expect(hook.result.current.code).toBe("");
			expect(hook.result.current.proof).toBeNull();
			expect(hook.result.current.notice).toEqual({ kind: "resend" });
			expect(hook.result.current.resendIn).toBeGreaterThan(0);
		},
	);

	it("a wrong code clears only the digits — the same code may be typed again", async () => {
		const hook = setup();
		await toCodeTyped(hook);
		act(() => {
			expect(hook.result.current.afterRefusal("Invalid code", 400)).toBe(
				"retype",
			);
		});
		expect(hook.result.current.sentTo).toBe("owner@venue.com");
		expect(hook.result.current.code).toBe("");
		expect(hook.result.current.notice).toEqual({ kind: "retype" });

		act(() => hook.result.current.setCode("123457"));
		expect(hook.result.current.notice).toBeNull();
		expect(hook.result.current.proof).toEqual({
			emailCodeId: CODE_ID,
			emailCode: "123457",
		});
	});

	it.each([
		[429, "Too many sign-up attempts. Please try again later."],
		[400, "Passwords do not match"],
		[null, ""],
	])("%s %s leaves the code and its digits alone", async (status, message) => {
		const hook = setup();
		await toCodeTyped(hook);
		act(() => {
			expect(hook.result.current.afterRefusal(message, status)).toBe("keep");
		});
		expect(hook.result.current.proof).toEqual({
			emailCodeId: CODE_ID,
			emailCode: "123456",
		});
	});
});
