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
    /** Collapsible-section hint shown while the section is OPEN. Shared by Section.tsx and (should be) every other collapsible in the app. */
    tapToCollapse: string;
    /** Collapsible-section hint shown while the section is CLOSED. */
    tapToExpand: string;
    /** Unread/new pill on a list row. zh and zh-Hant are identical on purpose — no character differs between the scripts. */
    newBadge: string;
    /** accessibilityLabel for the InnocenZ logo image. The brand name itself stays English. */
    brandLogo: string;
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
    /** Sub-title under "Notifications" in the bell sheet, explaining what lands there. */
    notificationsHint: string;
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
    /** Today hub value when the PR has no shift at all today (not "cancelled" — simply a day off). */
    off: string;
    noShiftToday: string;
    nothingToDo: string;
    /** Title of the amber to-do card shown when the PR is still checked in past the shift's end. */
    forgotCheckOut: string;
    /** Row label for the outlet on the overdue-checkout and unsigned-voucher to-do cards. */
    where: string;
    /** Row label; its value is the shift's scheduled end time (HH:MM). */
    shiftEnded: string;
    /** `{time}` = the shift's scheduled end (HH:MM). One key, filled by formatMessage — never split into fragments. */
    payStopsAt: string;
    /** Row label for the payment-voucher reference on the unsigned-voucher to-do card. */
    voucher: string;
    netPay: string;
    date: string;
    time: string;
    /** FIELD LABEL only — the dress-code value itself is the venue's own stored text. */
    dressCode: string;
    /** FIELD LABEL only. Deliberately "preferred", never "required" — the languages value is stored text. */
    preferredLanguages: string;
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
  shiftStatus: {
    /** Uppercase time-cell header — distinct from t.shifts.checkIn ('Check in'). */
    checkInHead: string;
    /** Uppercase time-cell header — distinct from t.shifts.checkOut ('Check out'). */
    checkOutHead: string;
    /** The CHECK-OUT time cell before the PR checks out — NOT the receipt badge (see shiftStatus.pending). */
    checkOutPending: string;
    duration: string;
    /** Duration value while the shift is still running. */
    inProgress: string;
    salesTarget: string;
    /** {target} = formatted RM target, {pct} = whole-number percent. */
    targetOf: string;
    /** Rendered label only — the scan category value stays the English 'drinks'. */
    drinks: string;
    /** Rendered label only — the scan category value stays the English 'tips'. */
    tips: string;
    scan: string;
    selfLog: string;
    /** Uppercase section heading — distinct from t.checkin.status ('Status'). */
    status: string;
    /** Singular half of the pending-receipts hint; Chinese has no plural so the count picks the whole sentence. */
    pendingOne: string;
    pendingMany: string;
    /** Singular half; PV = payment voucher, rendered with the dictionary's existing 结算单 wording. */
    matchedOne: string;
    matchedMany: string;
    colRef: string;
    colItem: string;
    colQty: string;
    colSource: string;
    /** Abbreviation of commission — keep it short, the column is 72px. 佣金 has no character that differs between the two scripts. */
    colComm: string;
    colVerify: string;
    dutyTime: string;
    /** SOURCE column label for log.source === 'checkin' — sentence case, not the uppercase header. */
    sourceCheckIn: string;
    /** SOURCE column label for log.source === 'manual'. */
    sourceManual: string;
    /** SOURCE column label for log.source === 'scan'. */
    sourceScan: string;
    /** REF column label for log.kind === 'tips'. */
    refTip: string;
    /** REF column label for log.kind === 'others' — overtime. */
    refOt: string;
    /** REF column label for log.kind === 'drinks'. */
    refDrink: string;
    /** Verify badge on a check-in seal row. No character differs between the scripts. */
    sealed: string;
    /** Receipt-lifecycle badge PENDING — awaiting agency review. */
    pending: string;
    /** Receipt-lifecycle badge VERIFIED — the only green one. */
    verified: string;
    /** Receipt-lifecycle badge APPROVED — amber, still contestable. No character differs between the scripts. */
    approved: string;
    /** A receipt exists behind the row but nobody has ruled on it. No character differs between the scripts. */
    matched: string;
    totals: string;
    /** {wage} = formatted RM daily wage. */
    totalsHint: string;
    proofPhotos: string;
    proofHintEditable: string;
    proofHintLocked: string;
    saving: string;
    addPhoto: string;
    /** Fallback only — a real server refusal message is shown raw (backend English). */
    removeFailed: string;
  };
  shiftLib: {
    /** Today → To-do card title when a last-week PV is waiting on the PR's signature. */
    reviewPvTitle: string;
    /** Button on that to-do card — short form, the title above already names the document. */
    reviewPvAction: string;
    /** Venue label when one week's voucher spans several outlets; {n} = outlet count. */
    multiOutlet: string;
    /** Fallback when /shift-assignment/mine fails with a non-Error; rendered on Check-In. */
    loadShiftFailed: string;
    /** Whole-hour check-in → check-out duration. */
    durationHours: string;
    /** Duration with a minutes remainder — spelled out separately because Chinese has no minutes fragment to append. */
    durationHoursMinutes: string;
    /** {base} is one of the two duration strings above; {ot} = overtime minutes beyond the scheduled hours. */
    durationWithOt: string;
  };
  jobs: {
    /** Violet banner at the top of the Job postings panel. */
    banner: string;
    orderService: string;
    filterBookings: string;
    /** Filter header count — `{shown}` rows after filtering out of `{total}`. */
    countOf: string;
    /** Filter field caption (uppercase in English). */
    filterDate: string;
    /** Filter field caption (uppercase in English) — see jobs.service for the sheet's field label. */
    filterService: string;
    /** Filter field caption (uppercase in English). */
    filterStatus: string;
    all: string;
    allDates: string;
    clearFilters: string;
    yourServiceOrders: string;
    /** Singular of the order-count hint; Chinese has no plural so it matches recordMany. */
    recordOne: string;
    /** Plural of the order-count hint. */
    recordMany: string;
    tapToCollapse: string;
    tapToExpand: string;
    noOrders: string;
    iconGuide: string;
    iconGuideBody: string;
    /** Order sheet title when the picked offer is Leave agency. */
    serviceRequestTitle: string;
    /** Order sheet title for every other offer. */
    orderServiceTitle: string;
    sheetSubtitle: string;
    /** Field label above the offer list in the order sheet. */
    service: string;
    budget: string;
    serviceTime: string;
    reason: string;
    notes: string;
    reasonPlaceholder: string;
    notesPlaceholder: string;
    submitting: string;
    raiseTicket: string;
    submitToAdmin: string;
    submitFailed: string;
    /** Time-picker column label; the stored period value stays 'AM'. */
    am: string;
    /** Time-picker column label; the stored period value stays 'PM'. */
    pm: string;
    /** Morning clock reading — Chinese puts 上午 before the time, so this is one template, not a concatenation. */
    timeAm: string;
    /** Afternoon/evening clock reading. */
    timePm: string;
    /** Stand-in for the PR's own name when the backend row carries none. */
    you: string;
    /** Shown where an outlet name would be — a service order has no venue. */
    adminService: string;
    raisedByPr: string;
    /** "Raised by" pill for an agency-initiated order. */
    agency: string;
    /** Money leaving the PR — the amount they pay for the service. */
    out: string;
    inAmount: string;
    orderMoney: string;
    /** Placeholder for an amount admin has not set yet. */
    tbc: string;
    statusPendingReview: string;
    statusAssigned: string;
    statusInProgress: string;
    statusCompleted: string;
    statusCancelled: string;
    statusAccepted: string;
    statusRejected: string;
    statusPendingAgency: string;
    statusAwaitingPr: string;
    statusConfirmed: string;
    statusDeclined: string;
    statusPaid: string;
    offerTransportation: string;
    offerTransportationSummary: string;
    offerDelivery: string;
    offerDeliverySummary: string;
    offerWardrobe: string;
    offerWardrobeSummary: string;
    offerMakeup: string;
    offerMakeupSummary: string;
    offerVipEscort: string;
    offerVipEscortSummary: string;
    offerUniform: string;
    offerUniformSummary: string;
    offerEmergencyCover: string;
    offerEmergencyCoverSummary: string;
    offerTraining: string;
    offerTrainingSummary: string;
    offerOthers: string;
    offerOthersSummary: string;
    offerLeaveAgency: string;
    offerLeaveAgencySummary: string;
  };
  schedule: {
    /** Calendar column header. Two-letter in English, one character in Chinese — identical in both scripts. */
    dowSun: string;
    dowMon: string;
    dowTue: string;
    dowWed: string;
    dowThu: string;
    dowFri: string;
    dowSat: string;
    /** Short weekday inside a date line — longer than the calendar header's initial. */
    daySun: string;
    dayMon: string;
    dayTue: string;
    dayWed: string;
    dayThu: string;
    dayFri: string;
    daySat: string;
    /** Short month — date lines, the week strip and the month chips. Identical in both Chinese scripts. */
    monShortJan: string;
    monShortFeb: string;
    monShortMar: string;
    monShortApr: string;
    monShortMay: string;
    monShortJun: string;
    monShortJul: string;
    monShortAug: string;
    monShortSep: string;
    monShortOct: string;
    monShortNov: string;
    monShortDec: string;
    /** Full month — the calendar's MONTH select only. Identical in both Chinese scripts. */
    monLongJan: string;
    monLongFeb: string;
    monLongMar: string;
    monLongApr: string;
    monLongMay: string;
    monLongJun: string;
    monLongJul: string;
    monLongAug: string;
    monLongSep: string;
    monLongOct: string;
    monLongNov: string;
    monLongDec: string;
    /** A shift's date. {dow} short weekday, {d} zero-padded day, {mon} short month, {y} year — Chinese puts the year first and the weekday last, so the order lives in the template. */
    dateFriendly: string;
    /** Timetable week strip when both ends fall in one month. {mon} is the short month. */
    weekRangeSameMonth: string;
    /** Timetable week strip spanning two months. */
    weekRangeCrossMonth: string;
    monthLabel: string;
    yearLabel: string;
    /** Calendar legend — an open day the agency may still book. */
    legendAvailable: string;
    legendScheduledComplete: string;
    /** Calendar legend — a day the PR blocked herself. */
    legendNotAvailable: string;
    /** Calendar legend AND the day-detail sheet's title when a shift was missed. */
    missedCheckIn: string;
    /** Calendar legend and the timetable pill — a booking not yet confirmed. */
    statusPending: string;
    statusScheduled: string;
    statusLeavePending: string;
    statusLeaveApproved: string;
    /** {range} is the week label, already uppercased. */
    timetableTitle: string;
    refresh: string;
    noShiftsThisWeek: string;
    /** {name} is the agency's own name — never translated. */
    agencyBadge: string;
    /** Shown in place of an agency name when the assignment carries none. */
    agencyFallback: string;
    /** The single rule row shown when the agency has cancellation charges switched off. */
    ruleAnyTimeBefore: string;
    ruleFreeCancel: string;
    /** {h} = the agency's free-cancel window in hours. */
    ruleOverHours: string;
    /** The short-notice band, in hours. */
    ruleBetweenHours: string;
    ruleUnderHours: string;
    /** {pct} = the agency's configured percentage. */
    ruleWagesCut: string;
    tierNoFee: string;
    tierFree: string;
    tierShortNotice: string;
    tierLate: string;
    /** Sheet title and its confirm button. */
    markUnavailable: string;
    markUnavailableNote: string;
    reasonOptionalPlaceholder: string;
    /** Only shown when the server gave no message of its own. */
    blockDayFailed: string;
    cancelNote: string;
    /** {amount} is already formatted as RM x.xx. */
    penaltyFromNextPv: string;
    noDeduction: string;
    cancelReasonPlaceholder: string;
    cancelReasonMissing: string;
    /** Confirm button when cancelling costs nothing. */
    cancelAccept: string;
    /** {amount} is already formatted as RM x.xx. */
    cancelAcceptWithFee: string;
    cancelling: string;
    cancelFailed: string;
    notSignedIn: string;
    /** MC is a Malaysian medical certificate; sheet title and the timetable action button. */
    mcLeave: string;
    mcLeaveNote: string;
    noPenaltyWhenApproved: string;
    noPenaltyWhenApprovedBody: string;
    mcPhotoRequired: string;
    takePhoto: string;
    uploadPhoto: string;
    mcPhotoHint: string;
    leaveReasonPlaceholder: string;
    leaveReasonMissing: string;
    leavePhotoMissing: string;
    submitting: string;
    /** The submit button's label while no photo is attached. */
    attachMcToSubmit: string;
    submitLeave: string;
    /** Only shown when the server gave no message of its own. */
    leaveSubmitFailed: string;
    leaveRejectedNote: string;
    leavePendingNote: string;
    /** Day-detail sheet title when nothing on the day was missed. */
    shiftsThisDay: string;
    outcomeCancelled: string;
    outcomeNoShow: string;
    outcomeLeaveRequested: string;
    outcomeNoCheckIn: string;
    outcomeCheckedInOut: string;
    outcomeCheckedIn: string;
    outcomeNotStarted: string;
    /** Spelled out in full alongside missedNoteMany rather than splicing a fragment in — Chinese puts 'the shift marked above' somewhere else in the sentence. */
    missedNoteOne: string;
    /** Used when the day holds more than one shift. */
    missedNoteMany: string;
  };
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
      tapToCollapse: 'Tap to collapse',
      tapToExpand: 'Tap to expand',
      newBadge: 'New',
      brandLogo: 'InnocenZ logo',
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
      notificationsHint: 'Assignments, swaps, PVs, and SOS receipts — tap to open the screen.',
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
      off: 'Off',
      noShiftToday: 'No shift scheduled for today.',
      nothingToDo: 'Nothing to do',
      forgotCheckOut: 'Forgot to check out?',
      where: 'WHERE',
      shiftEnded: 'SHIFT ENDED',
      payStopsAt: 'Your pay stops at {time} whenever you tap out — check out now to close the shift.',
      voucher: 'VOUCHER',
      netPay: 'NET PAY',
      date: 'Date',
      time: 'Time',
      dressCode: 'Dress code',
      preferredLanguages: 'Preferred languages',
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
    shiftStatus: {
      checkInHead: 'CHECK-IN',
      checkOutHead: 'CHECK-OUT',
      checkOutPending: 'Pending',
      duration: 'DURATION',
      inProgress: 'In progress',
      salesTarget: 'SALES TARGET',
      targetOf: 'of {target} · {pct}%',
      drinks: 'Drinks',
      tips: 'Tips',
      scan: 'Scan',
      selfLog: 'Self-log',
      status: 'STATUS',
      pendingOne: '{n} receipt pending verification in Payment',
      pendingMany: '{n} receipts pending verification in Payment',
      matchedOne: '{n} receipt matched · PV ready',
      matchedMany: '{n} receipts matched · PV ready',
      colRef: 'REF',
      colItem: 'ITEM',
      colQty: 'QTY',
      colSource: 'SOURCE',
      colComm: 'COMM.',
      colVerify: 'VERIFY',
      dutyTime: 'Duty time',
      sourceCheckIn: 'Check-in',
      sourceManual: 'Manual entry',
      sourceScan: 'Receipt scan',
      refTip: 'Tip',
      refOt: 'OT',
      refDrink: 'Drink',
      sealed: 'Sealed',
      pending: 'Pending',
      verified: 'Verified',
      approved: 'Approved',
      matched: 'Matched',
      totals: 'TOTALS',
      totalsHint: 'wage {wage} + comm',
      proofPhotos: 'PROOF PHOTOS · {n}',
      proofHintEditable: 'Tap to view · ✕ removes the receipt and everything logged from it',
      proofHintLocked: 'Pictures you uploaded for this shift',
      saving: 'Saving…',
      addPhoto: 'Add another photo',
      removeFailed: 'Could not remove this receipt',
    },
    shiftLib: {
      reviewPvTitle: 'Review payment voucher',
      reviewPvAction: 'Review PV',
      multiOutlet: '({n})-outlet',
      loadShiftFailed: 'Could not load your shift',
      durationHours: '{h}h',
      durationHoursMinutes: '{h}h {m}m',
      durationWithOt: '{base} incl. +{ot}m OT',
    },
    jobs: {
      banner: 'Request transportation, makeup, wardrobe, and other services — or raise Leave agency under Service.',
      orderService: 'Order service',
      filterBookings: 'FILTER BOOKINGS',
      countOf: '{shown} of {total}',
      filterDate: 'DATE',
      filterService: 'SERVICE',
      filterStatus: 'STATUS',
      all: 'All',
      allDates: 'All dates',
      clearFilters: 'Clear filters',
      yourServiceOrders: 'YOUR SERVICE ORDERS',
      recordOne: '{n} record',
      recordMany: '{n} records',
      tapToCollapse: 'Tap to collapse',
      tapToExpand: 'Tap to expand',
      noOrders: 'No service orders yet',
      iconGuide: 'Icon guide',
      iconGuideBody: 'What each icon means — same icon, same meaning everywhere. Today · Post Job · Shifts · Check-In · Payment · History · Profile · Notifications · Drinks · Tips · Sign out.',
      serviceRequestTitle: 'Service request',
      orderServiceTitle: 'Order agency service',
      sheetSubtitle: 'Request an add-on service — admin will review and confirm.',
      service: 'Service',
      budget: 'Budget (RM)',
      serviceTime: 'Service time',
      reason: 'Reason',
      notes: 'Notes',
      reasonPlaceholder: 'Reason for early leave…',
      notesPlaceholder: 'Pickup address, delivery items, outlet contact…',
      submitting: 'Submitting…',
      raiseTicket: 'Raise support ticket',
      submitToAdmin: 'Submit to admin',
      submitFailed: 'Could not submit — please try again.',
      am: 'AM',
      pm: 'PM',
      timeAm: '{time} AM',
      timePm: '{time} PM',
      you: 'You',
      adminService: 'Admin service',
      raisedByPr: '{name} (PR)',
      agency: 'Agency',
      out: 'Out',
      inAmount: 'In {amount}',
      orderMoney: 'In {inAmt} · Out {outAmt} · Raised by {who}',
      tbc: 'TBC',
      statusPendingReview: 'Pending review',
      statusAssigned: 'Assigned',
      statusInProgress: 'In progress',
      statusCompleted: 'Completed',
      statusCancelled: 'Cancelled',
      statusAccepted: 'Accepted',
      statusRejected: 'Rejected',
      statusPendingAgency: 'Pending agency',
      statusAwaitingPr: 'Awaiting PR',
      statusConfirmed: 'Confirmed',
      statusDeclined: 'Declined',
      statusPaid: 'Paid',
      offerTransportation: 'Transportation',
      offerTransportationSummary: 'Shift pickup, late-night return, and outlet transfers',
      offerDelivery: 'Deliveries',
      offerDeliverySummary: 'Outfits, heels, props, and supplies sent to venue',
      offerWardrobe: 'Wardrobe & styling',
      offerWardrobeSummary: 'Gown rental, dress code sourcing, and styling coordination',
      offerMakeup: 'Makeup & grooming',
      offerMakeupSummary: 'Professional makeup before VIP or launch events',
      offerVipEscort: 'VIP escort',
      offerVipEscortSummary: 'Premium table hosting and high-value guest coverage',
      offerUniform: 'Uniform & documents',
      offerUniformSummary: 'Uniform handling, badge printing, and compliance docs',
      offerEmergencyCover: 'Emergency cover',
      offerEmergencyCoverSummary: 'Last-minute replacement PR sourcing and dispatch',
      offerTraining: 'Training top-up',
      offerTrainingSummary: 'Tier upgrades, coaching sessions, and certification fees',
      offerOthers: 'Others',
      offerOthersSummary: 'Name your own service — describe what you need below',
      offerLeaveAgency: 'Leave agency',
      offerLeaveAgencySummary: 'Before 1 year you must raise a support ticket for early leave',
    },
    schedule: {
      dowSun: 'Su',
      dowMon: 'Mo',
      dowTue: 'Tu',
      dowWed: 'We',
      dowThu: 'Th',
      dowFri: 'Fr',
      dowSat: 'Sa',
      daySun: 'Sun',
      dayMon: 'Mon',
      dayTue: 'Tue',
      dayWed: 'Wed',
      dayThu: 'Thu',
      dayFri: 'Fri',
      daySat: 'Sat',
      monShortJan: 'Jan',
      monShortFeb: 'Feb',
      monShortMar: 'Mar',
      monShortApr: 'Apr',
      monShortMay: 'May',
      monShortJun: 'Jun',
      monShortJul: 'Jul',
      monShortAug: 'Aug',
      monShortSep: 'Sep',
      monShortOct: 'Oct',
      monShortNov: 'Nov',
      monShortDec: 'Dec',
      monLongJan: 'January',
      monLongFeb: 'February',
      monLongMar: 'March',
      monLongApr: 'April',
      monLongMay: 'May',
      monLongJun: 'June',
      monLongJul: 'July',
      monLongAug: 'August',
      monLongSep: 'September',
      monLongOct: 'October',
      monLongNov: 'November',
      monLongDec: 'December',
      dateFriendly: '{dow} · {d} {mon} {y}',
      weekRangeSameMonth: '{from}–{to} {mon} {y}',
      weekRangeCrossMonth: '{from} {fromMon} – {to} {toMon} {y}',
      monthLabel: 'MONTH',
      yearLabel: 'YEAR',
      legendAvailable: 'Available',
      legendScheduledComplete: 'Scheduled / Complete',
      legendNotAvailable: 'Not available',
      missedCheckIn: 'Missed check-in',
      statusPending: 'Pending',
      statusScheduled: 'Scheduled',
      statusLeavePending: 'Leave pending',
      statusLeaveApproved: 'Leave approved',
      timetableTitle: 'Timetable · {range}',
      refresh: 'Refresh',
      noShiftsThisWeek: 'No shifts this week',
      agencyBadge: 'AGENCY · {name}',
      agencyFallback: 'Agency',
      ruleAnyTimeBefore: 'Any time before shift',
      ruleFreeCancel: 'Free cancel',
      ruleOverHours: '> {h}h before',
      ruleBetweenHours: '{from}–{to}h before',
      ruleUnderHours: '< {h}h before',
      ruleWagesCut: '−{pct}% wages',
      tierNoFee: 'No cancellation fee',
      tierFree: '{h}h+ before — no deduction',
      tierShortNotice: 'Short notice ({from}–{to}h) — {pct}% of daily wages',
      tierLate: 'Late cancel (<{h}h) — {pct}% of daily wages',
      markUnavailable: 'Mark unavailable',
      markUnavailableNote: 'Your agency sees this day blocked on their roster and will not put you on a shift. Adding a reason is optional.',
      reasonOptionalPlaceholder: 'Reason (optional) — e.g. family event',
      blockDayFailed: 'Could not update that day. Try again.',
      cancelNote: 'Shifts are assigned by your agency — cancelling notifies your agency straight away.',
      penaltyFromNextPv: 'Penalty — (−{amount}) from next PV',
      noDeduction: 'No deduction',
      cancelReasonPlaceholder: 'Describe why you cannot work this shift',
      cancelReasonMissing: 'Please describe why you cannot work this shift.',
      cancelAccept: 'Cancel & accept',
      cancelAcceptWithFee: 'Cancel & accept (−{amount})',
      cancelling: 'Cancelling…',
      cancelFailed: 'Could not cancel. Try again.',
      notSignedIn: 'Not signed in.',
      mcLeave: 'MC / Leave',
      mcLeaveNote: 'Unable to work this shift due to MC or personal leave? Send the request to your agency — you stay scheduled until they approve it.',
      noPenaltyWhenApproved: 'No penalty when approved',
      noPenaltyWhenApprovedBody: 'An approved MC / leave excuses this shift with no deduction. If rejected, the shift stays yours — cancelling instead follows the cancellation rules.',
      mcPhotoRequired: 'MC / document photo (required)',
      takePhoto: 'Take photo',
      uploadPhoto: 'Upload photo',
      mcPhotoHint: 'Your agency reviews this photo before approving the leave.',
      leaveReasonPlaceholder: 'e.g. MC — fever, clinic visit tomorrow morning',
      leaveReasonMissing: 'Please describe your MC / leave reason.',
      leavePhotoMissing: 'Please attach a photo of your MC / supporting document.',
      submitting: 'Submitting…',
      attachMcToSubmit: 'Attach MC photo to submit',
      submitLeave: 'Submit leave request',
      leaveSubmitFailed: 'Could not submit. Try again.',
      leaveRejectedNote: 'Leave request rejected — you are still on this shift.',
      leavePendingNote: 'MC / Leave submitted — awaiting agency review.',
      shiftsThisDay: 'Shifts this day',
      outcomeCancelled: 'Cancelled',
      outcomeNoShow: 'Marked no-show',
      outcomeLeaveRequested: 'Leave requested',
      outcomeNoCheckIn: 'No check-in recorded',
      outcomeCheckedInOut: 'Checked in and out',
      outcomeCheckedIn: 'Checked in',
      outcomeNotStarted: 'Scheduled — not started',
      missedNoteOne: 'No check-in was recorded for this shift, and no MC / leave or cancellation is on file. Contact your agency if this is wrong.',
      missedNoteMany: 'No check-in was recorded for the shift marked above, and no MC / leave or cancellation is on file. Contact your agency if this is wrong.',
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
      tapToCollapse: '点击收起',
      tapToExpand: '点击展开',
      newBadge: '新',
      brandLogo: 'InnocenZ 标志',
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
      notificationsHint: '排班、换班、结算单与 SOS 收据 — 点击可打开对应页面。',
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
      off: '休息',
      noShiftToday: '今日没有安排班次。',
      nothingToDo: '暂无待办',
      forgotCheckOut: '忘记签退了吗？',
      where: '地点',
      shiftEnded: '班次结束',
      payStopsAt: '不论何时签退，工资都只算到 {time}。请立即签退以结束班次。',
      voucher: '结算单',
      netPay: '净额',
      date: '日期',
      time: '时间',
      dressCode: '着装要求',
      preferredLanguages: '语言偏好',
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
    shiftStatus: {
      checkInHead: '签到',
      checkOutHead: '签退',
      checkOutPending: '未签退',
      duration: '时长',
      inProgress: '进行中',
      salesTarget: '销售目标',
      targetOf: '目标 {target} · {pct}%',
      drinks: '酒水',
      tips: '小费',
      scan: '扫描',
      selfLog: '自行记录',
      status: '状态',
      pendingOne: '{n} 张收据待在结算页核实',
      pendingMany: '{n} 张收据待在结算页核实',
      matchedOne: '{n} 张收据已匹配 · 结算单已就绪',
      matchedMany: '{n} 张收据已匹配 · 结算单已就绪',
      colRef: '记录',
      colItem: '项目',
      colQty: '数量',
      colSource: '来源',
      colComm: '佣金',
      colVerify: '核实',
      dutyTime: '值班时间',
      sourceCheckIn: '签到',
      sourceManual: '手动输入',
      sourceScan: '收据扫描',
      refTip: '小费',
      refOt: '加班',
      refDrink: '酒水',
      sealed: '已封存',
      pending: '待审核',
      verified: '已核实',
      approved: '已批准',
      matched: '已匹配',
      totals: '合计',
      totalsHint: '工资 {wage} + 佣金',
      proofPhotos: '证明照片 · {n}',
      proofHintEditable: '点按查看 · ✕ 将删除该收据及由它记录的全部内容',
      proofHintLocked: '你为本班次上传的照片',
      saving: '保存中…',
      addPhoto: '再添加一张照片',
      removeFailed: '无法删除此收据',
    },
    shiftLib: {
      reviewPvTitle: '审阅结算单',
      reviewPvAction: '去审阅',
      multiOutlet: '{n} 家门店',
      loadShiftFailed: '无法加载你的班次',
      durationHours: '{h} 小时',
      durationHoursMinutes: '{h} 小时 {m} 分',
      durationWithOt: '{base}（含加班 +{ot} 分钟）',
    },
    jobs: {
      banner: '可申请交通、妆发、服装等服务 — 如需离开经纪公司，请在「服务」中选择「离开经纪公司」。',
      orderService: '申请服务',
      filterBookings: '筛选预约',
      countOf: '{shown}/{total} 条',
      filterDate: '日期',
      filterService: '服务',
      filterStatus: '状态',
      all: '全部',
      allDates: '全部日期',
      clearFilters: '清除筛选',
      yourServiceOrders: '你的服务订单',
      recordOne: '{n} 条记录',
      recordMany: '{n} 条记录',
      tapToCollapse: '点按收起',
      tapToExpand: '点按展开',
      noOrders: '暂无服务订单',
      iconGuide: '图标说明',
      iconGuideBody: '每个图标的含义 — 同一图标在各处含义相同。今日 · 发布职位 · 班次 · 签到 · 结算 · 记录 · 我的 · 通知 · 酒水 · 小费 · 退出登录。',
      serviceRequestTitle: '服务申请',
      orderServiceTitle: '申请经纪公司服务',
      sheetSubtitle: '申请附加服务 — 管理员将审核并确认。',
      service: '服务',
      budget: '预算（RM）',
      serviceTime: '服务时间',
      reason: '原因',
      notes: '备注',
      reasonPlaceholder: '提前离开的原因…',
      notesPlaceholder: '接送地址、配送物品、门店联系人…',
      submitting: '提交中…',
      raiseTicket: '提交支持工单',
      submitToAdmin: '提交给管理员',
      submitFailed: '提交失败，请重试。',
      am: '上午',
      pm: '下午',
      timeAm: '上午 {time}',
      timePm: '下午 {time}',
      you: '你',
      adminService: '管理服务',
      raisedByPr: '{name}（PR）',
      agency: '经纪公司',
      out: '支出',
      inAmount: '收入 {amount}',
      orderMoney: '收入 {inAmt} · 支出 {outAmt} · 由 {who} 提出',
      tbc: '待定',
      statusPendingReview: '待审核',
      statusAssigned: '已指派',
      statusInProgress: '进行中',
      statusCompleted: '已完成',
      statusCancelled: '已取消',
      statusAccepted: '已接受',
      statusRejected: '已拒绝',
      statusPendingAgency: '待经纪公司处理',
      statusAwaitingPr: '待 PR 处理',
      statusConfirmed: '已确认',
      statusDeclined: '已婉拒',
      statusPaid: '已支付',
      offerTransportation: '交通接送',
      offerTransportationSummary: '班次接送、深夜返程与门店转场',
      offerDelivery: '物品配送',
      offerDeliverySummary: '将服装、鞋子、道具与物资送到场地',
      offerWardrobe: '服装与造型',
      offerWardrobeSummary: '礼服租借、着装要求采购与造型协调',
      offerMakeup: '妆发与仪容',
      offerMakeupSummary: 'VIP 或发布活动前的专业妆容',
      offerVipEscort: 'VIP 陪同',
      offerVipEscortSummary: '高端桌台接待与重要客户陪同',
      offerUniform: '制服与证件',
      offerUniformSummary: '制服处理、工牌打印与合规文件',
      offerEmergencyCover: '紧急替班',
      offerEmergencyCoverSummary: '临时替补 PR 的寻找与派遣',
      offerTraining: '培训进修',
      offerTrainingSummary: '等级晋升、辅导课程与认证费用',
      offerOthers: '其他',
      offerOthersSummary: '自定义服务 — 请在下方说明你的需求',
      offerLeaveAgency: '离开经纪公司',
      offerLeaveAgencySummary: '未满一年提前离开，须提交支持工单',
    },
    schedule: {
      dowSun: '日',
      dowMon: '一',
      dowTue: '二',
      dowWed: '三',
      dowThu: '四',
      dowFri: '五',
      dowSat: '六',
      daySun: '周日',
      dayMon: '周一',
      dayTue: '周二',
      dayWed: '周三',
      dayThu: '周四',
      dayFri: '周五',
      daySat: '周六',
      monShortJan: '1月',
      monShortFeb: '2月',
      monShortMar: '3月',
      monShortApr: '4月',
      monShortMay: '5月',
      monShortJun: '6月',
      monShortJul: '7月',
      monShortAug: '8月',
      monShortSep: '9月',
      monShortOct: '10月',
      monShortNov: '11月',
      monShortDec: '12月',
      monLongJan: '一月',
      monLongFeb: '二月',
      monLongMar: '三月',
      monLongApr: '四月',
      monLongMay: '五月',
      monLongJun: '六月',
      monLongJul: '七月',
      monLongAug: '八月',
      monLongSep: '九月',
      monLongOct: '十月',
      monLongNov: '十一月',
      monLongDec: '十二月',
      dateFriendly: '{y}年{mon}{d}日 {dow}',
      weekRangeSameMonth: '{y}年{mon}{from}–{to}日',
      weekRangeCrossMonth: '{y}年{fromMon}{from}日 – {toMon}{to}日',
      monthLabel: '月份',
      yearLabel: '年份',
      legendAvailable: '可接班',
      legendScheduledComplete: '已排班 / 已完成',
      legendNotAvailable: '不可接班',
      missedCheckIn: '未签到',
      statusPending: '待确认',
      statusScheduled: '已排班',
      statusLeavePending: '请假待批',
      statusLeaveApproved: '请假已批准',
      timetableTitle: '时间表 · {range}',
      refresh: '刷新',
      noShiftsThisWeek: '本周暂无班次',
      agencyBadge: '经纪公司 · {name}',
      agencyFallback: '经纪公司',
      ruleAnyTimeBefore: '班次开始前任何时间',
      ruleFreeCancel: '免费取消',
      ruleOverHours: '提前 {h} 小时以上',
      ruleBetweenHours: '提前 {from}–{to} 小时',
      ruleUnderHours: '提前不足 {h} 小时',
      ruleWagesCut: '扣 {pct}% 工资',
      tierNoFee: '无取消费用',
      tierFree: '提前 {h} 小时以上 — 不扣款',
      tierShortNotice: '短时通知（提前 {from}–{to} 小时）— 扣日薪的 {pct}%',
      tierLate: '临时取消（提前不足 {h} 小时）— 扣日薪的 {pct}%',
      markUnavailable: '标记为不可接班',
      markUnavailableNote: '经纪公司会在排班表上看到这一天已被标记，不会为你安排班次。填写原因是可选的。',
      reasonOptionalPlaceholder: '原因（选填）— 例如家庭活动',
      blockDayFailed: '无法更新该日期，请重试。',
      cancelNote: '班次由经纪公司安排 — 取消后会立即通知经纪公司。',
      penaltyFromNextPv: '罚款 — 从下期结算单扣除（−{amount}）',
      noDeduction: '不扣款',
      cancelReasonPlaceholder: '请说明你无法出勤的原因',
      cancelReasonMissing: '请说明你无法出勤的原因。',
      cancelAccept: '取消并接受',
      cancelAcceptWithFee: '取消并接受（−{amount}）',
      cancelling: '取消中…',
      cancelFailed: '取消失败，请重试。',
      notSignedIn: '尚未登录。',
      mcLeave: '病假 / 请假',
      mcLeaveNote: '因病假或事假无法出勤？向经纪公司提交申请 — 在获批之前，你仍留在这个班次上。',
      noPenaltyWhenApproved: '获批后不扣款',
      noPenaltyWhenApprovedBody: '病假 / 请假获批后，本次班次免责且不扣款。若被拒绝，班次仍属于你 — 改为取消将按取消规则处理。',
      mcPhotoRequired: '病假单 / 证明照片（必填）',
      takePhoto: '拍照',
      uploadPhoto: '上传照片',
      mcPhotoHint: '经纪公司会先查看这张照片，再批准请假。',
      leaveReasonPlaceholder: '例如：病假 — 发烧，明早看诊',
      leaveReasonMissing: '请说明病假 / 请假的原因。',
      leavePhotoMissing: '请附上病假单 / 证明文件的照片。',
      submitting: '提交中…',
      attachMcToSubmit: '附上病假单照片后才能提交',
      submitLeave: '提交请假申请',
      leaveSubmitFailed: '提交失败，请重试。',
      leaveRejectedNote: '请假申请已被拒绝 — 你仍需出勤这个班次。',
      leavePendingNote: '病假 / 请假已提交 — 等待经纪公司审核。',
      shiftsThisDay: '当天班次',
      outcomeCancelled: '已取消',
      outcomeNoShow: '已标记为缺勤',
      outcomeLeaveRequested: '已提交请假',
      outcomeNoCheckIn: '未记录签到',
      outcomeCheckedInOut: '已签到并签退',
      outcomeCheckedIn: '已签到',
      outcomeNotStarted: '已排班 — 尚未开始',
      missedNoteOne: '这个班次没有签到记录，也没有病假 / 请假或取消记录。如有出入，请联系你的经纪公司。',
      missedNoteMany: '上方标记的班次没有签到记录，也没有病假 / 请假或取消记录。如有出入，请联系你的经纪公司。',
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
      tapToCollapse: '點擊收起',
      tapToExpand: '點擊展開',
      newBadge: '新',
      brandLogo: 'InnocenZ 標誌',
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
      notificationsHint: '排班、換班、結算單與 SOS 收據 — 點擊可開啟對應頁面。',
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
      off: '休息',
      noShiftToday: '今日沒有安排班次。',
      nothingToDo: '暫無待辦',
      forgotCheckOut: '忘記簽退了嗎？',
      where: '地點',
      shiftEnded: '班次結束',
      payStopsAt: '不論何時簽退，工資都只算到 {time}。請立即簽退以結束班次。',
      voucher: '結算單',
      netPay: '淨額',
      date: '日期',
      time: '時間',
      dressCode: '著裝要求',
      preferredLanguages: '語言偏好',
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
    shiftStatus: {
      checkInHead: '簽到',
      checkOutHead: '簽退',
      checkOutPending: '未簽退',
      duration: '時長',
      inProgress: '進行中',
      salesTarget: '銷售目標',
      targetOf: '目標 {target} · {pct}%',
      drinks: '酒水',
      tips: '小費',
      scan: '掃描',
      selfLog: '自行記錄',
      status: '狀態',
      pendingOne: '{n} 張收據待在結算頁核實',
      pendingMany: '{n} 張收據待在結算頁核實',
      matchedOne: '{n} 張收據已匹配 · 結算單已就緒',
      matchedMany: '{n} 張收據已匹配 · 結算單已就緒',
      colRef: '記錄',
      colItem: '項目',
      colQty: '數量',
      colSource: '來源',
      colComm: '佣金',
      colVerify: '核實',
      dutyTime: '值班時間',
      sourceCheckIn: '簽到',
      sourceManual: '手動輸入',
      sourceScan: '收據掃描',
      refTip: '小費',
      refOt: '加班',
      refDrink: '酒水',
      sealed: '已封存',
      pending: '待審核',
      verified: '已核實',
      approved: '已批准',
      matched: '已匹配',
      totals: '合計',
      totalsHint: '工資 {wage} + 佣金',
      proofPhotos: '證明照片 · {n}',
      proofHintEditable: '點按查看 · ✕ 將刪除該收據及由它記錄的全部內容',
      proofHintLocked: '你為本班次上傳的照片',
      saving: '儲存中…',
      addPhoto: '再新增一張照片',
      removeFailed: '無法刪除此收據',
    },
    shiftLib: {
      reviewPvTitle: '審閱結算單',
      reviewPvAction: '去審閱',
      multiOutlet: '{n} 家門店',
      loadShiftFailed: '無法載入你的班次',
      durationHours: '{h} 小時',
      durationHoursMinutes: '{h} 小時 {m} 分',
      durationWithOt: '{base}（含加班 +{ot} 分鐘）',
    },
    jobs: {
      banner: '可申請交通、妝髮、服裝等服務 — 如需離開經紀公司，請在「服務」中選擇「離開經紀公司」。',
      orderService: '申請服務',
      filterBookings: '篩選預約',
      countOf: '{shown}/{total} 筆',
      filterDate: '日期',
      filterService: '服務',
      filterStatus: '狀態',
      all: '全部',
      allDates: '全部日期',
      clearFilters: '清除篩選',
      yourServiceOrders: '你的服務訂單',
      recordOne: '{n} 筆紀錄',
      recordMany: '{n} 筆紀錄',
      tapToCollapse: '點按收合',
      tapToExpand: '點按展開',
      noOrders: '暫無服務訂單',
      iconGuide: '圖示說明',
      iconGuideBody: '每個圖示的含義 — 同一圖示在各處含義相同。今日 · 發布職位 · 班次 · 簽到 · 結算 · 紀錄 · 我的 · 通知 · 酒水 · 小費 · 登出。',
      serviceRequestTitle: '服務申請',
      orderServiceTitle: '申請經紀公司服務',
      sheetSubtitle: '申請附加服務 — 管理員將審核並確認。',
      service: '服務',
      budget: '預算（RM）',
      serviceTime: '服務時間',
      reason: '原因',
      notes: '備註',
      reasonPlaceholder: '提前離開的原因…',
      notesPlaceholder: '接送地址、配送物品、門店聯絡人…',
      submitting: '提交中…',
      raiseTicket: '提交支援工單',
      submitToAdmin: '提交給管理員',
      submitFailed: '提交失敗，請重試。',
      am: '上午',
      pm: '下午',
      timeAm: '上午 {time}',
      timePm: '下午 {time}',
      you: '你',
      adminService: '管理服務',
      raisedByPr: '{name}（PR）',
      agency: '經紀公司',
      out: '支出',
      inAmount: '收入 {amount}',
      orderMoney: '收入 {inAmt} · 支出 {outAmt} · 由 {who} 提出',
      tbc: '待定',
      statusPendingReview: '待審核',
      statusAssigned: '已指派',
      statusInProgress: '進行中',
      statusCompleted: '已完成',
      statusCancelled: '已取消',
      statusAccepted: '已接受',
      statusRejected: '已拒絕',
      statusPendingAgency: '待經紀公司處理',
      statusAwaitingPr: '待 PR 處理',
      statusConfirmed: '已確認',
      statusDeclined: '已婉拒',
      statusPaid: '已支付',
      offerTransportation: '交通接送',
      offerTransportationSummary: '班次接送、深夜返程與門店轉場',
      offerDelivery: '物品配送',
      offerDeliverySummary: '將服裝、鞋子、道具與物資送到場地',
      offerWardrobe: '服裝與造型',
      offerWardrobeSummary: '禮服租借、著裝要求採購與造型協調',
      offerMakeup: '妝髮與儀容',
      offerMakeupSummary: 'VIP 或發布活動前的專業妝容',
      offerVipEscort: 'VIP 陪同',
      offerVipEscortSummary: '高端桌檯接待與重要客戶陪同',
      offerUniform: '制服與證件',
      offerUniformSummary: '制服處理、工牌列印與合規文件',
      offerEmergencyCover: '緊急替班',
      offerEmergencyCoverSummary: '臨時替補 PR 的尋找與派遣',
      offerTraining: '培訓進修',
      offerTrainingSummary: '等級晉升、輔導課程與認證費用',
      offerOthers: '其他',
      offerOthersSummary: '自訂服務 — 請在下方說明你的需求',
      offerLeaveAgency: '離開經紀公司',
      offerLeaveAgencySummary: '未滿一年提前離開，須提交支援工單',
    },
    schedule: {
      dowSun: '日',
      dowMon: '一',
      dowTue: '二',
      dowWed: '三',
      dowThu: '四',
      dowFri: '五',
      dowSat: '六',
      daySun: '週日',
      dayMon: '週一',
      dayTue: '週二',
      dayWed: '週三',
      dayThu: '週四',
      dayFri: '週五',
      daySat: '週六',
      monShortJan: '1月',
      monShortFeb: '2月',
      monShortMar: '3月',
      monShortApr: '4月',
      monShortMay: '5月',
      monShortJun: '6月',
      monShortJul: '7月',
      monShortAug: '8月',
      monShortSep: '9月',
      monShortOct: '10月',
      monShortNov: '11月',
      monShortDec: '12月',
      monLongJan: '一月',
      monLongFeb: '二月',
      monLongMar: '三月',
      monLongApr: '四月',
      monLongMay: '五月',
      monLongJun: '六月',
      monLongJul: '七月',
      monLongAug: '八月',
      monLongSep: '九月',
      monLongOct: '十月',
      monLongNov: '十一月',
      monLongDec: '十二月',
      dateFriendly: '{y}年{mon}{d}日 {dow}',
      weekRangeSameMonth: '{y}年{mon}{from}–{to}日',
      weekRangeCrossMonth: '{y}年{fromMon}{from}日 – {toMon}{to}日',
      monthLabel: '月份',
      yearLabel: '年份',
      legendAvailable: '可接班',
      legendScheduledComplete: '已排班 / 已完成',
      legendNotAvailable: '不可接班',
      missedCheckIn: '未簽到',
      statusPending: '待確認',
      statusScheduled: '已排班',
      statusLeavePending: '請假待批',
      statusLeaveApproved: '請假已批准',
      timetableTitle: '時間表 · {range}',
      refresh: '重新整理',
      noShiftsThisWeek: '本週暫無班次',
      agencyBadge: '經紀公司 · {name}',
      agencyFallback: '經紀公司',
      ruleAnyTimeBefore: '班次開始前任何時間',
      ruleFreeCancel: '免費取消',
      ruleOverHours: '提前 {h} 小時以上',
      ruleBetweenHours: '提前 {from}–{to} 小時',
      ruleUnderHours: '提前不足 {h} 小時',
      ruleWagesCut: '扣 {pct}% 工資',
      tierNoFee: '無取消費用',
      tierFree: '提前 {h} 小時以上 — 不扣款',
      tierShortNotice: '短時通知（提前 {from}–{to} 小時）— 扣日薪的 {pct}%',
      tierLate: '臨時取消（提前不足 {h} 小時）— 扣日薪的 {pct}%',
      markUnavailable: '標記為不可接班',
      markUnavailableNote: '經紀公司會在排班表上看到這一天已被標記，不會為你安排班次。填寫原因是可選的。',
      reasonOptionalPlaceholder: '原因（選填）— 例如家庭活動',
      blockDayFailed: '無法更新該日期，請重試。',
      cancelNote: '班次由經紀公司安排 — 取消後會立即通知經紀公司。',
      penaltyFromNextPv: '罰款 — 從下期結算單扣除（−{amount}）',
      noDeduction: '不扣款',
      cancelReasonPlaceholder: '請說明你無法出勤的原因',
      cancelReasonMissing: '請說明你無法出勤的原因。',
      cancelAccept: '取消並接受',
      cancelAcceptWithFee: '取消並接受（−{amount}）',
      cancelling: '取消中…',
      cancelFailed: '取消失敗，請重試。',
      notSignedIn: '尚未登入。',
      mcLeave: '病假 / 請假',
      mcLeaveNote: '因病假或事假無法出勤？向經紀公司提交申請 — 在獲批之前，你仍留在這個班次上。',
      noPenaltyWhenApproved: '獲批後不扣款',
      noPenaltyWhenApprovedBody: '病假 / 請假獲批後，本次班次免責且不扣款。若被拒絕，班次仍屬於你 — 改為取消將按取消規則處理。',
      mcPhotoRequired: '病假單 / 證明照片（必填）',
      takePhoto: '拍照',
      uploadPhoto: '上傳照片',
      mcPhotoHint: '經紀公司會先查看這張照片，再批准請假。',
      leaveReasonPlaceholder: '例如：病假 — 發燒，明早看診',
      leaveReasonMissing: '請說明病假 / 請假的原因。',
      leavePhotoMissing: '請附上病假單 / 證明文件的照片。',
      submitting: '提交中…',
      attachMcToSubmit: '附上病假單照片後才能提交',
      submitLeave: '提交請假申請',
      leaveSubmitFailed: '提交失敗，請重試。',
      leaveRejectedNote: '請假申請已被拒絕 — 你仍需出勤這個班次。',
      leavePendingNote: '病假 / 請假已提交 — 等待經紀公司審核。',
      shiftsThisDay: '當天班次',
      outcomeCancelled: '已取消',
      outcomeNoShow: '已標記為缺勤',
      outcomeLeaveRequested: '已提交請假',
      outcomeNoCheckIn: '未記錄簽到',
      outcomeCheckedInOut: '已簽到並簽退',
      outcomeCheckedIn: '已簽到',
      outcomeNotStarted: '已排班 — 尚未開始',
      missedNoteOne: '這個班次沒有簽到紀錄，也沒有病假 / 請假或取消紀錄。如有出入，請聯絡你的經紀公司。',
      missedNoteMany: '上方標記的班次沒有簽到紀錄，也沒有病假 / 請假或取消紀錄。如有出入，請聯絡你的經紀公司。',
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
