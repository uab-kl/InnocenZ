import type { LandingLocale } from "@/lib/landing-i18n";
import {
	asksWhoItIs,
	isAbuseWord,
	mannersOf,
	OFF_TOPIC,
} from "./landing-chat-manners";
import {
	CHAT_REFERENCE,
	type ReferenceSection,
} from "./landing-chat-reference";

/*
 * What the landing-page chat knows, and how it understands a typed question.
 * Owner, 1 Oct 2026: "just reply what InnocenZ have, What InnocenZ can really
 * help with" — and "be smart … trigger what user say keywords then reply what
 * user need".
 *
 * WHY A KNOWLEDGE BASE AND NOT A LANGUAGE MODEL. A model improvises, and an
 * improvised feature on a sales page is a promise the product cannot keep.
 * Every answer below was written from the code: the tab and page names are the
 * real labels (PR app `nav` in apps/mobile i18n — the Shifts screen's tab is
 * labelled "Today"; portal sidebar in portal-i18n `nav`), and the behaviour is
 * what those screens do. The "smart" part is the matcher at the bottom: it
 * reads English and 中文, forgives plurals and one-letter typos, notices
 * "I run a bar" / "我是PR" and switches the conversation to that role, and
 * says it does not know rather than guessing.
 *
 * DELIBERATELY LEFT OUT, because it is not live or not proven:
 *   - receipt scan and venue swap (Beta), subscription prices (Beta);
 *   - the outlet Ratings PAGE (hidden from the menu) — rating a PR from Today →
 *     PR tonight IS live and reaches the supplying agency (re-checked 2 Oct 2026);
 *   - how auto-assign is built — the roster banner is LABELLED "AI auto-assign"
 *     (中文 AI 智能派班), so answers use that label and say what it does (it
 *     proposes; nothing is saved until the agency confirms), never "no AI";
 *   - selfie check-in, push notifications, Bahasa Melayu, and anything that
 *     implies InnocenZ moves money: the agency pays from its own bank;
 *   - a "Payout" bank file — the panel exists in code but is mounted nowhere
 *     (only its test imports it); signed vouchers wait under Payroll → Payment
 *     Week → To pay, and the agency presses Mark as paid;
 *   - "Sign up" at the top of the landing — there is only Login; sign-up is
 *     the login page's "Sign up as Outlet or PR Agency".
 *
 * Every page, tab and button name was audited against the real i18n labels in
 * BOTH languages on 1 Oct 2026 (92 corrections): the 中文 answers name the 中文
 * labels (工作区, 发布职位, 审阅并签名 …), never the English ones.
 *   - an app-store link — none exists in the repo, so no answer says "download
 *     it from the App Store".
 */

export type ChatRole = "pr" | "agency" | "outlet" | "general";

export interface ChatStep {
	/**
	 * Where this happens — the REAL tab or page name in the language of the
	 * answer, so a visitor can find it on screen. Consecutive steps with the
	 * same `where` are grouped under one heading ("Payroll page"), then numbered.
	 */
	where: string;
	what: string;
}

export interface ChatAnswer {
	text: string;
	steps?: ChatStep[];
	/**
	 * false when the steps are NOT a sequence — alternatives or a list of
	 * facts ("what InnocenZ can't do") — so they get bullets, not 1) 2) 3).
	 */
	ordered?: boolean;
	note?: string;
	/** Offer the WhatsApp button under this answer. */
	handoff?: boolean;
}

interface Localised {
	chip: string;
	answer: ChatAnswer;
}

export interface ChatTopic {
	id: string;
	/** "any" topics answer whichever role the conversation is about. */
	role: ChatRole | "any";
	/** English words/phrases and 中文 strings — see `understand`. */
	keywords: string[];
	en: Localised;
	zh: Localised;
}

/* ------------------------------------------------------------------ intros -- */

export const CHAT_INTROS: Record<
	LandingLocale,
	Record<ChatRole, ChatAnswer>
> = {
	en: {
		pr: {
			text: "Welcome! As a PR, everything is in the InnocenZ phone app — your shifts, your check-in and your weekly pay. Here's how it works:",
			steps: [
				{
					where: "Your phone",
					what: "You need a smartphone with the InnocenZ app. Ask your agency for it, or message us and we'll help. Open it and tap Create an account.",
				},
				{
					where: "Profile",
					what: "Tap Edit profile, pick the agencies you work with under Agencies, then Save profile. Each agency approves you and sets your tier.",
				},
				{
					where: "Today",
					what: "See your shifts. In Agency schedule you can also mark a day unavailable or send an MC.",
				},
				{
					where: "Check-In",
					what: "At the venue, tap check in. It only works inside the venue's check-in fence (50 m by default), so your attendance is proven. Check out when you finish.",
				},
				{
					where: "Payment",
					what: "Your week, Sunday to Saturday: daily wages, drinks, tips and others. Tap any amount to see the proof behind it.",
				},
				{
					where: "Payment",
					what: "When your weekly voucher is ready, open Last week, tap Review & sign and sign it with your finger.",
				},
			],
		},
		agency: {
			text: "Welcome! Your agency runs on one web portal — roster, attendance, approvals and weekly payroll. Here's the path:",
			steps: [
				{
					where: "Login",
					what: "Tap Login at the top of this page, then tap “Sign up as Outlet or PR Agency” on the login page and choose PR Agency — or message us for a demo first.",
				},
				{
					where: "Settings",
					what: "Until the InnocenZ team approves your sign-up, the portal shows only Settings — you get an email when everything opens.",
				},
				{
					where: "Manage PR",
					what: "Your PRs and their tier. New PRs who ask to join arrive in Approvals.",
				},
				{
					where: "Roster",
					what: "Plan the week. AI auto-assign proposes who goes where — nothing is saved until you confirm — and the roster refuses clashes such as a full shift or a PR's blocked day.",
				},
				{
					where: "Approvals",
					what: "New PRs and PRs asking to leave, MC and leave, venues asking to partner or to cut staff on a quiet night, and staff asking to join your team.",
				},
				{
					where: "Payroll",
					what: "Every Sunday at 2 a.m. each PR's voucher for the Sunday–Saturday week is built for you. Review, sign, and send it to the PR to sign.",
				},
				{
					where: "Payroll → Payment Week",
					what: "Signed vouchers wait here under To pay. Pay each PR from your bank, then press Mark as paid — you can add the bank reference.",
				},
			],
		},
		outlet: {
			text: "Welcome! Your outlet gets one web portal to book PRs, see who's really at your door tonight, and read your numbers. Here's the path:",
			steps: [
				{
					where: "Login",
					what: "Tap Login at the top of this page, then tap “Sign up as Outlet or PR Agency” on the login page and choose Outlet — or message us for a demo first.",
				},
				{
					where: "Settings",
					what: "Until the InnocenZ team approves your sign-up, the portal shows only Settings — you get an email when everything opens.",
				},
				{
					where: "Settings → Attendance",
					what: "Pin your venue and set the check-in fence — 10 m to 1,000 m, 50 m by default.",
				},
				{
					where: "Workspace",
					what: "Set your rate card per tier and your drinks price list.",
				},
				{
					where: "Settings → Agency Partnerships",
					what: "Ask the agencies you work with to partner with you; Post Job opens once one accepts.",
				},
				{
					where: "Post Job",
					what: "Book PRs: the dates and how many of each tier you need.",
				},
				{
					where: "Today",
					what: "Tonight's line-up, live — who is booked, on duty or checked out.",
				},
				{
					where: "Reports",
					what: "Your net sales and margin.",
				},
			],
		},
		general: {
			ordered: false,
			text: "Sure! In short, InnocenZ connects the three people behind a nightlife shift — the outlet, the agency and the PR — from the check-in at the door to the signed weekly pay. Here's who uses what, and where:",
			steps: [
				{
					where: "PR · phone app",
					what: "See shifts, check in at the venue, see every ringgit and sign the weekly voucher.",
				},
				{
					where: "Agency · web portal",
					what: "Roster, approvals and weekly payroll — from check-in to the signed voucher.",
				},
				{
					where: "Outlet · web portal",
					what: "Book PRs, watch tonight's line-up, set rates, read reports.",
				},
				{
					where: "Start here",
					what: "Agencies and outlets: tap Login at the top of this page — new here? Tap “Sign up as Outlet or PR Agency” on the login page. PRs get the app from their agency.",
				},
			],
			note: "What InnocenZ doesn't do: move money (the agency pays), track anyone, assign PRs without the agency confirming, or check people in by selfie.",
		},
	},
	zh: {
		pr: {
			text: "欢迎！作为 PR，一切都在 InnocenZ 手机 App 里 — 你的班表、签到和每周薪资。用法如下：",
			steps: [
				{
					where: "你的手机",
					what: "需要一部装有 InnocenZ App 的智能手机。向你的经纪公司索取，或联系我们帮你开通。打开后点「创建账号」。",
				},
				{
					where: "我的",
					what: "点「编辑资料」，在「经纪公司」里选择你合作的经纪公司，再点「保存资料」。每家公司审核通过后为你设定等级。",
				},
				{
					where: "今日",
					what: "查看你的班。在「经纪排班」里也可以标记不可接班的日子或提交病假。",
				},
				{
					where: "签到",
					what: "到场后点签到。只有在场所的签到范围内（默认 50 米）才能签到，出勤有据可查。下班时签退。",
				},
				{
					where: "结算",
					what: "你的一周（周日至周六）：日薪、酒水、小费和其他。点任何金额都能看到背后的证据。",
				},
				{
					where: "结算",
					what: "每周结算单准备好后，打开「上周」，点「审阅并签名」，用手指签名。",
				},
			],
		},
		agency: {
			text: "欢迎！你的经纪公司在一个网页后台运作 — 排班、出勤、审批和每周薪资。流程如下：",
			steps: [
				{
					where: "登录",
					what: "点本页顶部的「登录」，在登录页点「注册为门店或 PR 经纪公司」，账户类型选「PR 代理」 — 或先联系我们预约演示。",
				},
				{
					where: "设置",
					what: "InnocenZ 团队审核通过前，门户只显示「设置」— 开通后会收到邮件。",
				},
				{
					where: "PR 管理",
					what: "你的 PR 和他们的等级。申请加入的新 PR 会出现在「审批」。",
				},
				{
					where: "排班",
					what: "规划一周。「AI 智能派班」会推荐谁去哪里 — 确认之前不会保存 — 排班表会拒绝冲突，例如班已满或 PR 当天不可用。",
				},
				{
					where: "审批",
					what: "新 PR 和申请解约的 PR、病假和请假、门店的合作申请或冷清夜晚的减人请求，以及申请加入团队的员工。",
				},
				{
					where: "薪资",
					what: "每周日凌晨 2 点，系统为每位 PR 生成周日至周六的薪资单。审核、签名，再发给 PR 签名。",
				},
				{
					where: "薪资 → 结算周",
					what: "已签的薪资单在「待付款」里等待付款。从银行转账后，点「标记为已付款」，可填写银行参考号。",
				},
			],
		},
		outlet: {
			text: "欢迎！你的场所有一个网页后台：订 PR、看今晚谁真的到了门口、查看你的数据。流程如下：",
			steps: [
				{
					where: "登录",
					what: "点本页顶部的「登录」，在登录页点「注册为门店或 PR 经纪公司」，账户类型选「门店」 — 或先联系我们预约演示。",
				},
				{
					where: "设置",
					what: "InnocenZ 团队审核通过前，门户只显示「设置」— 开通后会收到邮件。",
				},
				{
					where: "设置 → 考勤",
					what: "标注场所位置并设定签到范围 — 10 米到 1,000 米，默认 50 米。",
				},
				{ where: "工作区", what: "设定每个等级的费率表和酒水价目表。" },
				{
					where: "设置 → 经纪公司合作",
					what: "向合作的经纪公司提出合作申请；有一家接受后「发布职位」才可用。",
				},
				{ where: "发布职位", what: "订 PR：选择日期和每个等级需要的人数。" },
				{ where: "今天", what: "今晚的阵容，实时 — 谁已预订、在岗或已签退。" },
				{ where: "报表", what: "你的净销售额和利润率。" },
			],
		},
		general: {
			ordered: false,
			text: "好的！简单来说，InnocenZ 把夜场一个班背后的三方 — 场所、经纪公司和 PR — 连在一起，从门口的签到到签好的每周薪资。谁用什么、在哪里用：",
			steps: [
				{
					where: "PR · 手机 App",
					what: "看班表、到场签到、查看每一分钱并签收每周结算单。",
				},
				{
					where: "经纪公司 · 网页后台",
					what: "排班、审批和每周薪资 — 从签到到签好的薪资单。",
				},
				{
					where: "场所 · 网页后台",
					what: "订 PR、看今晚阵容、设定费率、查看报表。",
				},
				{
					where: "从这里开始",
					what: "经纪公司和场所：点本页顶部的「登录」，新用户在登录页点「注册为门店或 PR 经纪公司」。PR 向经纪公司索取 App。",
				},
			],
			note: "InnocenZ 不会：转账（由经纪公司付款）、追踪任何人、未经经纪公司确认就派班，或用自拍签到。",
		},
	},
};

/* ------------------------------------------------------------------ topics -- */

