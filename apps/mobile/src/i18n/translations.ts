import type { AppLocale } from './locale-prefs';
import { signupFieldCopy, type SignupFieldCopy } from './signup-copy';

export type { SignupFieldCopy };

export type AppTranslations = {
  lang: {
    language: string;
    english: string;
    chinese: string;
    chineseTraditional: string;
  };
  common: {
    back: string;
    cancel: string;
    save: string;
    close: string;
    continue: string;
    loading: string;
    loadingSession: string;
    retry: string;
    yes: string;
    no: string;
    outlet: string;
  };
  nav: {
    today: string;
    checkIn: string;
    payment: string;
    history: string;
    profile: string;
  };
  login: {
    brandLine: string;
    title: string;
    subtitle: string;
    mobileNumber: string;
    dialCode: string;
    dialTitle: string;
    password: string;
    passwordPlaceholder: string;
    hidePassword: string;
    showPassword: string;
    forgotPassword: string;
    signIn: string;
    signingIn: string;
    signInFailed: string;
    /** Backend: "This account is not registered yet." */
    accountNotRegistered: string;
    /** Backend: "This account is inactive." */
    accountInactive: string;
    /** Backend: "Wrong password" */
    wrongPassword: string;
    /** Backend lockout — `{m}` = minutes */
    tooManyAttempts: string;
    newHere: string;
    createAccount: string;
  };
  forgot: {
    title: string;
    phoneHint: string;
    sendCode: string;
    sending: string;
    otpTitle: string;
    otpHint: string;
    verify: string;
    verifying: string;
    resend: string;
    resendIn: string;
    newPassword: string;
    confirmPassword: string;
    setPassword: string;
    saving: string;
    doneTitle: string;
    doneBody: string;
    backToSignIn: string;
  };
  topbar: {
    prAgencyTied: string;
    pr: string;
    notifications: string;
    markAllRead: string;
    noNotifications: string;
    pvReadyTitle: string;
    pvReadyBody: string;
    close: string;
  };
  profile: {
    title: string;
    editProfile: string;
    saveProfile: string;
    saving: string;
    cancel: string;
    languages: string;
    securitySettings: string;
    signOut: string;
    appLanguage: string;
    height: string;
    weight: string;
    age: string;
    /** Why the age box is locked — age is derived from the PR's IC. */
    ageFollowsIc: string;
    bust: string;
    waist: string;
    hip: string;
    saveComcard: string;
    updateComcard: string;
    savingComcard: string;
    noComcard: string;
    savedToProfile: string;
    /** Shown IN the comcard frame when a saved comcard will not load on this device. */
    comcardUnavailable: string;
    /** The caption under the button in that same case — never "Saved to profile". */
    comcardUnavailableHint: string;
    comcardHint: string;
  };
  security: {
    title: string;
    changePassword: string;
    changePhone: string;
    deleteAccount: string;
    deleteAccountTitle: string;
    deleteAccountHint: string;
    deleteAccountConfirm: string;
    deleteAccountPassword: string;
    deleteAccountDone: string;
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
    passwordUpdated: string;
    passwordMin: string;
    passwordMismatch: string;
    phoneUpdated: string;
    sendOtp: string;
    verifyOtp: string;
  };
  shifts: {
    pageEyebrow: string;
    hi: string;
    today: string;
    todo: string;
    upcoming: string;
    onDuty: string;
    tonight: string;
    complete: string;
    alsoToday: string;
    lastNightComplete: string;
    earlierTodayComplete: string;
    attendance: string;
    checkIn: string;
    checkOut: string;
    viewSummary: string;
    agencySchedule: string;
    jobPostings: string;
    shiftsTab: string;
    jobsTab: string;
    noEventName: string;
    normalShift: string;
    specialEvent: string;
    outletName: string;
  };
  checkin: {
    pageLabel: string;
    title: string;
    viewSchedule: string;
    status: string;
    estPayout: string;
    shiftTime: string;
    refreshGps: string;
    cancelShift: string;
    checkOut: string;
    complete: string;
    finalPayout: string;
    cancelTitle: string;
    cancelRules: string;
    reasonRequired: string;
    back: string;
    enableLocation: string;
    continueWithoutGps: string;
  };
  payment: {
    title: string;
    history: string;
  };
  history: {
    title: string;
    shifts: string;
    payments: string;
  };
  signup: {
    title: string;
    backToSignIn: string;
    next: string;
    previous: string;
    back: string;
    submit: string;
    submitting: string;
    stepOf: string;
    steps: { title: string; subtitle: string }[];
  } & SignupFieldCopy;
};

