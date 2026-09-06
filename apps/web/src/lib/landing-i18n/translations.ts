export type LandingLocale = "en" | "zh"; // zh = Simplified Chinese (zh-CN)

import {
	type SignupTranslations,
	signupTranslations,
} from "./signup-translations";

export type { SignupTranslations };

export interface LandingTranslations {
	nav: {
		platform: string;
		ai: string;
		dashboards: string;
		pricing: string;
		whyUs: string;
		contactUs: string;
		language: string;
		login: string;
		english: string;
		chinese: string;
	};
	hero: {
		eyebrow: string;
		titleLine1: string;
		titleLine2: string;
		subtitle: string;
		watchPlatform: string;
		stat1: string;
		stat2: string;
		stat3: string;
		trustedBy: string;
		liveOnShift: string;
		aiMatched: string;
		badgeAlt: string;
	};
	challenges: {
		eyebrow: string;
		titlePrefix: string;
		titleHighlight: string;
		sub: string;
		forLabel: string;
		outletOwners: string;
		prAgencies: string;
		prProfessionals: string;
		outletPains: string[];
		agencyPains: string[];
		prPains: string[];
	};
	solution: {
		eyebrow: string;
		titlePrefix: string;
		titleHighlight: string;
		sub: string;
		outletLabel: string;
		outletDesc: string;
		agencyLabel: string;
		agencyDesc: string;
		prLabel: string;
		prDesc: string;
		flowBadge: string;
		outletAlt: string;
		agencyAlt: string;
		prAlt: string;
	};
	platform: {
		eyebrow: string;
		titlePrefix: string;
		titleHighlight: string;
		sub: string;
		modules: { title: string; desc: string }[];
	};
	ai: {
		eyebrow: string;
		titlePrefix: string;
		titleHighlight: string;
		titleSuffix: string;
		sub: string;
		modelContext: string;
		modelContextDesc: string;
		features: { title: string; desc: string }[];
	};
	dashboards: {
		eyebrow: string;
		titlePrefix: string;
		titleHighlight: string;
		sub: string;
		liveFloor: string;
		outlet: string;
		onShift: string;
		netSales: string;
		variance: string;
		checkedIn: string;
		tonightsRoster: string;
		netSales4h: string;
		cycleSettles: string;
		agency: string;
		prsBooked: string;
		pendingPvs: string;
		utilisation: string;
		payout: string;
		bookingsByOutlet: string;
		pvsSigned: string;
		tonight: string;
		liveEarnings: string;
		earningsBreakdown: string;
		gpsCheckIn: string;
		verified: string;
		receipts: string;
		scanned: string;
		signVoucher: string;
		statusLive: string;
		statusRoute: string;
		statusIdle: string;
		days: string[];
	};
	benefits: {
		eyebrow: string;
		titleHighlight: string;
		titleSuffix: string;
		sub: string;
		outletOwners: string;
		prAgencies: string;
		prProfessionals: string;
		connectedAgencies: string;
		outletWins: { kpi: string; label: string }[];
		agencyWins: { kpi: string; label: string }[];
		prWins: { kpi: string; label: string }[];
	};
	why: {
		eyebrow: string;
		titlePrefix: string;
		titleHighlight: string;
		sub: string;
		advantages: { title: string; desc: string }[];
	};
	testimonials: {
		eyebrow: string;
		titlePrefix: string;
		titleHighlight: string;
		quotes: { q: string; n: string; t: string; role: string }[];
		roleOutlet: string;
		roleAgency: string;
		rolePr: string;
	};
	pricing: {
		eyebrow: string;
		title: string;
		outletIntro: string;
		agencyIntro: string;
		outletFeatures: string[];
		agencyFeatures: string[];
		platformNote: string;
		outletTab: string;
		agencyTab: string;
		popular: string;
		bookDemo: string;
		talkToUs: string;
		outletFootnote: string;
		agencyFootnote: string;
		outletTiers: {
			name: string;
			capacity: string;
			detail: string;
			period: string;
		}[];
		agencyTiers: {
			name: string;
			capacity: string;
			detail: string;
			period: string;
			price?: string;
		}[];
	};
	cta: {
		eyebrow: string;
		titlePrefix: string;
		titleHighlight: string;
		sub: string;
		login: string;
		seePricing: string;
	};
	footer: {
		tagline: string;
		copyright: string;
		columns: { title: string; links: string[] }[];
		legal: string[];
	};
	meta: {
		title: string;
		description: string;
	};
	signup: SignupTranslations;
}

