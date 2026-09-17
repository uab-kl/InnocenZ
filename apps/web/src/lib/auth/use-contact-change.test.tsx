import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthFlowError } from "./auth-flow-client";

/**
 * THE STATE MACHINE'S TWO MOVING REFUSALS, AND THE TOKENLESS CONFIRM.
 *
 * `contact-change-outcome.test.ts` pins which refusal means what; this pins
 * that the hook actually MOVES on them (parity with the PR app):
 *  - code #2 failing to go out after code #1 was accepted → step 3, no code
 *    yet, Verify unavailable, Resend (resend-new) available at once;
 *  - the new contact taken meanwhile → back to the field with the reason;
 *  - a confirm that saved but returned no tokens → nothing is refetched, since
 *    every refetch would carry a retired token into a 401.
 *
 * The api module is mocked; the refusals are real AuthFlowErrors with the
 * backend's own sentences.
 */

const api = vi.hoisted(() => ({
	startContactChange: vi.fn(),
	verifyContactChangeIdentity: vi.fn(),
	resendContactChangeNewCode: vi.fn(),
	confirmContactChange: vi.fn(),
}));

vi.mock("@/lib/auth/contact-change-api", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@/lib/auth/contact-change-api")>();
	return { ...actual, ...api };
});

import { useContactChange } from "./use-contact-change";

const SENT = [{ channel: "whatsapp", to: "+60 ••••• 6789", status: "sent" }];

function setup() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const invalidate = vi.spyOn(client, "invalidateQueries");
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	const hook = renderHook(() => useContactChange(), { wrapper });
	return { ...hook, invalidate };
}

async function toIdentityStep(result: ReturnType<typeof setup>["result"]) {
	api.startContactChange.mockResolvedValueOnce({
		requestId: "11111111-1111-4111-8111-111111111111",
		sentTo: SENT,
		expiresInSec: 300,
		resendAfterSec: 60,
		pendingInvitesToCurrentEmail: 0,
	});
	await act(async () => {
		await result.current.start("phone", "0123456789");
	});
	act(() => result.current.setCode("123456"));
	expect(result.current.stage).toBe("identity");
}

describe("useContactChange · refusals that move the flow", () => {
	beforeEach(() => {
		for (const fn of Object.values(api)) fn.mockReset();
	});

	it("code #2 failed to go out (503) → step 3, nothing to verify, Resend ready", async () => {
		const { result } = setup();
		await toIdentityStep(result);

		api.verifyContactChangeIdentity.mockRejectedValueOnce(
			new AuthFlowError("Could not send the code — try again later", 503),
		);
		await act(async () => {
			await result.current.submitCode();
		});

		expect(result.current.stage).toBe("new");
		expect(result.current.codeOpen).toBe(true);
		expect(result.current.canVerify).toBe(false);
		expect(result.current.resendIn).toBe(0);
		expect(result.current.sentTo).toEqual([]);
		// Step 3 with nothing sent already says "use Resend" — no second line.
		expect(result.current.problem).toBeNull();

		// Resend is resend-new, which needs no new identity code.
		api.resendContactChangeNewCode.mockResolvedValueOnce({
			newRequestId: "22222222-2222-4222-8222-222222222222",
			sentTo: SENT,
			expiresInSec: 600,
			resendAfterSec: 60,
		});
		await act(async () => {
			await result.current.resend();
		});
		expect(api.startContactChange).toHaveBeenCalledTimes(1); // not restarted
		expect(api.resendContactChangeNewCode).toHaveBeenCalledTimes(1);
		expect(result.current.stage).toBe("new");
		expect(result.current.canVerify).toBe(true);
	});

	it("an unexplained 500 after code #1 keeps its line on step 3", async () => {
		const { result } = setup();
		await toIdentityStep(result);

		api.verifyContactChangeIdentity.mockRejectedValueOnce(
			new AuthFlowError("Internal Server Error", 500),
		);
		await act(async () => {
			await result.current.submitCode();
		});

		expect(result.current.stage).toBe("new");
		expect(result.current.problem).toMatchObject({
			kind: "server",
			error: { message: "Internal Server Error" },
		});
	});

	it("a failed resend-new stays on step 3 — it never restarts the change", async () => {
		const { result } = setup();
		await toIdentityStep(result);
		api.verifyContactChangeIdentity.mockRejectedValueOnce(
			new AuthFlowError("Could not send the code — try again later", 503),
		);
		await act(async () => {
			await result.current.submitCode();
		});

		api.resendContactChangeNewCode.mockRejectedValueOnce(
			new AuthFlowError("Could not send the code — try again later", 503),
		);
		await act(async () => {
			await result.current.resend();
		});
		expect(result.current.stage).toBe("new");
		expect(result.current.codeOpen).toBe(true);
		expect(api.startContactChange).toHaveBeenCalledTimes(1);
	});

	it("a wrong code stays on step 2", async () => {
		const { result } = setup();
		await toIdentityStep(result);

		api.verifyContactChangeIdentity.mockRejectedValueOnce(
			new AuthFlowError("Invalid code", 400),
		);
		await act(async () => {
			await result.current.submitCode();
		});
		expect(result.current.stage).toBe("identity");
		expect(result.current.canVerify).toBe(true);
	});

	it("the new number taken meanwhile → back to the field, reason kept", async () => {
		const { result } = setup();
		await toIdentityStep(result);

		api.verifyContactChangeIdentity.mockRejectedValueOnce(
			new AuthFlowError(
				"That phone number is already used by another account",
				409,
			),
		);
		await act(async () => {
			await result.current.submitCode();
		});

		expect(result.current.stage).toBe("idle");
		expect(result.current.codeOpen).toBe(false);
		expect(result.current.problem).toMatchObject({
			kind: "server",
			error: {
				message: "That phone number is already used by another account",
			},
		});
	});
});

