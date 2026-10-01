import { Loader2, MailCheck } from "lucide-react";
import type {
	SignupEmailCode,
	SignupEmailCodeNotice,
} from "@/lib/auth/use-signup-email-code";
import { localiseSignupEmailCodeAnswer } from "@/lib/landing-i18n/member-signup-refusal";
import type { SignupTranslations } from "@/lib/landing-i18n/signup-translations";
import { cn } from "@/lib/utils";

/**
 * THE "VERIFY YOUR EMAIL" STEP of both public sign-ups (owner, 30 Sep 2026).
 *
 * Two states, one box:
 *  - SEND CODE — what the code will prove, and a gold Send button (gold = act).
 *  - CODE SENT — the server's own confirmation, where it went, the six-digit
 *    field, Resend (behind the server's window) and Change email.
 *
 * Presentational: the state is `useSignupEmailCode`, owned by the page, and
 * the page decides what a send does beyond this box (the organisation form
 * also toasts). A `div`, never a `section` — `.signup-form section` is the
 * panel style of a whole step and would draw a second panel inside one.
 */
export function SignupEmailCodeBox({
	id,
	email,
	state,
	copy,
	disabled = false,
	onSend,
	onChangeEmail,
}: {
	/** Anchor for the page's "verify first" refusal, and the input's id stem. */
	id: string;
	/** What is typed in the page's email field right now. */
	email: string;
	state: SignupEmailCode;
	copy: SignupTranslations;
	disabled?: boolean;
	onSend: () => void;
	onChangeEmail: () => void;
}) {
	const t = copy.emailCode;
	const typed = email.trim();
	const sent = state.sentTo !== null;
	const inputId = `${id}-input`;
	const sendLabel = state.sending
		? t.sending
		: state.resendIn > 0
			? t.resendIn.replace("{s}", String(state.resendIn))
			: sent
				? t.resendCode
				: t.sendCode;
	const notice = noticeLine(state.notice, copy);

	return (
		<div
			id={id}
			className="scroll-mt-28 rounded-xl border border-royal-gold/25 bg-background/50 p-4"
		>
			<div className="flex items-start gap-3">
				<span className="grid size-9 shrink-0 place-items-center rounded-lg border border-royal-gold/25 bg-royal-gold/10">
					<MailCheck className="size-4 text-gold-bright" aria-hidden />
				</span>
				<div className="min-w-0 flex-1">
					<p className="font-semibold text-foreground">{t.title}</p>
					<p className="mt-1 text-xs leading-relaxed text-muted-foreground">
						{sent ? (
							<EmailSentence template={t.sentTo} email={typed} />
						) : typed ? (
							<EmailSentence template={t.lead} email={typed} />
						) : (
							t.leadNoEmail
						)}
					</p>

					{sent ? (
						<div className="mt-3 space-y-3">
							<label htmlFor={inputId} className="block space-y-1.5">
								<span className="login-field-label block text-foreground">
									{t.codeLabel}
									<span className="ml-0.5 text-destructive" aria-hidden>
										*
									</span>
								</span>
								{/* No `maxLength`: the browser would cut a pasted "123 456"
								    to "123 45" BEFORE the digits are picked out of it.
								    `setCode` keeps digits only, six at most. */}
								<input
									id={inputId}
									name="emailCode"
									inputMode="numeric"
									autoComplete="one-time-code"
									placeholder="123456"
									value={state.code}
									disabled={disabled}
									aria-required
									onChange={(event) => state.setCode(event.target.value)}
									className="login-input-group flex h-11 w-full max-w-56 items-center rounded-md border border-royal-gold/20 bg-background/40 px-3 text-base tabular-nums tracking-[0.3em] text-foreground"
								/>
							</label>
							<div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
								<button
									type="button"
									onClick={onSend}
									disabled={disabled || !state.canSend}
									className="font-semibold text-gold-bright underline-offset-4 hover:underline disabled:opacity-50 disabled:hover:no-underline"
								>
									{sendLabel}
								</button>
								<button
									type="button"
									onClick={onChangeEmail}
									disabled={disabled}
									className="text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
								>
									{t.changeEmail}
								</button>
							</div>
						</div>
					) : (
						<button
							type="button"
							onClick={onSend}
							disabled={disabled || !state.canSend}
							className="mt-3 inline-flex items-center gap-2 rounded-lg bg-royal-gold px-4 py-2 text-sm font-semibold text-[#1a1726] disabled:opacity-50"
						>
							{state.sending ? (
								<Loader2 className="size-4 animate-spin" aria-hidden />
							) : null}
							{sendLabel}
						</button>
					)}

					{/* `output` is a live status region by itself — the confirmation
					    and every refusal are read out without moving the focus. */}
					{notice ? (
						<output
							aria-live="polite"
							className={cn(
								"mt-3 block text-xs leading-relaxed",
								notice.problem ? "text-destructive" : "text-muted-foreground",
							)}
						>
							{notice.text}
						</output>
					) : null}
				</div>
			</div>
		</div>
	);
}

/** A whole dictionary sentence split at `{email}`, the address in gold. */
function EmailSentence({
	template,
	email,
}: {
	template: string;
	email: string;
}) {
	const [before, after = ""] = template.split("{email}");
	return (
		<>
			{before}
			<span className="font-semibold text-gold-bright">{email}</span>
			{after}
		</>
	);
}

/** The line under the box, in the reader's words, and whether it is a problem. */
function noticeLine(
	notice: SignupEmailCodeNotice | null,
	copy: SignupTranslations,
): { text: string; problem: boolean } | null {
	if (!notice) return null;
	switch (notice.kind) {
		case "sent":
			// No sentence came back with the code: "Sent to …" above already
			// confirms it, and an empty answer must not read as a failure.
			return notice.message.trim()
				? {
						text: localiseSignupEmailCodeAnswer(notice.message, copy),
						problem: false,
					}
				: null;
		case "sendRefused":
			return {
				text: localiseSignupEmailCodeAnswer(notice.message, copy),
				problem: true,
			};
		case "resend":
			return { text: copy.emailCode.newCodeNeeded, problem: true };
		case "retype":
			return { text: copy.emailCode.retypeHint, problem: true };
	}
}