export const CHAT_TOPICS: ChatTopic[] = [
	/* ---------- PR ---------- */
	{
		id: "pr-app",
		role: "pr",
		keywords: [
			"download",
			"install",
			"get the app",
			"app",
			"iphone",
			"android",
			"app store",
			"play store",
			"sign up as pr",
			"register",
			"下载",
			"安装",
			"应用",
			"apk",
			"google play",
			"playstore",
			"appstore",
			"ios",
			"aplikasi",
			"muat turun",
			"daftar pr",
			"daftar akaun pr",
			"daftar sebagai pr",
			"become pr",
			"join as pr",
			"苹果",
			"安卓",
		],
		en: {
			chip: "How do I get the app?",
			answer: {
				text: "You need a smartphone with the InnocenZ app.",
				steps: [
					{
						where: "Your agency",
						what: "Ask them for the InnocenZ app, then open it and tap Create an account — you can pick your agency as you sign up.",
					},
					{
						where: "Profile",
						what: "Once you're in, tap Edit profile, pick the agencies you work with under Agencies, then Save profile. Each one approves you.",
					},
				],
				note: "Not with an agency on InnocenZ yet? Message us and we'll help.",
				handoff: true,
			},
		},
		zh: {
			chip: "怎么获取 App？",
			answer: {
				text: "需要一部装有 InnocenZ App 的智能手机。",
				steps: [
					{
						where: "你的经纪公司",
						what: "向他们索取 InnocenZ App，打开后点「创建账号」— 注册时就可以选择经纪公司。",
					},
					{
						where: "我的",
						what: "进入后，点「编辑资料」，在「经纪公司」里选择你合作的经纪公司，再点「保存资料」，每家公司会审核你。",
					},
				],
				note: "你的经纪公司还没用 InnocenZ？联系我们，我们帮你。",
				handoff: true,
			},
		},
	},
	{
		id: "pr-shifts",
		role: "pr",
		keywords: [
			"shift",
			"tonight",
			"today",
			"where do i work",
			"which venue",
			"work schedule",
			"我的班",
			"班次",
			"上班",
			"今晚",
			"今天",
			"syif",
			"jadual",
			"malam ni",
			"malam ini",
			"tugasan",
			"got job",
			"where is venue",
			"排班表",
			"有班",
			"星期的班",
			"周的班",
			"调班",
			"换班",
			"顶班",
		],
		en: {
			chip: "Where are my shifts?",
			answer: {
				text: "Your shifts are on the first tab.",
				steps: [
					{
						where: "Today",
						what: "Your shifts — which venue and what time.",
					},
					{
						where: "Check-In",
						what: "When you arrive, check in here.",
					},
				],
				note: "Your agency puts you on shifts — you won't be booked on a day you've marked unavailable.",
			},
		},
		zh: {
			chip: "我的班在哪里看？",
			answer: {
				text: "你的班在第一个分页。",
				steps: [
					{ where: "今日", what: "你的班 — 哪个场所、什么时间。" },
					{ where: "签到", what: "到场后在这里签到。" },
				],
				note: "由经纪公司为你排班 — 你标记为不可接班的日子不会被排班。",
			},
		},
	},
	{
		id: "pr-checkin",
		role: "pr",
		keywords: [
			"check in",
			"checkin",
			"check out",
			"checkout",
			"clock in",
			"clock out",
			"attendance",
			"too far",
			"distance",
			"gps",
			"打卡",
			"签到",
			"签退",
			"距离",
			"太远",
			"punch",
			"kehadiran",
			"location wrong",
			"wrong location",
			"location error",
			"out of range",
			"outside fence",
			"claim ot",
			"claim overtime",
			"打不到卡",
			"打不了卡",
			"签不到",
			"定位不准",
			"位置不对",
			"lokasi",
			"打卡记录",
			"签到记录",
			"leave early",
			"go home early",
			"balik awal",
			"先走",
			"早走",
		],
		en: {
			chip: "How do I check in?",
			answer: {
				text: "Check-in only works at the venue, so nobody can say you weren't there.",
				steps: [
					{ where: "Check-In", what: "At the venue, tap check in." },
					{
						where: "Check-In",
						what: "Too far away? It tells you how far you are — move closer and try again.",
					},
					{
						where: "Check-In",
						what: "Check out when you finish. Your pay counts the time between these two taps that falls inside the shift's scheduled hours; time after the end is paid only if your agency approves it as overtime.",
					},
				],
			},
		},
		zh: {
			chip: "怎么签到？",
			answer: {
				text: "只有在场所才能签到，所以没人能说你没来。",
				steps: [
					{ where: "签到", what: "到场后点签到。" },
					{
						where: "签到",
						what: "距离太远？它会告诉你离场所多远 — 走近一点再试。",
					},
					{
						where: "签到",
						what: "下班时签退。薪资按这两次之间、落在排定班次时间内的时长计算；超过结束时间的部分，要经纪公司批准为加班才会付。",
					},
				],
			},
		},
	},
	{
		id: "pr-pay",
		role: "pr",
		keywords: [
			"pay",
			"paid",
			"get paid",
			"salary",
			"wage",
			"money",
			"earning",
			"commission",
			"tip",
			"drink",
			"ringgit",
			"how much did i",
			"薪水",
			"工资",
			"薪资",
			"收入",
			"佣金",
			"小费",
			"酒水",
			"i earn",
			"gaji",
			"bayar",
			"bayaran",
			"duit",
			"upload receipt",
			"log receipt",
			"submit receipt",
			"上传小票",
			"出粮",
			"发粮",
			"粮期",
			"提成",
			"钱几时",
			"钱什么时候",
			"how much per hour",
		],
		en: {
			chip: "Where do I see my pay?",
			answer: {
				text: "Every ringgit comes with its proof.",
				steps: [
					{
						where: "Payment",
						what: "The Sunday–Saturday grid: daily wages, drinks, tips and others, with the week's total.",
					},
					{
						where: "Payment",
						what: "Tap any amount to see the evidence — the receipt, the order and your check-in and check-out times.",
					},
				],
				note: "Your agency pays you. InnocenZ shows the breakdown and the proof — it does not transfer money.",
			},
		},
		zh: {
			chip: "在哪里看薪资？",
			answer: {
				text: "每一分钱都有证据。",
				steps: [
					{
						where: "结算",
						what: "周日至周六的表格：日薪、酒水、小费和其他，以及本周合计。",
					},
					{
						where: "结算",
						what: "点任何金额就能看到证据 — 小票、订单，以及你的签到和签退时间。",
					},
				],
				note: "薪资由你的经纪公司支付。InnocenZ 提供明细和证据 — 不负责转账。",
			},
		},
	},
	{
		id: "pr-dispute",
		role: "pr",
		keywords: [
			"dispute",
			"wrong",
			"mistake",
			"incorrect",
			"missing",
			"not correct",
			"complain",
			"争议",
			"申诉",
			"不对",
			"错",
			"少了",
			"投诉",
			"appeal",
			"complaint",
			"underpaid",
			"underpay",
			"short pay",
			"pay short",
			"short paid",
			"wrong pay",
			"pay wrong",
			"salary wrong",
			"wrong salary",
			"money missing",
			"missing money",
			"tips missing",
			"missing tips",
			"pay not enough",
			"salary not enough",
			"not enough pay",
			"salah",
			"kurang bayar",
			"gaji kurang",
			"kurang gaji",
			"gaji salah",
			"少给",
			"少付",
			"少算",
			"钱少",
			"工资少",
			"薪水少",
			"钱不够",
			"粮不够",
			"工资不够",
			"钱不见",
			"小费不见",
			"佣金不见",
			"deduct",
			"deduction",
			"扣钱",
			"gaji tak cukup",
			"duit tak cukup",
			"paid less",
			"pay less",
		],
		en: {
			chip: "My pay looks wrong",
			answer: {
				text: "You can dispute a drinks or tips amount after your agency has approved that day.",
				steps: [
					{ where: "Payment", what: "Tap the amount that looks wrong." },
					{
						where: "Payment",
						what: "Tap Dispute this amount, say what's wrong, then tap Submit dispute.",
					},
					{
						where: "Payment",
						what: "Your agency reviews it, and you see the result in the app.",
					},
				],
				note: "Wages and overtime come from your check-in and check-out, so they are proven rather than disputed.",
			},
		},
		zh: {
			chip: "我的薪资不对",
			answer: {
				text: "经纪公司审核通过当天后，你可以对酒水或小费金额提出争议。",
				steps: [
					{ where: "结算", what: "点看起来不对的金额。" },
					{
						where: "结算",
						what: "点「对此金额提出争议」，写明问题，再点「提交争议」。",
					},
					{ where: "结算", what: "经纪公司审核后，结果会显示在 App 里。" },
				],
				note: "日薪和加班来自你的签到和签退，有据可查，所以不需要争议。",
			},
		},
	},
	{
		id: "pr-sign",
		role: "pr",
		keywords: [
			"sign",
			"signature",
			"voucher",
			"payslip",
			"pdf",
			"excel",
			"history",
			"past pay",
			"签名",
			"签收",
			"结算单",
			"结算记录",
			"薪资单",
			"记录",
			"历史",
			"pay slip",
			"slip",
			"slip gaji",
			"payment history",
			"pay history",
			"download payslip",
			"tandatangan",
			"签单",
			"粮单",
			"工资单",
			"下载pdf",
		],
		en: {
			chip: "How do I sign my voucher?",
			answer: {
				text: "Your weekly voucher is signed on your phone.",
				steps: [
					{
						where: "Payment",
						what: "When your voucher is ready, open Last week and tap Review & sign.",
					},
					{
						where: "Payment",
						what: "Check the lines, then sign with your finger. A signed PDF is kept.",
					},
					{
						where: "History",
						what: "Open Payment history, tap a week, then tap PDF or Excel.",
					},
				],
			},
		},
		zh: {
			chip: "怎么签结算单？",
			answer: {
				text: "每周结算单在手机上签名。",
				steps: [
					{
						where: "结算",
						what: "结算单准备好后，打开「上周」，点「审阅并签名」。",
					},
					{ where: "结算", what: "核对明细，用手指签名。签好的 PDF 会保存。" },
					{
						where: "记录",
						what: "打开「结算记录」，点开一周，再点 PDF 或 Excel。",
					},
				],
			},
		},
	},
	{
		id: "pr-leave",
		role: "pr",
		keywords: [
			"mc",
			"sick",
			"medical",
			"leave",
			"day off",
			"off day",
			"rest day",
			"unavailable",
			"not available",
			"cannot work",
			"cancel shift",
			"cancel",
			"病假",
			"请假",
			"休息",
			"不可接班",
			"取消",
			"cuti",
			"demam",
			"nak off",
			"minta off",
			"cannot come",
			"cant come",
			"cannot make it",
			"cant make it",
			"emergency leave",
			"got emergency",
			"on holiday",
			"go holiday",
			"take holiday",
			"vacation",
			"balik kampung",
			"生病",
			"不舒服",
			"发烧",
			"不能上班",
			"不能来",
			"来不了",
			"去不了",
			"休假",
			"放假",
			"didnt show up",
			"ada emergency",
			"tak dapat datang",
			"tak boleh datang",
		],
		en: {
			chip: "MC, leave or a day off",
			answer: {
				text: "Your days off are respected.",
				steps: [
					{
						where: "Today",
						what: "In Agency schedule, tap a free day, then tap Mark unavailable. Your agency sees it blocked on their roster and won't put you on a shift.",
					},
					{
						where: "Today",
						what: "Sick? In Agency schedule, tap MC / Leave on that shift, add a photo of your MC, write the reason and tap Submit leave request. Your agency approves it.",
					},
					{
						where: "Today",
						what: "Before you cancel a shift, you're shown your agency's cancellation fee.",
					},
				],
			},
		},
		zh: {
			chip: "病假、请假或休息",
			answer: {
				text: "你的休息日会被尊重。",
				steps: [
					{
						where: "今日",
						what: "在「经纪排班」点一个空闲的日子，再点「标记为不可接班」。经纪公司会在排班表上看到这天已被标记，不会为你排班。",
					},
					{
						where: "今日",
						what: "生病了？在「经纪排班」的该班次点「病假 / 请假」，上传病假单照片，填写原因，再点「提交请假申请」，由经纪公司审批。",
					},
					{ where: "今日", what: "取消班之前，会先显示你经纪公司的取消费用。" },
				],
			},
		},
	},
	{
		id: "pr-agencies",
		role: "pr",
		keywords: [
			"two agencies",
			"another agency",
			"more than one agency",
			"many agencies",
			"join agency",
			"leave agency",
			"change agency",
			"tier",
			"level",
			"多家",
			"两家",
			"换公司",
			"加入经纪",
			"等级",
			"two agency",
			"2 agency",
			"2 agencies",
			"many agency",
			"multiple agency",
			"multiple agencies",
			"switch agency",
			"quit agency",
			"resign",
			"other agency",
			"another company",
			"two company",
			"change company",
			"tukar agensi",
			"keluar agensi",
			"dua agensi",
			"2 agensi",
			"agensi lain",
			"两间公司",
			"两间经纪",
			"换经纪",
			"退出公司",
			"退出经纪",
			"离开公司",
			"离开经纪",
			"cancel agency",
		],
		en: {
			chip: "Can I work for two agencies?",
			answer: {
				text: "Yes — one app, more than one agency.",
				steps: [
					{
						where: "Profile",
						what: "Tap Edit profile and pick your agencies under Agencies, then Save profile. To leave one, untick it and tap Request to leave. Joining or leaving is a request the agency approves.",
					},
				],
				note: "Your tier is set by each agency separately, so it can differ between them.",
			},
		},
		zh: {
			chip: "可以同时为两家公司工作吗？",
			answer: {
				text: "可以 — 一个 App，多家经纪公司。",
				steps: [
					{
						where: "我的",
						what: "点「编辑资料」，在「经纪公司」里选择，再点「保存资料」。要离开某家，取消勾选并点「申请离开」。加入或离开都需要经纪公司批准。",
					},
				],
				note: "你的等级由每家公司分别设定，所以可能不一样。",
			},
		},
	},

	/* ---------- Agency ---------- */
	{
		id: "ag-roster",
		role: "agency",
		keywords: [
			"roster",
			"schedule",
			"assign",
			"scheduling",
			"plan shifts",
			"auto assign",
			"autoassign",
			"ai auto assign",
			"智能派班",
			"派班",
			"suggestion",
			"clash",
			"backfill",
			"replacement",
			"排班",
			"班表",
			"分配",
			"冲突",
			"替补",
			"put pr",
			"jadual",
			"susun syif",
			"atur syif",
			"安排pr",
			"调人",
			"换人",
			"补人",
			"补位",
			"replace pr",
			"ganti pr",
			"backup pr",
			"standby pr",
			"double book",
			"unfilled",
			"open demand",
			"manpower",
			"move pr",
			"调班",
			"换班",
			"顶班",
		],
		en: {
			chip: "How does the roster work?",
			answer: {
				text: "The roster plans your week and stops mistakes before they happen.",
				steps: [
					{
						where: "Roster → Planning",
						what: "The AI auto-assign banner proposes who goes where. Nothing is saved until you press Confirm.",
					},
					{
						where: "Roster",
						what: "It refuses clashes, such as a full shift or a PR's blocked day.",
					},
					{
						where: "Roster",
						what: "A PR drops out? Under Backfill needed, tap Pick replacement for a ranked list of replacements.",
					},
				],
				note: "Auto-assign follows your roster rules — it only proposes, and you decide.",
			},
		},
		zh: {
			chip: "排班怎么用？",
			answer: {
				text: "排班表规划你的一周，在出错之前就把错误挡住。",
				steps: [
					{
						where: "排班 → 排班计划",
						what: "「AI 智能派班」横幅会推荐谁去哪里。点「确认」之前不会保存。",
					},
					{
						where: "排班",
						what: "它会拒绝冲突，例如班已满或 PR 当天不可用。",
					},
					{
						where: "排班",
						what: "有 PR 临时不来？在「需要补位」点「选择替班人员」，会列出排好序的替补名单。",
					},
				],
				note: "智能派班按你的排班规则推荐 — 只是建议，由你决定。",
			},
		},
	},
	{
		id: "ag-attendance",
		role: "agency",
		keywords: [
			"proof",
			"late",
			"absent",
			"no show",
			"didnt come",
			"did not come",
			"never came",
			"location map",
			"check in location",
			"出勤",
			"迟到",
			"没来",
			"缺勤",
			"证明",
			"attendance",
			"kehadiran",
			"didnt turn up",
			"did not turn up",
			"never turn up",
			"didnt show up",
			"noshow",
			"ponteng",
			"live map",
			"放飞机",
			"没出现",
			"缺席",
			"旷工",
			"打卡记录",
			"签到记录",
			"tak datang",
		],
		en: {
			chip: "Proof a PR was there",
			answer: {
				text: "Every check-in records how far the PR was from the venue pin.",
				steps: [
					{
						where: "Roster → Live → Check-in locations",
						what: "A map per venue showing where each PR checked in and whether it was inside the fence.",
					},
				],
				note: "So when a venue says your PR never came, you have the record.",
			},
		},
		zh: {
			chip: "证明 PR 到场",
			answer: {
				text: "每次签到都会记录 PR 离场所定位点有多远。",
				steps: [
					{
						where: "排班 → 实时 → 签到位置",
						what: "每个场所一张地图，显示每位 PR 在哪里签到、是否在范围内。",
					},
				],
				note: "当场所说你的 PR 没来时，你有记录为证。",
			},
		},
	},
	{
		id: "ag-payroll",
		role: "agency",
		keywords: [
			"payroll",
			"voucher",
			"pay prs",
			"paid",
			"salary",
			"pay",
			"overtime",
			"receipt",
			"payout",
			"bank file",
			"薪资",
			"工资",
			"薪资单",
			"加班",
			"小票",
			"发薪",
			"payslip",
			"gaji",
			"wage",
			"commission",
			"tip",
			"drink",
			"dispute",
			"出粮",
			"粮单",
			"薪水",
			"bayar pr",
			"slip gaji",
		],
		en: {
			chip: "How does payroll work?",
			answer: {
				text: "Payroll builds itself every week.",
				steps: [
					{
						where: "Payroll",
						what: "Every Sunday at 2 a.m. each PR's voucher for the Sunday–Saturday week is built.",
					},
					{
						where: "Payroll",
						what: "Review the receipts, overtime and any disputes.",
					},
					{
						where: "Payroll",
						what: "Sign it and send it to the PR, who signs on the phone. PDF and Excel for each voucher.",
					},
					{
						where: "Payroll → Payment Week",
						what: "Signed vouchers wait here under To pay. Pay each PR from your bank, then press Mark as paid — you can add the bank reference.",
					},
				],
				note: "InnocenZ prepares payroll — your agency still makes the payment.",
			},
		},
		zh: {
			chip: "薪资怎么做？",
			answer: {
				text: "薪资每周自动生成。",
				steps: [
					{
						where: "薪资",
						what: "每周日凌晨 2 点，为每位 PR 生成周日至周六的薪资单。",
					},
					{ where: "薪资", what: "审核小票、加班和争议。" },
					{
						where: "薪资",
						what: "签名后发给 PR，PR 在手机上签名。每张薪资单都有 PDF 和 Excel。",
					},
					{
						where: "薪资 → 结算周",
						what: "已签的薪资单在「待付款」里等待付款。从银行转账后，点「标记为已付款」，可填写银行参考号。",
					},
				],
				note: "InnocenZ 负责准备薪资 — 付款仍由你的经纪公司完成。",
			},
		},
	},
	{
		id: "ag-approvals",
		role: "agency",
		keywords: [
			"approve",
			"approval",
			"new pr",
			"application",
			"applicant",
			"mc",
			"leave",
			"cutlost",
			"cut loss",
			"审批",
			"批准",
			"申请",
			"病假",
			"请假",
			"join agency",
			"cancel agency",
			"resign",
			"cuti",
			"lulus",
			"批假",
			"pending request",
			"pending approval",
			"outlet partnership",
			"partner with us",
		],
		en: {
			chip: "Approvals",
			answer: {
				text: "Everything that needs your yes is in one place.",
				steps: [
					{
						where: "Approvals → Agency-Tied",
						what: "New PRs who asked to join wait under Current — approve or reject.",
					},
					{
						where: "Approvals → MC/Leaves",
						what: "See the MC photo, then approve or reject.",
					},
					{
						where: "Approvals → Cancel Agency",
						what: "A PR asking to leave your agency — approve or reject.",
					},
					{
						where: "Approvals → Outlet → Cutlost",
						what: "A venue's request to release PRs on a quiet night.",
					},
					{
						where: "Approvals → Outlet → Outlet Partnership",
						what: "A venue asking to work with you — accept or decline.",
					},
					{
						where: "Approvals → New member",
						what: "Staff asking to join your team — pick the role, then approve or decline.",
					},
				],
			},
		},
		zh: {
			chip: "审批",
			answer: {
				text: "所有需要你批准的事项都在一个地方。",
				steps: [
					{
						where: "审批 → 签约 PR",
						what: "申请加入的新 PR 在「待处理」里 — 批准或拒绝。",
					},
					{
						where: "审批 → 病假 / 请假",
						what: "查看病假单照片，然后批准或拒绝。",
					},
					{
						where: "审批 → 解约申请",
						what: "PR 申请离开你的经纪公司 — 批准或拒绝。",
					},
					{ where: "审批 → 门店 → 缺班损失", what: "场所在冷清夜晚请求放人。" },
					{
						where: "审批 → 门店 → 门店合作",
						what: "门店申请与你合作 — 接受或拒绝。",
					},
					{
						where: "审批 → 新成员",
						what: "员工申请加入团队 — 选择职位后通过或拒绝。",
					},
				],
			},
		},
	},
	{
		id: "ag-rules",
		role: "agency",
		keywords: [
			"rule",
			"fee",
			"penalty",
			"fine",
			"cancellation",
			"cancel fee",
			"规则",
			"罚款",
			"罚",
			"费用",
			"取消费",
			"late penalty",
			"late fine",
			"no show",
			"late",
			"denda",
			"potong gaji",
			"deduct",
			"deduction",
			"扣钱",
			"扣薪",
			"扣薪水",
			"扣粮",
			"扣工资",
			"扣除",
			"last minute cancel",
		],
		en: {
			chip: "Rules and cancellation fees",
			answer: {
				text: "Set your rules once and they apply to everyone the same way.",
				steps: [
					{
						where: "Manage PR → Attendance and penalty rules",
						what: "Your attendance rules and the cancellation fee bands.",
					},
				],
				note: "A PR sees your cancellation fee before cancelling a shift.",
			},
		},
		zh: {
			chip: "规则和取消费",
			answer: {
				text: "规则设定一次，对每个人一视同仁。",
				steps: [
					{
						where: "PR 管理 → 出勤与处罚规则",
						what: "你的出勤规则和取消费档位。",
					},
				],
				note: "PR 取消班之前会先看到你的取消费。",
			},
		},
	},
	{
		id: "ag-team",
		role: "agency",
		keywords: [
			"staff",
			"team",
			"finance",
			"role",
			"member",
			"invite",
			"permission",
			"员工",
			"团队",
			"财务",
			"角色",
			"成员",
			"权限",
			"add admin",
			"access right",
			"accountant",
			"manager",
			"同事",
			"邀请",
		],
		en: {
			chip: "My staff and roles",
			answer: {
				text: "Each person on your team sees only their part.",
				steps: [
					{
						where: "Settings",
						what: "Tap “Invite a team member” and invite staff who already have an InnocenZ login as Financial Head or Director. They accept from the email link (valid 7 days).",
					},
					{
						where: "Approvals → New member",
						what: "Staff without a login sign up with “Sign up as a team member”, then wait here for you to approve them.",
					},
				],
				note: "Only the owner (or Guarantor) manages the team. Each role only gets the pages it needs.",
			},
		},
		zh: {
			chip: "员工和角色",
			answer: {
				text: "团队里每个人只看到自己负责的部分。",
				steps: [
					{
						where: "设置",
						what: "点「邀请团队成员」，以财务主管或总监身份邀请已有 InnocenZ 账号的员工；对方在邮件链接中接受（7 天内有效）。",
					},
					{
						where: "审批 → 新成员",
						what: "还没有账号的员工用「注册为团队成员」申请，然后在这里等你批准。",
					},
				],
				note: "只有东主（或担保人）管理团队。每个角色只获得它需要的页面。",
			},
		},
	},

	/* ---------- Outlet ---------- */
	{
		id: "ou-pin",
		role: "outlet",
		keywords: [
			"pin",
			"fence",
			"geofence",
			"radius",
			"location",
			"attendance",
			"check in",
			"定位",
			"围栏",
			"范围",
			"签到",
			"位置",
			"gps",
			"distance",
			"clock in",
			"lokasi",
			"kehadiran",
			"距离",
			"考勤",
		],
		en: {
			chip: "Set up attendance",
			answer: {
				text: "Know which PRs are really at your door.",
				steps: [
					{
						where: "Settings → Attendance",
						what: "Pin your venue and set the fence — from 10 m to 1,000 m, 50 m by default.",
					},
				],
				note: "With a pin, a PR outside the fence cannot check in (the phone's GPS accuracy can add up to 30 m). With no pin, check-ins are accepted from anywhere.",
			},
		},
		zh: {
			chip: "设置出勤",
			answer: {
				text: "确认哪些 PR 真的到了你门口。",
				steps: [
					{
						where: "设置 → 考勤",
						what: "标注场所位置并设定范围 — 10 米到 1,000 米，默认 50 米。",
					},
				],
				note: "设置定位点后，范围外的 PR 无法签到（手机 GPS 精度最多可放宽 30 米）；没有定位点时，任何地点的签到都会被接受。",
			},
		},
	},
	{
		id: "ou-postjob",
		role: "outlet",
		keywords: [
			"post job",
			"book",
			"booking",
			"hire",
			"need pr",
			"need prs",
			"request pr",
			"headcount",
			"calendar",
			"订",
			"预订",
			"发布",
			"招",
			"要人",
			"日历",
			"more pr",
			"extra pr",
			"order pr",
			"post shift",
			"叫pr",
			"要pr",
			"manpower",
			"agency partnership",
		],
		en: {
			chip: "How do I book PRs?",
			answer: {
				text: "Book PRs in one form.",
				steps: [
					{
						where: "Post Job",
						what: "Pick the dates and how many PRs of each tier you need.",
					},
					{
						where: "Calendar",
						what: "Day by day, see what you asked for against what was supplied.",
					},
				],
				note: "You need at least one agency that has approved your outlet (Settings → “Agency Partnerships”) before you can post. A Director sees Post Job read-only.",
			},
		},
		zh: {
			chip: "怎么订 PR？",
			answer: {
				text: "一张表单就能订 PR。",
				steps: [
					{ where: "发布职位", what: "选择日期和每个等级需要的人数。" },
					{ where: "日历", what: "逐日对比你要的人数和实际供应的人数。" },
				],
				note: "至少要有一家经纪公司批准你的门店（「设置」→「经纪公司合作」）才能发布。总监只能以只读方式查看「发布职位」。",
			},
		},
	},
	{
		id: "ou-today",
		role: "outlet",
		keywords: [
			"today",
			"tonight",
			"live",
			"line up",
			"lineup",
			"who is coming",
			"whos coming",
			"on duty",
			"今晚",
			"今天",
			"在岗",
			"阵容",
			"malam ini",
			"malam ni",
			"谁上班",
			"prs arrive",
			"pr arrived",
			"labour cost",
			"labor cost",
			"wage bill",
		],
		en: {
			chip: "Who's here tonight?",
			answer: {
				text: "Know tonight's line-up before doors open.",
				steps: [
					{
						where: "Today",
						what: "Every PR booked tonight — booked, on duty or checked out — from their real check-ins.",
					},
				],
			},
		},
		zh: {
			chip: "今晚谁来？",
			answer: {
				text: "开门前就知道今晚的阵容。",
				steps: [
					{
						where: "今天",
						what: "今晚预订的每位 PR — 已预订、在岗或已签退 — 来自真实签到。",
					},
				],
			},
		},
	},
	{
		id: "ou-quiet",
		role: "outlet",
		keywords: [
			"quiet",
			"slow night",
			"cut staff",
			"send home",
			"release",
			"cutlost",
			"cut loss",
			"too many pr",
			"冷清",
			"减人",
			"放人",
			"人太多",
			"quiet tonight",
			"slow tonight",
			"business slow",
			"slow business",
			"no customer",
			"sepi",
			"lengang",
			"生意不好",
			"生意差",
			"没客",
			"提早下班",
			"先回家",
			"reduce headcount",
			"reduce pr",
			"fewer pr",
			"sepi malam",
			"pr先走",
			"pr先回家",
		],
		en: {
			chip: "A quiet night",
			answer: {
				text: "On a quiet night you can ask the agency to release PRs.",
				steps: [
					{
						where: "Today → Reduce cutlost",
						what: "Ask the agency to send PRs home or drop empty slots.",
					},
					{
						where: "Agency → Approvals",
						what: "The agency approves the request.",
					},
				],
			},
		},
		zh: {
			chip: "冷清的夜晚",
			answer: {
				text: "生意冷清时，可以请经纪公司放人。",
				steps: [
					{
						where: "今天 → 减少缺班损失",
						what: "请经纪公司让 PR 提早下班，或取消空缺名额。",
					},
					{ where: "经纪公司 → 审批", what: "经纪公司批准这个请求。" },
				],
			},
		},
	},
	{
		id: "ou-rates",
		role: "outlet",
		keywords: [
			"rate",
			"rate card",
			"price",
			"price list",
			"menu",
			"happy hour",
			"tier",
			"drink",
			"费率",
			"价格",
			"价目",
			"酒水",
			"欢乐时光",
			"欢乐时段",
			"等级",
			"minuman",
			"senarai harga",
			"kadar",
			"per hour",
			"时薪",
			"entitlement",
		],
		en: {
			chip: "Rates and price list",
			answer: {
				text: "Your prices, set once.",
				steps: [
					{
						where: "Workspace",
						what: "Your rate card for each tier.",
					},
					{
						where: "Workspace",
						what: "Your drinks price list and happy hour.",
					},
				],
			},
		},
		zh: {
			chip: "费率和价目表",
			answer: {
				text: "你的价格，设定一次。",
				steps: [
					{ where: "工作区", what: "每个等级的费率表。" },
					{ where: "工作区", what: "你的酒水价目表和欢乐时段。" },
				],
			},
		},
	},
	{
		id: "ou-reports",
		role: "outlet",
		keywords: [
			"report",
			"sales",
			"margin",
			"profit",
			"numbers",
			"revenue",
			"报表",
			"销售",
			"利润",
			"营业额",
			"数据",
			"we earn",
			"we make",
			"laporan",
			"jualan",
			"statistic",
			"analytic",
			"收益",
			"盈利",
		],
		en: {
			chip: "Reports",
			answer: {
				text: "See what your nights actually earned.",
				steps: [{ where: "Reports", what: "Your net sales and margin." }],
			},
		},
		zh: {
			chip: "报表",
			answer: {
				text: "看看你的夜晚实际赚了多少。",
				steps: [{ where: "报表", what: "你的净销售额和利润率。" }],
			},
		},
	},
	{
		id: "ou-team",
		role: "outlet",
		keywords: [
			"team",
			"staff",
			"finance",
			"director",
			"operations",
			"ops head",
			"manager",
			"invite",
			"privacy",
			"ic",
			"团队",
			"员工",
			"财务",
			"经理",
			"隐私",
			"permission",
			"role",
			"member",
			"权限",
			"角色",
			"成员",
			"add admin",
			"access right",
			"accountant",
			"同事",
			"邀请",
		],
		en: {
			chip: "My team",
			answer: {
				text: "Everyone on your team sees only their part.",
				steps: [
					{
						where: "Settings → Team",
						what: "The Owner or Guarantor invites staff who already have an InnocenZ account as Financial Head, Ops Head or Director; they accept by email. A Director can view but not change.",
					},
					{
						where: "Approvals",
						what: "New staff tap “Sign up as a team member” on the sign-up page first; their request waits here for you.",
					},
				],
				note: "You see who works at your venue — never a PR's IC, address or location history.",
			},
		},
		zh: {
			chip: "我的团队",
			answer: {
				text: "团队里每个人只看到自己负责的部分。",
				steps: [
					{
						where: "设置 → 团队",
						what: "东主或担保人可邀请已有 InnocenZ 账号的员工，角色可选财务主管、运营主管或总监；对方通过邮件接受。总监只能查看，不能修改。",
					},
					{
						where: "审批",
						what: "新员工先在注册页点「注册为团队成员」；申请会在这里等你处理。",
					},
				],
				note: "你能看到谁在你的场所工作 — 但看不到 PR 的身份证、地址或位置记录。",
			},
		},
	},

	/* ---------- Anyone ---------- */
	{
		id: "gen-what",
		role: "any",
		keywords: [
			"what is innocenz",
			"what is this",
			"about innocenz",
			"what does innocenz do",
			"what do you do",
			"how does it work",
			"how does innocenz work",
			"tell me about",
			"introduce",
			"是什么",
			"介绍",
			"干什么",
			"做什么的",
			"whats innocenz",
			"wat is innocenz",
			"whats this",
			"explain innocenz",
			"what does your company do",
			"what your company do",
			"how it works",
			"how it work",
			"how does this work",
			"how does this thing work",
			"what do you offer",
			"you guys offer",
			"what do you provide",
			"services do you provide",
			"give me an overview",
			"quick overview",
			"what features",
			"innocenz features",
			"what can innocenz do",
			"kind of platform",
			"what platform",
			"whats the point",
			"innocenz solve",
			"who is this for",
			"who is innocenz for",
			"who uses innocenz",
			"why innocenz",
			"why should i use",
			"benefit",
			"advantage",
			"what is the use",
			"what this app for",
			"what is this app",
			"干嘛的",
			"干什么用",
			"有什么功能",
			"公司做什么",
			"你们做什么",
			"这个怎么用",
			"apa itu innocenz",
			"innocenz buat apa",
			"innocenz untuk apa",
		],
		en: {
			chip: "What is InnocenZ?",
			answer: {
				text: "InnocenZ is the shift-to-pay platform for nightlife: the outlet books PRs, the agency rosters and pays them, and the PR checks in and signs for the week's pay — all from one shared record.",
				note: "Tell me if you're a PR, an agency or an outlet and I'll show you your side.",
			},
		},
		zh: {
			chip: "InnocenZ 是什么？",
			answer: {
				text: "InnocenZ 是夜场从排班到发薪的平台：场所订 PR，经纪公司排班并支付，PR 签到并签收每周薪资 — 全部来自同一份记录。",
				note: "告诉我你是 PR、经纪公司还是场所，我带你看你那一边。",
			},
		},
	},
	{
		id: "gen-cannot",
		role: "any",
		keywords: [
			"cant",
			"cannot",
			"can not",
			"not do",
			"limit",
			"limitation",
			"doesnt",
			"does not",
			"selfie",
			"face",
			"ai",
			"artificial intelligence",
			"不能",
			"做不到",
			"限制",
			"不支持",
			"自拍",
			"人工智能",
			"face recognition",
			"facial",
			"face id",
			"take selfie",
			"dont do",
			"doesnt do",
			"drawback",
			"disadvantage",
			"weakness",
			"downside",
			"fully automatic",
			"自拍打卡",
			"拍照打卡",
			"人脸识别",
			"刷脸",
			"tak boleh buat",
		],
		en: {
			chip: "What can't InnocenZ do?",
			answer: {
				ordered: false,
				text: "Straight answer — InnocenZ does not:",
				steps: [
					{
						where: "Money",
						what: "Transfer money. The agency pays its PRs from its own bank; InnocenZ prepares the vouchers and the proof.",
					},
					{
						where: "Location",
						what: "Track anyone. The app reads location only while the Check-In screen is open before a check-in, and sends it only with the check-in and check-out taps.",
					},
					{
						where: "Assigning",
						what: "Assign PRs on its own. AI auto-assign only proposes — nothing is saved until the agency confirms.",
					},
					{
						where: "Check-in",
						what: "Use selfies. Check-in is proven by being at the venue.",
					},
				],
			},
		},
		zh: {
			chip: "InnocenZ 不能做什么？",
			answer: {
				ordered: false,
				text: "直说 — InnocenZ 不会：",
				steps: [
					{
						where: "资金",
						what: "转账。经纪公司从自己的银行付款；InnocenZ 准备薪资单和证据。",
					},
					{
						where: "定位",
						what: "追踪任何人。App 只在「签到」页面打开、尚未签到时读取位置，并只在签到和签退时发送。",
					},
					{
						where: "派班",
						what: "自行派班。「AI 智能派班」只会推荐 — 经纪公司确认之前不会保存。",
					},
					{ where: "签到", what: "用自拍。签到靠人在场所来证明。" },
				],
			},
		},
	},
	{
		id: "gen-tracking",
		role: "any",
		keywords: [
			"track",
			"tracking",
			"follow me",
			"spy",
			"monitor me",
			"跟踪",
			"追踪",
			"监视",
			"一直定位",
			"track location",
			"track me",
			"spy on",
			"know where i am",
			"see where i am",
			"gps always on",
			"location always on",
			"background location",
			"in background",
			"see my location",
			"know my location",
			"location record",
			"record location",
			"location 24/7",
			"jejak",
			"jejak lokasi",
			"追踪我",
			"跟踪我",
			"一直追踪",
			"监控",
			"后台定位",
			"一直开着",
			"看得到我在哪",
			"看到我在哪",
			"知道我在哪",
			"24/7",
			"always on",
			"location on",
			"location 24 hours",
		],
		en: {
			chip: "Does it track PRs?",
			answer: {
				text: "No. The app reads the phone's location only while the PR has the Check-In screen open before checking in (to show how far the venue is), and sends it to InnocenZ only when the PR taps check in or check out — there is no background tracking.",
			},
		},
		zh: {
			chip: "会追踪 PR 吗？",
			answer: {
				text: "不会。App 只在 PR 打开「签到」页面、尚未签到时读取手机位置（用来显示离场所多远），只有在 PR 点签到或签退时才把位置发送给 InnocenZ — 不会在后台追踪。",
			},
		},
	},
	{
		id: "gen-money",
		role: "any",
		keywords: [
			"transfer",
			"bank",
			"who pays",
			"does innocenz pay",
			"innocenz pay",
			"handle money",
			"转账",
			"银行",
			"谁付钱",
			"谁发钱",
			"who pay",
			"who will pay",
			"who transfer",
			"money go through",
			"pay through innocenz",
			"payout through innocenz",
			"payout from innocenz",
			"paid by innocenz",
			"get paid by innocenz",
			"handle pay",
			"hold money",
			"innocenz bank in",
			"collect money",
			"money flow",
			"money move",
			"谁发工资",
			"谁发薪",
			"谁出粮",
			"谁发粮",
			"是谁出",
			"谁付工资",
			"谁出钱",
			"你们发工资",
			"平台发工资",
			"经过平台",
			"经过你们平台",
			"帮忙发工资",
			"代发",
			"siapa bayar",
			"siapa yang bayar",
			"siapa bayar gaji",
		],
		en: {
			chip: "Does InnocenZ pay PRs?",
			answer: {
				text: "No — the agency pays its PRs from its own bank. InnocenZ builds the weekly vouchers and collects both signatures, and the agency marks each one paid, so every payment is provable.",
			},
		},
		zh: {
			chip: "InnocenZ 给 PR 发钱吗？",
			answer: {
				text: "不 — 由经纪公司从自己的银行给 PR 发钱。InnocenZ 生成每周薪资单并收集双方签名，经纪公司付款后逐张标记为已付款，每笔付款都有据可查。",
			},
		},
	},
	{
		id: "gen-price",
		role: "any",
		keywords: [
			"price",
			"pricing",
			"cost",
			"how much",
			"subscription",
			"subscribe",
			"fee",
			"free",
			"价格",
			"多少钱",
			"收费",
			"订阅",
			"免费",
			"费用",
			"charging",
			"charges for",
			"you charge",
			"monthly fee",
			"per month",
			"which package",
			"what package",
			"package plan",
			"subscription package",
			"quotation",
			"quote",
			"trial period",
			"free trial",
			"harga",
			"berapa harga",
			"ringgit sebulan",
			"berapa sebulan",
			"yuran",
			"langganan",
			"pakej",
			"月费",
			"年费",
			"价钱",
			"要钱",
			"收不收费",
			"discount",
			"promo",
			"折扣",
			"优惠",
		],
		en: {
			chip: "How much does it cost?",
			answer: {
				text: "Agencies and outlets subscribe — see the Pricing section on this page. For a plan that fits your size, message our team.",
				handoff: true,
			},
		},
		zh: {
			chip: "多少钱？",
			answer: {
				text: "经纪公司和场所按订阅收费 — 请看本页的「定价」部分。想要适合你规模的方案，联系我们的团队。",
				handoff: true,
			},
		},
	},
	{
		id: "gen-start",
		role: "any",
		keywords: [
			"start",
			"get started",
			"sign up",
			"signup",
			"register",
			"login",
			"log in",
			"account",
			"join",
			"开始",
			"注册",
			"登录",
			"账号",
			"加入",
			"daftar",
			"daftar akaun",
			"pendaftaran",
			"registration",
			"onboarding",
			"onboard",
			"try innocenz",
			"become member",
			"sign me up",
			"开户",
			"登记",
		],
		en: {
			chip: "Where do I start?",
			answer: {
				ordered: false,
				text: "It depends who you are:",
				steps: [
					{
						where: "Agency or outlet",
						what: "Tap Login at the top of this page. New here? On the login page tap “Sign up as Outlet or PR Agency”.",
					},
					{
						where: "PR",
						what: "Get the InnocenZ app from your agency and tap Create an account — you can pick your agency as you sign up, or later in Profile → Edit profile.",
					},
					{
						where: "Team member",
						what: "Joining an outlet or agency already on InnocenZ? On the sign-up page tap “Sign up as a team member” and pick the organisation; its owner approves you.",
					},
				],
			},
		},
		zh: {
			chip: "从哪里开始？",
			answer: {
				ordered: false,
				text: "看你是哪一方：",
				steps: [
					{
						where: "经纪公司或场所",
						what: "点本页顶部的「登录」。新用户在登录页点「注册为门店或 PR 经纪公司」。",
					},
					{
						where: "PR",
						what: "向经纪公司索取 InnocenZ App，点「创建账号」— 注册时就可以选择经纪公司，之后也可以在「我的」→「编辑资料」里添加。",
					},
					{
						where: "团队成员",
						what: "要加入已在 InnocenZ 上的门店或经纪公司？在注册页点「注册为团队成员」并选择机构，由东主批准。",
					},
				],
			},
		},
	},
	{
		id: "gen-language",
		role: "any",
		keywords: [
			"language",
			"chinese",
			"english",
			"malay",
			"bahasa",
			"melayu",
			"translate",
			"语言",
			"中文",
			"英文",
			"繁体",
			"简体",
			"马来",
			"mandarin",
			"bm",
			"tamil",
			"inggeris",
			"华语",
			"华文",
		],
		en: {
			chip: "Languages",
			answer: {
				text: "The agency and outlet portals switch between English and 中文. The PR app has English, 简体 and 繁體.",
				note: "Bahasa Melayu isn't offered today.",
			},
		},
		zh: {
			chip: "语言",
			answer: {
				text: "经纪公司和场所后台可在英文和中文之间切换。PR App 支持英文、简体和繁體。",
				note: "目前不提供马来文。",
			},
		},
	},
	{
		id: "gen-password",
		role: "any",
		keywords: [
			"password",
			"forgot",
			"reset",
			"otp",
			"verification code",
			"cant login",
			"cannot login",
			"密码",
			"忘记",
			"验证码",
			"登录不了",
			"kata laluan",
			"cant log in",
			"cannot log in",
			"cant sign in",
			"cannot sign in",
			"unable to login",
			"unable to log in",
			"login fail",
			"account locked",
			"locked out",
			"wrong password",
			"登不进",
			"进不去",
			"登入不了",
			"登陆不了",
			"cannot access",
			"cant access",
			"tak boleh login",
			"tak dapat login",
		],
		en: {
			chip: "Forgot my password",
			answer: {
				text: "Tap Forgot password on the login screen. We send you a code, and you set a new password with it.",
			},
		},
		zh: {
			chip: "忘记密码",
			answer: {
				text: "在登录页点忘记密码。我们会发给你一个验证码，用它设定新密码。",
			},
		},
	},
	{
		id: "gen-human",
		role: "any",
		keywords: [
			"human",
			"person",
			"real person",
			"talk to",
			"speak to",
			"contact",
			"demo",
			"call",
			"whatsapp",
			"phone number",
			"人工",
			"联系",
			"演示",
			"客服",
			"真人",
			"customer service",
			"customer support",
			"cs",
			"hotline",
			"live agent",
			"real agent",
			"live chat",
			"book a demo",
			"request demo",
			"cakap dengan",
			"support team",
			"pm me",
			"有电话吗",
			"联系电话",
			"客服电话",
			"你们的人",
		],
		en: {
			chip: "Talk to our team",
			answer: {
				text: "Of course — tap below to chat with our team on WhatsApp.",
				handoff: true,
			},
		},
		zh: {
			chip: "找我们的团队",
			answer: {
				text: "当然 — 点下面通过 WhatsApp 联系我们的团队。",
				handoff: true,
			},
		},
	},
];

