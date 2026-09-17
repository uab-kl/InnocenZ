/**
 * SHARED PLUMBING FOR THE CODE FLOWS — forgot password, change password and
 * change phone / email (owner, 17 Sep 2026: "send the otp via whatapps, email
 * and the sms").
 *
 * Three things every one of those flows needs and must get identically:
 *
 *  1. WHERE THE CODE WENT. The server sends ONE code to several channels at
 *     once and answers with a `sentTo` receipt per channel, destinations
 *     already masked (`+60 ••••• 6789`, `o••••@atlas-agency.my`). The screens
 *     render that receipt rather than guessing, so "sent" on screen is what the
 *     server says happened.
 *
 *  2. A REFUSAL THAT DOES NOT SIGN YOU OUT. A wrong code is HTTP 400 by
 *     contract, never 401 — the authenticated client ejects the session on any
 *     401. `AuthFlowError` keeps the status and the server's own sentence so the
 *     sheet can stay open with the reason next to the field.
 *
 *  3. KEEPING THE RE-ISSUED TOKENS. Changing a password, an email or a phone
 *     stamps `sessions_valid_from`, which retires every token issued before
 *     that second — INCLUDING the one this tab is holding. The server answers
 *     with a fresh pair, and unless it is stored before the next request goes
 *     out, that request carries a retired token, collects a 401 and signs the
 *     person out of the account they just secured.
 *
 * ⚠️ Leaf-ish on purpose: no React, no dictionary. Callers localise.
 */
import axios from "axios";
import {
	saveAccessToken,
	saveRefreshToken,
	saveTokenExpiry,
} from "@/lib/auth/auth-storage";

export interface ApiEnvelope<T> {
	success: boolean;
	message: string;
	data: T;
}

export type CodeChannel = "whatsapp" | "sms" | "email";
export type CodeDeliveryStatus = "sent" | "logged" | "skipped" | "failed";

/** One line of the server's `sentTo` receipt. `to` is ALREADY masked. */
export interface CodeDelivery {
	channel: CodeChannel;
	to: string;
	status: CodeDeliveryStatus;
}

/**
 * A refusal from one of the code flows, with what the screen needs to react:
 * the server's sentence (shown through the localiser), the HTTP status, and —
 * on a cooldown — how long until Resend should be offered again.
 */
export class AuthFlowError extends Error {
	readonly status: number | null;
	readonly retryAfterSec: number | null;

	constructor(
		message: string,
		status: number | null = null,
		retryAfterSec: number | null = null,
	) {
		super(message);
		this.name = "AuthFlowError";
		this.status = status;
		this.retryAfterSec = retryAfterSec;
	}
}

const WAIT_SECONDS_RE = /(\d+)\s*s\b/;

function positiveSeconds(value: unknown): number | null {
	const n = typeof value === "string" ? Number(value) : value;
	return typeof n === "number" && Number.isFinite(n) && n > 0
		? Math.ceil(n)
		: null;
}

/**
 * Normalise anything a flow call can throw into an `AuthFlowError`.
 *
 * The server's `message` wins over `fallback` — it is the specific one
 * ("That phone number is already used by another account"), and a generic
 * sentence here would throw the useful half away.
 */
export function toAuthFlowError(
	error: unknown,
	fallback: string,
): AuthFlowError {
	if (error instanceof AuthFlowError) return error;
	if (axios.isAxiosError(error)) {
		const body = error.response?.data as
			| { message?: unknown; data?: { retryAfterSec?: unknown } | null }
			| undefined;
		const message =
			typeof body?.message === "string" && body.message.trim()
				? body.message
				: fallback;
		const status = error.response?.status ?? null;
		let retryAfterSec = positiveSeconds(body?.data?.retryAfterSec);
		if (retryAfterSec === null && status === 429) {
			// An older limiter answers without `data` — read the seconds out of
			// the header, then out of "Wait 42s before requesting another code".
			retryAfterSec =
				positiveSeconds(error.response?.headers?.["retry-after"]) ??
				positiveSeconds(WAIT_SECONDS_RE.exec(message)?.[1]);
		}
		return new AuthFlowError(message, status, retryAfterSec);
	}
	if (error instanceof Error && error.message) {
		return new AuthFlowError(error.message);
	}
	return new AuthFlowError(fallback);
}

/** `exp` of a JWT in milliseconds, or null. Display-free, never verified. */
function jwtExpiryMs(token: string): number | null {
	try {
		const segment = token.split(".")[1];
		if (!segment) return null;
		const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
		const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
		const payload = JSON.parse(atob(padded)) as { exp?: unknown };
		return typeof payload.exp === "number" && Number.isFinite(payload.exp)
			? payload.exp * 1000
			: null;
	} catch {
		return null;
	}
}

/**
 * Store a re-issued token pair IMMEDIATELY — before the caller does anything
 * that could send a request (a query invalidation, a navigation).
 *
 * The expiry is refreshed from the new token's own `exp` when it carries one,
 * so `hasValidTokens()` does not keep judging the session by the retired
 * token's clock. Returns whether anything was stored.
 */
export function storeReissuedTokens(
	issued:
		| { accessToken?: string | null; refreshToken?: string | null }
		| null
		| undefined,
): boolean {
	if (!issued?.accessToken) return false;
	saveAccessToken(issued.accessToken);
	if (issued.refreshToken) saveRefreshToken(issued.refreshToken);
	const expiry = jwtExpiryMs(issued.accessToken);
	if (expiry) saveTokenExpiry(expiry);
	return true;
}

/** `sentTo` as the server sent it, minus anything malformed. */
export function readDeliveries(value: unknown): CodeDelivery[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(row): row is CodeDelivery =>
			typeof row === "object" &&
			row !== null &&
			["whatsapp", "sms", "email"].includes(
				(row as { channel?: unknown }).channel as string,
			) &&
			typeof (row as { to?: unknown }).to === "string" &&
			["sent", "logged", "skipped", "failed"].includes(
				(row as { status?: unknown }).status as string,
			),
	);
}
