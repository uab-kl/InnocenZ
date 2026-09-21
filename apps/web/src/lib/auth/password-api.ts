/**
 * Password endpoints for the OUTLET, AGENCY and ADMIN web portals.
 *
 * Six lanes, two clients:
 *  - `startPasswordChange`     — signed in: the CURRENT PASSWORD, and one code
 *                                to the phone and the email already on file.
 *  - `resendPasswordChangeCode`— signed in: another code, no password.
 *  - `confirmPasswordChange`   — signed in: the code + the new password.
 *  - `startForgotPassword`     — signed OUT, by email OR phone number: one code
 *                                by WhatsApp, SMS and email.
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
 *
 * Owner, 21 Sep 2026, on every code lane including this one: "must be the same
 * otp" — ONE code, fanned out to WhatsApp, SMS and email, never one per
 * channel. Asked what the signed-in change should become, the owner chose
 * "Current password + a code", so the change is TWO STEPS now and the old
 * one-shot `POST /auth/password/change` is gone from the backend — deleted, not
 * left answering "please update the app". There is nothing here to translate
 * for an older build: a call to it collects the router's own 404.
 */
import axios from "axios";
import { apiErrorCopy } from "@/lib/auth/api-error-copy";
import {
	type ApiEnvelope,
	AuthFlowError,
	type CodeDelivery,
	readDeliveries,
	storeReissuedTokens,
	toAuthFlowError,
} from "@/lib/auth/auth-flow-client";
import {
	type ForgotIdentifier,
	forgotStartBody,
} from "@/lib/auth/forgot-identifier";
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
 * A code is on its way for the signed-in password change. `start` and `resend`
 * answer the same shape, read in one place so the two can never disagree about
 * which field carries the id.
 */
export interface PasswordChangeStarted {
	requestId: string;
	/** Per channel, destinations ALREADY masked by the server. */
	sentTo: CodeDelivery[];
	expiresInSec: number;
	resendAfterSec: number;
}

/**
 * ⚠️ `tokensStored: false` means the password DID change but the answer carried
 * no token pair — the server writes first and re-issues second, and a failed
 * re-issue must not turn a saved change into an error. The token this tab holds
 * is already retired, so the caller must say "saved — sign in again" and send
 * the person to sign-in, instead of carrying on into an unexplained 401.
 */
export interface PasswordChangeConfirmed {
	/** The server's sentence — "Password updated". */
	message: string;
	tokensStored: boolean;
}

function numberOr(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: fallback;
}

function readPasswordChangeStarted(
	response: ApiEnvelope<Partial<PasswordChangeStarted> | null>,
	failed: string,
): PasswordChangeStarted {
	const data = response.data;
	if (!response.success || !data?.requestId) {
		throw new AuthFlowError(response.message || failed);
	}
	return {
		requestId: data.requestId,
		sentTo: readDeliveries(data.sentTo),
		expiresInSec: numberOr(data.expiresInSec, 600),
		resendAfterSec: numberOr(data.resendAfterSec, 60),
	};
}

/**
 * Step 1 — prove it is you with the CURRENT PASSWORD; ONE code then goes to the
 * phone on file (WhatsApp + SMS) AND the email on file.
 *
 * ⚠️ A wrong password is HTTP 400 ("Current password is incorrect"), never 401:
 * this client signs a person out on any 401, so one typo would throw them to
 * the login page in the middle of securing their account. The login lockout is
 * honoured here too and answers 429 ("Too many failed attempts. Try again in N
 * minute(s)."), which carries `retryAfterSec` for the countdown.
 *
 * ⚠️ 422 — "Your account has no phone or email we can send a code to" — is the
 * one refusal no retry can fix: there is nowhere to send a code, so the sheet
 * has to say so rather than offer Resend.
 *
 * ⚠️ THE NEW PASSWORD IS NOT SENT HERE. It is typed on this step and held by
 * the caller until `confirm`, so a code sheet that is abandoned leaves nothing
 * half-written on the server.
 */