/* -------------------------------------------------------------- small talk -- */

/*
 * "who", "rude" and "offtopic" were added on 2 Oct 2026 (owner, screenshot:
 * "are you stupid" answered "I'm not sure … ask our team on WhatsApp"). These
 * written replies are the BACKUP — shown when Gemini cannot answer (no key, or
 * the free key's 500-a-day cap is used up) — so they need the same manners.
 */
export type SmallTalkId =
	| "hello"
	| "thanks"
	| "bye"
	| "ok"
	| "who"
	| "rude"
	| "offtopic";

/* "who", "rude" and "offtopic" are read by exact rules in
 * landing-chat-manners.ts, never by these fuzzy keywords: "what are you" and
 * "real person" here took "what are you guys charging?" and "talk to a real
 * person" away from their answers (red team, 2 Oct 2026). */
const SMALL_TALK_KEYWORDS: Record<
	Exclude<SmallTalkId, "who" | "rude" | "offtopic">,
	string[]
> = {
	hello: [
		"hi",
		"hello",
		"hey",
		"hai",
		"helo",
		"yo",
		"good morning",
		"good evening",
		"good afternoon",
		"你好",
		"您好",
		"哈喽",
		"嗨",
		"在吗",
	],
	thanks: [
		"thanks",
		"thank you",
		"thank",
		"thx",
		"tq",
		"ty",
		"谢谢",
		"感谢",
		"多谢",
	],
	bye: ["bye", "goodbye", "see you", "再见", "拜拜"],
	ok: [
		"ok",
		"okay",
		"noted",
		"got it",
		"cool",
		"great",
		"nice",
		"好的",
		"明白",
		"知道了",
	],
};
/* A lone 好 is "ok" only as the WHOLE message: as a keyword it answered
 * 好贵 ("so expensive") and 好像有bug ("seems buggy") with "Great." */
