/**
 * THE TWO-CODE CONTACT CHANGE AS ONE STATE MACHINE — shared by the agency and
 * outlet Security sheet and the admin Login & security card, so the three
 * surfaces cannot disagree about which code goes where or when a step is done.
 *
 *   idle ──start──▶ identity ──code #1──▶ new ──code #2──▶ done
 *                     │  resend = start again   │  resend = resend-new
 *
 * Rendering is the caller's job; this owns the requests, the ids, the receipt
 * of where each code went, the Resend countdown and the last refusal. A wrong
 * code keeps the sheet where it is so the person can retype (the server allows
 * five tries per code). Two refusals DO move it, as in the PR app (see
 * `contact-change-outcome.ts`): code #2 failing to go out after code #1 was
 * accepted moves on to step 3 with Resend ready, and a contact taken meanwhile
 * goes back to the field.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	type AuthFlowError,
	type CodeDelivery,
	toAuthFlowError,
} from "@/lib/auth/auth-flow-client";
import { localiseAuthMessage } from "@/lib/auth/auth-server-copy";
import {
	type ContactChangeConfirmed,
	type ContactKind,
	confirmContactChange,
	normaliseContactValue,
	resendContactChangeNewCode,
	startContactChange,
	verifyContactChangeIdentity,
} from "@/lib/auth/contact-change-api";
import {
	confirmStepOutcome,
	identityStepOutcome,
	keepsLineOnStepThree,
} from "@/lib/auth/contact-change-outcome";
import { profileQueryKey } from "@/lib/auth/use-profile";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

export type ContactChangeStage = "idle" | "identity" | "new" | "done";

export type ContactChangeProblem =
	| { kind: "server"; error: AuthFlowError }
	| { kind: "codeRequired" };

interface FlowState {
	stage: ContactChangeStage;
	kind: ContactKind;
	/** Normalised once at start and sent identically on every later call. */
	value: string;
	requestId: string | null;
	newRequestId: string | null;
	sentTo: CodeDelivery[];
	pendingInvitesToCurrentEmail: number;
}

const IDLE: FlowState = {
	stage: "idle",
	kind: "phone",
	value: "",
	requestId: null,
	newRequestId: null,
	sentTo: [],
	pendingInvitesToCurrentEmail: 0,
};

const CODE_RE = /^\d{6}$/;

/**
 * EVERY CACHE THAT SHOWS THE SIGNED-IN PERSON'S EMAIL, PHONE OR NAME, refetched
 * after a confirmed change to any of them.
 *
 * ⚠️ `/auth/me` alone was not enough. The locked Email / Mobile / owner-name
 * fields on agency Profile and outlet Settings read the org MEMBERS list first
 * (the owner's own member row) and fall back to `/auth/me` only after it — and
 * that list has a 60 s staleTime. So the Login & security row showed the new
 * address while the locked field beside it still showed the old one until a
 * remount. Prefixes, not ids: this hook does not know which organisation is
 * active, and only the queries actually mounted refetch.
 *
 * Plain arrays rather than `orgMembersKey(...)` — that lives in the agency
 * portal's hooks, and `lib/auth` must not import the portal back.
 */
export const SIGNED_IN_ACCOUNT_QUERY_KEYS: ReadonlyArray<readonly string[]> = [
	profileQueryKey,
	["agency", "members"],
	["outlet", "members"],
	["agency", "profile"],
	["outlet", "profile"],
];

