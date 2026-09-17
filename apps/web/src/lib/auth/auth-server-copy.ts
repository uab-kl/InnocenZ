/**
 * SERVER SENTENCES → THE READER'S LANGUAGE, for the code flows.
 *
 * The backend answers forgot password, change password and change phone/email
 * in English sentences written to be shown ("That phone number is already used
 * by another account"). Shown as-is, a 中文 session reads English at exactly
 * the moment something went wrong. So every sentence the contract names is
 * mapped to a dictionary key here; anything else — a limiter's wording, a
 * sentence added later — is shown as the server wrote it rather than guessed
 * at, because re-wording a message this file did not anticipate would be
 * guessing at its meaning.
 *
 * ⚠️ The map is keyed on the server's ENGLISH wording, and each `authCodes.server*`
 * English value must stay word-for-word that sentence — `auth-server-copy.test.ts`
 * fails when they drift, and when a Chinese value is missing.
 *
 * Imports stay on LEAF modules (`fill`, the dictionary TYPE, the flow client).
 * `portal-i18n/context` must never be imported here — it imports `lib/auth`
 * back, and that cycle once took the whole agency portal down.
 */
import type { CodeChannel, CodeDelivery } from "@/lib/auth/auth-flow-client";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

type Label = (t: PortalTranslations) => string;

/** Exact server sentences (compared without a trailing full stop). */
export const AUTH_SERVER_SENTENCES: Record<string, Label> = {
	"Could not send the code — try again later": (t) =>
		t.authCodes.serverCouldNotSend,
	"Invalid code": (t) => t.authCodes.serverInvalidCode,
	"If that account exists, we sent a code by WhatsApp, SMS and email": (t) =>
		t.authCodes.serverForgotNeutral,
	"This code has expired — request a new one": (t) =>
		t.authCodes.serverCodeExpired,
	"Password updated — sign in with your new password": (t) =>
		t.authCodes.serverPasswordResetDone,
	"Use Forgot password on the sign-in page": (t) =>
		t.authCodes.serverUseForgotPassword,
	"That is already your email": (t) => t.authCodes.serverAlreadyYourEmail,
	"That is already your phone number": (t) =>
		t.authCodes.serverAlreadyYourPhone,
	"That email is already used by another account": (t) =>
		t.authCodes.serverEmailTaken,
	"That phone number is already used by another account": (t) =>
		t.authCodes.serverPhoneTaken,
	"Your account has no phone or email we can send a code to": (t) =>
		t.authCodes.serverNoContactChannel,
	"Code sent": (t) => t.authCodes.serverCodeSent,
	"This change has expired — start again": (t) =>
		t.authCodes.serverChangeExpired,
	"This code was already used": (t) => t.authCodes.serverCodeAlreadyUsed,
	"Email updated": (t) => t.authCodes.serverEmailUpdated,
	"Phone number updated": (t) => t.authCodes.serverPhoneUpdated,
	"Changing your phone now needs a code to your current contacts — please update the app":
		(t) => t.authCodes.serverPhoneChangeNeedsUpdate,
	"New password must be different": (t) =>
		t.authCodes.serverNewPasswordMustDiffer,
	"Current password is incorrect": (t) =>
		t.authCodes.serverCurrentPasswordWrong,
	"Password updated": (t) => t.authCodes.serverPasswordUpdated,
	"Change your email from Security settings": (t) =>
		t.authCodes.serverChangeEmailInSecurity,
	"Change your phone from Security settings": (t) =>
		t.authCodes.serverChangePhoneInSecurity,
	"Only the PR can change their sign-in email or phone": (t) =>
		t.authCodes.serverOnlyPrChangesSignIn,

	/*
	 * NOT in the contract, but sent on these same routes by the backend as
	 * built (read 17 Sep 2026): the attempt cap in account-code/shared.ts, and
	 * the limiters mounted on forgot/start, forgot/complete, contact-change/*
	 * and password/change. Keys are compared without the trailing full stop.
	 */
	"Too many attempts — request a new code": (t) =>
		t.authCodes.serverTooManyAttempts,
	"Too many password reset requests. Please try again later": (t) =>
		t.authCodes.limiterResetRequests,
	"Too many attempts. Please wait a few minutes and try again": (t) =>
		t.authCodes.limiterAttemptsWait,
	"Too many verification codes requested. Please try again later": (t) =>
		t.authCodes.limiterCodesRequested,
	"Too many attempts. Please try again later": (t) =>
		t.authCodes.limiterAttempts,
	"Too many password change attempts. Please try again later": (t) =>
		t.authCodes.limiterPasswordChange,

	/*
	 * Also sent on these routes and missing until 17 Sep 2026 — each one showed
	 * English on a 中文 session: the 500s in contact-change.controller.ts, the
	 * password-less account in password-change.controller.ts, the catch-all
	 * `ApiError.INTERNAL_SERVER_ERROR` every one of these handlers ends with,
	 * and the zod messages in account-code/schemas.ts (the first issue's
	 * message is what a 400 carries). The two password-length messages carry a
	 * number and live in LENGTH_PATTERNS below.
	 */
	"Could not start the change": (t) => t.authCodes.serverCouldNotStartChange,
	"Could not send the code": (t) => t.authCodes.serverCouldNotSendCode,
	"This account cannot change password here": (t) =>
		t.authCodes.serverCannotChangePasswordHere,
	"Internal Server Error": (t) => t.authCodes.serverInternalError,
	"Validation failed": (t) => t.authCodes.serverValidationFailed,
	"Enter your email or your phone number": (t) =>
		t.authCodes.serverEnterEmailOrPhone,
	"Enter a valid email address": (t) => t.authCodes.serverEnterValidEmail,
	"Enter a valid phone number": (t) => t.authCodes.serverEnterValidPhone,
	"Enter the 6-digit code": (t) => t.authCodes.serverEnterSixDigitCode,
	"Enter the new email or phone number": (t) =>
		t.authCodes.serverEnterNewContact,
	"Current password is required": (t) =>
		t.authCodes.serverCurrentPasswordRequired,
};

