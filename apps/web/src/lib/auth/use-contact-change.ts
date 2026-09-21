/**
 * THE ONE-CODE CONTACT CHANGE AS ONE STATE MACHINE — shared by the agency and
 * outlet Security sheet and the admin Login & security card, so the three
 * surfaces cannot disagree about where the code goes or when a step is done.
 *
 *   idle ──start(kind, value, currentPassword)──▶ code ──confirm──▶ done
 *                                                  │  resend = another code
 *
 * Owner, 21 Sep 2026: the code goes to the NEW contact and NOTHING — no code,
 * no notice — ever reaches the old phone or old email. The current password is
 * what replaced the identity code, and it is taken as an ARGUMENT and never
 * kept in this state: a password held in memory behind a code sheet for the
 * whole flow is exactly what the server refused to ask for twice.
 *
 * Rendering is the caller's job; this owns the requests, the id, the receipt of
 * where the code went, the Resend countdown and the last refusal. A wrong code
 * keeps the sheet where it is so the person can retype (the server allows five
 * tries per code). One refusal DOES move it, as in the PR app (see
 * `contact-change-outcome.ts`): a contact taken meanwhile goes back to the
 * field.
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
} from "@/lib/auth/contact-change-api";
import { confirmStepOutcome } from "@/lib/auth/contact-change-outcome";
import { profileQueryKey } from "@/lib/auth/use-profile";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

export type ContactChangeStage = "idle" | "code" | "done";

export type ContactChangeProblem =
	| { kind: "server"; error: AuthFlowError }
	| { kind: "codeRequired" };

interface FlowState {
	stage: ContactChangeStage;
	kind: ContactKind;
	/** Normalised once at start and sent identically on every later call. */
	value: string;
	requestId: string | null;
	sentTo: CodeDelivery[];
	pendingInvitesToCurrentEmail: number;
}

const IDLE: FlowState = {
	stage: "idle",
	kind: "phone",
	value: "",
	requestId: null,
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

	/**
	 * Step 1. Resolves true when the code is on its way to the NEW contact.
	 *
	 * ⚠️ `currentPassword` is an ARGUMENT and is deliberately not stored: it
	 * falls out of scope the moment this resolves, and `resend` never needs it.
	 */
	const start = useCallback(
		async (
			kind: ContactKind,
			rawValue: string,
			currentPassword: string,
		): Promise<boolean> => {
			const value = normaliseContactValue(kind, rawValue);
			const started = await run(() =>
				startContactChange({ kind, value, currentPassword }),
			);
			if (!started) return false;
			setFlow({
				stage: "code",
				kind,
				value,
				requestId: started.requestId,
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
	 * Spend the code and write the change. Resolves with the confirmed change,
	 * or null — still on the code step, or back at the field — when it was
	 * refused.
	 *
	 * The api call has ALREADY stored the re-issued tokens, so the profile
	 * refetch below goes out on the new token rather than a retired one. When
	 * the answer carried NO tokens (`tokensStored: false`) nothing is refetched:
	 * the token in hand was retired by the change itself, so every refetch would
	 * collect a 401 and bounce the person to sign-in with no explanation. The
	 * caller shows "saved — sign in again" instead.
	 */
	const submitCode =
		useCallback(async (): Promise<ContactChangeConfirmed | null> => {
			if (flow.stage !== "code") return null;
			if (!CODE_RE.test(code)) {
				setProblem({ kind: "codeRequired" });
				return null;
			}
			const { requestId, kind, value } = flow;
			if (!requestId) return null;

			const confirmed = await run(
				() => confirmContactChange({ requestId, kind, value, code }),
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
	 * Another code to the same new contact. Resolves true when sent.
	 *
	 * ⚠️ The server answers a NEW `requestId` and expires the row this flow was
	 * holding, so the id is REPLACED — keeping the old one would confirm against
	 * a dead row and answer "This code has expired" for a code just read off the
	 * phone. `pendingInvitesToCurrentEmail` is NOT replaced: only `start` counts
	 * the invites, and a resend always answers 0, which would erase the warning.
	 */
	const resend = useCallback(async (): Promise<boolean> => {
		if (flow.stage !== "code" || !flow.requestId) return false;
		const { requestId, kind, value } = flow;
		const sent = await run(() =>
			resendContactChangeNewCode({ requestId, kind, value }),
		);
		if (!sent) return false;
		setFlow((f) => ({
			...f,
			requestId: sent.requestId,
			sentTo: sent.sentTo,
		}));
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
		/** True while the code sheet should be on screen. */
		codeOpen: flow.stage === "code",
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
