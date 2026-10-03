import { env } from "@/env";
import type { LandingLocale } from "@/lib/landing-i18n";
import type { ChatAnswer, ChatRole } from "./landing-chat-knowledge";

/** Longer than the backend's two model tries (2 × 9 s), so it answers first. */
const WAIT_MS = 20_000;
/** Matches the backend's MAX_QUESTION_CHARS. */
const MAX_QUESTION_CHARS = 500;
/** Match the backend's MAX_HISTORY_TURNS and per-turn cut. */
export const MAX_HISTORY_TURNS = 6;
const MAX_TURN_CHARS = 600;

export interface AiAnswer {
	answer: ChatAnswer;
	more?: string;
}

/** One earlier line of the chat, so a follow-up ("and how do I sign it?") is understood. */
export interface ChatTurn {
	from: "visitor" | "assistant";
	text: string;
}

/**
 * Ask Gemini, through the backend (features/landing-chat), which holds the key
 * — it never reaches the browser — and builds the facts itself from its
 * generated copy of landing-chat-knowledge.ts (`pnpm chat:facts`). The answer comes back in the same shape as a
 * written answer: a short line, steps by page, an optional "tell me more".
 *
 * Resolves to `null` on ANY failure — no key configured, a rate limit, Google
 * busy, a timeout, the visitor offline, an odd reply. The caller then shows the
 * written answer, so the chat never goes silent.
 */
export async function askLandingAi(
	question: string,
	locale: LandingLocale,
	role: ChatRole | null,
	history: ChatTurn[],
	signal?: AbortSignal,
	/** A side button ("I run an agency"): the server then insists on that side's whole page path. */
	sidePick = false,
): Promise<AiAnswer | null> {
	/* AbortSignal.any / .timeout are missing on Safari before 17.4, so one local
	 * controller carries both the caller's cancel and the time limit. */
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), WAIT_MS);
	const cancel = () => ctl.abort();
	if (signal?.aborted) ctl.abort();
	signal?.addEventListener("abort", cancel, { once: true });
	try {
		const res = await fetch(`${env.VITE_API_URL}/v1/landing-chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				question: question.slice(0, MAX_QUESTION_CHARS),
				locale,
				role,
				...(sidePick ? { sidePick: true } : {}),
				history: history.slice(-MAX_HISTORY_TURNS).map((t) => ({
					from: t.from,
					text: t.text.slice(0, MAX_TURN_CHARS),
				})),
			}),
			signal: ctl.signal,
		});
		if (!res.ok) return null;
		const body = (await res.json()) as { data?: { reply?: unknown } };
		return toAiAnswer(body.data?.reply);
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", cancel);
	}
}

/** Check the reply's shape; anything unexpected counts as "no answer". */
function toAiAnswer(reply: unknown): AiAnswer | null {
	if (!reply || typeof reply !== "object") return null;
	const r = reply as Record<string, unknown>;
	const text = typeof r.text === "string" ? r.text.trim() : "";
	const steps = Array.isArray(r.steps)
		? r.steps
				.filter(
					(s): s is { where: string; what: string } =>
						!!s &&
						typeof s === "object" &&
						typeof (s as { where?: unknown }).where === "string" &&
						typeof (s as { what?: unknown }).what === "string",
				)
				.map((s) => ({ where: s.where.trim(), what: s.what.trim() }))
				.filter((s) => s.where && s.what)
		: [];
	if (!text && steps.length === 0) return null;
	const more =
		typeof r.more === "string" && r.more.trim() ? r.more.trim() : undefined;
	return {
		answer: {
			text,
			...(steps.length ? { steps } : {}),
			...(r.handoff === true ? { handoff: true } : {}),
		},
		more,
	};
}
