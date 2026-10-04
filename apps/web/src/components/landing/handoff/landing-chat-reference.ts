/**
 * The chatbot's deeper reference: what a PR, an agency, an outlet or a visitor
 * may ask beyond the short topics in landing-chat-knowledge.ts. Only Gemini
 * reads these — factSheet() adds them after the topics, and `pnpm chat:facts`
 * copies the result to the backend — so the keyword bot keeps its short answers.
 *
 * Every line was checked against the code before it went in (owner, 2 Oct
 * 2026: "make the chatbot … reply all everythings about the InnocenZ … more
 * accurate"). These facts are PUBLIC and are sent to Google: no internal notes,
 * known gaps, people's details or anything only the InnocenZ team sees.
 * ⚠️ After editing, run `pnpm chat:facts` (`pnpm chat:facts:check` fails until you do).
 */
export interface ReferenceSection {
	id: string;
	/** Whose question this answers; "any" for everyone. */
	role: "pr" | "agency" | "outlet" | "any";
	en: { title: string; lines: string[] };
	zh: { title: string; lines: string[] };
	/**
	 * Other ways people ask this (casual English, Manglish, Malay, Malaysian
	 * 中文) — read only by the written backup's matcher, never sent to Gemini.
	 * A title has one phrasing; "kod pengesahan tak sampai" and "never receive
	 * the otp leh" are the same question as "I didn't get my verification code".
	 */
	asks?: string[];
}

