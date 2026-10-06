/*
 * HOW THE SYSTEM IS DESCRIBED TO THE PUBLIC CHAT — the only hand-kept part of
 * the auto-generated knowledge (`pnpm chat:facts` builds the rest from the code).
 *
 * Owner, 5 Oct 2026: the chat must follow the system — its flows, its database
 * structure and the md files — by itself. The generator reads the real sources
 * (every Drizzle table, the live permission snapshot, the portal and app
 * navigation, TEST_SCRIPT §11) and turns them into facts. What it cannot invent
 * is a PUBLIC sentence for each table and permission module, so those live here,
 * and the generator FAILS when the code has something this file does not:
 *   · a new database table with no sentence → "add one, or hide it with a reason";
 *   · a new permission module or team role with no phrase → the same.
 * That is what makes a database or permission change impossible to ship without
 * the chat learning about it.
 *
 * Rules for every sentence: plain words a visitor understands; what is KEPT, never
 * a value; no table, column, file or env names (public-safety.ts rejects them);
 * nothing the hand-written guide deliberately leaves out (Beta features, hidden
 * pages, the unmounted Payout panel — landing-chat-knowledge.ts header).
 */

export type PublicSide = "pr" | "agency" | "outlet" | "any";

export interface TableSentence {
	side: PublicSide;
	en: string;
	zh: string;
}

/** Kept out of the public facts on purpose — the reason is the record. */
export interface HiddenItem {
	hidden: string;
}

export type TableEntry = TableSentence | HiddenItem;

const ROLES_LINE: TableSentence = {
	side: "any",
	en: "Team roles and what each role may do (see “Who can do what”).",
	zh: "团队角色及每个角色能做什么（见「谁能做什么」）。",
};

const PLANS_LINE: TableSentence = {
	side: "any",
	en: "The InnocenZ plans agencies and outlets can subscribe to.",
	zh: "经纪公司和场所可以订阅的 InnocenZ 方案。",
};

const PAYOUT_HIDDEN: HiddenItem = {
	hidden: "the Payout bank-file feature is not in the portal",
};

