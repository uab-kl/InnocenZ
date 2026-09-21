/**
 * CHANGING YOUR OWN SIGN-IN EMAIL OR PHONE — one code, three calls.
 *
 * Owner, 21 Sep 2026: "only send to new contact (Change new phone / email,
 * step 2 (new contact)) … this no need send whatapps otp, sms otp and the
 * email otp to the old email or phone". Every role (outlet, agency, PR,
 * admin), web and app.
 *
 * ⚠️ NOTHING EVER REACHES THE OLD PHONE OR OLD EMAIL — not a code, and not a
 * notice afterwards either. The build that ran until 21 Sep 2026 sent code #1
 * to the contacts already on file; that step is retired and its two routes
 * (`verify-identity`, `resend-new`) were DELETED outright — owner, 21 Sep 2026:
 * "no error page no show this 'retired, answers 400 please update the app'".
 * They answer the router's own 404 now, not a sentence, so there is nothing
 * here to translate for a client still calling them.
 *
 * THE TWO PROOFS ARE NOW:
 *
 *   1. `start`   { kind, value, currentPassword } — the CURRENT PASSWORD says
 *                the person at this session is the account's owner and not
 *                somebody who sat down at an unlocked screen. The server then
 *                sends ONE code to the NEW contact (new email → that address;
 *                new phone → WhatsApp + SMS to that number), which says they
 *                typed it correctly and can receive on it — without that, a
 *                typo locks them out of their own account.
 *      `resend`  { kind, value, requestId } — another code to the same new
 *                contact, and deliberately NO password: the `requestId` is
 *                itself the proof, and asking again would mean this client
 *                holding the password in memory behind the code sheet for the
 *                whole flow. ⚠️ It answers a NEW `requestId` — the caller must
 *                replace the one it holds, or confirm spends a dead row.
 *   2. `confirm` { kind, value, requestId, code } — spends the code and writes
 *                the change in one transaction. Answers a RE-ISSUED token pair.
 *
 * The server reads WHOSE account from the bearer token, never from the body, so
 * this can only ever change the signed-in person's own contact.
 *
 * ⚠️ `value` is normalised here on EVERY call, identically. The server binds the
 * value into the code's hash, so "0123456789" at start and "+60123456789" at
 * confirm would be two different requests and the second would answer "Invalid
 * code" for a code that was right.
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
	/**
	 * Open organisation invites addressed to the CURRENT email (email lane).
	 * ⚠️ `resend` always answers 0 — only `start` counts them — so a caller
	 * holding a count from `start` must not overwrite it with a resend's.
	 */
	pendingInvitesToCurrentEmail: number;
}

export interface ContactChangeConfirmed {
	/** The server's sentence — "Email updated" / "Phone number updated". */
	message: string;
	email: string | null;
	phoneNum: string | null;
	/**
	 * False when the change was WRITTEN but the answer carried no token pair.
	 * The token this tab holds was retired by the change itself, so the caller
	 * must send the person to sign in again rather than refetch anything.
	 */
	tokensStored: boolean;
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

/**
 * `start` and `resend` answer the same shape — a code is on its way to the new
 * contact and here is the row it belongs to. Read once, so the two can never
 * disagree about which field carries the id.
 */
function readStarted(
	response: ApiEnvelope<Partial<ContactChangeStarted> | null>,
	failed: string,
): ContactChangeStarted {
	const data = response.data;
	if (!response.success || !data?.requestId) {
		throw new AuthFlowError(response.message || failed);
	}
	return {
		requestId: data.requestId,
		sentTo: readDeliveries(data.sentTo),
		expiresInSec: numberOr(data.expiresInSec, 600),
		resendAfterSec: numberOr(data.resendAfterSec, 60),
		pendingInvitesToCurrentEmail: numberOr(
			data.pendingInvitesToCurrentEmail,
			0,
		),
	};
}

/**
 * Step 1 — prove it is you with the CURRENT PASSWORD; a code goes to the NEW
 * contact and nowhere else.
 *
 * ⚠️ A wrong password is HTTP 400 ("Current password is incorrect"), never 401:
 * this client signs a person out on any 401, so one typo used to throw them to
 * the login page.
 */
export async function startContactChange(input: {
	kind: ContactKind;
	value: string;
	currentPassword: string;
}): Promise<ContactChangeStarted> {
	const failed = apiErrorCopy().authCodes.codeSendFailed;
	const client = getClient(kickToLogin);
	try {
		const response = await client.post<
			ApiEnvelope<Partial<ContactChangeStarted> | null>
		>("/auth/contact-change/start", {
			kind: input.kind,
			value: normaliseContactValue(input.kind, input.value),
			currentPassword: input.currentPassword,
		});
		return readStarted(response.data, failed);
	} catch (error) {
		throw toAuthFlowError(error, failed);
	}
}

/**
 * Another code to the SAME new contact — no password.
 *
 * ⚠️ The answer carries a NEW `requestId`, because the server issues a fresh
 * row and expires the old one. Keeping the previous id would confirm against a
 * row that no longer exists ("This code has expired — request a new one") with
 * a code the person just read off their phone.
 */
export async function resendContactChangeNewCode(input: {
	requestId: string;
	kind: ContactKind;
	value: string;
}): Promise<ContactChangeStarted> {
	const failed = apiErrorCopy().authCodes.codeSendFailed;
	const client = getClient(kickToLogin);
	try {
		const response = await client.post<
			ApiEnvelope<Partial<ContactChangeStarted> | null>
		>("/auth/contact-change/resend", {
			requestId: input.requestId,
			kind: input.kind,
			value: normaliseContactValue(input.kind, input.value),
		});
		return readStarted(response.data, failed);
	} catch (error) {
		throw toAuthFlowError(error, failed);
	}
}

/**
 * Step 2 — spend the code and write the change.
 *
 * ⚠️ The re-issued tokens are stored HERE, inside the call, before it resolves.
 * The write stamped `sessions_valid_from`, so the token this tab sent a moment
 * ago is already retired; any request that goes out before the new pair is
 * stored — the caller's profile refetch is the obvious one — answers 401 and
 * signs the person out.
 */
export async function confirmContactChange(input: {
	requestId: string;
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
			kind: input.kind,
			value: normaliseContactValue(input.kind, input.value),
			code: input.code.trim(),
		});
		const data = response.data.data;
		if (!response.data.success) {
			throw new AuthFlowError(response.data.message || failed);
		}
		const tokensStored = storeReissuedTokens(data);
		return {
			tokensStored,
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
