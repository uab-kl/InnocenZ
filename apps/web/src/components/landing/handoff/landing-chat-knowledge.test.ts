import { describe, expect, it } from "vitest";
import {
	type ChatChip,
	type ChatRole,
	fitsLocale,
	MAX_CHIPS,
	topicById,
	understand,
	withAiFollowUp,
} from "./landing-chat-knowledge";

const label =
	(locale: "en" | "zh") =>
	(chip: ChatChip): string =>
		chip.kind === "ask"
			? chip.text
			: chip.kind === "topic"
				? (topicById(chip.id)?.[locale].chip ?? "")
				: chip.role;

const written: ChatChip[] = [
	{ kind: "topic", id: "gen-what" },
	{ kind: "topic", id: "gen-tracking" },
	{ kind: "role", role: "pr" },
];

describe("the written backup's manners (shown when Gemini cannot answer)", () => {
	const kindOf = (text: string) => {
		const r = understand(text, null, new Set()).reply;
		return r.kind === "small" ? r.id : r.kind;
	};

	it("meets insults and slurs with a calm request, never a greeting (2 Oct screenshot)", () => {
		for (const t of [
			"are you stupid",
			"im your nigga",
			"fuck you stupid bot",
			"you're useless lah",
			"你好笨",
			"你是傻逼",
		])
			expect(kindOf(t)).toBe("rude");
	});

	it("never reads an ordinary question as rude — whole words only", () => {
		for (const t of [
			"how do I check in for my shift?",
			"my shift starts at 9, where do I check in",
			"the pay this week looks dumb low",
			"can I swap shifts with a friend",
			"怎么签到？",
			// red team, 2 Oct 2026 — names, dress codes, Manglish, 中文 look-alikes
			"my PR Dick Tan cannot see his shift",
			"Pussy Cat Lounge how to register as outlet",
			"outlet want sexy dress code for PR, can set?",
			"sorry stupid question",
			"best sial",
			"我妈的生日那天可以请假吗",
			"app点进去死机了，签到不了",
			"你好，我太笨了，不知道怎么签到",
			"你看垃圾邮件有没有OTP",
		])
			expect(kindOf(t)).not.toBe("rude");
	});

	it("answers a frustrated question instead of scolding it", () => {
		for (const t of [
			"this is shit why cannot check in",
			"wtf my pay still not in",
			"you guys useless ah, my pay never come in",
			"babi this week no shift",
			"knn 又login不到",
		])
			expect(["rude", "offtopic", "who"]).not.toContain(kindOf(t));
	});

	it("still catches disguised and Manglish abuse", () => {
		for (const t of [
			"f u c k you bot",
			"stup1d bot",
			"motherfucker",
			"cibai",
			"go die",
			"草泥马",
			"笨蛋",
		])
			expect(kindOf(t)).toBe("rude");
	});

	it("keeps 'what are you guys charging' and 'talk to a real person' as questions", () => {
		expect(kindOf("what are you guys charging for outlets")).not.toBe("who");
		expect(kindOf("can I talk to a real person")).not.toBe("who");
		expect(kindOf("what's your name")).toBe("who");
		expect(kindOf("好贵")).not.toBe("ok");
		expect(kindOf("好")).toBe("ok");
	});

	it("introduces itself, and redirects off-topic chat without a WhatsApp hand-off", () => {
		expect(kindOf("who are you")).toBe("who");
		expect(kindOf("are you a real person?")).toBe("who");
		expect(kindOf("we are family")).toBe("offtopic");
		expect(kindOf("tell me a joke")).toBe("offtopic");
		expect(kindOf("how do I change my bank account number")).not.toBe(
			"offtopic",
		);
	});

	it("keeps a 中文 follow-up out of an English sentence", () => {
		expect(fitsLocale("什么是 InnocenZ？", "en")).toBe(false);
		expect(fitsLocale("What is InnocenZ?", "en")).toBe(true);
		expect(fitsLocale("什么是 InnocenZ？", "zh")).toBe(true);
	});
});

