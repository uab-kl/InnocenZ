/**
 * How the chat's WRITTEN backup reads manners — abuse, "who are you?" and
 * plainly off-topic chat. The backup answers whenever Gemini cannot (no key,
 * or the free key's 500-a-day cap is used up), so it needs the same manners
 * (owner, 2 Oct 2026: "are you stupid" was answered "I'm not sure … ask our
 * team on WhatsApp").
 *
 * Red-teamed the same day with ~390 messages in English, Manglish and 中文.
 * The rules that came out of it:
 *  - Only the truly abusive is ALWAYS rude: slurs, sexual requests, threats and
 *    the strongest Hokkien/Cantonese swears.
 *  - Swearing and insults give way to a real question — "this is shit why
 *    cannot check in" and "wtf my pay still not in" get their answer; only
 *    abuse with nothing to answer is asked to keep it respectful.
 *  - An insult counts only when AIMED ("you stupid", "this app useless"), never
 *    "stupid question", "best sial", a name (Dick Tan, Moby Dick) or a dress
 *    code ("sexy").
 *  - Disguises are undone for this check only ("f u c k", "stup1d", "f*ck").
 *  - Whole words only: the topic matcher forgives a letter, which would read
 *    "shift" as "shit".
 */

const CJK = /[㐀-鿿豈-﫿]/;

const LEET: Record<string, string> = {
	"0": "o",
	"1": "i",
	"3": "e",
	"4": "a",
	"5": "s",
	"7": "t",
	"8": "b",
	"@": "a",
	$: "s",
};