const enModules = [
	{
		title: "Smart Scheduling",
		desc: "AI-driven roster planning with live availability, tiers, and double-booking detection.",
	},
	{
		title: "AI Workforce Matching",
		desc: "Best-fit PR selected per outlet per night — by tier, history, and demand curve.",
	},
	{
		title: "Digital Payroll",
		desc: "Cycle-locked payouts, no spreadsheets, no cash reconciliation, no missed shifts.",
	},
	{
		title: "Commission Engine",
		desc: "Daily wage + table + drink + target commission — auto-calculated by tier.",
	},
	{
		title: "Outlet Dashboard",
		desc: "Book coverage, watch check-ins, close the night with a signed Net Sales Report.",
	},
	{
		title: "Agency Dashboard",
		desc: "Roster planning across every outlet with live no-show alerts and PV signing.",
	},
	{
		title: "PR Mobile App",
		desc: "GPS + selfie check-in, on-shift receipt scan, wallet withdrawals, tier history.",
	},
	{
		title: "Business Intelligence",
		desc: "Live P&L, variance reporting, and executive KPI summaries across venues.",
	},
	{
		title: "Customer Analytics",
		desc: "Table-level insights on which PR moves which product for which crowd.",
	},
	{
		title: "Compliance & Audit",
		desc: "Full audit trail on every voucher — no cash leakage, no paper disputes.",
	},
	{
		title: "Receipt Scanning",
		desc: "On-shift OCR of every receipt — attributed to PR, table, and target.",
	},
	{
		title: "Trust & Disputes",
		desc: "E-signed vouchers, cycle-locked reconciliation, zero disputes lost.",
	},
];

const zhModules = [
	{
		title: "智能排班",
		desc: "AI 驱动的排班规划，实时可用性、等级与重复预订检测。",
	},
	{
		title: "AI 人力匹配",
		desc: "按门店、每晚自动匹配最合适的 PR——依据等级、历史与需求曲线。",
	},
	{
		title: "数字薪资",
		desc: "周期锁定发薪，无需电子表格、现金对账或漏记班次。",
	},
	{
		title: "佣金引擎",
		desc: "日薪 + 桌台 + 酒水 + 目标佣金——按等级自动计算。",
	},
	{
		title: "门店仪表盘",
		desc: "预订人力、监控签到，以签字的净销售报告结束当晚。",
	},
	{ title: "代理仪表盘", desc: "跨门店排班规划，实时未到岗提醒与 PV 签署。" },
	{
		title: "PR 移动应用",
		desc: "GPS + 自拍签到、班内收据扫描、钱包提现、等级历史。",
	},
	{ title: "商业智能", desc: "实时损益、差异报告及跨门店高管 KPI 摘要。" },
	{ title: "客户分析", desc: "桌台级洞察：哪位 PR 为哪类客群推动哪款产品。" },
	{
		title: "合规与审计",
		desc: "每张凭证完整审计追踪——无现金流失、无纸质争议。",
	},
	{ title: "收据扫描", desc: "班内 OCR 扫描每张收据——关联 PR、桌台与目标。" },
	{ title: "信任与争议", desc: "电子签名凭证、周期锁定对账，零争议流失。" },
];

const enAiFeatures = [
	{
		title: "Workforce Forecasting",
		desc: "Predict peak manpower demand three weeks out — by venue, night, and weather.",
	},
	{
		title: "PR Recommendation",
		desc: "Best-fit PR chosen for every outlet — by tier, history, and revenue lift.",
	},
	{
		title: "Revenue Insights",
		desc: "Identify leakage by table, night, and PR — before it drops off your P&L.",
	},
	{
		title: "Smart Scheduling",
		desc: "Automatic workforce allocation across every venue and tier, in seconds.",
	},
	{
		title: "Performance Score",
		desc: "Live ranking + incentive recommendations to lift attendance and quality.",
	},
	{
		title: "Anomaly Detection",
		desc: "Detect payroll anomalies and no-show patterns before they hit your books.",
	},
	{
		title: "Executive Dashboard",
		desc: "AI-generated KPI summaries: what happened tonight, what to do about it.",
	},
];