const OK_ALONE = /^(好|好吧|好啊|好滴|好嘞|行|嗯嗯?)[!！。.~～]*$/;

export const SMALL_TALK: Record<
	LandingLocale,
	Record<SmallTalkId, ChatAnswer>
> = {
	en: {
		hello: {
			text: "Hi! Are you a PR, an agency or an outlet? Pick one below, or just ask me a question.",
		},
		thanks: { text: "You're welcome! Anything else I can help with?" },
		bye: { text: "Bye for now — I'm here whenever you need me." },
		ok: { text: "Great. What else would you like to know?" },
		who: {
			text: "I'm InnocenZ's assistant — a bot that answers from InnocenZ's own guide, here to help with shifts, check-in, pay, rosters and bookings. Are you a PR, an agency or an outlet?",
		},
		rude: {
			text: "Let's keep our chat respectful, please. I'm happy to help with anything about InnocenZ — are you a PR, an agency or an outlet?",
		},
		offtopic: {
			text: "That one's a little outside what I know — I'm InnocenZ's assistant, so I'm best with shifts, check-in, pay, rosters and bookings. Try one of the topics below!",
		},
	},
	zh: {
		hello: {
			text: "你好！你是 PR、经纪公司还是场所？在下面选一个，或直接问我。",
		},
		thanks: { text: "不客气！还有什么可以帮你？" },
		bye: { text: "再见 — 需要时随时找我。" },
		ok: { text: "好的。还想了解什么？" },
		who: {
			text: "我是 InnocenZ 的助手 — 一个根据 InnocenZ 官方说明回答问题的机器人，可以帮你了解班次、签到、薪资、排班和订 PR。你是 PR、经纪公司还是场所？",
		},
		rude: {
			text: "请保持礼貌交流，谢谢。我很乐意帮你了解 InnocenZ 的任何问题 — 你是 PR、经纪公司还是场所？",
		},
		offtopic: {
			text: "这个超出我能回答的范围了 — 我是 InnocenZ 的助手，最擅长班次、签到、薪资、排班和订 PR 的问题。试试下面的话题吧！",
		},
	},
};