export const CHAT_REFERENCE: ReferenceSection[] = [
	/* ---------- PR — the phone app ---------- */
	{
		id: "ref-pr-signup-steps",
		role: "pr",
		asks: [
			"sign up steps",
			"registration need what",
			"create account need fill what details ah",
			"sign up must fill measurements ah",
			"daftar akaun isi apa",
			"langkah daftar akaun",
			"注册要准备什么",
			"注册要填哪些资料",
			"注册账号要拍身份证吗",
		],
		en: {
			title: "What do I fill in to create an account?",
			lines: [
				"The PR taps “Create an account” on the sign-in screen. Sign-up has six steps: “Persona”, “Address”, “Agency”, “Verify”, “Summary” and “OTP”.",
				"“Persona” needs a nickname, full name, a phone number registered on WhatsApp and at least one language; nationality, ID details, birth date and measurements are optional.",
				"“Verify” photographs the IC front and back (or the passport photo page). “Summary” needs a profile photo, a password of at least 6 characters and four ticked agreements.",
			],
		},
		zh: {
			title: "注册账号要填写什么？",
			lines: [
				"PR 在登录页点「创建账号」。注册共六步：「个人资料」「地址」「经纪公司」「身份验证」「摘要」「验证码」。",
				"「个人资料」需填写昵称、全名、已注册 WhatsApp 的手机号码，并至少选一种语言；国籍、证件资料、出生日期和身材尺寸为选填。",
				"「身份验证」拍摄身份证正反面（或护照资料页）。「摘要」需上传头像、设置至少 6 位的密码，并勾选四项确认。",
			],
		},
	},
	{
		id: "ref-pr-signup-agency",
		role: "pr",
		asks: [
			"sign up without agency",
			"profile shows awaiting approval",
			"no agency yet can register or not",
			"joining on my own still need agency approve ah",
			"daftar tanpa agensi",
			"没有经纪公司能注册吗",
			"自行加入要批准吗",
			"没公司可以先注册吗",
		],
		en: {
			title: "Do I need an agency before I sign up?",
			lines: [
				"At the “Agency” step the PR chooses “Pick an agency” (a searchable list) or “Joining on my own”, which can still ask one agency to accept them.",
				"Either way an agency must approve the PR before any shift can be given. If an agency was chosen, “Profile” shows “Awaiting approval ·” with its name until it decides.",
				"The PR can open every screen while waiting; there are simply no shifts yet. The bell says when the agency accepts or declines. A PR who chose no agency can pick one later under “Profile” → “Edit profile” → “Agencies”.",
			],
		},
		zh: {
			title: "注册前一定要有经纪公司吗？",
			lines: [
				"在「经纪公司」这一步，PR 选「选择经纪公司」（可搜索的列表）或「自行加入」；自行加入也可以请一家经纪公司接受。",
				"两种方式都要经纪公司批准后才会有班。如已选择经纪公司，在其决定前「我的」页会显示「等待审批 ·」和该公司名称。",
				"等待期间 PR 可以打开所有页面，只是还没有班。经纪公司接受或拒绝时，铃铛通知会告知。没有选经纪公司的 PR，之后可在「我的」→「编辑资料」→「经纪公司」里选择。",
			],
		},
	},
	{
		id: "ref-pr-added-by-agency",
		role: "pr",
		asks: [
			"agency already added me",
			"agency already registered my number, how to sign up",
			"agency key in my number already, how to login ah",
			"agency added me but i got no password leh",
			"公司已经加了我",
			"经纪公司已经帮我建档，怎么登录",
			"公司加了我还要注册吗",
		],
		en: {
			title: "My agency already added me — how do I get in?",
			lines: [
				"If an agency already added the PR by phone number, the PR taps “Create an account” and signs up with that same number.",
				"That sign-up's code goes by WhatsApp to the phone. The password set there becomes the account's password, and the membership the agency already approved carries over — no new approval is needed.",
			],
		},
		zh: {
			title: "经纪公司已经帮我建档，我要怎么登录？",
			lines: [
				"如果经纪公司已用手机号把 PR 加入名单，PR 点「创建账号」，用同一个号码注册。",
				"这次注册的验证码会通过 WhatsApp 发到该手机。注册时设定的密码就是账号密码，经纪公司已批准的身份会保留，不需要再次审批。",
			],
		},
	},
	{
		id: "ref-pr-code-not-received",
		role: "pr",
		asks: [
			"no otp received",
			"otp expired already, how to resend ah",
			"收不到OTP",
			"WhatsApp 没收到验证码",
			"验证码过期了怎么重发",
		],
		en: {
			title: "I didn't get my verification code",
			lines: [
				"The 6-digit code is sent by WhatsApp to the phone number, so the number must be on WhatsApp. At sign-up the same code may also be emailed to the address typed.",
				"A code lasts 10 minutes. A new one can be requested after 60 seconds (“Resend OTP” at sign-up), and 5 wrong tries need a new code.",
				"Tip: copy the code in WhatsApp, then tap “Paste code” in the app.",
			],
		},
		zh: {
			title: "收不到验证码怎么办？",
			lines: [
				"6 位验证码通过 WhatsApp 发到手机号码，所以号码必须已注册 WhatsApp。注册时，同一个验证码也可能发到所填写的电子邮箱。",
				"验证码 10 分钟内有效。60 秒后可重新获取（注册时点「重发验证码」）；输错 5 次需要获取新的验证码。",
				"小技巧：在 WhatsApp 复制验证码，再到 App 里点「粘贴验证码」。",
			],
		},
	},
	{
		id: "ref-pr-signin-trouble",
		role: "pr",
		asks: [
			"cant log in",
			"login says wrong phone number or password",
			"app cannot login leh",
			"登录不了",
			"登录失败说密码错误",
			"登录被锁了要等多久",
		],
		en: {
			title: "I can't sign in to the PR app",
			lines: [
				"The PR picks the country code, types the mobile number and password, and taps “Sign in”.",
				"A wrong number and a wrong password get the same answer: “Wrong phone number or password”. Too many wrong tries lock sign-in for some minutes, and the app says how long.",
				"“Forgot password?” lets the PR choose “Phone” or “Email”, enter the 6-digit code, and set a new password of at least 6 characters.",
			],
		},
		zh: {
			title: "PR App 登录不了怎么办？",
			lines: [
				"PR 选择国家区号，输入手机号码和密码，再点「登录」。",
				"号码错或密码错都会显示同一句：「手机号码或密码错误」。错太多次会暂时锁定登录几分钟，App 会显示要等多久。",
				"点「忘记密码？」，选「手机号」或「电子邮箱」，输入 6 位验证码，再设定至少 6 位的新密码。",
			],
		},
	},
	{
		id: "ref-pr-today-tab",
		role: "pr",
		asks: [
			"today tab",
			"where see dress code for tonight shift ah",
			"today page",
			"today say no shift scheduled, why ah",
			"skrin today",
			"今日页面",
			"今晚的班在哪里看服装要求",
			"今日班卡显示什么",
		],
		en: {
			title: "What does the Today tab show?",
			lines: [
				"The top strip has “TODAY”, “TO-DO” and “UPCOMING”; tapping one opens its section, and “UPCOMING” opens “Agency schedule”.",
				"Each shift card shows the venue and address, normal shift or special event, the booking agency, the date and time, the pay, and the dress code and preferred languages when the venue set them.",
				"Tap a card to open it. Tonight's card has “Check in” (“Attendance” once checked in); a finished one is marked “Complete” with “View summary”. A day without work reads “No shift scheduled for today.”",
			],
		},
		zh: {
			title: "「今日」页显示什么？",
			lines: [
				"顶部有「今日」「待办」「即将到来」三栏；点一栏会打开对应区块，「即将到来」会打开「经纪排班」。",
				"每张班次卡显示场所和地址、常规班次或特别活动、安排该班的经纪公司、日期和时间、薪资，以及场所设定的着装要求和语言偏好。",
				"点卡片可展开。今晚的卡有「签到」按钮（签到后变为「出勤」）；结束的卡标示「已完成」并有「查看摘要」。没有班的日子显示「今日没有安排班次。」",
			],
		},
	},
	{
		id: "ref-pr-todo",
		role: "pr",
		asks: [
			"todo list",
			"todo card cannot dismiss",
			"how to clear todo card ah",
			"todo say nothing to do, means what ah",
			"senarai todo",
			"apa ada dalam senarai todo",
			"待办事项",
			"待办卡片删不掉",
			"待办有哪些事",
		],
		en: {
			title: "What is in the TO-DO list?",
			lines: [
				"“TO-DO” on “Today” collects what needs the PR: an “OUTLET SWAP REQUEST”, a voucher to sign (“Review payment voucher” → “Review PV”) and a “Forgot to check out?” warning.",
				"These cards cannot be dismissed — each stays until the PR answers the swap (unless the agency withdraws it first), signs the voucher or checks out. An empty list reads “Nothing to do”.",
			],
		},
		zh: {
			title: "「待办」里有什么？",
			lines: [
				"「今日」里的「待办」集中显示需要 PR 处理的事：「门店换班请求」、待签的结算单（「审阅结算单」→「去审阅」）和「忘记签退了吗？」提醒。",
				"这些卡片不能关掉 — 要等 PR 回复换班（除非经纪公司先撤回）、签好结算单或签退后才会消失。没有待办时显示「暂无待办」。",
			],
		},
	},
	{
		id: "ref-pr-calendar-colours",
		role: "pr",
		asks: [
			"agency schedule colours",
			"calendar amber pending means what ah",
			"schedule got red and bright red, what different ah",
			"green gold amber colour in schedule means what",
			"warna jadual agensi",
			"排班颜色",
			"排班表的颜色代表什么",
			"日历黄色红色是什么意思",
		],
		en: {
			title: "What do the colours in Agency schedule mean?",
			lines: [
				"In “Agency schedule” on “Today”: plain “Available”, green “Scheduled / Complete” (a day worked), gold “On duty”, amber “Pending”, red “Not available” and bright red “Missed check-in”.",
				"Amber “Pending” is a booked shift not yet worked, or an MC / leave still waiting for the agency.",
				"Tapping a day with shifts lists what happened to each: checked in and out, cancelled, leave requested, no check-in recorded, or marked no-show.",
			],
		},
		zh: {
			title: "「经纪排班」的颜色代表什么？",
			lines: [
				"「今日」里的「经纪排班」：素色「可接班」、绿色「已排班 / 已完成」（已出勤的日子）、金色「值班中」、琥珀色「待确认」、红色「不可接班」、亮红色「未签到」。",
				"琥珀色「待确认」表示已排好但还没上的班，或仍在等经纪公司处理的病假 / 请假。",
				"点有班的日子，会列出每个班的结果：已签到并签退、已取消、已提交请假、未记录签到，或已标记为缺勤。",
			],
		},
	},
	{
		id: "ref-pr-unavailable-days",
		role: "pr",
		asks: [
			"reopen a day i marked unavailable",
			"accidentally block my day, how to unblock leh",
			"already got shift that day cannot block ah",
			"取消没空的日子",
			"提前标记没空",
			"已经有班的日子不能标记没空吗",
		],
		en: {
			title: "How do I undo or plan my unavailable days?",
			lines: [
				"Tapping a red “Not available” day again reopens it straight away, with no reason asked.",
				"Days can be marked from today up to 3 weeks ahead. The reason in “Mark unavailable” is optional and is what the agency sees on its roster.",
				"A day the PR is already rostered on cannot be blocked — tapping it shows that day's shifts instead; to drop one, cancel it or send an MC / leave.",
			],
		},
		zh: {
			title: "怎么取消或预先标记不可接班的日子？",
			lines: [
				"再点一次红色的「不可接班」日子，就会立即恢复为可接班，不需要填原因。",
				"可以标记今天起 3 周内的日子。「标记为不可接班」里的原因为选填，经纪公司会在排班表上看到它。",
				"已经被排班的日子不能标记 — 点它会显示当天的班次；要退出某个班，请取消或提交病假 / 请假。",
			],
		},
	},
	{
		id: "ref-pr-cancel-fee",
		role: "pr",
		asks: [
			"how much charge if i cancel last minute",
			"charged for cancelling or not",
			"cancellation rules where to see ah",
			"caj batal syif",
			"caj pembatalan last minit",
			"取消费",
			"临时取消班要扣多少钱",
			"取消班有罚钱吗",
		],
		en: {
			title: "How much does cancelling a shift cost?",
			lines: [
				"Each agency sets its own rules, shown under “Cancellation rules” in “Agency schedule”; a shift is charged by the rules of the agency that booked it.",
				"The fee depends on notice: early enough is free; short notice and late cancels each cost a percentage of the daily wage set by the agency. An agency with no rule charges nothing.",
				"The fee shows on the shift's “Cancel” button and in the sheet before the PR confirms.",
			],
		},
		zh: {
			title: "取消一个班要付多少？",
			lines: [
				"每家经纪公司自定规则，列在「经纪排班」的「取消规则」里；一个班按安排它的经纪公司的规则收费。",
				"费用看提前多久通知：够早免费；短时通知和临时取消各扣经纪公司设定的日薪百分比。没有设定规则的经纪公司不收费。",
				"PR 确认前，费用会显示在该班的「取消」按钮和取消页面上。",
			],
		},
	},
	{
		id: "ref-pr-cancel-how",
		role: "pr",
		asks: [
			"cancel my shift how",
			"where is the cancel button",
			"how to cancel shift ah, need reason",
			"batal syif",
			"怎么取消班次",
			"取消班要写理由吗",
		],
		en: {
			title: "How do I cancel a shift?",
			lines: [
				"The PR taps “Cancel” on the shift in the “Agency schedule” timetable (today and the next 6 days), or “Cancel shift” on the “Check-In” tab.",
				"A reason is required. “Cancel & accept” cancels at once and tells the agency it needs cover.",
				"A shift already checked in or completed cannot be cancelled. Any fee comes off the PR's voucher and shows as a red deduction on “Payment”.",
			],
		},
		zh: {
			title: "怎么取消一个班？",
			lines: [
				"PR 在「经纪排班」时间表（今天和之后 6 天）里点该班的「取消」，或在「签到」页点「取消班次」。",
				"必须填写原因。点「取消并接受」会立即取消，并通知经纪公司需要补人。",
				"已签到或已完成的班不能取消。如有费用，会从 PR 的结算单扣除，并在「结算」页显示为红色扣款。",
			],
		},
	},
	{
		id: "ref-pr-mc-after",
		role: "pr",
		asks: [
			"what happens after mc submitted",
			"leave request rejected still must work?",
			"mc approved then shift gone from calendar ah",
			"mc awaiting agency review means what",
			"请病假之后会怎样",
			"请假被驳回还要上班吗",
			"MC批准了之后那个班呢",
		],
		en: {
			title: "What happens after I send an MC or leave request?",
			lines: [
				"The shift then reads “MC / Leave submitted — awaiting agency review.” and stays the PR's until the agency decides.",
				"If approved, the PR is excused from that shift with no deduction, the shift leaves “Today” and the calendar, and that day is closed to new bookings.",
				"If rejected, it reads “Leave request rejected — you are still on this shift.” The bell reports either decision.",
				"Approved leave never counts as a missed shift for the agency's “Min shifts per week” rule, but it does count toward its “Max MC per month” rule if it has one; going over that cap can bring the fine the agency set. Such a fine shows on the red “PENALTIES THIS WEEK” card on “Payment” as “PENDING”, and is “DEDUCTED” only once the agency adds it to the voucher.",
			],
		},
		zh: {
			title: "提交病假或请假后会怎样？",
			lines: [
				"该班会显示「病假 / 请假已提交 — 等待经纪公司审核。」，在经纪公司决定前仍由 PR 负责。",
				"批准后，PR 这班免责且不扣款，该班从「今日」和日历中移除，当天也不会再被排新班。",
				"被拒绝时显示「请假申请已被拒绝 — 你仍需出勤这个班次。」两种结果都会有铃铛通知。",
				"批准的病假不会算作「每周最少班次」规则里的缺班，但如果经纪公司设了「每月最多病假」规则，会计入次数；超过上限可能按经纪公司设定的金额罚款。这类罚款会在「结算」页红色的「本周罚款」卡上显示为「待处理」，经纪公司加入结算单后才会扣除（显示「已扣除」）。",
			],
		},
	},
	{
		id: "ref-pr-missed-shift",
		role: "pr",
		asks: [
			"missed my shift",
			"wrongly marked no-show, how ah",
			"terlepas syif",
			"ponteng syif apa jadi",
			"错过班次",
			"没去上班会被记缺席吗",
			"没去上班会怎样",
		],
		en: {
			title: "What if I miss a shift?",
			lines: [
				"A booked shift whose time passes with no check-in shows bright red “Missed check-in” in “Agency schedule”.",
				"About three hours after the shift ends — sooner if the PR's next shift starts within that time — it is recorded as “Marked no-show”, and it can no longer be checked in.",
				"If that is wrong, the PR contacts the agency. A shift the PR cannot work should be cancelled or sent as MC / leave beforehand.",
			],
		},
		zh: {
			title: "错过了一个班会怎样？",
			lines: [
				"已排的班过了时间还没签到，「经纪排班」会显示亮红色「未签到」。",
				"班次结束约 3 小时后（如 PR 的下一个班在这段时间内开始，则会更早），会记录为「已标记为缺勤」，之后不能再签到。",
				"如有错误，PR 请联系经纪公司。无法上班的班次，应提前取消或提交病假 / 请假。",
			],
		},
	},
	{
		id: "ref-pr-checkin-trouble",
		role: "pr",
		asks: [
			"check in cannot leh, gps problem",
			"refresh gps also cannot check in ah",
			"签不到",
			"打卡不了说距离太远",
			"定位不准签不了到",
		],
		en: {
			title: "Why won't check-in work?",
			lines: [
				"Outside the venue's circle the button reads, e.g., “137 m away — move closer”. The distance is measured from the venue's saved map pin, with up to 30 m extra allowed for the phone's GPS accuracy; move closer and tap “Refresh GPS”.",
				"Location off: allow InnocenZ location in the phone's Settings and turn GPS on; with no GPS fix, step outside or near a window. A fake (mock) location is refused — turn off any GPS-spoofing app.",
				"Already inside but still told you are too far? GPS is often weak indoors — tap “Refresh GPS” by the entrance or a window. If it still fails, the venue's saved pin may be in the wrong place; the venue sets it in its own settings, so tell your agency or the venue.",
				"Still checked in at another shift? Check out of that one first; only one shift can be open at a time.",
			],
		},
		zh: {
			title: "为什么签不了到？",
			lines: [
				"在场所范围外，按钮会显示例如「距离 137 米 — 请再靠近一些」。距离从场所保存的地图定位点量起，并按手机 GPS 精度最多再放宽 30 米；走近后点「刷新定位」。",
				"定位关闭时：在手机设置里允许 InnocenZ 使用位置并打开 GPS；定位不到时，走到户外或窗边。手机回报虚拟（模拟）位置会被拒绝 — 请关闭任何改定位的 App。",
				"人已在场内却仍显示太远？室内 GPS 信号常常较弱 — 到门口或窗边点「刷新定位」。仍然不行的话，可能是场所保存的定位点放错了位置；定位点由场所在自己的设置里设定，请告诉你的经纪公司或场所。",
				"还在另一个班签到中？先签退那一班；同一时间只能有一个班在进行。",
			],
		},
	},
	{
		id: "ref-pr-wage",
		role: "pr",
		asks: [
			"leave early wage cut by minute",
			"day pay how calculate",
			"short 5 min still full day rate ah",
			"gaji harian",
			"kiraan gaji harian",
			"日薪怎么计算",
			"早退扣日薪吗",
			"一天的人工怎么算",
		],
		en: {
			title: "How is my daily wage worked out?",
			lines: [
				"The daily wage counts only time inside the shift's scheduled hours: arriving early earns nothing extra, and arriving late or leaving early is paid by the minute.",
				"Being up to 5 minutes short in total still pays the full day rate. A “COMMISSION ONLY” PR has no daily wage.",
				"At check-out the wage is filed onto that week's voucher straight away, and the app opens “Payment” → “This week”.",
			],
		},
		zh: {
			title: "日薪是怎么算的？",
			lines: [
				"日薪只计算班次排定时间内的时长：提早到不会多算，迟到或早退按分钟计算。",
				"合计短少不超过 5 分钟，仍算全天日薪。「纯佣金」PR 没有日薪。",
				"签退时，日薪会立即记入该周结算单，App 会打开「结算」→「本周」。",
			],
		},
	},
	{
		id: "ref-pr-log-drinks",
		role: "pr",
		asks: [
			"log drinks",
			"record drinks tips and services",
			"scan receipt for drinks how ah",
			"self log drinks where one ah",
			"rekod minuman",
			"masukkan tip dan minuman",
			"scan resit minuman",
			"记录酒水",
			"怎么扫描小票记录酒水",
			"登记小费和酒水",
		],
		en: {
			title: "How do I log drinks, tips and services?",
			lines: [
				"After check-in, the “Check-In” tab shows the “STATUS” panel with “Drinks” and “Tips”, each with “Scan” and “Self-log”.",
				"“Self-log” shows the venue's price list: the PR sets quantities, attaches a receipt photo, writes a note for the agency and taps “Submit self-log”.",
				"“Scan” reads the receipt with the camera; anything it misses is added with “Self-log”. Services such as bookings are on the “Tips” side.",
				"Logging works only while checked in — commission cannot be added after check-out.",
			],
		},
		zh: {
			title: "怎么记录酒水、小费和服务？",
			lines: [
				"签到后，「签到」页会出现「状态」面板，内有「酒水」和「小费」，各有「扫描」和「自行记录」。",
				"「自行记录」显示场所的价目表：PR 设定数量、附上收据照片、写给经纪公司的备注，再点「提交自行记录」。",
				"「扫描」用相机读取收据；没读到的项目用「自行记录」补上。订台等服务项目在「小费」那边。",
				"只有签到中才能记录 — 签退后不能再补登佣金。",
			],
		},
	},
	{
		id: "ref-pr-receipt-review",
		role: "pr",
		asks: [
			"receipt pending",
			"after submit receipt what happens",
			"self log receipt still pending, can edit or delete ah",
			"resit pending",
			"edit resit self-log",
			"小票待审批",
			"小票登记后公司会改金额吗",
			"收据还在待处理",
		],
		en: {
			title: "What happens to a receipt after I log it?",
			lines: [
				"A self-logged receipt is pending until the agency approves it; the agency checks it against the photo and can correct the figures.",
				"A scanned receipt counts as verified as soon as it is logged.",
				"While pending, the PR can edit or remove a self-logged row in the “STATUS” table; once the agency has reviewed it, a wrong figure is fixed by a dispute.",
				"The same order number cannot be logged twice on one day at one venue.",
			],
		},
		zh: {
			title: "收据记录后会怎样？",
			lines: [
				"自行记录的收据在经纪公司批准前为待审核；经纪公司会对照照片核对，并可更正金额。",
				"扫描的收据记录后即视为已核实。",
				"待审核期间，PR 可在「状态」表里编辑或删除自行记录的那一行；经纪公司审核后，金额有误要通过争议处理。",
				"同一场所同一天，同一个订单号不能记录两次。",
			],
		},
	},
	{
		id: "ref-pr-cant-checkout",
		role: "pr",
		asks: [
			"cant check out",
			"check out stuck says photo missing",
			"cannot checkout leh, every drink need photo ah",
			"nothing logged can still check out ah",
			"tak boleh check out",
			"签不了退",
			"退不了说少了照片",
			"下班退不了要拍照吗",
		],
		en: {
			title: "Why can't I check out?",
			lines: [
				"Every logged drink or tip needs a photo. If one is missing, the PR taps the red camera on that row to retake it, or removes the row, then checks out.",
				"If nothing was logged all night, the app asks “Check out with nothing logged?” — tap “Yes, check out anyway” only if there really was nothing.",
				"Commission for that shift cannot be added after check-out.",
			],
		},
		zh: {
			title: "为什么签不了退？",
			lines: [
				"每笔记录的酒水或小费都要有照片。缺照片时，PR 点该行的红色相机重拍，或删除该行，再签退。",
				"整晚都没记录时，App 会问「未记录任何项目就签退？」— 真的没有可记录的才点「确认，仍然签退」。",
				"签退后，该班的佣金不能再补登。",
			],
		},
	},
	{
		id: "ref-pr-forgot-checkout",
		role: "pr",
		asks: [
			"forgot to check out",
			"forgot checkout, still got pay ah",
			"terlupa daftar keluar",
			"忘记签退",
			"昨晚忘记打卡下班",
		],
		en: {
			title: "I forgot to check out — what now?",
			lines: [
				"“TO-DO” on “Today” shows “Forgot to check out?” with the venue and end time until the PR checks out. Check-out works from anywhere.",
				"Pay stops at the shift's scheduled end however late the PR taps out; time past the end is only paid if the agency approves it as overtime.",
				"A shift left open blocks checking in to the next one, so close it quickly.",
			],
		},
		zh: {
			title: "忘了签退怎么办？",
			lines: [
				"「今日」的「待办」会显示「忘记签退了吗？」，列出场所和结束时间，直到 PR 签退。签退在哪里都可以做。",
				"不论多晚签退，薪资都只算到排定的结束时间；超出的时间要经纪公司批准为加班才会付。",
				"没签退的班会挡住下一个班的签到，所以请尽快签退。",
			],
		},
	},
	{
		id: "ref-pr-overtime",
		role: "pr",
		asks: [
			"check out late the extra minutes got pay ah",
			"kerja lewat kira macam mana",
			"超时有钱拿吗",
			"超过下班时间有算钱吗",
			"超过下班时间还在做有钱吗",
		],
		en: {
			title: "Do I get paid overtime?",
			lines: [
				"Overtime is the minutes from the shift's scheduled end to the PR's check-out, counted only while checked in. Checking out late records them as a claim waiting for the agency; “Payment” notes it but leaves it out of the figures until approved.",
				"It is paid at 1.5× the PR's hourly rate for that shift: the daily wage ÷ the shift's scheduled hours. A “COMMISSION ONLY” PR has no daily wage, so there is no overtime pay.",
				"If approved, it is added to that week's voucher under “Others” and the bell says “Overtime approved”; if not, “Overtime not approved”.",
				"Overtime cannot be disputed in the app — the PR asks the agency if the decision looks wrong.",
			],
		},
		zh: {
			title: "加班有钱吗？",
			lines: [
				"加班是从班次排定结束时间到 PR 签退之间、仍在签到中的分钟数。晚签退会记为待经纪公司处理的加班；「结算」页会注明，但批准前不计入金额。",
				"加班按该班时薪的 1.5 倍计算：时薪 = 日薪 ÷ 该班排定的时数。「纯佣金」PR 没有日薪，所以没有加班费。",
				"批准后会加进该周结算单的「其他」，铃铛显示「加班已批准」；不批准则显示「加班未获批准」。",
				"加班不能在 App 里提出争议 — 如觉得决定有误，PR 请联系经纪公司。",
			],
		},
	},
	{
		id: "ref-pr-day-status",
		role: "pr",
		asks: [
			"day status meaning",
			"verified vs approved",
			"my day still pending why ah",
			"deducted status on the day means what ah",
			"status pending approved disputed",
			"已核实是什么意思",
			"付款页的每日状态",
			"状态待处理是什么意思",
		],
		en: {
			title: "What do PENDING, APPROVED, DISPUTED, VERIFIED mean?",
			lines: [
				"Each day on “Payment” has a status: “PENDING” — the agency has not reviewed it; “APPROVED” — the agency signed the day off; “DISPUTED” — the PR has an open claim on it.",
				"“VERIFIED” — a claim on that day was answered, or, on a closed week, the voucher has been sent; “DEDUCTED” — the day holds only a deduction.",
				"Amounts are coloured too: green settled, amber waiting, red disputed or deducted, white a mix.",
			],
		},
		zh: {
			title: "「待处理」「已批准」「争议中」「已核实」是什么意思？",
			lines: [
				"「结算」页每天都有状态：「待处理」— 经纪公司还没审核；「已批准」— 经纪公司已确认当天；「争议中」— PR 对当天有未结的争议。",
				"「已核实」— 当天的争议已有答复，或已结束的一周结算单已发出；「已扣除」— 当天只有扣款。",
				"金额也有颜色：绿色已结清，琥珀色等待中，红色争议或扣款，白色为混合状态。",
			],
		},
	},
	{
		id: "ref-pr-penalties",
		role: "pr",
		asks: [
			"my penalty",
			"fined this week why",
			"kena fine this week for what ah",
			"penalty pending or deducted means what",
			"denda dipotong ke",
			"罚款卡",
			"为什么被罚款",
			"罚款显示待处理是什么意思",
		],
		en: {
			title: "What is the PENALTIES THIS WEEK card?",
			lines: [
				"On “Payment”, a red “PENALTIES THIS WEEK” card lists fines the agency has charged: minimum shifts per week, maximum MC per month, lateness per week, and cancelled shifts.",
				"Each line says what it was for and whether it is “DEDUCTED” or still “PENDING”. The card appears only in a week with a fine.",
				"Each agency sets its own rules; fines are not disputed in the app — the PR asks the agency.",
			],
		},
		zh: {
			title: "「本周罚款」卡是什么？",
			lines: [
				"「结算」页上红色的「本周罚款」卡列出经纪公司已确认的罚款：每周最少班次、每月最多病假、每周迟到次数，以及取消的班次。",
				"每一行写明原因，以及是「已扣除」还是「待处理」。只有该周有罚款时才会出现。",
				"规则由各经纪公司自定；罚款不能在 App 里提出争议 — PR 请联系经纪公司。",
			],
		},
	},
	{
		id: "ref-pr-two-agency-pay",
		role: "pr",
		asks: [
			"two agencies pay split",
			"work 2 agency how many voucher",
			"two agency means two voucher ah",
			"which agency pays for which shift one",
			"gaji kedua-dua agensi berasingan ke",
			"kerja dua agensi, baucar berasingan ke",
			"gaji dibahagi antara agensi macam mana",
			"两家公司的薪水怎么分",
			"两间公司分开出粮吗",
			"两家经纪公司两张结算单吗",
		],
		en: {
			title: "I work for two agencies — how is my pay split?",
			lines: [
				"Money from each shift goes on the voucher of the agency that booked that shift, so a week with two agencies has two vouchers.",
				"Each agency reviews, signs and pays its own voucher; the PR signs each one with its own “Review & sign · [agency] · [amount]” button.",
			],
		},
		zh: {
			title: "我为两家经纪公司工作，薪资怎么分？",
			lines: [
				"每个班的收入记入安排该班的经纪公司的结算单，所以一周为两家公司工作就会有两张结算单。",
				"每家经纪公司各自审核、签名和付款；PR 用各自的「审阅并签名 · [经纪公司] · [金额]」按钮分别签名。",
			],
		},
	},
	{
		id: "ref-pr-voucher-when",
		role: "pr",
		asks: [
			"weekly voucher when",
			"last week pv not here yet leh",
			"voucher say not sent to you yet, when ah",
			"结算单几时来",
			"上个星期的PV几时有",
			"PV还没收到",
		],
		en: {
			title: "When does my weekly voucher arrive?",
			lines: [
				"The pay week runs Sunday to Saturday. Early on Sunday the week just ended becomes one voucher per agency.",
				"The agency reviews and signs it, then sends it; the bell says “Your payment voucher is ready” and “TO-DO” shows “Review payment voucher”.",
				"Before that, “Payment” → “Last week” reads “No PV for last week yet”, or the voucher shows “Not sent to you yet — waiting for your agency”.",
			],
		},
		zh: {
			title: "每周结算单什么时候来？",
			lines: [
				"薪资周为周日至周六。周日凌晨，刚结束的一周会按经纪公司各生成一张结算单。",
				"经纪公司审核并签名后发出；铃铛显示「你的结算单已就绪」，「待办」出现「审阅结算单」。",
				"在此之前，「结算」→「上周」显示「上周暂无结算单」，或结算单显示「尚未发送给你 — 等待经纪公司」。",
			],
		},
	},
	{
		id: "ref-pr-cant-sign",
		role: "pr",
		asks: [
			"cant sign voucher",
			"sign button greyed out cannot sign pv",
			"cannot sign pv leh, dispute still open",
			"pv sign button cannot press ah",
			"tak boleh sign pv",
			"tak boleh tandatangan pv",
			"baucar tak boleh sign",
			"结算单不能签",
			"为什么PV不能签名",
			"结算单签名按钮按不了",
		],
		en: {
			title: "Why can't I sign my voucher?",
			lines: [
				"Signing opens only after the agency sends the voucher; before that it reads “Not sent to you yet — waiting for your agency”.",
				"An open dispute blocks signing: the PR withdraws it or waits for the agency's answer first.",
				"To sign, the PR taps “Sign payment voucher”, draws a signature with a finger and taps “Confirm signature”.",
			],
		},
		zh: {
			title: "为什么不能签结算单？",
			lines: [
				"经纪公司发出结算单后才能签名；之前显示「尚未发送给你 — 等待经纪公司」。",
				"有未结的争议时不能签名：PR 要先撤回争议，或等经纪公司答复。",
				"签名时，PR 点「签署结算单」，用手指画签名，再点「确认签名」。",
			],
		},
	},
	{
		id: "ref-pr-after-sign",
		role: "pr",
		asks: [
			"after sign voucher when paid",
			"signed pv then what",
			"agency reopen signed voucher must sign again ah",
			"签了PV之后什么时候出粮",
			"签完结算单之后呢",
			"签了之后几时收到钱",
		],
		en: {
			title: "What happens after I sign the voucher?",
			lines: [
				"The signed figures are locked, and the voucher shows “Signed” under “History” → “Payment history”.",
				"The agency pays from its own bank to the PR's bank account and records it; the bell says “You have been paid”, and the voucher shows “PAID”, with the bank reference if one was added.",
				"If the agency must correct a signed voucher, it re-opens it, both signatures are cleared, and the PR signs the corrected voucher again.",
			],
		},
		zh: {
			title: "签了结算单之后呢？",
			lines: [
				"签名后金额锁定，结算单在「记录」→「结算记录」显示「已签署」。",
				"经纪公司从自己的银行转账到 PR 的银行账户并记录；铃铛显示「款项已支付」，结算单显示「已支付」，如有填写会附银行参考号。",
				"如经纪公司需要更正已签的结算单，会重新开启，双方签名清除，PR 再签更正后的结算单。",
			],
		},
	},
	{
		id: "ref-pr-bank-details",
		role: "pr",
		asks: [
			"add bank details",
			"fill bank info",
			"payment say add your bank details, where ah",
			"change bank account in app how ah",
			"akaun bank",
			"isi akaun bank",
			"tukar nombor akaun bank",
			"银行户口",
			"填银行户口号码",
			"银行资料在哪里改",
		],
		en: {
			title: "Where do I add my bank details?",
			lines: [
				"“Profile” → “Edit profile” → “Bank details”: pick the “Bank” from the searchable list of Malaysian banks, type the “Account number”, then tap “Save profile”.",
				"Until both are filled, “Payment” shows an amber “Add your bank details” card saying your agency has nowhere to send the money; “Add them now” opens “Profile”.",
				"Both print on every voucher, and the agency transfers the weekly pay from its own bank to this account — without them it has no account to send your pay to.",
			],
		},
		zh: {
			title: "在哪里填银行资料？",
			lines: [
				"「我的」→「编辑资料」→「银行资料」：在可搜索的马来西亚银行列表中选「银行」，输入「账号」，再点「保存资料」。",
				"两项都填好之前，「结算」页会显示琥珀色的「填写你的银行资料」卡，提示经纪公司无法转出这笔钱；点「现在填写」会打开「我的」。",
				"这两项会印在每张结算单上，经纪公司从自己的银行把每周薪资转到这个账户 — 没填的话，经纪公司就没有账户可以转账。",
			],
		},
	},
	{
		id: "ref-pr-dispute-followup",
		role: "pr",
		asks: [
			"cancel dispute",
			"withdraw dispute",
			"dispute status where see ah",
			"dispute result got or not",
			"batalkan dispute",
			"batal dispute",
			"争议可以取消吗",
			"争议怎么撤回",
			"争议结果在哪里看",
		],
		en: {
			title: "How do I follow up on or cancel a dispute?",
			lines: [
				"In a dispute the PR picks the shift's receipt, can tick the wrong items, writes a reason of up to 200 characters, and may add photos.",
				"While a dispute is open the amount stays red. Tapping it shows the claim and, once answered, the agency's reply; “Cancel this dispute” withdraws it while it is still open.",
				"The bell says “Your dispute was accepted” or “Your dispute was rejected”, and the day then reads “VERIFIED”.",
			],
		},
		zh: {
			title: "怎么跟进或撤回争议？",
			lines: [
				"提出争议时，PR 选择该班的收据，可勾选有误的项目，写下最多 200 个字符的原因，并可附照片。",
				"争议未结时，该金额保持红色。点它可查看争议内容，答复后也会显示经纪公司的回复；争议未结前可点「撤回此争议」撤回。",
				"铃铛会显示「你的争议已被接受」或「你的争议已被拒绝」，当天随后显示「已核实」。",
			],
		},
	},
	{
		id: "ref-pr-swap",
		role: "pr",
		asks: [
			"swap request",
			"agency ask me swap outlet, can decline or not",
			"swap your answer is needed means what ah",
			"swap outlet",
			"换班请求",
			"换门店要同意吗",
			"公司叫我换去别的场所可以拒绝吗",
		],
		en: {
			title: "What is an outlet swap request?",
			lines: [
				"An agency can ask to move the PR's shift to another venue on the same date. The bell says “Outlet swap — your answer is needed” and “TO-DO” shows “OUTLET SWAP REQUEST”.",
				"The shift moves only if the PR taps “Approve”; “Decline” keeps the original shift. The agency can also withdraw the request.",
				"The PR should answer before the shift starts.",
			],
		},
		zh: {
			title: "「门店换班请求」是什么？",
			lines: [
				"经纪公司可请求把 PR 的班改到同一天的另一个场所。铃铛显示「换班请求 — 需要你的答复」，「待办」出现「门店换班请求」。",
				"只有 PR 点「同意」才会换；点「婉拒」则保留原来的班。经纪公司也可以撤回请求。",
				"PR 应在班次开始前回复。",
			],
		},
	},
	{
		id: "ref-pr-released-early",
		role: "pr",
		asks: [
			"released early",
			"venue send me home early how much pay",
			"outlet ask me go back early, wage how ah",
			"quiet night release early still got paid ah",
			"提早收工",
			"生意不好提早放工薪水怎么算",
		],
		en: {
			title: "What if the venue sends me home early?",
			lines: [
				"On a quiet night a venue can ask the agency to release PRs. If the agency approves, each released PR gets “You were released early” in the bell.",
				"That shift's wage is sealed for the minutes actually worked — the same rule as leaving early.",
			],
		},
		zh: {
			title: "场所让我提前收工怎么办？",
			lines: [
				"生意冷清时，场所可请经纪公司让 PR 提前收工。经纪公司批准后，被安排收工的 PR 会收到铃铛通知「你被安排提前收工」。",
				"该班日薪按实际工作的分钟计算 — 与提早离开的规则相同。",
			],
		},
	},
	{
		id: "ref-pr-notifications",
		role: "pr",
		asks: [
			"bell notifications",
			"no push notification",
			"new shift got whatsapp message or not ah",
			"bell only update every minute ah",
			"notifikasi loceng",
			"铃铛通知",
			"App里会收到什么通知",
		],
		en: {
			title: "What does the bell tell me?",
			lines: [
				"The bell lists notices: new, cancelled or withdrawn shifts; MC / leave, overtime and dispute decisions; swap requests; vouchers ready or paid; agency join and leave decisions; and messages from the agency.",
				"Tapping a notice opens what it is about, and “Mark all read” clears the count.",
				"Notices appear only in the app's bell: there are no phone push notifications, and the bell checks for new ones about once a minute while the app is open.",
				"InnocenZ does not send shift or pay notices by WhatsApp, SMS or email — it uses WhatsApp and email only for verification codes and account-security messages.",
			],
		},
		zh: {
			title: "铃铛通知会告诉我什么？",
			lines: [
				"铃铛「通知」会列出：新增、取消或撤销的班次；病假 / 请假、加班和争议的决定；换班请求；结算单就绪或已付款；经纪公司加入和离开的决定；以及经纪公司发来的消息。",
				"点通知会打开相关内容，点「全部已读」清除数字。",
				"通知只出现在 App 的铃铛里：手机不会收到推送通知；App 开着时，铃铛大约每分钟检查一次新通知。",
				"InnocenZ 不会通过 WhatsApp、短信或邮件发送排班和薪资通知 — WhatsApp 和邮件只用于验证码和账号安全通知。",
			],
		},
	},
	{
		id: "ref-pr-history",
		role: "pr",
		asks: [
			"past shifts",
			"past payments",
			"payment history where ah",
			"sejarah syif",
			"sejarah gaji",
			"以前的出粮记录",
			"薪资记录",
			"下载以前的PV",
		],
		en: {
			title: "How do I find past shifts and payments?",
			lines: [
				"“History” → “Shifts” has “Current week” (a card per agency) and “Payroll weeks” (closed weeks), with filters for venue, status, date and time of day.",
				"“History” → “Payment history” lists each voucher as “Paid”, “Signed” or “Pending” with net, wages, commission and bank reference; “To sign” shows only those waiting for the PR.",
				"Tapping a week shows “Open PV”, “PDF” and “Excel”.",
			],
		},
		zh: {
			title: "怎么找以前的班次和薪资？",
			lines: [
				"「记录」→「班次」有「本周」（每家经纪公司一张卡）和「薪资周」（已结束的周），可按场所、状态、日期和时段筛选。",
				"「记录」→「结算记录」列出每张结算单的「已支付」「已签署」或「待处理」状态，以及净额、工资、提成和银行参考号；「待签署」只显示等 PR 签名的。",
				"点某一周会出现「打开结算单」、「PDF」和「Excel」。",
			],
		},
	},
	{
		id: "ref-pr-tier",
		role: "pr",
		asks: [
			"my tier meaning",
			"tier i to tier v difference",
			"two agency give different tier ah",
			"tier affect my pay or not ah",
			"tier saya",
			"我的等级",
			"等级的意思是什么",
			"两家公司等级不一样",
		],
		en: {
			title: "What is my tier and what does it change?",
			lines: [
				"Each agency grades the PR: “TIER I” to “TIER V”, “SERVANT” or “COMMISSION ONLY”. “Profile” shows the tier — one badge per agency when they grade differently.",
				"The tier picks the PR's row on each venue's rate card — the daily wage and the drinks, happy-hour and tips commission rates.",
			],
		},
		zh: {
			title: "我的等级是什么？会影响什么？",
			lines: [
				"每家经纪公司为 PR 定级：「一级」至「五级」、「服务生」或「纯佣金」。「我的」页显示等级；各公司定级不同时，按经纪公司各显示一个标签。",
				"等级决定 PR 在各场所费率表上的那一行 — 日薪，以及酒水、欢乐时光和小费的佣金比例。",
			],
		},
	},
	{
		id: "ref-pr-commission",
		role: "pr",
		asks: [
			"commission rate",
			"how commission calculated",
			"commission count how one",
			"commission calculate how ah",
			"kira komisen",
			"komisen happy hour",
			"peratus komisen minuman",
			"佣金怎么计算",
			"佣金几巴仙",
			"欢乐时段佣金不一样吗",
		],
		en: {
			title: "How is my commission worked out?",
			lines: [
				"Commission is a percentage of each item's price on the venue's list, at the PR's tier with the agency that booked the shift.",
				"Drinks logged during the venue's happy-hour window use the happy-hour drinks rate; tips and services use the tips rate.",
				"On a special-event night a card shows “[event] prices” — that night's own price list is what the PR's logs are priced from.",
			],
		},
		zh: {
			title: "佣金是怎么算的？",
			lines: [
				"佣金是场所价目表上每项价格的百分比，按 PR 在安排该班的经纪公司的等级计算。",
				"在场所欢乐时光时段内记录的酒水使用欢乐时光酒水比例；小费和服务项目使用小费比例。",
				"特别活动的晚上会显示「[活动] 价目」卡 — PR 当晚记录的金额按该晚自己的价目计算。",
			],
		},
	},
	{
		id: "ref-pr-leave-agency",
		role: "pr",
		asks: [
			"leave agency",
			"quit agency refused",
			"want resign from agency but cannot leh",
			"berhenti agensi",
			"退出经纪公司",
			"想退出公司被拒绝",
			"离开经纪公司要批准吗",
		],
		en: {
			title: "Why can't I leave an agency?",
			lines: [
				"Leaving is a request the agency approves; meanwhile “Profile” shows “Departure waiting for [agency] to approve” and agency changes are locked.",
				"It is refused while anything is unsettled with that agency — unpaid vouchers, open disputes, or upcoming or unfinished shifts — and the app says what is left.",
				"The bell then says “Your departure from the agency was approved” or “Your departure request was declined” with the agency's reason.",
			],
		},
		zh: {
			title: "为什么离不开经纪公司？",
			lines: [
				"离开需要经纪公司批准；期间「我的」页显示「离开申请等待 [经纪公司] 审批」，并锁定经纪公司的更改。",
				"与该经纪公司还有未结事项时会被拒绝 — 未付的结算单、未结的争议，或即将到来、尚未完成的班次 — App 会说明还剩什么。",
				"之后铃铛会通知结果：「你的离开申请已批准」，或离开申请被拒绝并附上经纪公司的理由。",
			],
		},
	},
	{
		id: "ref-pr-security",
		role: "pr",
		asks: [
			"change password",
			"update password",
			"change email where ah",
			"new phone number how to update leh",
			"tukar kata laluan",
			"tukar password",
			"tukar nombor telefon dan emel",
			"改密码",
			"换手机号码",
			"改电邮",
		],
		en: {
			title: "How do I change my password, phone or email?",
			lines: [
				"“Profile” → “Security settings” has “Change password”, “Change phone” and “Change email”; each needs the current password and a 6-digit code.",
				"A new number gets the code by WhatsApp plus the email on file; a new email gets it plus the phone on file. The old number or email gets nothing.",
				"Email cannot be changed in “Edit profile” — only in “Security settings”.",
			],
		},
		zh: {
			title: "怎么改密码、手机号或电子邮箱？",
			lines: [
				"「我的」→「安全设置」有「修改密码」「更换手机号」「更换电子邮箱」；每项都需要当前密码和 6 位验证码。",
				"新号码会通过 WhatsApp 收到验证码，同时发到账号上的邮箱；新邮箱会收到验证码，同时发到账号上的手机。旧号码或旧邮箱不会收到任何信息。",
				"电子邮箱不能在「编辑资料」里改，只能在「安全设置」里改。",
			],
		},
	},
	{
		id: "ref-pr-delete-account",
		role: "pr",
		asks: [
			"delete account",
			"remove my account",
			"delete account then payroll history still keep ah",
			"want delete account, data all gone ah",
			"padam akaun",
			"hapus akaun",
			"hapuskan akaun saya",
			"删除我的账号",
			"删掉账号后资料会怎样",
			"注销账号",
		],
		en: {
			title: "How do I delete my account?",
			lines: [
				"“Profile” → “Security settings” → “Delete account”: the PR enters the current password and taps “Delete my account”.",
				"The account is disabled, ID photos and profile data are removed, and the PR is signed out. Payroll history may be kept as the law requires.",
			],
		},
		zh: {
			title: "怎么删除账号？",
			lines: [
				"「我的」→「安全设置」→「删除账号」：PR 输入当前密码，再点「删除我的账号」。",
				"账号会被停用，证件照片和个人资料会被删除，并退出登录。依法可能保留薪资记录。",
			],
		},
	},
	{
		id: "ref-pr-profile-edit",
		role: "pr",
		asks: [
			"edit profile",
			"change nickname",
			"age cannot edit why ah",
			"comcard how to update ah",
			"edit profil",
			"tukar gambar galeri",
			"改昵称",
			"改个人资料",
			"相册照片可以放几张",
		],
		en: {
			title: "What can I change on my profile?",
			lines: [
				"“Edit profile” changes the floor nickname (2–20 characters), legal IC name, measurements, languages, gallery order, bank details and agencies; then tap “Save profile”.",
				"Age follows the IC and cannot be edited. The gallery holds 8 photos, each under 5 MB.",
				"The comcard (photo card) is rebuilt from the gallery whenever the profile is saved, for agencies and venues to see.",
			],
		},
		zh: {
			title: "个人资料可以改哪些？",
			lines: [
				"「编辑资料」可修改现场昵称（2–20 个字符）、身份证姓名、身材尺寸、语言能力、相册顺序、银行资料和经纪公司，再点「保存资料」。",
				"年龄根据身份证计算，无法修改。相册可放 8 张照片，每张小于 5 MB。",
				"名片卡（照片卡）会在每次保存资料时由相册重新生成，供经纪公司和场所查看。",
			],
		},
	},
	{
		id: "ref-pr-privacy",
		role: "pr",
		asks: [
			"can outlet see my ic",
			"can the venue see my ic",
			"outlet can see my bank details or address ah",
			"outlet know my exact position or not",
			"maklumat peribadi",
			"场所看得到我的身份证号码吗",
			"谁看得到我的地址",
			"门店能看到我的银行资料吗",
		],
		en: {
			title: "Who can see my personal details?",
			lines: [
				"The PR's agency sees the profile and ID photos to approve them, and the bank details print on the agency's vouchers.",
				"Venues see the booking profile of PRs from the agencies they work with — such as name, nickname, age, measurements, languages, tier, comcard and photos — but never the IC number, birth date, home address, ID photos, bank details, MC photos or fines.",
				"Venues see how far from their door the PR checked in, not the PR's exact position.",
			],
		},
		zh: {
			title: "谁能看到我的个人资料？",
			lines: [
				"PR 的经纪公司会看到资料和证件照片以便审批，银行资料会印在经纪公司的结算单上。",
				"场所能看到与其合作的经纪公司旗下 PR 的预订资料 — 如姓名、昵称、年龄、身材尺寸、语言、等级、名片卡和照片 — 但看不到身份证号码、出生日期、住址、证件照片、银行资料、病假单照片或罚款。",
				"场所看到的是 PR 签到时离门口多远，而不是 PR 的确切位置。",
			],
		},
	},
	{
		id: "ref-pr-choose-shifts",
		role: "pr",
		asks: [
			"apply shift",
			"pick my own shifts",
			"can pick shift myself or not",
			"where to apply job in app ah",
			"mohon syif",
			"macam mana nak mohon kerja",
			"自己选班",
			"怎么申请班次",
			"可以自己挑班吗",
		],
		en: {
			title: "Can I choose or apply for shifts myself?",
			lines: [
				"No — the agency gives shifts; the PR does not apply for them in the app. A new booking arrives in the bell as “You have a new shift”.",
				"To stay off the roster the PR marks days “Not available”; to drop a booked shift they cancel it or send an MC / leave.",
				"If the agency or the venue removes a booking, the bell says “A shift was cancelled” or “A shift was withdrawn”.",
			],
		},
		zh: {
			title: "我可以自己选班或申请班吗？",
			lines: [
				"不行 — 班次由经纪公司安排；PR 不在 App 里申请班次。新安排会以铃铛通知「你有新的班次」送达。",
				"不想被排班，PR 就把日子标为「不可接班」；要退出已排的班，就取消或提交病假 / 请假。",
				"经纪公司或场所撤掉安排时，铃铛会显示「班次已取消」或「班次已撤销」。",
			],
		},
	},
	{
		id: "ref-shared-delete-account",
		role: "pr",
		asks: [
			"delete account without app",
			"uninstalled app how to close account",
			"no app already, want delete account how ah",
			"can whatsapp innocenz to delete account or not",
			"padam akaun tanpa app",
			"padam akaun melalui whatsapp",
			"没有App怎么删除账号",
			"WhatsApp InnocenZ删除账号",
			"删了App还能删除账号吗",
		],
		en: {
			title: "How does a PR delete their account?",
			lines: [
				"In the app: “Profile” → “Security settings” → “Delete account”, enter the current password and tap “Delete my account”.",
				"Sign-in stops at once, and ID photos and profile details are removed; payroll records may be kept as the law requires.",
				"Without the app, message InnocenZ on WhatsApp with the phone number on the account; the request is verified before it is done.",
			],
		},
		zh: {
			title: "PR 怎么删除账号？",
			lines: [
				"在 App：「我的」→「安全设置」→「删除账号」，输入当前密码，再点「删除我的账号」。",
				"登录立即停止，证件照片和个人资料会被删除；依法可能保留薪资记录。",
				"无法使用 App 时，可通过 WhatsApp 联系 InnocenZ 并提供账号绑定的手机号码；核实身份后才会处理。",
			],
		},
	},
	{
		id: "ref-shared-pr-signup",
		role: "pr",
		asks: [
			"pr register need what",
			"pr sign up need what documents",
			"pr register need ic number and address ah",
			"become pr need fill in what one",
			"daftar pr",
			"dokumen untuk daftar pr",
			"PR要怎么注册",
			"做PR注册需要什么资料",
			"PR注册要填地址和出生日期吗",
		],
		en: {
			title: "What does a PR fill in to sign up?",
			lines: [
				"In the app's “Create an account”, the PR gives a nickname (shown on the roster), full name as on the IC or passport, ID type and number, date of birth, address, languages and photos of the ID.",
				"The phone is verified with a 6-digit WhatsApp code; the PR then signs in with that phone number and a password of at least 6 characters.",
				"Under “How are you joining?” the PR picks an agency or joins on their own — either way an agency must accept them before they can be given shifts.",
			],
		},
		zh: {
			title: "PR 注册要填写什么？",
			lines: [
				"在 App 的「创建账号」，PR 填写昵称（显示在排班表上）、与身份证或护照一致的全名、证件类型和号码、出生日期、地址、擅长语言以及证件照片。",
				"手机号码通过 WhatsApp 的 6 位验证码验证；之后 PR 用该手机号码和至少 6 个字符的密码登录。",
				"在「你如何加入？」中，PR 选择经纪公司或自行加入 — 无论哪种，都须经纪公司接受后才能获派班次。",
			],
		},
	},
	{
		id: "ref-pr-i-forgot-to-log-a-receipt-can-i-add-it-a",
		role: "pr",
		asks: [
			"forgot to log receipt",
			"add drink after check out",
			"already check out, can add back drinks or not",
			"forgot scan receipt, can claim commission later ah",
			"resit tertinggal tak rekod",
			"漏了小票",
			"签退后补小票",
			"签退后发现漏记收据",
		],
		en: {
			title: "I forgot to log a receipt — can I add it after check-out?",
			lines: [
				"Not in the app: “Scan” and “Self-log” work only while checked in, so nothing can be logged after “Check out”.",
				"Ask your agency before you sign that week's voucher: it can add a missing drink or tip, picked from the venue's price list, to a receipt you did log on that shift.",
				"Commission always needs a logged receipt behind it, so a shift with nothing logged cannot have commission added later — log every receipt, with its photo, before checking out.",
			],
		},
		zh: {
			title: "忘了记录一张收据，签退后还能补吗？",
			lines: [
				"App 里不行：「扫描」和「自行记录」只在签到中可用，「签退」后就不能再记录任何收据。",
				"请在签名该周结算单之前联系你的经纪公司：经纪公司可以从场所的价目表中选取漏记的酒水或小费，加到你在该班已记录的收据上。",
				"佣金一定要有已记录的收据作依据，所以整班都没有记录的话，之后不能再补佣金 — 签退前请把每张收据连同照片都记录好。",
			],
		},
	},
	/* ---------- Agency — the web portal ---------- */
	{
		id: "ref-agency-signup",
		role: "agency",
		asks: [
			"register pr agency what documents ssm licence",
			"how to sign up as pr agency ah",
			"agency registration only malaysia company and +60 number ah",
			"daftar agensi kena isi dokumen apa",
			"经纪公司注册",
			"注册PR公司要SSM和营业执照吗",
			"经纪公司开户要准备什么资料",
		],
		en: {
			title: "How does an agency sign up?",
			lines: [
				"On the login page tap “Sign up as Outlet or PR Agency” and choose “PR Agency”. Fill in the company (12-digit SSM number, business licence, address), the person in charge as per IC, and a login email and password.",
				"You also pick a package, upload your agency logo and tick the acknowledgements. Only Malaysian companies and +60 mobile numbers for now.",
				"Before the account is created, tap “Send code” and enter the 6-digit code emailed to you. It works for 10 minutes.",
			],
		},
		zh: {
			title: "经纪公司怎么注册？",
			lines: [
				"在登录页点「注册为门店或 PR 经纪公司」，账户类型选「PR 代理」。填写公司资料（12 位 SSM 注册号、营业执照、地址）、与身份证一致的负责人姓名，以及登录邮箱和密码。",
				"还需选择套餐、上传代理标志并勾选各项确认事项。目前只支持马来西亚公司和 +60 手机号。",
				"账户创建前，点「发送验证码」并输入邮件里的 6 位验证码，10 分钟内有效。",
			],
		},
	},
	{
		id: "ref-agency-after-signup",
		role: "agency",
		asks: [
			"what happens after agency register",
			"after registration only settings page open",
			"after sign up agency only settings can open ah",
			"agency approved then billing start which week ah",
			"注册后等审核",
			"注册之后只能打开设置",
			"注册之后等多久才批准",
		],
		en: {
			title: "What happens after we register?",
			lines: [
				"The agency is submitted for review by the InnocenZ team. You can sign in straight away, but only “Settings” opens until it is approved.",
				"Once approved, the whole portal opens and the owner receives an email. Your weekly subscription billing starts from the approval week, not from the sign-up day.",
			],
		},
		zh: {
			title: "注册之后会怎样？",
			lines: [
				"经纪公司提交后由 InnocenZ 团队审核。你可以立即登录，但获批前只能打开「设置」。",
				"获批后整个后台开放，东主会收到邮件通知。每周订阅费从获批的那一周开始计算，而不是从注册当天。",
			],
		},
	},
	{
		id: "ref-agency-roles",
		role: "agency",
		asks: [
			"financial head director guarantor permissions",
			"can director edit anything or view only",
			"guarantor cannot pay subscription ah",
			"financial head can approve pr join or not ah",
			"director agensi boleh buat apa",
			"peranan financial head dalam agensi",
			"财务主管权限",
			"总监只能查看吗",
		],
		en: {
			title: "What can each team role do?",
			lines: [
				"An Owner and a Guarantor can do everything; a Guarantor just cannot pay the InnocenZ subscription or save its payment method.",
				"A Financial Head works in “Today”, “Roster” (can assign PRs) and “Payroll” (receipts, disputes, overtime, fees, signing, sending, paying). “History”, “Subscription” and “Settings” are read-only; no “Approvals” or “Manage PR”.",
				"A Director can view “Today”, “Roster”, “Approvals”, “Payroll”, “History”, “Subscription” and “Settings” but cannot change anything for the agency. Everyone can still change their own login, security and saved signature in “Settings”.",
			],
		},
		zh: {
			title: "每个团队角色可以做什么？",
			lines: [
				"「东主」和「担保人」可以做所有事；担保人只是不能支付 InnocenZ 订阅费或保存付款方式。",
				"「财务主管」使用「今天」、「排班」（可指派 PR）和「薪资」（收据、争议、加班、费用、签署、发送、付款）。「历史记录」、「订阅」和「设置」为只读；没有「审批」和「PR 管理」。",
				"「总监」可查看「今天」、「排班」、「审批」、「薪资」、「历史记录」、「订阅」和「设置」，但不能修改经纪公司的任何内容。每个人仍可在「设置」中修改自己的登录与安全设置和已存签名。",
			],
		},
	},
	{
		id: "ref-agency-invite-staff",
		role: "agency",
		asks: [
			"invite team member or employee to agency portal",
			"give finance staff a login",
			"how to invite my staff by email ah",
			"jemput ahli pasukan sebagai financial head atau director",
			"pautan jemputan tamat tempoh",
			"邀请同事进经纪公司后台",
			"同事加进团队",
			"邀请链接过期",
		],
		en: {
			title: "How do I add a staff member?",
			lines: [
				"The person first creates their own login with “Sign up as a team member” on the sign-up page. An invite only works for an existing InnocenZ account.",
				"Then the Owner (or Guarantor) opens “Settings” → “Invite a team member”, types their email, picks Financial Head or Director and taps “Invite”.",
				"They get an email link, sign in to that account and tap “Accept invitation”. The link expires after 7 days. To make someone Guarantor, invite them lower, then change their role.",
			],
		},
		zh: {
			title: "怎么添加员工？",
			lines: [
				"对方须先在注册页点「注册为团队成员」创建自己的账号。邀请只适用于已有的 InnocenZ 账号。",
				"然后由东主（或担保人）在「设置」→「邀请团队成员」输入对方邮箱，选择财务主管或总监，点「发送邀请」。",
				"对方会收到邮件链接，用该账号登录后点「接受邀请」。链接 7 天后失效。要设为担保人，请先以较低角色邀请，之后再更改角色。",
			],
		},
	},
	{
		id: "ref-agency-staff-requests",
		role: "agency",
		asks: [
			"someone asked to join our staff",
			"got staff request join our team where to approve ah",
			"lulus permintaan ahli pasukan",
			"新成员申请",
			"有人申请加入团队在哪里批",
			"新成员待审批",
		],
		en: {
			title: "Someone asked to join our staff. Where is it?",
			lines: [
				"A person who signs up as a team member can ask to join your agency in a role. The request waits under “Approvals” → “New member” → “Waiting”.",
				"The Owner (or Guarantor) chooses the “Role to grant” and taps “Approve”, or taps “Decline”. Nothing is granted before approval, and a member ID is only given once approved.",
			],
		},
		zh: {
			title: "有人申请加入我们的团队，在哪里处理？",
			lines: [
				"以团队成员身份注册的人可以申请加入你的经纪公司并选择职位，申请会出现在「审批」→「新成员」→「待审批」。",
				"东主（或担保人）选择「授予职位」后点「通过」，或点「拒绝」。获批前不会授予任何权限，成员编号也只在获批后发放。",
			],
		},
	},
	{
		id: "ref-agency-staff-change",
		role: "agency",
		asks: [
			"change staff role to financial head or director",
			"cannot remove myself from team why",
			"how to remove staff from agency ah",
			"deactivate a team member and remove access",
			"tukar peranan atau role staf",
			"更改员工角色",
			"把员工从团队删除",
			"改成员职位",
			"停用或恢复成员",
		],
		en: {
			title: "How do I change a role or remove a staff member?",
			lines: [
				"In “Settings”, the team list lets the Owner (or Guarantor) change a member's role with its role picker. The change applies to this agency only.",
				"“Remove” takes someone off the team: they lose access at once and their record moves to “Approvals” → “New member” → “Deactivated”, where “Reactivate member” brings them back with a role you choose.",
				"You cannot remove yourself, and the agency must always keep an active owner.",
			],
		},
		zh: {
			title: "怎么更改员工角色或移除员工？",
			lines: [
				"在「设置」的团队名单里，东主（或担保人）可以用角色选择更改成员的角色，只对本经纪公司生效。",
				"「移除」会把对方移出团队：对方立即失去访问权限，记录移到「审批」→「新成员」→「已停用」，在那里点「恢复成员」并选择职位即可恢复。",
				"你不能移除自己，经纪公司也必须始终保留一位有效的东主。",
			],
		},
	},
	{
		id: "ref-agency-choose-org",
		role: "agency",
		asks: [
			"switch between two agencies",
			"choose your organisation after login",
			"my login got 2 agency how to switch ah",
			"switch organisation must sign out sign in again ah",
			"tukar antara agensi lain",
			"切换机构",
			"换到另一个机构",
			"一个账号两家公司切换",
		],
		en: {
			title: "I work for two organisations. How do I switch?",
			lines: [
				"If your login belongs to more than one agency or outlet, signing in opens “Choose your organisation”, showing each one's logo, your role there and whether it is active.",
				"The portal then shows only that organisation's people, shifts and money, with the role you hold there. To work in another one, sign out and sign in again.",
			],
		},
		zh: {
			title: "我在两个机构工作，怎么切换？",
			lines: [
				"如果你的账号属于多个经纪公司或门店，登录后会出现「选择您的机构」，显示每个机构的标志、你在那里的职位以及是否有效。",
				"之后后台只显示该机构的人员、班次与款项，并按你在那里的职位授权。如需前往其他机构，请退出后重新登录。",
			],
		},
	},
	{
		id: "ref-agency-pr-join-review",
		role: "agency",
		asks: [
			"approve pr application to join",
			"check new pr ic photos before approve",
			"new pr apply join our agency how to approve ah",
			"reject pr join must give reason ah",
			"semak dan luluskan PR yang mohon sertai agensi",
			"审核PR加入申请",
			"新PR申请加入怎么批准",
			"驳回PR要填理由吗",
		],
		en: {
			title: "How do I review a PR who wants to join?",
			lines: [
				"Open “Approvals” → “Agency-Tied” → “Current” and tap the PR: you see their comcard, contact details and their “IC photos”, “Profile picture”, “Gallery” and “Comcard”, each opening full size.",
				"“Approve” puts them on your roster so they can be assigned shifts, and their phone is told. “Reject” needs a reason, which is the message the PR reads.",
				"Only an Owner or Guarantor can decide; a Director sees the queue read-only.",
			],
		},
		zh: {
			title: "怎么审核申请加入的 PR？",
			lines: [
				"打开「审批」→「签约 PR」→「待处理」并点该 PR：可看到模卡、联系方式，以及「身份证照片」「头像照片」「相册」「模卡」，每张都能查看原图。",
				"「批准」后该 PR 加入你的名单，可以被排班，手机也会收到通知。「驳回」必须填写理由，PR 会看到这段说明。",
				"只有东主或担保人可以决定；总监只能查看。",
			],
		},
	},
	{
		id: "ref-agency-add-pr",
		role: "agency",
		asks: [
			"add pr to roster myself",
			"manually add pr with ic and mobile",
			"can agency add pr ourselves without pr apply ah",
			"agensi masukkan PR terus tanpa permohonan",
			"自己添加PR",
			"手动把PR加进名单",
			"帮PR建档",
		],
		en: {
			title: "Can I add a PR to our roster myself?",
			lines: [
				"Yes. An Owner or Guarantor opens “Approvals” → “Agency-Tied” → “Add PR”, enters the PR's name, IC and mobile (all required) and an optional email, then taps “Add to roster”.",
				"The PR joins your roster at once, already approved. Nothing is sent to them; they get their own login by signing up in the PR app with that same mobile number.",
				"The PR still needs the PR app: only the PR can check in, from their own app, and each weekly payment voucher must be signed by the PR in the app before you can mark it “Mark as paid” — an agency cannot sign on the PR's behalf.",
			],
		},
		zh: {
			title: "我可以自己把 PR 加进名单吗？",
			lines: [
				"可以。东主或担保人打开「审批」→「签约 PR」→「添加 PR」，填写 PR 的姓名、身份证号和手机号（均为必填）以及选填的电子邮箱，再点「加入名单」。",
				"该 PR 会立即加入你的名单，且已是批准状态。系统不会通知对方；PR 需用同一手机号在 PR 应用中注册，才能登录自己的账号。",
				"PR 仍然需要使用 PR 应用：只有 PR 本人能在自己的应用里签到；每周付款单也必须由 PR 在应用里签名，你才能「标记为已付款」— 经纪公司不能代 PR 签名。",
			],
		},
	},
	{
		id: "ref-agency-pr-departure",
		role: "agency",
		asks: [
			"pr leaving agency approve departure",
			"pr resign from agency",
			"pr want to quit our agency how ah",
			"why cannot approve departure got unpaid voucher",
			"luluskan PR tinggalkan agensi",
			"permohonan PR keluar agensi",
			"PR解约申请",
			"PR退出公司",
			"批准解约",
		],
		en: {
			title: "A PR asked to leave our agency. What now?",
			lines: [
				"Departure requests wait under “Approvals” → “Cancel Agency”. “Approve departure” takes the PR off your roster; rejecting needs a reason, which is sent to the PR, and they stay with you.",
				"A departure cannot be approved while anything is unsettled with that PR: unpaid vouchers, open disputes, or upcoming or unfinished shifts. The refusal lists what to clear first.",
			],
		},
		zh: {
			title: "PR 申请离开我们的经纪公司，怎么办？",
			lines: [
				"解约申请在「审批」→「解约申请」。「批准解约」后该 PR 离开你的名单；驳回必须填写理由并会发送给 PR，对方继续留在你的名单。",
				"只要该 PR 仍有未结事项 —— 未付的付款单、未解决的争议、或即将进行或未结束的班次 —— 就不能批准解约，系统会列出需要先处理的项目。",
			],
		},
	},
	{
		id: "ref-agency-pr-tier",
		role: "agency",
		asks: [
			"set pr tier",
			"change pr pay class commission only",
			"how to change pr tier ah",
			"pay class basic or commission where to set one",
			"tetapkan tier PR",
			"PR等级",
			"改PR的薪资级别",
			"PR的等级在哪里改",
		],
		en: {
			title: "How do I set a PR's tier and pay class?",
			lines: [
				"“Manage PR” → open the PR → “Edit profile”. “Training tier” (Tier I–V) is the tier venues book and pay by; “Agency grade” (A–C) is your own grade; “Pay class” is Basic or Commission only.",
				"Each agency sets its own tier for a PR, so it can differ between agencies. A pay class change applies to new shifts only; worked and booked shifts keep their pay.",
				"Only an Owner or Guarantor can open “Manage PR”.",
			],
		},
		zh: {
			title: "怎么设定 PR 的等级和薪资级别？",
			lines: [
				"「PR 管理」→ 打开 PR →「编辑资料」。「培训等级」（Tier I–V）是门店预订和计薪所依据的等级；「经纪公司评级」（A–C）是你自己的评级；「薪资级别」可选「基本薪酬」或「仅抽成」。",
				"每家经纪公司各自设定 PR 的等级，因此可能不同。薪资级别更改只适用于新班次，已完成或已预订的班次保持原薪资。",
				"只有东主或担保人可以打开「PR 管理」。",
			],
		},
	},
	{
		id: "ref-agency-pr-card",
		role: "agency",
		asks: [
			"pr card warn flag",
			"att percentage manage pr",
			"pr card got warn what meaning ah",
			"att got dash not zero why one",
			"peratus kehadiran kad PR",
			"amaran rating PR rendah",
			"PR卡片警告",
			"出勤率是什么意思",
			"PR卡片数字标记",
		],
		en: {
			title: "What do the figures and flags on a PR's card mean?",
			lines: [
				"On “Manage PR”, “Att.” is the share of the PR's finished shifts they kept (no-shows and their own cancellations count as missed; approved MC/leave does not). “Paid” is what your agency paid on vouchers marked paid.",
				"A PR never scheduled shows a dash, not 0%. Figures cover your agency only.",
				"“Warn” appears when the venues' average rating falls below 3.5★. Open the PR to read the “Ratings feed”: stars and notes venues left on shifts your agency supplied.",
			],
		},
		zh: {
			title: "PR 卡片上的数字和标记是什么意思？",
			lines: [
				"在「PR 管理」中，「出勤」是 PR 已结束班次中实际出勤的比例（缺勤和本人取消算缺勤；获批的病假/请假不计）。「已付」是你的经纪公司在已标记付款的付款单上实际付给对方的金额。",
				"从未排过班的 PR 显示短横线，而不是 0%。数字只涵盖你的经纪公司。",
				"门店平均评分低于 3.5★ 时会出现「警告」。打开 PR 可查看「评价动态」：门店在你们供应的班次后留下的星级与备注。",
			],
		},
	},
	{
		id: "ref-agency-broadcast",
		role: "agency",
		asks: [
			"broadcast message to prs",
			"send announcement to all pr",
			"can blast message to all pr ah",
			"how to send notice all pr one shot",
			"broadcast mesej PR agensi",
			"群发给PR",
			"给所有PR发通知",
			"一次过通知全部PR",
		],
		en: {
			title: "Can I send a message to my PRs?",
			lines: [
				"Yes. On “Manage PR” tap “Broadcast”, tick the PRs (or “Select all”), then tap “Broadcast message”. Type a subject and message and tap “Send message”.",
				"It arrives as a notice in their InnocenZ inbox. There is nothing for them to accept or reply to.",
				"Owner or Guarantor only.",
			],
		},
		zh: {
			title: "我可以给 PR 群发消息吗？",
			lines: [
				"可以。在「PR 管理」点「群发通知」，勾选 PR（或「全选」），再点「群发消息」。填写主题和消息内容后点「发送消息」。",
				"消息会作为通知进入对方的 InnocenZ 收件箱，对方无需确认或回复。",
				"仅限东主或担保人。",
			],
		},
	},
	{
		id: "ref-agency-assign",
		role: "agency",
		asks: [
			"assign pr to shift",
			"book or schedule pr into shift",
			"how to put pr into outlet shift ah",
			"agency can post shift ourselves or not ah",
			"letak PR dalam syif",
			"macam mana agensi assign PR ke syif outlet",
			"给PR排班",
			"排PR上班",
		],
		en: {
			title: "How do I put a PR on a shift?",
			lines: [
				"“Roster” → “Planning”: pick the week, tap a free cell beside a PR and choose an open shift. Once the server saves it you see “PR assigned — saved to the roster”.",
				"Agencies never create or cancel a venue's shift: the outlet posts it, and you decide which of your PRs fill it.",
				"Owner, Guarantor and Financial Head can assign; a Director can only view.",
			],
		},
		zh: {
			title: "怎么给 PR 排班？",
			lines: [
				"「排班」→「排班计划」：选择周次，点 PR 旁的空白格并选择空缺班次。服务器保存后会显示「已指派 PR —— 已保存到排班」。",
				"经纪公司不会创建或取消门店的班次：班次由门店发布，你决定由哪些 PR 来填补。",
				"东主、担保人和财务主管可以排班；总监只能查看。",
			],
		},
	},
	{
		id: "ref-agency-assign-refused",
		role: "agency",
		asks: [
			"roster wont let me assign pr",
			"assign pr refused why",
			"why cannot put pr in shift ah",
			"fully staffed cannot assign pr",
			"shift not published yet cannot assign lah",
			"PR排不进去",
			"PR排不了班",
			"已排满不能加PR",
		],
		en: {
			title: "Why can't I assign this PR?",
			lines: [
				"The roster refuses, and says why, when for example the shift is “Fully staffed”, no seat is left for that PR's tier, the PR marked that day unavailable, or the PR is already booked at an overlapping time. It also refuses a PR whose tier the venue has not priced for that shift.",
				"A shift showing “Not published yet” is still the venue's draft, and “Sealed · payroll closed” means its payroll is closed. Nobody can be added to either.",
			],
		},
		zh: {
			title: "为什么不能给这个 PR 排班？",
			lines: [
				"以下情况会被拒绝并说明原因，例如：班次「已排满」、该 PR 等级的名额已满、PR 已将当天标记为不可排班，或 PR 在重叠时段已有排班。门店未为该 PR 等级设定该班次工资时也会被拒绝。",
				"显示「尚未发布」的班次仍是门店的草稿；「已封存 · 薪资已结算」表示该班次薪资已结算。两者都无法再添加人员。",
			],
		},
	},
	{
		id: "ref-agency-roster-labels",
		role: "agency",
		asks: [
			"roster labels meaning",
			"scheduled on duty checked out meaning",
			"roster swap pending what meaning ah",
			"pr late still scheduled why ah",
			"排班标签",
			"排班表上的标签意思",
			"换班待处理是什么意思",
		],
		en: {
			title: "What do the labels on roster cells mean?",
			lines: [
				"“Scheduled”: booked, not checked in yet; it stays Scheduled even when late, because a late check-in is still allowed. “On duty”: checked in, not out. “Checked out”: finished.",
				"“Unavailable”: off the plan (cancelled, no-show or excused MC/leave), or a day the PR blocked on their phone, with their reason if they gave one. “Swap pending”: a move request is waiting for the PR.",
			],
		},
		zh: {
			title: "排班格子上的标签是什么意思？",
			lines: [
				"「已排班」：已预订但尚未签到；迟到也仍显示已排班，因为仍可签到。「在岗」：已签到未签退。「已签退」：班次已完成。",
				"「不可排班」：不在计划内（已取消、缺勤或病假/请假获批免班），或 PR 在手机上封锁的日子，若 PR 填写了理由会一并显示。「换班待处理」：调班申请正在等待 PR 回复。",
			],
		},
	},
	{
		id: "ref-agency-move-remove",
		role: "agency",
		asks: [
			"move pr to another shift",
			"cannot remove pr already started why",
			"tukar PR ke outlet lain",
			"把PR换到别的门店",
			"移除PR",
			"把PR从班次拿掉",
		],
		en: {
			title: "How do I move or remove a PR from a shift?",
			lines: [
				"Tap the booking on the roster. Under “Request outlet swap” pick another venue's shift that night and tap “Send swap request to PR”; the booking moves only after the PR approves on their phone.",
				"“Remove assignment” deletes the booking and reopens the seat after you confirm. It undoes the assignment; it does not cancel the venue's shift.",
				"A past shift, or one the PR has already checked in to, cannot be moved or removed. For a past booking nobody checked in to, mark it no-show instead.",
			],
		},
		zh: {
			title: "怎么调动或移除排班上的 PR？",
			lines: [
				"在排班上点该排班。在「申请换店」中选择当晚另一门店的班次，点「向 PR 发送换班申请」；PR 在手机上同意后才会调动。",
				"「移除排班」在你确认后删除该排班并重新开放名额。这是撤销指派，不是取消门店的班次。",
				"已过的班次或 PR 已签到的班次不能调动或移除。若是已过且无人签到的排班，请改为标记缺勤。",
			],
		},
	},
	{
		id: "ref-agency-no-show",
		role: "agency",
		asks: [
			"pr didnt turn up",
			"auto mark absent after 3 hours ah",
			"PR tak datang kerja",
			"PR没来上班",
			"标记缺勤",
			"PR放飞机",
		],
		en: {
			title: "What happens when a PR doesn't turn up?",
			lines: [
				"On “Roster” → “Live”, the “Shifts” list shows a “No-show” button on a booking not yet checked in. An Owner, Guarantor or Financial Head can tap it to record the absence.",
				"If nobody marks it, a booking with no check-in is marked no-show automatically about 3 hours after the shift ends (sooner if the PR's next shift starts before then).",
				"Marking a no-show does not move any money by itself.",
			],
		},
		zh: {
			title: "PR 没来上班会怎样？",
			lines: [
				"在「排班」→「实时」的「班次」列表中，尚未签到的排班会显示「缺勤」按钮。东主、担保人或财务主管可以点它记录缺勤。",
				"如果没人标记，没有签到的排班会在班次结束约 3 小时后自动标记为缺勤（若该 PR 的下一个班次更早开始，则会更早标记）。",
				"标记缺勤本身不会产生任何金额变动。",
			],
		},
	},
	{
		id: "ref-agency-checkin-labels",
		role: "agency",
		asks: [
			"check in locations within fence",
			"within fence outside meaning",
			"pr check in no location why ah",
			"lokasi check in PR outside",
			"签到位置标签",
			"围栏内围栏外",
			"打卡位置无位置信息",
		],
		en: {
			title: "What do the check-in location labels mean?",
			lines: [
				"“Roster” → “Live” → “Check-in locations” lists the day's rostered PRs by venue, with a map. Its header counts records, e.g. “12/14 stamped · 10/12 within fence”.",
				"“Within fence” allows the venue's fence radius plus up to 30 m for phone accuracy, the same rule used at the door; “Outside” is beyond it. Venues with no saved pin accept every check-in without a location check.",
				"“No location”: checked in, but no position could be shown. Before a PR's start time the row reads “Due …”, after it “Not checked in”. Positions are recorded only at check-in and check-out, not tracked live.",
			],
		},
		zh: {
			title: "签到位置上的标签是什么意思？",
			lines: [
				"「排班」→「实时」→「签到位置」按门店列出当天已排班的 PR，并附地图。标题统计记录数，例如「已签到 12/14 · 围栏内 10/12」。",
				"「围栏内」按门店围栏半径再加最多 30 米手机误差计算，与签到时的规则相同；「围栏外」即超出范围。未设置定位点的门店，签到时不做位置校验。",
				"「无位置信息」：已签到，但无法显示位置。PR 到岗时间之前该行显示「预计 … 到岗」，之后显示「未签到」。位置只在签到和签退时记录，不是实时定位。",
			],
		},
	},
	{
		id: "ref-agency-open-demand",
		role: "agency",
		asks: [
			"which outlet still need pr",
			"open demand seats to fill",
			"outlet short people where to see ah",
			"venue still short how many pr ah",
			"门店缺人",
			"门店空缺",
			"待分配需求",
			"门店点名要的PR",
		],
		en: {
			title: "Where do I see what venues still need?",
			lines: [
				"“Roster” → “Planning” has an “Open demand” band above the grid: each venue's unfilled seats that week, e.g. “3 shifts · 5 seats to fill”.",
				"Tap a venue's demand to see the shift: PRs the venue asked for by name are listed under “Requested by the venue”, marked “Requested” until they are booked, then “Booked”.",
				"On “Today”, the “PR needed today” tile shows today's open seats and how many free PRs can fill them.",
			],
		},
		zh: {
			title: "在哪里看门店还缺多少人？",
			lines: [
				"「排班」→「排班计划」网格上方有「待分配需求」栏：显示各门店本周未填满的名额，例如「3 个班次 · 待补 5 人」。",
				"点门店的需求可查看该班次：门店点名要的 PR 列在「门店点名」下，预订前标记为「已点名」，预订后显示「已预订」。",
				"「今天」页的「今日需要 PR」显示今天的空缺名额，以及有多少空闲 PR 可以补上。",
			],
		},
	},
	{
		id: "ref-agency-auto-assign",
		role: "agency",
		asks: [
			"how ai pick prs",
			"auto assign ranking order",
			"auto assign confirm then save ah",
			"AI智能派班",
			"智能派班怎么选人",
			"自动派班优先谁",
		],
		en: {
			title: "How does “AI auto-assign” pick PRs?",
			lines: [
				"The “AI auto-assign” banner on “Roster” → “Planning” (and the “Assign available PR” card on “Today”) proposes a PR for each open slot. It skips anyone busy at that time, off that day or of a tier with no seat left, then ranks PRs the venue asked for by name first, then PRs who have worked at that venue, then by tier (Tier I first), then whoever has the fewest shifts that week.",
				"Untick any pairing you don't want, then tap “Confirm N assignments”. Nothing is saved before you confirm; any the server refuses are listed as skipped with the reason.",
			],
		},
		zh: {
			title: "「AI 智能派班」怎么挑选 PR？",
			lines: [
				"「排班」→「排班计划」上的「AI 智能派班」横幅，以及「今天」页的「分配可用 PR」卡片，会为每个空缺岗位推荐一位 PR：先跳过该时段已有排班、当天不可排班或其等级已无名额的 PR，再依次优先门店点名的 PR、曾在该门店工作过的 PR、等级较高者（Tier I 优先），最后是本周班次最少者。",
				"取消勾选不想要的配对，再点「确认 N 项分配」。确认前不会保存；被服务器拒绝的会列为已跳过并附原因。",
			],
		},
	},
	{
		id: "ref-agency-mc-decision",
		role: "agency",
		asks: [
			"approve pr mc what happens",
			"reject mc pr back on shift",
			"approve mc pr kena penalty or not ah",
			"pr mc i reject then how ah",
			"luluskan cuti PR",
			"批准病假会怎样",
			"驳回MC",
			"批准请假之后",
		],
		en: {
			title: "What happens when I approve or reject an MC?",
			lines: [
				"“Approvals” → “MC/Leaves”: open a request to see the MC photo, the reason, the venue, the date and the shift hours.",
				"“Approve · excuse shift” excuses the PR with no penalty, blocks that day so no agency can book them on it (unless they still have another shift that day) and puts the shift on the roster's “Backfill needed” list. “Reject” puts the PR back on the shift, no reason asked.",
				"The PR's phone shows the outcome. Only an Owner or Guarantor can decide.",
			],
		},
		zh: {
			title: "批准或驳回病假会怎样？",
			lines: [
				"「审批」→「病假 / 请假」：打开申请可看到病假照片、理由、门店、日期和班次时间。",
				"「批准 · 免除该班次」让 PR 免于处罚，并封锁当天，任何经纪公司都不能再为其排班（若当天仍有其他班次则不封锁），该班次也会进入排班的「需要补位」清单。「驳回」让 PR 回到该班次，不需填写理由。",
				"PR 的手机会显示结果。只有东主或担保人可以决定。",
			],
		},
	},
	{
		id: "ref-agency-backfill",
		role: "agency",
		asks: [
			"backfill needed card",
			"replace pr who cancelled shift",
			"pr cancel last minute how to find replacement ah",
			"pick replacement pr how ah",
			"补位",
			"找人顶班",
			"PR退出班次找人替",
		],
		en: {
			title: "How do I fill a gap when someone drops out?",
			lines: [
				"“Roster” shows a “Backfill needed” card for every upcoming shift still short after a cancellation or an approved MC/leave, with a line like “staffed 2/3 · leave approved”.",
				"“Pick replacement” lists PRs free that night: same tier as the one who dropped out first, then those who have worked that venue most. Tap “Assign”. The row disappears once the shift is full again.",
				"Your notification bell also tells you when a PR drops out of a shift.",
			],
		},
		zh: {
			title: "有人退出班次时怎么补位？",
			lines: [
				"若即将到来的班次因取消或病假/请假获批而缺人，「排班」会显示「需要补位」卡片，例如「已配 2/3 人 · 请假已批准」。",
				"「选择替班人员」列出当晚空闲的 PR：先列与原 PR 同等级的，再按在该门店工作次数排序。点「指派」即可；班次补满后该行会自动消失。",
				"PR 退出班次时，通知铃铛也会提醒你。",
			],
		},
	},
	{
		id: "ref-agency-cutlost",
		role: "agency",
		asks: [
			"approve cut loss request",
			"outlet release pr early approve",
			"outlet want send pr home early approve how ah",
			"cutlost approve pr still got pay or not ah",
			"lulus cut loss outlet",
			"减损申请",
			"批准缺班损失",
			"门店要PR提早收工",
		],
		en: {
			title: "What happens if I approve a venue's cut-loss request?",
			lines: [
				"“Approvals” → “Outlet” → “Cutlost” shows the venue, the PRs it wants to release early and roughly what it would save.",
				"Approving releases each named PR: one already checked in is checked out and paid for the hours actually worked, with their commission kept; one not yet checked in is stood down. The venue is told, and each released PR is notified. Declining needs a reason.",
				"Only an Owner or Guarantor can decide. The venue that asked cannot approve its own request.",
			],
		},
		zh: {
			title: "批准门店的减损申请会怎样？",
			lines: [
				"「审批」→「门店」→「缺班损失」显示门店、想提前放行的 PR，以及大约可节省的金额。",
				"批准后，被点名的 PR 会被放行：已签到者自动签退，按实际工作时数结算工资，提成照计；尚未签到者直接取消该班。门店会收到通知，被放行的 PR 也会收到通知。拒绝需填写原因。",
				"只有东主或担保人可以决定；提出申请的门店不能自行批准。",
			],
		},
	},
	{
		id: "ref-agency-partnership",
		role: "agency",
		asks: [
			"outlet link with agency",
			"outlet want partner with us where approve ah",
			"how to end or stop partnership with venue ah",
			"outlet cannot post job to us why ah",
			"kerjasama outlet dengan agensi",
			"outlet nak jadi rakan kongsi agensi",
			"门店合作申请",
			"结束合作",
			"门店跟经纪公司合作",
		],
		en: {
			title: "How do venues start working with our agency?",
			lines: [
				"A venue asks to work with you, and a venue can only post jobs to agencies that approved it. Requests wait under “Approvals” → “Outlet” → “Outlet Partnership” → “Awaiting your decision”.",
				"The Owner (or Guarantor) taps “Approve”, or “Decline” with an optional note the venue sees.",
				"“End partnership” stops the venue posting new jobs to you; shifts already posted stand until the last one passes, and the record moves to “Ended”.",
			],
		},
		zh: {
			title: "门店怎么开始与我们合作？",
			lines: [
				"门店会申请与你合作，而门店只能向已批准它的经纪公司发布工作。申请在「审批」→「门店」→「门店合作」→「等待你的决定」。",
				"东主（或担保人）点「批准」，或点「拒绝」并可附上门店能看到的说明。",
				"「结束合作」后该门店不能再向你发布新工作；已发布的班次维持到最后一个结束，记录会移到「已结束」。",
			],
		},
	},
	{
		id: "ref-agency-payroll-tabs",
		role: "agency",
		asks: [
			"this week last week payment week",
			"payment week tab meaning",
			"payroll got 3 week tab what different ah",
			"this week cannot sign yet why ah",
			"本周上周结算周",
			"结算周是什么",
			"本周和上周有什么不同",
		],
		en: {
			title: "What are This Week, Last Week and Payment Week?",
			lines: [
				"“Payroll” has three week tabs. “This Week” is the week still running: figures can still change and it cannot be signed yet. “Last Week” is the week that just closed, to review, sign and send.",
				"“Payment Week” is what is left to pay beyond the two newer tabs: the week before last, plus any older voucher not yet paid. A voucher stays under the week it was worked until that week rolls past “Last Week”.",
				"Each tab has “Payment Vouchers”, “Receipts”, “Disputes” and “Overtime” sub-tabs (on Payment Week the last two appear only when something is open), each with a red count of work still waiting.",
			],
		},
		zh: {
			title: "「本周」「上周」「结算周」分别是什么？",
			lines: [
				"「薪资」有三个周标签。「本周」是仍在进行的一周：金额还会变动，暂时不能签署。「上周」是刚结束的一周，用于审核、签署和发送。",
				"「结算周」是两个较新标签之外仍待付款的付款单：上上周的，加上任何更早仍未付款的。付款单会留在其所属周的标签下，直到该周不再是「上周」。",
				"每个标签都有「付款单」「收据」「争议」「加班」子标签（在「结算周」中，后两个只在有未处理事项时出现），红色数字表示仍待处理的事项。",
			],
		},
	},
	{
		id: "ref-agency-pv-status",
		role: "agency",
		asks: [
			"voucher status meaning",
			"pending agency review meaning",
			"pv status to pay what meaning ah",
			"pending pr review or disputed means what ah",
			"付款单状态",
			"待经纪公司审核是什么意思",
			"待付款状态",
		],
		en: {
			title: "What does each voucher status mean?",
			lines: [
				"“Pending Agency Review”: built and waiting for your agency to check, sign and send. “Pending PR Review”: sent; the PR can sign it or raise a dispute.",
				"“Disputed”: the PR raised a claim. “To pay”: the PR signed; pay them and mark it paid. “Paid”: recorded as paid and moved to “History”.",
				"On “Payment Week”, “Pending reviews” groups the two pending statuses together.",
			],
		},
		zh: {
			title: "每个付款单状态是什么意思？",
			lines: [
				"「待经纪公司审核」：已生成，等待经纪公司核对、签署和发送。「待 PR 确认」：已发送，PR 可以签署或提出争议。",
				"「有争议」：PR 提出了申诉。「待付款」：PR 已签署，付款后标记为已付款。「已付款」：已登记付款并移入历史记录。",
				"在「结算周」中，「待审核」合并了两种待审状态。",
			],
		},
	},
	{
		id: "ref-agency-receipts",
		role: "agency",
		asks: [
			"approve all receipts",
			"edit receipt quantity commission",
			"pr receipt wrong can edit or not ah",
			"semak resit PR",
			"betulkan kuantiti resit",
			"核对小票",
			"PR收据批准",
			"收据数量错了",
		],
		en: {
			title: "How do I check a PR's receipts?",
			lines: [
				"“Payroll” → “Receipts” lists every receipt logged on your vouchers with its photo and figures, tagged amber “Waiting on you” or “Approved”, green “Verified”, or red “Disputed”.",
				"Tap “Approve” on each, or “Approve all”. While a receipt is waiting, its voucher cannot be sent and the PR cannot dispute it.",
				"“Edit” corrects a quantity or commission, adds a missing line from that venue's list, or fixes the order number or date (inside the voucher's week). A change to the money sends that day back for approval. Once the PR signs, figures are locked.",
			],
		},
		zh: {
			title: "怎么核对 PR 的收据？",
			lines: [
				"「薪资」→「收据」列出付款单上记录的所有收据及照片和金额，标签为黄色「待您处理」或「已批准」、绿色「已核实」或红色「有争议」。",
				"逐张点「批准」，或点「全部批准」。收据待处理时，该付款单无法发送，PR 也无法对其提出争议。",
				"「编辑」可修改数量或提成、从该门店清单添加遗漏的明细，或更正订单号或日期（须在付款单所属周内）。改动金额后，该日需重新批准。PR 签署后金额即锁定。",
			],
		},
	},
	{
		id: "ref-agency-disputes",
		role: "agency",
		asks: [
			"pr dispute drinks tips accept reject",
			"accept dispute money change or not",
			"pr raise dispute how settle ah",
			"urus pertikaian PR",
			"PR pertikai tips minuman",
			"PR对酒水小费有争议",
			"驳回PR争议",
			"接受争议金额会变吗",
		],
		en: {
			title: "How do I handle a PR's dispute?",
			lines: [
				"“Payroll” → “Disputes” shows each claim on drinks or tips: the night, the lines, the PR's own words and the figure they want.",
				"If the PR is right, correct the receipt there first: “Accept” records the decision and tells the PR but does not change the money. “Reject” needs a note to the PR.",
				"When the last open claim is decided, the voucher returns to its earlier step (back to the PR to sign if you had signed it). A voucher with an open dispute cannot be marked paid.",
			],
		},
		zh: {
			title: "怎么处理 PR 的争议？",
			lines: [
				"「薪资」→「争议」显示每项酒水或小费申诉：日期、涉及的明细、PR 自己写的理由以及其要求的金额。",
				"若 PR 有理，请先在此更正收据：「接受」只记录决定并通知 PR，不会改动金额。「驳回」必须给 PR 填写说明。",
				"最后一项申诉处理后，付款单回到之前的步骤（若你已签署，则退回 PR 签署）。有未解决争议的付款单不能标记为已付款。",
			],
		},
	},
	{
		id: "ref-agency-overtime",
		role: "agency",
		asks: [
			"approve overtime claim",
			"ot claim approve reject",
			"ot claim where approve ah",
			"reject ot can undo or not ah",
			"lulus tuntutan OT PR",
			"加班审批",
			"批准PR加班",
			"加班申请撤回",
		],
		en: {
			title: "How is overtime approved?",
			lines: [
				"An overtime claim is created when a PR checks out after the shift's scheduled end. “Payroll” → “Overtime” shows the minutes worked and the amount the server priced.",
				"“Approve”, then “Confirm · pay RM…”, adds that amount to the voucher for the week the shift was worked. “Reject”, then “Confirm · pay nothing”, adds nothing and tells the PR. Neither can be undone.",
				"Each undecided claim stops its week's voucher being sent. Owner, Guarantor or Financial Head decides.",
			],
		},
		zh: {
			title: "加班怎么审批？",
			lines: [
				"PR 签退晚于排定下班时间时，会自动生成加班申请。「薪资」→「加班」显示加班时长和服务器计算的金额。",
				"点「批准」再点「确认 · 支付 RM…」，金额会加入该班次所属周的付款单。点「驳回」再点「确认 · 不予支付」，不加任何金额并通知 PR。两者都无法撤销。",
				"每项未处理的申请都会阻止该周付款单发送。由东主、担保人或财务主管决定。",
			],
		},
	},
	{
		id: "ref-agency-sign-send",
		role: "agency",
		asks: [
			"when can sign voucher",
			"send to pr for e-sign greyed",
			"send button grey cannot press why ah",
			"when can sign pv send pr ah",
			"bila boleh tandatangan baucar",
			"hantar PV kepada PR untuk tandatangan",
			"butang hantar kelabu",
			"什么时候签付款单",
			"发送给PR签署按钮灰色",
			"几时可以签付款单",
		],
		en: {
			title: "When and how do I sign and send a voucher?",
			lines: [
				"Signing opens once the week closes (Sunday 00:00, Malaysia time). On the voucher, sign under “Finance signature required”: draw it, or tap “Sign with my signature” if you saved one in “Settings” → “Signature on file”.",
				"Then tap “Send to PR for e-sign”. It stays greyed until the voucher is signed and every receipt and overtime claim is decided, and the caption says what is blocking.",
				"Owner, Guarantor or Financial Head can sign and send.",
			],
		},
		zh: {
			title: "什么时候、怎么签署和发送付款单？",
			lines: [
				"每周结束后（马来西亚时间周日 00:00）才可签署。打开付款单，在「需要财务签名」处签名：手写，或若已在「设置」→「已存签名」保存签名，点「使用我的签名签署」。",
				"然后点「发送给 PR 电子签署」。在签署完成、所有收据和加班都处理之前，按钮保持灰色，并会说明原因。",
				"东主、担保人或财务主管可以签署和发送。",
			],
		},
	},
	{
		id: "ref-agency-sunday-hold",
		role: "agency",
		asks: [
			"sunday run didnt send vouchers",
			"vouchers held on sunday",
			"why sunday pv not auto send ah",
			"pv stuck pending agency review after sunday why ah",
			"周日付款单没发出",
			"周日批处理",
			"星期天付款单没自动发",
		],
		en: {
			title: "Why didn't the Sunday run send my vouchers?",
			lines: [
				"At 2 a.m. every Sunday the vouchers for the week just closed are built. Only a voucher your agency has already signed, with no receipt or overtime still undecided, goes straight to the PR.",
				"The rest stay at “Pending Agency Review”, and the Owner and Financial Head get a notification saying how many need review or a signature. The PR cannot sign, or be paid, until you send it.",
			],
		},
		zh: {
			title: "为什么周日的批处理没有发出付款单？",
			lines: [
				"每周日凌晨 2 点会为刚结束的一周生成付款单。只有经纪公司已签署、且没有待处理收据或加班的付款单，才会直接发给 PR。",
				"其余的会停在「待经纪公司审核」，东主和财务主管会收到通知，说明有多少需要审核或签名。你发送之前，PR 无法签署，也就无法收款。",
			],
		},
	},
	{
		id: "ref-agency-mark-paid",
		role: "agency",
		asks: [
			"mark voucher as paid",
			"already bank in pr how to mark paid ah",
			"cannot mark as paid pr not signed",
			"tanda PV bayar",
			"标记已付款",
			"出粮后怎么登记",
			"批量标记已付款",
		],
		en: {
			title: "How do I record that a PR has been paid?",
			lines: [
				"Only a voucher the PR has signed can be marked paid, and not while a dispute is open. If your agency never signed it, you are asked to sign first. The paid date is stamped once and never changes.",
				"For one voucher, open it and tap “Mark as paid”. To pay many: “Payment Week” → “To pay” → tick → “Mark as paid” → “Confirm — mark N as paid”. To send many: on “Pending Agency Review” (“Pending reviews” on “Payment Week”) tick vouchers you signed and tap “Send to PR”.",
				"Each one is still checked; the result counts any refused and says why.",
			],
		},
		zh: {
			title: "怎么登记已付款给 PR？",
			lines: [
				"只有 PR 已签署的付款单才能标记为已付款，有未解决争议时不行。若经纪公司从未签署，系统会先要求你签名。付款日期只记录一次，不会更改。",
				"单张：打开付款单点「标记为已付款」。批量付款：「结算周」→「待付款」→ 勾选 →「标记为已付款」→「确认 —— 将 N 笔标记为已付款」。批量发送：在「待经纪公司审核」（「结算周」中为「待审核」）勾选你已签署的付款单，点「发送给 PR」。",
				"每张仍会逐一核对；结果会显示被拒数量及原因。",
			],
		},
	},
	{
		id: "ref-agency-fees",
		role: "agency",
		asks: [
			"waive cancellation fee on voucher",
			"add penalty into voucher",
			"pr cancel shift fee auto add pv ah",
			"void penalty how ah",
			"kecualikan atau batalkan caj pembatalan",
			"yuran batal syif dalam baucar",
			"罚款计入付款单",
			"豁免取消费",
			"扣钱加到付款单",
		],
		en: {
			title: "How do penalties and cancellation fees reach a voucher?",
			lines: [
				"When a PR cancels, the cancellation fee goes onto that week's voucher by itself. On the voucher, “Waive this charge” (optional reason) removes it, but only before the voucher is sent.",
				"Rule breaches are recorded as penalties every Sunday at 8 a.m. They show on the “Uncharged penalties & fees” card in “Payroll”: tick and tap “Add to voucher” before sending, or “Void” to cancel one.",
				"Owner, Guarantor or Financial Head can add, void or waive.",
			],
		},
		zh: {
			title: "罚款和取消费用怎么计入付款单？",
			lines: [
				"PR 取消班次时，取消费用会自动计入该周付款单。在付款单上点「豁免此项收费」（可填原因）即可移除，但仅限发送之前。",
				"违规会在每周日早上 8 点记录为罚款，显示在「薪资」的「未入账的罚款与费用」卡片：发送前勾选并点「加入付款单」，或点「作废」取消。",
				"东主、担保人或财务主管可以加入、作废或豁免。",
			],
		},
	},
	{
		id: "ref-agency-penalty-rules",
		role: "agency",
		asks: [
			"penalty rules agency set",
			"mc cap per month fine",
			"can set fine for late pr ah",
			"cancellation penalty percent how set ah",
			"peraturan denda agensi",
			"had MC sebulan",
			"罚款规则",
			"迟到罚款设定",
			"每月病假上限",
		],
		en: {
			title: "What penalty rules can I set?",
			lines: [
				"“Manage PR” → “Attendance and penalty rules” has four rules, each with a switch and a fine: “Minimum shifts per week” (only if you assigned that many), “MC cap per month”, “Lateness per week” and “Shift cancellation”.",
				"Cancellation has three bands: free if cancelled early enough, a % of the shift's daily wage at short notice, and another % closer in. RM 0 is a warning only. Only the Owner (or Guarantor) can save.",
			],
		},
		zh: {
			title: "可以设定哪些处罚规则？",
			lines: [
				"「PR 管理」→「出勤与处罚规则」有四条规则，各有开关和罚款：「每周最少班次」（仅在你已排足该数量时生效）、「每月病假上限」、「每周迟到次数」和「取消班次」。",
				"取消分三档：提前够早免费、临时取消按该班次日薪的某个百分比收取、更接近开工时按另一个百分比收取。罚款 RM 0 只作警告。只有东主（或担保人）可以保存。",
			],
		},
	},
	{
		id: "ref-agency-history",
		role: "agency",
		asks: [
			"past paid vouchers",
			"old voucher where to see ah",
			"过往付款单",
			"已付薪资单记录",
		],
		en: {
			title: "Where are past vouchers, and can I download them?",
			lines: [
				"“History” has “By PR” (each PR's take-home and wages, plus the floor sales they brought in), “By outlet” (the same completed shifts by venue) and “Paid PVs” (every paid voucher, filterable by venue, PR and date).",
				"Open a voucher and tap “PDF” for the voucher on your agency's letterhead, or “Excel” for a spreadsheet copy. Vouchers are numbered per agency, starting at PV-000001.",
			],
		},
		zh: {
			title: "过往付款单在哪里？可以下载吗？",
			lines: [
				"「历史记录」有「按 PR 查看」（每位 PR 的实得与工资，以及其带来的现场销售）、「按门店」（同一批已完成班次按门店分组）和「已付薪资单」（所有已付款单，可按门店、PR 和日期筛选）。",
				"打开付款单，点「PDF」获取印有贵公司信头的付款单，或点「Excel」下载表格副本。每家经纪公司的付款单从 PV-000001 开始各自编号。",
			],
		},
	},
	{
		id: "ref-agency-override",
		role: "agency",
		asks: [
			"correct voucher after signed",
			"override signed pv",
			"pv signed already got mistake can change ah",
			"edit paid voucher how ah",
			"付款单签署后更正",
			"已签付款单改错",
			"撤改已签署付款单",
		],
		en: {
			title: "Can I correct a voucher after it is signed?",
			lines: [
				"Yes. An Owner, Guarantor or Financial Head can open a signed or paid voucher and use “Override signed PV (audit logged)”, typing a required reason.",
				"The voucher re-opens and both signatures come off: you sign the corrected voucher again before re-sending, and the PR counter-signs it again.",
			],
		},
		zh: {
			title: "付款单签署后还能更正吗？",
			lines: [
				"可以。东主、担保人或财务主管可在已签署或已付款的付款单上使用「撤改已签署付款单（记入审计日志）」，并须填写原因。",
				"付款单会重新开放，双方签名都被撤除：重新发送前你需再次签署更正后的付款单，PR 也需再次会签。",
			],
		},
	},
	{
		id: "ref-agency-subscription-tier",
		role: "agency",
		asks: [
			"subscription tier decided",
			"subscription tier change by itself why ah",
			"pv more than 150 how ah",
			"tier langganan agensi",
			"bagaimana tier langganan ditentukan",
			"订阅等级",
			"订阅等级按PV数量",
			"PV数量决定等级",
		],
		en: {
			title: "How is our InnocenZ subscription tier decided?",
			lines: [
				"After sign-up there is nothing to pick: your tier follows the number of payment vouchers (PVs) you issued in each payroll week, updated automatically every Sunday. It changes the price and never blocks vouchers.",
				"Past 150 PVs in a week, the InnocenZ team is asked to quote a Custom price. On Custom, the Owner or Guarantor can ask for a new price, or ask to go back to the standard tiers.",
				"The Owner and Financial Head get a weekly statement with the PV count and tier.",
			],
		},
		zh: {
			title: "我们的 InnocenZ 订阅等级怎么决定？",
			lines: [
				"注册之后无需再选择：等级按你每个薪资周开具的付款单（PV）数量决定，每周日自动更新。它只影响价格，不会阻止开单。",
				"某周超过 150 张时，会请 InnocenZ 团队报定制价格。使用定制方案时，东主或担保人可以申请重新报价，或申请回到标准等级。",
				"东主和财务主管每周会收到对账通知，列出 PV 数量和等级。",
			],
		},
	},
	{
		id: "ref-agency-billing",
		role: "agency",
		asks: [
			"subscription bill due",
			"pay innocenz bill",
			"subscription bill due when ah",
			"today red banner overdue bill why ah",
			"tarikh akhir bayar bil",
			"bil langganan tertunggak",
			"订阅账单到期",
			"账单逾期红色横幅",
			"订阅费几时要付",
		],
		en: {
			title: "When is our subscription bill due?",
			lines: [
				"“Subscription” → “Payment history” has one row per weekly billing period (Sunday to Saturday), due 7 days after it ends. It stays “Unpaid” until InnocenZ marks the payment received; a paid period has a numbered receipt.",
				"While a period is unpaid, “Today” shows an amber banner that turns red once it is overdue, and “Subscription” in the side menu shows a count.",
				"Only the Owner handles payment; other members see it read-only.",
			],
		},
		zh: {
			title: "订阅账单什么时候到期？",
			lines: [
				"「订阅」→「付款记录」每个按周计费周期（周日至周六）一行。每期在周期结束后 7 天到期，在 InnocenZ 确认收款前显示「未付款」；已付周期可打开带编号的收据。",
				"有未付周期时，「今天」页会显示黄色横幅，逾期后变为红色，侧边菜单的「订阅」旁也会显示数量。",
				"只有东主处理付款；其他成员只能查看。",
			],
		},
	},
	{
		id: "ref-agency-notifications",
		role: "agency",
		asks: [
			"agency notifications",
			"bell unread count",
			"bell notify me what ah",
			"notifikasi agensi",
			"loceng notifikasi beritahu apa",
			"pemberitahuan agensi",
			"通知铃铛",
			"经纪公司收到什么通知提醒",
			"侧边菜单数字",
		],
		en: {
			title: "What will the bell notify me about?",
			lines: [
				"The bell at the top shows an unread count, refreshed about every minute. Tap a row to mark it read and jump to the right screen.",
				"Agency notices include MC/leave requests, overtime claims, a venue's cut-loss request, a PR dropping out of a shift, a PR's rating falling low, vouchers held on Sunday, the weekly subscription statement and new bills.",
				"The side menu also shows counts beside “Approvals” (amber), “Payroll” (red) and “Subscription” (amber).",
			],
		},
		zh: {
			title: "通知铃铛会提醒我什么？",
			lines: [
				"顶部的通知铃铛显示未读数量，约每分钟刷新。点一条通知会标为已读并跳到对应页面。",
				"经纪公司会收到：病假/请假申请、加班申请、门店的减损申请、PR 退出班次、PR 评分偏低、周日被暂扣的付款单、每周订阅对账以及新账单。",
				"侧边菜单在「审批」（黄色）、「薪资」（红色）和「订阅」（黄色）旁也会显示数量。",
			],
		},
	},
	{
		id: "ref-shared-agency-plans",
		role: "agency",
		asks: [
			"agency plan how much",
			"weekly price for agency per pv",
			"agency package how much ah",
			"starter plus growth plan price how much ah",
			"harga pakej agensi",
			"berapa kos langganan agensi seminggu",
			"harga pelan agensi",
			"经纪公司套餐",
			"经纪公司配套多少钱",
			"经纪公司每周收费",
		],
		en: {
			title: "How much does an agency plan cost?",
			lines: [
				"The “Pricing” section's “PR Agency” tab prices plans per week by payment vouchers (PV) issued that week.",
				"“Starter” 5 PV RM 125 · “Plus” 6–10 RM 250 · “Growth” 11–25 RM 500 (“Popular”) · “Enterprise” 26–75 RM 1,000 · “Scale” 76–150 RM 1,500 · “Custom” 151+ “Let's talk”.",
				"Nothing to pick after joining: each Sunday the agency moves to the tier matching the PVs it issued that payroll week, and gets a weekly statement.",
			],
		},
		zh: {
			title: "经纪公司套餐多少钱？",
			lines: [
				"「定价」部分的「PR 代理」标签，按当周开具的薪资单（PV）数量按周定价。",
				"「Starter」5 PV RM 125 ·「Plus」6–10 RM 250 ·「Growth」11–25 RM 500（「热门」）·「Enterprise」26–75 RM 1,000 ·「Scale」76–150 RM 1,500 ·「Custom」151+「面议」。",
				"加入后无需选择：每周日系统按经纪公司在该薪资周开具的 PV 数量调整到对应等级，并发送每周结算通知。",
			],
		},
	},
	{
		id: "ref-shared-custom-price",
		role: "agency",
		asks: [
			"custom price",
			"how to get custom pricing over 150 pv ah",
			"reset to normal subscription how ah",
			"harga custom agensi",
			"minta harga khas",
			"mohon sebut harga",
			"定制价格",
			"申请报价",
			"回到常规订阅",
		],
		en: {
			title: "How does an agency get a Custom price?",
			lines: [
				"On “Subscription”, the agency owner taps “Ask admin for a price”; any unpaid bill must be settled first.",
				"The current tier and price stay until the InnocenZ team answers. An agreed Custom price replaces the rate card, so the PV count no longer changes it.",
				"“Reset to normal subscription” asks to go back to the PV-based tiers; Custom stays until the InnocenZ team resolves it.",
			],
		},
		zh: {
			title: "经纪公司怎么获得定制价格？",
			lines: [
				"在「订阅」页，经纪公司东主点「向管理员申请报价」；须先结清未付账单。",
				"在 InnocenZ 团队答复前，当前等级和价格不变。商定的定制价格会取代价目表，PV 数量不再影响价格。",
				"「重置为常规订阅」可申请回到按 PV 计算的等级；在 InnocenZ 团队处理前仍保持定制方案。",
			],
		},
	},
	{
		id: "ref-agency-how-do-i-plan-next-week-s-roster-quickly",
		role: "agency",
		asks: [
			"plan next week roster",
			"next week roster quickly",
			"go to next week roster how ah",
			"下周排班",
			"快速排下周的班",
			"下周班表快速安排",
		],
		en: {
			title: "How do I plan next week's roster quickly?",
			lines: [
				"“Roster” → “Planning”: go to next week with the arrow beside the week heading, or tap the week shown at the top and tap any day of next week. The “Open demand” band shows each venue's unfilled seats that week.",
				"The “AI auto-assign” banner proposes PRs for the open slots of one day — the day its label names (after an arrow, that week's Sunday). Tap it, tick the pairings you want (or “Select all N”), then tap “Confirm N assignments”; nothing is saved before that.",
				"To plan the next day, tap the week at the top, pick that day and repeat.",
				"To place someone yourself, tap a free cell beside a PR and choose an open shift; “PR assigned — saved to the roster” confirms it. Owner, Guarantor and Financial Head can assign.",
			],
		},
		zh: {
			title: "怎么快速排好下周的班？",
			lines: [
				"「排班」→「排班计划」：用周标题旁的箭头翻到下一周，或点顶部显示的周次，再点下一周的任意一天。「待分配需求」栏会显示该周各门店未填满的名额。",
				"「AI 智能派班」横幅只为一天的空缺岗位推荐 PR — 就是横幅上写的那一天（用箭头翻周时是该周的周日）。点横幅，勾选你要的配对（或点「全选 N 项」），再点「确认 N 项分配」；确认前不会保存。",
				"要排下一天，点顶部的周次，选那一天，再重复一次。",
				"想自己安排时，点 PR 旁的空白格并选择空缺班次；显示「已指派 PR —— 已保存到排班」即已保存。东主、担保人和财务主管可以排班。",
			],
		},
	},
	{
		id: "ref-agency-can-i-export-a-whole-week-s-vouchers-at",
		role: "agency",
		asks: [
			"export whole week vouchers",
			"bank payment file",
			"download all pv at once ah",
			"整周付款单导出",
			"银行出粮文件",
			"银行付款文件",
			"一次导出全部付款单",
		],
		en: {
			title:
				"Can I export a whole week's vouchers at once, or a file for the bank?",
			lines: [
				"One voucher at a time: open a voucher and tap “PDF” (on your agency's letterhead) or “Excel”.",
				"There is no whole-week bundle and no bank payment file — you pay each PR yourself, from your agency's own bank.",
				"Then record the payments in one go: “Payroll” → “Payment Week” → “To pay”, tick the vouchers you paid, tap “Mark as paid”, then “Confirm — mark N as paid”.",
			],
		},
		zh: {
			title: "可以把整周的付款单一起导出，或导出给银行的文件吗？",
			lines: [
				"一次只能导出一张：打开付款单，点「PDF」（印有贵公司信头）或「Excel」。",
				"没有整周打包，也没有给银行的批量付款文件 — 由你从经纪公司自己的银行逐一付款给 PR。",
				"付款后可一次登记多张：「薪资」→「结算周」→「待付款」，勾选已付的付款单，点「标记为已付款」，再点「确认 —— 将 N 笔标记为已付款」。",
			],
		},
	},
	/* ---------- Outlet — the web portal ---------- */
	{
		id: "ref-outlet-signup-details",
		role: "outlet",
		asks: [
			"what documents do i need to register my outlet",
			"outlet sign up need ssm number and business licence?",
			"register outlet need what ah, ssm, licence, ic all must upload ka",
			"how to sign up my bar lah, what details to fill",
			"pendaftaran outlet perlukan maklumat apa",
			"门店注册要准备哪些资料",
			"注册酒吧要SSM号码和营业执照吗",
		],
		en: {
			title: "What do I need to sign my outlet up?",
			lines: [
				"Outlet sign-up asks for the company name, the 12-digit SSM registration number (the old one is optional), the business licence and the full venue address.",
				"It also asks for the person in charge's full name as on their IC or passport, the ID number and gender, a contact number, a business email, a login email, a password of 8+ characters, a package and a logo image.",
				"Under “Verify your email”, tap “Send code” and type the 6-digit code sent to your login email (valid 10 minutes), then tap “Create account”.",
			],
		},
		zh: {
			title: "门店注册需要准备什么？",
			lines: [
				"门店注册需要公司名称、12 位 SSM 公司注册号（旧注册号选填）、营业执照和完整的场所地址。",
				"还需要负责人的全名（与身份证或护照一致）、证件号码和性别、联系电话、业务邮箱、登录邮箱、至少 8 位的密码、一个套餐和一张标志图片。",
				"在「验证您的邮箱」点「发送验证码」，输入发送到登录邮箱的 6 位验证码（10 分钟内有效），再点「创建账户」。",
			],
		},
	},
	{
		id: "ref-outlet-after-signup",
		role: "outlet",
		asks: [
			"signed up my outlet but portal says pending review",
			"after register outlet only settings page can open",
			"outlet kena suspend, only settings can open leh",
			"门店注册后显示待审核怎么办",
			"注册后多久批准开通",
			"门店被停用了只能打开设置",
		],
		en: {
			title: "What happens after I sign up?",
			lines: [
				"The InnocenZ team reviews and approves each new outlet. Until then the portal shows “Pending review.” and only “Settings” opens, so you can update your profile.",
				"The owner gets an email when the outlet is approved, and the full portal opens.",
				"Billing for your plan starts on the day the outlet is approved, not the day you signed up.",
				"A suspended outlet can still sign in but only “Settings” opens; message the InnocenZ team to restore it.",
			],
		},
		zh: {
			title: "注册后会怎样？",
			lines: [
				"InnocenZ 团队会审核并批准每家新门店。在此之前门户显示「待审核。」，只能打开「设置」来更新资料。",
				"门店获批后东主会收到电子邮件，完整门户随即开放。",
				"套餐计费从门店获批当天开始，而不是注册当天。",
				"被暂停的门店仍可登录，但只能打开「设置」；请联系 InnocenZ 团队恢复。",
			],
		},
	},
	{
		id: "ref-outlet-link-agency",
		role: "outlet",
		asks: [
			"how to connect my outlet with an agency",
			"request agency partnership",
			"how to add agency partner to my outlet ah",
			"agency partnership still awaiting approval leh",
			"how to end partnership with an agency",
			"macam mana nak sambung outlet dengan agensi",
			"门店怎么跟经纪公司合作关联",
			"结束和经纪公司的合作会怎样",
		],
		en: {
			title: "How do I link my outlet to an agency?",
			lines: [
				"Agencies staff your shifts, so you need at least one. In “Settings” → “Agency Partnerships”, pick one under “Choose an agency…” and tap “Request”.",
				"Each one reads “Awaiting approval”, “Approved”, “Declined” or “Ended”. The agency decides, and you can work with several.",
				"Only the Owner or Guarantor can request, withdraw or end a partnership; other roles can view the list.",
				"Ending one stops new jobs going to that agency; shifts already posted stay. “Request again” needs their approval, like the first time.",
			],
		},
		zh: {
			title: "怎么把门店和经纪公司关联？",
			lines: [
				"班次由经纪公司配置人员，所以至少需要一家。在「设置」→「经纪公司合作」的「选择经纪公司…」里选一家，再点「申请」。",
				"每家会显示「等待批准」「已批准」「已拒绝」或「已结束」。由经纪公司决定，你可以同时与多家合作。",
				"只有东主或担保人可以申请、撤回或结束合作；其他角色只能查看列表。",
				"结束合作后不能再向对方发布新工作，已发布的班次不受影响。「重新申请」与首次一样需要对方批准。",
			],
		},
	},
	{
		id: "ref-outlet-cannot-post",
		role: "outlet",
		asks: [
			"post job button greyed out",
			"cant post job, it says no agency yet",
			"post job cannot press one lah, why",
			"why cannot post shift ah, it say overlap or over daily limit",
			"butang post job tak boleh tekan",
			"为什么发布不了职位",
			"发布职位按钮按不了，灰色的",
			"发班被拒说重叠或超过每日上限",
		],
		en: {
			title: "Why can't I post a job?",
			lines: [
				"“Post Job” stays off until at least one agency has approved your outlet; “Today” then shows “You have no agency yet” or “Waiting for an agency to accept you”.",
				"An outlet still pending approval or suspended cannot post. A Director sees “Post Job” read-only.",
				"A post is also refused when it would go over your plan's daily PR limit, or overlap another of your shifts (back-to-back is fine); the message names the date and the reason.",
			],
		},
		zh: {
			title: "为什么我无法发布职位？",
			lines: [
				"在至少一家经纪公司批准你的门店之前，「发布职位」无法使用；「今天」页会显示「你还没有经纪公司」或「正在等待经纪公司接受你」。",
				"仍在待审核或被暂停的门店无法发布。总监只能以只读方式查看「发布职位」。",
				"超出套餐的每日 PR 上限，或与你的另一个班次时间重叠（前后相接没问题），也会被拒绝；提示会写明日期和原因。",
			],
		},
	},
	{
		id: "ref-outlet-pin-setup",
		role: "outlet",
		asks: [
			"how to set check in location for my venue",
			"set the geofence pin and radius",
			"how to set the gps pin for check in ah",
			"check in radius can set how many metre lah",
			"macam mana nak set lokasi check in outlet",
			"tukar radius check in kedai",
			"怎么设置门店打卡定位",
			"签到定位点在哪里设置",
		],
		en: {
			title: "How do I set the check-in pin?",
			lines: [
				"In “Settings” → “Attendance”, tap “Find from venue address”, or search another address and pick a match, then tap “Use this location”.",
				"The “Radius” is in whole metres, from 10 to 1,000 (50 by default). Once a pin is saved, change it and tap “Update radius”.",
				"Saving the pin switches the fence on at once. Only the Owner or Guarantor can change it; other roles see it read-only.",
			],
		},
		zh: {
			title: "怎么设置签到定位点？",
			lines: [
				"在「设置」→「考勤」点「从门店地址查找」，或搜索其他地址并选择匹配结果，再点「使用此位置」。",
				"「半径」为 10 到 1,000 之间的整数米数（默认 50 米）。保存定位点后，修改半径再点「更新半径」。",
				"保存定位点后围栏立即生效。只有东主或担保人可以更改；其他角色只能查看。",
			],
		},
	},
	{
		id: "ref-outlet-fence-rules",
		role: "outlet",
		asks: [
			"how does the check in fence decide distance",
			"no pin set can pr check in from anywhere",
			"how many metres away then cannot check in lah",
			"GPS palsu tak boleh check in ke",
			"签到围栏怎么算距离",
			"PR距离门店太远打卡不了",
			"没有设定位PR在哪里都能打卡吗",
		],
		en: {
			title: "How does the check-in fence decide?",
			lines: [
				"With no pin, the “Attendance” card warns that check-ins are accepted from anywhere, unmeasured.",
				"With a pin, InnocenZ measures the PR's distance from it at check-in; the phone's GPS accuracy can add up to 30 m of leeway.",
				"A PR too far away is told how many metres off they are. A check-in with no location or a fake GPS location is refused.",
				"“Remove pin” switches the fence off again, after a red confirm.",
			],
		},
		zh: {
			title: "签到围栏是怎么判断的？",
			lines: [
				"没有定位点时，「考勤」卡片会提示此处的签到会被无条件接受，不作距离验证。",
				"设置定位点后，InnocenZ 会在签到时测量 PR 与定位点的距离；手机 GPS 精度最多可额外放宽 30 米。",
				"距离太远的 PR 会被告知相差多少米。没有位置或使用虚假 GPS 位置的签到会被拒绝。",
				"「移除定位点」需先在红色确认框确认，之后围栏关闭。",
			],
		},
	},
	{
		id: "ref-outlet-rate-card",
		role: "outlet",
		asks: [
			"how to set daily wage for each pr tier",
			"change tier 1 wage then all tier change ah",
			"how to set ot per hour and commission % lah",
			"set kadar OT sejam untuk PR",
			"怎么设置各等级PR的日薪",
			"加班每小时薪水怎么算",
			"各等级的酒水佣金和小费百分比在哪里设",
		],
		en: {
			title: "How do I set the pay rates for each tier?",
			lines: [
				"“Workspace” → “Rates by PR tier” (a new outlet starts with a default card) has rows for Tier 1–5, “Servant” and “Commission only”: “Daily wages”, optional “Target sales”, and “HH Drinks”, “NH Drinks”, “Tips” %.",
				"“HH Drinks” is the drink commission inside happy hour and “NH Drinks” outside it. “Commission only” pays no wage — drinks and tips commission only.",
				"“RM/HR” is the daily wage ÷ the standard shift (6 hours by default) and “OT/HR” is 1.5× that; both are worked out for you.",
				"Changing Tier 1's daily wage re-sets the other tiers' wages from it. Press “Save workspace” to keep your changes.",
			],
		},
		zh: {
			title: "怎么设置各等级的薪酬？",
			lines: [
				"「工作区」→「按 PR 等级的费率」（新门店自带默认费率表）有等级 1–5、「服务员」和「仅抽成」各一行，包括「日薪」、可选的「销售目标」，以及「欢乐时段酒水」「非欢乐时段酒水」「小费」的抽成 %。",
				"「欢乐时段酒水」用于欢乐时段内，「非欢乐时段酒水」用于其他时间。「仅抽成」没有工资，只有酒水和小费抽成。",
				"「每小时 (RM)」= 日薪 ÷ 标准班次（默认 6 小时），「加班时薪」是它的 1.5 倍，两者都会自动算出。",
				"修改等级 1 的日薪会据此重设其他等级的日薪。改完请点「保存工作区」。",
			],
		},
	},
	{
		id: "ref-outlet-price-lists",
		role: "outlet",
		asks: [
			"difference between drinks price and service entitlement",
			"how to move item from drinks to services ah",
			"tips cannot rename or delete one meh",
			"酒水价格表在哪里加",
			"服务项目和酒水价格有什么分别",
			"小费那一行为什么删不掉",
		],
		en: {
			title: "What are Drinks Price and Service Entitlement?",
			lines: [
				"“Workspace” has two price lists: “Drinks Price” for drinks and “Service Entitlement” for services. Add rows with “Add More”, and move a row across with “Move to Services” or “Move to Drinks”.",
				"Each list is sorted by price, and any row you added can be deleted.",
				"“Tips” always stays under “Service Entitlement”: you set its price, but it cannot be renamed or removed. Tips are counted apart from service sales.",
				"PRs log what a table bought from these lists.",
			],
		},
		zh: {
			title: "「酒水价格」和「服务项目」是什么？",
			lines: [
				"「工作区」有两份价目表：「酒水价格」放酒水，「服务项目」放服务。用「添加更多」新增一行，用「移至服务项目」或「移至酒水」把一行移到另一份。",
				"每份价目表按价格排序，你添加的任何一行都可以删除。",
				"「小费」固定在「服务项目」中：可以设定价格，但不能改名或移除。小费与服务销售分开计算。",
				"PR 按这些价目表记录客人消费的项目。",
			],
		},
	},
	{
		id: "ref-outlet-happy-hour",
		role: "outlet",
		asks: [
			"happy hour drink discount %",
			"欢乐时段怎么设置",
			"happy hour 酒水折扣在哪里设",
		],
		en: {
			title: "How does happy hour work?",
			lines: [
				"“Workspace” → “Happy hour” sets a start time, an end time and a “Drink discount” % off drinks.",
				"Inside that window a PR earns the “HH Drinks” commission % instead of “NH Drinks”. The window is the same for every shift at your outlet.",
			],
		},
		zh: {
			title: "欢乐时段怎么运作？",
			lines: [
				"「工作区」→「欢乐时段」可设定开始时间、结束时间和酒水的「酒水折扣」%。",
				"在这个时段内，PR 按「欢乐时段酒水」抽成 % 计算，而不是「非欢乐时段酒水」。这个时段对门店的所有班次都一样。",
			],
		},
	},
	{
		id: "ref-outlet-set-prices-banner",
		role: "outlet",
		asks: [
			"today page says set your prices",
			"set your prices banner wont go away",
			"why today got set your prices ah",
			"the set prices banner keep showing leh, i put 0",
			"今天页面一直显示请先设置价格",
			"价格设了0还是提示设置价格",
			"设置价格的横幅不消失",
		],
		en: {
			title: "Why does “Today” say “Set your prices”?",
			lines: [
				"“Today” shows “Set your prices” while the drinks, tips or services list has no priced row; a price of 0 counts as not set.",
				"Tap “Set prices in Workspace” to fill them in. Shifts and the receipts your PRs sign are priced from these lists. The banner goes once every list has a price.",
			],
		},
		zh: {
			title: "为什么「今天」页显示「请先设置价格」？",
			lines: [
				"只要酒水、小费或服务项目中有一份还没有定价的项目，「今天」页就会显示「请先设置价格」；价格为 0 视为未设置。",
				"点「前往工作区设置价格」去填写。班次金额和 PR 签收的收据都按这些价目表计算。每份价目表都有价格后，提示就会消失。",
			],
		},
	},
	{
		id: "ref-outlet-event-cards",
		role: "outlet",
		asks: [
			"what are the event cards in post job",
			"how to make my own event template",
			"post job got 12 cards what is that ah",
			"how to add cover picture for event card lah",
			"kad acara dalam post job untuk apa",
			"padam kad contoh acara",
			"发布职位里的活动卡片是什么",
			"怎么新增活动模板",
			"怎么删掉示例活动卡片",
		],
		en: {
			title: "What are the event cards in “Post Job”?",
			lines: [
				"“Post Job” opens on “Choose an event” — a new outlet has 12 example cards. Tap a card to pre-fill the form, or “Blank — start fresh”.",
				"Cards are a “Normal event” or a “Special event” and can carry a cover picture. Use “New template” to add your own, and edit or delete any card.",
				"Anyone who can post jobs can manage the cards.",
			],
		},
		zh: {
			title: "「发布职位」里的活动卡片是什么？",
			lines: [
				"「发布职位」先打开「选择活动」——新门店自带 12 张示例卡片。点一张卡片即可预填表单，或选「空白 — 从头开始」。",
				"卡片分为「普通活动」和「特别活动」，可以带封面图片。用「新建模板」添加自己的卡片，任何卡片都可以编辑或删除。",
				"能发布职位的人都可以管理这些卡片。",
			],
		},
	},
	{
		id: "ref-outlet-postjob-form",
		role: "outlet",
		asks: [
			"how to fill in the post job form",
			"post one shift for many dates",
			"post job how to split people needed per tier ah",
			"how to put dress code and preferred language lah",
			"macam mana isi borang post job",
			"nak post syif untuk seminggu sekali gus",
			"tukar bayaran tier untuk syif ini sahaja",
			"怎么填写发布职位的班次",
			"这一班的等级薪水可以单独改吗",
		],
		en: {
			title: "How do I fill in a “Post Job” shift?",
			lines: [
				"Pick one or more dates (“3 days” or “1 week” selects a span); each date becomes its own shift.",
				"Name the event, set the “Time” and the “People needed”.",
				"Under “Pay by PR tier”, split the people across tiers in “PR count”. The pay starts from your “Workspace” rates and can be changed for this shift only; “Reset to workspace rates” undoes it.",
				"Add “Preferred languages” (a plus, not a requirement) and a “Dress code”; the agency and the PR both see them.",
			],
		},
		zh: {
			title: "怎么填写「发布职位」的班次？",
			lines: [
				"选择一个或多个日期（「3 天」或「1 周」可选连续日期）；每个日期都会成为一个独立班次。",
				"填写活动名称，设定「时间」和「所需人数」。",
				"在「按 PR 等级付薪」的「PR 人数」里把人数分配到各等级。薪酬默认取自工作区费率，可只针对这个班次修改；「重置为工作区费率」可恢复。",
				"填写「偏好语言」（加分项，非硬性要求）和「着装要求」；经纪公司和 PR 都能看到。",
			],
		},
	},
	{
		id: "ref-outlet-special-event",
		role: "outlet",
		asks: [
			"how to set up a special event",
			"special event can use own drink price ah",
			"vip night own prices how lah",
			"product launch event how to post",
			"macam mana buat acara khas",
			"特别活动怎么设置价格",
			"VIP活动可以用不同酒水价格吗",
			"包场活动怎么发",
		],
		en: {
			title: "How do special events and their prices work?",
			lines: [
				"Set “Event type” to “Special event” and pick VIP, Product launch, Private table buyout, Brand activation, Corporate, or Other and type your own.",
				"A special event can have its own drink and service prices under “Prices”; that night PRs log against those prices. “Reset to workspace prices” goes back.",
				"A normal event always uses your “Workspace” prices.",
			],
		},
		zh: {
			title: "特别活动和它的价格怎么设置？",
			lines: [
				"把「活动类型」设为「特别活动」，再选择 VIP、产品发布、包桌、品牌活动、企业活动，或选「其他」自行填写。",
				"特别活动可以在「价格」里设定专属的酒水和服务价格，当晚 PR 按这些价格记录。「重置为工作区价格」可恢复。",
				"普通活动始终沿用工作区价格。",
			],
		},
	},
	{
		id: "ref-outlet-named-prs",
		role: "outlet",
		asks: ["可以指定PR吗", "能点名要我想要的PR来上班吗"],
		en: {
			title: "Can I ask for specific PRs?",
			lines: [
				"Yes. “Select PRs” lists the PRs on the rosters of the agencies ticked in “Send to”, with their star rating or “Not rated yet”.",
				"Naming a PR is a request, not a guarantee — the agency decides who it sends, and staffs any unnamed slots.",
				"The request goes to every ticked agency that has that PR. On “Today” it shows under “PR tonight” with an amber “Requested” pill until booked. Your plan caps how many PRs you can name.",
			],
		},
		zh: {
			title: "可以指定想要的 PR 吗？",
			lines: [
				"可以。「选择 PR」会列出「发送给」里已勾选经纪公司名册上的 PR，并显示星级评分或「尚未评分」。",
				"指名 PR 只是请求，不是保证 —— 由经纪公司决定派谁，未指名的名额也由经纪公司安排。",
				"请求会发送给已勾选且有该 PR 的每一家经纪公司。在「今天」页的「今晚 PR」里会带琥珀色「已点名」标签，直到对方安排。套餐限制你可以指名的人数。",
			],
		},
	},
	{
		id: "ref-outlet-send-to",
		role: "outlet",
		asks: [
			"send one job to two agencies",
			"post shift to multiple agencies",
			"send to tick only one agency cannot untick leh",
			"boleh hantar job ke beberapa agensi",
			"一个职位可以发给几家经纪公司",
			"同一个班发给多家公司",
			"已发布的班次能换经纪公司吗",
		],
		en: {
			title: "Can one job go to more than one agency?",
			lines: [
				"Yes. “Send to” lists your approved agencies; tick the ones that should get the shift, and any of them can help fill the same headcount.",
				"At least one must stay ticked. With only one approved agency, the shift goes to it automatically.",
				"The agencies on a posted shift cannot be changed — withdraw it and post it again.",
			],
		},
		zh: {
			title: "一个职位可以发给多家经纪公司吗？",
			lines: [
				"可以。「发送给」会列出你已获批准的经纪公司；勾选要接收这个班次的公司，它们都可以一起补足同一批人数。",
				"至少要保留一家勾选。只有一家已批准的经纪公司时，班次会自动发给它。",
				"已发布班次的经纪公司不能更改 —— 请撤回后重新发布。",
			],
		},
	},
	{
		id: "ref-outlet-post-button",
		role: "outlet",
		asks: [
			"what happens after i press post",
			"posted many shifts one failed none posted",
			"add another shift then post all at once",
			"press post then agency get notification ah",
			"one shift refused all also not posted leh",
			"按发布后会怎样",
			"一个班被拒其他也没发出去",
			"发布后经纪公司会收到通知吗",
		],
		en: {
			title: "What happens when I press Post?",
			lines: [
				"Use “Add another shift” to build a list, then the green “Post … shifts” button posts them all in one go.",
				"It is all or nothing: if one shift is refused, none is posted, your form is kept, and the message names the date and the reason.",
				"Posted shifts are confirmed straight away, and every agency you sent them to is notified to staff them.",
			],
		},
		zh: {
			title: "按下发布后会怎样？",
			lines: [
				"用「再添加一个班次」把多个班次加入列表，再按绿色的「发布 … 个班次」按钮一次全部发布。",
				"要么全部成功，要么都不发布：只要有一个班次被拒绝，就一个都不会发布，表单会保留，提示会写明日期和原因。",
				"发布的班次立即确认，你发送到的每一家经纪公司都会收到通知去安排人员。",
			],
		},
	},
	{
		id: "ref-outlet-change-withdraw",
		role: "outlet",
		asks: [
			"how to cancel a posted shift",
			"edit shift after posting",
			"where is withdraw shift button",
			"tonight shift cannot withdraw leh",
			"怎么取消已发布的班次",
			"发错班次怎么修改",
			"今天的班不能撤回怎么办",
		],
		en: {
			title: "How do I change or cancel a posted shift?",
			lines: [
				"A posted shift is not edited in place: open it on the “Calendar page”, tap “Withdraw shift”, and post it again if needed.",
				"Withdrawing works only from tomorrow onwards. It tells you how many booked PRs will lose their booking and cannot be undone; the PRs and the agency are notified.",
				"For a shift today, contact the agency to stand the team down, or ask to release PRs with “Reduce cutlost” on “Today”.",
			],
		},
		zh: {
			title: "怎么修改或取消已发布的班次？",
			lines: [
				"已发布的班次不能直接修改：在「日历」打开它，点「撤回班次」，需要的话再重新发布。",
				"只能撤回明天及以后的班次。系统会告诉你有多少位已预订的 PR 将失去预订，此操作无法撤销；PR 和经纪公司都会收到通知。",
				"今天的班次请联系经纪公司安排撤场，或在「今天」页用「减少缺班损失」申请提前放人。",
			],
		},
	},
	{
		id: "ref-outlet-calendar-colours",
		role: "outlet",
		asks: [
			"calendar colours meaning",
			"what does lavender sealed mean on the calendar",
			"the count red amber green on calendar lah",
			"日历上的颜色是什么意思",
			"日历班次红色黄色代表什么",
			"日历绿色蓝色灰色是什么状态",
		],
		en: {
			title: "What do the colours on the Calendar mean?",
			lines: [
				"The “Calendar page” shows a month of your shifts. The coloured edge shows status: green “Live” (on now), blue “Confirmed” (upcoming), grey “Past” and lavender “Sealed” (closed).",
				"Each shift's supplied/needed count is green when full, amber when part-filled and red when nobody is booked yet.",
				"The strip above the month counts upcoming slots filled and unfilled. Tap a shift to open its event, agencies, demand vs supplied, sales, labour cost, tier rates and PRs.",
			],
		},
		zh: {
			title: "「日历」上的颜色代表什么？",
			lines: [
				"「日历」显示一个月的班次。左侧色条代表状态：绿色「进行中」（正在进行）、蓝色「已确认」（即将到来）、灰色「已过去」、淡紫色「已封存」（已结束）。",
				"每个班次的「已配置/需求」人数：配满为绿色，部分配置为琥珀色，还没有人预订为红色。",
				"月份上方的汇总条统计未来名额已配置和空缺的数量。点任一班次可查看活动、经纪公司、需求与已配置、销售额、人力成本、等级费率和 PR。",
			],
		},
	},
	{
		id: "ref-outlet-close-shift",
		role: "outlet",
		asks: [
			"how to close a shift after the night ends",
			"close shift button on calendar",
			"cannot close shift before it ends",
			"night finish already how to close shift ah",
			"close shift then pr wages affected or not",
			"夜场结束后怎么结束班次",
			"关闭班次会影响薪水吗",
			"关闭班次后还能加人吗",
		],
		en: {
			title: "How do I close a finished night?",
			lines: [
				"After a shift has ended, open it on the “Calendar page”, tap “Close shift” and confirm.",
				"Closing tells your agency the night is done, and nobody else can be added. Wages already earned are not affected.",
				"A closed shift shows as “Sealed”. It can't be closed before it ends.",
			],
		},
		zh: {
			title: "怎么结束已完成的夜场班次？",
			lines: [
				"班次结束后，在「日历」打开它，点「结束班次」并确认。",
				"结束后会告知经纪公司当晚已结束，之后无法再加入人员。已赚取的薪资不受影响。",
				"关闭后的班次显示为「已封存」。班次时间结束前无法使用「结束班次」。",
			],
		},
	},
	{
		id: "ref-outlet-today-cards",
		role: "outlet",
		asks: [
			"what do shift cards on today show",
			"today shift shows expired",
			"could not load tonight notice",
			"got 2 shift today how to pick which card lah",
			"kad syif dalam today tunjuk apa",
			"today keluar could not load tonight",
			"今天页的班次卡片显示什么",
			"班次卡片显示Expired是什么意思",
			"显示无法加载今晚是什么情况",
		],
		en: {
			title: "What do the shift cards on “Today” show?",
			lines: [
				"“Today” lists every shift of the day, earliest first: the event, supplied/needed PRs, pay range, sales target and sales so far.",
				"A shift reads “Live” until its end time, then “Expired”; one closed with “Close shift” reads “Sealed”.",
				"With more than one shift, tick one to point “PR tonight”, the labour cost and “Reduce cutlost” at it.",
				"If something fails to load, an amber “Could not load tonight” notice says so rather than showing an empty night.",
			],
		},
		zh: {
			title: "「今天」页的班次卡片显示什么？",
			lines: [
				"「今天」按时间先后列出当天所有班次：活动、PR 已配置/需求人数、薪酬范围、销售目标和目前销售额。",
				"班次在结束时间前显示「进行中」，之后显示「已结束」；用「结束班次」关闭的班次显示「已封存」。",
				"当天有多个班次时，勾选其中一个，「今晚 PR」、人力成本和「减少缺班损失」就会显示该班次。",
				"如果加载失败，会出现琥珀色的「无法加载今晚的安排」提示，而不是显示空白的夜晚。",
			],
		},
	},
	{
		id: "ref-outlet-pr-status",
		role: "outlet",
		asks: [
			"pr status booked on duty released meaning",
			"pr shows released on today",
			"booked amber means not check in yet ah",
			"PR状态BOOKED是什么意思",
			"怎么看PR有没有打卡签到",
		],
		en: {
			title: "What do the PR statuses on “Today” mean?",
			lines: [
				"Each PR under “PR tonight” has a pill: “BOOKED” (amber, not checked in yet), “ON-DUTY” (green, checked in) or “RELEASED” (grey, checked out or sent home).",
				"The status comes from the PR's own check-in and check-out, so an early arrival already reads “ON-DUTY”.",
				"Cards show the check-in or check-out time and the supplying agency. “Live sales” and “Shift history” open more detail.",
			],
		},
		zh: {
			title: "「今天」页上的 PR 状态是什么意思？",
			lines: [
				"「今晚 PR」里每位 PR 都有一个标签：「BOOKED」（琥珀色，尚未签到）、「ON-DUTY」（绿色，已签到）或「RELEASED」（灰色，已签退或已提前放行）。",
				"状态来自 PR 本人的签到和签退，所以提早到场的 PR 已显示「ON-DUTY」。",
				"卡片会显示签到或签退时间和派出的经纪公司。「实时销售」和「班次记录」可查看更多详情。",
			],
		},
	},
	{
		id: "ref-outlet-log-sales",
		role: "outlet",
		asks: [
			"how to record sales for the night",
			"where to key in drink sales ah",
			"log sales cannot after closed leh",
			"rekod jualan minuman setiap PR",
			"isi angka jualan untuk PR",
			"怎么记录当晚销售额",
			"每个PR的酒水销售在哪里输入",
			"关班后还能记录销售吗",
		],
		en: {
			title: "How do I record sales for a night?",
			lines: [
				"Once a shift has started, “Log sales” on “Today” (or in the shift's details on the “Calendar page”) takes one RM drink-sales figure per PR.",
				"Tips and services already recorded stay as they are. If the agency later approves a receipt for that PR, the receipts' total replaces your figure.",
				"“Today”, “Reports” and “History” read these figures. A Director cannot log sales, and a closed night is locked.",
			],
		},
		zh: {
			title: "怎么记录当晚的销售额？",
			lines: [
				"班次开始后，在「今天」页（或「日历」中的班次详情）的「录入销售」为每位 PR 填写一个 RM 酒水销售额。",
				"已记录的小费和服务项目保持不变。之后经纪公司批准该 PR 的收据时，收据合计会取代你填写的数字。",
				"「今天」、「报表」和「历史记录」都读取这些数字。总监不能录入销售，已结束的夜晚会被锁定。",
			],
		},
	},
	{
		id: "ref-outlet-labour-cost",
		role: "outlet",
		asks: [
			"what is labour cost on today",
			"labor cost vs budget variance",
			"labour cost how calculate ah",
			"today labour cost over budget meaning lah",
			"anggaran kos gaji malam ni",
			"今天页的人力成本是什么",
			"人力成本怎么算的",
			"今晚工资成本预算大概多少",
		],
		en: {
			title: "What is the labour cost on “Today”?",
			lines: [
				"Expanding a shift card shows its labour cost against target. The “Labor cost” section below the cards lists each tier's actual cost against budget, with the variance.",
				"It is worked out from the rates on that shift and each booked PR's tier, so you can see an estimate of the night's wage bill before it closes.",
			],
		},
		zh: {
			title: "「今天」页的人力成本是什么？",
			lines: [
				"展开班次卡片可看到人力成本与目标的对比。卡片下方的「人力成本」区块按等级列出实际成本与预算，以及预算差异。",
				"成本按该班次的费率和每位已预订 PR 的等级估算，让你在当晚结束前就能预估工资总额。",
			],
		},
	},
	{
		id: "ref-outlet-rate-pr",
		role: "outlet",
		asks: [
			"how to give rating stars to a pr",
			"give stars to pr after checkout",
			"rate button not showing on pr card",
			"how to give review to pr ah",
			"rate again will replace the old rating ah",
			"macam mana nak bagi rating PR",
			"bagi bintang kepada PR",
			"怎么给PR评分",
			"给PR打星星评价",
			"评分按钮在哪里",
		],
		en: {
			title: "How do I rate a PR?",
			lines: [
				"After a PR checks out, their card under “PR tonight” shows “Rate”.",
				"Pick 1–5 stars, tap any tags (Punctual, Friendly, Professional, Great upsell, Team player, Needs coaching), add a note, and tap “Submit”.",
				"The rating goes to the agency that supplied that night. Your outlet keeps one rating per PR, so rating again replaces it. A Director cannot rate.",
			],
		},
		zh: {
			title: "怎么给 PR 评分？",
			lines: [
				"PR 签退后，「今晚 PR」里的卡片会出现「评分」。",
				"选择 1–5 星，点选合适的标签（Punctual、Friendly、Professional、Great upsell、Team player、Needs coaching），写下备注，再点「提交」。",
				"评分会发给当晚派人的经纪公司。每家门店对每位 PR 只保留一个评分，再次评分会取代之前的。总监不能评分。",
			],
		},
	},
	{
		id: "ref-outlet-cut-loss-detail",
		role: "outlet",
		asks: [
			"how does reduce cutlost work",
			"cut open slots nobody filled",
			"cutlost pending agency means what ah",
			"macam mana nak kurangkan PR malam ni",
			"减少缺班损失怎么用",
			"取消没人填的空位",
		],
		en: {
			title: "How does “Reduce cutlost” work?",
			lines: [
				"On a confirmed shift, “Reduce cutlost” offers “Cut … open slots” to drop seats nobody filled, or “Best Effort Cut-Lost”, which suggests PRs to release early with an estimated saving.",
				"Either one is only a request: nothing changes until the agency approves it, and the card reads “Pending agency” meanwhile. You get a notification with the answer.",
				"On approval, a released PR who checked in is paid for the hours worked plus commission; one who never checked in is cancelled at no charge.",
				"Owner, Guarantor, Financial Head and Ops Head can ask; a Director cannot.",
			],
		},
		zh: {
			title: "「减少缺班损失」怎么运作？",
			lines: [
				"对已确认的班次，「减少缺班损失」提供「削减 … 个空缺名额」来去掉没人补上的名额，或「尽力减损」，建议提前放行哪些 PR 并预估节省金额。",
				"两者都只是申请：经纪公司批准前不会有任何改变，期间卡片显示「等待经纪公司处理」。结果会以通知告诉你。",
				"批准后，已签到的被放行 PR 按实际工时加抽成结算；从未签到的则被取消，不收费用。",
				"东主、担保人、财务主管和运营主管可以申请；总监不能。",
			],
		},
	},
	{
		id: "ref-outlet-notifications",
		role: "outlet",
		asks: [
			"what notifications does an outlet get",
			"sidebar count number on approvals",
			"the number at the sidebar what is it ah",
			"outlet bell notification got what lah",
			"notifikasi apa outlet dapat",
			"loceng pemberitahuan outlet",
			"门店会收到什么通知",
			"侧边栏的数字是什么",
			"铃铛会提醒什么",
		],
		en: {
			title: "What notifications and badges does an outlet get?",
			lines: [
				"The bell tells you when an agency approves or declines a cut-loss request, and opens “Today”.",
				"The Owner and the Financial Head are told when a new subscription bill opens; it opens “Subscription”.",
				"Sidebar counts show what is waiting: on “Today”, shifts still short of PRs; on “Approvals”, people asking to join; on “Subscription”, unpaid bills.",
			],
		},
		zh: {
			title: "门店会收到哪些通知和提示？",
			lines: [
				"经纪公司批准或拒绝减损申请时，铃铛会通知你，点开进入「今天」。",
				"有新的订阅账单时，东主和财务主管会收到通知，点开进入「订阅」。",
				"侧边栏的数字显示待处理事项：「今天」是仍缺 PR 的班次，「审批」是申请加入的人，「订阅」是未付账单。",
			],
		},
	},
	{
		id: "ref-outlet-reports-detail",
		role: "outlet",
		asks: [
			"how are my reports calculated",
			"net sales and margin how worked out",
			"report net sales why so low ah",
			"top performing prs how rank one",
			"laporan jualan bersih dikira macam mana",
			"报表的净销售怎么算",
			"报表为什么没有算待审核的小票",
			"表现最好的PR怎么排名",
		],
		en: {
			title: "How are my “Reports” worked out?",
			lines: [
				"“Reports” has “This week”, “Last week” and “Custom range”; weeks run Sunday to Saturday.",
				"Net sales = floor sales minus PR spend (wages, approved commission and approved overtime), with margin %, “Avg / night” and change against the period before.",
				"Floor sales are split into drinks, tips and services, filled from agency-approved receipts or your own “Log sales”. A receipt still pending counts for nothing.",
				"“Top performing PRs” ranks PRs for the period.",
			],
		},
		zh: {
			title: "报表是怎么计算的？",
			lines: [
				"「报表」有「本周」「上周」和「自定义区间」；每周从周日到周六。",
				"净销售额 = 现场销售减去 PR 支出（工资、已批准的抽成和已批准的加班费），并显示利润率、「每晚平均」及与上期的对比。",
				"现场销售分为酒水、小费和服务，来自经纪公司批准的收据或你自己的「录入销售」。仍待处理的收据不计入。",
				"「顶尖 PR」列出该期间的 PR 排名。",
			],
		},
	},
	{
		id: "ref-outlet-history",
		role: "outlet",
		asks: [
			"what does history show",
			"past shifts list per pr",
			"where to see who worked last week ah",
			"history why no deduction show leh",
			"历史记录显示什么",
			"以前完成的班次在哪里看",
			"历史里为什么看不到扣钱",
		],
		en: {
			title: "What does “History” show?",
			lines: [
				"“History” lists the completed shifts at your outlet, one row per PR: who worked, when, for which agency, what they earned and what they sold.",
				"Filter by name, agency and date range, and tap a PR to see each shift.",
				"The header totals wages only — an outlet never sees an agency's deductions from its PRs.",
			],
		},
		zh: {
			title: "「历史记录」显示什么？",
			lines: [
				"「历史记录」列出门店已完成的班次，每位 PR 一行：谁上班、什么时候、来自哪家经纪公司、赚了多少、卖了多少。",
				"可以按姓名、经纪公司和日期范围筛选，点一位 PR 可查看每个班次。",
				"标题只合计工资 —— 门店永远看不到经纪公司对 PR 的扣款。",
			],
		},
	},
	{
		id: "ref-outlet-roles",
		role: "outlet",
		asks: [
			"what can each outlet role do",
			"director only can view",
			"difference owner guarantor financial head ops head",
			"ops head can post job or not ah",
			"why director cannot edit anything lah",
			"peranan outlet boleh buat apa",
			"director boleh edit ke",
			"门店各角色有什么权限",
			"财务主管能做什么",
			"董事只能看吗",
		],
		en: {
			title: "What can each outlet role do?",
			lines: [
				"The Owner and the Guarantor can do everything — team, agency partnerships, the check-in pin, the plan and the outlet's details.",
				"The Financial Head and the Ops Head can post, withdraw and close shifts, log sales, rate PRs, request cut loss and edit “Workspace”; “Settings” and “Subscription” are view-only for them.",
				"A Director sees every page read-only. A person's role is set separately at each outlet.",
			],
		},
		zh: {
			title: "门店各角色能做什么？",
			lines: [
				"东主和担保人可以做所有事 —— 团队、经纪公司合作、签到定位点、套餐和门店资料。",
				"财务主管和运营主管可以发布、撤回和结束班次，录入销售，给 PR 评分，申请减损，编辑工作区；「设置」和「订阅」对他们只读。",
				"总监对所有页面只读。每个人的角色按门店分别设定。",
			],
		},
	},
	{
		id: "ref-outlet-add-staff",
		role: "outlet",
		asks: [
			"invite a team member",
			"how to add my manager into outlet ah",
			"cannot invite as owner leh",
			"jemput ahli pasukan outlet",
			"pautan jemputan tamat tempoh",
			"怎么邀请同事加入门店",
			"怎么添加门店员工",
			"邀请链接多久过期",
		],
		en: {
			title: "How do I add someone to my outlet's team?",
			lines: [
				"The person needs an InnocenZ account first. On the sign-up page they tap “Sign up as a team member” and can ask to join your outlet with a role.",
				"Or the Owner or Guarantor uses “Settings” → “Invite a team member”: type the email of their account, pick a role and tap “Invite”. They accept while signed in; the link lasts 7 days.",
				"Owner and Guarantor cannot be invited — invite as Financial Head, Ops Head or Director, then change the role once they join.",
			],
		},
		zh: {
			title: "怎么把人加入门店团队？",
			lines: [
				"对方需要先有 InnocenZ 账号。在注册页点「注册为团队成员」，并可申请以某个角色加入你的门店。",
				"或者由东主或担保人在「设置」→「邀请团队成员」填写对方账号的邮箱，选择角色并点「发送邀请」。对方需登录后接受；链接 7 天内有效。",
				"东主和担保人不能被邀请 —— 请先以财务主管、运营主管或总监邀请，加入后再更改角色。",
			],
		},
	},
	{
		id: "ref-outlet-join-approvals",
		role: "outlet",
		asks: [
			"approve someone who asked to join",
			"staff ask to join outlet how approve ah",
			"who can approve join request one",
			"macam mana luluskan staf yang mohon join",
			"怎么审批申请加入门店的人",
			"有人申请加入在哪里批准",
			"拒绝加入申请",
		],
		en: {
			title: "How do I approve someone who asked to join?",
			lines: [
				"People who asked to join appear on “Approvals” under “Waiting”. Pick the “Role to grant” — it starts on the role they asked for — then tap “Approve” or “Decline”.",
				"Everyone on the team can see the queue, but only the Owner or Guarantor can decide.",
				"The “Declined” and “Deactivated” tabs show who decided and when.",
			],
		},
		zh: {
			title: "怎么审批申请加入的人？",
			lines: [
				"申请加入的人会出现在「审批」的「待审批」里。选择「授予职位」（默认是对方申请的职位），再点「通过」或「拒绝」。",
				"团队里每个人都能看到这个列表，但只有东主或担保人可以决定。",
				"「已拒绝」和「已停用」分页会显示由谁、在何时决定。",
			],
		},
	},
	{
		id: "ref-outlet-remove-member",
		role: "outlet",
		asks: [
			"remove a team member",
			"change a member role at my outlet",
			"reactivate removed staff",
			"staff resign how to remove ah",
			"accidentally removed staff can bring back or not",
			"tukar peranan ahli outlet",
			"怎么移除门店成员",
			"怎么恢复被移除的成员",
			"更改成员角色",
		],
		en: {
			title: "How do I change a role, remove someone or bring them back?",
			lines: [
				"In “Settings” → “Team”, the Owner or Guarantor can change a member's role (any role except Owner); it changes only at this outlet.",
				"“Remove” takes their access away at once; they stay listed as inactive. You cannot remove yourself or leave the outlet without an active Owner.",
				"To bring someone back, open “Approvals” → “Deactivated”, choose the role they return as, and tap “Reactivate member”.",
			],
		},
		zh: {
			title: "怎么更改角色、移除成员或恢复成员？",
			lines: [
				"在「设置」→「团队」，东主或担保人可以更改成员的角色（东主除外）；只会改变在本门店的角色。",
				"「移除」会立即取消对方的访问权限，对方仍以停用状态列出。你不能移除自己，也不能让门店没有在职的东主。",
				"要恢复成员，打开「审批」→「已停用」，选择对方恢复后的职位，再点「恢复成员」。",
			],
		},
	},
	{
		id: "ref-outlet-change-plan",
		role: "outlet",
		asks: [
			"how to change subscription plan",
			"upgrade my plan",
			"switch plan stuck awaiting admin ah",
			"why cannot switch plan lah, got unpaid bill",
			"macam mana tukar pakej langganan",
			"nak upgrade pakej outlet",
			"怎么更换订阅套餐",
			"升级套餐差价怎么收",
			"为什么换不了套餐",
		],
		en: {
			title: "How do I change my subscription plan?",
			lines: [
				"On “Subscription”, the Owner or Guarantor taps “Switch to …” on a plan card. It goes to the InnocenZ team as a request, and you stay on your plan, marked “Awaiting admin”, until it is approved.",
				"A switch is blocked while any bill is unpaid, or when your busiest day already has more requested PRs than the smaller plan allows.",
				"Because every bill must be paid first, a dearer plan adds a bill for the difference on the current period, and a cheaper plan's difference is taken off your next bill. The difference is for the whole period, not counted by days.",
			],
		},
		zh: {
			title: "怎么更换订阅套餐？",
			lines: [
				"东主或担保人在「订阅」页的套餐卡片上点「切换到 …」。申请会发给 InnocenZ 团队，获批前你仍使用原套餐，并显示「等待管理员处理」。",
				"只要有未付账单，或你最忙那天请求的 PR 已超过较小套餐的上限，就不能切换。",
				"由于切换前所有账单都必须已付，换到更贵的套餐会为本期另开一张差价账单；换到更便宜的套餐，差价会从下一张账单中扣除。差价按整个计费周期计算，不按天数折算。",
			],
		},
	},
	{
		id: "ref-outlet-bills",
		role: "outlet",
		asks: [
			"how to pay innocenz bill",
			"subscription overdue banner",
			"can pay by credit card",
			"how to pay subscription ah, card cannot use",
			"outlet subscription bill due when lah",
			"macam mana bayar bil langganan",
			"怎么支付InnocenZ账单",
			"订阅费逾期了怎么办",
			"可以用信用卡付吗",
		],
		en: {
			title: "How do I see and pay my InnocenZ bills?",
			lines: [
				"“Subscription” → “Payment history” shows one row per billing period: amount, due date and “Paid”, “Unpaid” or “Overdue”, with a numbered receipt once paid.",
				"Outlets are billed monthly, and a period is due 7 days after it ends. “Today” shows a “Subscription due” banner, which turns red as “Subscription overdue”.",
				"Only the Owner sees the payment options on “Subscription”; the Guarantor and other roles see only what is paid and unpaid.",
				"A credit or debit card can't be used yet: “Set up automatic payment” (“Debit / credit card”) under “Payment method”, and paying by FPX or e-wallet, are shown but not connected. Pay by bank transfer instead — the InnocenZ team marks the period paid once your transfer arrives. Message our team for the payment details.",
			],
		},
		zh: {
			title: "怎么查看和支付 InnocenZ 账单？",
			lines: [
				"「订阅」→「付款记录」每个计费周期一行：金额、到期日，以及「已付款」「未付款」或「已逾期」，付款后会有编号收据。",
				"门店按月计费，每个周期在结束后 7 天到期。「今天」页会显示「订阅费待付」横幅，逾期后变红并显示「订阅费已逾期」。",
				"只有东主能看到「订阅」页上的付款选项；担保人和其他角色只能看到哪些已付、哪些未付。",
				"目前还不能用信用卡或借记卡付款：「付款方式」里的「设置自动扣款」（「借记卡 / 信用卡」）以及 FPX 或电子钱包付款虽然可见，但尚未接入。请以银行转账支付 — 收到转账后，InnocenZ 团队会把该周期标记为已付款。付款资料请联系我们的团队。",
			],
		},
	},
	{
		id: "ref-outlet-pos",
		role: "outlet",
		asks: [
			"pos integration",
			"connect my pos system",
			"how much is pos integration",
			"can link with our pos or not ah",
			"how to request pos quote lah",
			"boleh sambung sistem POS tak",
			"harga integrasi POS",
			"可以对接POS系统吗",
			"POS对接怎么收费",
			"收银系统可以连接吗",
		],
		en: {
			title: "Can I ask about a POS integration?",
			lines: [
				"On “Subscription”, the “Integrate with POS” card has no listed price: the Owner or Guarantor taps “Request admin quote” and the InnocenZ team contacts you to agree one.",
				"Once agreed, that monthly price is billed on top of your plan. You can “Ask for a new price” or ask to cancel POS later; both go to the InnocenZ team.",
				"A request waiting for an answer can be withdrawn with “Cancel request”.",
			],
		},
		zh: {
			title: "可以咨询 POS 系统对接吗？",
			lines: [
				"「订阅」页的「接入 POS 系统」卡片不标价：东主或担保人点「向管理员索取报价」，InnocenZ 团队会联系你议定价格。",
				"议定后，这笔月费在套餐之外另行计费。之后你可以「申请新价格」或申请取消 POS，两者都会交给 InnocenZ 团队处理。",
				"等待答复中的申请可以用「撤回申请」撤回。",
			],
		},
	},
	{
		id: "ref-outlet-pay-agency",
		role: "outlet",
		asks: [
			"do i pay the agency through innocenz",
			"pay agency in the app",
			"agency payment i settle through innocenz or direct ah",
			"innocenz collect payment for agency or not",
			"bayar agensi melalui innocenz ke",
			"macam mana bayar agensi",
			"我要通过InnocenZ付钱给经纪公司吗",
			"怎么付钱给经纪公司",
		],
		en: {
			title: "Do I pay the agency through InnocenZ?",
			lines: [
				"No. InnocenZ does not take or send money for PR work: you settle what you owe for PRs with your agency directly.",
				"Your “Subscription” bills are only for InnocenZ itself.",
			],
		},
		zh: {
			title: "我通过 InnocenZ 付钱给经纪公司吗？",
			lines: [
				"不。InnocenZ 不经手 PR 工作的任何款项：PR 费用由你直接与经纪公司结算。",
				"「订阅」里的账单只是 InnocenZ 本身的费用。",
			],
		},
	},
	{
		id: "ref-outlet-no-penalties",
		role: "outlet",
		asks: [
			"can i fine late pr",
			"penalty for absent pr",
			"pr late can fine or not ah",
			"where to set penalty for no show lah",
			"potong gaji PR tak datang",
			"PR迟到可以罚款吗",
			"PR缺勤可以扣钱吗",
		],
		en: {
			title: "Can I fine PRs who are late or absent?",
			lines: [
				"No. Attendance and penalty rules belong to the agency, because any fine is taken from the agency's payment to its PR.",
				"“Workspace” holds only your tier rates, the two price lists and happy hour. Raise attendance problems with the agency, and use ratings to tell them how a PR did.",
			],
		},
		zh: {
			title: "我可以对迟到或缺勤的 PR 罚款吗？",
			lines: [
				"不可以。出勤与处罚规则属于经纪公司，因为任何罚款都从经纪公司付给 PR 的款项中扣除。",
				"「工作区」只有等级费率、两份价目表和欢乐时段。出勤问题请与经纪公司沟通，并用评分告诉他们 PR 的表现。",
			],
		},
	},
	{
		id: "ref-outlet-swaps",
		role: "outlet",
		asks: [
			"move pr to another venue",
			"transfer pr to my other outlet",
			"can send pr to my other branch ah",
			"want change pr to other shop can or not",
			"pindahkan PR ke cawangan lain",
			"可以把PR调到别的场所吗",
			"PR能换去另一间店吗",
		],
		en: {
			title: "Can I move a PR to another venue?",
			lines: [
				"No. Which PR works which shift is the agency's decision, not the venue's. Your “Today” and “Calendar page” show who is booked on your shifts.",
			],
		},
		zh: {
			title: "我可以把 PR 调到别的场所吗？",
			lines: [
				"不可以。哪位 PR 上哪个班次由经纪公司决定，而不是门店。你的「今天」和「日历」会显示谁被安排在你的班次上。",
			],
		},
	},
	{
		id: "ref-outlet-settings-account",
		role: "outlet",
		asks: [
			"edit outlet name and logo",
			"change login email for outlet",
			"how to change my password ah outlet",
			"update outlet address and logo lah",
			"tukar kata laluan akaun outlet",
			"怎么修改门店资料",
			"怎么改登录邮箱",
			"更换门店标志",
		],
		en: {
			title: "How do I change the outlet's details or my login?",
			lines: [
				"“Settings” shows the outlet name, owner, mobile, email, address and logo, with a status line such as “Verified · outlet active”.",
				"The Owner or Guarantor edits the outlet name, owner display name, address and logo (with crop).",
				"Everyone manages their own login under “Login & security”: change your password with your current password plus a code, or change your email or phone with your current password plus a code sent to the new one.",
			],
		},
		zh: {
			title: "怎么修改门店资料或我的登录信息？",
			lines: [
				"「设置」显示门店名称、负责人、手机号码、电子邮箱、地址和标志，并有状态行，例如「已验证 · 门店启用中」。",
				"东主或担保人可以修改门店名称、负责人显示名称、地址和标志（可裁剪）。",
				"每个人在「登录与安全」管理自己的登录：修改密码需输入当前密码和验证码；修改邮箱或手机号需输入当前密码，再输入发送到新邮箱或新号码的验证码。",
			],
		},
	},
	{
		id: "ref-outlet-multi-org",
		role: "outlet",
		asks: [
			"switch between outlets",
			"i manage two outlets how to switch",
			"choose your organisation screen",
			"after login how to switch to my other outlet ah",
			"work at 2 outlet how to switch organisation lah",
			"saya kerja di dua outlet macam mana tukar",
			"我在多家门店工作怎么切换",
			"怎么切换到另一家门店",
		],
		en: {
			title: "I work at more than one outlet — how do I switch?",
			lines: [
				"At sign-in, someone in more than one organisation sees “Choose your organisation” and picks one; the portal then shows only that one's people, shifts and money.",
				"To work in another, sign out and sign in again. Your role can be different at each.",
			],
		},
		zh: {
			title: "我在多家门店工作，怎么切换？",
			lines: [
				"隶属于多个机构的人登录时会看到「选择您的机构」并选择其一；门户随后只显示该机构的人员、班次与款项。",
				"如需前往其他机构，请退出后重新登录。你在每个机构的角色可以不同。",
			],
		},
	},
	{
		id: "ref-shared-outlet-plans",
		role: "outlet",
		asks: [
			"how much does an outlet plan cost per month",
			"outlet subscription price",
			"essential plan rm 999",
			"outlet package how much ah",
			"berapa harga pakej outlet",
			"yuran langganan outlet sebulan",
			"门店套餐多少钱",
			"门店月费多少",
			"每天几个PR的套餐价格",
		],
		en: {
			title: "How much does an outlet plan cost?",
			lines: [
				"The “Pricing” section on this page, “Outlet” tab, prices plans per month by PRs booked per day.",
				"“Essential” 5 PRs/day RM 999 · “Plus” 6–10 RM 1,699 · “Pro” 11–25 RM 2,999 (“Popular”) · “Enterprise” 26–50 RM 3,999 · “Scale” 51–100 RM 6,999 · “Premier” 101+ RM 9,999.",
				"The plan is picked at sign-up in “Package to enroll”, which lists the current plans. “Post Job” refuses a day beyond the plan's PRs per day and says how many are left.",
			],
		},
		zh: {
			title: "门店套餐多少钱？",
			lines: [
				"本页「定价」部分的「门店」标签，按每天预订的 PR 人数按月定价。",
				"「Essential」5 PR/天 RM 999 ·「Plus」6–10 RM 1,699 ·「Pro」11–25 RM 2,999（「热门」）·「Enterprise」26–50 RM 3,999 ·「Scale」51–100 RM 6,999 ·「Premier」101+ RM 9,999。",
				"注册时在「注册套餐」选择套餐，列表显示当前的套餐。「发布职位」会拒绝超过套餐每日 PR 人数的日子，并提示还剩多少名额。",
			],
		},
	},
	{
		id: "ref-outlet-do-i-pay-the-prs-myself",
		role: "outlet",
		asks: [
			"do i pay prs myself",
			"can i see pr payment voucher",
			"i need pay the pr direct or not ah",
			"PR的薪水是我直接付吗",
			"谁给PR出粮",
			"我可以看PR的薪资单吗",
		],
		en: {
			title: "Do I pay the PRs myself?",
			lines: [
				"No. Each PR is paid by their agency, from the agency's own bank, against a weekly payment voucher (Sunday to Saturday) that the agency and the PR both sign.",
				"You set each tier's daily wage and commission rates in “Workspace” → “Rates by PR tier”, and “Reports” shows what your PRs cost you.",
				"What you owe for the PRs' work you settle with the agency directly, outside InnocenZ — InnocenZ does not take or send that money.",
				"You never see a PR's voucher, fines or cancellation fees — pay between an agency and its PRs stays between them.",
			],
		},
		zh: {
			title: "PR 的薪水是我直接付吗？",
			lines: [
				"不是。每位 PR 由所属经纪公司从自己的银行付款，依据的是经纪公司和 PR 双方签名的每周薪资单（周日至周六）。",
				"你在「工作区」→「按 PR 等级的费率」设定各等级的日薪和抽成比例，「报表」会显示 PR 的成本。",
				"PR 工作的费用由你直接与经纪公司结算，不经过 InnocenZ — InnocenZ 不收也不转这笔钱。",
				"你看不到 PR 的薪资单、罚款或取消费 — 经纪公司与 PR 之间的薪资只属于他们双方。",
			],
		},
	},
	{
		id: "ref-outlet-can-i-order-transport-makeup-or-other-se",
		role: "outlet",
		asks: [
			"can i book transport for pr",
			"order makeup service",
			"innocenz got transport or makeup",
			"can book driver for pr ah",
			"makeup artist can order through app or not",
			"boleh tempah pengangkutan",
			"boleh order solekan untuk PR",
			"可以预订交通吗",
			"可以通过InnocenZ订化妆服务吗",
		],
		en: {
			title:
				"Can I order transport, makeup or other services through InnocenZ?",
			lines: [
				"No. Ordering add-on services such as transport or makeup is not available in InnocenZ.",
				"For outlets, InnocenZ covers booking PRs, seeing their attendance, your tier rates and price lists, reports, ratings and your subscription. For anything else, message the InnocenZ team on WhatsApp.",
			],
		},
		zh: {
			title: "可以通过 InnocenZ 预订交通、化妆等服务吗？",
			lines: [
				"不可以。InnocenZ 不提供预订交通、化妆等增值服务。",
				"门店可以在 InnocenZ 订 PR、查看出勤、设定等级费率和价目表、查看报表、评价 PR 以及管理订阅。其他需求请通过 WhatsApp 联系 InnocenZ 团队。",
			],
		},
	},
	/* ---------- Everyone — joining, accounts, money, privacy ---------- */
	{
		id: "ref-shared-org-signup",
		role: "any",
		asks: [
			"how to register my outlet or agency company",
			"what documents to register an outlet or pr agency, ssm and business licence",
			"want to register my club as outlet how ah, need ssm and licence?",
			"sign up as outlet or pr agency where ah, the account type one",
			"macam mana nak daftar syarikat outlet atau agensi PR",
			"nak daftar syarikat outlet kena ada lesen perniagaan dan nombor SSM",
			"门店怎么注册账户，要SSM号码和营业执照吗",
			"经纪公司注册要准备什么资料，营业执照和负责人资料",
			"公司注册账户类型选门店还是PR代理",
		],
		en: {
			title: "How does an outlet or agency sign up?",
			lines: [
				"The owner taps “Login” at the top of this page, then “Sign up as Outlet or PR Agency”, and picks “Outlet” or “PR Agency” under “Account type”.",
				"The form asks for the company's SSM number, business licence and address, the person in charge's IC or passport, a +60 contact number, a login email, a password (8+ characters), a plan and a logo.",
				"The owner verifies the login email with a 6-digit code, ticks the four acknowledgements and taps “Create account”.",
			],
		},
		zh: {
			title: "门店或经纪公司怎么注册？",
			lines: [
				"东主点本页顶部的「登录」，再点「注册为门店或 PR 经纪公司」，在「账户类型」选择「门店」或「PR 代理」。",
				"表格需要公司的 SSM 注册号、营业执照和地址、负责人的身份证或护照、+60 联系电话、登录邮箱、密码（至少 8 个字符）、套餐和标志。",
				"东主用 6 位验证码验证登录邮箱，勾选四项确认事项，再点「创建账户」。",
			],
		},
	},
	{
		id: "ref-shared-after-signup",
		role: "any",
		asks: [
			"already sign up why portal only got settings page ah",
			"注册成功后还要等审核吗，门户只有设置",
			"注册后几时开通，要等审核多久",
			"获批当天才开始计费吗",
		],
		en: {
			title: "What happens after an outlet or agency signs up?",
			lines: [
				"The screen says “Registration successful”: the account now waits for the InnocenZ team to review and approve it.",
				"The owner can sign in at once, but until approval the portal shows only “Settings”, for updating the profile.",
				"On approval the owner receives an email that the portal is open, and every page the role allows unlocks.",
				"Billing starts on the day of approval, not the day of sign-up.",
			],
		},
		zh: {
			title: "门店或经纪公司注册后会怎样？",
			lines: [
				"页面显示「注册成功」：账户随后等待 InnocenZ 团队审核批准。",
				"东主可以马上登录，但在获批之前门户只显示「设置」，用于更新资料。",
				"获批后东主会收到门户已开通的邮件，该职位可用的所有页面随即开放。",
				"计费从获批当天开始，而不是注册当天。",
			],
		},
	},
	{
		id: "ref-shared-team-signup",
		role: "any",
		asks: [
			"im staff at a club, how do i join the outlet's existing account",
			"sign up as a team member, which role can i ask for",
			"staff want to join our agency portal, can ask for owner role or not ah",
			"join as team member but pick i will be invited later, can ah",
			"staf macam mana nak sertai outlet sebagai ahli pasukan",
			"staf daftar sebagai ahli pasukan, boleh minta jawatan finance atau ops head tak",
			"员工怎么加入已经注册的门店或经纪公司",
			"注册为团队成员可以申请什么职位，运营主管可以吗",
			"员工加入团队可以申请东主职位吗",
		],
		en: {
			title: "How do staff join an existing outlet or agency?",
			lines: [
				"Staff don't register a company: on the sign-up page they tap “Sign up as a team member”.",
				"They give their name, an email verified with a 6-digit code and a password (6+ characters), then pick the outlet or agency and the “Role you are asking for” — or “I will be invited later”.",
				"An agency can be asked for Finance or Director; an outlet for Finance, Director or Ops Head. The owner role cannot be requested.",
				"Nothing opens until the owner approves; meanwhile they can sign in and see “Waiting for approval”.",
			],
		},
		zh: {
			title: "员工怎么加入已有的门店或经纪公司？",
			lines: [
				"员工不需要注册公司：在注册页点「注册为团队成员」。",
				"填写姓名、用 6 位验证码验证的邮箱和密码（至少 6 个字符），再选择门店或经纪公司及「申请的职位」— 或选「稍后由机构邀请我」。",
				"向经纪公司可申请财务或董事；向门店可申请财务、董事或运营主管。东主职位不能申请。",
				"东主批准前不会开放任何页面；其间可以登录，会看到「等待审批」。",
			],
		},
	},
	{
		id: "ref-shared-team-approve",
		role: "any",
		asks: [
			"where do i approve a staff join request as owner",
			"how to invite a team member from settings",
			"my staff request to join already, where to approve ah, role to grant",
			"invite staff who has no account yet can or not",
			"东主在哪里批准新成员加入，授予职位",
			"怎么邀请员工加入团队，对方要先有账号吗",
			"东主怎么批准或拒绝员工的加入申请",
		],
		en: {
			title: "How does an owner add or approve team members?",
			lines: [
				"Join requests wait on “Approvals” — under “New member” for an agency, on the outlet's own “Approvals” page. The owner picks the “Role to grant”, then taps “Approve” or “Decline”.",
				"To invite instead, the owner uses “Invite a team member” in “Settings”; the person must already have an InnocenZ account and accepts the emailed invitation.",
				"Removing a member ends their access at once; an organisation always keeps at least one owner.",
			],
		},
		zh: {
			title: "东主怎么添加或批准团队成员？",
			lines: [
				"加入申请在「审批」等待 — 经纪公司在「新成员」下，门店在自己的「审批」页面。东主选择「授予职位」，再点「通过」或「拒绝」。",
				"如要邀请，东主在「设置」使用「邀请团队成员」；对方必须已有 InnocenZ 账号，并在邮件中接受邀请。",
				"移除成员会立即取消其访问权限；机构始终至少保留一位东主。",
			],
		},
	},
	{
		id: "ref-shared-roles",
		role: "any",
		asks: [
			"what can a guarantor do compared to the owner",
			"is the director role view only",
			"financial head can do payroll and assign pr or not ah",
			"ops head and financial head can post job or not ah",
			"jawatan financial head dan ops head boleh buat apa",
			"担保人和东主有什么区别",
			"担保人可以做什么，总监只能查看吗",
			"运营主管和财务主管的权限有什么不同",
		],
		en: {
			title: "What can each team role do?",
			lines: [
				"“Owner” runs everything, including the team and the plan. “Guarantor” stands in for the owner everywhere except paying InnocenZ. “Director” is view-only on both portals.",
				"Agency “Financial Head”: payroll and vouchers, and assigning PRs on the roster; PR approvals, MC/leave and the team stay with the owner.",
				"Outlet “Financial Head” and “Ops Head”: Post Job, the Workspace, sales and cut-loss requests; “Settings”, the plan and the team stay with the owner.",
			],
		},
		zh: {
			title: "团队各职位能做什么？",
			lines: [
				"「东主」管理一切，包括团队和套餐。「担保人」在付款给 InnocenZ 以外的所有事项上代替东主。「总监」在两个门户都只能查看。",
				"经纪公司「财务主管」：薪资和薪资单，以及在排班表上分配 PR；PR 审批、病假/请假和团队仍由东主负责。",
				"门店「财务主管」和「运营主管」：「发布职位」、「工作区」、销售和缺班损失申请；「设置」、套餐和团队仍由东主负责。",
			],
		},
	},
	{
		id: "ref-shared-choose-org",
		role: "any",
		asks: [
			"i work at two outlets, how do i switch organisation",
			"what is the choose your organisation screen after login",
			"i got two agency account, how to change organisation ah",
			"owner at one venue but no owner rights at the other one, why ah",
			"saya kerja di dua outlet, macam mana nak tukar organisasi",
			"我在两家门店工作，怎么切换机构",
			"登录后显示选择您的机构，怎么换到另一家公司",
			"我在两家经纪公司都有职位，怎么切换机构",
		],
		en: {
			title: "What if I work for more than one organisation?",
			lines: [
				"After signing in, someone in two or more agencies or outlets sees “Choose your organisation”, with each one's logo and their role there.",
				"The portal then shows only that organisation's people, shifts and money; to work in another, sign out and sign in again.",
				"A role belongs to one organisation: being owner at one venue gives no owner rights at another.",
			],
		},
		zh: {
			title: "如果我在多个机构工作怎么办？",
			lines: [
				"隶属于两个或以上经纪公司或门店的人，登录后会看到「选择您的机构」，显示每个机构的标志和自己在那里的职位。",
				"门户随后只显示该机构的人员、班次与款项；如需前往其他机构，请退出后重新登录。",
				"职位只属于一个机构：在一家门店是东主，不代表在另一家也有东主权限。",
			],
		},
	},
	{
		id: "ref-shared-sign-in",
		role: "any",
		asks: [
			"where do i log in, with email or phone number",
			"do prs sign in with phone number or email",
			"how to log out or sign out of innocenz",
			"outlet login use email ah, pr login use phone number?",
			"怎么登录门户，用邮箱还是手机号登录",
			"输错密码5次登录会被锁多久，怎么退出登录",
		],
		en: {
			title: "How do I sign in?",
			lines: [
				"Outlet, agency and team accounts sign in on the web “Login” page with their email and password.",
				"PRs sign in on the InnocenZ phone app with their phone number and password.",
				"After 5 wrong passwords, sign-in locks for 15 minutes and the message says how many minutes are left.",
				"“Sign out” in the portal, or in the app's “Profile”, ends the session on that device.",
			],
		},
		zh: {
			title: "怎么登录？",
			lines: [
				"门店、经纪公司和团队成员在网页「登录」页用邮箱和密码登录。",
				"PR 在 InnocenZ 手机 App 用手机号码和密码登录。",
				"连续输错 5 次密码会锁定登录 15 分钟，提示会显示剩余分钟数。",
				"在门户或 App 的「我的」点「退出登录」，即可结束该设备上的登录。",
			],
		},
	},
	{
		id: "ref-shared-cant-sign-in",
		role: "any",
		asks: [
			"why does it say this account is inactive",
			"login says you cannot access this web portal",
			"cannot login leh, keep say wrong password",
			"why my login show organisation inactive ah",
			"为什么登录不了，显示该账户已停用",
			"登不进去，说您无法访问此网页门户",
		],
		en: {
			title: "Why can't I sign in?",
			lines: [
				"“Wrong email or password” (“Wrong phone number or password” in the app): check both, or reset with “Forgot password?” — a reset also lifts a sign-in lock.",
				"“This account is inactive.” means the login is switched off; a message that your organisation is inactive means InnocenZ switched it off — contact InnocenZ.",
				"“You cannot access this web portal”: the account has no web portal — PRs use the app.",
				"“Waiting for approval”: the organisation you asked to join hasn't approved you yet; sign in again once it has.",
			],
		},
		zh: {
			title: "为什么登录不了？",
			lines: [
				"「邮箱或密码错误」（App 中为「手机号码或密码错误」）：请核对两者，或用「忘记密码？」重设 — 重设也会解除登录锁定。",
				"「该账户已停用。」表示该登录已被停用；提示你的机构已停用，表示 InnocenZ 已停用该机构 — 请联系 InnocenZ。",
				"「您无法访问此网页门户」：该账号没有网页门户 — PR 请使用 App。",
				"「等待审批」：你申请加入的机构尚未批准你；批准后重新登录即可。",
			],
		},
	},
	{
		id: "ref-shared-forgot",
		role: "any",
		asks: [
			"forgot my password how do i reset it",
			"where is the forgot password button",
			"i forgot password already, how to reset ah",
			"reset kata laluan, kod dihantar ke whatsapp ke emel",
			"忘记密码怎么办",
			"密码忘了怎么重设",
		],
		en: {
			title: "I forgot my password — what do I do?",
			lines: [
				"Tap “Forgot password?” on the web sign-in page or in the PR app, type the email or phone number on the account, and tap “Send code”.",
				"A 6-digit code goes to the WhatsApp number and the email on that account. It works for 10 minutes and 5 tries; a new one can be sent after 60 seconds.",
				"Enter the code and a new password. The reset also lifts a sign-in lock and signs the account out on other devices.",
			],
		},
		zh: {
			title: "忘记密码怎么办？",
			lines: [
				"在网页登录页或 PR App 点「忘记密码？」，输入账号绑定的邮箱或手机号，再点「发送验证码」。",
				"6 位验证码会发送到该账号的 WhatsApp 号码和邮箱，10 分钟内有效，可尝试 5 次；60 秒后可重新发送。",
				"输入验证码和新密码。重设密码同时会解除登录锁定，并让该账号在其他设备上退出登录。",
			],
		},
	},
	{
		id: "ref-shared-codes",
		role: "any",
		asks: [
			"where will the verification code be sent, whatsapp or email",
			"otp go to whatsapp or email ah",
			"kod pengesahan dihantar ke mana, emel atau whatsapp",
			"kod OTP sah berapa minit, bila boleh hantar semula kod",
			"验证码会发到哪里，邮箱还是WhatsApp",
			"验证码多久过期，多久可以重新发送",
		],
		en: {
			title: "Where do verification codes arrive?",
			lines: [
				"Every InnocenZ code has 6 digits and works for 10 minutes; after 5 wrong tries a new code is needed, and one can be resent after 60 seconds.",
				"A PR signing up gets the code on WhatsApp (and by email if one was given), so the phone number must be on WhatsApp.",
				"Outlet, agency and team sign-ups get an emailed code. Password-change codes go to the account's phone and email; email or phone changes send it to the new address or number.",
				"Nothing arrived? Check WhatsApp and the email spam folder, and that it is the email or number on the account.",
			],
		},
		zh: {
			title: "验证码会发到哪里？",
			lines: [
				"InnocenZ 的所有验证码都是 6 位，10 分钟内有效；输错 5 次需要重新获取，60 秒后可重新发送。",
				"PR 注册时验证码发到 WhatsApp（如填写了邮箱也会发邮件），所以手机号码必须已注册 WhatsApp。",
				"门店、经纪公司和团队成员注册时验证码通过邮件发送。修改密码的验证码发到账号的手机和邮箱；更换邮箱或手机号时发到新的邮箱或号码。",
				"没收到？请查看 WhatsApp 和邮箱的垃圾邮件文件夹，并确认是账号绑定的邮箱或号码。",
			],
		},
	},
	{
		id: "ref-shared-security",
		role: "any",
		asks: [
			"how to change my login email",
			"where is security settings to change password",
			"can my agency change my sign in phone number for me",
			"want to change phone number how ah, need code?",
			"change password need current password or not",
			"macam mana nak tukar emel atau nombor telefon akaun",
			"怎么修改登录邮箱或手机号",
			"在哪里改密码，安全设置在哪",
		],
		en: {
			title: "How do I change my password, email or phone?",
			lines: [
				"Web: “Settings” → “Security settings”. PR app: “Profile” → “Security settings”.",
				"“Change password” needs the current password plus a code sent to the account's phone and email.",
				"“Change email” or “Change phone” needs the current password plus a code sent to the new email or number.",
				"Afterwards the account is signed out on its other devices. Only the account holder can change their sign-in email or phone — an agency cannot.",
			],
		},
		zh: {
			title: "怎么修改密码、邮箱或手机号？",
			lines: [
				"网页：「设置」→「安全设置」。PR App：「我的」→「安全设置」。",
				"「修改密码」需要当前密码，再输入发送到账号手机和邮箱的验证码。",
				"「修改邮箱」/「修改手机号」（App 中为「更换电子邮箱」/「更换手机号」）需要当前密码，再输入发送到新邮箱或新号码的验证码。",
				"修改后，该账号会在其他设备上退出登录。只有账号本人可以更改自己的登录邮箱或手机号 — 经纪公司不能代改。",
			],
		},
	},
	{
		id: "ref-shared-language",
		role: "any",
		asks: [
			"how to change the language to chinese",
			"is there a chinese version of the portal",
			"can the app show traditional chinese",
			"can switch to chinese language or not ah",
			"where to change english to 中文 ah",
			"怎么切换成中文",
			"App可以换成繁体中文吗",
			"语言怎么改成英文",
		],
		en: {
			title: "How do I switch between English and 中文?",
			lines: [
				"This page: “Language” in the top menu → English or Simplified Chinese.",
				"Web portals: the “EN / 中文” switch in the sidebar or on the sign-in page; the choice is saved to the account and follows the person to another computer.",
				"PR app: English, 简体中文 or 繁體中文, switchable on the sign-in, sign-up and “Profile” screens; it starts in the phone's own language.",
			],
		},
		zh: {
			title: "怎么切换英文和中文？",
			lines: [
				"本页：顶部菜单的「语言」→ English 或「简体中文」。",
				"网页门户：侧边栏或登录页的「EN / 中文」切换；选择会保存到账号，换一台电脑也一样。",
				"PR App：English、简体中文或繁體中文，可在登录、注册和「我的」页面切换；默认跟随手机语言。",
			],
		},
	},
	{
		id: "ref-shared-bell",
		role: "any",
		asks: [
			"where is the bell notification list",
			"how to mark all notifications as read",
			"how i know got new notification ah, the bell icon?",
			"铃铛通知在哪里看，未读数字",
			"怎么把通知全部标为已读",
		],
		en: {
			title: "How am I told when something happens?",
			lines: [
				"The bell at the top of each portal and of the PR app lists your own notices, newest first; its badge shows how many are unread and refreshes about every minute.",
				"Tapping a notice marks it read and, where it fits, opens the related screen. The PR app also has “Mark all read”.",
				"Notices go to the person they concern — for example, billing notices go to the owner and Financial Head.",
			],
		},
		zh: {
			title: "发生事情时我怎么收到通知？",
			lines: [
				"每个门户和 PR App 顶部的铃铛列出你自己的通知，最新的在前；角标显示未读数量，大约每分钟刷新。",
				"点一条通知会标为已读，并在适用时打开相关页面。PR App 还有「全部已读」。",
				"通知只发给相关的人 — 例如账单通知发给东主和财务主管。",
			],
		},
	},
	{
		id: "ref-shared-notify-what",
		role: "any",
		asks: [
			"what notifications do pr, agency and outlet each get",
			"which notices go to the pr vs the agency vs the outlet",
			"does the agency get notified when a pr drops out and needs cover",
			"outlet and agency each get notification for what ah",
			"apa notifikasi yang PR, agensi dan outlet masing-masing dapat",
			"outlet dapat notifikasi pasal apa, agensi pula pasal apa",
			"PR、经纪公司和门店各会收到哪些通知",
			"门店会收到什么通知，经纪公司呢",
			"PR被排上或移出班次会收到通知吗",
		],
		en: {
			title: "What does each side get notified about?",
			lines: [
				"PR: being put on or taken off a shift, early release, the agency's answer to a join, MC/leave or overtime request, the weekly voucher being ready or paid, dispute results, and agency notices.",
				"Agency: a PR dropping out (cover needed), MC/leave requests, overtime to decide, a venue's cut-loss request, vouchers held back, the weekly plan statement and each new bill.",
				"Outlet: the agency's answer to a cut-loss request, and each new bill.",
			],
		},
		zh: {
			title: "各方会收到哪些通知？",
			lines: [
				"PR：被排上或移出班次、提早下班、经纪公司对加入、病假/请假或加班申请的答复、每周薪资单已出或已付款、争议结果，以及经纪公司发出的通知。",
				"经纪公司：PR 临时退出（需要补位）、病假/请假申请、待处理加班、门店的缺班损失申请、被暂扣的薪资单、每周套餐结算通知和每张新账单。",
				"门店：经纪公司对缺班损失申请的答复，以及每张新账单。",
			],
		},
	},
	{
		id: "ref-shared-privacy-outlet",
		role: "any",
		asks: [
			"can the outlet see my ic number",
			"does the venue see a pr's home address or bank details",
			"can an outlet open the pr's payment voucher",
			"outlet side can see where exactly i check in or not",
			"门店能看到PR的身份证号码吗",
			"门店看得到我的住址、银行资料和罚款吗",
		],
		en: {
			title: "What can an outlet see about PRs?",
			lines: [
				"An outlet sees the PRs booked and working at its venue — name and nickname, tier, comcard and portfolio photos, age, height and languages — with their attendance status, and can rate them after a shift.",
				"It never receives a PR's IC or passport number, date of birth, home address, bank details, ID or MC photos, fines or cancellation fees, or the exact spot where they checked in.",
				"It cannot open PRs' payment vouchers — pay between an agency and its PRs stays between them.",
			],
		},
		zh: {
			title: "门店能看到 PR 的哪些资料？",
			lines: [
				"门店可以看到在本场所被预订和上班的 PR — 名字和昵称、等级、comcard 和作品集照片、年龄、身高和语言 — 以及他们的出勤状态，班后还可以给 PR 评分。",
				"门店不会收到 PR 的身份证或护照号码、出生日期、住址、银行资料、证件或病假单照片、罚款或取消费用，也看不到签到时的确切位置。",
				"门店无法打开 PR 的薪资单 — 经纪公司与 PR 之间的薪资只属于他们双方。",
			],
		},
	},
	{
		id: "ref-shared-privacy-agency",
		role: "any",
		asks: [
			"can my agency see where i checked in, inside the fence or not",
			"can my agency see my shifts and pay from another agency",
			"my other agency pay, this agency can see or not",
			"经纪公司看得到我打卡的位置吗",
			"经纪公司看得到我在别家公司的班和薪水吗",
		],
		en: {
			title: "What can an agency see about PRs?",
			lines: [
				"An agency sees the full profiles of PRs on its own books, and for each check-in where the PR was and whether it was inside the venue's fence.",
				"It sees only its own shifts, vouchers and partner outlets; for a PR who also works elsewhere, only the work and pay booked through itself.",
			],
		},
		zh: {
			title: "经纪公司能看到 PR 的哪些资料？",
			lines: [
				"经纪公司可以看到旗下 PR 的完整资料，以及每次签到时 PR 的位置和是否在场所范围内。",
				"它只看到自己的班次、薪资单和合作门店；对同时在别处工作的 PR，只看到经由本公司安排的工作和薪资。",
			],
		},
	},
	{
		id: "ref-shared-billing",
		role: "any",
		asks: [
			"how does innocenz bill outlets and agencies",
			"is the subscription billed weekly or monthly",
			"where is payment history for subscription bills, the receipt",
			"agency kena charge weekly ah, outlet monthly?",
			"bil langganan dikira mingguan atau bulanan",
			"bil langganan agensi mingguan, outlet bulanan ke",
			"PR kena bayar langganan InnocenZ tak",
			"订阅费是按周还是按月收",
			"订阅账单的付款记录和收据在哪里看",
		],
		en: {
			title: "How are outlets and agencies billed?",
			lines: [
				"Billing starts the day the InnocenZ team approves the organisation: agencies weekly (Sunday to Saturday), outlets monthly from the approval date.",
				"An agency's first, partial week is charged only for the days from approval, marked “Pro-rated”.",
				"Each bill has a number (INV-…) and is due 7 days after its period ends. Bills are listed under “Subscription” → “Payment history”; tap a paid period for its receipt.",
				"Only outlets and agencies subscribe — PRs pay InnocenZ nothing.",
			],
		},
		zh: {
			title: "门店和经纪公司怎么计费？",
			lines: [
				"计费从 InnocenZ 团队批准机构当天开始：经纪公司按周（周日至周六），门店从获批日起按月。",
				"经纪公司的第一个不完整周只按获批后的天数收费，标为「按天折算」。",
				"每张账单有编号（INV-…），在账期结束后 7 天到期。账单列在「订阅」→「付款记录」；点击已付款账期可查看收据。",
				"只有门店和经纪公司订阅 — PR 无需向 InnocenZ 付任何费用。",
			],
		},
	},
	{
		id: "ref-shared-bill-status",
		role: "any",
		asks: [
			"what does void mean on my bill",
			"paid already but the bill still says unpaid",
			"already transfer why still show unpaid ah",
			"the amber subscription due banner how to remove ah",
			"账单显示已作废是什么意思",
			"已经转账了为什么还显示未付款",
			"订阅费已逾期的红色横幅是什么意思",
		],
		en: {
			title: "What do bill statuses and the billing banner mean?",
			lines: [
				"“Unpaid” stays until the InnocenZ team marks the payment received (the owner pays by transfer); then it shows “Paid”. “Void” means InnocenZ cancelled a bill raised in error — it is not owed.",
				"Each row shows “Due in N days”, “Due tomorrow” or “N days overdue”; the period still running shows “Current period”.",
				"On “Today”, an amber “Subscription due” banner shows while anything is unpaid and turns red as “Subscription overdue” once a bill is late; “Open Subscription” goes to the bills.",
			],
		},
		zh: {
			title: "账单状态和账单横幅是什么意思？",
			lines: [
				"「未付款」会一直显示，直到 InnocenZ 团队确认收到款项（东主以转账付款），之后显示「已付款」。「已作废」表示 InnocenZ 取消了误开的账单，无需支付。",
				"每行显示「N 天后到期」「明天到期」或「逾期 N 天」；仍在进行中的账期显示「本期」。",
				"在「今天」页，有未付账单时显示琥珀色「订阅费待付」横幅，逾期后变成红色「订阅费已逾期」；点「打开订阅页面」查看账单。",
			],
		},
	},
	{
		id: "ref-shared-plan-change",
		role: "any",
		asks: [
			"how to upgrade or downgrade my plan",
			"why can't i switch plan",
			"subscription page is read only, cannot change plan",
			"upgrade plan halfway kena extra charge ah",
			"cannot switch plan because got unpaid bill ah",
			"macam mana nak tukar pakej langganan",
			"turun pakej langganan dapat potongan bil seterusnya ke",
			"怎么换套餐，期中升级要补差价吗",
			"为什么不能切换套餐，降级会在下期账单扣吗",
		],
		en: {
			title: "How do I change my plan?",
			lines: [
				"Only the owner or the Guarantor can change the plan; other members see “Subscription” read-only.",
				"An outlet taps “Switch to …” on another plan; the InnocenZ team approves it, and the outlet stays on its current plan until then.",
				"A switch is refused while any bill is unpaid — settle it with InnocenZ first.",
				"Moving up mid-period adds an “Upgrade” bill for the difference; moving down gives a deduction on the next bill. An agency's tier moves by itself each week.",
			],
		},
		zh: {
			title: "怎么更换套餐？",
			lines: [
				"只有东主或担保人可以更改套餐；其他成员看到的「订阅」为只读。",
				"门店在其他套餐上点「切换到 …」；由 InnocenZ 团队批准，在此之前门店维持现有套餐。",
				"有未付账单时不能切换套餐 — 请先与 InnocenZ 结清。",
				"期中升级会产生一张「升级」账单补差价；降级则在下一张账单中抵扣。经纪公司的等级每周自动调整。",
			],
		},
	},
	{
		id: "ref-shared-money-flow",
		role: "any",
		asks: [
			"who pays the pr salary, the outlet or the agency",
			"outlet pay agency through the app ah",
			"pr salary who pay one, agency or the outlet",
			"outlet bayar agensi melalui InnocenZ ke, siapa bayar gaji PR",
			"谁出粮给PR，门店还是经纪公司",
			"门店给经纪公司的钱经过InnocenZ吗",
		],
		en: {
			title: "How does money move between outlet, agency and PR?",
			lines: [
				"The outlet pays its agency for the PRs' work directly, outside InnocenZ — the two settle between themselves.",
				"The agency pays each PR from its own bank against the signed weekly payment voucher, then marks it paid, and the PR is notified.",
				"Outlets and agencies pay InnocenZ a subscription; PRs pay InnocenZ nothing.",
				"The outlet's reports show what its PRs cost, but never the PRs' vouchers, fines or fees.",
			],
		},
		zh: {
			title: "门店、经纪公司和 PR 之间的钱怎么流动？",
			lines: [
				"门店直接向经纪公司支付 PR 的工作费用，不经过 InnocenZ — 双方自行结算。",
				"经纪公司根据已签的每周薪资单，从自己的银行付款给每位 PR，然后标记为已付款，PR 会收到通知。",
				"门店和经纪公司向 InnocenZ 支付订阅费；PR 不需向 InnocenZ 付费。",
				"门店的报表显示 PR 的成本，但看不到 PR 的薪资单、罚款或费用。",
			],
		},
	},
	{
		id: "ref-shared-pv",
		role: "any",
		asks: [
			"what is a pv, payment voucher",
			"pr with two agencies gets two pv each week?",
			"pv means what ah",
			"apa itu PV, baucar bayaran",
			"PV是什么意思",
			"薪资单PV是什么意思，要签两次吗",
		],
		en: {
			title: "What are a payroll week and a PV?",
			lines: [
				"The payroll week runs Sunday to Saturday, Malaysia time.",
				"A PV (payment voucher) is one PR's pay from one agency for one week, numbered per agency from PV-000001; a PR with two agencies gets one from each.",
				"It is signed twice — first by the agency (owner or Financial Head), then by the PR on the phone — and only then can it be marked paid.",
			],
		},
		zh: {
			title: "什么是薪资周和 PV？",
			lines: [
				"薪资周为周日至周六，按马来西亚时间计算。",
				"PV（薪资单）是一位 PR 在一家经纪公司一周的薪资，按经纪公司从 PV-000001 起编号；同时在两家公司的 PR 会各收到一张。",
				"薪资单要签两次 — 先由经纪公司（东主或财务主管）签，再由 PR 在手机上签 — 之后才能标记为已付款。",
			],
		},
	},
	{
		id: "ref-shared-disputes",
		role: "any",
		asks: [
			"how is a pay dispute settled",
			"who accepts or rejects a pay dispute",
			"dispute already but agency no reply, how ah",
			"wage or ot can dispute or not",
			"macam mana pertikaian gaji diselesaikan",
			"pertikaian gaji tak dijawab agensi, siapa putuskan",
			"薪资争议怎么解决",
			"经纪公司一直不回复争议怎么办，日薪可以争议吗",
		],
		en: {
			title: "How are pay disputes settled?",
			lines: [
				"The agency's owner or Financial Head accepts or rejects each dispute and can add a note; the PR is notified of the result.",
				"Once no dispute is left open, the voucher goes back to the PR to sign; if a dispute was accepted, the agency corrects the amount on the voucher. While a dispute is open the PR cannot sign; one raised by mistake can be taken back with “Withdraw dispute”.",
				"Wages and overtime cannot be disputed: if they look wrong, the PR asks the agency to correct that shift's record.",
				"If the agency doesn't answer, the PR can contact the InnocenZ team, which can review the dispute and decide it.",
			],
		},
		zh: {
			title: "薪资争议怎么解决？",
			lines: [
				"经纪公司的东主或财务主管会接受或拒绝每项争议，可附上说明，PR 会收到结果通知。",
				"当没有未结束的争议时，薪资单会退回给 PR 签名；若争议被接受，经纪公司会在薪资单上更正金额。争议未结束时 PR 不能签名；误报的争议可用「撤回争议」收回。",
				"日薪和加班不能争议：如看起来不对，PR 请经纪公司更正该班次的记录。",
				"如经纪公司一直不答复，PR 可联系 InnocenZ 团队，由团队审核并作出裁决。",
			],
		},
	},
	{
		id: "ref-shared-partnership",
		role: "any",
		asks: [
			"end partnership already, the posted shifts still got or not",
			"outlet boleh kerjasama dengan beberapa agensi tak",
			"门店怎么和经纪公司合作",
			"结束合作后已发布的班次还在吗",
			"门店可以和几家经纪公司合作吗",
		],
		en: {
			title: "How does an outlet start working with an agency?",
			lines: [
				"The outlet asks in “Settings” → “Agency Partnerships”: choose an agency and tap “Request”.",
				"The agency accepts or declines under “Approvals” → “Outlet Partnership”. An outlet can work with several agencies, each approving its own link.",
				"Until one agency has accepted, “Post Job” is unavailable.",
				"Ending a partnership stops new jobs to that agency; shifts already posted still stand.",
			],
		},
		zh: {
			title: "门店怎么开始与经纪公司合作？",
			lines: [
				"门店在「设置」→「经纪公司合作」提出申请：选择一家经纪公司，点「申请」。",
				"经纪公司在「审批」→「门店合作」接受或拒绝。门店可以与多家经纪公司合作，每一家各自批准。",
				"在至少一家经纪公司接受之前，「发布职位」不可用。",
				"结束合作后不能再向该经纪公司发布新工作；已发布的班次仍然有效。",
			],
		},
	},
	{
		id: "ref-shared-devices",
		role: "any",
		asks: [
			"can i use the agency portal on my phone or tablet",
			"is there an app for outlets or only the web portal in a browser",
			"agency portal can open on handphone or not",
			"pr app where to download ah, from agency?",
			"门店后台可以用手机或平板打开吗",
			"经纪公司后台可以用手机或平板吗",
		],
		en: {
			title: "Which device does each person use?",
			lines: [
				"PRs use the InnocenZ phone app: shifts, check-in, pay and signing all happen there. The app comes from the PR's agency, or message InnocenZ.",
				"Outlet and agency teams use the web portal in a browser on a computer, tablet or phone; on a phone the menu sits behind a button.",
				"The web portals are not for PR accounts — a PR signing in there is told “You cannot access this web portal”.",
			],
		},
		zh: {
			title: "每个人用什么设备？",
			lines: [
				"PR 使用 InnocenZ 手机 App：班次、签到、薪资和签名都在 App 里完成。App 向所属经纪公司索取，或联系 InnocenZ。",
				"门店和经纪公司团队在浏览器使用网页门户，电脑、平板或手机都可以；手机上菜单收在一个按钮里。",
				"网页门户不供 PR 账号使用 — PR 在那里登录会看到「您无法访问此网页门户」。",
			],
		},
	},
	{
		id: "ref-shared-support",
		role: "any",
		asks: [
			"how do i contact innocenz, whatsapp?",
			"where is the privacy policy",
			"want to contact innocenz how ah, got whatsapp number?",
			"macam mana nak hubungi InnocenZ",
			"nak tempah demo kena whatsapp ke",
			"怎么联系InnocenZ客服",
			"怎么预约演示，隐私政策在哪里",
		],
		en: {
			title: "How do I contact InnocenZ?",
			lines: [
				"On this page, the WhatsApp button at the bottom right or “Contact Us” in the top menu opens a chat with the InnocenZ team — also the way to book a demo.",
				"On the sign-in page, use “Need help? Contact support”.",
				"The Privacy Policy opens from “Privacy” at the foot of this page, or “Privacy Policy” on the sign-in page.",
			],
		},
		zh: {
			title: "怎么联系 InnocenZ？",
			lines: [
				"在本页，右下角的 WhatsApp 按钮或顶部菜单的「联系我们」会打开与 InnocenZ 团队的对话 — 预约演示也用这个方式。",
				"在登录页，使用「需要帮助？」「联系客服支持」。",
				"隐私政策可从本页底部的「隐私」或登录页的「隐私政策」打开。",
			],
		},
	},
	{
		id: "ref-shared-chat",
		role: "any",
		asks: [
			"is this chat a bot, who answers it",
			"what i type in this chat send to google ah",
			"chat ni bot ke, apa saya taip dihantar ke google ke",
			"你是机器人还是真人",
			"这个聊天是机器人回答的吗，资料会发给谷歌吗",
		],
		en: {
			title: "Who answers this chat, and what happens to what I type?",
			lines: [
				"Answers here are written by Google Gemini AI from InnocenZ's own verified guide only; for a person, use WhatsApp.",
				"Please don't share personal details. Emails, IC and passport numbers, and Malaysian phone numbers typed here are masked before the question is sent to Google.",
				"When the chat isn't sure, it offers a WhatsApp button with your question already written.",
			],
		},
		zh: {
			title: "谁在回答这个聊天？我输入的内容会怎样？",
			lines: [
				"这里的回答由 Google Gemini AI 仅根据 InnocenZ 官方核实的说明生成；如需真人，请用 WhatsApp。",
				"请勿分享个人资料。在这里输入的邮箱、身份证和护照号码，以及马来西亚电话号码，会在问题发送给 Google 前被遮盖。",
				"聊天助手不确定时，会提供 WhatsApp 按钮，并已写好你的问题。",
			],
		},
	},
	{
		id: "ref-shared-colours",
		role: "any",
		asks: [
			"what does the number beside the menu mean",
			"why is the payroll badge always red",
			"what do green, amber, white and red mean on pay amounts",
			"why some amount show red colour ah",
			"menu got amber number badge means what ah",
			"颜色和角标是什么意思",
			"金额显示红色是什么意思，绿色和琥珀色呢",
		],
		en: {
			title: "What do the colours and badges mean?",
			lines: [
				"A number beside a menu item means something is waiting there: amber for things to decide or pay (such as “Approvals” or “Subscription”); the agency's “Payroll” count is always red because it is money.",
				"Pay figures share one colour code: green = settled (verified, sealed wages, signed or paid), amber = waiting (pending or approved), white = a mix of states, red = disputed or a deduction.",
			],
		},
		zh: {
			title: "颜色和角标是什么意思？",
			lines: [
				"菜单项旁的数字表示那里有事项在等待：琥珀色代表待决定或待付款（例如「审批」或「订阅」）；经纪公司「薪资」的数字始终是红色，因为涉及款项。",
				"金额颜色统一：绿色 = 已结清（已核实、已封存的日薪、已签或已付款），琥珀色 = 等待中（待处理或已批准），白色 = 状态混合，红色 = 有争议或扣款。",
			],
		},
	},
	{
		id: "ref-shared-countries",
		role: "any",
		asks: [
			"can a foreign pr sign up with an indonesian number",
			"which countries does innocenz support, only malaysia?",
			"got support outside malaysia or not",
			"my number is thailand one, can register as pr or not",
			"InnocenZ只在马来西亚可以用吗，外国号码行吗",
			"外国号码可以注册吗，越南号码行不行",
		],
		en: {
			title: "Where does InnocenZ work?",
			lines: [
				"Outlets and agencies sign up as Malaysian companies with a +60 contact number — the form says “We currently support Malaysia only.”",
				"Amounts are in ringgit (RM) and the week runs on Malaysia time.",
				"A PR can sign up with a Malaysian number or one from 15 listed countries (such as Indonesia, Thailand, Vietnam, the Philippines and India); the number must be on WhatsApp.",
			],
		},
		zh: {
			title: "InnocenZ 在哪些地区可用？",
			lines: [
				"门店和经纪公司以马来西亚公司身份注册，联系电话为 +60 — 表格注明「目前仅支持马来西亚。」",
				"金额以令吉（RM）计算，每周按马来西亚时间计算。",
				"PR 可以用马来西亚号码或 15 个列明国家（例如印尼、泰国、越南、菲律宾和印度）的号码注册；该号码必须已注册 WhatsApp。",
			],
		},
	},
	{
		id: "ref-shared-innocenz-team",
		role: "any",
		asks: [
			"what does the innocenz team actually do",
			"who approves new outlets and agencies on innocenz",
			"what is the innocenz team in charge of, approvals and plan changes",
			"who approve new agency account, innocenz team ah",
			"apa kerja pasukan InnocenZ",
			"tugas pasukan InnocenZ apa, siapa luluskan pendaftaran",
			"InnocenZ团队负责什么",
			"谁审核批准新注册的门店和经纪公司，InnocenZ团队吗",
		],
		en: {
			title: "What does the InnocenZ team do?",
			lines: [
				"The InnocenZ team reviews and approves each new outlet and agency before its portal opens.",
				"It records subscription payments as received, voids bills raised in error, and answers plan-change and Custom-price requests.",
				"If an agency does not answer a PR's pay dispute, the team can step in and decide it.",
				"InnocenZ does not pay PRs — each agency pays its own PRs from its own bank and does its own rostering.",
			],
		},
		zh: {
			title: "InnocenZ 团队负责什么？",
			lines: [
				"InnocenZ 团队会审核并批准每家新门店和经纪公司，之后其门户才会开通。",
				"团队会记录已收到的订阅费、作废误开的账单，并处理套餐变更和定制价格申请。",
				"如经纪公司没有处理 PR 的薪资争议，团队可以介入并作出裁决。",
				"InnocenZ 不向 PR 发薪 — 各经纪公司从自己的银行付款给旗下 PR，并自行排班。",
			],
		},
	},
	{
		id: "ref-general-is-innocenz-a-job-app",
		role: "any",
		asks: [
			"is this a job app",
			"can i find and apply for nightlife jobs on innocenz",
			"this one is job app ah, can find work?",
			"where to apply job as pr ah",
			"boleh mohon kerja PR dalam app ni tak",
			"InnocenZ是找工作的App吗",
			"可以在这里找夜场工作吗",
			"这是找夜场工作的App吗",
		],
		en: {
			title: "Is InnocenZ a job app?",
			lines: [
				"No — it is not a job board. PRs don't browse or apply for jobs in it: the agency they belong to puts them on shifts.",
				"It runs the night between three sides: outlets book PRs and watch the night on the web portal; agencies roster, approve and run weekly payroll on the web portal; PRs see their shifts, check in, see their pay and sign the weekly voucher in the phone app.",
				"InnocenZ does not hire or pay PRs — each agency pays its own PRs from its own bank.",
			],
		},
		zh: {
			title: "InnocenZ 是找工作的 App 吗？",
			lines: [
				"不是 — 它不是招聘平台。PR 不能在里面浏览或申请工作：由所属的经纪公司为 PR 排班。",
				"它连接夜场的三方：场所在网页后台订 PR、看当晚情况；经纪公司在网页后台排班、审批并处理每周薪资；PR 用手机 App 查看班次、签到、查看薪资并签收每周薪资单。",
				"InnocenZ 不雇用也不支付 PR — 每家经纪公司从自己的银行给自己的 PR 付款。",
			],
		},
	},
];
