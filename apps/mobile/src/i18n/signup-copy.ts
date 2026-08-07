/**
 * PR signup wizard field copy (steps 1–6 + acknowledgements).
 * Nested under `t.signup` via translations.ts.
 */
import type { AppLocale } from './locale-prefs';

export type SignupFieldCopy = {
  nickname: string;
  nicknameHint: string;
  nicknamePlaceholder: string;
  fullName: string;
  fullNameHint: string;
  fullNamePlaceholder: string;
  choose: string;
  phoneNumber: string;
  phoneHint: string;
  phonePlaceholder: string;
  dialCode: string;
  dialTitle: string;
  email: string;
  emailPlaceholder: string;
  nationality: string;
  idType: string;
  dob: string;
  dobPlaceholder: string;
  idNo: string;
  idNoSelectTypeFirst: string;
  idNoNricPlaceholder: string;
  idNoDocPlaceholder: string;
  height: string;
  weight: string;
  inCm: string;
  inKg: string;
  bwh: string;
  bwhHint: string;
  bust: string;
  waist: string;
  hip: string;
  preferredLanguages: string;

  addressLine1: string;
  addressLine1Placeholder: string;
  addressLine2: string;
  addressLine2Placeholder: string;
  city: string;
  cityPlaceholder: string;
  country: string;
  state: string;
  stateProvince: string;
  stateHintNeedCountry: string;
  chooseCountryFirst: string;
  stateOrProvincePlaceholder: string;
  postcode: string;
  postcodePlaceholder: string;

  joiningHow: string;
  joiningHint: string;
  pickAgency: string;
  joiningOwn: string;
  whichAgency: string;
  askAgency: string;
  searchAgency: string;
  loadingAgencies: string;
  noAgencies: string;
  noAgencyMatch: string;
  agencyLoadFailed: string;
  tryAgain: string;
  agencyCalloutReferred: string;
  agencyCalloutIndependent: string;

  idCameraTitle: string;
  idCameraBody: string;
  idCameraAllow: string;
  idCameraNotNow: string;
  remove: string;
  retake: string;
  openCamera: string;
  idFront: string;
  idBack: string;
  passportPage: string;
  readingSide: string;
  readingPassport: string;
  idSideHint: string;
  idMatched: string;
  wrongSide: string;
  photoMismatch: string;
  photoMissingId: string;
  unreadableSide: string;
  unreadablePassport: string;
  ocrUnavailable: string;
  passportMatched: string;
  passportMismatch: string;
  passportMissing: string;
  passportHint: string;
  idVerifyIntro: string;
  idVerifyOk: string;
  /** Shown when returning to Step 4 with photos already verified. */
  idVerifyKept: string;
  idVerifyContinueHint: string;
  idVerifyOkHint: string;

  yourNickname: string;
  legalName: string;
  yourPhotos: string;
  profilePhoto: string;
  profilePhotoHint: string;
  portfolio: string;
  optional: string;
  portfolioHint: string;
  portfolioHintCount: string;
  cardTag: string;
  addPhotos: string;
  camera: string;
  gallery: string;
  review: string;
  comcardPreview: string;
  comcardAuto: string;
  comcardHint: string;
  comcardEmpty: string;
  ageStat: string;
  reviewIdentity: string;
  reviewAddress: string;
  reviewAgency: string;
  referralYes: string;
  referralNo: string;
  loginPassword: string;
  agreeContinue: string;
  heightWeight: string;
  languages: string;
  referral: string;
  addedBy: string;
  askingToJoin: string;
  docNric: string;
  docPassport: string;
  docWorkPermit: string;
  sideFront: string;
  sideBack: string;
  wrongSideUnknown: string;
  wrongSideLooksLike: string;
  password: string;
  passwordPlaceholder: string;
  confirmPassword: string;
  confirmPasswordPlaceholder: string;
  ackPersonalInfo: string;
  ackDeclaration: string;
  ackSharing: string;
  ackTermsPrefix: string;
  ackTermsLink: string;
  ackDone: string;
  disclaimerPersonalTitle: string;
  disclaimerPersonalBody: string;
  disclaimerTruthTitle: string;
  disclaimerTruthBody: string;
  disclaimerSharingTitle: string;
  disclaimerSharingBody: string;
  disclaimerTermsTitle: string;
  disclaimerTermsBody: string;

  otpLead: string;
  otpHint: string;
  pasteCode: string;
  resendIn: string;
  resendOtp: string;

  nicknameRequired: string;
  fullNameRequired: string;
  dialRequired: string;
  phoneShort: string;
  nationalityRequired: string;
  idTypeRequired: string;
  nricMalaysianOnly: string;
  dobRequired: string;
  idNoSelectFirst: string;
  idNoRequired: string;
  languagesRequired: string;
  addressLine1Required: string;
  cityRequired: string;
  postcodeRequired: string;
  stateRequired: string;
  countryRequired: string;
  joiningRequired: string;
  agencyRequired: string;
  profileRequired: string;
  idFrontRequired: string;
  idPassportPageRequired: string;
  idFrontOcrFail: string;
  idPassportOcrFail: string;
  idBackRequired: string;
  idBackOcrFail: string;
  searchCountryOrCode: string;
  searchLanguages: string;
  chooseLanguages: string;
  otherLanguage: string;
  noMatches: string;
  noLangMatches: string;
  add: string;
  done: string;
  doneSelected: string;
  confirm: string;
  year: string;
  month: string;
  day: string;
  monthJan: string;
  monthFeb: string;
  monthMar: string;
  monthApr: string;
  monthMay: string;
  monthJun: string;
  monthJul: string;
  monthAug: string;
  monthSep: string;
  monthOct: string;
  monthNov: string;
  monthDec: string;
  passwordRequired: string;
  passwordMin: string;
  confirmRequired: string;
  passwordMismatch: string;
  ackRequired: string;
  fixHighlighted: string;

  toastVerifyPhoneFailed: string;
  toastCodeSent: string;
  toastCodeResent: string;
  toastPhoneTaken: string;
  toastSendCodeFailed: string;
  toastOtpIncomplete: string;
  toastPhotosPartial: string;
  toastOtpExpired: string;
  toastRegisterFailed: string;
  toastOtpWrong: string;
};

