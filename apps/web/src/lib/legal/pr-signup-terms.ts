/**
 * What a PR accepts when they sign up in the PR app, for the public /legal page.
 *
 * ⚠️ A word-for-word copy of the `disclaimer*` strings in
 * `apps/mobile/src/i18n/signup-copy.ts` — the web cannot import the app, and
 * /legal must show exactly what was agreed to, not a paraphrase.
 * `pr-signup-terms.test.ts` fails the moment the two drift, so change the app
 * first, then this file. Bodies keep the app's `\n\n` paragraph breaks and
 * `  • ` bullet lines.
 */

export type SignupDocumentId = "terms" | "truth" | "personal" | "sharing";

export type SignupDocument = {
	id: SignupDocumentId;
	title: string;
	body: string;
};

export const PR_SIGNUP_DOCUMENTS: Record<"en" | "zh", SignupDocument[]> = {
	en: [
		{
			id: "terms",
			title: "Terms and Conditions",
			body: "By creating an InnocenZ PR account, you agree to the InnocenZ platform rules, including shift booking and sealing, commission transparency, payment voucher processes, and dispute handling.\n\nYou agree to use the platform lawfully and in good faith, keep your login credentials secure, and not misrepresent your identity or work eligibility.\n\nYour personal data is processed as described in the InnocenZ Privacy Policy. Continued use of the platform constitutes acceptance of updates to these Terms and Conditions and the Privacy Policy.",
		},
		{
			id: "truth",
			title: "Declaration of Truth",
			body: "I hereby declare that all information provided in this registration form is true, accurate, and complete to the best of my knowledge.\n\nI understand that providing false or misleading information may result in:\n  • Rejection of my account application\n  • Cancellation of an approved account\n  • Potential legal consequences depending on the nature of the false information\n\nI agree to notify InnocenZ promptly if any of the information provided changes.",
		},
		{
			id: "personal",
			title: "Personal Information Disclaimer",
			body: "By submitting this registration, you consent to the collection and use of your personal information — including your full name, IC/NRIC or passport number, date of birth, contact details, address, identity photos, and related data — by InnocenZ for the purposes of account management, shift coordination, and official correspondence.\n\nYour information will be handled in accordance with our Privacy Policy and applicable data protection laws. We will not share your personal data with third parties without your consent, except as required by law or as described under Agency Information Sharing.",
		},
		{
			id: "sharing",
			title: "Agency Information Sharing",
			body: "By registering as a PR on InnocenZ, you consent to sharing relevant profile information — including your floor nickname, contact details, photos, and work-related profile data — with linked agencies and outlets for rostering, shift coordination, and payment purposes.\n\nSensitive identity documents (IC/NRIC, passport photos) remain restricted to InnocenZ compliance staff and authorized platform operators. Information shared with agencies and outlets is limited to what is required to operate bookings, shifts, and payment vouchers on the platform, except as required by law.",
		},
	],
	zh: [
		{
			id: "terms",
			title: "条款与条件",
			body: "创建 InnocenZ PR 账户即表示你同意平台规则，包括班次预订与封存、佣金透明、支付凭证流程与争议处理。\n\n你同意合法善意使用平台，妥善保管登录凭证，不得虚报身份或工作资格。\n\n个人数据处理见 InnocenZ 隐私政策。继续使用平台即表示接受条款与隐私政策的更新。",
		},
		{
			id: "truth",
			title: "真实性声明",
			body: "本人声明，本注册表中所填信息据本人所知均为真实、准确、完整。\n\n本人理解提供虚假或误导信息可能导致：\n  • 拒绝账户申请\n  • 取消已批准账户\n  • 视情节承担相应法律后果\n\n本人同意在信息变更时及时通知 InnocenZ。",
		},
		{
			id: "personal",
			title: "个人信息免责声明",
			body: "提交本注册即表示你同意 InnocenZ 为账户管理、班次协调与正式通信之目的，收集并使用你的个人信息 — 包括全名、身份证/护照号码、出生日期、联系方式、地址、身份证件照片及相关数据。\n\n你的信息将按隐私政策及适用数据保护法律处理。未经你同意，我们不会与第三方共享你的个人数据，法律要求或「经纪公司信息共享」所述情形除外。",
		},
		{
			id: "sharing",
			title: "经纪公司信息共享",
			body: "以 PR 身份注册 InnocenZ，即表示你同意向关联经纪公司与门店共享相关资料信息 — 包括现场昵称、联系方式、照片及工作相关资料 — 用于排班、班次协调与支付。\n\n敏感身份证件（身份证/护照照片）仅限 InnocenZ 合规人员及获授权平台运营人员访问。与经纪公司及门店共享的信息仅限于运营预订、班次与支付凭证所需，法律另有要求除外。",
		},
	],
};
