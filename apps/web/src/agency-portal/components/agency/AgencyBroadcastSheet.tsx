import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { IzCardTitle } from "@agency-portal/components/iz/ui";
import { useStore } from "@agency-portal/lib/store";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { broadcastToPrs } from "@/services/agency";

/**
 * Server caps (BroadcastToPrsSchema). Mirrored so the field stops you at the
 * same number the API would have rejected you for.
 */
const MAX_SUBJECT = 200;
const MAX_BODY = 4000;
/**
 * Show the counter only near the cap. A number that is always on screen is
 * noise for the twenty-character message that is the normal case.
 */
const COUNTER_AT = 0.8;
/** Names listed before collapsing the rest into "+N more". */
const NAMES_SHOWN = 6;

export type BroadcastRecipient = { id: string; name: string };

type MessageForm = {
	subject: string;
	body: string;
};

const EMPTY_MESSAGE: MessageForm = {
	subject: "",
	body: "",
};

function FieldError({ message }: { message?: string }) {
	if (!message) return null;
	return (
		<p className="mt-1 flex items-center gap-1 text-[10px] text-[var(--iz-red)]">
			<AlertTriangle className="h-3 w-3 shrink-0" />
			{message}
		</p>
	);
}

/**
 * Characters used, once you are close to the cap.
 *
 * `tabular-nums` so the row does not jitter sideways as the digit count grows:
 * it updates on every keystroke, which is exactly when shifting text is most
 * distracting.
 */
function CharCount({ value, max }: { value: number; max: number }) {
	if (value < max * COUNTER_AT) return null;
	return (
		<span
			className={`iz-tiny tabular-nums ${
				value >= max ? "text-[var(--iz-red)]" : "iz-muted2"
			}`}
		>
			{value}/{max}
		</span>
	);
}