/** Every table in the Drizzle models, by its database name. */
export const TABLE_SENTENCES: Record<string, TableEntry> = {
	/* ---- people and accounts ---- */
	user: {
		side: "any",
		en: "Each person's account: name, login and contact details.",
		zh: "每个人的账号：姓名、登录方式和联系方式。",
	},
	user_profile: {
		side: "any",
		en: "Each person's profile: personal details, comcard photos and measurements, identity documents, address, bank details for pay and signature — an outlet never sees a PR's IC number, birth date or home address.",
		zh: "每个人的个人资料：个人信息、comcard 照片和身材尺寸、身份证件、地址、收薪银行资料和签名 — 场所永远看不到 PR 的身份证号码、出生日期或住址。",
	},
	notification: {
		side: "any",
		en: "The in-app notifications people receive.",
		zh: "用户收到的应用内通知。",
	},
	org_member_invite: {
		side: "any",
		en: "Invitations to join an agency's or outlet's team; the person joins once they accept.",
		zh: "加入经纪公司或场所团队的邀请；对方接受后才会加入。",
	},
	audit_logs: {
		side: "any",
		en: "A record of important changes and who made them.",
		zh: "重要更改及操作人的记录。",
	},
	admin_request: {
		side: "any",
		en: "Requests an agency or outlet sends to the InnocenZ team, such as a plan change.",
		zh: "经纪公司或场所发给 InnocenZ 团队的请求，例如更换方案。",
	},
	role: ROLES_LINE,
	role_permission: ROLES_LINE,
	user_role: ROLES_LINE,
	m_module: ROLES_LINE,
	m_permission: ROLES_LINE,
	portal: ROLES_LINE,
	admin_mfa: { hidden: "admin two-step sign-in secrets" },
	phone_verification: { hidden: "one-time verification codes" },
	reset_password_token: { hidden: "password-reset tokens" },
	platform_config: { hidden: "internal platform settings and fees" },

	/* ---- InnocenZ plans and billing ---- */
	subscription: PLANS_LINE,
	member_subscription: {
		side: "any",
		en: "Which plan each agency and outlet is on.",
		zh: "每家经纪公司和场所正在使用的方案。",
	},
	subscription_invoice: {
		side: "any",
		en: "The bills for each organisation's InnocenZ plan.",
		zh: "每个机构 InnocenZ 方案的账单。",
	},
	subscription_payment: {
		side: "any",
		en: "Payments made for those bills.",
		zh: "这些账单的付款记录。",
	},
	subscription_credit: {
		side: "any",
		en: "Credit left over when an organisation moves to a cheaper plan, taken off its next bill.",
		zh: "机构改用更便宜方案时剩余的抵扣额，会从下一期账单中扣除。",
	},
	payment_method: {
		side: "any",
		en: "Each organisation's saved way of paying its InnocenZ bill.",
		zh: "每个机构保存的 InnocenZ 账单付款方式。",
	},

	/* ---- agencies ---- */
	agency: {
		side: "agency",
		en: "Each agency's company details.",
		zh: "每家经纪公司的公司资料。",
	},
	agency_user: {
		side: "agency",
		en: "An agency's team members and their roles.",
		zh: "经纪公司的团队成员及其角色。",
	},
	agency_pr: {
		side: "agency",
		en: "Which PRs belong to which agency, and each PR's tier at that agency.",
		zh: "哪些 PR 属于哪家经纪公司，以及他们在该公司的等级。",
	},
	agency_penalty_rule: {
		side: "agency",
		en: "Each agency's attendance rules — minimum shifts a week, MC limit a month, lateness and cancellation — which apply to every PR on its roster.",
		zh: "每家经纪公司的出勤规则 — 每周最少班次、每月病假上限、迟到和取消 — 适用于名单上的每位 PR。",
	},
	penalty_charge: {
		side: "agency",
		en: "Weekly penalties charged to a PR under their agency's rules, shown on the PR's voucher.",
		zh: "按经纪公司规则每周向 PR 收取的罚款，会显示在 PR 的薪资单上。",
	},
	agency_outlet: {
		side: "any",
		en: "Which agencies and outlets work together.",
		zh: "哪些经纪公司和场所在合作。",
	},
	agency_outlet_event: {
		side: "any",
		en: "The history of changes to each agency–outlet partnership.",
		zh: "每段经纪公司与场所合作关系的变更记录。",
	},
	collection_invoice: {
		side: "any",
		en: "A weekly statement of what an outlet owes its agency for PR work — InnocenZ does not move that money.",
		zh: "场所每周应付给经纪公司的 PR 工作费用对账单 — InnocenZ 不经手这笔钱。",
	},
	agency_payout_account: PAYOUT_HIDDEN,
	payout_batch: PAYOUT_HIDDEN,
	payout_batch_item: PAYOUT_HIDDEN,

	/* ---- PRs and pay ---- */
	pr_availability: {
		side: "pr",
		en: "The days a PR has marked unavailable.",
		zh: "PR 标记为不可接班的日子。",
	},
	payment_voucher: {
		side: "any",
		en: "Each PR's weekly pay voucher.",
		zh: "每位 PR 的每周薪资单。",
	},
	payment_voucher_line: {
		side: "any",
		en: "The lines on a voucher: daily wages, drinks, tips and other items.",
		zh: "薪资单上的明细：日薪、酒水、小费和其他。",
	},
	payment_voucher_receipt: {
		side: "any",
		en: "The receipts behind a voucher's drinks and tips.",
		zh: "薪资单酒水和小费背后的小票。",
	},
	payment_voucher_dispute: {
		side: "any",
		en: "A PR's dispute about a drinks or tips amount, and the agency's answer.",
		zh: "PR 对酒水或小费金额提出的争议，以及经纪公司的处理结果。",
	},
	payment_voucher_day_review: {
		side: "any",
		en: "The agency's day-by-day approval of each PR's pay.",
		zh: "经纪公司逐日审核每位 PR 的薪资。",
	},

	/* ---- outlets ---- */
	outlet: {
		side: "outlet",
		en: "Each outlet's venue details, including its check-in location.",
		zh: "每个场所的资料，包括签到位置。",
	},
	outlet_user: {
		side: "outlet",
		en: "An outlet's team members and their roles.",
		zh: "场所的团队成员及其角色。",
	},
	outlet_workspace: {
		side: "outlet",
		en: "An outlet's Workspace: the pay, commission and happy-hour settings new jobs start from.",
		zh: "场所的工作区：新工作默认使用的薪资、佣金和欢乐时光设置。",
	},
	outlet_tier_rate: {
		side: "outlet",
		en: "An outlet's rate card: the wage and commission for each PR tier.",
		zh: "场所的费率表：每个 PR 等级的薪资和佣金。",
	},
	outlet_drink_menu: {
		side: "outlet",
		en: "An outlet's drinks, services and tips price list.",
		zh: "场所的酒水、服务和小费价目表。",
	},
	outlet_transaction: {
		hidden:
			"InnocenZ's own transaction-volume figure for the admin dashboard, not a feature visitors use",
	},
	outlet_swap_request: { hidden: "venue swap is still Beta" },
	rating: {
		side: "outlet",
		en: "An outlet's ratings of the PRs who worked its shifts.",
		zh: "场所对在其班次上班的 PR 的评分。",
	},
	special_service: { hidden: "special service orders are dormant" },

	/* ---- jobs and shifts ---- */
	shift: {
		side: "outlet",
		en: "The jobs (shifts) an outlet posts.",
		zh: "场所发布的工作（班次）。",
	},
	shift_agency: {
		side: "any",
		en: "Which agencies each job is posted to; each may send PRs until the job is full.",
		zh: "每份工作发布给哪些经纪公司；每家都可以派 PR，直到人数补满。",
	},
	shift_pay_tier: {
		side: "outlet",
		en: "How many PRs of each tier a job needs, and their pay.",
		zh: "每份工作需要每个等级多少位 PR，以及他们的报酬。",
	},
	shift_drink_menu: {
		side: "outlet",
		en: "A special event's own price list; a normal job uses the Workspace list.",
		zh: "特别活动的专属价目表；普通工作使用工作区的价目表。",
	},
	shift_template: {
		side: "outlet",
		en: "Saved job templates an outlet can reuse: event type, PR numbers, languages and dress code.",
		zh: "场所可重复使用的工作模板：活动类型、PR 人数、语言和着装要求。",
	},
	shift_pr_request: {
		side: "outlet",
		en: "An outlet's request for a specific PR by name on a job.",
		zh: "场所在某份工作上指名要某位 PR 的请求。",
	},
	shift_assignment: {
		side: "any",
		en: "Which PR works which shift: their check-in and check-out times, the phone's location at those two moments (not live tracking), and any MC proof photo.",
		zh: "哪位 PR 上哪个班：签到和签退时间、这两个时刻手机的位置（不是实时定位），以及病假证明照片。",
	},
	shift_sale: {
		side: "any",
		en: "The drinks, tips and services logged for each PR on a shift.",
		zh: "每位 PR 在班上记录的酒水、小费和服务。",
	},
	cutlost_request: {
		side: "any",
		en: "An outlet's cut-loss request on a shift — send named PRs home early or drop unfilled places — which the agency approves or rejects.",
		zh: "场所对某个班次的止损请求 — 让指定 PR 提早下班或取消未补满的名额 — 由经纪公司批准或拒绝。",
	},
	cutlost_request_assignment: {
		side: "any",
		en: "Which PRs each cut-loss request would send home early.",
		zh: "每个止损请求会让哪些 PR 提早下班。",
	},
};

