import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthFlowError } from "./auth-flow-client";

/**
 * THE ONE-CODE STATE MACHINE: WHAT IT SENDS, WHAT IT KEEPS, AND WHERE A REFUSAL
 * LEAVES THE PERSON.
 *
 * `contact-change-outcome.test.ts` pins which refusal means what; this pins
 * that the hook behaves on them (parity with the PR app):
 *  - the CURRENT PASSWORD goes to `start` and is never kept in the flow, so
 *    resend and confirm cannot carry it;
 *  - a resend REPLACES the requestId, or confirm spends a row the server has
 *    already expired;
 *  - the new contact taken meanwhile → back to the field with the reason;
 *  - a confirm that saved but returned no tokens → nothing is refetched, since
 *    every refetch would carry a retired token into a 401.
 *
 * The api module is mocked; the refusals are real AuthFlowErrors with the
 * backend's own sentences.
 */

const api = vi.hoisted(() => ({
	startContactChange: vi.fn(),
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
const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";

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

function started(requestId: string, pendingInvites = 0) {
	return {
		requestId,
		sentTo: SENT,
		expiresInSec: 600,
		resendAfterSec: 60,
		pendingInvitesToCurrentEmail: pendingInvites,
	};
}

/** Through `start` to the code step, with a valid code typed in. */
async function toCodeStep(
	result: ReturnType<typeof setup>["result"],
	pendingInvites = 0,
) {
	api.startContactChange.mockResolvedValueOnce(
		started(FIRST_ID, pendingInvites),
	);
	await act(async () => {
		await result.current.start("phone", "0123456789", "s3cret");
	});
	act(() => result.current.setCode("123456"));
	expect(result.current.stage).toBe("code");
}

describe("useContactChange · start", () => {
	beforeEach(() => {
		for (const fn of Object.values(api)) fn.mockReset();
	});

	it("sends the current password with the normalised value, and opens the code step", async () => {
		const { result } = setup();
		await toCodeStep(result, 2);

		expect(api.startContactChange).toHaveBeenCalledWith({
			kind: "phone",
			value: "+60123456789",
			currentPassword: "s3cret",
		});
		expect(result.current.codeOpen).toBe(true);
		expect(result.current.sentTo).toEqual(SENT);
		expect(result.current.resendIn).toBe(60);
		expect(result.current.pendingInvitesToCurrentEmail).toBe(2);
	});

	it("a wrong password keeps the flow at the field with the server's reason", async () => {
		const { result } = setup();
		api.startContactChange.mockRejectedValueOnce(
			new AuthFlowError("Current password is incorrect", 400),
		);
		await act(async () => {
			await result.current.start("email", "new@atlas-agency.my", "nope");
		});

		expect(result.current.stage).toBe("idle");
		expect(result.current.codeOpen).toBe(false);
		expect(result.current.problem).toMatchObject({
			kind: "server",
			error: { message: "Current password is incorrect" },
		});
	});
});

describe("useContactChange · the code step", () => {
	beforeEach(() => {
		for (const fn of Object.values(api)) fn.mockReset();
	});

	it("confirms with the id, kind, value and code — and no password", async () => {
		const { result } = setup();
		await toCodeStep(result);

		api.confirmContactChange.mockResolvedValueOnce({
			message: "Phone number updated",
			email: null,
			phoneNum: "+60123456789",
			tokensStored: true,
		});
		await act(async () => {
			await result.current.submitCode();
		});

		expect(api.confirmContactChange).toHaveBeenCalledWith({
			requestId: FIRST_ID,
			kind: "phone",
			value: "+60123456789",
			code: "123456",
		});
		expect(result.current.stage).toBe("done");
	});

	it("a code that is not six digits never reaches the server", async () => {
		const { result } = setup();
		await toCodeStep(result);
		act(() => result.current.setCode("123"));

		await act(async () => {
			await result.current.submitCode();
		});
		expect(api.confirmContactChange).not.toHaveBeenCalled();
		expect(result.current.problem).toEqual({ kind: "codeRequired" });
		expect(result.current.stage).toBe("code");
	});

	it("a wrong code stays on the code step", async () => {
		const { result } = setup();
		await toCodeStep(result);

		api.confirmContactChange.mockRejectedValueOnce(
			new AuthFlowError("Invalid code", 400),
		);
		await act(async () => {
			await result.current.submitCode();
		});
		expect(result.current.stage).toBe("code");
		expect(result.current.codeOpen).toBe(true);
	});

	/*
	 * ⚠️ THE ID MOVES. The server expires the row it had issued and answers a
	 * new one, so a hook that kept the first id would confirm against a dead
	 * row and answer "This code has expired" for a code just read off the phone.
	 */
	it("resend REPLACES the requestId, and confirm then spends the new row", async () => {
		const { result } = setup();
		await toCodeStep(result);

		api.resendContactChangeNewCode.mockResolvedValueOnce(started(SECOND_ID));
		await act(async () => {
			await result.current.resend();
		});
		expect(api.resendContactChangeNewCode).toHaveBeenCalledWith({
			requestId: FIRST_ID,
			kind: "phone",
			value: "+60123456789",
		});
		expect(api.startContactChange).toHaveBeenCalledTimes(1); // never restarted

		act(() => result.current.setCode("654321"));
		api.confirmContactChange.mockResolvedValueOnce({
			message: "Phone number updated",
			email: null,
			phoneNum: "+60123456789",
			tokensStored: true,
		});
		await act(async () => {
			await result.current.submitCode();
		});
		expect(api.confirmContactChange).toHaveBeenCalledWith({
			requestId: SECOND_ID,
			kind: "phone",
			value: "+60123456789",
			code: "654321",
		});
	});

	/*
	 * Only `start` counts the invitations; a resend always answers 0. Copying
	 * that 0 over would erase a warning the person still needs.
	 */
	it("a resend does not erase the pending-invites warning", async () => {
		const { result } = setup();
		await toCodeStep(result, 3);

		api.resendContactChangeNewCode.mockResolvedValueOnce(started(SECOND_ID, 0));
		await act(async () => {
			await result.current.resend();
		});
		expect(result.current.pendingInvitesToCurrentEmail).toBe(3);
	});

	it("a failed resend stays on the code step — it never restarts the change", async () => {
		const { result } = setup();
		await toCodeStep(result);

		api.resendContactChangeNewCode.mockRejectedValueOnce(
			new AuthFlowError("Could not send the code — try again later", 503),
		);
		await act(async () => {
			await result.current.resend();
		});
		expect(result.current.stage).toBe("code");
		expect(result.current.codeOpen).toBe(true);
		expect(api.startContactChange).toHaveBeenCalledTimes(1);
	});

	it("the new number taken meanwhile → back to the field, reason kept", async () => {
		const { result } = setup();
		await toCodeStep(result);

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

	it("saved WITHOUT tokens: returned as such, and nothing is refetched", async () => {
		const { result, invalidate } = setup();
		await toCodeStep(result);

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
		await toCodeStep(result);

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
});