export function useContactChange() {
	const queryClient = useQueryClient();
	const [flow, setFlow] = useState<FlowState>(IDLE);
	const [code, setCodeState] = useState("");
	const [busy, setBusy] = useState(false);
	/** A ref as well as state: two clicks in one frame both read stale state. */
	const busyRef = useRef(false);
	const [problem, setProblem] = useState<ContactChangeProblem | null>(null);
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

	/**
	 * Run one request with the busy guard; a refusal is kept, never thrown.
	 * `onRefusal` runs after the refusal is recorded, for a step whose refusal
	 * must also MOVE the flow (see `contact-change-outcome.ts`).
	 */
	const run = useCallback(
		async <T>(
			request: () => Promise<T>,
			onRefusal?: (error: AuthFlowError) => void,
		): Promise<T | null> => {
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
				onRefusal?.(error);
				return null;
			} finally {
				busyRef.current = false;
				setBusy(false);
			}
		},
		[],
	);

	/** Step 1. Resolves true when code #1 is on its way. */
	const start = useCallback(
		async (kind: ContactKind, rawValue: string): Promise<boolean> => {
			const value = normaliseContactValue(kind, rawValue);
			const started = await run(() => startContactChange({ kind, value }));
			if (!started) return false;
			setFlow({
				stage: "identity",
				kind,
				value,
				requestId: started.requestId,
				newRequestId: null,
				sentTo: started.sentTo,
				pendingInvitesToCurrentEmail: started.pendingInvitesToCurrentEmail,
			});
			setCodeState("");
			setResendIn(started.resendAfterSec);
			return true;
		},
		[run],
	);

	/**
	 * A refusal that means the new contact belongs to somebody else: no code can
	 * fix that, so back to the field — the refusal stays and renders under it,
	 * and the value the person typed is still in the box (the caller owns it).
	 */
	const backToField = useCallback(() => {
		setFlow((f) => ({ ...IDLE, kind: f.kind }));
		setCodeState("");
	}, []);

	/**
	 * Spend the code for the current stage. Resolves with the confirmed change
	 * when the whole flow is finished, or null — still on a code stage, or back
	 * at the field — when it moved from #1 to #2 or was refused.
	 *
	 * On confirm the api call has ALREADY stored the re-issued tokens, so the
	 * profile refetch below goes out on the new token rather than a retired one.
	 * When the answer carried NO tokens (`tokensStored: false`) nothing is
	 * refetched: the token in hand was retired by the change itself, so every
	 * refetch would collect a 401 and bounce the person to sign-in with no
	 * explanation. The caller shows "saved — sign in again" instead.
	 */
	const submitCode =
		useCallback(async (): Promise<ContactChangeConfirmed | null> => {
			if (flow.stage !== "identity" && flow.stage !== "new") return null;
			if (!CODE_RE.test(code)) {
				setProblem({ kind: "codeRequired" });
				return null;
			}
			const { requestId, newRequestId, kind, value } = flow;
			if (!requestId) return null;

			if (flow.stage === "identity") {
				const sent = await run(
					() => verifyContactChangeIdentity({ requestId, kind, value, code }),
					(error) => {
						const outcome = identityStepOutcome(error);
						if (outcome === "taken") {
							backToField();
							return;
						}
						if (outcome === "identitySpent") {
							/*
							 * Code #1 is spent (or may be): move ON to step 3 with no
							 * code #2 yet, Resend available at once. Resend there is
							 * `resend-new`, which needs no new identity code.
							 */
							setFlow((f) => ({
								...f,
								stage: "new",
								newRequestId: null,
								sentTo: [],
							}));
							setCodeState("");
							setResendIn(0);
							if (!keepsLineOnStepThree(error)) setProblem(null);
						}
					},
				);
				if (!sent) return null;
				setFlow((f) => ({
					...f,
					stage: "new",
					newRequestId: sent.newRequestId,
					sentTo: sent.sentTo,
				}));
				setCodeState("");
				setResendIn(sent.resendAfterSec);
				return null;
			}

			// No code #2 went out yet (see above) — Resend is the way forward.
			if (!newRequestId) return null;
			const confirmed = await run(
				() =>
					confirmContactChange({ requestId, newRequestId, kind, value, code }),
				(error) => {
					if (confirmStepOutcome(error) === "taken") backToField();
				},
			);
			if (!confirmed) return null;
			setFlow((f) => ({ ...f, stage: "done" }));
			setCodeState("");
			setResendIn(0);
			if (!confirmed.tokensStored) return confirmed;
			// Refetch, never patch the cache — see SIGNED_IN_ACCOUNT_QUERY_KEYS.
			await Promise.all(
				SIGNED_IN_ACCOUNT_QUERY_KEYS.map((queryKey) =>
					queryClient.invalidateQueries({ queryKey }),
				),
			);
			return confirmed;
		}, [backToField, code, flow, queryClient, run]);

	/**
	 * Resend for the current stage. Code #1 is resent by STARTING AGAIN (the
	 * server expires the older pending row); code #2 by `resend-new`, which
	 * keeps the already-verified identity step. Resolves true when sent.
	 */
	const resend = useCallback(async (): Promise<boolean> => {
		if (flow.stage === "identity") {
			const { kind, value } = flow;
			const started = await run(() => startContactChange({ kind, value }));
			if (!started) return false;
			setFlow((f) => ({
				...f,
				requestId: started.requestId,
				sentTo: started.sentTo,
				pendingInvitesToCurrentEmail: started.pendingInvitesToCurrentEmail,
			}));
			setCodeState("");
			setResendIn(started.resendAfterSec);
			return true;
		}
		if (flow.stage === "new" && flow.requestId) {
			const { requestId, kind, value } = flow;
			const sent = await run(() =>
				resendContactChangeNewCode({ requestId, kind, value }),
			);
			if (!sent) return false;
			setFlow((f) => ({
				...f,
				newRequestId: sent.newRequestId,
				sentTo: sent.sentTo,
			}));
			setCodeState("");
			setResendIn(sent.resendAfterSec);
			return true;
		}
		return false;
	}, [flow, run]);

	/** Close the flow and forget its ids. The countdown survives on purpose. */
	const reset = useCallback(() => {
		setFlow(IDLE);
		setCodeState("");
		setProblem(null);
	}, []);

	/** Clear a refusal shown beside the NEW-contact field when it is edited. */
	const clearProblem = useCallback(() => setProblem(null), []);

	return {
		stage: flow.stage,
		kind: flow.kind,
		value: flow.value,
		sentTo: flow.sentTo,
		pendingInvitesToCurrentEmail: flow.pendingInvitesToCurrentEmail,
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
		/** True while a code sheet should be on screen. */
		codeOpen: flow.stage === "identity" || flow.stage === "new",
		/**
		 * False on step 3 while no code #2 exists — the send failed after code #1
		 * was accepted. Verify is disabled then; Resend is the way forward.
		 */
		canVerify:
			flow.stage === "identity" ||
			(flow.stage === "new" && flow.newRequestId !== null),
	};
}

export type ContactChangeFlow = ReturnType<typeof useContactChange>;

/**
 * The sentence for a problem. Server sentences go through the localiser;
 * `fallback` covers a refusal that carried no sentence at all.
 */
export function contactChangeProblemText(
	problem: ContactChangeProblem,
	t: PortalTranslations,
	fallback: string,
): string {
	if (problem.kind === "codeRequired") return t.authCodes.codeRequired;
	return localiseAuthMessage(problem.error.message || fallback, t);
}