export function AgencyBroadcastSheet({
	open,
	onClose,
	recipients,
	onSent,
}: {
	open: boolean;
	onClose: () => void;
	/**
	 * The PRs picked on Manage PRs — ids AND names together, deliberately.
	 * Re-resolving the names from a second source here could disagree with the
	 * list the person actually selected from, and showing them who is about to
	 * be messaged is this sheet's whole job.
	 */
	recipients: BroadcastRecipient[];
	onSent: () => void;
}) {
	const { t } = usePortalLocale();
	const { logout } = useAuth();
	const toast = useStore((s) => s.toast);
	const activeAgencyId = useStore((s) => s.activeAgencyId);
	const subjectId = useId();
	const bodyId = useId();
	const subjectRef = useRef<HTMLInputElement>(null);
	const [message, setMessage] = useState<MessageForm>(EMPTY_MESSAGE);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [formError, setFormError] = useState<string | null>(null);

	const count = recipients.length;
	const shown = useMemo(() => recipients.slice(0, NAMES_SHOWN), [recipients]);
	const extra = Math.max(0, count - NAMES_SHOWN);

	const sendMut = useMutation({
		mutationFn: (input: { title: string; body: string }) => {
			// Guarded here rather than at the button: without an agency there is
			// no roster to scope the send to, and the server would reject it.
			if (!activeAgencyId) {
				throw new Error(t.agencyBroadcast.noActiveAgency);
			}
			return broadcastToPrs(
				activeAgencyId,
				{ prIds: recipients.map((r) => r.id), ...input },
				logout,
			);
		},
		onSuccess: (res) => {
			const sent = res.data?.sent ?? count;
			toast(
				sent === 1
					? t.agencyBroadcast.sentToOne
					: fill(t.agencyBroadcast.sentToMany, { n: sent }),
				"success",
			);
			onSent();
			onClose();
		},
		onError: (error) => {
			// The failure stays ON the sheet with the text still in it. Closing on
			// error and toasting is how the old local-only version managed to
			// report success for a message nobody received.
			setFormError(
				toMutationError(error, t.agencyBroadcast.couldNotSend)?.message ??
					t.agencyBroadcast.couldNotSend,
			);
		},
	});

	useEffect(() => {
		if (!open) return;
		setMessage(EMPTY_MESSAGE);
		setErrors({});
		setFormError(null);
		sendMut.reset();
		// Straight into the first field — this sheet is only ever opened to type.
		const id = window.setTimeout(() => subjectRef.current?.focus(), 0);
		return () => window.clearTimeout(id);
	}, [open, sendMut.reset]);

	const validate = (): boolean => {
		const next: Record<string, string> = {};
		if (!message.subject.trim()) next.subject = t.agencyBroadcast.enterSubject;
		if (!message.body.trim()) next.body = t.agencyBroadcast.enterMessage;
		setErrors(next);
		if (Object.keys(next).length > 0) {
			setFormError(t.agencyBroadcast.completeBeforeSending);
			return false;
		}
		setFormError(null);
		return true;
	};

	const send = () => {
		if (sendMut.isPending) return;
		if (!validate()) return;
		sendMut.mutate({
			title: message.subject.trim(),
			body: message.body.trim(),
		});
	};

	// Cmd/Ctrl+Enter from either field — the standard send shortcut, and the
	// textarea needs a bare Enter for newlines.
	const onKeyDown = (e: React.KeyboardEvent) => {
		if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
			e.preventDefault();
			send();
		}
	};

	return (
		<IzSheet open={open} onClose={onClose}>
			<IzCardTitle className="[text-wrap:balance]">
				{count === 1
					? t.agencyBroadcast.titleOne
					: fill(t.agencyBroadcast.titleMany, { n: count })}
			</IzCardTitle>
			<p className="iz-tiny iz-muted mb-3 [text-wrap:pretty]">
				{t.agencyBroadcast.hint}
			</p>

			{/*
			 * Who is actually getting this. A bare "1 PR" gives you no way to catch
			 * the wrong pick, and the send cannot be taken back once it is made.
			 */}
			{count > 0 && (
				<div className="mb-3 rounded-xl border border-[var(--iz-line)] bg-[var(--iz-bg2)] px-3 py-2.5">
					<p className="iz-tiny iz-muted2 mb-1.5 tracking-wide">
						{t.agencyBroadcast.recipientsHeading}
					</p>
					<div className="flex flex-wrap gap-1.5">
						{shown.map((r) => (
							<span
								key={r.id}
								className="rounded-lg border border-[var(--iz-line2)] bg-[rgba(255,255,255,.03)] px-2 py-1 text-[11px] text-[var(--iz-txt)]"
							>
								{r.name}
							</span>
						))}
						{extra > 0 && (
							<span className="iz-muted2 rounded-lg px-2 py-1 text-[11px] tabular-nums">
								{fill(t.agencyBroadcast.plusNMore, { n: extra })}
							</span>
						)}
					</div>
				</div>
			)}

			{formError && (
				// role=alert so the failure is announced, not only coloured.
				<div
					role="alert"
					className="mb-3 rounded-xl border border-[var(--iz-red)]/40 bg-[rgba(239,68,68,.08)] px-3 py-2"
				>
					<p className="iz-tiny flex items-center gap-1 text-[var(--iz-red)]">
						<AlertTriangle className="h-3.5 w-3.5 shrink-0" />
						{formError}
					</p>
				</div>
			)}

			<div className="space-y-3">
				<div className="iz-field !mb-0">
					<div className="mb-[7px] flex items-baseline justify-between gap-2">
						<label htmlFor={subjectId} className="!mb-0">
							{t.agencyBroadcast.subjectLabel}
						</label>
						<CharCount value={message.subject.length} max={MAX_SUBJECT} />
					</div>
					<input
						id={subjectId}
						ref={subjectRef}
						value={message.subject}
						placeholder={t.agencyBroadcast.subjectPlaceholder}
						maxLength={MAX_SUBJECT}
						disabled={sendMut.isPending}
						aria-invalid={Boolean(errors.subject)}
						className={errors.subject ? "!border-[var(--iz-red)]" : undefined}
						onKeyDown={onKeyDown}
						onChange={(e) => {
							setMessage((m) => ({ ...m, subject: e.target.value }));
							if (errors.subject) setErrors((er) => ({ ...er, subject: "" }));
						}}
					/>
					<FieldError message={errors.subject} />
				</div>
				<div className="iz-field !mb-0">
					<div className="mb-[7px] flex items-baseline justify-between gap-2">
						<label htmlFor={bodyId} className="!mb-0">
							{t.agencyBroadcast.messageLabel}
						</label>
						<CharCount value={message.body.length} max={MAX_BODY} />
					</div>
					<textarea
						id={bodyId}
						rows={4}
						value={message.body}
						placeholder={t.agencyBroadcast.bodyPlaceholder}
						maxLength={MAX_BODY}
						disabled={sendMut.isPending}
						aria-invalid={Boolean(errors.body)}
						className={`iz-textarea${errors.body ? " iz-textarea--invalid" : ""}`}
						onKeyDown={onKeyDown}
						onChange={(e) => {
							setMessage((m) => ({ ...m, body: e.target.value }));
							if (errors.body) setErrors((er) => ({ ...er, body: "" }));
						}}
					/>
					<FieldError message={errors.body} />
				</div>
			</div>

			<div className="iz-grid2 mt-4">
				<button
					type="button"
					className="iz-btn iz-btn-ghost"
					disabled={sendMut.isPending}
					onClick={onClose}
				>
					{t.common.cancel}
				</button>
				<button
					type="button"
					className="iz-btn iz-btn-primary"
					disabled={sendMut.isPending}
					onClick={send}
				>
					{sendMut.isPending
						? t.roster.sending
						: t.agencyBroadcast.sendMessage}
				</button>
			</div>
		</IzSheet>
	);
}