const zhAiFeatures = [
	{ title: "人力预测", desc: "提前三周预测高峰人力需求——按门店、夜晚与天气。" },
	{
		title: "PR 推荐",
		desc: "为每家门店匹配最佳 PR——依据等级、历史与营收提升。",
	},
	{ title: "营收洞察", desc: "按桌台、夜晚与 PR 识别流失——在影响损益前发现。" },
	{ title: "智能排班", desc: "数秒内自动分配各门店与各等级人力。" },
	{ title: "绩效评分", desc: "实时排名 + 激励建议，提升出勤与质量。" },
	{ title: "异常检测", desc: "在入账前发现薪资异常与未到岗模式。" },
	{
		title: "高管仪表盘",
		desc: "AI 生成 KPI 摘要：今晚发生了什么、该如何应对。",
	},
];

const enAdvantages = [
	{
		title: "One unified ecosystem",
		desc: "Outlet, agency, PR — one platform, one truth.",
	},
	{
		title: "Real-time analytics",
		desc: "Every check-in, receipt, and voucher — live.",
	},
	{
		title: "Automated payroll",
		desc: "Cycle-locked, no spreadsheets, no cash.",
	},
	{
		title: "AI optimisation",
		desc: "Forecasting, matching, anomaly detection built in.",
	},
	{
		title: "Compliance-ready",
		desc: "Full audit trail on every payout, every night.",
	},
	{
		title: "Mobile-first PR app",
		desc: "Shift, scan, sign, and get paid in one place.",
	},
	{
		title: "Scalable nationwide",
		desc: "From one venue to a hundred — same live floor.",
	},
	{
		title: "Enterprise security",
		desc: "E-signed vouchers, SOC-grade infrastructure.",
	},
];

const zhAdvantages = [
	{ title: "统一生态系统", desc: "门店、代理、PR——一个平台，一个真相。" },
	{ title: "实时分析", desc: "每次签到、收据与凭证——实时可见。" },
	{ title: "自动发薪", desc: "周期锁定，无需表格与现金。" },
	{ title: "AI 优化", desc: "内置预测、匹配与异常检测。" },
	{ title: "合规就绪", desc: "每晚每笔发薪完整审计追踪。" },
	{ title: "移动优先 PR 应用", desc: "排班、扫描、签署、收款一站完成。" },
	{ title: "全国可扩展", desc: "从一家到百家门店——同一实时运营。" },
	{ title: "企业级安全", desc: "电子签名凭证，SOC 级基础设施。" },
];