export async function startPasswordChange(input: {
	currentPassword: string;
}): Promise<PasswordChangeStarted> {
	const failed = apiErrorCopy().authCodes.codeSendFailed;
	const client = getClient(kickToLogin);
	try {
		const response = await client.post<
			ApiEnvelope<Partial<PasswordChangeStarted> | null>
		>("/auth/password/change/start", {
			currentPassword: input.currentPassword,
		});
		return readPasswordChangeStarted(response.data, failed);
	} catch (error) {
		throw toAuthFlowError(error, failed);
	}
}

/**
 * Another code for a change already started — and deliberately NO password: the
 * `requestId` is itself the proof, exactly as `contact-change/resend` works.
 * Asking again would mean this client holding the current password in memory
 * behind the code sheet for the whole flow.
 *
 * ⚠️ The answer carries a NEW `requestId`, because the server issues a fresh
 * row and expires the old one. Keeping the previous id would confirm against a
 * row that no longer exists ("This code has expired — request a new one") with
 * a code the person just read off their phone.
 */
export async function resendPasswordChangeCode(input: {
	requestId: string;
}): Promise<PasswordChangeStarted> {
	const failed = apiErrorCopy().authCodes.codeSendFailed;
	const client = getClient(kickToLogin);
	try {
		const response = await client.post<
			ApiEnvelope<Partial<PasswordChangeStarted> | null>
		>("/auth/password/change/resend", { requestId: input.requestId });
		return readPasswordChangeStarted(response.data, failed);
	} catch (error) {
		throw toAuthFlowError(error, failed);
	}
}

/**
 * Step 2 — spend the code and write the new password.
 *
 * ⚠️ STORES THE RE-ISSUED TOKENS before resolving. The write stamps
 * `sessions_valid_from`, which retires every earlier token — this tab's
 * included. Without the new pair the very next request is a 401 and the person
 * is signed out of the account whose password they just changed.
 *
 * ⚠️ "New password must be different" arrives from HERE now, not from the
 * schema: confirm carries no `currentPassword`, so the server compares the new
 * password against the stored hash instead of two plaintexts. The sheet still
 * checks it on step 1 — where both are in hand — so the common case is caught
 * before a code is ever sent.
 */
export async function confirmPasswordChange(input: {
	requestId: string;
	code: string;
	newPassword: string;
}): Promise<PasswordChangeConfirmed> {
	const copy = apiErrorCopy();
	// Same sentence the sheet already shows when nothing at all comes back, so a
	// server that answers `success: false` with no message reads identically to
	// one that answers nothing.
	const failed = copy.profile.passwordUpdateFailed;
	const client = getClient(kickToLogin);
	try {
		const response = await client.post<
			ApiEnvelope<{ accessToken?: string; refreshToken?: string } | null>
		>("/auth/password/change/confirm", {
			requestId: input.requestId,
			code: input.code.trim(),
			newPassword: input.newPassword,
		});
		if (!response.data.success) {
			throw new AuthFlowError(response.data.message || failed);
		}
		return {
			tokensStored: storeReissuedTokens(response.data.data),
			message: response.data.message || copy.authCodes.serverPasswordUpdated,
		};
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
 * Ask for a reset CODE, by the email OR the phone number the person remembers.
 * Always answers the same way for a well-formed identifier — the server is
 * neutral on purpose, so this can never be used to discover which emails or
 * numbers have accounts. A cooldown (429) still throws, with `retryAfterSec`.
 *
 * Read what was typed with `readForgotIdentifier` first: it decides email vs
 * phone and normalises the phone the way every other web lane does.
 */
export async function startForgotPassword(
	identifier: ForgotIdentifier,
): Promise<ForgotPasswordStarted> {
	const failed = apiErrorCopy().authCodes.codeSendFailed;
	const client = getPublicClient();
	try {
		const response = await client.post<
			ApiEnvelope<Partial<ForgotPasswordStarted> | null>
		>("/auth/password/forgot/start", forgotStartBody(identifier));
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
