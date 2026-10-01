import type { LandingLocale } from "@/lib/landing-i18n";

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
 *   - Ratings (the rating is not saved yet);
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
					where: "Manage PR",
					what: "Your PRs and their tier. New PRs who ask to join arrive in Approvals.",
				},
				{
					where: "Roster",
					what: "Plan the week. AI auto-assign proposes who goes where — nothing is saved until you confirm — and the roster refuses clashes such as a full shift or a PR's blocked day.",
				},
				{
					where: "Approvals",
					what: "New PRs, MC and leave, and a venue's request to cut staff on a quiet night.",
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
					where: "Settings → Attendance",
					what: "Pin your venue and set the check-in fence — 10 m to 1,000 m, 50 m by default.",
				},
				{
					where: "Workspace",
					what: "Set your rate card per tier and your drinks price list.",
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
					where: "PR 管理",
					what: "你的 PR 和他们的等级。申请加入的新 PR 会出现在「审批」。",
				},
				{
					where: "排班",
					what: "规划一周。「AI 智能派班」会推荐谁去哪里 — 确认之前不会保存 — 排班表会拒绝冲突，例如班已满或 PR 当天不可用。",
				},
				{
					where: "审批",
					what: "新 PR、病假和请假，以及场所在冷清夜晚的减人请求。",
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
					where: "设置 → 考勤",
					what: "标注场所位置并设定签到范围 — 10 米到 1,000 米，默认 50 米。",
				},
				{ where: "工作区", what: "设定每个等级的费率表和酒水价目表。" },
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
						what: "Check out when you finish. Your hours are recorded from these two taps.",
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
					{ where: "签到", what: "下班时签退。你的工时就按这两次记录。" },
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
		],
		en: {
			chip: "Proof a PR was there",
			answer: {
				text: "Every check-in records how far the PR was from the venue pin.",
				steps: [
					{
						where: "Roster → Check-in locations",
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
						where: "排班 → 签到位置",
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
						where: "Approvals → Outlet → Cutlost",
						what: "A venue's request to release PRs on a quiet night.",
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
					{ where: "审批 → 门店 → 缺班损失", what: "场所在冷清夜晚请求放人。" },
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
		],
		en: {
			chip: "My staff and roles",
			answer: {
				text: "Each person on your team sees only their part.",
				steps: [
					{
						where: "Settings",
						what: "Invite your staff and give each one a role, such as Financial Head. Each role only gets the pages it needs.",
					},
				],
			},
		},
		zh: {
			chip: "员工和角色",
			answer: {
				text: "团队里每个人只看到自己负责的部分。",
				steps: [
					{
						where: "设置",
						what: "邀请员工并给每人一个角色，例如财务主管。每个角色只获得它需要的页面。",
					},
				],
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
		],
		en: {
			chip: "Set up attendance",
			answer: {
				text: "Pay only for PRs who are really at your door.",
				steps: [
					{
						where: "Settings → Attendance",
						what: "Pin your venue and set the fence — from 10 m to 1,000 m, 50 m by default.",
					},
				],
				note: "A PR outside the fence cannot check in.",
			},
		},
		zh: {
			chip: "设置出勤",
			answer: {
				text: "只为真正到你门口的 PR 付钱。",
				steps: [
					{
						where: "设置 → 考勤",
						what: "标注场所位置并设定范围 — 10 米到 1,000 米，默认 50 米。",
					},
				],
				note: "在范围外的 PR 无法签到。",
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
		],
		en: {
			chip: "My team",
			answer: {
				text: "Everyone on your team sees only their part.",
				steps: [
					{
						where: "Settings → Team",
						what: "Invite your Financial Head and Ops Head. A Director can view but not change.",
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
						what: "邀请财务主管和运营主管。总监只能查看，不能修改。",
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
						what: "Track anyone. The phone's location is used when the PR taps check in or check out.",
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
						what: "追踪任何人。只在 PR 点签到或签退时使用手机位置。",
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
		],
		en: {
			chip: "Does it track PRs?",
			answer: {
				text: "No. The phone's location is used when the PR taps check in or check out, to prove they're at the venue — there's no tracking in between.",
			},
		},
		zh: {
			chip: "会追踪 PR 吗？",
			answer: {
				text: "不会。只在 PR 点签到或签退时使用手机位置，证明人在场所 — 中间不会追踪。",
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

export type SmallTalkId = "hello" | "thanks" | "bye" | "ok";

const SMALL_TALK_KEYWORDS: Record<SmallTalkId, string[]> = {
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
		"好",
	],
};

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
	},
	zh: {
		hello: {
			text: "你好！你是 PR、经纪公司还是场所？在下面选一个，或直接问我。",
		},
		thanks: { text: "不客气！还有什么可以帮你？" },
		bye: { text: "再见 — 需要时随时找我。" },
		ok: { text: "好的。还想了解什么？" },
	},
};

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

const SUFFIXES = new Set(["s", "es", "ed", "d", "ing", "led", "ling"]);

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

function smallTalk(p: Prepared): SmallTalkId | null {
	if (p.words.length > 5 || p.compact.length > 24) return null;
	let best: SmallTalkId | null = null;
	let bestScore = 0;
	for (const id of Object.keys(SMALL_TALK_KEYWORDS) as SmallTalkId[]) {
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
	| { kind: "small"; id: SmallTalkId }
	| { kind: "fallback"; question: string }
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
	const p = prepare(text);
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

	return {
		reply: { kind: "fallback", question: text.trim() },
		role,
		next: nextChips(role, asked),
	};
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
 * bot shows, so the two can never disagree, and nothing outside this file reaches
 * the model. The visitor's own side comes first, so the closest facts lead.
 */
export function factSheet(
	locale: LandingLocale,
	role: ChatRole | null,
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
 * answer in this file, run `pnpm chat:facts` — `pnpm chat:facts:check` and
 * landing-chat-facts.test.ts fail while the copy is stale.
 */
export function allFactSheets(): Record<
	LandingLocale,
	Record<(typeof FACT_SHEET_ROLES)[number], string>
> {
	const sheets = (locale: LandingLocale) =>
		Object.fromEntries(
			FACT_SHEET_ROLES.map((r) => [
				r,
				factSheet(locale, r === "none" ? null : r),
			]),
		) as Record<(typeof FACT_SHEET_ROLES)[number], string>;
	return { en: sheets("en"), zh: sheets("zh") };
}