/** The visitor's own words to quote back: about eight words (or 20 中文 characters) at most, as written. */
export function quoteOf(text: string): string {
	const t = text
		.trim()
		.replace(/\s+/g, " ")
		.replace(/[?？!！.。~]+$/, "");
	if (/[㐀-鿿]/.test(t)) return t.length > 20 ? `${t.slice(0, 20)}…` : t;
	const words = t.split(" ");
	return words.length > 8 ? `${words.slice(0, 8).join(" ")}…` : t;
}

/*
 * The written backup's off-topic reply, in the same words Gemini is told to use
 * (owner, 3 Oct 2026: "i'm not really sure about <what the user said>, I am
 * InnocenZ's assistant and happy to help you with how InnocenZ works and how to
 * join"). Without a quote (it swore, or nothing was kept) the plain line shows.
 */
export function offTopicAnswer(
	locale: LandingLocale,
	said: string | undefined,
): ChatAnswer {
	if (!said) return SMALL_TALK[locale].offtopic;
	return locale === "zh"
		? {
				text: `我不太确定“${said}”是什么意思，不过我是 InnocenZ 的助手，很乐意帮你了解 InnocenZ 怎么用、怎么加入。`,
			}
		: {
				text: `I'm not really sure about “${said}”, but I'm InnocenZ's assistant and happy to help you with how InnocenZ works and how to join.`,
			};
}

export const CHAT_FALLBACK: Record<LandingLocale, ChatAnswer> = {
	en: {
		text: "Hmm, I'm not sure about that one — and I'd rather not give you a wrong answer. Try one of the topics below, or ask our team directly on WhatsApp.",
		handoff: true,
	},
	zh: {
		text: "嗯，这个我不太确定 — 我不想给你错误的答案。试试下面的话题，或直接在 WhatsApp 问我们的团队。",
		handoff: true,
	},
};

/*
 * The human touches. A person doesn't answer every question with the same
 * flat opening, and they end by offering the next step — so a topic answer
 * opens with one of these (rotating, never random, so a re-render never
 * changes what was "said") and the reply closes with a follow-up question.
 */
export const LEAD_INS: Record<LandingLocale, string[]> = {
	en: ["Sure!", "Good question.", "Happy to help.", "Of course.", "Easy one."],
	zh: ["好的！", "好问题。", "乐意帮忙。", "当然。", "这个简单。"],
};

export const FOLLOW_UPS: Record<
	LandingLocale,
	{ topic: string[]; intro: string }
> = {
	en: {
		topic: [
			"Want me to walk you through “{next}” next?",
			"Anything else? I can also explain “{next}”.",
			"Shall I show you “{next}” too?",
		],
		intro:
			"Where would you like to start? Tap a topic below, or just type your question.",
	},
	zh: {
		topic: [
			"要不要我接着讲「{next}」？",
			"还有别的吗？我也可以讲讲「{next}」。",
			"要不要也看看「{next}」？",
		],
		intro: "想从哪里开始？点下面的话题，或直接输入你的问题。",
	},
};

/* --------------------------------------------------------------- matching -- */

/*
 * How a typed message is understood:
 *   1. Normalise — lower-case, drop apostrophes ("I'm" → "im"), punctuation to
 *      spaces. English becomes a list of words; 中文 is matched as a run of
 *      characters, because Chinese has no spaces between words.
 *   2. Score every topic by its keywords. An English keyword matches whole
 *      words only (so "app" never fires on "approve"), forgives plurals and
 *      -ed/-ing, and forgives one typo ("chek", "payrol", "rooster"). A longer
 *      phrase is more specific and scores more.
 *   3. The role the conversation is about breaks ties — "where is my
 *      薪资单?" answers the PR's voucher for a PR and payroll for an agency.
 *   4. "I run a bar" / "我是PR" switches the role, and a message that names
 *      one role and nothing else we know ("agency?") opens that role's guide.
 *   5. Greetings and thanks get a short reply; anything else gets an honest
 *      "I don't know" with a way to reach a person.
 */

const CJK = /[㐀-鿿豈-﫿]/;
const NOT_WORD = /[^a-z0-9㐀-鿿豈-﫿]+/g;
const CJK_RUN = /[㐀-鿿豈-﫿]+/g;

interface Prepared {
	words: string[];
	/** The whole message with no spaces — what 中文 keywords are found in. */
	compact: string;
}

/** Words that never change what a question is about — dropped so "cancel a
 * shift" and "cancel my shift" both read as "cancel shift". */
const ARTICLES = new Set(["a", "an", "the", "my", "our", "your"]);

function prepare(text: string): Prepared {
	const norm = text
		.toLowerCase()
		.replace(/['’`]/g, "")
		.replace(NOT_WORD, " ")
		.trim();
	return {
		words: norm
			.replace(CJK_RUN, " ")
			.split(" ")
			.filter((w) => w && !ARTICLES.has(w)),
		compact: norm.replace(/ /g, ""),
	};
}

/** Optimal-string-alignment distance, giving up once it passes `max`. */
function editDistance(a: string, b: string, max: number): number {
	const d: number[][] = [];
	for (let i = 0; i <= a.length; i++) d.push([i]);
	for (let j = 1; j <= b.length; j++) d[0].push(j);
	for (let i = 1; i <= a.length; i++) {
		let rowMin = Number.POSITIVE_INFINITY;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			let v = Math.min(
				d[i - 1][j] + 1,
				d[i][j - 1] + 1,
				d[i - 1][j - 1] + cost,
			);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				v = Math.min(v, d[i - 2][j - 2] + 1);
			}
			d[i][j] = v;
			rowMin = Math.min(rowMin, v);
		}
		if (rowMin > max) return max + 1;
	}
	return d[a.length][b.length];
}

/* "ment"/"ments" since 2 Oct 2026 (owner: "pay and payment") — "payment"
 * reads as "pay", "settlement" as "settle". */
const SUFFIXES = new Set([
	"s",
	"es",
	"ed",
	"d",
	"ing",
	"led",
	"ling",
	"ment",
	"ments",
]);

/** 1 = the same word (or its plural / -ed / -ing), 0.8 = a likely typo, 0 = no. */
function sameWord(said: string, keyword: string): number {
	if (said === keyword) return 1;
	if (said.startsWith(keyword) && SUFFIXES.has(said.slice(keyword.length))) {
		return 1;
	}
	if (keyword.endsWith("e") && said === `${keyword.slice(0, -1)}ing`) return 1;
	if (keyword.endsWith("y") && said === `${keyword.slice(0, -1)}ies`) return 1;
	const shorter = Math.min(said.length, keyword.length);
	const lengthGap = Math.abs(said.length - keyword.length);
	if (shorter < 4 || said[0] !== keyword[0]) return 0;
	/* A 4-letter word forgives only a dropped or extra letter ("chek"), never a
	 * swapped one — "tips" must not read as "tops". */
	if (shorter === 4 && lengthGap !== 1) return 0;
	const max = shorter >= 8 ? 2 : 1;
	if (lengthGap > max) return 0;
	return editDistance(said, keyword, max) <= max ? 0.8 : 0;
}

/** How strongly one keyword appears in the message (0 when it doesn't). */
function keywordScore(p: Prepared, keyword: string): number {
	if (CJK.test(keyword)) {
		const k = keyword.toLowerCase().replace(NOT_WORD, "");
		return p.compact.includes(k) ? Math.max(1, k.length / 2) : 0;
	}
	const kw = prepare(keyword).words;
	if (kw.length === 0 || kw.length > p.words.length) return 0;
	let best = 0;
	for (
		let start = 0;
		start + kw.length <= p.words.length && best < 1;
		start++
	) {
		let quality = 1;
		for (let w = 0; w < kw.length && quality > 0; w++) {
			quality = Math.min(quality, sameWord(p.words[start + w], kw[w]));
		}
		best = Math.max(best, quality);
	}
	return best * kw.length;
}

function score(p: Prepared, keywords: string[]): number {
	const hits = [...new Set(keywords)]
		.map((k) => ({ k, s: keywordScore(p, k) }))
		.filter((h) => h.s > 0);
	/* A 中文 keyword inside a longer one that also matched ("薪资" in "薪资单")
	 * is the same evidence twice — count only the longer one. */
	return hits
		.filter(
			(h) =>
				!CJK.test(h.k) ||
				!hits.some((o) => o.k !== h.k && CJK.test(o.k) && o.k.includes(h.k)),
		)
		.reduce((sum, h) => sum + h.s, 0);
}

/* Who the visitor says they are. */
type SpecificRole = Exclude<ChatRole, "general">;

const ROLE_WORDS: Record<SpecificRole, string[]> = {
	pr: ["pr", "promoter", "公关"],
	agency: ["agency", "经纪", "中介"],
	outlet: [
		"outlet",
		"venue",
		"bar",
		"club",
		"nightclub",
		"lounge",
		"ktv",
		"pub",
		"restaurant",
		"场所",
		"门店",
		"酒吧",
		"夜店",
		"酒廊",
	],
};

const IDENTITY = [
	["i", "am"],
	["im"],
	["i", "m"],
	["we", "are"],
	["as"],
	["i", "run"],
	["we", "run"],
	["i", "own"],
	["we", "own"],
	["i", "manage"],
	["we", "manage"],
	["i", "work", "as"],
];
const FILLER = new Set([
	"a",
	"an",
	"the",
	"one",
	"from",
	"of",
	"owner",
	"my",
	"our",
]);

const ZH_IDENTITY: Record<SpecificRole, RegExp> = {
	pr: /(我|我们)(是|做)(一)?(个|名)?(pr|公关)/,
	agency: /(我|我们)(是|开|经营|管理|有)(一)?(个|家|间)?(经纪|中介|agency)/,
	outlet:
		/(我|我们)(是|开|经营|管理|有)(一)?(个|家|间)?(场所|门店|酒吧|夜店|酒廊|outlet|ktv)/,
};