const en: SignupFieldCopy = {
  nickname: 'Nickname*',
  nicknameHint: 'Shown on roster and the outlet floor.',
  nicknamePlaceholder: 'E.g. Moon, Charlotte',
  fullName: 'Full name*',
  fullNameHint: 'As on your IC / passport.',
  fullNamePlaceholder: 'E.g. Joe Low',
  choose: 'Choose',
  phoneNumber: 'Phone number*',
  phoneHint: 'Must be registered on WhatsApp',
  phonePlaceholder: 'E.g. 123456789',
  dialCode: 'Code',
  dialTitle: 'Country & dial code',
  email: 'Email',
  emailPlaceholder: 'you@example.com',
  nationality: 'Nationality*',
  idType: 'ID type*',
  dob: 'Date of birth*',
  dobPlaceholder: 'YYYY-MM-DD',
  idNo: 'ID No*',
  idNoSelectTypeFirst: 'Please select ID type first',
  idNoNricPlaceholder: '1234881234',
  idNoDocPlaceholder: 'Document number',
  height: 'Height',
  weight: 'Weight',
  inCm: 'in cm',
  inKg: 'in kg',
  bwh: '3 dimensions (BWH)',
  bwhHint: 'Optional — Bust · Waist · Hip in cm',
  bust: 'Bust',
  waist: 'Waist',
  hip: 'Hip',
  preferredLanguages: 'Preferred languages*',

  addressLine1: 'Address line 1*',
  addressLine1Placeholder: 'Unit, street',
  addressLine2: 'Address line 2',
  addressLine2Placeholder: 'Area',
  city: 'City*',
  cityPlaceholder: 'City',
  country: 'Country*',
  state: 'State*',
  stateProvince: 'State / province*',
  stateHintNeedCountry: 'Choose a country first — the list depends on it.',
  chooseCountryFirst: 'Choose country first',
  stateOrProvincePlaceholder: 'State or province',
  postcode: 'Postcode*',
  postcodePlaceholder: 'Postcode',

  joiningHow: 'How are you joining?*',
  joiningHint: 'An agency still has to add you before you can be given shifts.',
  pickAgency: 'Pick an agency',
  joiningOwn: 'Joining on my own',
  whichAgency: 'Which agency added you?*',
  askAgency: 'Ask an agency to accept you',
  searchAgency: 'Search by agency name',
  loadingAgencies: 'Loading agencies…',
  noAgencies: 'No agencies are listed yet.',
  noAgencyMatch: 'No agency matches “{q}”.',
  agencyLoadFailed: 'Could not load the agency list.',
  tryAgain: 'Try again',
  agencyCalloutReferred:
    'Tell your agency your floor nickname and mobile number — they link you from Manage PR.',
  agencyCalloutIndependent:
    'They still have to accept you before you can be given shifts.',

  idCameraTitle: 'Camera access',
  idCameraBody:
    'InnocenZ needs the camera to photograph your ID for verification. Photos stay on this device until you submit.',
  idCameraAllow: 'Allow',
  idCameraNotNow: 'Not now',
  remove: 'Remove',
  retake: 'Retake',
  openCamera: 'Open camera',
  idFront: '1. {doc} front*',
  idBack: '2. {doc} back*',
  passportPage: '1. {doc} photo page*',
  readingSide: 'Reading {side} ID…',
  readingPassport: 'Reading passport number…',
  idSideHint:
    '{side} must show that face of your ID — number checked too.',
  idMatched: 'ID matched on {side}: {seen}',
  wrongSide:
    'Wrong side — this photo {got}. Capture the {expected}.',
  photoMismatch:
    'Photo shows {seen}, but you entered {expected}. Retake or fix Step 1.',
  photoMissingId: 'Could not find ID {expected} on the {side}. Retake a clearer shot.',
  unreadableSide:
    'Could not read any ID number on the {side}. Retake with better light, no glare.',
  unreadablePassport:
    'Could not read the passport number. Retake with better light, no glare.',
  ocrUnavailable:
    'OCR is not available in this build — use the phone app with ML Kit. Cannot skip.',
  passportMatched: 'Passport number matched: {seen}',
  passportMismatch:
    'Photo shows {seen}, but you entered {expected}. Retake or fix Step 1.',
  passportMissing:
    'Could not find passport {expected} on the page. Retake a clearer shot.',
  passportHint: 'Passport photo page will be checked against your passport number.',
  idVerifyIntro: 'Capture clear photos of your ID. We check the number matches Step 1.',
  idVerifyOk: 'ID photos verified',
  idVerifyKept: 'ID already verified',
  idVerifyContinueHint: 'Photos are still saved. Tap Continue to go to the next step.',
  idVerifyOkHint: 'Tap Continue to go to the next step.',

  yourNickname: 'Your nickname',
  legalName: 'Legal name',
  yourPhotos: 'YOUR PHOTOS',
  profilePhoto: 'Profile*',
  profilePhotoHint: 'Avatar · face clear · camera or gallery',
  portfolio: 'Portfolio',
  optional: 'Optional',
  portfolioHint: 'Up to {max} gallery photos (multi-select OK) — first 4 build your comcard',
  portfolioHintCount: ' · {count}/{max}',
  cardTag: 'card',
  addPhotos: 'Add photos',
  camera: 'Camera',
  gallery: 'Gallery',
  review: 'Review',
  comcardPreview: 'Comcard preview',
  comcardAuto: 'Auto',
  comcardHint:
    'Built from your portfolio (same layout as Profile). Saved after you create the account.',
  comcardEmpty: 'Add portfolio photos above to preview your comcard.',
  ageStat: 'Age {age}',
  reviewIdentity: 'Identity',
  reviewAddress: 'Address',
  reviewAgency: 'Agency',
  referralYes: 'Yes — referred',
  referralNo: 'No — asking to join',
  loginPassword: 'LOGIN PASSWORD',
  agreeContinue: 'AGREE & CONTINUE',
  heightWeight: 'Height / Weight',
  languages: 'Languages',
  referral: 'Referral',
  addedBy: 'Added by',
  askingToJoin: 'Asking to join',
  docNric: 'NRIC',
  docPassport: 'passport',
  docWorkPermit: 'work permit',
  sideFront: 'Front',
  sideBack: 'Back',
  wrongSideUnknown: 'could not confirm the side',
  wrongSideLooksLike: 'looks like the {detected}',
  password: 'Password*',
  passwordPlaceholder: 'Min 6 characters',
  confirmPassword: 'Confirm*',
  confirmPasswordPlaceholder: 'Repeat password',
  ackPersonalInfo: 'I have read and agree to the Personal Information Disclaimer',
  ackDeclaration: 'I confirm the Declaration of Truth',
  ackSharing: 'I agree to Agency Information Sharing',
  ackTermsPrefix: 'I have read and agree to the ',
  ackTermsLink: 'Terms and Conditions',
  ackDone: 'Done',
  disclaimerPersonalTitle: 'Personal Information Disclaimer',
  disclaimerPersonalBody:
    'By submitting this registration, you consent to the collection and use of your personal information — including your full name, IC/NRIC or passport number, date of birth, contact details, address, identity photos, and related data — by InnocenZ for the purposes of account management, shift coordination, and official correspondence.\n\nYour information will be handled in accordance with our Privacy Policy and applicable data protection laws. We will not share your personal data with third parties without your consent, except as required by law or as described under Agency Information Sharing.',
  disclaimerTruthTitle: 'Declaration of Truth',
  disclaimerTruthBody:
    'I hereby declare that all information provided in this registration form is true, accurate, and complete to the best of my knowledge.\n\nI understand that providing false or misleading information may result in:\n  • Rejection of my account application\n  • Cancellation of an approved account\n  • Potential legal consequences depending on the nature of the false information\n\nI agree to notify InnocenZ promptly if any of the information provided changes.',
  disclaimerSharingTitle: 'Agency Information Sharing',
  disclaimerSharingBody:
    'By registering as a PR on InnocenZ, you consent to sharing relevant profile information — including your floor nickname, contact details, photos, and work-related profile data — with linked agencies and outlets for rostering, shift coordination, and payment purposes.\n\nSensitive identity documents (IC/NRIC, passport photos) remain restricted to InnocenZ compliance staff and authorized platform operators. Information shared with agencies and outlets is limited to what is required to operate bookings, shifts, and payment vouchers on the platform, except as required by law.',
  disclaimerTermsTitle: 'Terms and Conditions',
  disclaimerTermsBody:
    'By creating an InnocenZ PR account, you agree to the InnocenZ platform rules, including shift booking and sealing, commission transparency, payment voucher processes, and dispute handling.\n\nYou agree to use the platform lawfully and in good faith, keep your login credentials secure, and not misrepresent your identity or work eligibility.\n\nYour personal data is processed as described in the InnocenZ Privacy Policy. Continued use of the platform constitutes acceptance of updates to these Terms and Conditions and the Privacy Policy.',

  otpLead: 'Enter the 6-digit code sent on WhatsApp to {phone}',
  otpHint:
    'After WhatsApp Copy code, tap Paste code — or long-press the box and Paste.',
  pasteCode: 'Paste code',
  resendIn: 'Resend in {s}s',
  resendOtp: 'Resend OTP',

  nicknameRequired: 'Nickname is required.',
  fullNameRequired: 'Full name is required.',
  dialRequired: 'Please choose a country dial code.',
  phoneShort: 'That mobile number looks too short.',
  nationalityRequired: 'Nationality is required.',
  idTypeRequired: 'Please select an ID type.',
  nricMalaysianOnly: 'NRIC is only for Malaysian nationality. Use Passport or Work permit.',
  dobRequired: 'Date of birth is required.',
  idNoSelectFirst: 'Please select ID type first.',
  idNoRequired: 'ID number is required.',
  languagesRequired: 'Pick at least one preferred language.',
  addressLine1Required: 'Address line 1 is required.',
  cityRequired: 'City is required.',
  postcodeRequired: 'Postcode is required.',
  stateRequired: 'Please choose a state.',
  countryRequired: 'Please choose a country.',
  joiningRequired: 'Please choose how you are joining.',
  agencyRequired: 'Please select an agency.',
  profileRequired: 'Profile photo is required.',
  idFrontRequired: 'Capture the front of your ID.',
  idPassportPageRequired: 'Capture the passport photo page.',
  idFrontOcrFail:
    'Front photo must be the front of your ID and show the correct ID number. Retake.',
  idPassportOcrFail:
    'Passport number on the photo must match what you entered. Retake.',
  idBackRequired: 'Capture the back of your ID.',
  idBackOcrFail:
    'Back photo must be the back of your ID and show the correct ID number. Retake.',
  searchCountryOrCode: 'Search country or code',
  searchLanguages: 'Search languages',
  chooseLanguages: 'Choose languages',
  otherLanguage: 'Other language',
  noMatches: 'No matches.',
  noLangMatches: 'No matches — add it below.',
  add: 'Add',
  done: 'Done',
  doneSelected: 'Done · {count} selected',
  confirm: 'Confirm',
  year: 'Year',
  month: 'Month',
  day: 'Day',
  monthJan: 'Jan',
  monthFeb: 'Feb',
  monthMar: 'Mar',
  monthApr: 'Apr',
  monthMay: 'May',
  monthJun: 'Jun',
  monthJul: 'Jul',
  monthAug: 'Aug',
  monthSep: 'Sep',
  monthOct: 'Oct',
  monthNov: 'Nov',
  monthDec: 'Dec',
  passwordRequired: 'Password is required.',
  passwordMin: 'Password must be at least 6 characters.',
  confirmRequired: 'Please confirm your password.',
  passwordMismatch: 'Passwords do not match.',
  ackRequired: 'Please accept all acknowledgements.',
  fixHighlighted: 'Please fix the highlighted fields.',

  toastVerifyPhoneFailed: 'Could not verify phone / ID — try again.',
  toastCodeSent: 'Code sent on WhatsApp to {phone}.',
  toastCodeResent: 'A new code is on its way.',
  toastPhoneTaken: 'That number already has an account. Use another, or sign in.',
  toastSendCodeFailed: 'Could not send the code — please try again.',
  toastOtpIncomplete: 'Enter all six digits.',
  toastPhotosPartial: 'Account created. Some photos failed to upload — try signing up again if ID photos are missing.',
  toastOtpExpired: 'That code expired. Tap Resend for a new one.',
  toastRegisterFailed:
    'Could not finish creating your account. Tap Verify & submit again.',
  toastOtpWrong: 'That code is not right. Check and try again.',
};

