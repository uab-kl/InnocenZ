/**
 * THE EMAIL-CODE STEP OF A PUBLIC SIGN-UP, as state — shared by the
 * organisation form (its login email) and the team-member form.
 *
 * Owner, 30 Sep 2026: no account is created until the person proves the email
 * they typed is theirs, with a 6-digit code sent to it. This hook owns that
 * code and nothing else; each page keeps its own fields and its own submit.
 *
 *  - ONE CODE, ONE ADDRESS. The code proves the address it went to, so typing
 *    a different one clears it — the page cannot submit a proof of the old
 *    address beside the new one. Compared trimmed and case-folded, which is
 *    how the server compares.
 *  - THE RESEND WINDOW BELONGS TO THE ADDRESS, like the server's: it survives a
 *    refused sign-up (the window is still running there) and does not follow
 *    the person to a different address.
 *  - A REFUSED SIGN-UP is read by `signupCodeOutcome`: a spent code puts the
 *    box back to "send code" with everything else still typed; a wrong code
 *    only clears the digits.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AuthFlowError } from "@/lib/auth/auth-flow-client";
import {
	requestSignupEmailCode,
	type SignupEmailProof,
} from "@/lib/auth/signup-email-code-api";
import {
	type SignupCodeOutcome,
	signupCodeOutcome,
} from "@/lib/landing-i18n/member-signup-refusal";

const CODE_LENGTH = 6;
const CODE_RE = /^\d{6}$/;
const RESEND_TICK_MS = 1000;

/**
 * Deliberately permissive — one `@`, a dot in the domain, no spaces. A typo
 * catch before a code is spent on it, not an address validator: only mail
 * arriving proves an address, and the server runs its own check behind this.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isPlausibleSignupEmail(email: string): boolean {
	return EMAIL_RE.test(email.trim());
}

function normalise(email: string): string {
	return email.trim().toLowerCase();
}

/** What the box says under itself, and why. */
export type SignupEmailCodeNotice =
	/** The server's own confirmation of a send. */
	| { kind: "sent"; message: string }
	/** The server's refusal of a send — "" when no sentence came back. */
	| { kind: "sendRefused"; message: string }
	/** A refused sign-up spent the code — a new one is needed. */
	| { kind: "resend" }
	/** A wrong code — the same code may be typed again. */
	| { kind: "retype" };

/** Everything tied to ONE address. Only the current address's is shown. */
interface CodeSession {
	email: string;
	/** Null in the "send code" state. */
	codeId: string | null;
	code: string;
	notice: SignupEmailCodeNotice | null;
}

export interface SignupEmailCode {
	/** The address the live code went to — null in the "send code" state. */
	sentTo: string | null;
	code: string;
	setCode: (raw: string) => void;
	sending: boolean;
	/** Seconds before THIS address may ask again; 0 = now. */
	resendIn: number;
	/** A plausible address, nothing in flight, no wait running for it. */
	canSend: boolean;
	notice: SignupEmailCodeNotice | null;
	/** Send (or resend) to the current address. Null = nothing was sent. */
	send: () => Promise<{ ok: boolean; message: string } | null>;
	/** Back to "send code" — the page moves the caret to its email field. */
	changeEmail: () => void;
	/** The two fields a sign-up sends, once a code is live and 6 digits typed. */
	proof: SignupEmailProof | null;
	/** Read a refused sign-up and put the code where that answer leaves it. */
	afterRefusal: (
		message: string | undefined,
		status: number | null | undefined,
	) => SignupCodeOutcome;
}

export function useSignupEmailCode(email: string): SignupEmailCode {
	const [session, setSession] = useState<CodeSession | null>(null);
	const [cooldown, setCooldown] = useState<{
		email: string;
		seconds: number;
	} | null>(null);
	const [sending, setSending] = useState(false);
	const inFlight = useRef(false);

	const current = normalise(email);
	/** The address being typed NOW — read after an await, never a stale one. */
	const currentRef = useRef(current);

	useEffect(() => {
		currentRef.current = current;
		// Typing a different address clears the code: it proved the OLD one.
		setSession((s) => (s && s.email !== current ? null : s));
	}, [current]);

	useEffect(() => {
		if (!cooldown || cooldown.seconds <= 0) return;
		const id = setTimeout(
			() => setCooldown((c) => (c ? { ...c, seconds: c.seconds - 1 } : c)),
			RESEND_TICK_MS,
		);
		return () => clearTimeout(id);
	}, [cooldown]);

	const here = session?.email === current ? session : null;
	const resendIn = cooldown?.email === current ? cooldown.seconds : 0;
	const canSend = !sending && resendIn === 0 && isPlausibleSignupEmail(email);

	const send = useCallback(async () => {
		const target = normalise(email);
		if (inFlight.current || !isPlausibleSignupEmail(email)) return null;
		if (cooldown?.email === target && cooldown.seconds > 0) return null;
		inFlight.current = true;
		setSending(true);
		try {
			const sent = await requestSignupEmailCode(email);
			setCooldown({ email: target, seconds: sent.resendAfterSec });
			// The address changed while the code was on its way: it proves the
			// old one, so it is not kept.
			if (currentRef.current === target) {
				setSession({
					email: target,
					codeId: sent.codeId,
					code: "",
					notice: { kind: "sent", message: sent.message },
				});
			}
			return { ok: true, message: sent.message };
		} catch (error) {
			const refusal = error instanceof AuthFlowError ? error : null;
			const message = refusal?.message ?? "";
			if (refusal?.retryAfterSec) {
				setCooldown({ email: target, seconds: refusal.retryAfterSec });
			}
			if (currentRef.current === target) {
				// A refused RESEND leaves the code already sent standing.
				setSession((s) => ({
					email: target,
					codeId: s?.email === target ? s.codeId : null,
					code: s?.email === target ? s.code : "",
					notice: { kind: "sendRefused", message },
				}));
			}
			return { ok: false, message };
		} finally {
			inFlight.current = false;
			setSending(false);
		}
	}, [email, cooldown]);

	const setCode = useCallback((raw: string) => {
		const digits = raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
		setSession((s) =>
			s
				? {
						...s,
						code: digits,
						// A problem with the previous try is stale once they type.
						notice: s.notice?.kind === "sent" ? s.notice : null,
					}
				: s,
		);
	}, []);

	const changeEmail = useCallback(() => setSession(null), []);

	const afterRefusal = useCallback(
		(message: string | undefined, status: number | null | undefined) => {
			const outcome = signupCodeOutcome(message, status);
			if (outcome === "resend") {
				setSession((s) =>
					s ? { ...s, codeId: null, code: "", notice: { kind: "resend" } } : s,
				);
			} else if (outcome === "retype") {
				setSession((s) =>
					s ? { ...s, code: "", notice: { kind: "retype" } } : s,
				);
			}
			return outcome;
		},
		[],
	);

	const codeId = here?.codeId ?? null;
	const code = here?.code ?? "";
	return {
		sentTo: codeId ? current : null,
		code,
		setCode,
		sending,
		resendIn,
		canSend,
		notice: here?.notice ?? null,
		send,
		changeEmail,
		proof:
			codeId && CODE_RE.test(code)
				? { emailCodeId: codeId, emailCode: code }
				: null,
		afterRefusal,
	};
}