const ROLES: SpecificRole[] = ["pr", "agency", "outlet"];

function isRoleWord(word: string, role: SpecificRole): boolean {
	return ROLE_WORDS[role].some((w) => !CJK.test(w) && sameWord(word, w) === 1);
}

/** "I run a bar", "as a PR", "我是PR" → the role they named. */
function statedRole(p: Prepared): SpecificRole | null {
	for (const role of ROLES) if (ZH_IDENTITY[role].test(p.compact)) return role;
	const w = p.words;
	for (let i = 0; i < w.length; i++) {
		for (const id of IDENTITY) {
			if (!id.every((part, k) => w[i + k] === part)) continue;
			let j = i + id.length;
			while (j < w.length && FILLER.has(w[j])) j++;
			const next = w[j];
			if (!next) continue;
			for (const role of ROLES) if (isRoleWord(next, role)) return role;
		}
	}
	return null;
}

/**
 * A message that names exactly one role and matched no topic — "agency?",
 * "for outlets", "PR呢", "how do I become a PR" — opens that role's guide.
 * Two roles named at once is ambiguous, so it falls through.
 */
function mentionedRole(p: Prepared): SpecificRole | null {
	const named = ROLES.filter(
		(role) =>
			p.words.some((word) => isRoleWord(word, role)) ||
			ROLE_WORDS[role].some((w) => CJK.test(w) && p.compact.includes(w)),
	);
	return named.length === 1 ? named[0] : null;
}

/*
 * Is the message about InnocenZ at all? If not ("we are family", "recommend a
 * bar"), the backup answer is a polite redirect, not "ask our team on
 * WhatsApp" — the hand-off stays for real questions it cannot answer.
 */
const DOMAIN_EXTRA = [
	"innocenz",
	"pr",
	"prs",
	"agency",
	"outlet",
	"venue",
	"shift",
	"shifts",
	"pay",
	"paid",
	"salary",
	"wage",
	"voucher",
	"roster",
	"check",
	"checkin",
	"booking",
	"book",
	"job",
	"app",
	"login",
	"account",
	"password",
	"otp",
	"code",
	"bank",
	"receipt",
	"commission",
	"tips",
	"drinks",
	"mc",
	"leave",
	"swap",
	"rate",
	"tier",
	"subscription",
	"bill",
	"invoice",
	"approval",
	"sign",
	"signup",
	"register",
	"portal",
	"payroll",
	"dispute",
	"overtime",
	"ot",
	// Malay, so "bila gaji masuk" still gets help
	"gaji",
	"harga",
	"langganan",
	"yuran",
	"cuti",
	"daftar",
	"syif",
	"bayar",
	"akaun",
	// "what are you offering?" is a question about the product
	"offer",
	"offers",
	"offering",
	"features",
	"feature",
	"services",
];
const DOMAIN_ZH =
	/班|签到|签退|薪|工资|排班|经纪|场所|门店|结算|付款|账号|登录|注册|病假|请假|佣金|小费|酒水|收据|审批|订阅|账单/;
/* Everyday words the topic keywords also use ("tell me about", "how does it
 * work") — they say nothing about InnocenZ, so "tell me a joke" is not one. */
const EVERYDAY = new Set([
	"what",
	"how",
	"you",
	"about",
	"work",
	"works",
	"tell",
	"does",
	"can",
	"and",
	"for",
	"this",
	"that",
	"get",
	"see",
	"where",
	"when",
	"why",
	"who",
	"need",
	"want",
	"have",
	"will",
	"much",
	"any",
	"not",
	"with",
	"from",
	"there",
	"they",
	"them",
	"help",
	"know",
	"use",
	"make",
	"way",
	"ask",
	"just",
	"only",
	"also",
	"into",
	"out",
	"one",
	"all",
	"now",
	"new",
	"more",
	"still",
	"then",
	"than",
	"has",
	"had",
	"did",
	"was",
	"were",
	"are",
	"his",
	"her",
	"she",
	"yes",
	"please",
	"thanks",
	"thank",
	"hello",
	"whats",
	"youre",
	"old",
	"best",
	"name",
	"created",
	"off",
	/* Malay and Manglish fillers (vocabulary workflow, 3 Oct 2026): the new
	 * keywords carry them ("tak dapat datang", "siapa bayar gaji"), and without
	 * this list chit-chat built on them ("apa khabar", "ada tak tempat best")
	 * stopped getting the polite off-topic redirect (41 → 5 of 49). */
	"tak",
	"ada",
	"apa",
	"siapa",
	"datang",
	"dapat",
	"boleh",
	"yang",
	"buat",
	"untuk",
	"nak",
	"ini",
	"itu",
	"dua",
	"lain",
	"minta",
	"sebagai",
	"keluar",
	"balik",
	"cakap",
	"dengan",
	"berapa",
	"kata",
	"kurang",
	"saya",
	"aku",
	"kita",
	"mana",
	"bila",
	"macam",
	"sini",
	"sana",
	"lah",
	"leh",
	"lor",
	"wei",
	"got",
	"guys",
	"kind",
	"quick",
	"explain",
	"become",
	"double",
	"multiple",
	"unable",
	"fewer",
	"flow",
	"wat",
	"emergency",
	"backup",
	"replace",
	"less",
	"very",
	"really",
	"much",
]);
let domain: Set<string> | null = null;

/** Names InnocenZ itself (the hand-picked words, not the whole guide) — so the
 * early off-topic check never fires on "can PR cancel a shift in bad weather". */
function namesInnocenz(p: Prepared): boolean {
	return (
		p.words.some((w) => DOMAIN_EXTRA.includes(w)) || DOMAIN_ZH.test(p.compact)
	);
}

/*
 * The vocabulary is every word the guide itself uses — topic keywords and
 * answers, and the whole AI reference — so "what does the bell tell me?" or
 * "how they calculate my OT?" is still a question about InnocenZ. A sweep of
 * 465 real questions found 31 called off-topic when only keywords were used.
 * 中文 is never called off-topic: without spaces between words there is no
 * reliable test, and a wrong redirect costs a real question its WhatsApp help.
 */
function aboutInnocenz(p: Prepared): boolean {
	if (CJK.test(p.compact)) return true;
	if (!domain) {
		const known = new Set(DOMAIN_EXTRA);
		const add = (text: string) => {
			for (const w of prepare(text).words)
				if (w.length >= 3 && !EVERYDAY.has(w)) known.add(w);
		};
		for (const t of CHAT_TOPICS) {
			t.keywords.forEach(add);
			add(t.en.chip);
			add(answerLines(t.en.answer, t.role, "en").join(" "));
		}
		for (const r of CHAT_REFERENCE)
			add(`${r.en.title} ${r.en.lines.join(" ")}`);
		domain = known;
	}
	const known = domain;
	return p.words.some((w) => known.has(w)) || DOMAIN_ZH.test(p.compact);
}

function smallTalk(p: Prepared): SmallTalkId | null {
	if (OK_ALONE.test(p.compact)) return "ok";
	if (p.words.length > 5 || p.compact.length > 24) return null;
	let best: SmallTalkId | null = null;
	let bestScore = 0;
	for (const id of Object.keys(
		SMALL_TALK_KEYWORDS,
	) as (keyof typeof SMALL_TALK_KEYWORDS)[]) {
		const s = score(p, SMALL_TALK_KEYWORDS[id]);
		if (s > bestScore) {
			best = id;
			bestScore = s;
		}
	}
	return best;
}

/* What the bot says back, and what it offers next. */

export type ChatReply =
	| { kind: "welcome" }
	| { kind: "intro"; role: ChatRole }
	| { kind: "topic"; id: string }
	/* `said`: the visitor's own words, quoted back by the off-topic reply. */
	| { kind: "small"; id: SmallTalkId; said?: string }
	| { kind: "fallback"; question: string }
	/* A section of the AI's verified reference (landing-chat-reference.ts),
	 * found by `findReference` when no short topic matches. */
	| { kind: "reference"; id: string }
	/* Gemini's answer, written from `factSheet()` — only these verified facts,
	 * never its own knowledge — in the same shape as a written answer, so it
	 * renders with the same page headings and numbered steps. */
	| {
			kind: "ai";
			question: string;
			/** Typed by the visitor (not a chip), so it goes into the WhatsApp text. */
			typed: boolean;
			/** The language it was written in; after a switch the backup shows. */
			locale: LandingLocale;
			answer: ChatAnswer;
			/** One follow-up the visitor can tap ("How do I sign my voucher?"). */
			more?: string;
			/** The written answer for the same question, for a language switch. */
			backup: WrittenReply;
	  };

/** A reply this file can write by itself — everything but the AI's. */
export type WrittenReply = Exclude<ChatReply, { kind: "ai" }>;

export type ChatChip =
	| { kind: "role"; role: ChatRole }
	| { kind: "topic"; id: string }
	/** The AI's "tell me more" — tapping it asks this question. */
	| { kind: "ask"; text: string };

export interface Understanding {
	reply: WrittenReply;
	/** The role the conversation is about after this message. */
	role: ChatRole | null;
	next: ChatChip[];
}

export const ROLE_CHIPS: ChatChip[] = [
	{ kind: "role", role: "pr" },
	{ kind: "role", role: "agency" },
	{ kind: "role", role: "outlet" },
	{ kind: "role", role: "general" },
];

export const MAX_CHIPS = 4;

/**
 * The AI's "tell me more" leads the suggestions, as the follow-up asks — minus
 * any written chip that asks the same question. Gemini often picks a question
 * that is already a chip ("What is InnocenZ?" after an off-topic message), and
 * the same button then sat beside itself (2 Oct 2026). Compared on the words
 * alone: case, spacing, quotes and the closing "?" / "？" do not count.
 */