const zh: SignupFieldCopy = {
  nickname: '昵称*',
  nicknameHint: '显示在排班表与门店现场。',
  nicknamePlaceholder: '例如 Moon、Charlotte',
  fullName: '全名*',
  fullNameHint: '与身份证 / 护照一致。',
  fullNamePlaceholder: '例如 Joe Low',
  choose: '请选择',
  phoneNumber: '手机号码*',
  phoneHint: '须已注册 WhatsApp',
  phonePlaceholder: '例如 123456789',
  dialCode: '区号',
  dialTitle: '国家与区号',
  email: '电子邮箱',
  emailPlaceholder: 'you@example.com',
  nationality: '国籍*',
  idType: '证件类型*',
  dob: '出生日期*',
  dobPlaceholder: 'YYYY-MM-DD',
  idNo: '证件号码*',
  idNoSelectTypeFirst: '请先选择证件类型',
  idNoNricPlaceholder: '1234881234',
  idNoDocPlaceholder: '证件号码',
  height: '身高',
  weight: '体重',
  inCm: '厘米',
  inKg: '公斤',
  bwh: '三围 (BWH)',
  bwhHint: '选填 — 胸围 · 腰围 · 臀围（厘米）',
  bust: '胸围',
  waist: '腰围',
  hip: '臀围',
  preferredLanguages: '擅长语言*',

  addressLine1: '地址第 1 行*',
  addressLine1Placeholder: '门牌、街道',
  addressLine2: '地址第 2 行',
  addressLine2Placeholder: '区域',
  city: '城市*',
  cityPlaceholder: '城市',
  country: '国家*',
  state: '州属*',
  stateProvince: '州 / 省*',
  stateHintNeedCountry: '请先选择国家 — 列表会随之变化。',
  chooseCountryFirst: '请先选择国家',
  stateOrProvincePlaceholder: '州或省',
  postcode: '邮编*',
  postcodePlaceholder: '邮编',

  joiningHow: '你如何加入？*',
  joiningHint: '获得班次前，仍须由经纪公司添加你。',
  pickAgency: '选择经纪公司',
  joiningOwn: '自行加入',
  whichAgency: '哪家经纪公司添加了你？*',
  askAgency: '请经纪公司接受你',
  searchAgency: '按经纪公司名称搜索',
  loadingAgencies: '正在加载经纪公司…',
  noAgencies: '暂无经纪公司列表。',
  noAgencyMatch: '没有匹配 “{q}” 的经纪公司。',
  agencyLoadFailed: '无法加载经纪公司列表。',
  tryAgain: '重试',
  agencyCalloutReferred:
    '请告知经纪公司你的昵称和手机号 — 他们可在「管理 PR」中关联你。',
  agencyCalloutIndependent: '他们仍须接受你之后，你才能被安排班次。',

  idCameraTitle: '相机权限',
  idCameraBody:
    'InnocenZ 需要使用相机拍摄证件以完成核验。提交前照片仅保存在本机。',
  idCameraAllow: '允许',
  idCameraNotNow: '暂不',
  remove: '移除',
  retake: '重拍',
  openCamera: '打开相机',
  idFront: '1. {doc} 正面*',
  idBack: '2. {doc} 背面*',
  passportPage: '1. {doc} 资料页*',
  readingSide: '正在识别{side}证件…',
  readingPassport: '正在识别护照号码…',
  idSideHint: '{side}须为证件该面 — 并核对号码。',
  idMatched: '{side}证件已匹配：{seen}',
  wrongSide: '面别错误 — 此照片{got}。请拍摄{expected}。',
  photoMismatch: '照片显示 {seen}，但你填写的是 {expected}。请重拍或返回第 1 步修改。',
  photoMissingId: '在{side}未找到证件号 {expected}。请拍更清晰的照片。',
  unreadableSide: '无法读取{side}上的证件号。请改善光线、避免反光后重拍。',
  unreadablePassport: '无法读取护照号码。请改善光线、避免反光后重拍。',
  ocrUnavailable: '此版本无法使用 OCR — 请使用带 ML Kit 的手机应用。无法跳过。',
  passportMatched: '护照号码已匹配：{seen}',
  passportMismatch: '照片显示 {seen}，但你填写的是 {expected}。请重拍或返回第 1 步修改。',
  passportMissing: '页面上未找到护照号 {expected}。请拍更清晰的照片。',
  passportHint: '将核对护照资料页与你填写的护照号码。',
  idVerifyIntro: '请拍摄清晰的证件照片。我们会核对号码与第 1 步是否一致。',
  idVerifyOk: '证件照片已核验',
  idVerifyKept: '证件已核验',
  idVerifyContinueHint: '照片仍保留。点继续进入下一步。',
  idVerifyOkHint: '点继续进入下一步。',

  yourNickname: '你的昵称',
  legalName: '法定姓名',
  yourPhotos: '你的照片',
  profilePhoto: '头像*',
  profilePhotoHint: '头像 · 面部清晰 · 相机或相册',
  portfolio: '作品集',
  optional: '选填',
  portfolioHint: '最多 {max} 张相册照片（可多选）— 前 4 张用于名片卡',
  portfolioHintCount: ' · {count}/{max}',
  cardTag: '名片',
  addPhotos: '添加照片',
  camera: '相机',
  gallery: '相册',
  review: '核对',
  comcardPreview: '名片卡预览',
  comcardAuto: '自动',
  comcardHint: '由作品集生成（与个人资料相同布局）。创建账户后保存。',
  comcardEmpty: '请先在上方添加作品集照片以预览名片卡。',
  ageStat: '年龄 {age}',
  reviewIdentity: '身份信息',
  reviewAddress: '地址',
  reviewAgency: '经纪公司',
  referralYes: '是 — 经推荐',
  referralNo: '否 — 申请加入',
  loginPassword: '登录密码',
  agreeContinue: '同意并继续',
  heightWeight: '身高 / 体重',
  languages: '语言',
  referral: '推荐',
  addedBy: '添加方',
  askingToJoin: '申请加入',
  docNric: '身份证',
  docPassport: '护照',
  docWorkPermit: '工作准证',
  sideFront: '正面',
  sideBack: '背面',
  wrongSideUnknown: '无法确认面别',
  wrongSideLooksLike: '看起来像{detected}',
  password: '密码*',
  passwordPlaceholder: '至少 6 个字符',
  confirmPassword: '确认*',
  confirmPasswordPlaceholder: '再次输入密码',
  ackPersonalInfo: '我已阅读并同意《个人信息免责声明》',
  ackDeclaration: '我确认《真实性声明》',
  ackSharing: '我同意《经纪公司信息共享》',
  ackTermsPrefix: '我已阅读并同意',
  ackTermsLink: '条款与条件',
  ackDone: '完成',
  disclaimerPersonalTitle: '个人信息免责声明',
  disclaimerPersonalBody:
    '提交本注册即表示你同意 InnocenZ 为账户管理、班次协调与正式通信之目的，收集并使用你的个人信息 — 包括全名、身份证/护照号码、出生日期、联系方式、地址、身份证件照片及相关数据。\n\n你的信息将按隐私政策及适用数据保护法律处理。未经你同意，我们不会与第三方共享你的个人数据，法律要求或「经纪公司信息共享」所述情形除外。',
  disclaimerTruthTitle: '真实性声明',
  disclaimerTruthBody:
    '本人声明，本注册表中所填信息据本人所知均为真实、准确、完整。\n\n本人理解提供虚假或误导信息可能导致：\n  • 拒绝账户申请\n  • 取消已批准账户\n  • 视情节承担相应法律后果\n\n本人同意在信息变更时及时通知 InnocenZ。',
  disclaimerSharingTitle: '经纪公司信息共享',
  disclaimerSharingBody:
    '以 PR 身份注册 InnocenZ，即表示你同意向关联经纪公司与门店共享相关资料信息 — 包括现场昵称、联系方式、照片及工作相关资料 — 用于排班、班次协调与支付。\n\n敏感身份证件（身份证/护照照片）仅限 InnocenZ 合规人员及获授权平台运营人员访问。与经纪公司及门店共享的信息仅限于运营预订、班次与支付凭证所需，法律另有要求除外。',
  disclaimerTermsTitle: '条款与条件',
  disclaimerTermsBody:
    '创建 InnocenZ PR 账户即表示你同意平台规则，包括班次预订与封存、佣金透明、支付凭证流程与争议处理。\n\n你同意合法善意使用平台，妥善保管登录凭证，不得虚报身份或工作资格。\n\n个人数据处理见 InnocenZ 隐私政策。继续使用平台即表示接受条款与隐私政策的更新。',

  otpLead: '请输入发送至 WhatsApp {phone} 的 6 位验证码',
  otpHint: 'WhatsApp 复制验证码后，点「粘贴验证码」— 或长按输入框粘贴。',
  pasteCode: '粘贴验证码',
  resendIn: '{s} 秒后可重发',
  resendOtp: '重发验证码',

  nicknameRequired: '请填写昵称。',
  fullNameRequired: '请填写全名。',
  dialRequired: '请选择国家区号。',
  phoneShort: '手机号码过短。',
  nationalityRequired: '请填写国籍。',
  idTypeRequired: '请选择证件类型。',
  nricMalaysianOnly: 'NRIC 仅适用于马来西亚籍。请使用护照或工作准证。',
  dobRequired: '请填写出生日期。',
  idNoSelectFirst: '请先选择证件类型。',
  idNoRequired: '请填写证件号码。',
  languagesRequired: '请至少选择一种语言。',
  addressLine1Required: '请填写地址第 1 行。',
  cityRequired: '请填写城市。',
  postcodeRequired: '请填写邮编。',
  stateRequired: '请选择州属。',
  countryRequired: '请选择国家。',
  joiningRequired: '请选择加入方式。',
  agencyRequired: '请选择经纪公司。',
  profileRequired: '请上传头像。',
  idFrontRequired: '请拍摄证件正面。',
  idPassportPageRequired: '请拍摄护照资料页。',
  idFrontOcrFail: '正面照片须为证件正面且号码正确。请重拍。',
  idPassportOcrFail: '照片上的护照号须与填写一致。请重拍。',
  idBackRequired: '请拍摄证件背面。',
  idBackOcrFail: '背面照片须为证件背面且号码正确。请重拍。',
  searchCountryOrCode: '搜索国家或区号',
  searchLanguages: '搜索语言',
  chooseLanguages: '选择语言',
  otherLanguage: '其他语言',
  noMatches: '无匹配结果。',
  noLangMatches: '无匹配 — 可在下方添加。',
  add: '添加',
  done: '完成',
  doneSelected: '完成 · 已选 {count} 项',
  confirm: '确认',
  year: '年',
  month: '月',
  day: '日',
  monthJan: '1月',
  monthFeb: '2月',
  monthMar: '3月',
  monthApr: '4月',
  monthMay: '5月',
  monthJun: '6月',
  monthJul: '7月',
  monthAug: '8月',
  monthSep: '9月',
  monthOct: '10月',
  monthNov: '11月',
  monthDec: '12月',
  passwordRequired: '请填写密码。',
  passwordMin: '密码至少 6 个字符。',
  confirmRequired: '请确认密码。',
  passwordMismatch: '两次密码不一致。',
  ackRequired: '请勾选全部确认事项。',
  fixHighlighted: '请修正标红的字段。',

  toastVerifyPhoneFailed: '无法验证手机 / 证件 — 请重试。',
  toastCodeSent: '验证码已发送至 WhatsApp {phone}。',
  toastCodeResent: '新验证码正在发送。',
  toastPhoneTaken: '该号码已有账户。请换号，或直接登录。',
  toastSendCodeFailed: '无法发送验证码 — 请重试。',
  toastOtpIncomplete: '请输入完整 6 位验证码。',
  toastPhotosPartial: '账户已创建。部分照片上传失败 — 若身份证照片缺失请重新注册。',
  toastOtpExpired: '验证码已过期。请点重发获取新码。',
  toastRegisterFailed: '无法完成注册。请再点「验证并提交」。',
  toastOtpWrong: '验证码不正确。请核对后重试。',
};

