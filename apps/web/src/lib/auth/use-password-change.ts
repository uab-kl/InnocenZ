/**
 * THE TWO-STEP PASSWORD CHANGE AS ONE STATE MACHINE — shared by the agency and
 * outlet Security sheet and the admin Login & security card, so the three
 * surfaces cannot disagree about where the code goes or when a step is done.
 *
 *   idle ──start(currentPassword)──▶ code ──submitCode(newPassword)──▶ done
 *                                      │  resend = another code
 *
 * Owner, 21 Sep 2026, asked what the signed-in change should become: "Current
 * password + a code". So the current password is step 1's proof and the server
 * then sends ONE code — the same six digits — to the phone on file (WhatsApp +
 * SMS) and the email on file. It is the same shape as `use-contact-change.ts`,
 * with one deliberate difference: the code goes to the contacts ALREADY on the
 * account, because nothing about them is changing.
 *
 * ⚠️ NEITHER PASSWORD IS KEPT HERE. `start` takes the current one as an
 * argument and `submitCode` takes the new one, and both fall out of scope the
 * moment their request resolves. A password parked in hook state for the whole
 * flow is exactly what the server refused to ask for twice — and the new
 * password must never reach a URL or a query string either.
 *
 * Rendering is the caller's job; this owns the requests, the id, the receipt of
 * where the code went, the Resend countdown and the last refusal. A wrong code
 * keeps the sheet where it is so the person can retype (the server allows five
 * tries per code).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
	type AuthFlowError,
	type CodeDelivery,
	toAuthFlowError,
} from "@/lib/auth/auth-flow-client";
import { localiseAuthMessage } from "@/lib/auth/auth-server-copy";
import {
	confirmPasswordChange,
	type PasswordChangeConfirmed,
	resendPasswordChangeCode,
	startPasswordChange,
} from "@/lib/auth/password-api";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

export type PasswordChangeStage = "idle" | "code" | "done";

export type PasswordChangeProblem =
	| { kind: "server"; error: AuthFlowError }
	| { kind: "codeRequired" };

interface FlowState {
	stage: PasswordChangeStage;
	requestId: string | null;
	sentTo: CodeDelivery[];
}

const IDLE: FlowState = { stage: "idle", requestId: null, sentTo: [] };

const CODE_RE = /^\d{6}$/;

export function usePasswordChange() {
	const [flow, setFlow] = useState<FlowState>(IDLE);
	const [code, setCodeState] = useState("");
	const [busy, setBusy] = useState(false);
	/** A ref as well as state: two clicks in one frame both read stale state. */
	const busyRef = useRef(false);
	const [problem, setProblem] = useState<PasswordChangeProblem | null>(null);
	const [resendIn, setResendIn] = useState(0);

	useEffect(() => {
		if (resendIn <= 0) return;
		const id = setTimeout(() => setResendIn((n) => n - 1), 1000);
		return () => clearTimeout(id);
	}, [resendIn]);

	const setCode = useCallback((next: string) => {
		setCodeState(next.replace(/\D/g, "").slice(0, 6));
		// The refusal was about the code they just replaced.
		setProblem((p) => (p?.kind === "codeRequired" ? null : p));
	}, []);

	/** Run one request with the busy guard; a refusal is kept, never thrown. */
	const run = useCallback(
		async <T>(request: () => Promise<T>): Promise<T | null> => {
			if (busyRef.current) return null;
			busyRef.current = true;
			setBusy(true);
			setProblem(null);
			try {
				return await request();
			} catch (caught) {
				const error = toAuthFlowError(caught, "");
				setProblem({ kind: "server", error });
				if (error.retryAfterSec) setResendIn(error.retryAfterSec);
				return null;
			} finally {
				busyRef.current = false;
				setBusy(false);
			}
		},
		[],
	);

	/**
	 * Step 1. Resolves true when the code is on its way.
	 *
	 * ⚠️ `currentPassword` is an ARGUMENT and is deliberately not stored: it
	 * falls out of scope the moment this resolves, and `resend` never needs it.
	 */
	const start = useCallback(
		async (currentPassword: string): Promise<boolean> => {
			const started = await run(() => startPasswordChange({ currentPassword }));
			if (!started) return false;
			setFlow({
				stage: "code",
				requestId: started.requestId,
				sentTo: started.sentTo,
			});
			setCodeState("");
			setResendIn(started.resendAfterSec);
			return true;
		},
		[run],
	);

	/**
	 * Step 2 — spend the code and write the new password. Resolves with the
	 * confirmed change, or null when it was refused (the code step stays put so
	 * the code can be retyped).
	 *
	 * The api call has ALREADY stored the re-issued tokens before this resolves.
	 * `tokensStored: false` means the password DID change but this tab's token
	 * was retired with no replacement — the caller must say "saved — sign in
	 * again" rather than carry on into an unexplained 401.
	 */
	const submitCode = useCallback(
		async (newPassword: string): Promise<PasswordChangeConfirmed | null> => {
			if (flow.stage !== "code") return null;
			if (!CODE_RE.test(code)) {
				setProblem({ kind: "codeRequired" });
				return null;
			}
			const { requestId } = flow;
			if (!requestId) return null;

			const confirmed = await run(() =>
				confirmPasswordChange({ requestId, code, newPassword }),
			);
			if (!confirmed) return null;
			setFlow((f) => ({ ...f, stage: "done" }));
			setCodeState("");
			setResendIn(0);
			return confirmed;
		},
		[code, flow, run],
	);

	/**
	 * Another code. Resolves true when sent.
	 *
	 * ⚠️ The server answers a NEW `requestId` and expires the row this flow was
	 * holding, so the id is REPLACED — keeping the old one would confirm against
	 * a dead row and answer "This code has expired" for a code just read off the
	 * phone.
	 */
	const resend = useCallback(async (): Promise<boolean> => {
		if (flow.stage !== "code" || !flow.requestId) return false;
		const { requestId } = flow;
		const sent = await run(() => resendPasswordChangeCode({ requestId }));
		if (!sent) return false;
		setFlow((f) => ({ ...f, requestId: sent.requestId, sentTo: sent.sentTo }));
		setCodeState("");
		setResendIn(sent.resendAfterSec);
		return true;
	}, [flow, run]);

	/** Close the flow and forget its id. The countdown survives on purpose. */
	const reset = useCallback(() => {
		setFlow(IDLE);
		setCodeState("");
		setProblem(null);
	}, []);

	/** Clear a refusal shown beside the password fields when one is edited. */
	const clearProblem = useCallback(() => setProblem(null), []);

	return {
		stage: flow.stage,
		sentTo: flow.sentTo,
		code,
		setCode,
		busy,
		problem,
		resendIn,
		start,
		submitCode,
		resend,
		reset,
		clearProblem,
		/** True while the code sheet should be on screen. */
		codeOpen: flow.stage === "code",
	};
}

export type PasswordChangeFlow = ReturnType<typeof usePasswordChange>;

/**
 * The sentence for a problem. Server sentences go through the localiser;
 * `fallback` covers a refusal that carried no sentence at all.
 */
export function passwordChangeProblemText(
	problem: PasswordChangeProblem,
	t: PortalTranslations,
	fallback: string,
): string {
	if (problem.kind === "codeRequired") return t.authCodes.codeRequired;
	return localiseAuthMessage(problem.error.message || fallback, t);
}
