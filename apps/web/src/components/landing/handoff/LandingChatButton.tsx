import {
	BotMessageSquare,
	MessageCircle,
	RotateCcw,
	SendHorizontal,
	Sparkles,
	X,
} from "lucide-react";
import {
	type CSSProperties,
	type FormEvent,
	Fragment,
	type PointerEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { WHATSAPP_CONTACT_URL } from "@/constants/contact";
import {
	type LandingLocale,
	type LandingTranslations,
	useLandingLocale,
} from "@/lib/landing-i18n";
import {
	askLandingAi,
	type ChatTurn,
	MAX_HISTORY_TURNS,
} from "./landing-chat-ai";
import {
	answerRole,
	CHAT_FALLBACK,
	CHAT_INTROS,
	type ChatAnswer,
	type ChatChip,
	type ChatReply,
	type ChatRole,
	FOLLOW_UPS,
	fitsLocale,
	groupSteps,
	LEAD_INS,
	nextChips,
	placeHeading,
	ROLE_CHIPS,
	referenceAnswer,
	SMALL_TALK,
	topicById,
	understand,
	type WrittenReply,
	withAiFollowUp,
} from "./landing-chat-knowledge";

/*
 * The landing page's chat button — bottom-LEFT, the twin of the WhatsApp button
 * on the right. Owner, 1 Oct 2026, modelled on MDeal's "Chat With Me" button,
 * restyled for InnocenZ and coloured "yellow like the sign in button".
 *
 * WHERE IT LIVES: inside `.landing-page`, not beside WhatsApp in `__root.tsx`.
 * Deliberate. The `--hz-*` brand tokens and the `hz-btn-gold` class are scoped
 * to `.landing-page`, and the EN/中文 copy comes from `LandingLocaleProvider`,
 * which only wraps the landing. Mounting here gets the Sign in button's exact
 * gold and the live language switch with no duplicated CSS — and keeps a
 * bottom-left button out of the portals, where it would cover the sidebar.
 *
 * WHAT IT SAYS: a conversation, not a menu (owner, 1 Oct: "the user can
 * continue ask … and the chatbot will reply", "make other user feel like
 * talking with a real human"). Answers come from the hand-written knowledge
 * base in `landing-chat-knowledge.ts`, so it can only say what InnocenZ really
 * does — see that file for why. Only a question its keywords cannot match goes
 * to the AI model (`landing-chat-ai.ts`, owner 1 Oct 2026), and the model is
 * given nothing but that same knowledge base and told to answer from it alone;
 * if the AI is unavailable the keyword "not sure" answer shows as before. The human
 * feel is in the DELIVERY: a typing indicator paced to the length of what is
 * coming, an answer split into short bubbles the way a person types, a varied
 * opening, and a closing question offering the next step. It still introduces
 * itself as the InnocenZ assistant: a bot that claims to be a person misleads
 * the visitor it is meant to help. MDeal's dyna.ai bot id and token are MDeal's
 * own and must not be reused; set `VITE_CHATBOT_URL` to embed a hosted bot
 * instead, and the panel loads it in an iframe exactly as MDeal's does.
 *
 * DRAGGING: like MDeal's, it can be dragged out of the way — with pointer
 * events, because `react-draggable` is not a dependency here. A press that
 * travels under DRAG_THRESHOLD px is a tap; anything further is a drag, and the
 * click it would have produced is swallowed so a drag never toggles the panel.
 */

const CHATBOT_URL: string | undefined =
	import.meta.env.VITE_CHATBOT_URL || undefined;

/** px kept clear of every viewport edge while dragging. */
const EDGE = 8;
/** px a press may travel and still count as a tap. */
const DRAG_THRESHOLD = 5;
/** Matches the WhatsApp button: 56 px tall, 9 px off the bottom. */
const BUTTON_HEIGHT = 56;
const OFFSET_BOTTOM = 9;
const OFFSET_LEFT = 24;
/** A typed question longer than this is cut before it goes into a WhatsApp link. */
const MAX_QUESTION = 300;

/** The Sign in button's own gradient (`.hz-btn-gold`), reused for the avatar. */
const GOLD = "linear-gradient(180deg, #fbe1a4, #f2c66b 50%, #c9962e)";

/**
 * Where the button sits, as a distance from its NEAREST corner. A button parked
 * on the right is held by its right edge, so the wider "✕ Cancel" pill grows
 * leftwards and a resize keeps it the same distance from that edge — "it will
 * remain to where the site user move" (owner, 1 Oct). Nothing has to be
 * measured mid-transition, which is what broke a translate-based version.
 */
interface Spot {
	h: "left" | "right";
	x: number;
	v: "top" | "bottom";
	y: number;
}

const HOME: Spot = { h: "left", x: OFFSET_LEFT, v: "bottom", y: OFFSET_BOTTOM };

/** The spot for a button whose box is at (left, top), held by its nearest corner. */
function spotFor(left: number, top: number, w: number, h: number): Spot {
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const right = left + w / 2 > vw / 2;
	const bottom = top + h / 2 > vh / 2;
	return {
		h: right ? "right" : "left",
		x: right ? vw - left - w : left,
		v: bottom ? "bottom" : "top",
		y: bottom ? vh - top - h : top,
	};
}

/** The same spot, pulled back inside a viewport that has shrunk under it. */
function clampSpot(
	s: Spot,
	w: number,
	h: number,
	vw: number,
	vh: number,
): Spot {
	const x = Math.min(Math.max(s.x, EDGE), Math.max(vw - w - EDGE, EDGE));
	const y = Math.min(Math.max(s.y, EDGE), Math.max(vh - h - EDGE, EDGE));
	return x === s.x && y === s.y ? s : { ...s, x, y };
}

interface DragState {
	startX: number;
	startY: number;
	rect: DOMRect;
	moved: boolean;
}

/** Where the panel opens, worked out from the button's spot when it opens. */
interface Placement {
	up: boolean;
	alignRight: boolean;
	/** px the panel is shifted along its aligned edge, to stay on screen. */
	shift: number;
	height: number;
}

/** One bubble. A bot reply is delivered as up to three, like a person typing. */
type BubblePart = "text" | "steps" | "follow";

type Message =
	| {
			id: number;
			from: "user";
			said: { kind: "text"; text: string } | ChatChip;
	  }
	| {
			id: number;
			from: "bot";
			reply: ChatReply;
			part: BubblePart;
			/** The topic the closing question offers, for `part: "follow"`. */
			nextId?: string;
	  };

/** A message before it is numbered — `Omit` per variant, since a plain
 * `Omit<Message, "id">` collapses the union to its shared keys. */
type NewMessage = Message extends infer M
	? M extends Message
		? Omit<M, "id">
		: never
	: never;

const WELCOME: Message = {
	id: 0,
	from: "bot",
	reply: { kind: "welcome" },
	part: "text",
};

function whatsAppLink(message: string): string {
	return `${WHATSAPP_CONTACT_URL}?text=${encodeURIComponent(message)}`;
}

function prefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

function answerFor(
	reply: ChatReply,
	locale: LandingLocale,
	c: LandingTranslations["chat"],
): ChatAnswer {
	switch (reply.kind) {
		case "welcome":
			return { text: c.greeting };
		case "intro":
			return CHAT_INTROS[locale][reply.role];
		case "topic":
			return topicById(reply.id)?.[locale].answer ?? CHAT_FALLBACK[locale];
		case "small":
			return SMALL_TALK[locale][reply.id];
		case "fallback":
			return CHAT_FALLBACK[locale];
		case "reference":
			return referenceAnswer(reply.id, locale) ?? CHAT_FALLBACK[locale];
		case "ai":
			/* Written in the other language before a switch: show the written answer
			 * in the language now on screen, never a mixed conversation. */
			if (reply.locale !== locale) return answerFor(reply.backup, locale, c);
			/* Same layout as a written answer, plus a quiet AI label. WhatsApp only
			 * when the AI could not answer (it sets `handoff`). */
			return { ...reply.answer, note: c.aiNote };
	}
}

/**
 * The words a visitor must find on screen, highlighted: `**Review & sign**`
 * (the AI marks them) and 「审阅并签名」 (中文 names already sit in brackets, in
 * the written answers too). Built from React elements, never HTML, so nothing
 * the model writes can inject markup. A stray `**` is dropped.
 */
function emphasize(text: string): ReactNode {
	/* Also “quoted” names: the model sometimes quotes a button instead of
	 * marking it, and without this the role highlighter below would chop
	 * “Sign up as Outlet or PR Agency” into three separate highlights. */
	return text
		.split(/\*\*(.+?)\*\*|(「[^」]+」)|(“[^”]{1,80}”)/g)
		.map((part, i) => {
			if (part === undefined || part === "") return null;
			/* split() yields [text, bold, bracketed, quoted, text, …]: slots 1-3 of
			 * each group of four are the captured keywords. */
			const keyword = i % 4 !== 0;
			return keyword ? (
				// biome-ignore lint/suspicious/noArrayIndexKey: a fixed split of one string
				<strong key={i} style={{ color: "var(--hz-gold)", fontWeight: 600 }}>
					{part}
				</strong>
			) : (
				// biome-ignore lint/suspicious/noArrayIndexKey: a fixed split of one string
				<Fragment key={i}>{highlightRoles(part.replaceAll("**", ""))}</Fragment>
			);
		});
}

/**
 * WHO a sentence is about, bold on a soft gold highlight (owner, 1 Oct 2026:
 * "pr, agency or outlet important words make bold and highlight it") — so a
 * reader skimming an answer sees at once whether a step is theirs. Distinct from
 * the gold button names above: those are things to tap, these are people.
 * Capital "PR" only, so "pr" inside a word or a sentence never lights up.
 */
const ROLE_WORDS =
	/(\bPR\s+[Aa]genc(?:y|ies)\b|\bPRs?\b|\b[Aa]genc(?:y|ies)\b|\b[Oo]utlets?\b|PR\s*经纪公司|经纪公司|门店|场所)/g;

function highlightRoles(text: string): ReactNode {
	if (!ROLE_WORDS.test(text)) return text;
	ROLE_WORDS.lastIndex = 0;
	return text.split(ROLE_WORDS).map((part, i) =>
		i % 2 === 1 ? (
			<strong
				// biome-ignore lint/suspicious/noArrayIndexKey: a fixed split of one string
				key={i}
				style={{
					color: "var(--hz-ink)",
					fontWeight: 700,
					background: "rgba(242, 198, 107, 0.16)",
					borderRadius: 4,
					padding: "0 4px",
				}}
			>
				{part}
			</strong>
		) : (
			part
		),
	);
}

function roleLabel(role: ChatRole, c: LandingTranslations["chat"]): string {
	return {
		pr: c.rolePr,
		agency: c.roleAgency,
		outlet: c.roleOutlet,
		general: c.roleOther,
	}[role];
}

function chipLabel(
	chip: ChatChip,
	locale: LandingLocale,
	c: LandingTranslations["chat"],
): string {
	if (chip.kind === "role") return roleLabel(chip.role, c);
	if (chip.kind === "ask") return chip.text;
	return topicById(chip.id)?.[locale].chip ?? "";
}

/** How long "typing…" shows before a bubble lands — longer text, longer wait. */
function typingDelay(chars: number): number {
	if (prefersReducedMotion()) return 120;
	/* Quicker since 2 Oct 2026 (owner: "can make respond more faster?") — it was
	 * 350 ms + 6 ms a character, up to 1.2 s a bubble. */
	return Math.min(250 + chars * 3, 700);
}

/**
 * An AI answer has already kept the visitor waiting while Gemini thought, so its
 * first bubble lands at once and the rest follow quickly (owner, 2 Oct 2026:
 * "make the chatbot fast respond speed"). Written answers keep the human pace.
 */
function aiBubbleGap(chars: number, first: boolean): number {
	if (first || prefersReducedMotion()) return 0;
	return Math.min(200 + chars * 2, 500);
}

export function LandingChatButton() {
	const { t, locale } = useLandingLocale();
	const c = t.chat;

	const [open, setOpen] = useState(false);
	const [spot, setSpot] = useState<Spot>(HOME);
	/* Which way the panel opens and how tall it may be — worked out from where
	 * the button sits, so a button parked anywhere never opens off-screen. */
	const [placement, setPlacement] = useState<Placement>({
		up: true,
		alignRight: false,
		shift: 0,
		height: 620,
	});

	/*
	 * `.landing-page` sets CSS `zoom` (0.9 at mid widths) and the WhatsApp button
	 * lives OUTSIDE it, so without this the chat button renders smaller than its
	 * twin — and, worse, a 40 px pointer move becomes a 36 px move on screen, so a
	 * drag lags behind the finger and stops short of the edge. Counter-zooming the
	 * wrapper by 1 / (ancestors' zoom) makes it 1:1 again, so the size matches
	 * WhatsApp and the pointer maths below are exact.
	 *
	 * The ANCESTORS' own `zoom` values are read, never the rendered size ratio:
	 * once corrected the ratio reads 1.0, and measuring it would undo the fix.
	 */
	const [counterZoom, setCounterZoom] = useState(1);

	/* The conversation. It survives closing the panel, so reopening picks up
	 * where the visitor left off; Start over resets it. */
	const [messages, setMessages] = useState<Message[]>([WELCOME]);
	const [chips, setChips] = useState<ChatChip[]>(ROLE_CHIPS);
	const [role, setRole] = useState<ChatRole | null>(null);
	const [typing, setTyping] = useState(false);
	const [draft, setDraft] = useState("");
	/** Topics already answered, so they are not offered again. */
	const asked = useRef(new Set<string>());
	/**
	 * What was said, in words, for the AI to follow a short follow-up ("and how
	 * do I sign it?"). A ref, not `messages`: a reply still "being typed" is
	 * already part of the conversation the visitor is answering.
	 */
	const turns = useRef<ChatTurn[]>([]);
	/** The last typed question the bot could not answer, for the WhatsApp message. */
	const nextId = useRef(1);
	/** Bubbles still "being typed" — flushed at once if the visitor speaks again. */
	const pending = useRef<{ timer: number; land: () => void }[]>([]);

	const panelId = useId();
	const inputId = useId();
	const wrapRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const logRef = useRef<HTMLDivElement>(null);
	const drag = useRef<DragState | null>(null);
	const swallowClick = useRef(false);
	const [viewport, setViewport] = useState({ w: 0, h: 0 });

	/* Re-measure on resize: the landing's zoom changes by breakpoint. */
	useEffect(() => {
		const sync = () => {
			let inherited = 1;
			for (let el = wrapRef.current?.parentElement; el; el = el.parentElement) {
				const z = Number.parseFloat(getComputedStyle(el).zoom);
				if (Number.isFinite(z) && z > 0) inherited *= z;
			}
			setCounterZoom(1 / inherited);
			setViewport({ w: window.innerWidth, h: window.innerHeight });
		};
		sync();
		window.addEventListener("resize", sync);
		return () => window.removeEventListener("resize", sync);
	}, []);

	/*
	 * A resize no longer sends a dragged button home (owner, 1 Oct: "it will
	 * remain to where the site user move"). Held by its nearest corner, it keeps
	 * its distance from that corner; it is only pulled back if the window has
	 * shrunk so far that it would sit off screen.
	 */
	useEffect(() => {
		const r = buttonRef.current?.getBoundingClientRect();
		if (!r || viewport.w === 0) return;
		setSpot((s) => clampSpot(s, r.width, r.height, viewport.w, viewport.h));
	}, [viewport]);

	/*
	 * Open the panel toward the side with more room, as tall as that room allows
	 * (620 px at most), and slide it along its edge so it never leaves the
	 * screen — a button parked mid-height used to open downward past the bottom.
	 */
	const place = useCallback(() => {
		const r = buttonRef.current?.getBoundingClientRect();
		if (!r) return;
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const panelW = Math.min(400, vw - 32);
		const roomAbove = r.top - 12 - EDGE;
		const roomBelow = vh - r.bottom - 12 - EDGE;
		const up = roomAbove >= roomBelow;
		const alignRight = r.left + r.width / 2 > vw / 2;
		const shift = alignRight
			? r.right - Math.min(Math.max(r.right, panelW + 16), vw - 16)
			: Math.min(Math.max(r.left, 16), vw - panelW - 16) - r.left;
		setPlacement({
			up,
			alignRight,
			shift,
			height: Math.max(Math.min(620, up ? roomAbove : roomBelow), 200),
		});
	}, []);

	/* Re-place an open panel when the window or the button moves. */
	// biome-ignore lint/correctness/useExhaustiveDependencies: `spot` and `viewport` move the button that `place` measures
	useEffect(() => {
		if (open) place();
	}, [open, spot, viewport, place]);

	/* Escape closes and returns focus to the button that opened the panel. */
	useEffect(() => {
		if (!open) return;
		const onKey = (e: globalThis.KeyboardEvent) => {
			if (e.key !== "Escape") return;
			setOpen(false);
			buttonRef.current?.focus();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open]);

	/* On open — and whenever a reply removes the chip that had focus — put
	 * keyboard focus on the first choice, so the conversation can be driven
	 * from the keyboard. Chips rather than the input: focusing an input on a
	 * phone throws the keyboard over the answer. */
	useEffect(() => {
		const panel = panelRef.current;
		if (!open || !panel || (!CHATBOT_URL && chips.length === 0)) return;
		const active = document.activeElement;
		const lost =
			!active || active === document.body || active === buttonRef.current;
		if (!lost) return;
		panel
			.querySelector<HTMLElement>("[data-chat-chip], iframe")
			?.focus({ preventScroll: true });
	}, [open, chips]);

	/*
	 * Keep the conversation in view the way a chat app does: while the reply to
	 * the latest question fits, follow the bottom; once it outgrows the panel,
	 * pin the QUESTION to the top, so a long answer is read from its first line
	 * instead of being scrolled past by the follow-up that lands after it.
	 * `messages`, `typing` and `chips` are listed because each one changes the
	 * log's height — the effect reads the DOM, not those values.
	 */
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-run on every change to the log's height (see above)
	useEffect(() => {
		const log = logRef.current;
		if (!open || !log) return;
		const questions = log.querySelectorAll<HTMLElement>('[data-msg="user"]');
		const question = questions[questions.length - 1];
		const replyTop = question ? question.offsetTop - 12 : 0;
		const top =
			question && log.scrollHeight - replyTop > log.clientHeight
				? replyTop
				: log.scrollHeight;
		log.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
	}, [open, messages, typing, chips]);

	/* Never leave a timer firing into an unmounted component. */
	useEffect(
		() => () => {
			for (const p of pending.current) window.clearTimeout(p.timer);
		},
		[],
	);

	/** Land every bubble still being typed, immediately and in order. */
	const flush = useCallback(() => {
		const queue = pending.current;
		pending.current = [];
		for (const p of queue) {
			window.clearTimeout(p.timer);
			p.land();
		}
	}, []);

	const push = useCallback((m: NewMessage) => {
		const id = nextId.current++;
		setMessages((list) => [...list, { ...m, id } as Message]);
		return id;
	}, []);

	/** Send a reply as a person would: a line, then the steps, then a question. */
	const deliver = useCallback(
		(reply: ChatReply, next: ChatChip[]) => {
			const answer = answerFor(reply, locale, c);
			turns.current.push({
				from: "assistant",
				text: [
					answer.text,
					...(answer.steps ?? []).map((s) => `${s.where}: ${s.what}`),
				].join("\n"),
			});
			const parts: { part: BubblePart; chars: number; nextId?: string }[] = [
				{ part: "text", chars: answer.text.length },
			];
			if (answer.steps?.length) {
				parts.push({
					part: "steps",
					chars: answer.steps.reduce((n, s) => n + s.what.length, 0) / 3,
				});
			}
			const offer = next.find((chip) => chip.kind === "topic");
			if (reply.kind === "intro") {
				parts.push({ part: "follow", chars: 60 });
			} else if (reply.kind === "topic" && offer?.kind === "topic") {
				parts.push({ part: "follow", chars: 40, nextId: offer.id });
			} else if (reply.kind === "ai" && reply.more && reply.locale === locale) {
				/* The AI's "tell me more", asked the same way a written answer offers
				 * its next topic. */
				parts.push({ part: "follow", chars: 40 });
			}

			setTyping(true);
			setChips([]);
			let at = 0;
			parts.forEach((p, i) => {
				at +=
					reply.kind === "ai"
						? aiBubbleGap(p.chars, i === 0)
						: typingDelay(p.chars);
				const isLast = i === parts.length - 1;
				const land = () => {
					push({ from: "bot", reply, part: p.part, nextId: p.nextId });
					if (isLast) {
						setTyping(false);
						setChips(next);
					}
				};
				const entry = {
					land,
					timer: window.setTimeout(() => {
						pending.current = pending.current.filter((q) => q !== entry);
						land();
					}, at),
				};
				pending.current.push(entry);
			});
		},
		[c, locale, push],
	);

	/* The AI question in flight, with the written answer to give it if it is cut
	 * short — a newer question or Start over must never leave it unanswered, and
	 * a slow answer must never land after the conversation has moved on. */
	const aiRequest = useRef<{
		ctl: AbortController;
		backup: WrittenReply;
		next: ChatChip[];
	} | null>(null);

	useEffect(() => () => aiRequest.current?.ctl.abort(), []);

	/** A question asked while the last is still being answered: the last one gets
	 * its written answer now, in order, before the new question shows. */
	const settlePending = () => {
		const previous = aiRequest.current;
		if (!previous) return;
		previous.ctl.abort();
		aiRequest.current = null;
		deliver(previous.backup, previous.next);
		flush();
	};

	/*
	 * EVERY reply comes from Gemini (owner, 1 Oct 2026: "the chatbot reply from
	 * the gemini api, no hardcoded"). Gemini is handed the whole knowledge base as
	 * its facts on each message, so editing `landing-chat-knowledge.ts` changes
	 * what it says straight away; nothing is trained. The keyword match still runs
	 * — it picks the role and the next suggestions, and its written answer is the
	 * BACKUP shown only when the AI cannot answer (no key, quota, Google down), so
	 * the chat never goes silent. While Gemini thinks, the typing dots show.
	 */
	const replyWithAi = (
		question: string,
		forRole: ChatRole | null,
		backup: WrittenReply,
		next: ChatChip[],
		typed: boolean,
	) => {
		const request = { ctl: new AbortController(), backup, next };
		aiRequest.current = request;
		setTyping(true);
		setChips([]);
		const history = turns.current.slice(-MAX_HISTORY_TURNS);
		turns.current.push({ from: "visitor", text: question });
		void askLandingAi(
			question,
			locale,
			forRole,
			history,
			request.ctl.signal,
		).then((ai) => {
			if (request.ctl.signal.aborted || aiRequest.current !== request) return;
			aiRequest.current = null;
			if (!ai) {
				deliver(backup, next);
				return;
			}
			/* A follow-up Gemini wrote in the other language (a 中文 question on the
			 * English page) is dropped rather than shown inside an English sentence. */
			const more = ai.more && fitsLocale(ai.more, locale) ? ai.more : undefined;
			const chips = withAiFollowUp(more, next, (chip) =>
				chipLabel(chip, locale, c),
			);
			deliver(
				{
					kind: "ai",
					question,
					typed,
					locale,
					answer: ai.answer,
					more,
					backup,
				},
				chips,
			);
		});
	};

	const ask = (text: string) => {
		const question = text.trim();
		if (!question) return;
		flush();
		settlePending();
		push({ from: "user", said: { kind: "text", text: question } });
		const u = understand(question, role, asked.current);
		setRole(u.role);
		if (u.reply.kind === "topic") asked.current.add(u.reply.id);
		replyWithAi(question, u.role, u.reply, u.next, true);
	};

	const pick = (chip: ChatChip) => {
		/* "Tell me more" is a question, asked as if typed. */
		if (chip.kind === "ask") {
			ask(chip.text);
			return;
		}
		flush();
		settlePending();
		push({ from: "user", said: chip });
		/* The button's own words are the question ("I run an agency"). */
		const question = chipLabel(chip, locale, c);
		if (chip.kind === "role") {
			setRole(chip.role);
			replyWithAi(
				question,
				chip.role,
				{ kind: "intro", role: chip.role },
				nextChips(chip.role, asked.current),
				false,
			);
			return;
		}
		asked.current.add(chip.id);
		replyWithAi(
			question,
			role,
			{ kind: "topic", id: chip.id },
			nextChips(role, asked.current),
			false,
		);
	};

	const onSubmit = (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		ask(draft);
		setDraft("");
	};

	const restart = () => {
		aiRequest.current?.ctl.abort();
		aiRequest.current = null;
		for (const p of pending.current) window.clearTimeout(p.timer);
		pending.current = [];
		asked.current = new Set();
		turns.current = [];
		setMessages([WELCOME]);
		setChips(ROLE_CHIPS);
		setRole(null);
		setTyping(false);
		setDraft("");
	};

	/** The WhatsApp text for one bubble — with THAT bubble's typed question, not
	 * whatever was typed last (an older bubble's link must not change). */
	const handoffMessage = (reply: ChatReply) => {
		const intro = {
			pr: c.prMsg,
			agency: c.agencyMsg,
			outlet: c.outletMsg,
			general: c.otherMsg,
		}[role ?? "general"];
		const asked =
			reply.kind === "fallback" || (reply.kind === "ai" && reply.typed)
				? reply.question
				: "";
		const q = asked.slice(0, MAX_QUESTION);
		return q ? `${intro}\n\n${c.questionMsg} ${q}` : intro;
	};

	const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
		if (e.button !== 0) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		drag.current = {
			startX: e.clientX,
			startY: e.clientY,
			rect: e.currentTarget.getBoundingClientRect(),
			moved: false,
		};
	};

	const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
		const d = drag.current;
		if (!d) return;
		const dx = e.clientX - d.startX;
		const dy = e.clientY - d.startY;
		if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
		d.moved = true;
		/* Clamp the button's own box to the viewport, then hold it by the
		 * corner it is now nearest to. */
		const left = Math.min(
			Math.max(d.rect.left + dx, EDGE),
			window.innerWidth - d.rect.width - EDGE,
		);
		const top = Math.min(
			Math.max(d.rect.top + dy, EDGE),
			window.innerHeight - d.rect.height - EDGE,
		);
		setSpot(spotFor(left, top, d.rect.width, d.rect.height));
	};

	const onPointerUp = (e: PointerEvent<HTMLButtonElement>) => {
		const d = drag.current;
		drag.current = null;
		if (e.currentTarget.hasPointerCapture(e.pointerId)) {
			e.currentTarget.releasePointerCapture(e.pointerId);
		}
		/* A real drag must not also toggle the panel when its click event follows. */
		if (d?.moved) swallowClick.current = true;
	};

	const toggle = () => {
		if (swallowClick.current) {
			swallowClick.current = false;
			return;
		}
		if (!open) place();
		setOpen((v) => !v);
	};

	const close = () => {
		setOpen(false);
		buttonRef.current?.focus();
	};

	const panelPosition: CSSProperties = {
		[placement.up ? "bottom" : "top"]: "calc(100% + 12px)",
		[placement.alignRight ? "right" : "left"]: placement.shift,
	};

	const renderBot = (m: Extract<Message, { from: "bot" }>) => {
		const answer = answerFor(m.reply, locale, c);
		const handoff = answer.handoff ? (
			<a
				href={whatsAppLink(handoffMessage(m.reply))}
				target="_blank"
				rel="noopener noreferrer"
				className="mt-3 inline-flex items-center gap-2 rounded-full px-4 py-2 transition-colors hover:bg-[rgba(242,198,107,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2c66b]"
				style={{
					border: "1px solid var(--hz-line-strong)",
					color: "var(--hz-gold)",
					fontSize: 13.5,
					textDecoration: "none",
				}}
			>
				<MessageCircle aria-hidden="true" className="size-4" />
				{c.whatsapp}
			</a>
		) : null;
		/* The AI label sits quietly under the answer; a written note (a caveat in
		 * the knowledge base) keeps its divider, since it is part of the answer. */
		const note = answer.note ? (
			m.reply.kind === "ai" ? (
				<p
					className="mt-3 flex items-center gap-1.5"
					style={{ fontSize: 11.5, color: "var(--hz-ink-dim)" }}
				>
					<Sparkles aria-hidden="true" className="size-3" />
					{answer.note}
				</p>
			) : (
				<p
					className="mt-3 pt-3"
					style={{
						borderTop: "1px solid var(--hz-line)",
						fontSize: 13,
						lineHeight: 1.5,
						color: "var(--hz-ink-dim)",
					}}
				>
					{answer.note}
				</p>
			)
		) : null;
		const hasSteps = Boolean(answer.steps?.length);

		if (m.part === "text") {
			const lead =
				m.reply.kind === "topic"
					? /* Chinese runs sentences together; English needs the space. */
						`${LEAD_INS[locale][m.id % LEAD_INS[locale].length]}${locale === "zh" ? "" : " "}`
					: "";
			return (
				<>
					<p>
						{lead}
						{emphasize(answer.text)}
					</p>
					{!hasSteps && note}
					{!hasSteps && handoff}
				</>
			);
		}
		if (m.part === "steps") {
			/* Owner, 1 Oct: "Payroll page" first, then the steps 1) 2) 3). Steps in
			 * the same place share one heading; the numbers run across the whole
			 * answer, so a reader always knows which step of the path they are on.
			 * An answer that is not a sequence (`ordered: false`) gets bullets. */
			const ordered = answer.ordered !== false;
			const role = answerRole(m.reply);
			const List = ordered ? "ol" : "ul";
			/* A path, not a list (owner, 2 Oct: "help me to design it"): one thin
			 * gold line runs down the left through every step's marker, each place
			 * is a gold label the steps hang under, and the numbers are gold
			 * coins — so the eye follows where to go, then what to do. */
			return (
				<>
					<div className="relative flex flex-col gap-3">
						<span
							aria-hidden="true"
							className="absolute"
							style={{
								left: 11,
								top: 14,
								bottom: 12,
								width: 1.5,
								borderRadius: 1,
								background:
									"linear-gradient(180deg, rgba(242,198,107,0.55), rgba(242,198,107,0.12))",
							}}
						/>
						{groupSteps(answer.steps ?? []).map((g) => (
							<div
								key={`${g.where}-${g.steps[0]?.n}`}
								className="relative flex flex-col gap-2"
							>
								<p className="pl-8">
									<span
										className="inline-flex items-center rounded-full px-2.5 py-0.5"
										style={{
											background: "rgba(242, 198, 107, 0.1)",
											border: "1px solid rgba(242, 198, 107, 0.35)",
											color: "var(--hz-gold)",
											fontSize: 12.5,
											fontWeight: 600,
											lineHeight: 1.5,
										}}
									>
										{placeHeading(g.where, role, locale)}
									</span>
								</p>
								<List className="flex flex-col gap-2">
									{g.steps.map((s) => (
										<li key={s.n} className="relative flex items-start gap-3">
											<span
												className="relative z-[1] flex shrink-0 items-center justify-center rounded-full tabular-nums"
												style={{
													width: 23,
													height: 23,
													marginTop: 0.5,
													background: ordered ? GOLD : "transparent",
													color: "#1a1207",
													fontSize: 12,
													fontWeight: 700,
												}}
											>
												{ordered ? (
													s.n
												) : (
													<span
														className="rounded-full"
														style={{
															width: 8,
															height: 8,
															background: "var(--hz-gold)",
														}}
													/>
												)}
											</span>
											<span style={{ fontSize: 14, lineHeight: 1.55 }}>
												{emphasize(s.what)}
											</span>
										</li>
									))}
								</List>
							</div>
						))}
					</div>
					{note}
					{handoff}
				</>
			);
		}
		const follow = FOLLOW_UPS[locale];
		const template = follow.topic[m.id % follow.topic.length];
		if (m.reply.kind === "ai" && m.reply.more && m.reply.locale === locale)
			return <p>{template.replace("{next}", m.reply.more)}</p>;
		if (m.reply.kind === "intro" || !m.nextId) return <p>{follow.intro}</p>;
		const nextChip = topicById(m.nextId)?.[locale].chip ?? "";
		return <p>{template.replace("{next}", nextChip)}</p>;
	};

	return (
		<div
			ref={wrapRef}
			/* WhatsApp's layer while closed; one above it while open, so a panel
			   that opens across the WhatsApp button is never covered by it. */
			className={`fixed ${open ? "z-[99999]" : "z-[99998]"}`}
			style={{
				[spot.h]: spot.x,
				[spot.v]: spot.y,
				zoom: counterZoom,
			}}
		>
			{open && (
				<div
					ref={panelRef}
					id={panelId}
					role="dialog"
					aria-modal="false"
					aria-label={c.panelLabel}
					className="absolute flex flex-col overflow-hidden"
					style={{
						...panelPosition,
						width: "min(400px, calc(100vw - 32px))",
						height: placement.height,
						background: "rgba(12, 11, 18, 0.95)",
						backdropFilter: "blur(var(--hz-glass-blur))",
						WebkitBackdropFilter: "blur(var(--hz-glass-blur))",
						border: "1px solid var(--hz-line-strong)",
						borderRadius: "var(--hz-radius)",
						boxShadow: "0 30px 80px -20px rgba(0, 0, 0, 0.8)",
						color: "var(--hz-ink)",
						fontFamily: "var(--hz-font-sans)",
					}}
				>
					<header
						className="flex shrink-0 items-center gap-3 px-5 py-4"
						style={{ borderBottom: "1px solid var(--hz-line)" }}
					>
						<span
							aria-hidden="true"
							className="flex size-9 shrink-0 items-center justify-center rounded-full"
							style={{ background: GOLD, color: "#1a1207" }}
						>
							<BotMessageSquare className="size-[18px]" />
						</span>
						<span className="min-w-0 flex-1">
							<span
								className="block truncate"
								style={{
									fontFamily: "var(--hz-font-display)",
									fontSize: 18,
									lineHeight: 1.2,
								}}
							>
								{c.title}
							</span>
							<span
								className="flex items-center gap-1.5 truncate"
								style={{ fontSize: 12, color: "var(--hz-ink-dim)" }}
							>
								<span
									aria-hidden="true"
									className="inline-block size-1.5 rounded-full"
									style={{ background: "var(--hz-success)" }}
								/>
								{typing ? `${c.typing}…` : c.subtitle}
							</span>
						</span>
						{!CHATBOT_URL && messages.length > 1 && (
							<button
								type="button"
								onClick={restart}
								aria-label={c.restart}
								title={c.restart}
								className="flex size-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2c66b]"
								style={{ color: "var(--hz-ink-dim)" }}
							>
								<RotateCcw className="size-4" />
							</button>
						)}
						<button
							type="button"
							onClick={close}
							aria-label={c.close}
							title={c.close}
							className="flex size-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2c66b]"
							style={{ color: "var(--hz-ink-dim)" }}
						>
							<X className="size-4" />
						</button>
					</header>

					{CHATBOT_URL ? (
						<iframe
							src={CHATBOT_URL}
							title={c.panelLabel}
							allow="microphone"
							className="min-h-0 w-full flex-1 border-0 bg-white"
						/>
					) : (
						<>
							<div
								ref={logRef}
								role="log"
								aria-live="polite"
								aria-relevant="additions"
								className="relative flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-5"
								style={{ overscrollBehavior: "contain" }}
							>
								{messages.map((m) =>
									m.from === "user" ? (
										<p
											key={m.id}
											data-msg="user"
											className="max-w-[85%] self-end rounded-2xl rounded-br-md px-4 py-2.5"
											style={{
												background: GOLD,
												color: "#1a1207",
												fontSize: 14.5,
												lineHeight: 1.45,
												fontWeight: 500,
												overflowWrap: "anywhere",
											}}
										>
											{m.said.kind === "text"
												? m.said.text
												: chipLabel(m.said, locale, c)}
										</p>
									) : (
										<div
											key={m.id}
											data-msg="bot"
											className="max-w-[90%] self-start rounded-2xl rounded-tl-md px-4 py-3"
											style={{
												background: "rgba(255, 255, 255, 0.045)",
												border: "1px solid var(--hz-line)",
												fontSize: 14.5,
												lineHeight: 1.55,
												overflowWrap: "anywhere",
											}}
										>
											{renderBot(m)}
										</div>
									),
								)}

								{typing && (
									<div
										data-msg="typing"
										className="flex items-center gap-1 self-start rounded-2xl rounded-tl-md px-4 py-3.5"
										style={{
											background: "rgba(255, 255, 255, 0.045)",
											border: "1px solid var(--hz-line)",
										}}
									>
										{/* Read out by the log's live region; the dots are decoration. */}
										<span className="sr-only">{c.typing}</span>
										{[0, 150, 300].map((delay) => (
											<span
												key={delay}
												aria-hidden="true"
												className="inline-block size-1.5 animate-bounce rounded-full motion-reduce:animate-none"
												style={{
													background: "var(--hz-gold)",
													animationDelay: `${delay}ms`,
												}}
											/>
										))}
									</div>
								)}

								{!typing && chips.length > 0 && (
									<div className="mt-1 flex flex-wrap gap-2">
										{chips.map((chip) => {
											const label = chipLabel(chip, locale, c);
											return (
												<button
													key={
														chip.kind === "role"
															? `role-${chip.role}`
															: chip.kind === "ask"
																? `ask-${chip.text}`
																: chip.id
													}
													type="button"
													data-chat-chip
													onClick={() => pick(chip)}
													className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-left transition-colors hover:bg-[rgba(242,198,107,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2c66b]"
													style={
														/* The AI's own "tell me more" is the recommended
														 * next step, so it is the one chip in gold. */
														chip.kind === "ask"
															? {
																	border: "1px solid rgba(242, 198, 107, 0.6)",
																	background: "rgba(242, 198, 107, 0.08)",
																	color: "var(--hz-gold)",
																	fontSize: 13.5,
																	lineHeight: 1.3,
																}
															: {
																	border: "1px solid var(--hz-line-strong)",
																	color: "var(--hz-ink)",
																	fontSize: 13.5,
																	lineHeight: 1.3,
																}
													}
												>
													{chip.kind === "ask" && (
														<Sparkles
															aria-hidden="true"
															className="size-3.5 shrink-0"
														/>
													)}
													{label}
												</button>
											);
										})}
									</div>
								)}
							</div>

							{/* Said BEFORE the first message (review, 1 Oct 2026): what is
							 * typed goes to Google's Gemini, so no personal details. */}
							<p
								className="shrink-0 px-4 pt-2 text-center"
								style={{
									borderTop: "1px solid var(--hz-line)",
									color: "var(--hz-ink-dim)",
									fontSize: 11.5,
									lineHeight: 1.4,
								}}
							>
								{c.aiDisclosure}
							</p>
							<form
								onSubmit={onSubmit}
								className="flex shrink-0 items-center gap-2 px-3 pt-2 pb-3"
							>
								<label htmlFor={inputId} className="sr-only">
									{c.placeholder}
								</label>
								<input
									id={inputId}
									value={draft}
									onChange={(e) => setDraft(e.target.value)}
									placeholder={c.placeholder}
									maxLength={MAX_QUESTION}
									autoComplete="off"
									enterKeyHint="send"
									className="min-w-0 flex-1 rounded-full px-4 py-2.5 placeholder:text-[var(--hz-ink-mute)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2c66b]"
									style={{
										background: "rgba(255, 255, 255, 0.05)",
										border: "1px solid var(--hz-line)",
										color: "var(--hz-ink)",
										/* 16 px, not less: iOS zooms the page into any
										 * smaller input on focus. */
										fontSize: 16,
									}}
								/>
								<button
									type="submit"
									disabled={!draft.trim()}
									aria-label={c.send}
									title={c.send}
									className="flex size-10 shrink-0 items-center justify-center rounded-full transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2c66b] disabled:opacity-40"
									style={{ background: GOLD, color: "#1a1207" }}
								>
									<SendHorizontal aria-hidden="true" className="size-[18px]" />
								</button>
							</form>
						</>
					)}
				</div>
			)}

			{/* Closed: a round, icon-only bot — the same 56 px circle as WhatsApp
			    (owner, 1 Oct: "make one round bot logo", "remove the 'Chat with
			    us'"); its name lives in aria-label so a screen reader still hears
			    it. Open: a pill reading "✕ Cancel" (owner, 1 Oct), so how to close
			    is spelled out — the visible word IS the name then, no aria-label. */}
			<button
				ref={buttonRef}
				type="button"
				aria-label={open ? undefined : c.open}
				title={open ? undefined : c.open}
				aria-expanded={open}
				aria-controls={open ? panelId : undefined}
				onClick={toggle}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={() => {
					drag.current = null;
				}}
				className="hz-btn hz-btn-gold select-none justify-center whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f2c66b] focus-visible:ring-offset-2 focus-visible:ring-offset-[#07070a]"
				style={{
					height: BUTTON_HEIGHT,
					...(open
						? { padding: "0 22px 0 18px", gap: 8 }
						: { width: BUTTON_HEIGHT, padding: 0 }),
					touchAction: "none",
				}}
			>
				{open ? (
					<>
						<X aria-hidden="true" className="size-5" />
						{c.cancel}
					</>
				) : (
					<BotMessageSquare aria-hidden="true" className="size-7" />
				)}
			</button>
		</div>
	);
}