/** "Wait 42s before requesting another code" — the one sentence with a number. */
const WAIT_RE = /^Wait (\d+)\s?s before requesting another code$/;

/**
 * The schema's password bounds, which carry the number the server enforces
 * (`PASSWORD_MIN` / `PASSWORD_MAX` in account-code/schemas.ts). Read out of the
 * sentence rather than assumed, so a changed bound still reads correctly.
 */
const LENGTH_PATTERNS: ReadonlyArray<{
	re: RegExp;
	label: (t: PortalTranslations, n: string) => string;
}> = [
	{
		re: /^Password must be at least (\d+) characters long$/,
		label: (t, n) => fill(t.authCodes.serverPasswordMinLength, { min: n }),
	},
	{
		re: /^Password must be at most (\d+) characters long$/,
		label: (t, n) => fill(t.authCodes.serverPasswordMaxLength, { max: n }),
	},
];

/**
 * THE REFUSALS OF `POST /auth/password/forgot/complete` THAT MUST READ ALIKE.
 *
 * The start step answers identically for an address with no account (a random
 * `requestId`) and a real one. The complete step did not: an unknown address's
 * id answers "This code has expired", a real account's wrong code answers
 * "Invalid code", and five wrong codes answer "Too many attempts". Shown as
 * three different sentences, the page itself told a stranger which addresses
 * have accounts. So the forgot page shows ONE sentence for all three.
 *
 * ⚠️ This closes the page, not the endpoint — the three answers still differ
 * over HTTP until the backend answers them with one refusal. The page says the
 * same thing either way, so it is already right when that lands.
 */
const FORGOT_CODE_REFUSALS: ReadonlySet<string> = new Set([
	"Invalid code",
	"This code has expired — request a new one",
	"Too many attempts — request a new code",
]);

export function isForgotCodeRefusal(message: string): boolean {
	return Boolean(message) && FORGOT_CODE_REFUSALS.has(canonical(message));
}

/**
 * Canonical form for lookup: trimmed, one trailing full stop dropped, and a
 * spaced hyphen or en dash read as the em dash the contract uses — so a
 * server that types " - " still lands on its translation.
 */