export const translations: Record<AppLocale, AppTranslations> = {
  en: {
    lang: {
      language: 'Language',
      english: 'English',
      chinese: '简体中文',
      chineseTraditional: '繁體中文',
    },
    common: {
      back: 'Back',
      cancel: 'Cancel',
      save: 'Save',
      close: 'Close',
      continue: 'Continue',
      loading: 'Loading…',
      loadingSession: 'Getting things ready…',
      retry: 'Retry',
      yes: 'Yes',
      no: 'No',
      outlet: 'Outlet',
    },
    nav: {
      today: 'Today',
      checkIn: 'Check-In',
      payment: 'Payment',
      history: 'History',
      profile: 'Profile',
    },
    login: {
      brandLine: '',
      title: 'Welcome back',
      subtitle: 'Sign in with your mobile number.',
      mobileNumber: 'Mobile number',
      dialCode: 'Code',
      dialTitle: 'Country & dial code',
      password: 'Password',
      passwordPlaceholder: 'Your password',
      hidePassword: 'Hide password',
      showPassword: 'Show password',
      forgotPassword: 'Forgot password?',
      signIn: 'Sign in',
      signingIn: 'Signing in…',
      signInFailed: 'Sign in failed — please try again.',
      accountNotRegistered: 'This account is not registered yet.',
      accountInactive: 'This account is inactive.',
      wrongPassword: 'Wrong password',
      tooManyAttempts: 'Too many failed attempts. Try again in {m} minutes.',
      newHere: 'New here?',
      createAccount: 'Create an account',
    },
    forgot: {
      title: 'Reset password',
      phoneHint: 'We’ll send a WhatsApp code to your account phone.',
      sendCode: 'Send code',
      sending: 'Sending…',
      otpTitle: 'Enter code',
      otpHint: 'Check WhatsApp for the 6-digit code.',
      verify: 'Verify',
      verifying: 'Verifying…',
      resend: 'Resend code',
      resendIn: 'Resend in {s}s',
      newPassword: 'New password',
      confirmPassword: 'Confirm password',
      setPassword: 'Set new password',
      saving: 'Saving…',
      doneTitle: 'Password updated',
      doneBody: 'You can sign in with your new password.',
      backToSignIn: 'Back to sign in',
    },
    topbar: {
      prAgencyTied: 'PR · Agency-Tied',
      pr: 'PR',
      notifications: 'Notifications',
      markAllRead: 'Mark all read',
      noNotifications: 'No notifications yet',
      pvReadyTitle: 'Payment Voucher ready',
      pvReadyBody: '{ref} · {net} net — Finance Head pre-signed. Review & sign.',
      close: 'Close',
    },
    profile: {
      title: 'Profile',
      editProfile: 'Edit profile',
      saveProfile: 'Save profile',
      saving: 'Saving…',
      cancel: 'Cancel',
      languages: 'Languages',
      securitySettings: 'Security settings',
      signOut: 'Sign out',
      appLanguage: 'App language',
      height: 'HEIGHT',
      weight: 'WEIGHT',
      age: 'AGE',
      ageFollowsIc: 'Age follows your IC and cannot be edited.',
      bust: 'BUST',
      waist: 'WAIST',
      hip: 'HIP',
      saveComcard: 'Save comcard',
      updateComcard: 'Update saved comcard',
      savingComcard: 'Saving…',
      noComcard: 'No comcard yet — add photos to your gallery below to build one.',
      savedToProfile: 'Saved to profile',
      comcardUnavailable: 'Saved — not loading here',
      comcardUnavailableHint:
        'Saved to your profile. The image is not loading on this device.',
      comcardHint: 'Save to share with agencies and outlets.',
    },
    security: {
      title: 'Security',
      changePassword: 'Change password',
      changePhone: 'Change phone',
      deleteAccount: 'Delete account',
      deleteAccountTitle: 'Delete account?',
      deleteAccountHint:
        'This permanently disables your account, removes identity photos and profile data, and signs you out. Payroll history may be retained as required by law. Enter your password to confirm.',
      deleteAccountConfirm: 'Delete my account',
      deleteAccountPassword: 'Current password',
      deleteAccountDone: 'Account deleted',
      currentPassword: 'Current password',
      newPassword: 'New password',
      confirmPassword: 'Confirm password',
      passwordUpdated: 'Password updated',
      passwordMin: 'Password must be at least 6 characters',
      passwordMismatch: 'Passwords do not match',
      phoneUpdated: 'Phone updated',
      sendOtp: 'Send code',
      verifyOtp: 'Verify code',
    },
    shifts: {
      pageEyebrow: 'AGENCY SHIFTS',
      hi: 'Hi, {name}',
      today: 'TODAY',
      todo: 'TO-DO',
      upcoming: 'UPCOMING',
      onDuty: 'On duty',
      tonight: 'Tonight',
      complete: 'Complete',
      alsoToday: 'ALSO TODAY',
      lastNightComplete: 'LAST NIGHT · COMPLETE',
      earlierTodayComplete: 'EARLIER TODAY · COMPLETE',
      attendance: 'Attendance',
      checkIn: 'Check in',
      checkOut: 'Check out',
      viewSummary: 'View summary',
      agencySchedule: 'Agency schedule',
      jobPostings: 'Job postings',
      shiftsTab: 'Shifts',
      jobsTab: 'Jobs',
      noEventName: 'No event name',
      normalShift: 'Normal shift',
      specialEvent: 'Special event',
      outletName: 'Outlet name',
    },
    checkin: {
      pageLabel: 'ATTENDANCE',
      title: 'Check in',
      viewSchedule: 'View schedule',
      status: 'Status',
      estPayout: 'Est. payout',
      shiftTime: 'Shift time',
      refreshGps: 'Refresh GPS',
      cancelShift: 'Cancel shift',
      checkOut: 'Check out',
      complete: 'Complete',
      finalPayout: 'Final payout',
      cancelTitle: 'Cancel shift?',
      cancelRules: 'Cancellation rules',
      reasonRequired: 'Reason (required)',
      back: 'Back',
      enableLocation: 'Enable Location Access',
      continueWithoutGps: 'Continue Without GPS',
    },
    payment: {
      title: 'Payment',
      history: 'Payment history',
    },
    history: {
      title: 'History',
      shifts: 'Shifts',
      payments: 'Payments',
    },
    signup: {
      title: 'Create account',
      backToSignIn: 'Back to sign in',
      next: 'Next',
      previous: 'Previous',
      back: 'Back',
      submit: 'Create account',
      submitting: 'Creating…',
      stepOf: 'STEP {step} OF {total}',
      steps: [
        { title: 'Persona', subtitle: 'Your details' },
        { title: 'Address', subtitle: 'Where you live' },
        { title: 'Agency', subtitle: 'Optional tie' },
        { title: 'Verify', subtitle: 'ID verification' },
        { title: 'Summary', subtitle: 'Photos & review' },
        { title: 'OTP', subtitle: 'Verify your mobile' },
      ],
      ...signupFieldCopy.en,
    },
  },
  zh: {
    lang: {
      language: '语言',
      english: 'English',
      chinese: '简体中文',
      chineseTraditional: '繁體中文',
    },
    common: {
      back: '返回',
      cancel: '取消',
      save: '保存',
      close: '关闭',
      continue: '继续',
      loading: '加载中…',
      loadingSession: '正在准备…',
      retry: '重试',
      yes: '是',
      no: '否',
      outlet: '门店',
    },
    nav: {
      today: '今日',
      checkIn: '签到',
      payment: '结算',
      history: '记录',
      profile: '我的',
    },
    login: {
      brandLine: '',
      title: '欢迎回来',
      subtitle: '使用手机号登录。',
      mobileNumber: '手机号码',
      dialCode: '区号',
      dialTitle: '国家与区号',
      password: '密码',
      passwordPlaceholder: '请输入密码',
      hidePassword: '隐藏密码',
      showPassword: '显示密码',
      forgotPassword: '忘记密码？',
      signIn: '登录',
      signingIn: '登录中…',
      signInFailed: '登录失败，请重试。',
      accountNotRegistered: '此账号尚未注册。',
      accountInactive: '此账号已停用。',
      wrongPassword: '密码错误',
      tooManyAttempts: '尝试次数过多。请在 {m} 分钟后再试。',
      newHere: '还没有账号？',
      createAccount: '创建账号',
    },
    forgot: {
      title: '重置密码',
      phoneHint: '我们将通过 WhatsApp 向你的账号手机号发送验证码。',
      sendCode: '发送验证码',
      sending: '发送中…',
      otpTitle: '输入验证码',
      otpHint: '请查看 WhatsApp 中的 6 位验证码。',
      verify: '验证',
      verifying: '验证中…',
      resend: '重新发送',
      resendIn: '{s} 秒后可重发',
      newPassword: '新密码',
      confirmPassword: '确认密码',
      setPassword: '设置新密码',
      saving: '保存中…',
      doneTitle: '密码已更新',
      doneBody: '你可以使用新密码登录。',
      backToSignIn: '返回登录',
    },
    topbar: {
      prAgencyTied: 'PR · 经纪公司',
      pr: 'PR',
      notifications: '通知',
      markAllRead: '全部已读',
      noNotifications: '暂无通知',
      pvReadyTitle: '结算单已就绪',
      pvReadyBody: '{ref} · 净额 {net} — 财务已预签。请审阅并签名。',
      close: '关闭',
    },
    profile: {
      title: '个人资料',
      editProfile: '编辑资料',
      saveProfile: '保存资料',
      saving: '保存中…',
      cancel: '取消',
      languages: '语言能力',
      securitySettings: '安全设置',
      signOut: '退出登录',
      appLanguage: '应用语言',
      height: '身高',
      weight: '体重',
      age: '年龄',
      ageFollowsIc: '年龄根据您的身份证自动计算，无法修改。',
      bust: '胸围',
      waist: '腰围',
      hip: '臀围',
      saveComcard: '保存名片卡',
      updateComcard: '更新已保存名片卡',
      savingComcard: '保存中…',
      noComcard: '暂无名片卡 — 请在下方相册添加照片以生成。',
      savedToProfile: '已保存到资料',
      comcardUnavailable: '已保存 — 此处无法加载',
      comcardUnavailableHint: '已保存到资料。图片在本设备上无法加载。',
      comcardHint: '保存后可分享给经纪公司与门店。',
    },
    security: {
      title: '安全',
      changePassword: '修改密码',
      changePhone: '更换手机号',
      deleteAccount: '删除账号',
      deleteAccountTitle: '删除账号？',
      deleteAccountHint:
        '将永久停用你的账号，删除身份证件照片与个人资料，并退出登录。依法可能保留薪资相关记录。请输入密码以确认。',
      deleteAccountConfirm: '删除我的账号',
      deleteAccountPassword: '当前密码',
      deleteAccountDone: '账号已删除',
      currentPassword: '当前密码',
      newPassword: '新密码',
      confirmPassword: '确认密码',
      passwordUpdated: '密码已更新',
      passwordMin: '密码至少 6 位',
      passwordMismatch: '两次输入的密码不一致',
      phoneUpdated: '手机号已更新',
      sendOtp: '发送验证码',
      verifyOtp: '验证验证码',
    },
    shifts: {
      pageEyebrow: '经纪排班',
      hi: '你好，{name}',
      today: '今日',
      todo: '待办',
      upcoming: '即将到来',
      onDuty: '值班中',
      tonight: '今晚',
      complete: '已完成',
      alsoToday: '今日其他',
      lastNightComplete: '昨晚 · 已完成',
      earlierTodayComplete: '今日较早 · 已完成',
      attendance: '出勤',
      checkIn: '签到',
      checkOut: '签退',
      viewSummary: '查看摘要',
      agencySchedule: '经纪排班',
      jobPostings: '职位招聘',
      shiftsTab: '班次',
      jobsTab: '职位',
      noEventName: '未命名活动',
      normalShift: '常规班次',
      specialEvent: '特别活动',
      outletName: '门店名称',
    },
    checkin: {
      pageLabel: '出勤',
      title: '签到',
      viewSchedule: '查看排班',
      status: '状态',
      estPayout: '预计收入',
      shiftTime: '班次时间',
      refreshGps: '刷新定位',
      cancelShift: '取消班次',
      checkOut: '签退',
      complete: '已完成',
      finalPayout: '最终收入',
      cancelTitle: '取消班次？',
      cancelRules: '取消规则',
      reasonRequired: '原因（必填）',
      back: '返回',
      enableLocation: '开启定位权限',
      continueWithoutGps: '不使用定位继续',
    },
    payment: {
      title: '结算',
      history: '结算记录',
    },
    history: {
      title: '记录',
      shifts: '班次',
      payments: '结算',
    },
    signup: {
      title: '创建账号',
      backToSignIn: '返回登录',
      next: '下一步',
      previous: '上一步',
      back: '返回',
      submit: '创建账号',
      submitting: '创建中…',
      stepOf: '第 {step} / {total} 步',
      steps: [
        { title: '个人资料', subtitle: '基本信息' },
        { title: '地址', subtitle: '居住地' },
        { title: '经纪公司', subtitle: '可选关联' },
        { title: '身份验证', subtitle: '证件核验' },
        { title: '摘要', subtitle: '照片与确认' },
        { title: '验证码', subtitle: '验证手机号' },
      ],
      ...signupFieldCopy.zh,
    },
  },
  'zh-Hant': {
    lang: {
      language: '語言',
      english: 'English',
      chinese: '简体中文',
      chineseTraditional: '繁體中文',
    },
    common: {
      back: '返回',
      cancel: '取消',
      save: '儲存',
      close: '關閉',
      continue: '繼續',
      loading: '載入中…',
      loadingSession: '正在準備…',
      retry: '重試',
      yes: '是',
      no: '否',
      outlet: '門店',
    },
    nav: {
      today: '今日',
      checkIn: '簽到',
      payment: '結算',
      history: '紀錄',
      profile: '我的',
    },
    login: {
      brandLine: '',
      title: '歡迎回來',
      subtitle: '使用手機號登入。',
      mobileNumber: '手機號碼',
      dialCode: '區號',
      dialTitle: '國家與區號',
      password: '密碼',
      passwordPlaceholder: '請輸入密碼',
      hidePassword: '隱藏密碼',
      showPassword: '顯示密碼',
      forgotPassword: '忘記密碼？',
      signIn: '登入',
      signingIn: '登入中…',
      signInFailed: '登入失敗，請重試。',
      accountNotRegistered: '此帳號尚未註冊。',
      accountInactive: '此帳號已停用。',
      wrongPassword: '密碼錯誤',
      tooManyAttempts: '嘗試次數過多。請在 {m} 分鐘後再試。',
      newHere: '還沒有帳號？',
      createAccount: '建立帳號',
    },
    forgot: {
      title: '重設密碼',
      phoneHint: '我們將透過 WhatsApp 向你的帳號手機號傳送驗證碼。',
      sendCode: '傳送驗證碼',
      sending: '傳送中…',
      otpTitle: '輸入驗證碼',
      otpHint: '請查看 WhatsApp 中的 6 位驗證碼。',
      verify: '驗證',
      verifying: '驗證中…',
      resend: '重新傳送',
      resendIn: '{s} 秒後可重發',
      newPassword: '新密碼',
      confirmPassword: '確認密碼',
      setPassword: '設定新密碼',
      saving: '儲存中…',
      doneTitle: '密碼已更新',
      doneBody: '你可以使用新密碼登入。',
      backToSignIn: '返回登入',
    },
    topbar: {
      prAgencyTied: 'PR · 經紀公司',
      pr: 'PR',
      notifications: '通知',
      markAllRead: '全部已讀',
      noNotifications: '暫無通知',
      pvReadyTitle: '結算單已就緒',
      pvReadyBody: '{ref} · 淨額 {net} — 財務已預簽。請審閱並簽名。',
      close: '關閉',
    },
    profile: {
      title: '個人資料',
      editProfile: '編輯資料',
      saveProfile: '儲存資料',
      saving: '儲存中…',
      cancel: '取消',
      languages: '語言能力',
      securitySettings: '安全設定',
      signOut: '登出',
      appLanguage: '應用語言',
      height: '身高',
      weight: '體重',
      age: '年齡',
      ageFollowsIc: '年齡根據您的身份證自動計算，無法修改。',
      bust: '胸圍',
      waist: '腰圍',
      hip: '臀圍',
      saveComcard: '儲存名片卡',
      updateComcard: '更新已儲存名片卡',
      savingComcard: '儲存中…',
      noComcard: '暫無名片卡 — 請在下方相簿新增照片以產生。',
      savedToProfile: '已儲存到資料',
      comcardUnavailable: '已儲存 — 此處無法載入',
      comcardUnavailableHint: '已儲存到資料。圖片在本裝置上無法載入。',
      comcardHint: '儲存後可分享給經紀公司與門店。',
    },
    security: {
      title: '安全',
      changePassword: '修改密碼',
      changePhone: '更換手機號',
      deleteAccount: '刪除帳號',
      deleteAccountTitle: '刪除帳號？',
      deleteAccountHint:
        '將永久停用你的帳號，刪除身分證件照片與個人資料，並登出。依法可能保留薪資相關紀錄。請輸入密碼以確認。',
      deleteAccountConfirm: '刪除我的帳號',
      deleteAccountPassword: '目前密碼',
      deleteAccountDone: '帳號已刪除',
      currentPassword: '目前密碼',
      newPassword: '新密碼',
      confirmPassword: '確認密碼',
      passwordUpdated: '密碼已更新',
      passwordMin: '密碼至少 6 位',
      passwordMismatch: '兩次輸入的密碼不一致',
      phoneUpdated: '手機號已更新',
      sendOtp: '傳送驗證碼',
      verifyOtp: '驗證驗證碼',
    },
    shifts: {
      pageEyebrow: '經紀排班',
      hi: '你好，{name}',
      today: '今日',
      todo: '待辦',
      upcoming: '即將到來',
      onDuty: '值班中',
      tonight: '今晚',
      complete: '已完成',
      alsoToday: '今日其他',
      lastNightComplete: '昨晚 · 已完成',
      earlierTodayComplete: '今日較早 · 已完成',
      attendance: '出勤',
      checkIn: '簽到',
      checkOut: '簽退',
      viewSummary: '查看摘要',
      agencySchedule: '經紀排班',
      jobPostings: '職位招聘',
      shiftsTab: '班次',
      jobsTab: '職位',
      noEventName: '未命名活動',
      normalShift: '常規班次',
      specialEvent: '特別活動',
      outletName: '門店名稱',
    },
    checkin: {
      pageLabel: '出勤',
      title: '簽到',
      viewSchedule: '查看排班',
      status: '狀態',
      estPayout: '預計收入',
      shiftTime: '班次時間',
      refreshGps: '重新整理定位',
      cancelShift: '取消班次',
      checkOut: '簽退',
      complete: '已完成',
      finalPayout: '最終收入',
      cancelTitle: '取消班次？',
      cancelRules: '取消規則',
      reasonRequired: '原因（必填）',
      back: '返回',
      enableLocation: '開啟定位權限',
      continueWithoutGps: '不使用定位繼續',
    },
    payment: {
      title: '結算',
      history: '結算紀錄',
    },
    history: {
      title: '紀錄',
      shifts: '班次',
      payments: '結算',
    },
    signup: {
      title: '建立帳號',
      backToSignIn: '返回登入',
      next: '下一步',
      previous: '上一步',
      back: '返回',
      submit: '建立帳號',
      submitting: '建立中…',
      stepOf: '第 {step} / {total} 步',
      steps: [
        { title: '個人資料', subtitle: '基本資訊' },
        { title: '地址', subtitle: '居住地' },
        { title: '經紀公司', subtitle: '可選關聯' },
        { title: '身分驗證', subtitle: '證件核驗' },
        { title: '摘要', subtitle: '照片與確認' },
        { title: '驗證碼', subtitle: '驗證手機號' },
      ],
      ...signupFieldCopy['zh-Hant'],
    },
  },
};

/** Tiny `{name}` interpolator for translation strings. */
export function formatMessage(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] != null ? String(vars[key]) : `{${key}}`,
  );
}

/**
 * Map English login API messages to the active locale.
 * Backend auth errors are English-only; the phone shows them raw unless we translate here.
 */
export function localizeLoginError(
  message: string,
  login: AppTranslations['login'],
): string {
  const trimmed = message.trim();
  if (trimmed === 'This account is not registered yet.') return login.accountNotRegistered;
  if (trimmed === 'This account is inactive.') return login.accountInactive;
  if (trimmed === 'Wrong password') return login.wrongPassword;
  const lockout = /^Too many failed attempts\. Try again in (\d+) minutes?\.?$/i.exec(
    trimmed,
  );
  if (lockout) return formatMessage(login.tooManyAttempts, { m: lockout[1] });
  return trimmed || login.signInFailed;
}
