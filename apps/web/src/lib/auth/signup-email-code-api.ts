/**
 * `POST /auth/signup-email-code` — the code that proves an email is the
 * person's own BEFORE a public sign-up creates anything (owner, 30 Sep 2026:
 * public sign-up must not say whether an email, phone or ID number has an
 * account, except to someone who has proved they own it).
 *
 * The server answers every well-formed address identically — same status,
 * same sentence, whether or not it has an account — so this call cannot be
 * used to discover one. The sign-up then carries `emailCodeId` + `emailCode`
 * beside `email`, and an accepted code is USED UP by whatever that answer is
 * (201 or either 409): a retry always needs a new one.
 *
 * Leaf on purpose — no React, no dictionary. The server's sentence travels as
 * it was written and the page localises it (`localiseSignupEmailCodeAnswer`).
 * A signed-in admin creating an account is exempt and never calls this.
 */
import {
	type ApiEnvelope,
	AuthFlowError,
	toAuthFlowError,
} from "@/lib/auth/auth-flow-client";
import { getPublicClient } from "@/lib/axios-v1";

export interface SignupEmailCodeSent {
	codeId: string;
	expiresInSec: number;
	resendAfterSec: number;
	/** The server's own confirmation — shown, translated, to the person. */
	message: string;
}

/** What BOTH sign-ups send beside `email` once the code is typed. */
export interface SignupEmailProof {
	emailCodeId: string;
	emailCode: string;
}

/** The contract's values, used only if a field is missing from the body. */
const DEFAULT_EXPIRES_IN_SEC = 600;
const DEFAULT_RESEND_AFTER_SEC = 60;

function positiveSeconds(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? Math.ceil(value)
		: fallback;
}

/**
 * Ask for a code to `email`. Resolves with the code's id and the server's
 * sentence; any refusal throws an `AuthFlowError` carrying the server's own
 * sentence ("" when there was none — the request never arrived), its status
 * and, on a 429, the seconds to wait.
 */
export async function requestSignupEmailCode(
	email: string,
): Promise<SignupEmailCodeSent> {
	const client = getPublicClient();
	try {
		const response = await client.post<
			ApiEnvelope<Partial<Omit<SignupEmailCodeSent, "message">> | null>
		>("/auth/signup-email-code", { email: email.trim() });
		const body = response.data;
		const data = body?.data;
		if (!body?.success || typeof data?.codeId !== "string" || !data.codeId) {
			throw new AuthFlowError(body?.message ?? "", response.status);
		}
		return {
			codeId: data.codeId,
			expiresInSec: positiveSeconds(data.expiresInSec, DEFAULT_EXPIRES_IN_SEC),
			resendAfterSec: positiveSeconds(
				data.resendAfterSec,
				DEFAULT_RESEND_AFTER_SEC,
			),
			message: body.message ?? "",
		};
	} catch (error) {
		throw toAuthFlowError(error, "");
	}
}
