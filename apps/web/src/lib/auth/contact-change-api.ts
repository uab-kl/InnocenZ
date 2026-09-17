/**
 * CHANGING YOUR OWN SIGN-IN EMAIL OR PHONE — two codes, four calls.
 *
 * Owner, 17 Sep 2026: "send the otp via whatapps, email and the sms" for change
 * phone and change email, with the email change "verified by the phone on file
 * and the new email". Every role (outlet, agency, PR, admin), web and app.
 *
 * ⚠️ WHY TWO CODES. The old web phone change proved only that the person held
 * the NEW handset — so anyone who sat down at an unlocked session could move
 * the account's number to their own phone and then reset the password with it.
 * The email lane had no proof at all and was switched off. Now:
 *
 *   1. `start`           — code #1 to the CURRENT contacts (WhatsApp + SMS to
 *                          the phone on file, email to the email on file).
 *                          Proves the person still holds the account's own
 *                          channels.
 *   2. `verify-identity` — spends code #1, then sends code #2 to the NEW
 *                          contact (email → the new address; phone → WhatsApp
 *                          + SMS to the new number). Proves they hold that too.
 *   3. `resend-new`      — a fresh code #2, while #1 is still fresh (15 min).
 *   4. `confirm`         — spends code #2 and writes the change in one
 *                          transaction. Answers with a RE-ISSUED token pair.
 *
 * The server reads WHOSE account from the bearer token, never from the body, so
 * this can only ever change the signed-in person's own contact.
 *
 * ⚠️ `value` is normalised here on EVERY call, identically. The server binds the
 * value into each code's hash, so "0123456789" at step 1 and "+60123456789" at
 * step 2 would be two different requests and the second would answer
 * "Invalid code" for a code that was right.
 */
import { apiErrorCopy } from "@/lib/auth/api-error-copy";
import {
	type ApiEnvelope,
	AuthFlowError,
	type CodeDelivery,
	readDeliveries,
	storeReissuedTokens,
	toAuthFlowError,
} from "@/lib/auth/auth-flow-client";
import { kickToLogin } from "@/lib/auth/guards";
import { toWhatsAppNumber } from "@/lib/auth/phone-api";
import { getClient } from "@/lib/axios-v1";

export type ContactKind = "email" | "phone";

export interface ContactChangeStarted {
	requestId: string;
	sentTo: CodeDelivery[];
	expiresInSec: number;
	resendAfterSec: number;
	/** Open organisation invites addressed to the CURRENT email (email lane). */
	pendingInvitesToCurrentEmail: number;
}

export interface ContactChangeNewCodeSent {
	newRequestId: string;
	sentTo: CodeDelivery[];
	expiresInSec: number;
	resendAfterSec: number;
}

export interface ContactChangeConfirmed {
	/** The server's sentence — "Email updated" / "Phone number updated". */
	message: string;
	email: string | null;
	phoneNum: string | null;
}

/**
 * The one spelling of a contact every call sends.
 *
 * Email: trimmed and lower-cased, as the server stores it. Phone: the digits
 * WhatsApp can reach (`toWhatsAppNumber` — a leading 0 becomes 60, a typed
 * `+60 0…` loses the stray zero) with a `+`, which is how a phone is stored.
 * Idempotent, so a value that has already been through here is unchanged.
 */
export function normaliseContactValue(kind: ContactKind, raw: string): string {
	if (kind === "email") return (raw ?? "").trim().toLowerCase();
	const digits = toWhatsAppNumber(raw ?? "");
	return digits ? `+${digits}` : "";
}

function numberOr(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? value
		: fallback;
}

/** Step 1 — a code to the account's CURRENT phone and email. */
export async function startContactChange(input: {
	kind: ContactKind;
	value: string;
}): Promise<ContactChangeStarted> {
	const failed = apiErrorCopy().authCodes.codeSendFailed;
	const client = getClient(kickToLogin);
	try {
		const response = await client.post<
			ApiEnvelope<Partial<ContactChangeStarted> | null>
		>("/auth/contact-change/start", {
			kind: input.kind,
			value: normaliseContactValue(input.kind, input.value),
		});
		const data = response.data.data;
		if (!response.data.success || !data?.requestId) {
			throw new AuthFlowError(response.data.message || failed);
		}
		return {
			requestId: data.requestId,
			sentTo: readDeliveries(data.sentTo),
			expiresInSec: numberOr(data.expiresInSec, 300),
			resendAfterSec: numberOr(data.resendAfterSec, 60),
			pendingInvitesToCurrentEmail: numberOr(
				data.pendingInvitesToCurrentEmail,
				0,
			),
		};
	} catch (error) {
		throw toAuthFlowError(error, failed);
	}
}