describe("useContactChange · confirm", () => {
	beforeEach(() => {
		for (const fn of Object.values(api)) fn.mockReset();
	});

	async function toNewStep(result: ReturnType<typeof setup>["result"]) {
		await toIdentityStep(result);
		api.verifyContactChangeIdentity.mockResolvedValueOnce({
			newRequestId: "22222222-2222-4222-8222-222222222222",
			sentTo: SENT,
			expiresInSec: 600,
			resendAfterSec: 60,
		});
		await act(async () => {
			await result.current.submitCode();
		});
		act(() => result.current.setCode("654321"));
		expect(result.current.stage).toBe("new");
	}

	it("saved WITHOUT tokens: returned as such, and nothing is refetched", async () => {
		const { result, invalidate } = setup();
		await toNewStep(result);

		api.confirmContactChange.mockResolvedValueOnce({
			message: "Phone number updated",
			email: null,
			phoneNum: "+60123456789",
			tokensStored: false,
		});
		let confirmed: Awaited<ReturnType<typeof result.current.submitCode>> = null;
		await act(async () => {
			confirmed = await result.current.submitCode();
		});

		expect(confirmed).toMatchObject({ tokensStored: false });
		expect(result.current.stage).toBe("done");
		expect(invalidate).not.toHaveBeenCalled();
	});

	it("saved WITH tokens: the signed-in account caches are refetched", async () => {
		const { result, invalidate } = setup();
		await toNewStep(result);

		api.confirmContactChange.mockResolvedValueOnce({
			message: "Phone number updated",
			email: null,
			phoneNum: "+60123456789",
			tokensStored: true,
		});
		await act(async () => {
			await result.current.submitCode();
		});

		expect(invalidate).toHaveBeenCalled();
	});

	it("a contact taken at confirm goes back to the field", async () => {
		const { result } = setup();
		await toNewStep(result);

		api.confirmContactChange.mockRejectedValueOnce(
			new AuthFlowError(
				"That phone number is already used by another account",
				409,
			),
		);
		await act(async () => {
			await result.current.submitCode();
		});
		expect(result.current.stage).toBe("idle");
		expect(result.current.problem).not.toBeNull();
	});
});
