export interface SignupDisclaimerCopy {
	title: string;
	body: string;
}

export interface SignupTranslations {
	meta: {
		title: string;
		description: string;
	};
	aside: {
		description: string;
		rightsReserved: string;
	};
	backToLogin: string;
	heading: {
		line1: string;
		line2: string;
		sub: string;
	};
	sections: {
		accountType: string;
		companyInfo: string;
		contactInfo: string;
		loginCredentials: string;
		packageEnrollment: string;
		branding: string;
		acknowledgements: string;
		terms: string;
	};
	progress: { label: string };
	accountTypes: {
		outlet: { title: string; description: string };
		agency: { title: string; description: string };
	};
	fields: {
		companyName: { label: string; placeholder: string };
		companyRegistrationOld: { label: string; placeholder: string };
		companyRegistrationNew: { label: string; placeholder: string };
		businessLicense: { label: string; placeholder: string };
		addressLine1: { label: string; placeholder: string };
		addressLine2: { label: string; placeholder: string };
		city: { label: string; placeholder: string; chooseStateFirst: string };
		postcode: { label: string; placeholder: string };
		state: { label: string; placeholder: string };
		country: { label: string; value: string; notice: string };
		personInCharge: { label: string; placeholder: string; hint: string };
		idType: {
			label: string;
			nric: string;
			passport: string;
		};
		idNo: {
			label: string;
			placeholderNric: string;
			placeholderPassport: string;
		};
		gender: { label: string; male: string; female: string; hint: string };
		dob: { label: string; placeholder: string };
		nationality: { label: string; placeholder: string };
		/** Read back to the person from their own IC — `{date}` and `{age}`. */
		icDerived: string;
		phoneNum: {
			label: string;
			placeholder: string;
			/** Fixed Malaysia dial shown beside the number (e.g. 🇲🇾 +60). */
			dialDisplay: string;
			dialNotice: string;
		};
		email: { label: string; placeholder: string; description: string };
		loginEmail: {
			label: string;
			placeholder: string;
			description: string;
			/** Checkbox: copy company contact email into login email. */
			sameAsCompanyEmail: string;
		};
		password: { label: string; placeholder: string };
		confirmPassword: { label: string; placeholder: string };
		package: { label: string; placeholder: string };
		/** Outlet only — which agency onboarded this venue. */
		onboardingAgency: {
			label: string;
			placeholder: string;
			description: string;
			loading: string;
			loadFailed: string;
			empty: string;
			retry: string;
		};
		logo: {
			labelOutlet: string;
			labelAgency: string;
			uploadTitleOutlet: string;
			uploadTitleAgency: string;
			uploadHint: string;
		};
	};
	searchPlaceholder: string;
	noResults: string;
	privacyPolicy: string;
	packages: {
		loadingShort: string;
		loadingLong: string;
		loadFailed: string;
	};
	acknowledgements: {
		personalInfo: SignupDisclaimerCopy;
		declarationOfTruth: SignupDisclaimerCopy;
		informationSharing: SignupDisclaimerCopy;
		terms: SignupDisclaimerCopy;
		termsCheckboxPrefix: string;
		termsCheckboxLink: string;
		done: string;
	};
	buttons: {
		createAccount: string;
		creating: string;
	};
	footer: {
		alreadyHaveAccount: string;
		signIn: string;
	};
	success: {
		title: string;
		bodyOutlet: string;
		bodyAgency: string;
		/** Shown when the account was created but the logo upload failed. */
		logoUploadFailed: string;
		continueToLogin: string;
	};
	errors: {
		registrationFailed: string;
		internalServerError: string;
		unexpected: string;
	};
	validation: {
		companyNameRequired: string;
		companyNameMax: string;
		addressLine1Required: string;
		addressLine1Max: string;
		cityRequired: string;
		cityMax: string;
		postcodeRequired: string;
		postcodeMax: string;
		stateRequired: string;
		companyRegistrationNewRequired: string;
		companyRegistrationNewFormat: string;
		companyRegistrationOldFormat: string;
		businessLicenseRequired: string;
		businessLicenseMax: string;
		registrationNumberMax: string;
		personInChargeRequired: string;
		personInChargeMax: string;
		idTypeRequired: string;
		genderRequired: string;
		idNoRequired: string;
		idNoMax: string;
		nricInvalid: string;
		genderMismatch: string;
		dobRequired: string;
		nationalityRequired: string;
		phoneRequired: string;
		phoneMax: string;
		phoneMin: string;
		emailRequired: string;
		emailInvalid: string;
		loginEmailRequired: string;
		loginEmailInvalid: string;
		passwordRequired: string;
		passwordMin: string;
		confirmPasswordRequired: string;
		passwordsMismatch: string;
		packageRequired: string;
		onboardingAgencyRequired: string;
		logoRequired: string;
		logoMaxSize: string;
		logoImageType: string;
		ackPersonalInfo: string;
		ackDeclarationOfTruth: string;
		ackInformationSharing: string;
		acceptTerms: string;
	};
}