export type GrantPhrase = { en: string; zh: string } | HiddenItem;

/**
 * What each permission ROW unlocks, in visitor words — keyed `module:verb` the way
 * the snapshot lists them. Worded by what the gate actually opens, not by the
 * module's name: `workforce:read` is the Roster while `workforce:update` is the
 * Manage PR / Manage Outlet screens, and the outlet Calendar is `dashboard:read`
 * (review, 5 Oct 2026 — a per-module phrase told visitors Finance could use
 * Manage PR). Only rows something USES need a phrase: the generator collects the
 * web's feature map (module-permissions.ts) and every server
 * `requirePermission(…)`, and a used row with no entry here stops the build.
 */
export const GRANT_PHRASES: Record<
	"outlet" | "agency",
	Record<string, GrantPhrase>
> = {
	outlet: {
		"dashboard:read": {
			en: "see “Today” and the calendar",
			zh: "查看「今天」和日历",
		},
		"booking:read": { en: "open “Post Job”", zh: "打开「发布职位」" },
		"booking:create": { en: "post jobs", zh: "发布工作" },
		"booking:update": { en: "confirm and seal shifts", zh: "确认和封存班次" },
		"workspace:read": {
			en: "see the Workspace rate card and price list",
			zh: "查看工作区的费率表和价目表",
		},
		"workspace:update": {
			en: "change the Workspace and a shift's staffing",
			zh: "修改工作区和班次人员安排",
		},
		"sales:create": { en: "log floor sales for PRs", zh: "为 PR 记录现场销售" },
		"sales:read": {
			en: "see sales on “Reports”",
			zh: "在「报表」查看销售",
		},
		// Graded live 5 Oct 2026: "Reports" renders only the sales dashboard for
		// every role, and the daily confirm button lives only in the DEMO banner
		// (OutletReconciliationBanner.tsx:45, :145-148 "No Confirm here on purpose").
		"billing:read": {
			en: "see the weekly check of what the agency billed against your shift records, on “Today”",
			zh: "在「今天」查看经纪公司账单与你的班次记录的每周核对",
		},
		"billing:update": {
			hidden:
				"the daily-reconciliation confirm exists only in the demo — a real outlet cannot confirm, settling the week is the agency's call",
		},
		"rating:create": {
			en: "rate the PRs who worked a shift",
			zh: "为上班的 PR 评分",
		},
		"history:read": { en: "see “History”", zh: "查看「历史记录」" },
		"settings:read": {
			en: "see “Settings”, “Subscription” and the team",
			zh: "查看「设置」、「订阅」和团队",
		},
		"settings:update": {
			en: "change settings and the team",
			zh: "修改设置和团队",
		},
		"special_service:create": { hidden: "special service orders are dormant" },
	},
	agency: {
		"dashboard:read": { en: "see “Today”", zh: "查看「今天」" },
		"workforce:read": {
			en: "see the Roster — including its Live view of tonight's shifts and who has checked in — and PR records",
			zh: "查看排班（包括今晚班次和已签到 PR 的实时视图）和 PR 资料",
		},
		"workforce:update": {
			en: "use “Manage PR” and “Manage Outlet”",
			zh: "使用「PR 管理」和「门店管理」",
		},
		"roster:update": {
			en: "assign PRs to shifts and arrange swaps",
			zh: "给 PR 派班和安排调班",
		},
		"approvals:read": {
			en: "see the “Approvals” queue",
			zh: "查看「审批」队列",
		},
		"approvals:update": {
			en: "answer approvals — PR sign-ups, MC/leave and a venue's cut-loss",
			zh: "处理审批 — PR 注册、病假/请假和场所止损",
		},
		"payment_voucher:read": {
			en: "see “Payroll” and pay vouchers",
			zh: "查看「薪资」和薪资单",
		},
		"payment_voucher:create": {
			en: "review pay — days, receipts, disputes and overtime",
			zh: "审核薪资 — 每日记录、小票、争议和加班",
		},
		"payment_voucher:update": {
			en: "edit pay vouchers, including overriding a signed one",
			zh: "修改薪资单，包括覆盖已签署的",
		},
		"collections:read": {
			en: "see weekly statements to outlets",
			zh: "查看给场所的每周对账单",
		},
		"collections:update": {
			en: "issue, confirm and settle weekly statements",
			zh: "开具、确认和结清每周对账单",
		},
		"history:read": { en: "see “History”", zh: "查看「历史记录」" },
		"settings:read": {
			en: "see “Settings”, “Subscription” and the team",
			zh: "查看「设置」、「订阅」和团队",
		},
		"settings:update": {
			en: "change settings and the team",
			zh: "修改设置和团队",
		},
	},
};

