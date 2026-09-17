/**
 * Password endpoints for the OUTLET, AGENCY and ADMIN web portals.
 *
 * Four lanes, two clients:
 *  - `changeMyPassword`        — signed in, needs the bearer token.
 *  - `startForgotPassword`     — signed OUT: one code by WhatsApp, SMS and email.
 *  - `completeForgotPassword`  — signed OUT: the code + the new password.
 *  - `resetPasswordWithToken`  — signed OUT, the OLD emailed-link flow. Kept so
 *    links already sitting in inboxes still work (`/reset-password`).
 *
 * The signed-out lanes use `getPublicClient()` deliberately. The authenticated
 * client's response interceptor signs the user out on any 401, which is wrong
 * for a login-page flow where nobody is signed in to begin with.
 *
 * Owner, 17 Sep 2026: "send the otp via whatapps, email and the sms" for forgot
 * password — the reset link by email alone left anyone whose inbox was the
 * problem with no way back in.
 */
import axios from "axios";
import { apiErrorCopy } from "@/lib/auth/api-error-copy";
import {
	type ApiEnvelope,
	AuthFlowError,
	storeReissuedTokens,
	toAuthFlowError,
} from "@/lib/auth/auth-flow-client";
import { kickToLogin } from "@/lib/auth/guards";
import { getClient, getPublicClient } from "@/lib/axios-v1";

/** Mirrors the backend password schema: min 6, max 72 (bcrypt's input cap). */
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 72;

/** Server message when there is one — these are written to be shown as-is. */
function serverMessage(error: unknown, fallback: string): Error {
	if (axios.isAxiosError(error)) {
		const message = (error.response?.data as { message?: string } | undefined)
			?.message;
		if (message) return new Error(message);
	}
	if (error instanceof Error && error.message) return error;
	return new Error(fallback);
}

/**
 * Signed-in change password. The backend proves identity with
 * `currentPassword` and answers 400 (not 401) when it is wrong, so a typo
 * surfaces as an error in the sheet instead of ejecting the session.
 *
 * ⚠️ STORES THE RE-ISSUED TOKENS before resolving. A password change stamps
 * `sessions_valid_from`, which retires every earlier token — this tab's
 * included. Without the new pair the very next request is a 401 and the person
 * is signed out of the account whose password they just changed.
 */
export async function changeMyPassword(input: {
	currentPassword: string;
	newPassword: string;
}): Promise<void> {
	// Same sentence the sheet already shows when nothing at all comes back, so a
	// server that answers `success: false` with no message reads identically to
	// one that answers nothing.
	const failed = apiErrorCopy().profile.passwordUpdateFailed;
	const client = getClient(kickToLogin);
	try {
		const response = await client.post<
			ApiEnvelope<{ accessToken?: string; refreshToken?: string } | null>
		>("/auth/password/change", {
			currentPassword: input.currentPassword,
			newPassword: input.newPassword,
		});
		if (!response.data.success) {
			throw new AuthFlowError(response.data.message || failed);
		}
		storeReissuedTokens(response.data.data);
	} catch (error) {
		throw toAuthFlowError(error, failed);
	}
}

export interface ForgotPasswordStarted {
	/**
	 * The request to complete. For an address with no account the server hands
	 * back a random id that no code will ever match — the page cannot tell the
	 * two apart, and must not try to.
	 */
	requestId: string;
	expiresInSec: number;
	resendAfterSec: number;
}

/**
 * Ask for a reset CODE. Always answers the same way for a well-formed email —
 * the server is neutral on purpose, so this can never be used to discover which
 * emails have accounts. A cooldown (429) still throws, with `retryAfterSec`.
 */
export async function startForgotPassword(
	email: string,
): Promise<ForgotPasswordStarted> {
	const failed = apiErrorCopy().authCodes.codeSendFailed;
	const client = getPublicClient();
	try {
		const response = await client.post<
			ApiEnvelope<Partial<ForgotPasswordStarted> | null>
		>("/auth/password/forgot/start", { email: email.trim().toLowerCase() });
		const data = response.data.data;
		if (!response.data.success || !data?.requestId) {
			throw new AuthFlowError(response.data.message || failed);
		}
		return {
			requestId: data.requestId,
			expiresInSec:
				typeof data.expiresInSec === "number" ? data.expiresInSec : 600,
			resendAfterSec:
				typeof data.resendAfterSec === "number" ? data.resendAfterSec : 60,
		};
	} catch (error) {
		throw toAuthFlowError(error, failed);
	}
}

/**
 * Finish the reset with the code. Resolves with the server's sentence
 * ("Password updated — sign in with your new password"). Issues no tokens —
 * the person signs in fresh, and every older session was cut by the reset.
 */
export async function completeForgotPassword(input: {
	requestId: string;
	code: string;
	password: string;
}): Promise<string> {
	const copy = apiErrorCopy();
	const failed = copy.webLib.passwordResetFailed;
	const client = getPublicClient();
	try {
		const response = await client.post<ApiEnvelope<null>>(
			"/auth/password/forgot/complete",
			{
				requestId: input.requestId,
				code: input.code.trim(),
				password: input.password,
			},
		);
		if (!response.data.success) {
			throw new AuthFlowError(response.data.message || failed);
		}
		return response.data.message || copy.authCodes.serverPasswordResetDone;
	} catch (error) {
		throw toAuthFlowError(error, failed);
	}
}

/** Finish the OLD reset with the token from an emailed link. */
export async function resetPasswordWithToken(input: {
	token: string;
	password: string;
}): Promise<void> {
	const failed = apiErrorCopy().webLib.passwordResetFailed;
	const client = getPublicClient();
	try {
		const response = await client.post<ApiEnvelope<null>>(
			"/auth/reset-password",
			{ token: input.token, password: input.password },
		);
		if (!response.data.success) {
			throw new Error(response.data.message || failed);
		}
	} catch (error) {
		throw serverMessage(error, failed);
	}
}