export const signupTranslations: Record<"en" | "zh", SignupTranslations> = {
	en: {
		meta: {
			title: "Sign up — InnocenZ",
			description: "Create an InnocenZ account as an Outlet or PR Agency.",
		},
		aside: {
			/*
			 * Kept short on purpose. The heading beside it already says "Sign up
			 * as an Outlet or PR Agency with your company details and preferred
			 * package", so the long version restated the form's own instructions
			 * back at the reader, in the one column meant to carry the brand.
			 */
			description: "One portal for rosters, shifts and payroll.",
			rightsReserved: "All rights reserved.",
		},
		backToLogin: "Back to login",
		heading: {
			line1: "Create your",
			line2: "account",
			sub: "Sign up as an Outlet or PR Agency with your company details and preferred package.",
		},
		sections: {
			accountType: "Account type",
			companyInfo: "Company information",
			contactInfo: "Contact information",
			loginCredentials: "Login credentials",
			packageEnrollment: "Package enrollment",
			branding: "Branding",
			acknowledgements: "Acknowledgements",
			terms: "Terms and Conditions",
		},
		progress: { label: "Your progress" },
		accountTypes: {
			outlet: {
				title: "Outlet",
				description:
					"Venue operators managing floor staff, shifts, and nightly sales.",
			},
			agency: {
				title: "PR Agency",
				description:
					"PR agencies managing rosters, workforce, and payroll across venues.",
			},
		},
		fields: {
			companyName: {
				label: "Company name",
				placeholder: "Registered company name",
			},
			companyRegistrationOld: {
				label: "Old company registration number",
				placeholder: "e.g. 123456-A",
			},
			companyRegistrationNew: {
				label: "New company registration number",
				placeholder: "e.g. 202601024567",
			},
			businessLicense: {
				label: "Business license",
				placeholder: "e.g. DBKL.BP.2026.01452",
			},
			addressLine1: {
				label: "Address line 1",
				placeholder: "Street address, building, unit",
			},
			addressLine2: {
				label: "Address line 2",
				placeholder: "Floor, suite, landmark",
			},
			city: {
				label: "City",
				placeholder: "Select city",
				chooseStateFirst: "Choose a state first",
			},
			postcode: {
				label: "Postcode",
				placeholder: "e.g. 50450",
			},
			state: {
				label: "State",
				placeholder: "Select state",
			},
			country: {
				label: "Country",
				value: "Malaysia",
				notice: "We currently support Malaysia only.",
			},
			personInCharge: {
				label: "Full name (as per IC)",
				placeholder: "Exactly as printed on the IC",
				hint: "This is the name on your account and on every document we issue.",
			},
			idType: {
				label: "ID type",
				nric: "NRIC (Malaysian)",
				passport: "Passport",
			},
			idNo: {
				label: "ID number",
				placeholderNric: "e.g. 950312-14-8821",
				placeholderPassport: "e.g. A12345678",
			},
			gender: {
				label: "Gender",
				male: "Male",
				female: "Female",
				hint: "Your IC states this too — we check the two against each other.",
			},
			dob: { label: "Date of birth", placeholder: "YYYY-MM-DD" },
			nationality: { label: "Nationality", placeholder: "e.g. Singaporean" },
			icDerived: "From your IC: born {date} · age {age}",
			phoneNum: {
				label: "Contact number",
				placeholder: "e.g. 123456789",
				dialDisplay: "🇲🇾 +60",
				dialNotice: "Malaysia numbers only.",
			},
			email: {
				label: "Email",
				placeholder: "contact@company.com",
				description: "Business contact email for account correspondence.",
			},
			loginEmail: {
				label: "Email login ID",
				placeholder: "you@company.com",
				description: "This email will be used to sign in to your portal.",
				sameAsCompanyEmail: "Same as company email",
			},
			password: {
				label: "Password",
				placeholder: "Minimum 8 characters",
			},
			confirmPassword: {
				label: "Confirm password",
				placeholder: "Re-enter your password",
			},
			package: {
				label: "Package to enroll",
				placeholder: "Select a pricing package",
			},
			onboardingAgency: {
				label: "Onboarded by agency",
				placeholder: "Select the agency that onboarded you",
				description:
					"The PR agency that brought your venue onto InnocenZ. Every shift you post is routed to this agency — our admin confirms it when your account is approved.",
				loading: "Loading agencies…",
				loadFailed: "Could not load agencies",
				empty: "No active agencies are available right now.",
				retry: "Retry",
			},
			logo: {
				labelOutlet: "Outlet logo",
				labelAgency: "Agency logo",
				uploadTitleOutlet: "Upload outlet logo",
				uploadTitleAgency: "Upload agency logo",
				uploadHint: "PNG, JPG, or WEBP up to 5 MB",
			},
		},
		searchPlaceholder: "Search…",
		noResults: "No results found.",
		privacyPolicy: "Privacy Policy",
		packages: {
			loadingShort: "Loading plans…",
			loadingLong: "Loading plans from the catalog…",
			loadFailed: "Could not load plans",
		},
		acknowledgements: {
			personalInfo: {
				title: "Personal Information Disclaimer",
				body: "Your company registration documents, business contact details, and registered address are stored securely on InnocenZ. Only InnocenZ compliance staff and authorized platform operators supporting your outlet or agency account can access this data — other outlets, agencies, and PR professionals cannot view your private business records.",
			},
			declarationOfTruth: {
				title: "Declaration of Truth",
				body: "I declare that all company information and documents submitted on behalf of this outlet or agency are true, current, and accurate. I understand that false or misleading statements may result in account suspension or removal from the platform.",
			},
			informationSharing: {
				title: "Outlet & Agency Information Sharing",
				body: "Your outlet or agency profile may be shared with linked PR agencies and workforce participants on InnocenZ for rostering, shift coordination, payroll, and compliance purposes. Information shared is limited to what is required to operate bookings, shifts, and payment vouchers on the platform.",
			},
			terms: {
				title: "Terms & Conditions",
				body: "I agree to InnocenZ platform rules, shift sealing, commission transparency, and dispute processes as described in the InnocenZ Outlet & Agency terms. Continued use of the platform constitutes acceptance of updates to these terms.",
			},
			termsCheckboxPrefix: "I have read and agree to the",
			termsCheckboxLink: "Terms & Conditions",
			done: "Done",
		},
		buttons: {
			createAccount: "Create account",
			creating: "Creating account…",
		},
		footer: {
			alreadyHaveAccount: "Already have an account?",
			signIn: "Sign in",
		},
		success: {
			title: "Registration successful",
			bodyOutlet:
				"Your outlet account has been submitted for InnocenZ admin approval. You can sign in now to update your profile — other portal features unlock after approval. You will receive an email once your account is approved.",
			bodyAgency:
				"Your PR agency account has been submitted for InnocenZ admin approval. You can sign in now to update your profile — other portal features unlock after approval. You will receive an email once your account is approved.",
			logoUploadFailed:
				"Your account was created, but the logo could not be saved. Please upload it again in Settings.",
			continueToLogin: "Back to sign in",
		},
		errors: {
			registrationFailed: "Registration failed. Please try again.",
			internalServerError:
				"Our server encountered an error. Please try again later.",
			unexpected: "An unexpected error occurred. Please try again.",
		},
		validation: {
			companyNameRequired: "Company name is required",
			addressLine1Required: "Street address is required",
			addressLine1Max: "Address must be 255 characters or fewer",
			cityRequired: "City is required",
			cityMax: "City must be 100 characters or fewer",
			postcodeRequired: "Postcode is required",
			postcodeMax: "Postcode must be 20 characters or fewer",
			stateRequired: "State is required",
			companyNameMax: "Company name must be 150 characters or fewer",
			companyRegistrationNewRequired:
				"New company registration number is required",
			registrationNumberMax: "Registration number is too long",
			companyRegistrationNewFormat:
				"SSM numbers are 12 digits — year, entity code, running number (e.g. 202601024567)",
			companyRegistrationOldFormat:
				"The old format is digits and a letter, e.g. 1456789-W",
			businessLicenseRequired: "Business license is required",
			businessLicenseMax: "Business license is too long",
			personInChargeRequired: "Full name is required",
			personInChargeMax: "Name must be 100 characters or fewer",
			idTypeRequired: "Choose an ID type",
			genderRequired: "Gender is required",
			idNoRequired: "ID number is required",
			idNoMax: "ID number must be 32 characters or fewer",
			nricInvalid:
				"That is not a valid NRIC — 12 digits beginning with the birth date",
			genderMismatch:
				"This does not match your IC number — check the number and the selection",
			dobRequired: "Date of birth is required (YYYY-MM-DD)",
			nationalityRequired: "Nationality is required",
			phoneRequired: "Please enter a valid mobile number",
			phoneMax: "Mobile number is too long",
			phoneMin: "That mobile number looks too short",
			emailRequired: "Email is required",
			emailInvalid: "Please enter a valid email address",
			loginEmailRequired: "Email login ID is required",
			loginEmailInvalid: "Please enter a valid email login ID",
			passwordRequired: "Password is required",
			passwordMin: "Password must be at least 8 characters",
			confirmPasswordRequired: "Please confirm your password",
			passwordsMismatch: "Passwords do not match",
			packageRequired: "Please select a package",
			onboardingAgencyRequired: "Please select the agency that onboarded you",
			logoRequired: "Logo is required",
			logoMaxSize: "Logo must be 5 MB or smaller",
			logoImageType: "Logo must be an image file",
			ackPersonalInfo: "Please acknowledge the Personal Information Disclaimer",
			ackDeclarationOfTruth: "Please acknowledge the Declaration of Truth",
			ackInformationSharing:
				"Please acknowledge Outlet & Agency Information Sharing",
			acceptTerms: "You must accept the Terms & Conditions",
		},
	},
	zh: {
		meta: {
			title: "注册 — InnocenZ",
			description: "创建 InnocenZ 门店或 PR 代理账户。",
		},
		aside: {
			description: "排班、班次与薪资，一个门户全部搞定。",
			rightsReserved: "版权所有。",
		},
		backToLogin: "返回登录",
		heading: {
			line1: "创建您的",
			line2: "账户",
			sub: "以门店或 PR 代理身份注册，填写公司资料并选择套餐。",
		},
		sections: {
			accountType: "账户类型",
			companyInfo: "公司信息",
			contactInfo: "联系信息",
			loginCredentials: "登录凭据",
			packageEnrollment: "套餐注册",
			branding: "品牌标识",
			acknowledgements: "确认事项",
			terms: "条款与条件",
		},
		progress: { label: "填写进度" },
		accountTypes: {
			outlet: {
				title: "门店",
				description: "管理现场员工、班次与每晚营收的门店运营方。",
			},
			agency: {
				title: "PR 代理",
				description: "跨门店管理排班、人力与薪资的 PR 代理。",
			},
		},
		fields: {
			companyName: {
				label: "公司名称",
				placeholder: "注册公司名称",
			},
			companyRegistrationOld: {
				label: "旧公司注册号",
				placeholder: "例如 123456-A",
			},
			companyRegistrationNew: {
				label: "新公司注册号",
				placeholder: "例如 202601024567",
			},
			businessLicense: {
				label: "营业执照",
				placeholder: "例如 DBKL.BP.2026.01452",
			},
			addressLine1: {
				label: "地址第一行",
				placeholder: "街道、楼宇、单位",
			},
			addressLine2: {
				label: "地址第二行",
				placeholder: "楼层、套房、地标",
			},
			city: {
				label: "城市",
				placeholder: "选择城市",
				chooseStateFirst: "请先选择州属",
			},
			postcode: {
				label: "邮编",
				placeholder: "例如 50450",
			},
			state: {
				label: "州属",
				placeholder: "选择州属",
			},
			country: {
				label: "国家",
				value: "马来西亚",
				notice: "目前仅支持马来西亚。",
			},
			personInCharge: {
				label: "全名（与身份证一致）",
				placeholder: "请填写身份证上的名字",
				hint: "该名字将用于您的账号与我们签发的所有单据。",
			},
			idType: {
				label: "证件类型",
				nric: "身份证（马来西亚）",
				passport: "护照",
			},
			idNo: {
				label: "证件号码",
				placeholderNric: "例如 950312-14-8821",
				placeholderPassport: "例如 A12345678",
			},
			gender: {
				label: "性别",
				male: "男",
				female: "女",
				hint: "身份证也包含性别，我们会核对两者。",
			},
			dob: { label: "出生日期", placeholder: "YYYY-MM-DD" },
			nationality: { label: "国籍", placeholder: "例如 新加坡" },
			icDerived: "根据身份证：出生于 {date} · 年龄 {age}",
			phoneNum: {
				label: "联系电话",
				placeholder: "例如 123456789",
				dialDisplay: "🇲🇾 +60",
				dialNotice: "目前仅支持马来西亚号码。",
			},
			email: {
				label: "电子邮箱",
				placeholder: "contact@company.com",
				description: "用于账户通信的业务联系邮箱。",
			},
			loginEmail: {
				label: "登录邮箱",
				placeholder: "you@company.com",
				description: "此邮箱将用于登录您的门户。",
				sameAsCompanyEmail: "与公司邮箱相同",
			},
			password: {
				label: "密码",
				placeholder: "至少 8 个字符",
			},
			confirmPassword: {
				label: "确认密码",
				placeholder: "再次输入密码",
			},
			package: {
				label: "注册套餐",
				placeholder: "选择定价套餐",
			},
			onboardingAgency: {
				label: "引荐代理",
				placeholder: "选择引荐您加入的代理",
				description:
					"将您的门店引入 InnocenZ 的公关代理。您发布的每个班次都会发送给该代理——账户审批时由管理员确认。",
				loading: "正在加载代理…",
				loadFailed: "无法加载代理",
				empty: "目前没有可选的活跃代理。",
				retry: "重试",
			},
			logo: {
				labelOutlet: "门店标志",
				labelAgency: "代理标志",
				uploadTitleOutlet: "上传门店标志",
				uploadTitleAgency: "上传代理标志",
				uploadHint: "PNG、JPG 或 WEBP，最大 5 MB",
			},
		},
		searchPlaceholder: "搜索…",
		noResults: "未找到结果。",
		privacyPolicy: "隐私政策",
		packages: {
			loadingShort: "正在加载套餐…",
			loadingLong: "正在从目录加载套餐…",
			loadFailed: "无法加载套餐",
		},
		acknowledgements: {
			personalInfo: {
				title: "个人信息免责声明",
				body: "您的公司注册文件、业务联系方式和注册地址均安全存储于 InnocenZ。仅 InnocenZ 合规人员及获授权支持您门店或代理账户的平台运营人员可访问此数据——其他门店、代理及 PR 专业人士无法查看您的私人商业记录。",
			},
			declarationOfTruth: {
				title: "真实性声明",
				body: "本人声明代表此门店或代理提交的所有公司信息和文件均真实、最新且准确。本人理解虚假或误导性陈述可能导致账户暂停或从平台移除。",
			},
			informationSharing: {
				title: "门店与代理信息共享",
				body: "您的门店或代理资料可能会与 InnocenZ 上关联的 PR 代理和劳动力参与者共享，用于排班、班次协调、薪资及合规目的。共享信息仅限于运营预订、班次和支付凭证所需范围。",
			},
			terms: {
				title: "条款与条件",
				body: "本人同意 InnocenZ 平台规则、班次封存、佣金透明及争议处理流程，如 InnocenZ 门店与代理条款所述。继续使用平台即表示接受条款更新。",
			},
			termsCheckboxPrefix: "本人已阅读并同意",
			termsCheckboxLink: "条款与条件",
			done: "完成",
		},
		buttons: {
			createAccount: "创建账户",
			creating: "正在创建账户…",
		},
		footer: {
			alreadyHaveAccount: "已有账户？",
			signIn: "登录",
		},
		success: {
			title: "注册成功",
			bodyOutlet:
				"您的门店账户已提交，等待 InnocenZ 管理员审批。您现在可以登录并更新个人资料；其他门户功能将在获批后开放。账户获批后，您将收到电子邮件通知。",
			bodyAgency:
				"您的 PR 代理账户已提交，等待 InnocenZ 管理员审批。您现在可以登录并更新个人资料；其他门户功能将在获批后开放。账户获批后，您将收到电子邮件通知。",
			logoUploadFailed: "账户已创建，但标志未能保存。请在“设置”中重新上传。",
			continueToLogin: "返回登录",
		},
		errors: {
			registrationFailed: "注册失败，请重试。",
			internalServerError: "服务器发生错误，请稍后再试。",
			unexpected: "发生意外错误，请重试。",
		},
		validation: {
			companyNameRequired: "公司名称为必填项",
			addressLine1Required: "街道地址为必填项",
			addressLine1Max: "地址不得超过 255 个字符",
			cityRequired: "城市为必填项",
			cityMax: "城市名称不得超过 100 个字符",
			postcodeRequired: "邮政编码为必填项",
			postcodeMax: "邮政编码不得超过 20 个字符",
			stateRequired: "州属为必填项",
			companyNameMax: "公司名称不能超过 150 个字符",
			companyRegistrationNewRequired: "新公司注册号为必填项",
			registrationNumberMax: "注册号过长",
			companyRegistrationNewFormat:
				"SSM 注册号为 12 位数字 — 年份、实体代码、流水号（例如 202601024567）",
			companyRegistrationOldFormat: "旧格式为数字加字母，例如 1456789-W",
			businessLicenseRequired: "营业执照为必填项",
			businessLicenseMax: "营业执照号过长",
			personInChargeRequired: "全名为必填项",
			personInChargeMax: "姓名不能超过 100 个字符",
			idTypeRequired: "请选择证件类型",
			genderRequired: "性别为必填项",
			idNoRequired: "证件号码为必填项",
			idNoMax: "证件号码不能超过 32 个字符",
			nricInvalid: "身份证号码无效 — 应为 12 位数字，开头为出生日期",
			genderMismatch: "与身份证号码不符 — 请核对号码与所选性别",
			dobRequired: "出生日期为必填项（YYYY-MM-DD）",
			nationalityRequired: "国籍为必填项",
			phoneRequired: "请输入有效的手机号码",
			phoneMax: "手机号码过长",
			phoneMin: "手机号码过短",
			emailRequired: "电子邮箱为必填项",
			emailInvalid: "请输入有效的电子邮箱",
			loginEmailRequired: "登录邮箱为必填项",
			loginEmailInvalid: "请输入有效的登录邮箱",
			passwordRequired: "密码为必填项",
			passwordMin: "密码至少需要 8 个字符",
			confirmPasswordRequired: "请确认密码",
			passwordsMismatch: "两次输入的密码不一致",
			packageRequired: "请选择套餐",
			onboardingAgencyRequired: "请选择引荐您加入的代理",
			logoRequired: "标志为必填项",
			logoMaxSize: "标志文件不能超过 5 MB",
			logoImageType: "标志必须是图片文件",
			ackPersonalInfo: "请确认个人信息免责声明",
			ackDeclarationOfTruth: "请确认真实性声明",
			ackInformationSharing: "请确认门店与代理信息共享",
			acceptTerms: "您必须接受条款与条件",
		},
	},
};