describe("the written backup understands how people really ask (3 Oct 2026)", () => {
	it("knows pay and payment — and the Manglish, Malay and 中文 ways to say things", () => {
		const cases: [string, string][] = [
			["payment", "pr-pay"],
			["payments", "pr-pay"],
			["bila gaji masuk", "pr-pay"],
			["几时出粮", "pr-pay"],
			["cuti", "pr-leave"],
			["demam tak boleh kerja", "pr-leave"],
			["punch in", "pr-checkin"],
			// can't punch in → the check-in troubleshooting section (3 Oct check-in rule)
			["打不到卡", "ref-pr-checkin-trouble"],
			["pay slip", "pr-sign"],
			["two agency", "pr-agencies"],
			["underpaid", "pr-dispute"],
			["工资少了", "pr-dispute"],
			["muat turun aplikasi", "pr-app"],
			["syif saya", "pr-shifts"],
		];
		for (const [text, id] of cases) {
			const r = understand(text, "pr", new Set()).reply;
			const got = r.kind === "topic" || r.kind === "reference" ? r.id : r.kind;
			expect(got, text).toBe(id);
		}
	});

	it("answers OT from the asker's side — PR pay, agency approval, outlet rate", () => {
		const cases: [string, ChatRole | null, string][] = [
			["how they calculate my OT?", "pr", "ref-pr-overtime"],
			["boleh claim OT tak", "pr", "ref-pr-overtime"],
			["加班怎么算", "pr", "ref-pr-overtime"],
			["where to approve OT claims", "agency", "ref-agency-overtime"],
			["approve ot", null, "ref-agency-overtime"],
			["加班怎么审批", null, "ref-agency-overtime"],
			["OT rate per hour", "outlet", "ref-outlet-rate-card"],
			["what is the OT rate for tier 3", null, "ref-outlet-rate-card"],
			["do i get overtime", null, "ref-pr-overtime"],
		];
		for (const [text, role, id] of cases) {
			const r = understand(text, role, new Set()).reply;
			expect(r.kind === "reference" ? r.id : r.kind, text).toBe(id);
		}
		// "not" and "got" contain "ot" — only the whole word counts
		expect(understand("not paid yet", null, new Set()).reply.kind).not.toBe(
			"reference",
		);
	});

	it("answers MC and leave from the asker's side and intent", () => {
		const cases: [string, ChatRole | null, string][] = [
			["how to apply MC", "pr", "pr-leave"],
			["怎么请病假", "pr", "pr-leave"],
			["my MC approved already?", "pr", "ref-pr-mc-after"],
			["请假批准了吗", "pr", "ref-pr-mc-after"],
			["kena fine for MC?", "pr", "ref-pr-penalties"],
			["plan my off day in advance", "pr", "ref-pr-unavailable-days"],
			["where to approve MC", "agency", "ref-agency-mc-decision"],
			["病假怎么审批", null, "ref-agency-mc-decision"],
			["set max MC per month rule", "agency", "ref-agency-penalty-rules"],
			["PR MC tonight who will replace", "agency", "ref-agency-backfill"],
			["PR on MC tonight", "outlet", "ref-agency-backfill"],
			["can i see the PR MC photo", "outlet", "ref-shared-privacy-outlet"],
		];
		for (const [text, role, id] of cases) {
			const r = understand(text, role, new Set()).reply;
			const got = r.kind === "reference" || r.kind === "topic" ? r.id : r.kind;
			expect(got, text).toBe(id);
		}
		// leaving an AGENCY is a different question
		const away = understand("how to leave my agency", "pr", new Set()).reply;
		expect(away.kind === "topic" ? away.id : away.kind).toBe("pr-agencies");
	});

	it("answers check-in situations from the asker's side", () => {
		const cases: [string, ChatRole | null, string][] = [
			["how do i check in", "pr", "pr-checkin"],
			["cannot check in too far", "pr", "ref-pr-checkin-trouble"],
			["签不到怎么办", "pr", "ref-pr-checkin-trouble"],
			["tak boleh check in", "pr", "ref-pr-checkin-trouble"],
			["why cant i check out", "pr", "ref-pr-cant-checkout"],
			["忘了签退", "pr", "ref-pr-forgot-checkout"],
			["missed my shift", "pr", "ref-pr-missed-shift"],
			["i am late 10 minutes", "pr", "ref-pr-wage"],
			["my PR didnt come tonight", "agency", "ref-agency-no-show"],
			["where did my PR check in", "agency", "ref-agency-checkin-labels"],
			["deduct pay for no show", "agency", "ref-agency-penalty-rules"],
			["how to set the check in pin", "outlet", "ref-outlet-pin-setup"],
			["who checked in tonight", "outlet", "ref-outlet-pr-status"],
			["can i fine PR who come late", "outlet", "ref-outlet-no-penalties"],
		];
		for (const [text, role, id] of cases) {
			const r = understand(text, role, new Set()).reply;
			const got = r.kind === "reference" || r.kind === "topic" ? r.id : r.kind;
			expect(got, text).toBe(id);
		}
		// privacy questions keep the tracking answer
		for (const t of [
			"is my gps always on",
			"can agency see my location 24 hours",
		]) {
			const r = understand(t, null, new Set()).reply;
			expect(r.kind === "topic" ? r.id : r.kind, t).toBe("gen-tracking");
		}
	});

	it("answers a specific question from the section that asks it — the broad topic keeps the general ones", () => {
		const cases: [string, ChatRole | null, string][] = [
			// specific → the verified section whose title asks it
			[
				"how much will i kena charge if i cancel tonight shift",
				"pr",
				"ref-pr-cancel-fee",
			],
			[
				"why the sign button not working on my voucher",
				"pr",
				"ref-pr-cant-sign",
			],
			[
				"what does pending vs approved mean on my payment page",
				"pr",
				"ref-pr-day-status",
			],
			["how to change my password in the app", "pr", "ref-pr-security"],
			// general or vague → the hand-written topic (judged better)
			["post job", "outlet", "ou-postjob"],
			["how do i sign my weekly voucher", "pr", "pr-sign"],
			["can i join 2 agency", "pr", "pr-agencies"],
			// side not said → the answer for everyone, not one side's version
			["does innocenz pay the PRs?", null, "gen-money"],
		];
		for (const [text, role, id] of cases) {
			const r = understand(text, role, new Set()).reply;
			const got = r.kind === "reference" || r.kind === "topic" ? r.id : r.kind;
			expect(got, text).toBe(id);
		}
	});

	it("never answers chit-chat with a random reference section", () => {
		for (const t of ["holiday plan to bali", "solve this math problem"]) {
			expect(understand(t, null, new Set()).reply.kind, t).not.toBe(
				"reference",
			);
		}
	});
});