const zhHant: SignupFieldCopy = {
  ...zh,
  nickname: '暱稱*',
  nicknameHint: '顯示在排班表與門店現場。',
  nicknamePlaceholder: '例如 Moon、Charlotte',
  fullName: '全名*',
  fullNameHint: '與身分證 / 護照一致。',
  fullNamePlaceholder: '例如 王小明',
  choose: '請選擇',
  phoneNumber: '手機號碼*',
  phoneHint: '須已註冊 WhatsApp',
  phonePlaceholder: '例如 123456789',
  dialCode: '區號',
  dialTitle: '國家與區號',
  email: '電子郵箱',
  nationality: '國籍*',
  idType: '證件類型*',
  dob: '出生日期*',
  idNo: '證件號碼*',
  idNoSelectTypeFirst: '請先選擇證件類型',
  idNoDocPlaceholder: '證件號碼',
  height: '身高',
  weight: '體重',
  inCm: '公分',
  inKg: '公斤',
  bwh: '三圍 (BWH)',
  bwhHint: '選填 — 胸圍 · 腰圍 · 臀圍（公分）',
  bust: '胸圍',
  waist: '腰圍',
  hip: '臀圍',
  preferredLanguages: '擅長語言*',

  addressLine1: '地址第 1 行*',
  addressLine1Placeholder: '門牌、街道',
  addressLine2: '地址第 2 行',
  addressLine2Placeholder: '區域',
  city: '城市*',
  cityPlaceholder: '城市',
  country: '國家*',
  state: '州屬*',
  stateProvince: '州 / 省*',
  stateHintNeedCountry: '請先選擇國家 — 列表會隨之變化。',
  chooseCountryFirst: '請先選擇國家',
  stateOrProvincePlaceholder: '州或省',
  postcode: '郵遞區號*',
  postcodePlaceholder: '郵遞區號',

  joiningHow: '你如何加入？*',
  joiningHint: '獲得班次前，仍須由經紀公司添加你。',
  pickAgency: '選擇經紀公司',
  joiningOwn: '自行加入',
  whichAgency: '哪家經紀公司添加了你？*',
  askAgency: '請經紀公司接受你',
  searchAgency: '按經紀公司名稱搜尋',
  loadingAgencies: '正在載入經紀公司…',
  noAgencies: '暫無經紀公司列表。',
  noAgencyMatch: '沒有符合「{q}」的經紀公司。',
  agencyLoadFailed: '無法載入經紀公司列表。',
  tryAgain: '重試',
  agencyCalloutReferred:
    '請告知經紀公司你的暱稱和手機號 — 他們可在「管理 PR」中關聯你。',
  agencyCalloutIndependent: '他們仍須接受你之後，你才能被安排班次。',

  idCameraTitle: '相機權限',
  idCameraBody:
    'InnocenZ 需要使用相機拍攝證件以完成核驗。提交前照片僅保存在本機。',
  idCameraAllow: '允許',
  idCameraNotNow: '暫不',
  remove: '移除',
  retake: '重拍',
  openCamera: '開啟相機',
  idFront: '1. {doc} 正面*',
  idBack: '2. {doc} 背面*',
  passportPage: '1. {doc} 資料頁*',
  readingSide: '正在辨識{side}證件…',
  readingPassport: '正在辨識護照號碼…',
  idSideHint: '{side}須為證件該面 — 並核對號碼。',
  idMatched: '{side}證件已符合：{seen}',
  wrongSide: '面別錯誤 — 此照片{got}。請拍攝{expected}。',
  photoMismatch: '照片顯示 {seen}，但你填寫的是 {expected}。請重拍或返回第 1 步修改。',
  photoMissingId: '在{side}未找到證件號 {expected}。請拍更清晰的照片。',
  unreadableSide: '無法讀取{side}上的證件號。請改善光線、避免反光後重拍。',
  unreadablePassport: '無法讀取護照號碼。請改善光線、避免反光後重拍。',
  ocrUnavailable: '此版本無法使用 OCR — 請使用帶 ML Kit 的手機應用。無法跳過。',
  passportMatched: '護照號碼已符合：{seen}',
  passportMismatch: '照片顯示 {seen}，但你填寫的是 {expected}。請重拍或返回第 1 步修改。',
  passportMissing: '頁面上未找到護照號 {expected}。請拍更清晰的照片。',
  passportHint: '將核對護照資料頁與你填寫的護照號碼。',
  idVerifyIntro: '請拍攝清晰的證件照片。我們會核對號碼與第 1 步是否一致。',
  idVerifyOk: '證件照片已核驗',
  idVerifyKept: '證件已核驗',
  idVerifyContinueHint: '照片仍保留。點繼續進入下一步。',
  idVerifyOkHint: '點繼續進入下一步。',

  yourNickname: '你的暱稱',
  legalName: '法定姓名',
  yourPhotos: '你的照片',
  profilePhoto: '頭像*',
  profilePhotoHint: '頭像 · 面部清晰 · 相機或相簿',
  portfolio: '作品集',
  optional: '選填',
  portfolioHint: '最多 {max} 張相簿照片（可多選）— 前 4 張用於名片卡',
  cardTag: '名片',
  addPhotos: '新增照片',
  camera: '相機',
  gallery: '相簿',
  review: '核對',
  comcardPreview: '名片卡預覽',
  comcardAuto: '自動',
  comcardHint: '由作品集產生（與個人資料相同版面）。建立帳戶後儲存。',
  comcardEmpty: '請先在上方新增作品集照片以預覽名片卡。',
  ageStat: '年齡 {age}',
  reviewIdentity: '身分資訊',
  reviewAddress: '地址',
  reviewAgency: '經紀公司',
  referralYes: '是 — 經推薦',
  referralNo: '否 — 申請加入',
  loginPassword: '登入密碼',
  agreeContinue: '同意並繼續',
  heightWeight: '身高 / 體重',
  languages: '語言',
  referral: '推薦',
  addedBy: '添加方',
  askingToJoin: '申請加入',
  docNric: '身分證',
  docPassport: '護照',
  docWorkPermit: '工作准證',
  sideFront: '正面',
  sideBack: '背面',
  wrongSideUnknown: '無法確認面別',
  wrongSideLooksLike: '看起來像{detected}',
  password: '密碼*',
  passwordPlaceholder: '至少 6 個字元',
  confirmPassword: '確認*',
  confirmPasswordPlaceholder: '再次輸入密碼',
  ackPersonalInfo: '我已閱讀並同意《個人資訊免責聲明》',
  ackDeclaration: '我確認《真實性聲明》',
  ackSharing: '我同意《經紀公司資訊共享》',
  ackTermsPrefix: '我已閱讀並同意',
  ackTermsLink: '條款與條件',
  ackDone: '完成',
  disclaimerPersonalTitle: '個人資訊免責聲明',
  disclaimerPersonalBody:
    '提交本註冊即表示你同意 InnocenZ 為帳戶管理、班次協調與正式通信之目的，收集並使用你的個人資訊 — 包括全名、身分證/護照號碼、出生日期、聯絡方式、地址、身分證件照片及相關資料。\n\n你的資訊將按隱私權政策及適用資料保護法律處理。未經你同意，我們不會與第三方共享你的個人資料，法律要求或「經紀公司資訊共享」所述情形除外。',
  disclaimerTruthTitle: '真實性聲明',
  disclaimerTruthBody:
    '本人聲明，本註冊表中所填資訊據本人所知均為真實、準確、完整。\n\n本人理解提供虛假或誤導資訊可能導致：\n  • 拒絕帳戶申請\n  • 取消已核准帳戶\n  • 視情節承擔相應法律後果\n\n本人同意在資訊變更時及時通知 InnocenZ。',
  disclaimerSharingTitle: '經紀公司資訊共享',
  disclaimerSharingBody:
    '以 PR 身分註冊 InnocenZ，即表示你同意向關聯經紀公司與門店共享相關資料資訊 — 包括現場暱稱、聯絡方式、照片及工作相關資料 — 用於排班、班次協調與支付。\n\n敏感身分證件（身分證/護照照片）僅限 InnocenZ 合規人員及獲授權平台營運人員存取。與經紀公司及門店共享的資訊僅限於營運預訂、班次與支付憑證所需，法律另有要求除外。',
  disclaimerTermsTitle: '條款與條件',
  disclaimerTermsBody:
    '建立 InnocenZ PR 帳戶即表示你同意平台規則，包括班次預訂與封存、佣金透明、支付憑證流程與爭議處理。\n\n你同意合法善意使用平台，妥善保管登入憑證，不得虛報身分或工作資格。\n\n個人資料處理見 InnocenZ 隱私權政策。繼續使用平台即表示接受條款與隱私權政策的更新。',

  otpLead: '請輸入傳送至 WhatsApp {phone} 的 6 位驗證碼',
  otpHint: 'WhatsApp 複製驗證碼後，點「貼上驗證碼」— 或長按輸入框貼上。',
  pasteCode: '貼上驗證碼',
  resendIn: '{s} 秒後可重發',
  resendOtp: '重發驗證碼',

  nicknameRequired: '請填寫暱稱。',
  fullNameRequired: '請填寫全名。',
  dialRequired: '請選擇國家區號。',
  phoneShort: '手機號碼過短。',
  nationalityRequired: '請填寫國籍。',
  idTypeRequired: '請選擇證件類型。',
  nricMalaysianOnly: 'NRIC 僅適用於馬來西亞籍。請使用護照或工作准證。',
  dobRequired: '請填寫出生日期。',
  idNoSelectFirst: '請先選擇證件類型。',
  idNoRequired: '請填寫證件號碼。',
  languagesRequired: '請至少選擇一種語言。',
  addressLine1Required: '請填寫地址第 1 行。',
  cityRequired: '請填寫城市。',
  postcodeRequired: '請填寫郵遞區號。',
  stateRequired: '請選擇州屬。',
  countryRequired: '請選擇國家。',
  joiningRequired: '請選擇加入方式。',
  agencyRequired: '請選擇經紀公司。',
  profileRequired: '請上傳頭像。',
  idFrontRequired: '請拍攝證件正面。',
  idPassportPageRequired: '請拍攝護照資料頁。',
  idFrontOcrFail: '正面照片須為證件正面且號碼正確。請重拍。',
  idPassportOcrFail: '照片上的護照號須與填寫一致。請重拍。',
  idBackRequired: '請拍攝證件背面。',
  idBackOcrFail: '背面照片須為證件背面且號碼正確。請重拍。',
  searchCountryOrCode: '搜尋國家或區號',
  searchLanguages: '搜尋語言',
  chooseLanguages: '選擇語言',
  otherLanguage: '其他語言',
  noMatches: '無符合結果。',
  noLangMatches: '無符合 — 可在下方新增。',
  add: '新增',
  done: '完成',
  doneSelected: '完成 · 已選 {count} 項',
  confirm: '確認',
  year: '年',
  month: '月',
  day: '日',
  monthJan: '1月',
  monthFeb: '2月',
  monthMar: '3月',
  monthApr: '4月',
  monthMay: '5月',
  monthJun: '6月',
  monthJul: '7月',
  monthAug: '8月',
  monthSep: '9月',
  monthOct: '10月',
  monthNov: '11月',
  monthDec: '12月',
  passwordRequired: '請填寫密碼。',
  passwordMin: '密碼至少 6 個字元。',
  confirmRequired: '請確認密碼。',
  passwordMismatch: '兩次密碼不一致。',
  ackRequired: '請勾選全部確認事項。',
  fixHighlighted: '請修正標紅的欄位。',

  toastVerifyPhoneFailed: '無法驗證手機 / 證件 — 請重試。',
  toastCodeSent: '驗證碼已傳送至 WhatsApp {phone}。',
  toastCodeResent: '新驗證碼正在傳送。',
  toastPhoneTaken: '該號碼已有帳戶。請換號，或直接登入。',
  toastSendCodeFailed: '無法傳送驗證碼 — 請重試。',
  toastOtpIncomplete: '請輸入完整 6 位驗證碼。',
  toastPhotosPartial: '帳戶已建立。部分照片上傳失敗 — 若身分證照片缺失請重新註冊。',
  toastOtpExpired: '驗證碼已過期。請點重發取得新碼。',
  toastRegisterFailed: '無法完成註冊。請再點「驗證並提交」。',
  toastOtpWrong: '驗證碼不正確。請核對後重試。',
};

export const signupFieldCopy: Record<AppLocale, SignupFieldCopy> = {
  en,
  zh,
  'zh-Hant': zhHant,
};