function canonical(message: string): string {
	return message
		.trim()
		.replace(/\s+[-–]{1,2}\s+/g, " — ")
		.replace(/\.$/, "");
}

/** The reader's version of a server sentence; unknown sentences unchanged. */
export function localiseAuthMessage(
	message: string,
	t: PortalTranslations,
): string {
	if (!message) return message;
	const key = canonical(message);
	const label = AUTH_SERVER_SENTENCES[key];
	if (label) return label(t);
	const wait = WAIT_RE.exec(key);
	if (wait) return fill(t.authCodes.serverWaitSeconds, { n: wait[1] });
	for (const pattern of LENGTH_PATTERNS) {
		const match = pattern.re.exec(key);
		if (match) return pattern.label(t, match[1]);
	}
	return message;
}

/** `localiseAuthMessage` for a caught value, with a fallback for no message. */
export function localiseAuthError(
	error: unknown,
	t: PortalTranslations,
	fallback: string,
): string {
	const message =
		error instanceof Error && error.message ? error.message : fallback;
	return localiseAuthMessage(message, t);
}

function channelName(channel: CodeChannel, t: PortalTranslations): string {
	switch (channel) {
		case "whatsapp":
			return t.authCodes.channelWhatsapp;
		case "sms":
			return t.authCodes.channelSms;
		default:
			return t.authCodes.channelEmail;
	}
}

function joinChannels(channels: CodeChannel[], t: PortalTranslations): string {
	return channels.map((c) => channelName(c, t)).join(t.authCodes.channelJoin);
}

const CHANNEL_ORDER: CodeChannel[] = ["whatsapp", "sms", "email"];

export interface DeliveryCopy {
	/** "Code sent by WhatsApp and SMS to +60 ••••• 6789 and by email to o••••@…" */
	sent: string | null;
	/** "Could not send by SMS." — channels that were attempted and failed. */
	failed: string | null;
	/** Dev-mode note when a channel only logged the code. */
	logged: string | null;
	/** Nothing was sent or logged at all. */
	none: string | null;
}

/**
 * WHERE THE CODE WENT, in one sentence, from the server's own receipt.
 *
 * Channels that reached the SAME masked destination are grouped — WhatsApp and
 * SMS both go to the phone — so the sentence names each address once. `sent`
 * and `logged` count as delivered for the sentence (a dev-mode log still means
 * the code exists) and `logged` adds its own note so nobody waits on a handset
 * for a message that was only printed. `skipped` is left out: a channel with
 * no provider was never attempted, and naming it would be a claim.
 */
export function describeCodeDelivery(
	sentTo: CodeDelivery[],
	t: PortalTranslations,
): DeliveryCopy {
	const delivered = sentTo.filter(
		(d) => d.status === "sent" || d.status === "logged",
	);
	const byTarget = new Map<string, CodeChannel[]>();
	for (const channel of CHANNEL_ORDER) {
		for (const row of delivered) {
			if (row.channel !== channel) continue;
			const list = byTarget.get(row.to) ?? [];
			if (!list.includes(channel)) list.push(channel);
			byTarget.set(row.to, list);
		}
	}
	const segments = [...byTarget.entries()].map(([target, channels]) =>
		fill(t.authCodes.deliverySegment, {
			channels: joinChannels(channels, t),
			target,
		}),
	);
	const failedChannels = CHANNEL_ORDER.filter((channel) =>
		sentTo.some((d) => d.channel === channel && d.status === "failed"),
	);
	return {
		sent: segments.length
			? fill(t.authCodes.deliveryLead, {
					segments: segments.join(t.authCodes.deliverySegmentJoin),
				})
			: null,
		failed: failedChannels.length
			? fill(t.authCodes.deliveryFailed, {
					channels: joinChannels(failedChannels, t),
				})
			: null,
		logged: sentTo.some((d) => d.status === "logged")
			? t.authCodes.deliveryLogged
			: null,
		none: segments.length ? null : t.authCodes.deliveryNone,
	};
}