describe("withAiFollowUp", () => {
	it("never shows the same question twice (the off-topic screenshot, 2 Oct 2026)", () => {
		const chips = withAiFollowUp("What is InnocenZ?", written, label("en"));
		const labels = chips.map(label("en"));
		expect(labels[0]).toBe("What is InnocenZ?");
		expect(chips[0].kind).toBe("ask");
		expect(new Set(labels).size).toBe(labels.length);
		expect(labels).toContain("Does it track PRs?");
	});

	it("matches the same question in 中文 despite spacing and a half-width ?", () => {
		expect(topicById("gen-what")?.zh.chip).toBe("InnocenZ 是什么？");
		const labels = withAiFollowUp("InnocenZ是什么?", written, label("zh")).map(
			label("zh"),
		);
		expect(labels.filter((l) => l.includes("是什么"))).toHaveLength(1);
	});

	it("keeps a different question first and still caps the row", () => {
		const many: ChatChip[] = [
			...written,
			{ kind: "role", role: "agency" },
			{ kind: "role", role: "outlet" },
		];
		const chips = withAiFollowUp("How do I get paid?", many, label("en"));
		expect(chips).toHaveLength(MAX_CHIPS);
		expect(chips[0]).toEqual({ kind: "ask", text: "How do I get paid?" });
		expect(chips[1]).toEqual({ kind: "topic", id: "gen-what" });
	});

	it("leaves the written chips alone when the AI offers no follow-up", () => {
		expect(withAiFollowUp(undefined, written, label("en"))).toBe(written);
	});
});