/** A de-disguised copy of the message, read ONLY by the abuse check. */
export function rudeForm(text: string): string {
	return (
		text
			.toLowerCase()
			// f*ck, f**k, sh*t, b*tch
			.replace(/\bf[*#]+c?k/g, "fuck")
			.replace(/\bsh[*#!]+t/g, "shit")
			.replace(/\bb[*#!]+tch/g, "bitch")
			// letters and digits mixed in one word: stup1d, b0d0h, n1gga, dumb@ss
			.replace(/[a-z0-9@$]+/g, (w) =>
				/[a-z]/.test(w) && /[0-9@$]/.test(w)
					? w.replace(/[0134578@$]/g, (c) => LEET[c] ?? c)
					: w,
			)
			// f u c k, s.t.u.p.i.d — three or more single letters in a row
			.replace(/\b[a-z](?:[\s._*-]+[a-z]\b){2,}/g, (m) =>
				m.replace(/[\s._*-]/g, ""),
			)
			// fuckkk, fuuuck
			.replace(/([a-z])\1{2,}/g, "$1")
	);
}

/** Always rude, whatever else the message asks. */
const HARD = new Set([
	"nigga",
	"niggas",
	"nigger",
	"niggers",
	"slut",
	"whore",
	"boobs",
	"porn",
	"blowjob",
	"horny",
	"motherfucker",
	"dickhead",
	"shithead",
	"cibai",
	"chibai",
	"cipai",
	"kanina",
	"kannina",
	"kaninabu",
	"lanjiao",
	"lanjiau",
	"lancau",
	"nabei",
	"pundek",
	"sohai",
	"kimak",
	"pukimak",
	"puki",
	"cnm",
	"nmsl",
	"bangsat",
]);
const HARD_PHRASES =
	/\b(kill|rape|bunuh) (you|u|kau|lu)\b|\bgo (die|mati)\b|\bdiu (lei|nei|ni|lou)\b|\bhave sex\b|\bsex with (me|you|u)\b|\bsend (me )?(nudes?|sexy (pics?|photos?)|nude (pics?|photos?))\b|\b(sexy|nude|naked) (pics?|photos?|selfies?|videos?)\b|\bsuck my\b/;
/* 去死 not inside 进去死机 (the app crashed); 操你 is abuse, 操作 is not. */
const HARD_ZH =
	/草泥马|你妈死|去你的|贱人|婊子|鸡巴|约炮|做爱|杀了你|弄死你|操你|傻逼|煞笔|^滚+[!！。.]*$|(?<![进出下回过])去死(?![机活])/;

/** Swearing — rude only when there is no question to answer. */
const SWEARS = new Set([
	"fuck",
	"fucking",
	"fuckin",
	"fucked",
	"fucker",
	"fk",
	"fuk",
	"fck",
	"fcuk",
	"fvck",
	"phuck",
	"wtf",
	"stfu",
	"shit",
	"shitty",
	"bullshit",
	"knn",
	"ccb",
	"babi",
	"bitch",
	"bastard",
	"asshole",
]);
const SWEAR_PHRASES =
	/\bshut up\b|\bgo to hell\b|\bwhat the hell\b|\bkepala (bapak|hotak|otak)\b|\bhate (you|u)\b|^\s*s\W?b\W*$/;
/* 他妈 not 他妈妈 (his mother); 妈的 not 我妈的 (my mum's); 垃圾 not 垃圾邮件 (spam). */
const SWEAR_ZH =
	/白痴|弱智|废物|蠢货|笨蛋|他妈(?!妈)|(?<![我她你他妈])妈的|你[^我们]{0,3}(笨|蠢|傻|垃圾(?!邮件|箱|桶))|(机器人|bot|app|公司|平台|系统)(真|好|很|太)?(是)?(蠢|笨|傻|垃圾)|垃圾(app|机器人|公司|平台|系统)/;

/** Insults — rude only when aimed at someone (or the whole message is one). */
const INSULTS = new Set([
	"stupid",
	"idiot",
	"dumb",
	"dumbass",
	"moron",
	"retard",
	"retarded",
	"useless",
	"bodoh",
	"bodo",
	"bangang",
	"bengap",
	"trash",
	"rubbish",
	"sial",
	"sexy",
	"dick",
	"cock",
	"pussy",
]);
const TARGETS = new Set([
	"you",
	"u",
	"ur",
	"youre",
	"yourself",
	"bot",
	"chatbot",
	"lu",
	"kau",
	"awak",
	"app",
	"system",
	"company",
]);
const NOT_AIMED_NEXT = new Set(["question", "questions", "qn", "q"]);

/** The message also asks something — then the question is answered. */
const ASKING =
	/[?？]|\b(how|why|what|when|where|which|can|cannot|cant|not|never|nvr|still|wrong|stuck|fail|failed|error|problem|issue|bug|missing|gone|late|help|forgot|forget|lost|no|tak|takde|xde|tiada)\b|吗|怎么|为什么|如何|哪|什么|不到|不了|不能|没|多少|几|错|少了|忘|帮/;

export interface Manners {
	/** Slur, sexual request or threat: always asked to keep it respectful. */
	hard: boolean;
	/** Swearing or an aimed insult: respectful reply only if nothing is asked. */
	soft: boolean;
	/** The message carries a question as well. */
	asking: boolean;
}

export function mannersOf(text: string): Manners {
	const t = rudeForm(text);
	const words = t.split(/[^a-z0-9]+/).filter(Boolean);
	const aimed = words.some((w, i) => {
		if (!INSULTS.has(w) || NOT_AIMED_NEXT.has(words[i + 1] ?? "")) return false;
		const near = words.slice(Math.max(0, i - 2), i + 3);
		const alone = words.length <= 2 && w !== "sial" && !CJK.test(text);
		return alone || near.some((n) => TARGETS.has(n));
	});
	return {
		hard:
			words.some((w) => HARD.has(w)) ||
			HARD_PHRASES.test(t) ||
			HARD_ZH.test(text),
		soft:
			words.some((w) => SWEARS.has(w)) ||
			SWEAR_PHRASES.test(t) ||
			aimed ||
			SWEAR_ZH.test(text),
		asking: ASKING.test(text.toLowerCase()),
	};
}

/** Words dropped before topic matching, so "piece of shit" never reads as "shift". */
export function isAbuseWord(word: string): boolean {
	return HARD.has(word) || SWEARS.has(word) || INSULTS.has(word);
}

/*
 * "Who are you?" — exact forms only, so "what are you guys charging?" and
 * "can I talk to a real person?" stay questions about InnocenZ.
 */
const WHO_IS_IT = [
	/\bwho (are|r) (you|u)\b/,
	/\bwhat (are|r) (you|u)\b(?! (guys |all |ppl |people )?(charging|charge|offering|offer|selling|doing|providing|using|got|have))/,
	/\b(are|r) (you|u) (a |an )?(bot|robot|ai|human|machine|chatbot|chatgpt|gpt|gemini)\b/,
	/\b(are|r) (you|u) (a )?real( person| human)?\W*(ah|ar|lah|leh)?\W*$/,
	/\bwhat(['’]?s| is) (your|ur) name\b/,
	/\bwho (made|built|created|developed|trained) (you|u|this bot)\b/,
	/\bwhat model are (you|u)\b/,
	/你是谁|你是(不是)?(机器人|真人|ai|人)|你叫什么|谁(做|开发|创造|造|写)了?你(?!们)|你是(chatgpt|gpt|gemini|siri|claude)/,
];

export function asksWhoItIs(text: string): boolean {
	const t = text.toLowerCase();
	return WHO_IS_IT.some((r) => r.test(t));
}

/*
 * Plainly off-topic subjects, checked before the topics — whose keywords
 * ("today", "tonight", 今天) would otherwise answer "what's the weather today"
 * with the shifts guide. Only when the message names nothing of InnocenZ's.
 */
export const OFF_TOPIC =
	/\b(weather|joke|jokes|poem|song|sing|football|homework|recipe|movie|prime minister)\b|唱.{0,2}歌|笑话|天气|几岁|喜欢我|爱我|作业|首相|总理|好吃|餐厅|电影|等于几|足球|股票|彩票/;