function readNewCodeSent(
	response: ApiEnvelope<Partial<ContactChangeNewCodeSent> | null>,
	failed: string,
): ContactChangeNewCodeSent {
	const data = response.data;
	if (!response.success || !data?.newRequestId) {
		throw new AuthFlowError(response.message || failed);
	}
	return {
		newRequestId: data.newRequestId,
		sentTo: readDeliveries(data.sentTo),
		expiresInSec: numberOr(data.expiresInSec, 600),
		resendAfterSec: numberOr(data.resendAfterSec, 60),
	};
}

/** Step 2 — spend code #1; the server sends code #2 to the NEW contact. */
export async function verifyContactChangeIdentity(input: {
	requestId: string;
	kind: ContactKind;
	value: string;
	code: string;
}): Promise<ContactChangeNewCodeSent> {
	const failed = apiErrorCopy().authCodes.codeCheckFailed;
	const client = getClient(kickToLogin);
	try {
		const response = await client.post<
			ApiEnvelope<Partial<ContactChangeNewCodeSent> | null>
		>("/auth/contact-change/verify-identity", {
			requestId: input.requestId,
			kind: input.kind,
			value: normaliseContactValue(input.kind, input.value),
			code: input.code.trim(),
		});
		return readNewCodeSent(response.data, failed);
	} catch (error) {
		throw toAuthFlowError(error, failed);
	}
}

/** A fresh code #2 — only while code #1 was verified in the last 15 minutes. */
export async function resendContactChangeNewCode(input: {
	requestId: string;
	kind: ContactKind;
	value: string;
}): Promise<ContactChangeNewCodeSent> {
	const failed = apiErrorCopy().authCodes.codeSendFailed;
	const client = getClient(kickToLogin);
	try {
		const response = await client.post<
			ApiEnvelope<Partial<ContactChangeNewCodeSent> | null>
		>("/auth/contact-change/resend-new", {
			requestId: input.requestId,
			kind: input.kind,
			value: normaliseContactValue(input.kind, input.value),
		});
		return readNewCodeSent(response.data, failed);
	} catch (error) {
		throw toAuthFlowError(error, failed);
	}
}

/**
 * Step 3 — spend code #2 and write the change.
 *
 * ⚠️ The re-issued tokens are stored HERE, inside the call, before it resolves.
 * The write stamped `sessions_valid_from`, so the token this tab sent a moment
 * ago is already retired; any request that goes out before the new pair is
 * stored — the caller's profile refetch is the obvious one — answers 401 and
 * signs the person out.
 */
export async function confirmContactChange(input: {
	requestId: string;
	newRequestId: string;
	kind: ContactKind;
	value: string;
	code: string;
}): Promise<ContactChangeConfirmed> {
	const copy = apiErrorCopy().authCodes;
	const failed =
		input.kind === "email" ? copy.emailUpdateFailed : copy.phoneUpdateFailed;
	const client = getClient(kickToLogin);
	try {
		const response = await client.post<
			ApiEnvelope<{
				accessToken?: string;
				refreshToken?: string;
				email?: string | null;
				phoneNum?: string | null;
			} | null>
		>("/auth/contact-change/confirm", {
			requestId: input.requestId,
			newRequestId: input.newRequestId,
			kind: input.kind,
			value: normaliseContactValue(input.kind, input.value),
			code: input.code.trim(),
		});
		const data = response.data.data;
		if (!response.data.success) {
			throw new AuthFlowError(response.data.message || failed);
		}
		storeReissuedTokens(data);
		return {
			message:
				response.data.message ||
				(input.kind === "email"
					? copy.serverEmailUpdated
					: copy.serverPhoneUpdated),
			email: data?.email ?? null,
			phoneNum: data?.phoneNum ?? null,
		};
	} catch (error) {
		throw toAuthFlowError(error, failed);
	}
}