export function withAiFollowUp(
	more: string | undefined,
	next: ChatChip[],
	labelOf: (chip: ChatChip) => string,
): ChatChip[] {
	if (!more) return next;
	const words = (s: string) =>
		s.toLowerCase().replace(/[\s?？.。!！'"‘’“”「」]+/g, "");
	return [
		{ kind: "ask" as const, text: more },
		...next.filter((chip) => words(labelOf(chip)) !== words(more)),
	].slice(0, MAX_CHIPS);
}

/**
 * What to offer next: close matches first, then this role's topics, then
 * general ones. With no role yet, the role choices themselves come next, since
 * knowing who is asking is what makes every later answer fit.
 */
export function nextChips(
	role: ChatRole | null,
	asked: ReadonlySet<string>,
	related: string[] = [],
): ChatChip[] {
	const fresh = (ids: string[]) =>
		[...new Set(ids)]
			.filter((id) => !asked.has(id))
			.map((id): ChatChip => ({ kind: "topic", id }));
	if (!role) {
		return [...fresh(related).slice(0, 1), ...ROLE_CHIPS.slice(0, 3)];
	}
	const own =
		role === "general" ? [] : CHAT_TOPICS.filter((t) => t.role === role);
	const general = CHAT_TOPICS.filter((t) => t.role === "any");
	return fresh([
		...related,
		...own.map((t) => t.id),
		...general.map((t) => t.id),
	]).slice(0, MAX_CHIPS);
}

export function topicById(id: string): ChatTopic | undefined {
	return CHAT_TOPICS.find((t) => t.id === id);
}

/* ------------------------------------------------------- steps by page -- */

/*
 * Owner, 1 Oct 2026: reply as "Payroll page" and then the steps 1) 2) 3) —
 * not a badge repeated on every line. So consecutive steps that happen in the
 * same place are grouped under one heading, and the heading says what KIND of
 * place it is: a PAGE in the agency/outlet web portal, a TAB in the PR app.
 * Anything else ("Your phone", "Sign up", "Money") is shown as written.
 *
 * The kind is decided by WHO the answer is for, not by the name alone: "Today"
 * is a page in the outlet portal and a tab in the PR app.
 */

/** The PR app's bottom tabs — apps/mobile i18n `nav`, en and 简体. */
const PR_TABS: Record<LandingLocale, string[]> = {
	en: ["Today", "Check-In", "Payment", "History", "Profile"],
	zh: ["今日", "签到", "结算", "记录", "我的"],
};

/** The web portal's pages — portal-i18n `nav`, en and 中文. */
const PORTAL_PAGES: Record<LandingLocale, string[]> = {
	en: [
		"Today",
		"Roster",
		"Approvals",
		"Payroll",
		"History",
		"Manage PR",
		"Manage Outlet",
		"Post Job",
		"Calendar",
		"Calendar page",
		"Workspace",
		"Reports",
		"Settings",
		"Subscription",
	],
	zh: [
		"今天",
		"排班",
		"审批",
		"薪资",
		"历史记录",
		"PR 管理",
		"门店管理",
		"发布职位",
		"日历",
		"工作区",
		"报表",
		"设置",
		"订阅",
	],
};

/** Who an answer is for, which decides whether its places are tabs or pages. */
export function answerRole(reply: ChatReply): ChatRole | "any" {
	if (reply.kind === "intro") return reply.role;
	if (reply.kind === "topic") return topicById(reply.id)?.role ?? "any";
	return "any";
}

/** "Payroll" → "Payroll page", "Payment" → "Payment tab", "Your phone" stays. */
export function placeHeading(
	where: string,
	role: ChatRole | "any",
	locale: LandingLocale,
): string {
	/* "Settings → Attendance" is a section of the Settings page. */
	const first = where.split(" → ")[0];
	const tab = role === "pr" && PR_TABS[locale].includes(first);
	const page =
		(role === "agency" || role === "outlet") &&
		PORTAL_PAGES[locale].includes(first);
	if (locale === "zh") {
		if (tab) return `「${where}」分页`;
		if (page) return `「${where}」页面`;
		return where;
	}
	if (tab) return `${where} tab`;
	/* The outlet sidebar's own label is "Calendar page" — never "page page". */
	if (page) return /\bpage$/i.test(where) ? where : `${where} page`;
	return where;
}

export interface StepGroup {
	where: string;
	/** Each step with its number across the whole answer (1-based). */
	steps: { n: number; what: string }[];
}

/** Consecutive steps in the same place become one group; numbering runs on. */
export function groupSteps(steps: ChatStep[]): StepGroup[] {
	const groups: StepGroup[] = [];
	steps.forEach((s, i) => {
		const last = groups[groups.length - 1];
		const step = { n: i + 1, what: s.what };
		if (last && last.where === s.where) last.steps.push(step);
		else groups.push({ where: s.where, steps: [step] });
	});
	return groups;
}

/** Read one typed message and decide the reply. Pure — no state, no network. */
export function understand(
	text: string,
	role: ChatRole | null,
	asked: ReadonlySet<string>,
): Understanding {
	const said = prepare(text);
	const m = mannersOf(text);
	const polite = (id: SmallTalkId, quote?: string): Understanding => ({
		reply: { kind: "small", id, ...(quote ? { said: quote } : {}) },
		role,
		next: role ? nextChips(role, asked) : ROLE_CHIPS,
	});
	/* Off-topic replies quote the visitor's own words back (owner, 3 Oct
	 * 2026: "I'm not really sure about …") — never words that swear. */
	const quote = m.hard || m.soft ? undefined : quoteOf(text);
	/* Order matters (red team, 2 Oct 2026): a slur or threat is never answered
	 * as anything else; "who are you" and plain chit-chat ("what's the weather
	 * today") go before the topics, whose keywords would grab "today". */
	if (m.hard) return polite("rude");
	if (asksWhoItIs(text)) return polite("who");
	if (OFF_TOPIC.test(text.toLowerCase()) && !namesInnocenz(said))
		return polite("offtopic", quote);
	/* OT and MC/leave mean something different to each side, so the side picks
	 * the verified answer rather than one keyword (owner, 3 Oct 2026). */
	const routed =
		overtimeSection(text, role) ??
		leaveSection(text, role) ??
		checkinSection(text, role);
	if (routed === "pr-leave") {
		return {
			reply: { kind: "topic", id: "pr-leave" },
			role,
			next: nextChips(role, new Set(asked).add("pr-leave")),
		};
	}
	if (routed) {
		return {
			reply: { kind: "reference", id: routed },
			role,
			next: nextChips(role, asked),
		};
	}
	/* The best section that passes every check — the top match may not. */
	const section = referenceCandidates(text, role)
		.slice(0, 5)
		.find((m) => sectionFirst(m, role, text));
	if (section) {
		return {
			reply: { kind: "reference", id: section.id },
			role,
			next: nextChips(role, asked),
		};
	}
	/* Swear words are dropped before matching — the typo-forgiving matcher
	 * reads "shit" as "shift" and "hell" as "hello". */
	const p = m.soft
		? { ...said, words: said.words.filter((w) => !isAbuseWord(w)) }
		: said;
	const stated = statedRole(p);
	const context: ChatRole | null = stated ?? role;

	const ranked = CHAT_TOPICS.map((topic) => {
		const base = score(p, topic.keywords);
		const ours =
			topic.role === context || (context === "general" && topic.role === "any");
		const bonus = base > 0 && ours ? 0.75 : 0;
		return { topic, base, total: base + bonus };
	})
		.filter((r) => r.base >= 0.8)
		.sort((a, b) => b.total - a.total);

	const best = ranked[0];
	/* Swearing with a real question ("this is shit why cannot check in") gets
	 * the answer; swearing with nothing to answer is asked to keep it polite. */
	if (m.soft && !(best && m.asking)) return polite("rude");
	if (best) {
		/* Close runners-up become the next suggestions — but only from the
		 * visitor's own side: a PR asking about check-in is not offered the
		 * outlet's "Set up attendance". */
		const related = ranked
			.slice(1)
			.filter(
				(r) =>
					r.total >= best.total * 0.6 &&
					(!context ||
						context === "general" ||
						r.topic.role === context ||
						r.topic.role === "any"),
			)
			.map((r) => r.topic.id);
		const done = new Set(asked).add(best.topic.id);
		return {
			reply: { kind: "topic", id: best.topic.id },
			role: context,
			next: nextChips(context, done, related),
		};
	}

	const named = stated ?? mentionedRole(p);
	if (named) {
		return {
			reply: { kind: "intro", role: named },
			role: named,
			next: nextChips(named, asked),
		};
	}

	const small = smallTalk(p);
	if (small) {
		return {
			reply: { kind: "small", id: small },
			role,
			next: small === "hello" && !role ? ROLE_CHIPS : nextChips(role, asked),
		};
	}

	/* No short topic fits: answer from the verified reference before giving up
	 * (owner, 2 Oct 2026, screenshot: "payment" → "I'm not sure …"). */
	const found = findReference(text, role);
	if (found) {
		return {
			reply: { kind: "reference", id: found },
			role,
			next: nextChips(role, asked),
		};
	}

	if (!aboutInnocenz(p)) return polite("offtopic", quote);

	return {
		reply: { kind: "fallback", question: text.trim() },
		role,
		next: nextChips(role, asked),
	};
}

/* ------------------------------------------------- reference look-up (backup) -- */

/*
 * When Gemini cannot answer, the written backup still has the 160 verified
 * reference sections. A small search finds the best one:
 *  - English words are cut to a stem, so "payment" finds "pay";
 *  - 中文 is matched in two-character pieces (there are no spaces);
 *  - rare words count more than common ones, a title three times a line;
 *  - sections for the visitor's own side lead;
 *  - below MIN_REFERENCE_SCORE nothing is returned, so chit-chat never gets a
 *    random section.
 */
const MIN_REFERENCE_SCORE = 4;
const ZH_COMMON = new Set([
	"什么",
	"怎么",
	"可以",
	"我的",
	"你们",
	"这个",
	"一个",
	"是不",
	"不是",
	"如果",
	"为什",
	"么时",
	"时候",
	"哪里",
	"要怎",
	"怎样",
	"有没",
	"没有",
	"多少",
	"需要",
	"吗？",
	"我们",
	"他们",
	"现在",
	"今天",
]);

/* Two-letter words that mean something here; every other short word ("we",
 * "is", "my") is noise that once matched "we are family" to a section. */
const SHORT_TERMS = new Set(["pr", "ot", "mc", "ic", "pv"]);

/* A piece holding a filler character (怎么, 用吗, 以在 …) says nothing about the
 * subject, and counting it made short 中文 questions miss their section. */
const ZH_FILLER =
	/[怎么吗呢吧的了是我你他她它们这那个在要会能可以把被让给就都也还很太啊呀嘛哦]/;

function stem(word: string): string {
	let w = word;
	if (w.length > 6 && w.endsWith("ment")) w = w.slice(0, -4);
	else if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
	else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
	if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
	/* "cancelling" → "cancell" → "cancel", "stopped" → "stopp" → "stop" */
	if (w.length > 4 && /([bdglmnprt])\1$/.test(w)) w = w.slice(0, -1);
	return w;
}

function terms(text: string): string[] {
	const p = prepare(text);
	const out = p.words
		.filter((w) => (w.length >= 3 || SHORT_TERMS.has(w)) && !EVERYDAY.has(w))
		.map(stem);
	for (const run of text.match(/[㐀-鿿豈-﫿]+/g) ?? [])
		for (let i = 0; i + 1 < run.length; i++) {
			const bi = run.slice(i, i + 2);
			if (!ZH_COMMON.has(bi) && !ZH_FILLER.test(bi)) out.push(bi);
		}
	return out;
}

interface RefIndex {
	docs: {
		id: string;
		role: ReferenceRole;
		title: Set<string>;
		/** The title's words in each language — how much of it a message covers. */
		titleEn: Set<string>;
		titleZh: Set<string>;
		/** Both titles, for the kind of question they ask (why / when / how much). */
		titleText: string;
		/** Each other way people ask this section (`asks`), as words. */
		asks: Set<string>[];
		askWords: Set<string>;
		body: Set<string>;
	}[];
	idf: Map<string, number>;
}
type ReferenceRole = (typeof CHAT_REFERENCE)[number]["role"];
let refIndex: RefIndex | null = null;

function referenceIndex(): RefIndex {
	if (refIndex) return refIndex;
	const docs = CHAT_REFERENCE.map((r) => ({
		id: r.id,
		role: r.role,
		title: new Set(terms(`${r.en.title} ${r.zh.title}`)),
		titleEn: new Set(terms(r.en.title)),
		titleZh: new Set(terms(r.zh.title)),
		titleText: `${r.en.title} ${r.zh.title}`,
		asks: (r.asks ?? [])
			.map((a) => new Set(terms(a)))
			.filter((a) => a.size > 0),
		askWords: new Set((r.asks ?? []).flatMap((a) => terms(a))),
		body: new Set(terms(`${r.en.lines.join(" ")} ${r.zh.lines.join(" ")}`)),
	}));
	const df = new Map<string, number>();
	/* The other phrasings count too, or their own words would weigh nothing. */
	for (const d of docs)
		for (const t of new Set([...d.title, ...d.askWords, ...d.body]))
			df.set(t, (df.get(t) ?? 0) + 1);
	const n = docs.length;
	const idf = new Map<string, number>();
	for (const [t, c] of df) idf.set(t, Math.log((n + 1) / (c + 0.5)));
	refIndex = { docs, idf };
	return refIndex;
}

/** The id of the verified reference section that best answers `text`, if any. */
export function findReference(
	text: string,
	role: ChatRole | null,
): string | null {
	return referenceMatch(text, role)?.id ?? null;
}

export interface ReferenceMatch {
	id: string;
	role: ReferenceRole;
	score: number;
	/** How many of the message's words are in the section's title question. */
	inTitle: number;
	matched: number;
	/** Share of the title's words (in the message's language) the message has. */
	titleCover: number;
	titleText: string;
	/** How many meaningful words the message itself has. */
	asked: number;
}

/** The best verified section for `text`, with how well it matched. */
export function referenceMatch(
	text: string,
	role: ChatRole | null,
): ReferenceMatch | null {
	return referenceCandidates(text, role)[0] ?? null;
}

/** Every section that matches `text` well enough, best first. */
export function referenceCandidates(
	text: string,
	role: ChatRole | null,
): ReferenceMatch[] {
	const { docs, idf } = referenceIndex();
	const q = [...new Set(terms(text))];
	if (q.length === 0) return [];
	const zh = CJK.test(text);
	const found: ReferenceMatch[] = [];
	for (const d of docs) {
		let score = 0;
		let matched = 0;
		let inTitle = 0;
		for (const t of q) {
			const w = idf.get(t) ?? 0;
			/* A word from one of the section's other phrasings counts like a title word. */
			if (d.title.has(t) || d.askWords.has(t)) {
				score += 3 * w;
				matched++;
				inTitle++;
			} else if (d.body.has(t)) {
				score += w;
				matched++;
			}
		}
		/* One loose word is not a match — "holiday plan to bali" once got the
		 * unavailable-days section. Two of the message's words, and at least
		 * half of them, must be found; a question of one or two words may match
		 * on a title word ("available in singapore?"). */
		const enough =
			(matched >= 2 && matched * 2 >= q.length) ||
			(q.length <= 2 && inTitle >= 1);
		if (!enough) continue;
		if (role && role !== "general")
			score *= d.role === role ? 1.25 : d.role === "any" ? 1 : 0.8;
		if (score < MIN_REFERENCE_SCORE) continue;
		const own = zh ? d.titleZh : d.titleEn;
		const cover = (words: Set<string>) =>
			words.size ? q.filter((t) => words.has(t)).length / words.size : 0;
		/* Covered = the best fit among the title and the other phrasings. */
		const titleCover = Math.max(cover(own), ...d.asks.map(cover));
		found.push({
			id: d.id,
			role: d.role,
			score,
			inTitle,
			matched,
			titleCover,
			titleText: d.titleText,
			asked: q.length,
		});
	}
	return found.sort((a, b) => b.score - a.score);
}

/*
 * Section first (owner, 3 Oct 2026: "make the chatbot smarter on all of the
 * questions too"). Each verified section's title IS a user's question ("Why
 * can't I check out?", "How much does cancelling a shift cost?"). When a
 * message shares SECTION_FIRST_TITLE_HITS of its words with such a title, for
 * the visitor's own side (or everyone's), that section answers it — not the
 * broader hand-written topic, which stays for general how-to questions.
 * Measured on a 391-question benchmark written from the sections themselves.
 */
const SECTION_FIRST_TITLE_HITS = 2;
const SECTION_FIRST_SCORE = 6;
/* A blind judge compared all 232 answers this rule changed: the section won
 * 185, the topic 31. The 31 came in three kinds, each now a check below. */
const SECTION_FIRST_COVER = 0.5;
/** A title asking WHY / WHEN / HOW MUCH / WHAT HAPPENS answers only a message that asks it. */
const TITLE_INTENT: [RegExp, RegExp][] = [
	[
		/\b(why|cant|can't|cannot|won't|wont|refused|blocked|disabled)\b|为什么|不能|不了/i,
		/\b(why|cant|can't|cannot|won't|wont|not|fail|failed|refuse|refused|blocked|disabled|error|stuck|unable|kenapa|tak boleh|tak dapat)\b|为什么|不能|不了|不到|无法|没法/i,
	],
	[
		/\bwhen\b|什么时候|几时/i,
		/\b(when|bila|what time|which day|how long)\b|什么时候|几时|多久|哪天/i,
	],
	[
		/\b(how much|cost|costs)\b|多少钱|费用/i,
		/\b(how much|cost|costs|fee|fees|charge|charged|berapa|price|rm|kena)\b|多少|费|钱|收费|罚/i,
	],
	[
		/\bwhat happens\b|会怎样/i,
		/\b(what happens|happen|after|then|if|kalau|approved|rejected|status)\b|会怎|之后|以后|如果|批准|驳回/i,
	],
];

function sectionFirst(
	m: ReferenceMatch,
	role: ChatRole | null,
	text: string,
): boolean {
	if (m.inTitle < SECTION_FIRST_TITLE_HITS || m.score < SECTION_FIRST_SCORE)
		return false;
	/* "can i join 2 agency" is not "How do STAFF join an existing outlet or agency?" */
	if (m.titleCover < SECTION_FIRST_COVER) return false;
	/* A one- or two-word message ("post job") needs the WHOLE title — else the
	 * broad topic answers it (judged better for vague messages). */
	if (m.asked <= 2 && m.titleCover < 1) return false;
	/* "post job" is not "Why can't I post a job?" */
	for (const [asks, needs] of TITLE_INTENT)
		if (asks.test(m.titleText) && !needs.test(text)) return false;
	/* Side unknown: "does innocenz pay the PRs?" wants the answer for everyone,
	 * not the outlet's or the agency's version — unless the match is very strong. */
	if (!role || role === "general") return m.role === "any" || m.inTitle >= 3;
	return m.role === role || m.role === "any";
}

/*
 * Overtime means something different to each side (owner, 3 Oct 2026: "make
 * the chatbot smarter on OT questions too"): a PR wants how it is counted and
 * paid, an agency where to approve it, an outlet its OT rate. No single keyword
 * can say that — every bare "OT" keyword stole another topic's questions — so
 * the side picks the verified section; with no side, the words do ("approve",
 * "claims", 审批 → agency; "rate", "tier", "per hour" → outlet; else the PR).
 */
const OVERTIME = /\b(ot|overtime|over time|over-time|lebih masa)\b|加班/i;
const OT_AGENCY =
	/\b(approve|approval|approvals|approving|reject|claims|payroll|decide|lulus)\b|审批|批准|核准/i;
const OT_OUTLET = /\b(rate|rates|tier|tiers|per hour|rm\/hr|card)\b|费率|等级/i;

function overtimeSection(text: string, role: ChatRole | null): string | null {
	if (!OVERTIME.test(text)) return null;
	if (role === "pr") return "ref-pr-overtime";
	if (role === "agency") return "ref-agency-overtime";
	if (role === "outlet") return "ref-outlet-rate-card";
	if (OT_AGENCY.test(text)) return "ref-agency-overtime";
	if (OT_OUTLET.test(text)) return "ref-outlet-rate-card";
	return "ref-pr-overtime";
}

/*
 * MC and leave, by side (owner, 3 Oct 2026: "make the chatbot smarter on MC
 * and leave questions too"). A PR asking HOW gets the hand-written "MC, leave
 * or a day off" topic; what happens next, fines and planning days off get
 * their verified sections. An agency gets approving, the MC cap rule or
 * filling the gap; an outlet how the gap is filled, or what it can't see.
 * Leaving an AGENCY ("leave my agency", 退出公司) and leaving EARLY ("can I
 * leave early", 先走) are other questions and are left to the topics.
 */
const LEAVE =
	/\b(mc|mcs|medical|sick|leave|cuti|demam|fever|ill|day off|off day|unavailable|not available)\b|病假|请假|休假|生病|不舒服|发烧|不可接班/i;
const NOT_LEAVE =
	/\bleave (my |the |this |an? |our )?(agency|agencies|company|agensi)\b|\bleave (early|now|first)\b|\bkeluar agensi\b|退出|离开(公司|经纪)|先走|早走/i;
const LEAVE_AFTER =
	/\b(after|approved|rejected|status|pending|happens|result|outcome|accepted)\b|批准了|驳回|结果|之后|以后|审核中/i;
const LEAVE_FINE =
	/\b(fine|fines|penalty|penalties|deduct|deducted|deduction|cap|max|maximum|limit|how many|kena)\b|罚|扣|上限|几天/i;
const LEAVE_PLAN =
	/\b(undo|plan|advance|ahead|block|reopen|in advance)\b|预先|提前|取消不可|恢复/i;
const LEAVE_AGENCY =
	/\b(approve|approval|approvals|reject|decide|excuse)\b|审批|批准|核准/i;
const LEAVE_RULE =
	/\b(rule|rules|cap|max|limit|fine|penalty|penalties)\b|规则|罚|上限/i;
const LEAVE_GAP =
	/\b(replace|replacement|backfill|cover|gap|short|who will come)\b|补位|替补|补人|缺人/i;
const LEAVE_PRIVACY =
	/\b(photo|see|view|proof|letter|document)\b|照片|证明|看到/i;

function leaveSection(text: string, role: ChatRole | null): string | null {
	if (!LEAVE.test(text) || NOT_LEAVE.test(text)) return null;
	const side =
		role === "agency" || role === "outlet" || role === "pr"
			? role
			: LEAVE_AGENCY.test(text) || LEAVE_GAP.test(text)
				? "agency"
				: "pr";
	if (side === "agency") {
		if (LEAVE_RULE.test(text)) return "ref-agency-penalty-rules";
		if (LEAVE_GAP.test(text)) return "ref-agency-backfill";
		return "ref-agency-mc-decision";
	}
	if (side === "outlet")
		return LEAVE_PRIVACY.test(text)
			? "ref-shared-privacy-outlet"
			: "ref-agency-backfill";
	if (LEAVE_FINE.test(text)) return "ref-pr-penalties";
	if (LEAVE_AFTER.test(text)) return "ref-pr-mc-after";
	if (LEAVE_PLAN.test(text)) return "ref-pr-unavailable-days";
	return "pr-leave";
}

/*
 * Check-in SITUATIONS, by side (owner, 3 Oct 2026: "make the chatbot smarter
 * on check-in questions too"). Only a specific situation is routed — check-in
 * won't work, can't or forgot to check out, a missed shift, coming late, a
 * no-show, where PRs checked in, the pin, the fence, tonight's statuses,
 * fining late PRs. A plain "how do I check in / set up attendance" keeps its
 * hand-written topic (null here). "Track my location" stays a privacy
 * question and "my pay is late" is not about check-in.
 */
const CHECKIN =
	/\b(check ?in|check-in|checkin|check ?out|check-out|checkout|clock ?(in|out)|punch|attendance|kehadiran|geo ?fence|fence|radius|pin|gps|location|no.?show|absent|turn up|turned up|didnt come|did not come|never came)\b|\b(come|came|coming|arrive|arrived|running|am|im) late\b|\blateness\b|\bchecked ?(in|out)\b|\bmiss(ed)? (my |the |a )?shift\b|签到|签退|签不到|签不了|打卡|打不到卡|打不了卡|退不了|定位|围栏|迟到|没来|缺勤|没签/i;
/* Privacy, not check-in: "is my gps always on", "can agency see my location
 * 24 hours", "background location ah?" keep the tracking answer. */
const NOT_CHECKIN =
	/\b(track|tracking|tracked|spy|monitor|follow me|background|always on|24\/7|24 ?hours?|recorded|see my location|watch me)\b|追踪|跟踪|监视|后台|一直定位/i;
const SIDE_OUTLET =
	/\b(pin|radius|fence|geofence|my venue|our venue|my outlet|our outlet|my bar|my club)\b|定位点|围栏|半径/i;
const SIDE_AGENCY =
	/\b(my prs|our prs|my pr|our pr|roster|proof|mark|no.?show button)\b|我的 ?pr|排班/i;
const CANT_OUT =
	/\b(cant|cannot|can't|unable|tak boleh|tak dapat|not able to|fail|failed|error|stuck)\b.{0,20}\b(check ?out|clock ?out|checkout)\b|签不了退|签退不了|退不了/i;
const FORGOT_OUT =
	/\b(forgot|forget|lupa|didnt|did not)\b.{0,20}\b(check ?out|clock ?out|checkout)\b|忘了签退|忘记签退|没签退/i;
const MISSED =
	/\b(missed|miss|forgot|forget|lupa|didnt|did not|never)\b.{0,20}\b(check ?in|checkin|clock ?in|shift)\b|\bno.?show\b|错过|没签到|忘了签到|忘记签到/i;
const TROUBLE =
	/\b(cant|cannot|can't|unable|not working|fail|failed|error|too far|far|distance|gps|location|mock|fake|wrong|why|stuck|tak boleh|tak dapat|refresh)\b|签不到|打不到|签不了|打不了|定位不准|太远|位置不对/i;
const LATE =
	/\b(come|came|coming|arrive|arrived|running|am|im) late\b|\blateness\b|迟到/i;
const FINE = /\b(fine|fines|penalty|penalties|deduct|charge)\b|罚|扣/i;
const WHO_TONIGHT =
	/\b(who|status|statuses|on.?duty|booked|released|tonight|arrived|here)\b|谁|状态|在岗|今晚/i;
const SET_PIN =
	/\b(set|setup|set up|change|move|update|where|add|radius)\b|设置|设定|更改|修改/i;

function checkinSection(text: string, role: ChatRole | null): string | null {
	if (!CHECKIN.test(text) || NOT_CHECKIN.test(text)) return null;
	const side =
		role === "pr" || role === "agency" || role === "outlet"
			? role
			: SIDE_OUTLET.test(text)
				? "outlet"
				: SIDE_AGENCY.test(text)
					? "agency"
					: "pr";
	if (side === "outlet") {
		if (
			LATE.test(text) ||
			FINE.test(text) ||
			/\babsent\b|缺勤|没来/i.test(text)
		)
			return "ref-outlet-no-penalties";
		if (/\b(pin|radius)\b|定位点|半径/i.test(text) && SET_PIN.test(text))
			return "ref-outlet-pin-setup";
		if (
			/\b(fence|geofence|far|gps|fake|mock|accuracy|leeway)\b|围栏|太远/i.test(
				text,
			)
		)
			return "ref-outlet-fence-rules";
		if (WHO_TONIGHT.test(text)) return "ref-outlet-pr-status";
		return null;
	}
	if (side === "agency") {
		/* "deduct pay for no show" is a penalty-rule question, not the no-show steps. */
		if (FINE.test(text)) return "ref-agency-penalty-rules";
		if (
			/\bno.?show\b|\b(absent|didnt come|did not come|never came|turn up|turned up)\b|没来|缺勤/i.test(
				text,
			)
		)
			return "ref-agency-no-show";
		if (LATE.test(text) && FINE.test(text)) return "ref-agency-penalty-rules";
		if (
			/\b(where|location|proof|map|fence|within|outside)\b|位置|证明|地图/i.test(
				text,
			)
		)
			return "ref-agency-checkin-labels";
		return null;
	}
	if (CANT_OUT.test(text)) return "ref-pr-cant-checkout";
	if (FORGOT_OUT.test(text)) return "ref-pr-forgot-checkout";
	if (MISSED.test(text)) return "ref-pr-missed-shift";
	if (LATE.test(text)) return "ref-pr-wage";
	if (TROUBLE.test(text)) return "ref-pr-checkin-trouble";
	return null;
}

/** A reference section as a written answer: the first line, then the rest. */
export function referenceAnswer(
	id: string,
	locale: LandingLocale,
): ChatAnswer | null {
	const r = CHAT_REFERENCE.find((s) => s.id === id);
	if (!r) return null;
	const [first, ...rest] = r[locale].lines;
	return rest.length ? { text: first, note: rest.join(" ") } : { text: first };
}

/** A follow-up question in the page's language — no 中文 text inside an English sentence. */
export function fitsLocale(text: string, locale: LandingLocale): boolean {
	return locale === "zh" || !CJK.test(text);
}

/* ------------------------------------------------------------ AI fact sheet -- */

const FOR_WHOM: Record<LandingLocale, Record<ChatRole | "any", string>> = {
	en: {
		pr: "for PRs",
		agency: "for PR agencies",
		outlet: "for outlets",
		general: "for everyone",
		any: "for everyone",
	},
	zh: {
		pr: "适用于 PR",
		agency: "适用于 PR 经纪公司",
		outlet: "适用于场所 (Outlet)",
		general: "适用于所有人",
		any: "适用于所有人",
	},
};

/* The model is told to answer "I run an agency" with the matching Overview. */
const OVERVIEW: Record<LandingLocale, string> = {
	en: "Overview",
	zh: "总览 Overview",
};

function answerLines(
	answer: ChatAnswer,
	role: ChatRole | "any",
	locale: LandingLocale,
): string[] {
	const lines = [answer.text];
	answer.steps?.forEach((s, i) => {
		const mark = answer.ordered === false ? "-" : `${i + 1})`;
		lines.push(`${mark} ${placeHeading(s.where, role, locale)}: ${s.what}`);
	});
	if (answer.note) lines.push(answer.note);
	return lines;
}

/**
 * Every verified answer, as plain text, for the AI model to answer from when the
 * keywords cannot match a question. It is built from the same topics the keyword
 * bot shows, so the two can never disagree. The visitor's own side comes first,
 * so the closest facts lead.
 *
 * `system` is the part built from the code itself — menus, team permissions, what
 * the database keeps, and TEST_SCRIPT's What's new — by `pnpm chat:facts`
 * (tools/scripts/landing-chat-system-facts.mts). It goes LAST and only to the
 * model: the written backup never matches against it.
 */
export function factSheet(
	locale: LandingLocale,
	role: ChatRole | null,
	system: readonly ReferenceSection[] = [],
): string {
	const order = (r: ChatRole | "any") =>
		r === role ? 0 : r === "any" || r === "general" ? 1 : 2;
	const sections: string[] = [];
	for (const r of ["pr", "agency", "outlet", "general"] as ChatRole[]) {
		sections.push(
			`## ${OVERVIEW[locale]} (${FOR_WHOM[locale][r]})\n${answerLines(CHAT_INTROS[locale][r], r, locale).join("\n")}`,
		);
	}
	const topics = [...CHAT_TOPICS].sort((a, b) => order(a.role) - order(b.role));
	for (const t of topics) {
		const local = t[locale];
		sections.push(
			`## ${local.chip} (${FOR_WHOM[locale][t.role]})\n${answerLines(local.answer, t.role, locale).join("\n")}`,
		);
	}
	/* The deeper reference only the AI reads (landing-chat-reference.ts). */
	const reference = [...CHAT_REFERENCE].sort(
		(a, b) => order(a.role) - order(b.role),
	);
	for (const r of [
		...reference,
		...[...system].sort((a, b) => order(a.role) - order(b.role)),
	]) {
		const local = r[locale];
		sections.push(
			`## ${local.title} (${FOR_WHOM[locale][r.role]})\n${local.lines.join("\n")}`,
		);
	}
	return sections.join("\n\n");
}

/** The roles a visitor can be in, plus "none" before they have said. */
export const FACT_SHEET_ROLES = [
	"pr",
	"agency",
	"outlet",
	"general",
	"none",
] as const;

/**
 * Every fact sheet the AI can be given, per language and role. The BACKEND
 * builds its prompt from a generated copy of this (`pnpm chat:facts` →
 * apps/backend/src/features/landing-chat/landing-chat-facts.generated.ts), so a
 * caller can no longer send the model its own "facts". ⚠️ After editing any
 * answer in this file, run `pnpm chat:facts` — `pnpm chat:facts:check` (run in
 * CI) fails while the copy is stale.
 */
export function allFactSheets(
	system: readonly ReferenceSection[] = [],
): Record<LandingLocale, Record<(typeof FACT_SHEET_ROLES)[number], string>> {
	const sheets = (locale: LandingLocale) =>
		Object.fromEntries(
			FACT_SHEET_ROLES.map((r) => [
				r,
				factSheet(locale, r === "none" ? null : r, system),
			]),
		) as Record<(typeof FACT_SHEET_ROLES)[number], string>;
	return { en: sheets("en"), zh: sheets("zh") };
}