/**
 * Abilities the portals grant by LANE because no permission row covers them —
 * their lane lists are READ from `MATRIX_ONLY` in outlet-rbac.ts / agency-rbac.ts
 * (which mirror the server's lane gates), so only the words live here.
 */
export const MATRIX_PHRASES: Record<string, { en: string; zh: string }> = {
	requestCutLoss: {
		en: "ask the agency to cut loss on a shift",
		zh: "向经纪公司提出班次止损请求",
	},
	viewLiveFloor: {
		en: "see the “PR on duty” tab on “Today”",
		zh: "查看「今天」上的「在岗 PR」分页",
	},
};

/**
 * The one lane rule no matrix carries: paying the InnocenZ subscription is
 * `orgOwnerPaysOnly` with the guarantor NOT folded in (payment-method and
 * subscription-payment routes, 12 Sep 2026). The generator checks that gate still
 * exists with `foldGuarantor: false` and stops if it does not.
 */
export const TEAM_NOTES: Record<
	"outlet" | "agency",
	{ en: string[]; zh: string[] }
> = {
	outlet: {
		en: [
			"Paying the InnocenZ subscription and saving its payment method is the Owner's alone; everyone else, the Guarantor included, sees what is paid and unpaid.",
		],
		zh: [
			"支付 InnocenZ 订阅费和保存付款方式只限东主；其他成员（包括担保人）只能看到已付和未付。",
		],
	},
	agency: {
		en: [
			"Paying the InnocenZ subscription and saving its payment method is the Owner's alone; everyone else, the Guarantor included, sees what is paid and unpaid.",
		],
		zh: [
			"支付 InnocenZ 订阅费和保存付款方式只限东主；其他成员（包括担保人）只能看到已付和未付。",
		],
	},
};

/**
 * Team lanes in the permission snapshot → the role-name key the portal itself
 * shows (portal-i18n: roleOwner "Owner" / 东主 …), so the names are never copied.
 */
export const LANE_ROLE_KEY: Record<string, string> = {
	outlet_owner: "roleOwner",
	outlet_guarantor: "roleGuarantor",
	outlet_director: "roleDirector",
	outlet_finance: "roleFinance",
	outlet_ops: "roleOps",
	agency_owner: "roleOwner",
	agency_guarantor: "roleGuarantor",
	agency_director: "roleDirector",
	agency_finance: "roleFinance",
};