export const translations: Record<LandingLocale, LandingTranslations> = {
	en: {
		nav: {
			platform: "Platform",
			ai: "AI",
			dashboards: "Dashboards",
			pricing: "Pricing",
			whyUs: "Why Us",
			contactUs: "Contact Us",
			language: "Language",
			login: "Login",
			english: "English",
			chinese: "Simplified Chinese",
		},
		hero: {
			eyebrow: "Introducing InnocenZ · 2026",
			titleLine1: "The Operating Platform for",
			titleLine2: "Nightlife.",
			subtitle:
				"One place for the venue, the agency and the PR — from the first check-in to the final signed payout.",
			watchPlatform: "Watch the platform",
			stat1: "less time on manpower planning",
			stat2: "digital receipt → payout",
			stat3: "disputes lost to paper trails",
			trustedBy: "Trusted on the floor of",
			liveOnShift: "Live · 34 on shift",
			aiMatched: "AI-matched",
			badgeAlt: "InnocenZ platform badge",
		},
		challenges: {
			eyebrow: "Why the nightlife floor breaks",
			titlePrefix: "The night runs fast.",
			titleHighlight: "Your ops runs on paper.",
			sub: "Roster in WhatsApp. Payroll in Excel. Disputes in cash.",
			forLabel: "For",
			outletOwners: "Outlet",
			prAgencies: "PR Agency",
			prProfessionals: "PR",
			outletPains: [
				"Poor PR quality on the floor",
				"Manual scheduling every week",
				"Last-minute cancellations",
				"Overstaffed slow nights",
				"Payroll disputes",
				"Revenue leakage",
				"Zero real-time visibility",
				"Compliance & reputation risk",
			],
			agencyPains: [
				"Manual payroll runs",
				"Cash flow trapped in receivables",
				"Collection delays from outlets",
				"Double-booked PRs",
				"Weak resource planning",
				"No performance signal",
				"High staff turnover",
				"Inaccurate reporting",
			],
			prPains: [
				"No visibility into open shifts",
				"Delayed payment",
				"Unclear commissions",
				"Poor scheduling",
				"No transparency on earnings",
				"No career path",
				"Zero performance recognition",
			],
		},
		solution: {
			eyebrow: "One intelligent operating platform",
			titlePrefix: "Three parties,",
			titleHighlight: "one live floor.",
			sub: "InnocenZ threads Outlet, agencies, and PR into a single AI-powered loop — from roster to receipt to signed payout — reconciled while the night is still running.",
			outletLabel: "Outlet",
			outletDesc: "Books the night. Watches the floor.",
			agencyLabel: "PR Agency",
			agencyDesc: "Fills the roster. Pays the team.",
			prLabel: "PR",
			prDesc: "Checks in. Scans. Gets paid.",
			flowBadge: "Real-time · AI-matched · Cycle-reconciled",
			outletAlt: "Velvet Throne whisky parlour — outlet venue",
			agencyAlt: "PR agency manager",
			prAlt: "PR on the floor",
		},
		platform: {
			eyebrow: "The Platform",
			titlePrefix: "Every operation moving\u00A0part.",
			titleHighlight: "One backbone.",
			sub: "Twelve modules, roster to signed payout.",
			modules: enModules,
		},
		ai: {
			eyebrow: "The AI Layer",
			titlePrefix: "An AI that runs",
			titleHighlight: "every night",
			titleSuffix: "with you.",
			sub: "Not chat. Not gimmicks. Seven layers that forecast, match and reconcile.",
			modelContext: "Model context",
			modelContextDesc:
				"Trained on live outlet, agency and PR signals.",
			features: enAiFeatures,
		},
		dashboards: {
			eyebrow: "Built for how you actually run the night",
			titlePrefix: "Three portals.",
			titleHighlight: "One live pulse.",
			sub: "Outlet web, agency web, and PR mobile — synced from roster planning through receipt scan to signed payment voucher. Every KPI here updates live.",
			liveFloor: "Live floor · Fri 21:16",
			outlet: "OUTLET",
			onShift: "On shift",
			netSales: "Bar takings",
			variance: "Sales vs target",
			checkedIn: "Checked in",
			tonightsRoster: "Tonight's roster",
			netSales4h: "Bar takings · 4h",
			cycleSettles: "Cycle · settles Sunday",
			agency: "PR Agency",
			prsBooked: "PRs booked",
			pendingPvs: "Vouchers to sign",
			utilisation: "PRs working",
			payout: "Payout",
			bookingsByOutlet: "Bookings by outlet · this week",
			pvsSigned: "3 vouchers signed and paid",
			tonight: "Tonight",
			liveEarnings: "Live earnings",
			earningsBreakdown: "Wage · Table · Drink · Target",
			gpsCheckIn: "GPS check-in",
			verified: "Verified · 21:04",
			receipts: "Receipts",
			scanned: "scanned",
			signVoucher: "Sign payment voucher · RM 512",
			statusLive: "Live",
			statusRoute: "En route",
			statusIdle: "Idle",
			days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
		},
		benefits: {
			eyebrow: "Business outcomes, not feature lists",
			titleHighlight: "Measurable",
			titleSuffix: "for every party at the\u00A0table.",
			sub: "Every module in InnocenZ ships against a number your finance team recognises.",
			outletOwners: "Outlet",
			prAgencies: "PR Agency",
			prProfessionals: "PR",
			connectedAgencies: "Connected agencies",
			outletWins: [
				{ kpi: "80%", label: "less time on manpower planning" },
				{ kpi: "0", label: "cash reconciliation at close of night" },
				{ kpi: "100%", label: "real-time floor visibility across venues" },
				{ kpi: "-42%", label: "no-shows after AI matching kicks in" },
			],
			agencyWins: [
				{ kpi: "6h → 6m", label: "to close a weekly payroll cycle" },
				{ kpi: "100%", label: "digital receipt-to-payout workflow" },
				{ kpi: "+38%", label: "utilisation of your PR pool" },
				{ kpi: "0", label: "disputes lost to paper trails" },
			],
			prWins: [
				{ kpi: "T+0", label: "wallet payout on cycle close" },
				{ kpi: "Live", label: "earnings visible on-shift" },
				{ kpi: "Verified", label: "GPS + selfie check-ins" },
				{ kpi: "Every", label: "shift rated. Every tier earned." },
			],
		},
		why: {
			eyebrow: "Why InnocenZ",
			titlePrefix: "Not another dashboard.",
			titleHighlight: "An operating platform.",
			sub: "Eight structural advantages built for nightlife operations — not adapted from a generic SaaS chassis.",
			advantages: enAdvantages,
		},
		testimonials: {
			eyebrow: "The floor speaks",
			titlePrefix: "Signed.",
			titleHighlight: "On the record.",
			quotes: [
				{
					q: "We closed a Friday's payroll before the last table cleared. That never happened before InnocenZ.",
					n: "Marcus Tan",
					t: "COO · Skybar Group",
					role: "Outlet",
				},
				{
					q: "Utilisation went up 38% and PV disputes went to zero. That's the whole business case, on one screen.",
					n: "Priya Anand",
					t: "MD · Nova PR Agency",
					role: "PR Agency",
				},
				{
					q: "I see my earnings live on shift. Get paid the day the cycle closes. No chasing anyone.",
					n: "Aisha Lim",
					t: "Tier-1 PR · KL",
					role: "PR",
				},
			],
			roleOutlet: "Outlet",
			roleAgency: "PR Agency",
			rolePr: "PR",
		},
		pricing: {
			eyebrow: "Choose your access tier",
			title: "Scale with your floor.",
			outletIntro: "Outlet plans scale by PRs booked per day.",
			agencyIntro: "Agency plans scale by payment vouchers issued each week.",
			outletFeatures: [
				"All platform modules included",
				"Live floor + AI matching",
				"Cycle-locked payouts",
				"Full audit trail",
			],
			agencyFeatures: [
				"Full agency portal",
				"Roster + PR pool management",
				"E-signed payment vouchers",
				"Cycle reconciliation & disputes",
			],
			platformNote: "All plans include the full platform — no feature gates.",
			outletTab: "Outlet",
			agencyTab: "PR Agency",
			popular: "Popular",
			bookDemo: "Book a demo",
			talkToUs: "Talk to us",
			outletFootnote: "PR = PR headcount booked per operating day",
			agencyFootnote:
				"PV = Payment Voucher · issued each cycle · e-signed by PR",
			outletTiers: [
				{
					name: "Essential",
					capacity: "5 PRs / day",
					detail: "Choose 5 from 10 PRs",
					period: "/ month",
				},
				{
					name: "Plus",
					capacity: "6–10 PRs / day",
					detail: "Choose 10 from 20 PRs",
					period: "/ month",
				},
				{
					name: "Pro",
					capacity: "11–25 PRs / day",
					detail: "Choose 25 from 50 PRs",
					period: "/ month",
				},
				{
					name: "Enterprise",
					capacity: "26–50 PRs / day",
					detail: "Choose 50 from 100 PRs",
					period: "/ month",
				},
				{
					name: "Scale",
					capacity: "51–100 PRs / day",
					detail: "Choose 100 from 200 PRs",
					period: "/ month",
				},
				{
					name: "Premier",
					capacity: "101+ PRs / day",
					detail: "For the biggest operations",
					period: "/ month",
				},
			],
			agencyTiers: [
				{
					name: "Starter",
					capacity: "5 PV / week",
					detail: "Core portal access",
					period: "/ week",
				},
				{
					name: "Plus",
					capacity: "6–10 PV / week",
					detail: "Growing roster · payroll & history",
					period: "/ week",
				},
				{
					name: "Growth",
					capacity: "11–25 PV / week",
					detail: "Expanded roster · payroll & reporting",
					period: "/ week",
				},
				{
					name: "Enterprise",
					capacity: "26–75 PV / week",
					detail: "Large roster · priority support",
					period: "/ week",
				},
				{
					name: "Scale",
					capacity: "76–150 PV / week",
					detail: "High volume · dedicated success",
					period: "/ week",
				},
				{
					name: "Custom",
					capacity: "151+ PV / week",
					detail: "Custom terms with InnocenZ admin",
					period: "",
					price: "Let's talk",
				},
			],
		},
		cta: {
			eyebrow: "Ready when you are",
			titlePrefix: "Own the night with",
			titleHighlight: "total control.",
			sub: "Outlet, agencies, and PR — on one platform, from the first check-in to the final payout. Priority access opening Q3.",
			login: "Login",
			seePricing: "See pricing",
		},
		footer: {
			tagline:
				"The AI-powered operating platform for Outlet, PR Agency, and the workforce that runs the night.",
			copyright: "Crowned nightlife · All rights reserved",
			columns: [
				{
					title: "Platform",
					links: ["Overview", "AI Layer", "Dashboards", "Modules", "Security"],
				},
				{
					title: "For",
					links: ["Outlet & KTV", "PR Agency", "PR", "Investors", "Partners"],
				},
				{
					title: "Company",
					links: ["About", "Careers", "Press", "Legal", "Privacy"],
				},
			],
			legal: ["Terms", "Privacy", "Security"],
		},
		meta: {
			title: "InnocenZ — The Operating Platform for Nightlife",
			description:
				"AI-powered operating platform connecting Outlet, PR Agency, and PR — from roster to receipt to signed payout.",
		},
		signup: signupTranslations.en,
	},
	zh: {
		nav: {
			platform: "平台",
			ai: "AI",
			dashboards: "仪表盘",
			pricing: "定价",
			whyUs: "为什么选择我们",
			contactUs: "联系我们",
			language: "语言",
			login: "登录",
			english: "English",
			chinese: "简体中文",
		},
		hero: {
			eyebrow: "InnocenZ 登场 · 2026",
			titleLine1: "夜生活运营平台",
			titleLine2: "为夜而生。",
			subtitle:
				"将门店、PR 代理与 PR 连接于同一智能生态系统——从首次签到到最终签字发薪。",
			watchPlatform: "观看平台演示",
			stat1: "人力规划时间更少",
			stat2: "数字收据 → 发薪",
			stat3: "因纸质记录流失的争议",
			trustedBy: "以下门店现场信赖",
			liveOnShift: "实时 · 34 人在岗",
			aiMatched: "AI 匹配",
			badgeAlt: "InnocenZ 平台徽章",
		},
		challenges: {
			eyebrow: "夜场运营为何频频失灵",
			titlePrefix: "夜晚节奏飞快，",
			titleHighlight: "运营却还在靠纸质流程。",
			sub: "排班在 WhatsApp，薪资在 Excel，争议靠现金。",
			forLabel: "面向",
			outletOwners: "门店",
			prAgencies: "PR 代理",
			prProfessionals: "PR",
			outletPains: [
				"现场 PR 质量不佳",
				"每周手动排班",
				"临时取消",
				"淡季人力过剩",
				"薪资争议",
				"营收流失",
				"零实时可视性",
				"合规与声誉风险",
			],
			agencyPains: [
				"手动发薪",
				"现金流困在应收款",
				"门店回款延迟",
				"PR 重复预订",
				"资源规划薄弱",
				"无绩效信号",
				"人员流动率高",
				"报告不准确",
			],
			prPains: [
				"无法查看开放班次",
				"延迟发薪",
				"佣金不透明",
				"排班混乱",
				"收入不透明",
				"无职业路径",
				"缺少绩效激励",
			],
		},
		solution: {
			eyebrow: "一个智能运营平台",
			titlePrefix: "三方协作，",
			titleHighlight: "一个实时现场。",
			sub: "InnocenZ 将门店、代理与 PR 串联为单一 AI 驱动闭环——从排班到收据再到签字发薪——在夜晚进行中完成对账。",
			outletLabel: "门店",
			outletDesc: "预订今晚人力。掌握现场。",
			agencyLabel: "PR 代理",
			agencyDesc: "安排班表。发放薪资。",
			prLabel: "PR",
			prDesc: "签到。扫描。收款。",
			flowBadge: "实时 · AI 匹配 · 周期对账",
			outletAlt: "Velvet Throne 威士忌酒吧——门店",
			agencyAlt: "PR 代理经理",
			prAlt: "现场 PR",
		},
		platform: {
			eyebrow: "平台",
			titlePrefix: "每个运营环节，",
			titleHighlight: "一条主干。",
			sub: "十二个模块，从排班到签署发薪。",
			modules: zhModules,
		},
		ai: {
			eyebrow: "AI 层",
			titlePrefix: "与您",
			titleHighlight: "共赴每个夜晚",
			titleSuffix: "。",
			sub: "不是聊天，不是噱头。七个智能层，预测、匹配、对账。",
			modelContext: "模型上下文",
			modelContextDesc: "基于门店、代理与 PR 的实时信号训练。",
			features: zhAiFeatures,
		},
		dashboards: {
			eyebrow: "按您真实的夜场方式打造",
			titlePrefix: "三个门户，",
			titleHighlight: "一个实时脉搏。",
			sub: "门店网页、代理网页与 PR 移动端——从排班规划到收据扫描再到签署支付凭证全程同步。每项 KPI 实时更新。",
			liveFloor: "实时现场 · 周五 21:16",
			outlet: "门店",
			onShift: "在岗",
			netSales: "酒水营业额",
			variance: "销售对目标",
			checkedIn: "已签到",
			tonightsRoster: "今晚排班",
			netSales4h: "酒水营业额 · 4 小时",
			cycleSettles: "周期 · 周日结算",
			agency: "PR 代理",
			prsBooked: "已预订 PR",
			pendingPvs: "待签支付凭证",
			utilisation: "在岗 PR 占比",
			payout: "发薪",
			bookingsByOutlet: "本周各门店预订",
			pvsSigned: "3 份支付凭证已签署并支付",
			tonight: "今晚",
			liveEarnings: "实时收入",
			earningsBreakdown: "日薪 · 桌台 · 酒水 · 目标",
			gpsCheckIn: "GPS 签到",
			verified: "已验证 · 21:04",
			receipts: "收据",
			scanned: "已扫描",
			signVoucher: "签署支付凭证 · RM 512",
			statusLive: "在岗",
			statusRoute: "途中",
			statusIdle: "空闲",
			days: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
		},
		benefits: {
			eyebrow: "业务成果，而非功能清单",
			titleHighlight: "可量化",
			titleSuffix: "，各方都能看见成果。",
			sub: "InnocenZ 每个模块都对应财务团队认可的数字。",
			outletOwners: "门店",
			prAgencies: "PR 代理",
			prProfessionals: "PR",
			connectedAgencies: "已连接代理",
			outletWins: [
				{ kpi: "80%", label: "人力规划时间更少" },
				{ kpi: "0", label: "关店时现金对账" },
				{ kpi: "100%", label: "跨门店实时掌握现场动态" },
				{ kpi: "-42%", label: "AI 匹配后未到岗率" },
			],
			agencyWins: [
				{ kpi: "6h → 6m", label: "完成每周薪资周期" },
				{ kpi: "100%", label: "数字收据到发薪流程" },
				{ kpi: "+38%", label: "PR 池利用率" },
				{ kpi: "0", label: "因纸质记录流失的争议" },
			],
			prWins: [
				{ kpi: "T+0", label: "周期结束钱包发薪" },
				{ kpi: "实时", label: "班内收入可见" },
				{ kpi: "已验证", label: "GPS + 自拍签到" },
				{ kpi: "每班", label: "评分。每级晋升。" },
			],
		},
		why: {
			eyebrow: "为什么选择 InnocenZ",
			titlePrefix: "不是又一个仪表盘。",
			titleHighlight: "是运营平台。",
			sub: "八大结构性优势为夜生活运营而建——非通用 SaaS 改造。",
			advantages: zhAdvantages,
		},
		testimonials: {
			eyebrow: "现场证言",
			titlePrefix: "已签署。",
			titleHighlight: "记录在案。",
			quotes: [
				{
					q: "我们在最后一桌清台前就关闭了周五的薪资。这在 InnocenZ 之前从未发生过。",
					n: "Marcus Tan",
					t: "COO · Skybar Group",
					role: "门店",
				},
				{
					q: "利用率提升 38%，PV 争议归零。整个商业案例，一屏可见。",
					n: "Priya Anand",
					t: "MD · Nova PR Agency",
					role: "PR 代理",
				},
				{
					q: "班内实时看到收入。周期结束当天收款。无需追讨任何人。",
					n: "Aisha Lim",
					t: "一级 PR · 吉隆坡",
					role: "PR",
				},
			],
			roleOutlet: "门店",
			roleAgency: "PR 代理",
			rolePr: "PR",
		},
		pricing: {
			eyebrow: "选择您的访问等级",
			title: "随您的现场规模扩展。",
			outletIntro: "门店计划按每日预订 PR 人数扩展。",
			agencyIntro: "代理计划按每周签发支付凭证数量扩展。",
			outletFeatures: [
				"包含全部平台模块",
				"实时现场 + AI 匹配",
				"周期锁定发薪",
				"完整审计追踪",
			],
			agencyFeatures: [
				"完整代理门户",
				"排班 + PR 池管理",
				"电子签署支付凭证",
				"周期对账与争议处理",
			],
			platformNote: "所有计划包含完整平台——无功能限制。",
			outletTab: "门店",
			agencyTab: "PR 代理",
			popular: "热门",
			bookDemo: "预约演示",
			talkToUs: "联系我们",
			outletFootnote: "PR = 每个营业日预订的 PR 人数",
			agencyFootnote: "PV = 支付凭证 · 每周期签发 · PR 电子签署",
			outletTiers: [
				{
					name: "Essential",
					capacity: "5 PR / 天",
					detail: "从 10 名 PR 中选 5 名",
					period: "/ 月",
				},
				{
					name: "Plus",
					capacity: "6–10 PR / 天",
					detail: "从 20 名 PR 中选 10 名",
					period: "/ 月",
				},
				{
					name: "Pro",
					capacity: "11–25 PR / 天",
					detail: "从 50 名 PR 中选 25 名",
					period: "/ 月",
				},
				{
					name: "Enterprise",
					capacity: "26–50 PR / 天",
					detail: "从 100 名 PR 中选 50 名",
					period: "/ 月",
				},
				{
					name: "Scale",
					capacity: "51–100 PR / 天",
					detail: "从 200 名 PR 中选 100 名",
					period: "/ 月",
				},
				{
					name: "Premier",
					capacity: "101+ PR / 天",
					detail: "适用于最大规模运营",
					period: "/ 月",
				},
			],
			agencyTiers: [
				{
					name: "Starter",
					capacity: "5 PV / 周",
					detail: "核心门户访问",
					period: "/ 周",
				},
				{
					name: "Plus",
					capacity: "6–10 PV / 周",
					detail: "成长型排班 · 薪资与历史",
					period: "/ 周",
				},
				{
					name: "Growth",
					capacity: "11–25 PV / 周",
					detail: "扩展排班 · 薪资与报告",
					period: "/ 周",
				},
				{
					name: "Enterprise",
					capacity: "26–75 PV / 周",
					detail: "大型排班 · 优先支持",
					period: "/ 周",
				},
				{
					name: "Scale",
					capacity: "76–150 PV / 周",
					detail: "高量级 · 专属成功经理",
					period: "/ 周",
				},
				{
					name: "Custom",
					capacity: "151+ PV / 周",
					detail: "与 InnocenZ 管理员定制条款",
					period: "",
					price: "面议",
				},
			],
		},
		cta: {
			eyebrow: "随时就绪",
			titlePrefix: "掌控夜晚，",
			titleHighlight: "全面掌控。",
			sub: "门店、代理与 PR——同一平台，从首次签到到最终发薪。Q3 优先访问开放中。",
			login: "登录",
			seePricing: "查看定价",
		},
		footer: {
			tagline: "面向娱乐场所、PR 代理与一线人员的 AI 驱动运营平台。",
			copyright: "Crowned nightlife · 保留所有权利",
			columns: [
				{ title: "平台", links: ["概览", "AI 层", "仪表盘", "模块", "安全"] },
				{
					title: "面向",
					links: ["门店与 KTV", "PR 代理", "PR", "投资者", "合作伙伴"],
				},
				{ title: "公司", links: ["关于", "招聘", "媒体", "法律", "隐私"] },
			],
			legal: ["条款", "隐私", "安全"],
		},
		meta: {
			title: "InnocenZ — 夜生活运营平台",
			description:
				"AI 驱动运营平台，连接娱乐场所、PR 代理与 PR——从排班到收据再到签字发薪。",
		},
		signup: signupTranslations.zh,
	},
};

export const OUTLET_TIER_PRICES = [
	"999",
	"1,699",
	"2,999",
	"3,999",
	"6,999",
	"9,999",
] as const;
export const AGENCY_TIER_PRICES = [
	"125",
	"250",
	"500",
	"1,000",
	"1,500",
] as const;
