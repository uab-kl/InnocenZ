import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
	AxiosError,
	type AxiosResponse,
	type InternalAxiosRequestConfig,
} from "axios";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";

/**
 * "ADD PR" MUST NOT LOOK LIKE IT WORKED WHEN IT DID NOT.
 *
 * `invite` (POST /pr) was fire-and-forget: no onError, and the Approvals sheet
 * closed and cleared the form the moment it was called. A refusal — the phone
 * already on another account, an activated PR's sign-in contact — was
 * indistinguishable from a PR added. These pin the hook's half of the fix:
 * success and refusal are reported separately, and the refusal is the server's
 * reason in the reader's language (zh here, so a passthrough cannot pass).
 *
 * The transport is mocked at the SERVICE boundary with real AxiosErrors, so the
 * error reading under test is the one production runs.
 */

const createPrPersonnel = vi.fn();
vi.mock("@/services/pr-personnel", () => ({
	createPrPersonnel: (...args: unknown[]) => createPrPersonnel(...args),
}));
vi.mock("@/services/agency", () => ({
	fetchAgencyPrs: vi.fn().mockResolvedValue({ data: [] }),
	setAgencyPrApproval: vi.fn(),
}));
vi.mock("@agency-portal/lib/agency-identity", () => ({
	getAgencyIdentity: () => ({ agencyId: "agency-1" }),
}));
vi.mock("@/lib/auth-context", () => ({
	useAuth: () => ({ logout: vi.fn() }),
}));
vi.mock("@/lib/portal-i18n/context", async () => {
	const { translations: dictionary } = await import(
		"@/lib/portal-i18n/translations"
	);
	return {
		usePortalLocale: () => ({
			locale: "zh",
			t: dictionary.zh,
			setLocale: () => {},
		}),
	};
});

import { useAgencyPendingPrs } from "./use-agency-pending-prs";

const zh = translations.zh;

function refusal(status: number, message?: string): AxiosError {
	const config = { headers: {} } as InternalAxiosRequestConfig;
	const response: AxiosResponse = {
		data: message === undefined ? {} : { success: false, message, data: null },
		status,
		statusText: String(status),
		headers: {},
		config,
		request: {},
	};
	return new AxiosError(
		`Request failed with status code ${status}`,
		AxiosError.ERR_BAD_REQUEST,
		config,
		{},
		response,
	);
}

function setup() {
	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	return renderHook(() => useAgencyPendingPrs(), { wrapper });
}

const INVITE = {
	name: "  Victoria Tan Mei Lin ",
	ic: " 990101-14-5678 ",
	mobile: " 012-345 6789 ",
	email: "",
};

async function inviteOutcome(result: ReturnType<typeof setup>["result"]) {
	const onSuccess = vi.fn();
	const onError = vi.fn();
	act(() => {
		result.current.invite(INVITE, { onSuccess, onError });
	});
	await waitFor(() =>
		expect(onSuccess.mock.calls.length + onError.mock.calls.length).toBe(1),
	);
	return { onSuccess, onError };
}

describe("useAgencyPendingPrs · invite (POST /pr)", () => {
	beforeEach(() => {
		createPrPersonnel.mockReset();
	});
	afterEach(() => {
		vi.clearAllTimers();
	});

	it("a duplicate phone (409) is an ERROR with the translated reason — never a success", async () => {
		createPrPersonnel.mockRejectedValue(
			refusal(409, "That phone number is already used by another account"),
		);
		const { result } = setup();
		const { onSuccess, onError } = await inviteOutcome(result);

		expect(onSuccess).not.toHaveBeenCalled();
		expect(onError).toHaveBeenCalledWith(zh.authCodes.serverPhoneTaken);
	});

	it("an activated PR's sign-in contact (403) reads the translated refusal", async () => {
		createPrPersonnel.mockRejectedValue(
			refusal(403, "Only the PR can change their sign-in email or phone"),
		);
		const { result } = setup();
		const { onSuccess, onError } = await inviteOutcome(result);

		expect(onSuccess).not.toHaveBeenCalled();
		expect(onError).toHaveBeenCalledWith(
			zh.authCodes.serverOnlyPrChangesSignIn,
		);
	});

	it("the non-admin userId refusal (403) has its own translation", async () => {
		createPrPersonnel.mockRejectedValue(
			refusal(403, "Only an admin can add an existing account by its id"),
		);
		const { result } = setup();
		const { onError } = await inviteOutcome(result);

		expect(onError).toHaveBeenCalledWith(zh.managePr.onlyAdminAddsById);
	});

	it("no answer at all reads the fallback — never axios's English", async () => {
		createPrPersonnel.mockRejectedValue(
			new AxiosError("Network Error", AxiosError.ERR_NETWORK),
		);
		const { result } = setup();
		const { onError } = await inviteOutcome(result);

		expect(onError).toHaveBeenCalledWith(zh.agencyPending.couldNotInvitePr);
	});

	it("success reports success, and sends the fields trimmed", async () => {
		createPrPersonnel.mockResolvedValue({ id: "pr-1" });
		const { result } = setup();
		const { onSuccess, onError } = await inviteOutcome(result);

		expect(onError).not.toHaveBeenCalled();
		expect(onSuccess).toHaveBeenCalledWith(zh.agencyPending.prInvited);
		expect(createPrPersonnel.mock.calls[0][0]).toEqual({
			name: "Victoria Tan Mei Lin",
			icNo: "990101-14-5678",
			phone: "012-345 6789",
			email: undefined,
		});
	});
});
