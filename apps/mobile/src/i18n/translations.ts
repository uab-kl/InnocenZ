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
    /** Shown when a backdrop tap / hardware back would throw away a half-finished code flow (forgot password, contact change). */
    discardTitle: string;
    discardBody: string;
    /** Stays in the flow. Worded differently from `continue` so the two buttons never read the same. */
    keepGoing: string;
    /** Leaves the flow and discards what was entered. */
    leave: string;
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
    /** Screen-reader label on the brand logo image. */
    logoAlt: string;
  };
  forgot: {
    title: string;
    phoneHint: string;
    /** Segmented switch on the first step — find the account by its phone (the default) or by its email. Both reach the same account and the code goes to every contact on it. */
    byPhone: string;
    byEmail: string;
    /** First-step hint on the Email tab. As neutral as phoneHint: never says whether the address has an account. */
    emailHint: string;
    /** Field label on the Email tab (the Phone tab reuses login.mobileNumber). */
    emailLabel: string;
    sendCode: string;
    sending: string;
    otpTitle: string;
    /** `{m}` = minutes the code stays valid (from the server's expiresInSec). */
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
    /** Deliberately non-committal — never confirms whether the account exists. Mirrors the server's own neutral sentence. */
    codeSentInfo: string;
    /** Hint on the new-password step. Must NOT repeat the phone hint — the number is already behind the PR. */
    passwordHint: string;
    resetFailed: string;
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
    /** Bank section heading on the PR's own profile. */
    bankDetails: string;
    bankName: string;
    bankNamePlaceholder: string;
    bankAccountNo: string;
    bankAccountPlaceholder: string;
    /** Search wording inside the bank dropdown. */
    bankSearchPlaceholder: string;
    /** Helper under the two boxes: who uses this, and how to clear it. */
    bankHint: string;
    /** Shown in amber when neither field is set — a transfer cannot be made. */
    noBankDetails: string;
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
    /** Eyebrow above the profile hero card. */
    accountEyebrow: string;
    editingBadge: string;
    /** Hero badge. The comcard's own printed content stays English — this is screen chrome. */
    comcardIcBadge: string;
    floorNickname: string;
    legalIcName: string;
    agencies: string;
    selectAgencies: string;
    agencyTied: string;
    awaitingApproval: string;
    departureWaiting: string;
    icNumber: string;
    agencyLockedJoin: string;
    agencyLockedLeave: string;
    /** One key, not a name plus an appended English suffix. */
    agencyDeparturePending: string;
    leaveConfirm: string;
    requestToLeave: string;
    keep: string;
    departureRequested: string;
    departureFailed: string;
    nicknameLength: string;
    icNameRequired: string;
    languageRequired: string;
    /** Also used by Security → Change email before the code is requested. */
    emailInvalid: string;
    /** Under the read-only email in the profile editor — the sign-in email is changed only through the verified flow. */
    emailChangeHint: string;
    /** Opening Security settings while the profile editor is open — the edits are not saved and would be lost. */
    leaveEditTitle: string;
    leaveEditBody: string;
    /** Stays in the profile editor. The other button reuses common.leave. */
    keepEditing: string;
    profileSaved: string;
    saveFailed: string;
    comcardUpdated: string;
    /** The expo command is a literal and stays English. */
    galleryUnavailable: string;
    imageTooLarge: string;
    avatarUpdated: string;
    avatarUploadFailed: string;
    portfolioUploadFailed: string;
    someImagesSkipped: string;
    removePhotoTitle: string;
    /** {label} is the two-digit slot number, e.g. 03. */
    removePhotoBody: string;
    portfolioRemoveFailed: string;
    savingArrangement: string;
    rearrangeFailed: string;
    portfolioRearranged: string;
    portfolio: string;
    portfolioDragHint: string;
    portfolioShowcase: string;
    /** No plural form — one key, count filled by formatMessage. */
    portfolioCount: string;
    /** Names the Edit-profile button; keep in step with profile.editProfile. */
    noLanguages: string;
    /** Rendered label for pr_tier 'tier_1'. The enum value itself never changes. */
    tier1: string;
    tier2: string;
    tier3: string;
    tier4: string;
    tier5: string;
    tierServant: string;
    tierCommissionOnly: string;
    slotTapToSwap: string;
    slotDragHint: string;
    /** The ✕ close button of the shared full-image viewer (ImageLightbox). */
    viewerReturn: string;
    /** Names the ✕ Return button — keep in step with profile.viewerReturn. */
    viewerHint: string;
    /** Placeholder inside the empty signature pad. */
    signHere: string;
    clearSignature: string;
    /** The age line the app draws over the portfolio collage. Screen chrome, not the comcard's own printed content. One key with the number in it, because Chinese does not take a label glued in front of a value. */
    comcardAge: string;
    /** Unit after the age figure, in the measure grid and its edit field. The cm and kg beside it are SI symbols and stay English; "y" is an English word shortened, so it moves with the language. */
    ageSuffix: string;
  };
  security: {
    title: string;
    changePassword: string;
    changePhone: string;
    changeEmail: string;
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
    /** The server caps a password at 72 characters (bcrypt's input limit). */
    passwordMax: string;
    passwordMismatch: string;
    phoneUpdated: string;
    emailUpdated: string;
    sendOtp: string;
    verifyOtp: string;
    eyebrow: string;
    intro: string;
    /** `{phone}` = the account's stored phone number. Appended after security.intro. */
    currentPhone: string;
    /** `{email}` = the account's stored email. Appended after currentPhone. */
    currentEmail: string;
    /** Password step 1 — says the change needs a code as well as the current password. */
    changePasswordHint: string;
    /** Password step 2 title — the code sent to the contacts ALREADY on file. */
    passwordCodeTitle: string;
    changePhoneHint: string;
    changeEmailHint: string;
    newMobileNumber: string;
    newEmail: string;
    /** Step 2 title — the code sent to the NEW number. */
    newPhoneCodeTitle: string;
    /** Step 2 title — the code sent to the NEW email. */
    newEmailCodeTitle: string;
    /** `{m}` = minutes the code stays valid. */
    codeValidFor: string;
    /** `{n}` = org invitations still addressed to the current email. Accepting one needs the account email to MATCH the invite, so they cannot be accepted after the change. */
    pendingInvites: string;
    /** Back to step 1 after the change expired. */
    startAgain: string;
    /** Field label above the 6-digit code input. */
    otpLabel: string;
    verifyAndSave: string;
    /**
     * Where a code went, built from the server's masked `sentTo`. EN reads
     * "Code sent by WhatsApp and SMS to +60 ••••• 6789 and by email to o••••@x.my".
     * Channel names are separate keys so Chinese can reorder the sentence.
     */
    channelWhatsapp: string;
    channelSms: string;
    channelEmail: string;
    /** Between channel names that share a destination ("WhatsApp and SMS"). */
    channelJoin: string;
    /** One destination: `{channels}` = joined channel names, `{to}` = masked destination, never translated. */
    sentVia: string;
    /** Between destinations. */
    sentPartJoin: string;
    /** `{parts}` = every sentVia joined by sentPartJoin. */
    sentSummary: string;
    /** Every attempt was written to the server log instead of delivered (development). */
    sentLoggedOnly: string;
    /** No channel delivered or logged. */
    sentNowhere: string;
    updatePasswordFailed: string;
    /** Shared by SecurityScreen contact change and ForgotPasswordModal. */
    sendCodeFailed: string;
    updatePhoneFailed: string;
    updateEmailFailed: string;
    deleteAccountFailed: string;
    /**
     * A password / phone / email change was SAVED but no fresh session came
     * back. The old session is refused from the moment of the change, so the
     * PR is signed out and signs in again.
     */
    signInAgainBody: string;
    signInAgain: string;
    /**
     * The server refused the SESSION (401 Unauthorized) before anything was
     * written — expired, or cut off by a credential change on another device.
     * Shown on the same sign-in-again sheet, in place of the "updated" line.
     */
    sessionEnded: string;
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
    /** Who booked the night — a PR on two rosters cannot tell otherwise. */
    agency: string;
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
    /** Status value shown for phase 'booked'. The PHASE STRING itself stays English. zh and zh-Hant are identical on purpose — no character differs between the scripts. */
    booked: string;
    /** Status value shown when there is no actionable assignment at all. */
    noShift: string;
    /** Last-resort error when check-in/check-out throws something that is not an Error. A real backend message keeps its own wording. */
    attendanceFailed: string;
    /** Amber banner shown while the screen is pinned to a finished shift and a live one is waiting. */
    viewingEarlier: string;
    loadingShift: string;
    idleEmpty: string;
    /** Shown in place of the event name when the assignment has none. zh and zh-Hant are identical on purpose — no character differs. */
    eventFallback: string;
    /** FIELD LABEL in the expanded shift brief; its value is the formatted date. */
    dayAndDate: string;
    /** Shown until the first GPS fix arrives. zh and zh-Hant are identical on purpose — no character differs. */
    locating: string;
    /** Inside the geofence. `{m}` = metres, `{name}` = outlet name. One key, filled by formatMessage — Chinese puts the venue before the distance. */
    metresFrom: string;
    /** Outside the geofence. Also the Check-in button's label while the gate blocks. `{m}` = metres. */
    metresAway: string;
    /** Whole sentence in one key — never the radius clause and the privacy tail glued together. `{m}` = fence radius, `{name}` = outlet. */
    gpsNote: string;
    /** The GPS_BYPASS variant of checkin.gpsNote. Same placeholders. */
    gpsNoteBypass: string;
    /** `{d}` is the already-localised label from shiftDurationLabel(). */
    duration: string;
    /** Must NOT read as a filed claim — nothing is sent. `{h}` = hours (1 dp), `{amount}` = pre-formatted RM. */
    otEstimate: string;
    cancelWarning: string;
    /** TextInput placeholder in the cancel sheet. The reason the PR types is their own text and is never translated. */
    reasonPlaceholder: string;
    /** Body of the styled permission explainer shown BEFORE the bare OS popup. "InnocenZ" is the brand and stays English. */
    locationExplainer: string;
    /** Permission-explainer checklist line. The leading ✓ is a bullet glyph rendered by the JSX, not part of this value. */
    locCheckRadius: string;
    /** Permission-explainer checklist line; the ✓ bullet is added by the JSX. */
    locCheckStamp: string;
    /** Permission-explainer checklist line; the ✓ bullet is added by the JSX. */
    locCheckNoTracking: string;
    /** Press-and-hold progress on the check-in / check-out button. `{p}` = percent. zh and zh-Hant are identical on purpose — no character differs. */
    holding: string;
    /** SINGULAR of the check-out refusal. Spelled out as its own key because Chinese has no plural fragment to append; the zh/zh-Hant text is the same as missingPhotoMany by design. */
    missingPhotoOne: string;
    /** PLURAL of the check-out refusal. See missingPhotoOne. */
    missingPhotoMany: string;
    /**
     * WARNING when the shift is completely empty — no longer a refusal.
     *
     * It used to disable check-out outright with no override, which left a PR
     * who genuinely sold nothing unable to close the shift, unable to be paid
     * for it (the wage is sealed at check-out) and unable to check in to any
     * later shift, since the server refuses a second open check-in.
     */
    nothingLogged: string;
    /** Title of the sheet that confirms checking out of an empty shift. */
    emptyShiftTitle: string;
    /** What is lost by checking out with nothing logged — shown in that sheet. */
    emptyShiftWarning: string;
    /** Confirm button in that sheet. */
    emptyShiftConfirm: string;
    /** Error banner after the "Refresh GPS" link is tapped and permission is still refused. */
    locPermissionOff: string;
    /** Error banner when the "Refresh GPS" one-shot read throws. */
    gpsReadFailed: string;
    /** lib/device-location.ts refusal, reason 'denied'. The reason CODE stays English — it is compared, not shown. */
    locationDenied: string;
    /** lib/device-location.ts refusal, reason 'disabled'. */
    locationDisabled: string;
    /** lib/device-location.ts refusal, reason 'timeout' — no fresh fix and no usable last-known one. */
    locationTimeout: string;
    /** lib/device-location.ts fallback when the thrown value carries no message of its own. A real expo Error keeps its own English text. */
    locationUnknown: string;
  };
  payment: {
    title: string;
    history: string;
    /** Week tab. */
    /** Banner shown when the PR has no bank details — they cannot be paid. */
    bankNudgeTitle: string;
    bankNudgeBody: string;
    bankNudgeAction: string;
    lastWeek: string;
    /** Week tab. */
    thisWeek: string;
    /** Caps section header above the last-week grid. */
    lastWeekTitle: string;
    /** Caps section header above the this-week grid. */
    thisWeekTitle: string;
    lastWeekRange: string;
    verifiedDays: string;
    approvedDays: string;
    /** Shown when a voucher carries no agency name. */
    agencyFallback: string;
    /** Pay-grid total column heading. */
    gridTotal: string;
    /** Second line of the total column heading. */
    gridTotalSub: string;
    rowWages: string;
    rowDrinks: string;
    rowTips: string;
    rowOthers: string;
    rowDeductions: string;
    nVerified: string;
    nPending: string;
    /** Status word — day pills, receipt rows, voucher pills and penalty rows all read from this one vocabulary. */
    statusPending: string;
    statusApproved: string;
    statusDisputed: string;
    statusVerified: string;
    statusDeducted: string;
    statusPaid: string;
    statusSigned: string;
    statusSent: string;
    disputeOpen: string;
    disputeOpenNamed: string;
    disputeBannerHint: string;
    /** {red} is replaced at render time by the word below, drawn in red. Keep the placeholder. */
    tapHint: string;
    /** The one word inside payment.tapHint that is drawn in red. */
    redWord: string;
    /** The week total follows this line, styled. */
    pvIssuedSunday: string;
    /** {day} is drawn in bold at render time. Keep the placeholder. */
    pvOnDay: string;
    totalLower: string;
    /** Shown when last week could not be LOADED - distinct from no voucher. */
    couldNotLoadLastWeek: string;
    noLastWeekPv: string;
    checkOutToSeal: string;
    reviewSign: string;
    reviewSignNamed: string;
    whatYouDisputed: string;
    receiptsThisDay: string;
    /** Receipt count for one day. */
    nTotal: string;
    receiptCounts: string;
    /** A dispute nobody has answered yet. */
    claimOpen: string;
    claimAccepted: string;
    claimRejected: string;
    claimWithdrawn: string;
    voucherSaid: string;
    raisedAt: string;
    filedWholeDay: string;
    /** Heading for a shift the outlet never named. */
    shiftFallback: string;
    shiftTimeUnknown: string;
    inOutWindow: string;
    noOrderNo: string;
    wholeReceipt: string;
    noReceiptBehind: string;
    agencyAnswer: string;
    cancelThisDispute: string;
    cancelling: string;
    durationUnknown: string;
    hours: string;
    hoursMinutes: string;
    minutes: string;
    withOvertime: string;
    /** One entry in the pending-overtime caption. {day} stays the English column abbreviation so it names the grid column it points at. */
    otOnDay: string;
    otPending: string;
    withdrawDisputeTitle: string;
    disputeThisAmount: string;
    whichOneWrong: string;
    /** Why a shift chip cannot be picked. */
    alreadyDisputed: string;
    /** Note on a shift chip whose receipt the agency has not looked at. */
    notReviewedYetShort: string;
    /** Appended to a chip's accessibilityLabel. */
    selected: string;
    pickShift: string;
    disputingOf: string;
    whichItem: string;
    pickOneItem: string;
    /**
     * Was "Quick reason" (owner, 3 Sep 2026: "remove the quick reason, put name
     * to reason"). "Quick" read as a shortcut the PR could skip, but this IS the
     * reason posted to the agency and printed on their dispute card.
     */
    quickReason: string;
    /** Says why the note below fills itself in — it tracks the ticked items. */
    noteFollowsItems: string;
    /** Face of the DISPUTE_PRESETS value 'Wrong commission'; the posted reason stays English. */
    reasonWrongCommission: string;
    reasonWrongQuantity: string;
    reasonCountedTwice: string;
    reasonMissingFromPv: string;
    reasonWrongRate: string;
    reasonNotMyShift: string;
    reasonOthers: string;
    notePlaceholder: string;
    attachImages: string;
    optional: string;
    /** Singular half of a pair — Chinese has no plural, so both halves read the same there. */
    imagesAttachedOne: string;
    imagesAttachedMany: string;
    proofOptional: string;
    submitting: string;
    submitDispute: string;
    withdrawSub: string;
    proofCleared: string;
    withdrawing: string;
    withdrawDispute: string;
    notDisputedHereTitle: string;
    notDisputedHereBody: string;
    notReviewedTitle: string;
    notReviewedBody: string;
    openDayFirstTitle: string;
    openDayFirstBody: string;
    couldNotCancel: string;
    tryAgain: string;
    cancelConfirmTitle: string;
    cancelConfirmBody: string;
    keepIt: string;
    cancelDispute: string;
    pickShiftFirstTitle: string;
    pickShiftFirstBody: string;
    noVoucherTitle: string;
    noVoucherLast: string;
    noVoucherThis: string;
    disputeFailed: string;
    nVouchersThisWeek: string;
    multiAgencyHint: string;
    notYetNumbered: string;
    penaltiesThisWeek: string;
    cancelledShift: string;
    pctOfDailyWage: string;
    /** Penalty rule type min_shifts_per_week. */
    ruleMinShifts: string;
    /** Penalty rule type max_mc_per_month. */
    ruleMaxMc: string;
    /** Penalty rule type late_per_week. */
    ruleLate: string;
    /** Penalty rule type cancellation. */
    ruleCancellation: string;
    /** "Sun 23" — a weekday beside its day-of-month, derived from the day's own ISO date. Names a grid column: the pending-overtime caption, the two "not disputable" alerts and the dispute pill all point at one. {dow} comes from t.schedule.daySun…daySat. No character differs between the two Chinese scripts — the difference rides in {dow}. */
    dayAndDate: string;
    /** "4 Aug, 11:29 AM" — a raised-at / check-in / check-out stamp, short enough to sit on a claim row. {time} arrives already built by t.jobs.timeAm / timePm (Chinese puts 上午/下午 in front of the clock), {mon} from t.schedule.monShort*. Chinese writes the month first, so the order lives in the template. No character differs between the two scripts. */
    stampShort: string;
  };
  history: {
    title: string;
    shifts: string;
    payments: string;
    /** Summary tile — everything earned by the shifts the filters currently keep. */
    earnedInRange: string;
    /** Uppercase summary-tile header — distinct from history.metricWages ('Wages'), the sentence-case metric label. */
    wagesTotal: string;
    /** Uppercase heading over the filter block on the Shifts sub-tab. */
    shiftHistory: string;
    searchPlaceholder: string;
    /** Uppercase filter caption — distinct from t.common.outlet ('Outlet'). */
    filterOutlet: string;
    /** Uppercase filter caption. */
    filterStatus: string;
    /** Uppercase filter caption on the shared History date field. Identical in both Chinese scripts. */
    filterDate: string;
    /** Unfiltered value of the outlet picker — the option id stays the English 'all'. */
    anyOutlet: string;
    /** Unfiltered value of the status picker — the option id stays the English 'any'. */
    anyStatus: string;
    /** Date field with nothing picked. Identical in both Chinese scripts. */
    anyDate: string;
    /** Status-filter option AND the amber pill on the current-week card — the week whose voucher is still a live draft. */
    statusCurrent: string;
    /** Status-filter option and shift pill — the PR has signed that week's payment voucher. */
    statusSigned: string;
    /** Singular half of the week-card count; Chinese has no plural form, so the count picks the whole string rather than appending an 's'. */
    shiftCountOne: string;
    /** Plural half of the week-card count. */
    shiftCountMany: string;
    /** Week-card money line; both values arrive already formatted as RM x.xx. */
    weekEarnLine: string;
    /** Empty body of one expanded week card — THAT week, which may be a past one, so it is not t.schedule.noShiftsThisWeek. */
    noShiftsInWeek: string;
    noShiftsMatch: string;
    /** Clears every filter at once — stronger than t.jobs.clearFilters ('Clear filters'). */
    resetFilters: string;
    /** {amount} is already formatted as RM x.xx. */
    totalPayout: string;
    cancelledNoPayout: string;
    /** Sentence-case metric label on a shift card — distinct from history.wagesTotal, the uppercase summary header. */
    metricWages: string;
    /** Metric label for the 'others' money kind (overtime and the like). Identical in both Chinese scripts. */
    metricOthers: string;
    /** Value of the FROM/TO time fields while they are disabled because no date is chosen. */
    pickDateFirst: string;
    /** Value of an enabled but empty time field. */
    tapToChoose: string;
    /** Uppercase caption AND the time picker's own modal title. */
    fromTime: string;
    toTime: string;
    /** Closes the time picker. Identical in both Chinese scripts. */
    done: string;
    /** Calendar legend for the gold dot under a day that has rows. */
    calLegendWorked: string;
    calLegendNote: string;
    /** Uppercase heading of the live week's History card. {range} is the already-localized week range (schedule.weekRangeSameMonth / weekRangeCrossMonth), e.g. '23–29 Aug 2026'. Distinct from history.statusCurrent ('Current'), the amber pill on the same card. */
    weekTitleCurrent: string;
    /** Segmented tab over the History week list: the live, unissued week. */
    tabCurrentWeek: string;
    /** Segmented tab over the History week list: the weeks that have a PV. */
    tabPayrollWeeks: string;
    /** Empty state under the Payroll tab before the PR has ever been issued a PV. */
    noPayrollWeeksYet: string;
    /** Heading of a past week's History card when the agency is unknown. {range} is the already-localized week range. */
    weekTitlePayroll: string;
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
    /** Attendance stamp before noon — "19 Jul 2026, 11:50 am". {d} day, {mon} short month (t.schedule.monShort*), {y} year, {time} the clock reading. Morning and evening are two WHOLE templates, not one sentence with an am/pm fragment spliced in: Chinese leads with the year and puts 上午 BEFORE the clock. zh and zh-Hant are identical on purpose — no character differs between the scripts. */
    stampAm: string;
    /** The afternoon/evening half of shiftLib.stampAm — same placeholders. Identical in both Chinese scripts; 下午 matches the wording already used by jobs.pm / jobs.timePm. */
    stampPm: string;
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
    /** A service order's date, on the order row and on the date-filter chip. Deliberately not t.schedule.dateFriendly: this sits inside a ' · '-joined meta line, so it carries no separator of its own. {d} is zero-padded. The English source string stays the filter's identity — see localDateLabel in JobPostingsPanel. No character differs between the two Chinese scripts. */
    dateLine: string;
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
    /** The PR top bar's date — short weekday, day, short month, NO year. Chinese leads with the month and puts the weekday last, so the ORDER lives in the template. Identical in both Chinese scripts: no character here differs, and the weekday itself (周三 / 週三) comes from daySun…daySat. */
    dateTopbar: string;
    /** A bare day + short month, e.g. "2 Aug" — the PV issue day in the notification sheet and on Payment. Named dateDayMonth, never dayMonth, which would read as a sibling of dayMon (Monday). Identical in both Chinese scripts. */
    dateDayMonth: string;
    /** Stands in for a shift's clock time in History when the wage was sealed at check-out but the week's voucher has not issued yet. PV = payment voucher, using the dictionary's existing 结算单 / 結算單 wording; "sealed" matches evidence.sourceSealed (封存). */
    sealedPendingPv: string;
  };
  receipt: {
    /** A pending day named inside the review caption. {dow} short weekday, {d} day-of-month — Chinese puts the number first, so the ORDER lives in the template. Identical in both Chinese scripts. */
    captionDay: string;
    /** One half of the settled list in the receipt-review caption; joined with ' · ' to the approved half. */
    captionVerified: string;
    captionApproved: string;
    /** {parts} is the already-joined verified/approved list. Chinese WRAPS the total around it instead of trailing it, so the whole clause is one key. Singular half — Chinese has no plural, so zh/zh-Hant match captionOfMany. */
    captionOfOne: string;
    captionOfMany: string;
    /** Tail of the review caption when no pending day could be named. */
    captionWaiting: string;
    /** Same sentence with the pending days named. Spelled out in full rather than splicing a parenthesised fragment on — the brackets are punctuation and Chinese uses its own. */
    captionWaitingOn: string;
    /** Dispute quick-reason CHIP. The preset VALUE stays English — it is posted verbatim as the dispute's `reason` and read by the agency's web portal. */
    presetWrongCommission: string;
    presetWrongQuantity: string;
    presetCountedTwice: string;
    /** PV = payment voucher, rendered with the dictionary's existing 结算单 / 結算單 wording. */
    presetMissingFromPv: string;
    presetWrongRate: string;
    /** zh and zh-Hant are identical on purpose — no character differs between the scripts. */
    presetNotMyShift: string;
    /** Identical in both scripts — no character differs. */
    presetOthers: string;
    /** Day Status pill. English is UPPERCASE because it is a pill, and it is a LABEL only — dayStatusLabel() still returns the English 'PENDING', which PaymentScreen compares to pick the pill's colour. */
    statusPending: string;
    /** Amber, deliberately sharing the waiting colour with PENDING. Identical in both scripts. */
    statusApproved: string;
    statusDisputed: string;
    statusVerified: string;
    /** Identical in both scripts — no character differs. */
    statusDeducted: string;
    /** Default title of ScannedReceiptsCard, on the Scan page and Check-In. */
    scannedThisShift: string;
    /** Photo-group heading covering line kinds 'tips' and 'others'. The kinds themselves stay English. */
    groupTipsService: string;
    /** Singular half — Chinese has no plural, so zh/zh-Hant match pictureMany. */
    pictureOne: string;
    pictureMany: string;
    /** Singular half — Chinese has no plural, so zh/zh-Hant match itemLoggedMany. */
    itemLoggedOne: string;
    itemLoggedMany: string;
  };
  evidence: {
    /** Payment-grid row label for the `wages` bucket. The bucket KEY stays the English 'wages'. */
    kindWages: string;
    /** Grid row label for the `others` bucket (overtime and anything else). */
    kindOthers: string;
    /** Grid row label for the `deductions` bucket. */
    kindDeductions: string;
    /** Receipt meta label for source === 'scan'. The stored value stays English. */
    sourceScanned: string;
    /** Receipt meta label for source === 'manual'. */
    sourceSelfLogged: string;
    /** Receipt meta label for source === 'checkin' — the wage seal written at check-out. */
    sourceSealed: string;
    /** Sheet title date, no year. {dow} short weekday, {d} day, {mon} short month — Chinese leads with the month, so the order lives here. */
    dayShort: string;
    /** The shift card's calendar date, with year. Same placeholders as dayShort plus {y}. */
    dayLong: string;
    /** Card title when a cell's lines carry no shift link. */
    notLinked: string;
    /** Body of that card when the week DID ship shifts — so the absence is real, not unknown. */
    noShiftNote: string;
    /** Body of that card when the week shipped no `shifts` array at all. */
    shiftTimesUnavailable: string;
    /** Card title when the shift carries neither an event name nor an outlet name. */
    shiftFallback: string;
    /** accessibilityLabel on a collapsed shift row. {title} is the shift's own name — never translated. */
    expandA11y: string;
    /** Hint under a COLLAPSED shift row. Its expanded twin is common.tapToCollapse. */
    tapForDetails: string;
    /** Stamp key on a CANCELLED shift; its value is the shift's scheduled slot. */
    shiftWas: string;
    /** Stamp key on a cancelled shift; its value is the cancellation timestamp. */
    youCancelled: string;
    /** Stamp key for how much notice the PR gave before cancelling. */
    noticeGiven: string;
    /** Stamp key for the cancellation-fee band that the notice selected. */
    feeBand: string;
    /** Fee band with no RM figure sealed yet. {pct} is a whole-number percent. */
    feePctOfShift: string;
    /** Fee band with the sealed money. Spelled out in full rather than appending the RM to feePctOfShift. */
    feePctWithRm: string;
    /** Stamp key for check_out_at. Deliberately NOT 'you tapped out at' — the stamp is clamped to the scheduled end. */
    shiftEnd: string;
    /** SHIFT END value while the PR has not checked out. */
    stillOnDuty: string;
    /** Duration stamp when overtime was recorded. {base} is the shiftDurationLabel output, {ot} = overtime minutes. */
    durationWithOtRecorded: string;
    /** SHIFT WAS value when the shift carries no slot. */
    timeNotSet: string;
    /** YOU CANCELLED value when no cancellation timestamp was sealed — never a guessed time. */
    notRecorded: string;
    /** Notice span with both parts. Spelled out separately because Chinese has no minutes fragment to append. */
    noticeSpanHoursMinutes: string;
    /** Notice span, whole hours. */
    noticeSpanHours: string;
    /** Notice span under one hour. */
    noticeSpanMinutes: string;
    /** Notice given ahead of the shift. {span} is one of the three noticeSpan* strings. */
    noticeBefore: string;
    /** Notice given AFTER the shift began — the costliest band, so it is spelled out rather than shown as a minus sign. */
    noticeAfter: string;
    /** Sub-title under the cell total, telling the PR what the sheet is for. */
    hint: string;
    /** Red warning when the evidence does not add up to the grid cell. {listed} and {grid} are already formatted as RM x.xx. */
    mismatch: string;
    /** Banner shown only while a whole-day claim is still OPEN. */
    openDisputeWholeDay: string;
    /** Empty state when the cell has no groups. */
    nothingLogged: string;
    /** Per-receipt tag: a claim on THIS shift is open. Uppercase in English to match the pill styling. */
    tagDisputed: string;
    /** Per-receipt tag: a claim on this shift was raised and answered. The only green one. */
    tagVerified: string;
    /** Per-receipt tag: approved and unargued — the quiet state. */
    tagSettled: string;
    /** Shown where the ORD number would be when the receipt carried none. */
    noOrderNo: string;
    /** Receipt meta segment when only a printed date is known. {date} is the receipt's own stored text. */
    printedOn: string;
    /** Receipt meta segment with both date and time, both the receipt's own stored text. */
    printedAt: string;
    /** Receipt meta segment while the receipt is still PENDING agency review. */
    waitingOnAgency: string;
    /** accessibilityLabel on a receipt-photo thumbnail. */
    openPhotoA11y: string;
    /** Per-group total under an expanded shift. {amount} is already formatted as RM x.xx. */
    shiftSubtotal: string;
    /** Footer action button; absent on This-week, where no voucher has been issued. */
    disputeAmount: string;
  };
  swaps: {
    /** Eyebrow above a pending swap card. Uppercase in English lives in the string (no textTransform); Chinese has no case. */
    header: string;
    /** Stand-in for the origin venue when the swap row carries no fromOutletName. Real outlet names are never translated. */
    fromFallback: string;
    /** Stand-in for the destination venue when the swap row carries no toOutletName. */
    toFallback: string;
    /** Caption under the move line — approving is the only action in the app that relocates a booked shift. */
    hint: string;
    /** Refuse-the-swap button. Imperative form of jobs.statusDeclined (已婉拒); no character differs between the two scripts. */
    decline: string;
    /** Accept-the-swap button; pairs with swaps.hint's 同意后. No character differs between the two scripts. */
    approve: string;
    /** Approve button while the answer is in flight. Same wording as forgot.sending. */
    sending: string;
    /** Fallback only — a real server refusal message is shown raw (backend English). */
    loadFailed: string;
    /** Fallback only for a non-Error throw while answering; a 409 from the server is shown raw. */
    respondFailed: string;
  };
  payHistory: {
    /** Section eyebrow above the payment-history list. */
    heading: string;
    filter: string;
    searchPlaceholder: string;
    /** Uppercase field label — `common.outlet` is the sentence-case form. */
    outletLabel: string;
    /** The 'all' option of the outlet filter. The stored filter value stays 'all'. */
    anyOutlet: string;
    fromTime: string;
    toTime: string;
    chipAll: string;
    /** Status chip for the `pending` filter — the only state the PR can act on. */
    chipToSign: string;
    /** Badge + chip label for `status === 'paid'`. The status value itself stays English. */
    statusPaid: string;
    statusSigned: string;
    statusPending: string;
    clearAllFilters: string;
    /** Stat-tile label — how many payroll weeks the filter matched. */
    weeks: string;
    totalNet: string;
    paidSummary: string;
    signedSummary: string;
    excelOpening: string;
    excelOpenFailed: string;
    excelDownloaded: string;
    excelDownloadFailed: string;
    pdfDownloading: string;
    voucherOpenFailed: string;
    pdfOpened: string;
    pdfOpenFailed: string;
    noPayments: string;
    noMatches: string;
    /** Empty-state button — jumps to the Payment tab. */
    openPayment: string;
    sheetTitle: string;
    statusLabel: string;
    /** RM is the currency code and stays as-is in every locale. */
    netPaidLabel: string;
    netPaidPlaceholder: string;
    applyFilters: string;
    clearAndClose: string;
    /** Singular half of the shift count — Chinese has no plural, so both keys share one wording. */
    cardMetaOne: string;
    cardMetaMany: string;
    signThisWeek: string;
    metricWages: string;
    metricCommission: string;
    metricEarlyWithdrawal: string;
    weekBreakdown: string;
    pvIssuedSunday: string;
    colDate: string;
    colType: string;
    colAmount: string;
    netPayable: string;
    bankRef: string;
    sign: string;
    openPv: string;
    /** Rebuilt at RENDER time from the stored English `statusMeta`; `{when}` is the untouched date/time tail. */
    metaPaidOn: string;
    /** Same render-side rebuild — the stored string keeps its English 'Signed <date> · <time>' form for the localStorage migration. */
    metaSignedOn: string;
    metaDisputed: string;
    metaAwaitingSignature: string;
    metaAwaitingIssue: string;
    /** Render-side label for the aggregate outlet; the stored value keeps its exact '(2)-outlet' shape. */
    multiOutlet: string;
    /** Render-side label for a stored `HistPayLine.type` — the stored value stays English. */
    lineWages: string;
    lineDrinks: string;
    lineTips: string;
    lineOthers: string;
    /** Stands in for a shift's clock time on a History card rebuilt from a PAID voucher. Sits in the same slot as schedule.sealedPendingPv and uses its 已封存 wording. zh and zh-Hant are identical on purpose — no character differs between the scripts. The `status` it is chosen by stays English. */
    shiftPaidSealed: string;
    /** Same slot as payHistory.shiftPaidSealed, for a voucher the PR has signed. PV = payment voucher, rendered with the dictionary's existing 结算单 / 結算單 wording. */
    shiftSealedSignedPv: string;
    /** Same slot again — the wage is sealed but the week's voucher is still unsigned. Spelled out in full rather than appending a negation to shiftSealedSignedPv. */
    shiftSealedPvUnsigned: string;
    /** A History card's TIME slot when the row was rebuilt from a voucher and has no clock reading of its own. Matches payHistory.weekBreakdown (周明细 / 週明細). */
    perPvWeekBreakdown: string;
  };
  pv: {
    /** Week-grid row label. The row's `key` ('wages') is a GridBucket and stays English. */
    rowWages: string;
    /** Week-grid row label for the 'others' bucket (overtime and the rest). */
    rowOthers: string;
    /** Week-grid row label. Deductions is a fifth ROW, not a fifth kind of income. No character differs between the scripts. */
    rowDeductions: string;
    /** The week-total column header in the grid. Kept very short — the column is 56px. */
    total: string;
    /** Uppercase card heading over the day-by-day money grid. */
    weekSummary: string;
    /** Day-status cell — the agency has signed this day off. Uppercase in English; same word as shiftStatus.verified, which is title case and belongs to a different surface. */
    dayVerified: string;
    /** Day-status cell — still waiting on the agency. */
    dayPending: string;
    /** Day-status cell — the PR has an open claim on one of the day's amounts. */
    dayDisputed: string;
    /** Day-status cell — a day holding nothing but a charged fine; settled, not waiting. No character differs between the scripts. */
    dayDeducted: string;
    /** The grid's total column on the Status row; {n} = number of verified days. */
    verifiedCount: string;
    /** Hint under the grid. `{red}` marks where the red-inked word goes — the screen splits on it rather than gluing three fragments, so each language keeps its own word order. */
    tapHint: string;
    /** The single word inked red inside pv.tapHint. */
    tapHintRed: string;
    /** Header pill and dispute-banner title when the server holds an open claim on this voucher. */
    disputeOpen: string;
    /** Body of that banner. 'Payment' here names the Payment tab (t.nav.payment). */
    disputeBannerBody: string;
    /** Header pill and banner title while the voucher is sent and unsigned. */
    pendingYourReview: string;
    /** Banner title when the agency has not issued the voucher yet. */
    waitingForAgency: string;
    /** Banner body while the voucher can be signed. */
    reviewThenSign: string;
    /** Banner body when the voucher is still pending_review at the agency — the server would refuse a signature. */
    notIssuedYet: string;
    /** Rendered statusLabel of a live unsigned voucher. The sibling `status: 'awaiting_pr'` is the compared value and stays English. */
    awaitingSignature: string;
    /** Rendered statusLabel written when the server accepts the signature. `status: 'signed'` beside it is what anything compares. */
    signed: string;
    /** Summary card caption above the voucher's net. */
    netPayable: string;
    /** Summary card caption above the payee line. */
    payee: string;
    /** The PR's role on the voucher — payee line and signature card. 'PR' itself stays English, as everywhere else in the dictionary. */
    prPersonnel: string;
    /** Uppercase heading over the linked drink/tip lines. Deliberately not 'receipts' — a self-log and a check-out seal reach this list too. */
    drinkTipRecords: string;
    /** Collapse action on that heading while the list is open. */
    hide: string;
    /** Expand action on that heading, and the per-row link into the receipt sheet. */
    details: string;
    /** Row headline for a line whose receipt was scanned. `PrReceiptSource` value 'scan' stays English. */
    sourceScan: string;
    /** Row headline for a line the PR logged themselves ('manual'). */
    sourceManual: string;
    /** Row headline for a line sealed by check-out ('checkin'). */
    sourceCheckin: string;
    /** A receipt line's date. {d} day, {mon} short month (t.schedule.monShort*), {y} year — Chinese writes the year first, so the order lives in the template. */
    lineDate: string;
    /** Title of the receipt-details bottom sheet. */
    receiptDetails: string;
    /** Uppercase field caption in that sheet. */
    detailDateTime: string;
    /** Uppercase field caption — the uppercase set it belongs to is why this is not t.common.outlet. */
    detailOutlet: string;
    /** Uppercase field caption above the receipt number and its origin. */
    detailReceipt: string;
    /** Uppercase field caption above the commission. No character differs between the scripts. */
    detailCommission: string;
    /** Green banner in the receipt sheet. PV = payment voucher, rendered with the dictionary's existing 结算单 wording. */
    matchedToThisPv: string;
    /** The same banner when the parent receipt is still awaiting agency review. */
    pendingAgencyVerify: string;
    /** Uppercase heading of the signature card. */
    yourSignature: string;
    /** Signature card while the pad is still to be used. NOT shiftStatus.pending — that one means 'waiting on the agency to review a receipt'. */
    signaturePending: string;
    /** Signature card once sealed and the account has a username; {name} is the account's own name and is never translated. */
    signedWithName: string;
    /** Same line with no name to show. Spelled out in full rather than splicing a fragment into the sentence above. */
    signedSealed: string;
    /** Signature card when the voucher is not the PR's move yet. */
    notSentYet: string;
    /** The primary button, and the signature sheet's title. */
    signVoucher: string;
    /** Green box on a paid voucher; {amount} arrives already formatted as RM x.xx. */
    paidInBank: string;
    /** Soft link back to the History tab after signing. */
    viewInHistory: string;
    /** Hint under the signature sheet's title. */
    signSheetHint: string;
    /** Field caption above the signed-in account's name. The name itself is the account's and is never translated. */
    signingAs: string;
    /** Stand-in shown where the username would be when the session carries none. */
    thisAccount: string;
    /** Field caption above the signature pad. */
    signatureField: string;
    /** Confirm button in the signature sheet. */
    confirmSignature: string;
    /** Alert title when Confirm is pressed with an empty pad. */
    drawSignatureTitle: string;
    /** Body of that alert. */
    drawSignatureBody: string;
    /** Alert title when this page holds no voucher id the server would accept. */
    noVoucherTitle: string;
    /** Body of that alert. 'Payment' names the Payment tab. */
    noVoucherBody: string;
    /** Alert title when the sign request fails. */
    notSignedTitle: string;
    /** Body of that alert. {reason} is the server's own refusal, shown raw (backend English), or pv.couldNotReachAgency. One template, because Chinese would not take the tail sentence in the same place. */
    notSignedBody: string;
    /** Fallback for {reason} above when the thrown value carries no message of its own. */
    couldNotReachAgency: string;
  };
  scan: {
    /** Page title when editId is set (either mode). */
    titleEdit: string;
    /** Page title for the tips self-log. Spelled out per category because English lowercased a label into the sentence and Chinese has no case. */
    titleSelfLogTips: string;
    titleSelfLogDrinks: string;
    titleScanTips: string;
    titleScanDrinks: string;
    /** Rendered noun only — the scan category value stays the English 'tips'. Singular form. */
    itemNounTip: string;
    /** Plural half — Chinese has no plural, so it matches itemNounTip on purpose. */
    itemNounTipPlural: string;
    /** Rendered noun only — the scan category value stays the English 'drinks'. No character differs between the scripts. */
    itemNounDrink: string;
    /** Plural half; Chinese has no plural so it matches itemNounDrink. */
    itemNounDrinkPlural: string;
    subEdit: string;
    subScanWindow: string;
    gateTitle: string;
    gateBody: string;
    goToCheckIn: string;
    /** {outlet} is the venue's own name — never translated. */
    activeShift: string;
    /** Label; the bold PV id follows it in its own <Text>. */
    belongsTo: string;
    receiptsLogged: string;
    timeIn: string;
    pointAndSnap: string;
    scanningOcr: string;
    ocrExtracted: string;
    /** {v} is the order number OCR read off the paper — data, shown raw. */
    ocrOrderNo: string;
    /** No character differs between the two scripts. */
    ocrDate: string;
    ocrTime: string;
    ocrOutlet: string;
    ocrDetectedAsRead: string;
    /** No character differs between the two scripts. */
    eachPrice: string;
    wasHappyHour: string;
    /** {noun} is already the singular/plural form picked by the item count. */
    detectedSummary: string;
    /** Both the review-phase hint and the matching thrown Error. */
    setQuantityAtLeastOne: string;
    saving: string;
    confirmAndLog: string;
    scanNow: string;
    manualPill: string;
    keyInAmount: string;
    ocrMatchesCatalog: string;
    /** {raw} is the literal text OCR read off the paper — never translated. */
    dateIgnored: string;
    /** Singular half of the OCR line count; Chinese has no plural so it matches ocrLinesMany. */
    ocrLinesOne: string;
    ocrLinesMany: string;
    /** {lines} is the already-formatted ocrLinesOne/Many string. */
    showOcrText: string;
    hideOcrText: string;
    ocrRawHint: string;
    notFoundOnScan: string;
    eachPriceNotRead: string;
    addItem: string;
    onlyAddWhatShows: string;
    /** {noun} is the plural form. */
    pointOcrLists: string;
    /** {noun} is the singular form. */
    scanAgainCatch: string;
    /** Self-log scanbox button; {noun} is the plural form. */
    scanItems: string;
    scanAgain: string;
    ocrDetectedAdjust: string;
    noQtyPrinted: string;
    selfLogSummary: string;
    /** Label; the bold RM figure follows it in its own <Text>. */
    commissionPreview: string;
    /** RM is a currency code — never translated. */
    tipAmountRm: string;
    drinkAmountRm: string;
    proofRetakeTitle: string;
    proofRequiredTitle: string;
    proofRetakeHint: string;
    proofRequiredHint: string;
    /** No character differs between the two scripts. */
    retakeAgain: string;
    /** No character differs between the two scripts. */
    retakePhoto: string;
    addAnotherPhoto: string;
    takeOrAttachPhoto: string;
    snapToEnableSubmit: string;
    noteOptional: string;
    noteRequired: string;
    notePlaceholder: string;
    updateSelfLog: string;
    /** Disabled-button label; {noun} is the plural form. */
    submitScanFirst: string;
    writeNoteToSubmit: string;
    submitSelfLogAmount: string;
    snapProofToSubmit: string;
    submitSelfLog: string;
    receiptLogged: string;
    addedToStatus: string;
    /** Label; the bold PV id follows it in its own <Text>. */
    belongsToPv: string;
    /** {no} is the database-generated RCP-… number. */
    receiptRef: string;
    /** {no} is the order number OCR read off the paper. */
    orderRef: string;
    scanAnother: string;
    backToCheckIn: string;
    /** First half of the footer tip; the bold middle is the Check-In button's name (scan.scanAgain). */
    wrongScanPrefix: string;
    wrongScanSuffix: string;
    /** No character differs between the two scripts. */
    backToAttendance: string;
    ocrUnavailable: string;
    /** Appended after scan.couldNotReadFields with a joining space. */
    dateDroppedNote: string;
    /** {wanted} is a comma-joined list of the outlet's own item names — data, never translated. */
    noneMatchedWithList: string;
    /** Used when the outlet has no catalogue to list. */
    noneMatched: string;
    /** Fragment joined by scan.andJoin into scan.couldNotReadFields — a rendered field NAME, not the OCR matcher keyword (those live in lib/receipt-parser.ts and stay English). */
    fieldOrderNo: string;
    /** No character differs between the two scripts. */
    fieldDate: string;
    fieldTime: string;
    /** Joiner between the missing-field names above. English keeps its surrounding spaces; Chinese uses the enumeration comma. No character differs between the two scripts. */
    andJoin: string;
    couldNotReadFields: string;
    /** Fallback only — a real server refusal message is shown raw (backend English). */
    couldNotSave: string;
    /** Thrown Error, rendered in the submit-error line; {noun} is the singular form. */
    setQuantityFirst: string;
    snapProofFirst: string;
    setQuantityAtLeastOneNoun: string;
    setAmountFirst: string;
  };
  errors: {
    /** fetch rejected before any status existed — `{base}` is the API base URL, never baked into the sentence. */
    backendUnreachable: string;
    /** Fallback when the envelope carried no message of its own — `{status}` is the HTTP code. */
    requestFailed: string;
    /** Same, for the multipart photo/comcard/ID endpoints — `{status}` is the HTTP code. */
    uploadFailed: string;
    /** Voucher PDF blob download refused — `{status}` is the HTTP code. */
    pdfExportFailed: string;
    /** Voucher Excel blob download refused — `{status}` is the HTTP code. */
    excelExportFailed: string;
    /** Multer's 5 MB cap aborts the upload mid-body; say it is the file, not the Wi-Fi. */
    photoTooLarge: string;
    /** Multipart upload died in transit — `{base}` is the API base, `{detail}` the underlying platform error. */
    uploadUnreachable: string;
    /** Lowercase on purpose: it is substituted INTO `uploadUnreachable`'s `{detail}` when the thrown cause carried no message of its own. */
    networkError: string;
    /** Thrown by lib/session.tsx when a profile/upload action runs with no token — Profile renders it. */
    notSignedIn: string;
    /*
     * The server's own sentences for the verification-code flows (forgot
     * password, change phone / email, change password). The backend speaks
     * English only; `localizeApiError` matches each one and renders these.
     */
    /** 400 — a wrong code. Never 401. */
    invalidCode: string;
    /** 400 — forgot-password code is expired or already used. */
    codeExpired: string;
    /** 409 — the confirm raced a second tap / another device. */
    codeAlreadyUsed: string;
    /** 503 — no channel delivered in production. */
    codeSendFailed: string;
    /** 429 resend cooldown — `{s}` = seconds left. */
    codeCooldown: string;
    sameEmail: string;
    samePhone: string;
    emailTaken: string;
    phoneTaken: string;
    /** 422 — nowhere to send the identity code. */
    noContactChannel: string;
    /**
     * 422 — the PASSWORD change has nowhere to send its code. A separate
     * sentence from `noContactChannel` on purpose: the person is signed in, so
     * it says what to do about it rather than only what is missing.
     */
    addContactBeforePasswordChange: string;
    currentPasswordIncorrect: string;
    passwordMustDiffer: string;
    /** PATCH /user/:id refusing an email change outside Security settings. */
    changeEmailInSecurity: string;
    changePhoneInSecurity: string;
    /** 400 — contact-change/start on an account that has no password to prove with. */
    setPasswordFirst: string;
    /** 403 from the legacy /auth/password/reset-otp for a non-PR account. */
    useForgotPassword: string;
    /** Any rate-limiter refusal ("Too many … try again later."). */
    tooManyRequests: string;
    /**
     * 429 — the SIGN-IN lockout, which every door that takes the current
     * password honours too (change phone / email, change password), so the
     * settings sheets can receive it and not only the login screen. `{m}` is
     * read out of the server's sentence, never assumed.
     *
     * ⚠️ Deliberately the same wording as `login.tooManyAttempts`, not a
     * reference to it: `localizeApiError` is handed only `errors`, and the two
     * screens are free to word it differently later.
     */
    lockedOut: string;
    /** 429 — the CODE took too many wrong guesses and was expired: a new code is needed (a limiter's 429 only asks to wait). */
    tooManyCodeAttempts: string;
    /** 400 — the server's own validation sentences on the code endpoints. */
    invalidPhoneNumber: string;
    enterSixDigitCode: string;
    invalidEmailAddress: string;
    currentPasswordRequired: string;
    /** 400 — forgot/start with neither (or both) of email / phone. */
    enterEmailOrPhone: string;
    /** 400 — contact-change/start with an empty value. */
    enterNewContact: string;
    /** 500 — contact-change/start could not write its code row. */
    couldNotStartChange: string;
    /** 500 — contact-change could not write the SECOND code row. Distinct from codeSendFailed (the 503 "— try again later"). */
    couldNotSendCode: string;
    /** 400 — password change on an account with no password of its own. */
    cannotChangePasswordHere: string;
    /** 400 — the zod fallback when a refusal carried no issue message. */
    validationFailed: string;
    /** 500 — every handler's catch-all (`ApiError.INTERNAL_SERVER_ERROR`). */
    internalServerError: string;
    /**
     * `ApiError.UNAUTHORIZED` — 401 for a refused session, 403 from a self-only
     * /user/:id handler whose token is another account's. English stays the
     * server's own word; Chinese says what fixes it (sign in again). Security
     * settings signs the PR out on the 401 instead of printing this.
     */
    unauthorized: string;
    /** 400 — the server's password lower bound; `{n}` is read out of the sentence, never assumed. */
    passwordMinLength: string;
    /** 400 — the server's password upper bound (bcrypt's 72); `{n}` read out of the sentence. */
    passwordMaxLength: string;
  };
  notif: {
    /** Bell-sheet title for a `shift_assigned` row. The row's own English title stays on the wire and in the database — this is only the rendered label. zh and zh-Hant are identical: no character differs between the scripts. */
    shiftAssignedTitle: string;
    /** {date} is the shift day from the payload, already formatted through the active locale. Identical in both Chinese scripts. */
    shiftAssignedBody: string;
    /** Every `shift_cancelled` row whose payload carries no `withdrawn` flag — the agency cancelling the assignment AND the agency unassigning the PR, which are identical on the wire. True of both: the booking is off. Identical in both Chinese scripts. */
    shiftCancelledTitle: string;
    /** {date} is locale-formatted. The producer puts the day in the BODY rather than the payload, so it is read back off a body that is a bare date and nothing else. */
    shiftCancelledBody: string;
    /** `shift_cancelled` with `withdrawn: true` — the venue pulled the whole shift, not just this PR's seat. */
    shiftWithdrawnTitle: string;
    /** {venue} is the outlet's own name — never translated. {date} is locale-formatted. */
    shiftWithdrawnBody: string;
    /** Spelled out in full rather than substituting a fallback noun into the line above — some withdrawal payloads carry no outlet name, and a translated noun dropped into an English-shaped slot reads wrong in Chinese. */
    shiftWithdrawnBodyNoVenue: string;
    /** `leave_decided` with decision 'approved'. MC is a Malaysian medical certificate — same wording as t.checkin.mcLeave. */
    leaveApprovedTitle: string;
    leaveApprovedBody: string;
    /** `leave_decided` with decision 'rejected' — of the two outcomes this is the one the PR MUST act on: the shift is still theirs. */
    leaveRejectedTitle: string;
    leaveRejectedBody: string;
    /** Identical in both Chinese scripts — no character differs. */
    overtimeApprovedTitle: string;
    /** {minutes} = overtime minutes, {date} locale-formatted, {amount} already formatted as RM x.xx by formatRM. */
    overtimeApprovedBody: string;
    overtimeRejectedTitle: string;
    /** Carries no money figure on purpose — unapproved overtime is not money. */
    overtimeRejectedBody: string;
    /** `payment_voucher_dispute_resolved` with outcome 'accepted'. */
    disputeAcceptedTitle: string;
    disputeRejectedTitle: string;
    /** {component} is the disputed bucket's LABEL — the stored value ('wages'/'drinks'/'tips'/'others') stays English and is resolved through the existing t.evidence.kindWages / t.shiftStatus.drinks / t.shiftStatus.tips / t.evidence.kindOthers. {date} is locale-formatted. Identical in both Chinese scripts. */
    disputeBody: string;
    /** Same as disputeBody plus the agency's resolution note. {note} is the agency's own words and is carried across VERBATIM, never translated. Identical in both Chinese scripts. */
    disputeBodyWithNote: string;
    /** The REAL `payment_voucher_issued` row. Distinct from topbar.pvReadyTitle, which titles the awaiting-PV stand-in and takes different parts. */
    pvIssuedTitle: string;
    /** {start} and {end} are the Sun–Sat week bounds, both locale-formatted. */
    pvIssuedBody: string;
    /** `shift_released_early` — an approved cut-loss sent the PR home and sealed their wages for the hours worked. TITLE ONLY: the stored body names the venue and the day and the payload carries neither, so the body stays as stored. Identical in both Chinese scripts. */
    releasedEarlyTitle: string;
    /** An `agency_broadcast` row carrying a `swapId` — the outlet-swap request, which reuses that kind rather than migrating the PG enum. TITLE ONLY: the body names the current and proposed slots, neither of which is in the payload. */
    swapRequestTitle: string;
    /** `agency_join_resolved` with `status: 'active'` — the pr.controller path, the only accepted-join row the payload separates from a refused departure. */
    joinAcceptedTitle: string;
    joinAcceptedBody: string;
    /** The BODY is deliberately left as stored — it is the agency's own reject reason, free text nobody may reword. */
    joinDeclinedTitle: string;
    /** `agency_join_resolved` with `approveStatus: 'left'` — the departure branch reuses the join kind, and 'left' is the one value only it writes. */
    departureApprovedTitle: string;
    departureApprovedBody: string;
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
      discardTitle: 'Leave without finishing?',
      discardBody: 'What you entered will be lost, and you will need a new code to start again.',
      keepGoing: 'Keep going',
      leave: 'Leave',
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
      logoAlt: 'InnocenZ logo',
    },
    forgot: {
      title: 'Reset password',
      phoneHint:
        'Enter your account’s mobile number. We’ll send a code by WhatsApp, SMS and email to the contacts on the account.',
      byPhone: 'Phone',
      byEmail: 'Email',
      emailHint:
        'Enter your account’s email address. We’ll send a code by WhatsApp, SMS and email to the contacts on the account.',
      emailLabel: 'Email',
      sendCode: 'Send code',
      sending: 'Sending…',
      otpTitle: 'Enter code',
      otpHint: 'Enter the 6-digit code. It is valid for {m} minutes.',
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
      codeSentInfo: 'If that account exists, we sent a code by WhatsApp, SMS and email.',
      passwordHint: 'Choose a new password for your account — at least 6 characters.',
      resetFailed: 'Could not reset password',
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
      bankDetails: 'Bank details',
      bankName: 'Bank',
      bankNamePlaceholder: 'e.g. Maybank',
      bankAccountNo: 'Account number',
      bankAccountPlaceholder: 'e.g. 512345678901',
      bankSearchPlaceholder: 'Search your bank',
      bankHint:
        'Your agency transfers your weekly voucher to this account. Clear both boxes to remove them.',
      noBankDetails: 'Not set — your agency cannot transfer your pay without this.',
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
      accountEyebrow: 'ACCOUNT',
      editingBadge: 'Editing',
      comcardIcBadge: 'Photo Comcard · IC',
      floorNickname: 'Floor nickname',
      legalIcName: 'Legal IC name',
      agencies: 'Agencies',
      selectAgencies: 'Select agencies…',
      agencyTied: 'Agency-Tied · {names}',
      awaitingApproval: 'Awaiting approval · {names}',
      departureWaiting: 'Departure waiting for {names} to approve',
      icNumber: 'IC {ic}',
      agencyLockedJoin: 'Waiting for {names} to approve — you cannot change agencies until they approve or reject.',
      agencyLockedLeave: 'Departure waiting for {names} to approve — you cannot change agencies until it is decided.',
      agencyDeparturePending: '{name} · departure pending',
      leaveConfirm: 'Leave {name}? Pay and shifts must be settled, and they must approve.',
      requestToLeave: 'Request to leave',
      keep: 'Keep',
      departureRequested: 'Departure requested — waiting for {name} to approve',
      departureFailed: 'Could not request the departure',
      nicknameLength: 'Floor nickname must be 2–20 characters',
      icNameRequired: 'Enter your legal IC name',
      languageRequired: 'Select at least one language',
      emailInvalid: 'Enter a valid email address',
      emailChangeHint: 'Change in Security settings',
      leaveEditTitle: 'Leave without saving?',
      leaveEditBody: 'Your unsaved profile changes will be lost.',
      keepEditing: 'Keep editing',
      profileSaved: 'Profile saved',
      saveFailed: 'Could not save profile',
      comcardUpdated: 'Comcard updated',
      galleryUnavailable: 'Could not open the gallery — rebuild the dev app (expo run:android).',
      imageTooLarge: 'Image must be under 5 MB',
      avatarUpdated: 'Profile photo updated',
      avatarUploadFailed: 'Could not upload photo',
      portfolioUploadFailed: 'Could not upload portfolio photo',
      someImagesSkipped: 'Some images were over 5 MB and were skipped',
      removePhotoTitle: 'Remove photo?',
      removePhotoBody: 'Remove portfolio photo {label}? This deletes it from your profile.',
      portfolioRemoveFailed: 'Could not remove portfolio photo',
      savingArrangement: 'Saving arrangement…',
      rearrangeFailed: 'Could not rearrange portfolio',
      portfolioRearranged: 'Portfolio rearranged',
      portfolio: 'Portfolio',
      portfolioDragHint: 'Hold to drag · drop to swap',
      portfolioShowcase: 'Showcase photos',
      portfolioCount: '{n} of {total} photos',
      noLanguages: 'No languages yet — tap Edit profile to add them.',
      tier1: 'TIER I',
      tier2: 'TIER II',
      tier3: 'TIER III',
      tier4: 'TIER IV',
      tier5: 'TIER V',
      tierServant: 'SERVANT',
      tierCommissionOnly: 'COMMISSION ONLY',
      slotTapToSwap: 'Tap another slot to swap · tap again to cancel',
      slotDragHint: 'Hold to drag · drag to top/bottom edge to scroll · drop to swap',
      viewerReturn: 'Return',
      viewerHint: 'Pinch or double-tap to zoom · drag to move · close with ✕ Return',
      signHere: 'Sign here with your finger',
      clearSignature: 'Clear',
      comcardAge: 'Age {n}',
      ageSuffix: 'y',
    },
    security: {
      title: 'Security',
      changePassword: 'Change password',
      changePhone: 'Change phone',
      changeEmail: 'Change email',
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
      passwordMax: 'Password must be at most 72 characters',
      passwordMismatch: 'Passwords do not match',
      phoneUpdated: 'Phone updated',
      emailUpdated: 'Email updated',
      sendOtp: 'Send code',
      verifyOtp: 'Verify code',
      eyebrow: 'ACCOUNT',
      intro:
        'Every change here needs your current password and a code. The same code goes to your WhatsApp, your SMS and your email — whichever you can read.',
      currentPhone: 'Current: {phone}',
      currentEmail: 'Email: {email}',
      changePasswordHint:
        'Enter your current password and the new one. We then send one code to the phone and email on your account, and the new password is saved once you enter it.',
      passwordCodeTitle: 'Confirm your new password',
      changePhoneHint:
        'Enter the new number and your current password. We send one code to the new number and to the email on your account — nothing goes to your old number.',
      changeEmailHint:
        'Enter the new email and your current password. We send one code to the new address and to the phone on your account — nothing goes to your old address.',
      newMobileNumber: 'New mobile number',
      newEmail: 'New email',
      newPhoneCodeTitle: 'Verify your new number',
      newEmailCodeTitle: 'Verify your new email',
      codeValidFor: 'The code is valid for {m} minutes.',
      pendingInvites:
        '{n} pending invitation(s) were sent to your current email. You can’t accept them after the change — accept them first, or ask for a new invite to the new email.',
      startAgain: 'Start again',
      otpLabel: 'Code',
      verifyAndSave: 'Verify & save',
      channelWhatsapp: 'WhatsApp',
      channelSms: 'SMS',
      channelEmail: 'email',
      channelJoin: ' and ',
      sentVia: 'by {channels} to {to}',
      sentPartJoin: ' and ',
      sentSummary: 'Code sent {parts}',
      sentLoggedOnly: 'Test mode: the code was written to the server log, not delivered.',
      sentNowhere: 'The code could not be delivered. Try Resend in a moment.',
      updatePasswordFailed: 'Could not update password',
      sendCodeFailed: 'Could not send code',
      updatePhoneFailed: 'Could not update phone',
      updateEmailFailed: 'Could not update email',
      deleteAccountFailed: 'Could not delete account',
      signInAgainBody: 'For your security, please sign in again.',
      signInAgain: 'Sign in again',
      sessionEnded: 'Your sign-in has expired, so nothing was changed.',
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
      agency: 'Agency',
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
      booked: 'Booked',
      noShift: 'No shift',
      attendanceFailed: 'Attendance failed',
      viewingEarlier: 'Viewing an earlier shift · tap to go to your current shift',
      loadingShift: 'Loading your shift…',
      idleEmpty: 'Your agency will assign your shift — check in when assigned.',
      eventFallback: 'Shift',
      dayAndDate: 'Day & date',
      locating: 'Locating…',
      metresFrom: '{m} m from {name}',
      metresAway: '{m} m away — move closer',
      gpsNote: 'Check-in is only allowed within {m}m of {name}. Your phone shares its location for this stamp only.',
      gpsNoteBypass: 'Check-in is only allowed within {m}m of {name} — GPS temporarily bypassed for demo.',
      duration: 'Duration {d}',
      otEstimate: 'Overtime {h}h (about {amount}) — our estimate from your stamps · not sent to the agency, not in your payout. Raise it with them if it should be paid.',
      cancelWarning: 'Agency-assigned shift — cancellation may affect wages.',
      reasonPlaceholder: 'Why are you cancelling?',
      locationExplainer: 'InnocenZ uses your location for one thing only — proving you are at the venue when you check in.',
      locCheckRadius: 'Check-in unlocks within 50 m of the venue',
      locCheckStamp: 'One location stamp per check-in and check-out',
      locCheckNoTracking: 'No background tracking — ever',
      holding: 'Holding {p}%',
      missingPhotoOne: '{n} logged action has no picture — tap the red camera on that row to scan again, or remove the row, before you can check out.',
      missingPhotoMany: '{n} logged actions have no picture — tap the red camera on that row to scan again, or remove the row, before you can check out.',
      nothingLogged: 'Nothing logged yet. Scan a receipt or self-log at least one drink or tip — with its picture — before you check out. Once the shift closes, that commission cannot be claimed.',
      emptyShiftTitle: 'Check out with nothing logged?',
      emptyShiftWarning:
        'You have not logged a single drink or tip for this shift. Checking out closes it, and commission for tonight cannot be added afterwards. Only do this if there really was nothing to log.',
      emptyShiftConfirm: 'Yes, check out anyway',
      locPermissionOff: 'Location permission is off — allow it to check in.',
      gpsReadFailed: 'Could not read GPS — check location permission and try again.',
      locationDenied: 'InnocenZ needs location access to check you in at the venue. Turn it on in Settings > InnocenZ > Location, then try again.',
      locationDisabled: 'Location services are off on this phone. Turn on GPS / Location, then try again.',
      locationTimeout: 'Could not get a GPS fix. Step outside or near a window and try again.',
      locationUnknown: 'Could not read your location.',
    },
    payment: {
      title: 'Payment',
      history: 'Payment history',
      bankNudgeTitle: 'Add your bank details',
      bankNudgeBody:
        'Your agency has nowhere to send this money. Add your bank and account number so your voucher can be transferred.',
      bankNudgeAction: 'Add them now',
      lastWeek: 'Last week',
      thisWeek: 'This week',
      lastWeekTitle: 'LAST WEEK',
      thisWeekTitle: 'THIS WEEK',
      lastWeekRange: 'Last week {range}',
      verifiedDays: 'Verified days {n}/7',
      approvedDays: 'Approved days',
      agencyFallback: 'Agency',
      gridTotal: 'TOTAL',
      gridTotalSub: 'week',
      rowWages: 'Daily wages',
      rowDrinks: 'Drinks',
      rowTips: 'Tips',
      rowOthers: 'Others',
      rowDeductions: 'Deductions',
      nVerified: '{n} verified',
      nPending: '{n} pending',
      statusPending: 'PENDING',
      statusApproved: 'APPROVED',
      statusDisputed: 'DISPUTED',
      statusVerified: 'VERIFIED',
      statusDeducted: 'DEDUCTED',
      statusPaid: 'PAID',
      statusSigned: 'SIGNED',
      statusSent: 'SENT',
      disputeOpen: 'Dispute open · agency reviewing',
      disputeOpenNamed: '{agency} · dispute open · agency reviewing',
      disputeBannerHint: 'Tap any amount to see its receipts, then withdraw this dispute.',
      tapHint: 'Tap any amount to see the order number, shift and items behind it — dispute it from there · tap a {red} amount to withdraw a mistaken dispute.',
      redWord: 'red',
      pvIssuedSunday: 'PV issued every Sunday · Total',
      pvOnDay: 'PV on {day}',
      totalLower: 'total',
      couldNotLoadLastWeek:
        'Could not load last week — check your connection and pull to refresh.',
      noLastWeekPv: 'No PV for last week yet — this week’s PV is issued next Sunday.',
      checkOutToSeal: 'Check out from Attendance to seal today’s wages and commissions here for this week’s PV.',
      reviewSign: 'Review & sign · {amount}',
      reviewSignNamed: 'Review & sign · {agency} · {amount}',
      whatYouDisputed: 'What you disputed',
      receiptsThisDay: 'Receipts this day',
      nTotal: '{n} total',
      receiptCounts: '{v} verified · {a} approved · {p} pending',
      claimOpen: 'OPEN',
      claimAccepted: 'ACCEPTED',
      claimRejected: 'REJECTED',
      claimWithdrawn: 'WITHDRAWN',
      voucherSaid: 'Voucher said {amount}',
      raisedAt: 'Raised {when}',
      filedWholeDay: 'Filed against the whole day — it covered both shifts below.',
      shiftFallback: 'Shift',
      shiftTimeUnknown: 'shift time unknown',
      inOutWindow: 'In {inAt} · Out {outAt} · {window}',
      noOrderNo: 'No order no',
      wholeReceipt: 'The whole receipt',
      noReceiptBehind: 'No receipt behind this — it is calculated from your check-in and check-out times.',
      agencyAnswer: 'Agency: {note}',
      cancelThisDispute: 'Cancel this dispute',
      cancelling: 'Cancelling…',
      durationUnknown: 'duration unknown',
      hours: '{h}h',
      hoursMinutes: '{h}h {m}m',
      minutes: '{m}m',
      withOvertime: '{base} · +{m}m OT',
      otOnDay: '{mins} on {day}',
      otPending: '{parts} — overtime recorded at check-out, waiting on your agency. It is not in the figures above.',
      withdrawDisputeTitle: 'Withdraw dispute?',
      disputeThisAmount: 'Dispute this amount',
      whichOneWrong: 'Which one is wrong?',
      alreadyDisputed: 'already disputed',
      notReviewedYetShort: 'not reviewed yet',
      selected: 'selected',
      pickShift: 'Pick the shift you are disputing.',
      disputingOf: 'Disputing {picked} of this day’s {day}.',
      whichItem: 'Which item?',
      pickOneItem: 'Pick at least one item.',
      quickReason: 'Reason',
      noteFollowsItems:
        'Written from the items you ticked. Edit it — your agency reads exactly this.',
      reasonWrongCommission: 'Wrong commission',
      reasonWrongQuantity: 'Wrong quantity',
      reasonCountedTwice: 'Counted twice',
      reasonMissingFromPv: 'Missing from my PV',
      reasonWrongRate: 'Wrong rate',
      reasonNotMyShift: 'Not my shift',
      reasonOthers: 'Others',
      notePlaceholder: 'Add detail for your agency…',
      attachImages: 'Attach files (images)',
      optional: 'optional',
      imagesAttachedOne: '{n} image attached as proof',
      imagesAttachedMany: '{n} images attached as proof',
      proofOptional: 'Proof images are optional — attach a receipt photo if you have one.',
      submitting: 'Submitting…',
      submitDispute: 'Submit dispute',
      withdrawSub: 'Flagged this amount by mistake? Withdraw and it returns to verified.',
      proofCleared: '{n} proof image(s) will be cleared.',
      withdrawing: 'Withdrawing…',
      withdrawDispute: 'Withdraw dispute',
      notDisputedHereTitle: 'Not disputed here',
      notDisputedHereBody: '{row} is calculated from your check-in and check-out times, not from a receipt. If it looks wrong, ask your agency to correct the shift record for {day}.',
      notReviewedTitle: 'Not reviewed yet',
      notReviewedBody: 'Your agency is still checking the receipt behind {row} on {day}. Once they approve it you can dispute the amount here.',
      openDayFirstTitle: 'Open the day first',
      openDayFirstBody: 'That day has money from more than one agency, so this claim cannot be matched to a voucher from here. Open the day, pick the shift, and withdraw it there.',
      couldNotCancel: 'Could not cancel',
      tryAgain: 'Please try again.',
      cancelConfirmTitle: 'Cancel this dispute?',
      cancelConfirmBody: 'Your agency will stop reviewing it. You can raise it again later if you still disagree.',
      keepIt: 'Keep it',
      cancelDispute: 'Cancel dispute',
      pickShiftFirstTitle: 'Pick the shift first',
      pickShiftFirstBody: 'That day has money from more than one agency. Open the day, choose the shift you want to dispute, then try again.',
      noVoucherTitle: 'No voucher to dispute yet',
      noVoucherLast: 'Last week’s payment voucher hasn’t been issued yet — there’s nothing to dispute.',
      noVoucherThis: 'This week’s voucher hasn’t been opened yet — log a shift first, then you can dispute an amount on it.',
      disputeFailed: 'Dispute failed',
      nVouchersThisWeek: '{n} PAYMENT VOUCHERS THIS WEEK',
      multiAgencyHint: 'You worked for more than one agency. Each pays and is signed separately.',
      notYetNumbered: 'Not yet numbered',
      penaltiesThisWeek: 'PENALTIES THIS WEEK',
      cancelledShift: 'Cancelled shift',
      pctOfDailyWage: '{pct}% of daily wage',
      ruleMinShifts: 'Min shifts per week',
      ruleMaxMc: 'Max MC per month',
      ruleLate: 'Late per week',
      ruleCancellation: 'Cancellation',
      dayAndDate: '{dow} {d}',
      stampShort: '{d} {mon}, {time}',
    },
    history: {
      title: 'History',
      shifts: 'Shifts',
      payments: 'Payments',
      earnedInRange: 'EARNED IN RANGE',
      wagesTotal: 'WAGES',
      shiftHistory: 'SHIFT HISTORY',
      searchPlaceholder: 'Search wages, sales, others, drinks…',
      filterOutlet: 'OUTLET',
      filterStatus: 'STATUS',
      filterDate: 'DATE',
      anyOutlet: 'Any outlet',
      anyStatus: 'Any status',
      anyDate: 'Any date',
      statusCurrent: 'Current',
      statusSigned: 'Signed',
      shiftCountOne: '{n} shift',
      shiftCountMany: '{n} shifts',
      weekEarnLine: '{earned} earned · {wages} wages',
      noShiftsInWeek: 'No shifts in this week',
      noShiftsMatch: 'No shifts match these filters',
      resetFilters: 'Reset filters',
      totalPayout: '{amount} total payout',
      cancelledNoPayout: 'Shift cancelled — no payout',
      metricWages: 'Wages',
      metricOthers: 'Others',
      pickDateFirst: 'Pick date first',
      tapToChoose: 'Tap to choose',
      fromTime: 'FROM TIME',
      toTime: 'TO TIME',
      done: 'Done',
      calLegendWorked: 'Worked · has record',
      calLegendNote: 'Any date up to today · empty days show no rows.',
      weekTitleCurrent: 'CURRENT WEEK · {range}',
      tabCurrentWeek: 'Current week',
      tabPayrollWeeks: 'Payroll weeks',
      noPayrollWeeksYet: 'No payroll weeks yet — your first PV appears here once your agency issues it.',
      weekTitlePayroll: 'PAYROLL WEEK · {range}',
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
      stampAm: '{d} {mon} {y}, {time} am',
      stampPm: '{d} {mon} {y}, {time} pm',
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
      dateLine: '{dow} {d} {mon} {y}',
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
      dateTopbar: '{dow} {d} {mon}',
      dateDayMonth: '{d} {mon}',
      sealedPendingPv: 'Sealed · pending PV',
    },
    receipt: {
      captionDay: '{dow} {d}',
      captionVerified: '{n} verified',
      captionApproved: '{n} approved',
      captionOfOne: '{parts} of {total} entry',
      captionOfMany: '{parts} of {total} entries',
      captionWaiting: '{n} waiting on your agency',
      captionWaitingOn: '{n} waiting on your agency ({days})',
      presetWrongCommission: 'Wrong commission',
      presetWrongQuantity: 'Wrong quantity',
      presetCountedTwice: 'Counted twice',
      presetMissingFromPv: 'Missing from my PV',
      presetWrongRate: 'Wrong rate',
      presetNotMyShift: 'Not my shift',
      presetOthers: 'Others',
      statusPending: 'PENDING',
      statusApproved: 'APPROVED',
      statusDisputed: 'DISPUTED',
      statusVerified: 'VERIFIED',
      statusDeducted: 'DEDUCTED',
      scannedThisShift: 'Scanned receipts · this shift',
      groupTipsService: 'Tips / Service',
      pictureOne: '{n} picture',
      pictureMany: '{n} pictures',
      itemLoggedOne: '{n} item logged',
      itemLoggedMany: '{n} items logged',
    },
    evidence: {
      kindWages: 'Daily wages',
      kindOthers: 'OT / Other',
      kindDeductions: 'Deductions',
      sourceScanned: 'Scanned',
      sourceSelfLogged: 'Self-logged',
      sourceSealed: 'Sealed at check-out',
      dayShort: '{dow} {d} {mon}',
      dayLong: '{dow} {d} {mon} {y}',
      notLinked: 'Not linked to a shift',
      noShiftNote: 'This was logged without an open shift, so there is no check-in to show. The receipt below is still the proof.',
      shiftTimesUnavailable: 'Shift times are unavailable right now. The receipt below is still the proof.',
      shiftFallback: 'Shift',
      expandA11y: '{title} — tap to see check-in, receipts and items',
      tapForDetails: 'Tap to see details',
      shiftWas: 'SHIFT WAS',
      youCancelled: 'YOU CANCELLED',
      noticeGiven: 'NOTICE GIVEN',
      feeBand: 'FEE BAND',
      feePctOfShift: '{pct}% of this shift',
      feePctWithRm: '{pct}% of this shift · RM {rm}',
      shiftEnd: 'SHIFT END',
      stillOnDuty: 'Still on duty',
      durationWithOtRecorded: '{base} · +{ot}m OT recorded',
      timeNotSet: 'Time not set',
      notRecorded: 'Not recorded',
      noticeSpanHoursMinutes: '{h} h {m} m',
      noticeSpanHours: '{h} h',
      noticeSpanMinutes: '{m} m',
      noticeBefore: '{span} before it started',
      noticeAfter: '{span} AFTER it started',
      hint: 'Everything that added up to this figure. Check the order number against your paper receipt.',
      mismatch: 'This list adds up to {listed} but the grid shows {grid}. Report this — do not sign it off.',
      openDisputeWholeDay: 'You have an open dispute covering this WHOLE day — every shift below is part of it.',
      nothingLogged: 'Nothing was logged for this day.',
      tagDisputed: 'DISPUTED',
      tagVerified: 'VERIFIED',
      tagSettled: 'SETTLED',
      noOrderNo: 'No order number',
      printedOn: 'printed {date}',
      printedAt: 'printed {date} {time}',
      waitingOnAgency: 'waiting on your agency',
      openPhotoA11y: 'Open the receipt photo full size',
      shiftSubtotal: 'Shift subtotal · {amount}',
      disputeAmount: 'Dispute this amount',
    },
    swaps: {
      header: 'OUTLET SWAP REQUEST',
      fromFallback: 'Your outlet',
      toFallback: 'New outlet',
      hint: 'Your shift moves to this outlet only if you approve.',
      decline: 'Decline',
      approve: 'Approve',
      sending: 'Sending…',
      loadFailed: 'Could not load your swap requests',
      respondFailed: 'Could not send your answer',
    },
    payHistory: {
      heading: 'PAYMENT HISTORY',
      filter: 'Filter',
      searchPlaceholder: 'Search PV ID, outlet, week, bank ref…',
      outletLabel: 'OUTLET',
      anyOutlet: 'Any outlet',
      fromTime: 'FROM TIME',
      toTime: 'TO TIME',
      chipAll: 'All',
      chipToSign: 'To sign',
      statusPaid: 'Paid',
      statusSigned: 'Signed',
      statusPending: 'Pending',
      clearAllFilters: 'Clear all filters',
      weeks: 'Weeks',
      totalNet: 'Total net',
      paidSummary: '{n} paid · {amount}',
      signedSummary: '{n} signed · {amount}',
      excelOpening: 'Excel opening in your browser — check Downloads',
      excelOpenFailed: 'Could not open the Excel — try again',
      excelDownloaded: 'Payment voucher Excel downloaded',
      excelDownloadFailed: 'Could not download the Excel — try again',
      pdfDownloading: 'PDF downloading — open it from your notifications',
      voucherOpenFailed: 'Could not open the voucher — try again',
      pdfOpened: 'Payment voucher PDF opened',
      pdfOpenFailed: 'Could not open the PDF — try again',
      noPayments: 'No payments yet',
      noMatches: 'No payments match your filters.',
      openPayment: 'Open Payment',
      sheetTitle: 'Filter payment history',
      statusLabel: 'Status',
      netPaidLabel: 'NET PAID (RM)',
      netPaidPlaceholder: 'e.g. 898',
      applyFilters: 'Apply filters',
      clearAndClose: 'Clear & close',
      cardMetaOne: '{n} shift · Issued {date}',
      cardMetaMany: '{n} shifts · Issued {date}',
      signThisWeek: 'Sign this week',
      metricWages: 'Wages',
      metricCommission: 'Commission',
      metricEarlyWithdrawal: 'Early withdrawal',
      weekBreakdown: 'WEEK BREAKDOWN',
      pvIssuedSunday: 'PV issued every Sunday',
      colDate: 'Date',
      colType: 'Type',
      colAmount: 'Amount',
      netPayable: 'Net payable',
      bankRef: 'Bank ref: {ref}',
      sign: 'Sign',
      openPv: 'Open PV',
      metaPaidOn: 'Paid {when}',
      metaSignedOn: 'Signed {when}',
      metaDisputed: 'Disputed — waiting on your agency',
      metaAwaitingSignature: 'Waiting for your signature',
      metaAwaitingIssue: 'Waiting for your agency to issue',
      multiOutlet: '({n})-outlet',
      lineWages: 'Daily wages',
      lineDrinks: 'Drinks commission',
      lineTips: 'Tips commission',
      lineOthers: 'Others',
      shiftPaidSealed: 'Paid · sealed',
      shiftSealedSignedPv: 'Sealed · signed PV',
      shiftSealedPvUnsigned: 'Sealed · PV not signed yet',
      perPvWeekBreakdown: 'Per PV week breakdown',
    },
    pv: {
      rowWages: 'Daily wages',
      rowOthers: 'Others',
      rowDeductions: 'Deductions',
      total: 'TOT',
      weekSummary: 'WEEK SUMMARY',
      dayVerified: 'VERIFIED',
      dayPending: 'PENDING',
      dayDisputed: 'DISPUTED',
      dayDeducted: 'DEDUCTED',
      verifiedCount: '{n} verified',
      tapHint: 'Tap a drinks or tips amount to dispute it on the Payment page — a {red} amount already has an open dispute.',
      tapHintRed: 'red',
      disputeOpen: 'Dispute open',
      disputeBannerBody: 'Your agency is reviewing the flagged amounts — see Payment for the details.',
      pendingYourReview: 'Pending your review',
      waitingForAgency: 'Waiting for your agency',
      reviewThenSign: 'Review each day, then sign to confirm this week’s earnings.',
      notIssuedYet: 'Your agency has not issued this voucher yet — you can review it, but there is nothing to sign until they send it.',
      awaitingSignature: 'Awaiting signature',
      signed: 'Signed',
      netPayable: 'Net payable',
      payee: 'Payee',
      prPersonnel: 'PR Personnel',
      drinkTipRecords: 'DRINK & TIP RECORDS',
      hide: 'Hide',
      details: 'Details',
      sourceScan: 'Scanned receipt',
      sourceManual: 'Self-logged',
      sourceCheckin: 'Auto-sealed on check-out',
      lineDate: '{d} {mon} {y}',
      receiptDetails: 'Receipt details',
      detailDateTime: 'DATE & TIME',
      detailOutlet: 'OUTLET',
      detailReceipt: 'RECEIPT',
      detailCommission: 'COMMISSION',
      matchedToThisPv: 'Matched to this PV',
      pendingAgencyVerify: 'Pending agency verify',
      yourSignature: 'YOUR SIGNATURE',
      signaturePending: 'Pending',
      signedWithName: 'Signed · {name} — Dual-signed · transfer processing',
      signedSealed: 'Signed — Dual-signed · transfer processing',
      notSentYet: 'Not sent to you yet — waiting for your agency',
      signVoucher: 'Sign payment voucher',
      paidInBank: 'PAID · {amount} in your bank',
      viewInHistory: 'View in History · Payment history',
      signSheetHint: 'Draw your signature with your finger — it is stored on the voucher and printed on the PDF.',
      signingAs: 'Signing as',
      thisAccount: 'this account',
      signatureField: 'Signature',
      confirmSignature: 'Confirm signature',
      drawSignatureTitle: 'Draw your signature',
      drawSignatureBody: 'Sign in the pad with your finger before confirming.',
      noVoucherTitle: 'No voucher to sign yet',
      noVoucherBody: 'This voucher is not on the server — go back, refresh Payment, and try again.',
      notSignedTitle: 'Not signed',
      notSignedBody: '{reason}\n\nNothing was saved — try again when you have signal.',
      couldNotReachAgency: 'Could not reach the agency.',
    },
    scan: {
      titleEdit: 'Edit self-log',
      titleSelfLogTips: 'Self-log tips',
      titleSelfLogDrinks: 'Self-log drinks',
      titleScanTips: 'Scan tips receipt',
      titleScanDrinks: 'Scan drinks receipt',
      itemNounTip: 'tip / service item',
      itemNounTipPlural: 'tip / service items',
      itemNounDrink: 'drink',
      itemNounDrinkPlural: 'drinks',
      subEdit: 'Edit — agency re-verifies.',
      subScanWindow: "Scans between Time-In and Time-Out go to this shift's PV.",
      gateTitle: 'Check in first',
      gateBody: 'Check in on Attendance before scanning receipts.',
      goToCheckIn: 'Go to Check-In',
      activeShift: 'Active shift · {outlet}',
      belongsTo: 'Belongs to',
      receiptsLogged: '{n} receipt(s) logged',
      timeIn: 'Time-In {time}',
      pointAndSnap: 'Point at the receipt and snap',
      scanningOcr: 'Scanning… reading OCR fields',
      ocrExtracted: '— OCR EXTRACTED —',
      ocrOrderNo: 'Order No: {v}',
      ocrDate: 'Date: {v}',
      ocrTime: 'Time: {v}',
      ocrOutlet: 'Outlet: {v}',
      ocrDetectedAsRead: 'OCR detected · as read from the receipt',
      eachPrice: '{price} each',
      wasHappyHour: '(was {price} · HH −{pct}%)',
      detectedSummary: '{items} {noun} · {units} unit(s) · {total} · Est. commission {commission}',
      setQuantityAtLeastOne: 'Set a quantity for at least one item.',
      saving: 'Saving…',
      confirmAndLog: 'Confirm & log receipt',
      scanNow: 'Scan receipt now',
      manualPill: 'Manual self-log',
      keyInAmount: 'Key in the amount · agency verifies.',
      ocrMatchesCatalog: "OCR reads the receipt & matches this outlet's {n} {noun}",
      dateIgnored: 'ignored “{raw}” → {parsed} · {days} days from this shift ({shift})',
      ocrLinesOne: '{n} line',
      ocrLinesMany: '{n} lines',
      showOcrText: 'Show what OCR read ({lines})',
      hideOcrText: 'Hide what OCR read ({lines})',
      ocrRawHint: 'An item is only found when its name is on one of these lines. If a name is missing or misspelt here, the paper or the photo is the problem — scan again, flatter and closer.',
      notFoundOnScan: 'NOT FOUND ON THE SCAN · ADD IF IT IS ON THE PAPER',
      eachPriceNotRead: '{price} each · OCR did not read this one',
      addItem: '+ Add',
      onlyAddWhatShows: 'Only add what the receipt actually shows — the agency checks these against your photo.',
      pointOcrLists: 'Point at the receipt — OCR lists the {noun} it reads',
      scanAgainCatch: 'Scan again to catch a {noun} OCR missed',
      scanItems: 'Scan {noun}',
      scanAgain: 'Scan again',
      ocrDetectedAdjust: 'OCR DETECTED · ADJUST QUANTITY',
      noQtyPrinted: 'Receipt printed no quantity — check this one',
      selfLogSummary: '{items} {noun} · {units} unit(s)',
      commissionPreview: 'Commission preview:',
      tipAmountRm: 'Tip amount (RM)',
      drinkAmountRm: 'Drink amount (RM)',
      proofRetakeTitle: 'Proof photo · retake to replace',
      proofRequiredTitle: 'Proof photo · required',
      proofRetakeHint: 'Snap again — the new picture replaces the one saved with this log.',
      proofRequiredHint: 'Snap the receipt as proof — agency verifies against it.',
      retakeAgain: 'Retake again',
      retakePhoto: 'Retake photo',
      addAnotherPhoto: 'Add another photo',
      takeOrAttachPhoto: 'Take / attach photo',
      snapToEnableSubmit: '⚠ Snap a photo to enable Submit.',
      noteOptional: 'Note for agency (optional)',
      noteRequired: 'Note for agency (required)',
      notePlaceholder: 'Unclear quantity / price / date on the receipt? Explain — or confirm all match.',
      updateSelfLog: 'Update self-log',
      submitScanFirst: 'Submit self-log · scan {noun}',
      writeNoteToSubmit: 'Write the agency note to submit',
      submitSelfLogAmount: 'Submit self-log · {amount}',
      snapProofToSubmit: 'Snap proof to submit',
      submitSelfLog: 'Submit self-log',
      receiptLogged: 'Receipt logged',
      addedToStatus: 'Added to Check-In STATUS · pending until agency verifies.',
      belongsToPv: 'Belongs to PV:',
      receiptRef: 'Receipt {no}',
      orderRef: 'Order {no}',
      scanAnother: 'Scan another',
      backToCheckIn: 'Back to Check-In',
      wrongScanPrefix: 'Wrong scan? Check-In →',
      wrongScanSuffix: '· pending self-logs can be edited or deleted.',
      backToAttendance: 'Back to attendance',
      ocrUnavailable: 'On-phone OCR needs the dev app build. Photo kept as proof — self-log the items instead.',
      dateDroppedNote: 'It did read “{raw}” ({parsed}), but that is {days} days from this shift on {shift} — too far to be this receipt’s date, so it was dropped rather than logged against the wrong week.',
      noneMatchedWithList: 'OCR read the photo but found none of {outlet}’s {noun} — it looks for: {wanted}. Scan a receipt printing one of those, or self-log below (photo kept as proof).',
      noneMatched: 'OCR read the photo but found none of {outlet}’s {noun}. Scan a receipt printing one of them, or self-log below (photo kept as proof).',
      fieldOrderNo: 'order number',
      fieldDate: 'date',
      fieldTime: 'time',
      andJoin: ' and ',
      couldNotReadFields: 'OCR couldn’t read the receipt’s {fields} yet — get closer to that part of the paper (flat, no glare) and scan again. Fields already read are kept.',
      couldNotSave: 'Could not save. Try again.',
      setQuantityFirst: 'Set a {noun} quantity first.',
      snapProofFirst: 'Snap a proof photo before you submit.',
      setQuantityAtLeastOneNoun: 'Set a quantity for at least one {noun}.',
      setAmountFirst: 'Set an amount first.',
    },
    errors: {
      backendUnreachable: 'Cannot reach the InnocenZ backend at {base}. Is it running?',
      requestFailed: 'Request failed ({status})',
      uploadFailed: 'Upload failed ({status})',
      pdfExportFailed: 'PDF export failed ({status})',
      excelExportFailed: 'Excel export failed ({status})',
      photoTooLarge: 'That photo is too large — pick one under 5 MB',
      uploadUnreachable: 'Upload failed — could not finish talking to {base} ({detail}). Check Wi‑Fi / that the backend is running.',
      networkError: 'network error',
      notSignedIn: 'Not signed in',
      invalidCode: 'Invalid code',
      codeExpired: 'This code has expired — request a new one',
      codeAlreadyUsed: 'This code was already used',
      codeSendFailed: 'Could not send the code — try again later',
      codeCooldown: 'Wait {s}s before requesting another code',
      sameEmail: 'That is already your email',
      samePhone: 'That is already your phone number',
      emailTaken: 'That email is already used by another account',
      phoneTaken: 'That phone number is already used by another account',
      noContactChannel: 'Your account has no phone or email we can send a code to',
      addContactBeforePasswordChange:
        'Add a phone number or an email to your account before changing your password',
      currentPasswordIncorrect: 'Current password is incorrect',
      passwordMustDiffer: 'New password must be different',
      changeEmailInSecurity: 'Change your email from Security settings',
      changePhoneInSecurity: 'Change your phone from Security settings',
      setPasswordFirst: 'Set a password before you change your sign-in email or phone',
      useForgotPassword: 'Use Forgot password on the sign-in page',
      tooManyRequests: 'Too many attempts. Please wait and try again later.',
      lockedOut: 'Too many failed attempts. Try again in {m} minutes.',
      tooManyCodeAttempts: 'Too many attempts — request a new code',
      invalidPhoneNumber: 'Enter a valid phone number',
      enterSixDigitCode: 'Enter the 6-digit code',
      invalidEmailAddress: 'Enter a valid email address',
      currentPasswordRequired: 'Current password is required',
      enterEmailOrPhone: 'Enter your email or your phone number',
      enterNewContact: 'Enter the new email or phone number',
      couldNotStartChange: 'Could not start the change',
      couldNotSendCode: 'Could not send the code',
      cannotChangePasswordHere: 'This account cannot change password here',
      validationFailed: 'Validation failed',
      internalServerError: 'Internal Server Error',
      unauthorized: 'Unauthorized',
      passwordMinLength: 'Password must be at least {n} characters long',
      passwordMaxLength: 'Password must be at most {n} characters long',
    },
    notif: {
      shiftAssignedTitle: 'You have a new shift',
      shiftAssignedBody: 'Your shift is on {date}.',
      shiftCancelledTitle: 'A shift was cancelled',
      shiftCancelledBody: 'You are no longer booked for the shift on {date}.',
      shiftWithdrawnTitle: 'A shift was withdrawn',
      shiftWithdrawnBody: '{venue} withdrew the shift on {date}. You are no longer booked for it.',
      shiftWithdrawnBodyNoVenue: 'The venue withdrew the shift on {date}. You are no longer booked for it.',
      leaveApprovedTitle: 'MC / leave approved',
      leaveApprovedBody: 'Your agency approved the request — you are excused from this shift with no penalty.',
      leaveRejectedTitle: 'MC / leave rejected',
      leaveRejectedBody: 'Your agency rejected the request — you are still on this shift.',
      overtimeApprovedTitle: 'Overtime approved',
      overtimeApprovedBody: 'Your {minutes} min of overtime on {date} was approved — {amount} is on that week’s payment voucher.',
      overtimeRejectedTitle: 'Overtime not approved',
      overtimeRejectedBody: 'Your {minutes} min of overtime on {date} was not approved. Ask your agency if you think this is wrong.',
      disputeAcceptedTitle: 'Your dispute was accepted',
      disputeRejectedTitle: 'Your dispute was rejected',
      disputeBody: '{component} on {date}',
      disputeBodyWithNote: '{component} on {date} — {note}',
      pvIssuedTitle: 'Your payment voucher is ready',
      pvIssuedBody: 'Week {start} to {end}. Check the amounts and raise a dispute if anything is wrong.',
      releasedEarlyTitle: 'You were released early',
      swapRequestTitle: 'Outlet swap — your answer is needed',
      joinAcceptedTitle: 'You were accepted by the agency',
      joinAcceptedBody: 'You can now be scheduled for shifts.',
      joinDeclinedTitle: 'Your agency application was declined',
      departureApprovedTitle: 'Your departure from the agency was approved',
      departureApprovedBody: 'You are no longer under this agency.',
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
      discardTitle: '确定不完成就离开？',
      discardBody: '已输入的内容将丢失，重新开始时需要新的验证码。',
      keepGoing: '继续填写',
      leave: '离开',
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
      logoAlt: 'InnocenZ 标志',
    },
    forgot: {
      title: '重置密码',
      phoneHint: '请输入账号的手机号码。我们会通过 WhatsApp、短信和电子邮件向账号上的联系方式发送验证码。',
      byPhone: '手机号',
      byEmail: '电子邮箱',
      emailHint: '请输入账号的电子邮箱。我们会通过 WhatsApp、短信和电子邮件向账号上的联系方式发送验证码。',
      emailLabel: '电子邮箱',
      sendCode: '发送验证码',
      sending: '发送中…',
      otpTitle: '输入验证码',
      otpHint: '请输入 6 位验证码，{m} 分钟内有效。',
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
      codeSentInfo: '如果该账号存在，我们已通过 WhatsApp、短信和电子邮件发送验证码。',
      passwordHint: '为你的账号设置新密码，至少 6 位。',
      resetFailed: '无法重置密码',
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
      bankDetails: '银行资料',
      bankName: '银行',
      bankNamePlaceholder: '例如 Maybank',
      bankAccountNo: '账号',
      bankAccountPlaceholder: '例如 512345678901',
      bankSearchPlaceholder: '搜索你的银行',
      bankHint: '经纪公司会将每周付款单转账至此账户。两栏清空即可删除。',
      noBankDetails: '未填写 — 没有这项资料，经纪公司无法转账给你。',
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
      accountEyebrow: '账户',
      editingBadge: '编辑中',
      comcardIcBadge: '照片名片卡 · 身份证',
      floorNickname: '现场昵称',
      legalIcName: '身份证姓名',
      agencies: '经纪公司',
      selectAgencies: '选择经纪公司…',
      agencyTied: '经纪公司 · {names}',
      awaitingApproval: '等待审批 · {names}',
      departureWaiting: '离开申请等待 {names} 审批',
      icNumber: '身份证 {ic}',
      agencyLockedJoin: '等待 {names} 审批 — 在他们批准或拒绝前，无法更改经纪公司。',
      agencyLockedLeave: '离开申请等待 {names} 审批 — 在有结果前，无法更改经纪公司。',
      agencyDeparturePending: '{name} · 离开待审批',
      leaveConfirm: '离开 {name}？薪资与班次必须结清，并需对方批准。',
      requestToLeave: '申请离开',
      keep: '保留',
      departureRequested: '已提交离开申请 — 等待 {name} 审批',
      departureFailed: '无法提交离开申请',
      nicknameLength: '现场昵称需为 2–20 个字符',
      icNameRequired: '请输入身份证姓名',
      languageRequired: '请至少选择一种语言',
      emailInvalid: '请输入有效的电子邮箱',
      emailChangeHint: '请在安全设置中更改',
      leaveEditTitle: '不保存就离开？',
      leaveEditBody: '未保存的资料修改将会丢失。',
      keepEditing: '继续编辑',
      profileSaved: '资料已保存',
      saveFailed: '无法保存资料',
      comcardUpdated: '名片卡已更新',
      galleryUnavailable: '无法打开相册 — 请重新构建开发版应用（expo run:android）。',
      imageTooLarge: '图片需小于 5 MB',
      avatarUpdated: '头像已更新',
      avatarUploadFailed: '无法上传照片',
      portfolioUploadFailed: '无法上传作品集照片',
      someImagesSkipped: '部分图片超过 5 MB，已跳过',
      removePhotoTitle: '移除照片？',
      removePhotoBody: '移除作品集照片 {label}？这会从你的资料中删除它。',
      portfolioRemoveFailed: '无法移除作品集照片',
      savingArrangement: '正在保存排列…',
      rearrangeFailed: '无法重新排列作品集',
      portfolioRearranged: '作品集已重新排列',
      portfolio: '作品集',
      portfolioDragHint: '长按拖动 · 放开交换',
      portfolioShowcase: '展示照片',
      portfolioCount: '照片 {n} / {total}',
      noLanguages: '尚未添加语言 — 点击「编辑资料」添加。',
      tier1: '一级',
      tier2: '二级',
      tier3: '三级',
      tier4: '四级',
      tier5: '五级',
      tierServant: '服务生',
      tierCommissionOnly: '纯佣金',
      slotTapToSwap: '点击另一个位置交换 · 再次点击取消',
      slotDragHint: '长按拖动 · 拖到上下边缘可滚动 · 放开交换',
      viewerReturn: '返回',
      viewerHint: '双指缩放或双击放大 · 拖动移动 · 点 ✕ 返回 关闭',
      signHere: '用手指在此签名',
      clearSignature: '清除',
      comcardAge: '年龄 {n}',
      ageSuffix: '岁',
    },
    security: {
      title: '安全',
      changePassword: '修改密码',
      changePhone: '更换手机号',
      changeEmail: '更换电子邮箱',
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
      passwordMax: '密码最多 72 位',
      passwordMismatch: '两次输入的密码不一致',
      phoneUpdated: '手机号已更新',
      emailUpdated: '电子邮箱已更新',
      sendOtp: '发送验证码',
      verifyOtp: '验证验证码',
      eyebrow: '账号',
      intro:
        '此处的每项更改都需要当前密码和一条验证码。同一条验证码会发送到你的 WhatsApp、短信和电子邮箱 — 你能看到哪个都可以。',
      currentPhone: '当前：{phone}',
      currentEmail: '邮箱：{email}',
      changePasswordHint:
        '请输入当前密码和新密码。我们会向账号上的手机和电子邮箱发送一条验证码，输入验证码后新密码即生效。',
      passwordCodeTitle: '确认新密码',
      changePhoneHint:
        '请输入新手机号和你的当前密码。我们会向新号码和账号上的电子邮箱发送一条验证码 — 不会向旧号码发送任何信息。',
      changeEmailHint:
        '请输入新电子邮箱和你的当前密码。我们会向新邮箱和账号上的手机发送一条验证码 — 不会向旧邮箱发送任何信息。',
      newMobileNumber: '新手机号码',
      newEmail: '新电子邮箱',
      newPhoneCodeTitle: '验证新手机号',
      newEmailCodeTitle: '验证新电子邮箱',
      codeValidFor: '验证码 {m} 分钟内有效。',
      pendingInvites:
        '有 {n} 个待处理的邀请发送到了你当前的电子邮箱。更换后将无法接受这些邀请 — 请先接受，或请对方向新邮箱重新发送邀请。',
      startAgain: '重新开始',
      otpLabel: '验证码',
      verifyAndSave: '验证并保存',
      channelWhatsapp: 'WhatsApp',
      channelSms: '短信',
      channelEmail: '电子邮件',
      channelJoin: ' 和 ',
      sentVia: '通过 {channels} 发送至 {to}',
      sentPartJoin: '，并',
      sentSummary: '验证码已{parts}',
      sentLoggedOnly: '测试模式：验证码已写入服务器日志，并未实际发送。',
      sentNowhere: '验证码未能送达。请稍后点击重新发送。',
      updatePasswordFailed: '无法更新密码',
      sendCodeFailed: '无法发送验证码',
      updatePhoneFailed: '无法更新手机号',
      updateEmailFailed: '无法更新电子邮箱',
      deleteAccountFailed: '无法删除账号',
      signInAgainBody: '为了账号安全，请重新登录。',
      signInAgain: '重新登录',
      sessionEnded: '登录已失效，本次没有做任何更改。',
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
      agency: '经纪公司',
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
      booked: '已排班',
      noShift: '无班次',
      attendanceFailed: '出勤操作失败',
      viewingEarlier: '正在查看较早的班次 · 点按前往当前班次',
      loadingShift: '正在加载你的班次…',
      idleEmpty: '经纪公司会为你安排班次 — 安排后即可签到。',
      eventFallback: '班次',
      dayAndDate: '星期与日期',
      locating: '定位中…',
      metresFrom: '距离 {name} {m} 米',
      metresAway: '距离 {m} 米 — 请再靠近一些',
      gpsNote: '只有在距离 {name} {m} 米以内才能签到。手机仅为本次出勤记录分享位置。',
      gpsNoteBypass: '只有在距离 {name} {m} 米以内才能签到 — 演示期间暂时跳过定位。',
      duration: '时长 {d}',
      otEstimate: '加班 {h} 小时（约 {amount}）— 这是我们根据你的签到签退时间估算的 · 未发送给经纪公司，也不计入本次收入。如应支付，请与他们沟通。',
      cancelWarning: '经纪公司指派的班次 — 取消可能影响薪资。',
      reasonPlaceholder: '你为什么要取消？',
      locationExplainer: 'InnocenZ 仅将你的位置用于一件事 — 证明你签到时确实在门店。',
      locCheckRadius: '距离门店 50 米内即可签到',
      locCheckStamp: '签到与签退各记录一次位置',
      locCheckNoTracking: '绝不进行后台追踪',
      holding: '按住中 {p}%',
      missingPhotoOne: '有 {n} 条记录缺少照片 — 请点按该行的红色相机重新拍摄，或删除该行，然后才能签退。',
      missingPhotoMany: '有 {n} 条记录缺少照片 — 请点按该行的红色相机重新拍摄，或删除该行，然后才能签退。',
      nothingLogged: '尚未记录任何项目。请在签退前扫描收据，或自行记录至少一笔酒水或小费 — 并附上照片。班次一旦结束，该笔佣金将无法再申报。',
      emptyShiftTitle: '未记录任何项目就签退？',
      emptyShiftWarning:
        '本班次您尚未记录任何酒水或小费。签退即代表班次结束，之后无法再补登今晚的佣金。确实无项可记录时才请继续。',
      emptyShiftConfirm: '确认，仍然签退',
      locPermissionOff: '定位权限已关闭 — 请允许后再签到。',
      gpsReadFailed: '无法读取定位 — 请检查定位权限后重试。',
      locationDenied: 'InnocenZ 需要定位权限才能在门店为你签到。请在 设置 > InnocenZ > 位置 中开启，然后重试。',
      locationDisabled: '本机的定位服务已关闭。请开启 GPS／定位后重试。',
      locationTimeout: '无法获取定位。请到户外或窗边后重试。',
      locationUnknown: '无法读取你的位置。',
    },
    payment: {
      title: '结算',
      history: '结算记录',
      bankNudgeTitle: '填写你的银行资料',
      bankNudgeBody: '经纪公司无法转出这笔钱。请填写银行与账号，付款单才能转账给你。',
      bankNudgeAction: '现在填写',
      lastWeek: '上周',
      thisWeek: '本周',
      lastWeekTitle: '上周',
      thisWeekTitle: '本周',
      lastWeekRange: '上周 {range}',
      verifiedDays: '已核实天数 {n}/7',
      approvedDays: '已批准天数',
      agencyFallback: '经纪公司',
      gridTotal: '合计',
      gridTotalSub: '本周',
      rowWages: '日薪',
      rowDrinks: '酒水',
      rowTips: '小费',
      rowOthers: '其他',
      rowDeductions: '扣款',
      nVerified: '{n} 已核实',
      nPending: '{n} 待处理',
      statusPending: '待处理',
      statusApproved: '已批准',
      statusDisputed: '争议中',
      statusVerified: '已核实',
      statusDeducted: '已扣除',
      statusPaid: '已付款',
      statusSigned: '已签名',
      statusSent: '已发出',
      disputeOpen: '争议处理中 · 经纪公司审核中',
      disputeOpenNamed: '{agency} · 争议处理中 · 经纪公司审核中',
      disputeBannerHint: '点按任一金额可查看其收据，并在那里撤回此争议。',
      tapHint: '点按任一金额可查看其单号、班次与项目，并在那里提出争议 · 点按{red}金额可撤回误报的争议。',
      redWord: '红色',
      pvIssuedSunday: '结算单每周日发放 · 合计',
      pvOnDay: '结算单 {day} 发放',
      totalLower: '合计',
      couldNotLoadLastWeek: '无法加载上周数据 — 请检查网络后下拉刷新。',
      noLastWeekPv: '上周暂无结算单 — 本周结算单将于下周日发放。',
      checkOutToSeal: '请在出勤页签退，将今日薪资与佣金封存到本周结算单。',
      reviewSign: '审阅并签名 · {amount}',
      reviewSignNamed: '审阅并签名 · {agency} · {amount}',
      whatYouDisputed: '你提出的争议',
      receiptsThisDay: '当日收据',
      nTotal: '共 {n} 张',
      receiptCounts: '{v} 已核实 · {a} 已批准 · {p} 待处理',
      claimOpen: '处理中',
      claimAccepted: '已接受',
      claimRejected: '已拒绝',
      claimWithdrawn: '已撤回',
      voucherSaid: '结算单金额为 {amount}',
      raisedAt: '提出于 {when}',
      filedWholeDay: '针对整天提出 — 涵盖下方两个班次。',
      shiftFallback: '班次',
      shiftTimeUnknown: '班次时间未知',
      inOutWindow: '签到 {inAt} · 签退 {outAt} · {window}',
      noOrderNo: '无单号',
      wholeReceipt: '整张收据',
      noReceiptBehind: '此项没有收据 — 它由你的签到与签退时间计算得出。',
      agencyAnswer: '经纪公司：{note}',
      cancelThisDispute: '撤回此争议',
      cancelling: '撤回中…',
      durationUnknown: '时长未知',
      hours: '{h} 小时',
      hoursMinutes: '{h} 小时 {m} 分钟',
      minutes: '{m} 分钟',
      withOvertime: '{base} · 加班 +{m} 分钟',
      otOnDay: '{day} {mins}',
      otPending: '{parts} — 加班已在签退时记录，正在等待经纪公司处理。以上金额未包含这部分。',
      withdrawDisputeTitle: '撤回争议？',
      disputeThisAmount: '对此金额提出争议',
      whichOneWrong: '哪一笔有误？',
      alreadyDisputed: '已提出争议',
      notReviewedYetShort: '尚未审核',
      selected: '已选择',
      pickShift: '请选择你要提出争议的班次。',
      disputingOf: '正在对当日 {day} 中的 {picked} 提出争议。',
      whichItem: '哪一项？',
      pickOneItem: '请至少选择一项。',
      quickReason: '原因',
      noteFollowsItems:
        '根据你勾选的项目自动生成。可直接修改 —— 经纪公司看到的就是这段内容。',
      reasonWrongCommission: '佣金有误',
      reasonWrongQuantity: '数量有误',
      reasonCountedTwice: '重复计算',
      reasonMissingFromPv: '结算单中缺少',
      reasonWrongRate: '费率有误',
      reasonNotMyShift: '不是我的班次',
      reasonOthers: '其他',
      notePlaceholder: '为经纪公司补充说明…',
      attachImages: '附加文件（图片）',
      optional: '选填',
      imagesAttachedOne: '已附上 {n} 张图片作为证据',
      imagesAttachedMany: '已附上 {n} 张图片作为证据',
      proofOptional: '证据图片为选填 — 如有收据照片可一并附上。',
      submitting: '提交中…',
      submitDispute: '提交争议',
      withdrawSub: '误标了此金额？撤回后它将恢复为已核实。',
      proofCleared: '将清除 {n} 张证据图片。',
      withdrawing: '撤回中…',
      withdrawDispute: '撤回争议',
      notDisputedHereTitle: '此处不可提出争议',
      notDisputedHereBody: '{row} 由你的签到与签退时间计算得出，并非来自收据。如有误，请让经纪公司更正 {day} 的班次记录。',
      notReviewedTitle: '尚未审核',
      notReviewedBody: '经纪公司仍在核对 {day} 的 {row} 收据。审核通过后，你即可在此对该金额提出争议。',
      openDayFirstTitle: '请先打开该日',
      openDayFirstBody: '该日的金额来自多家经纪公司，因此无法在此把这项争议匹配到结算单。请打开该日，选择班次，并在那里撤回。',
      couldNotCancel: '无法撤回',
      tryAgain: '请重试。',
      cancelConfirmTitle: '撤回此争议？',
      cancelConfirmBody: '经纪公司将停止审核。如仍有异议，你之后可以再次提出。',
      keepIt: '保留',
      cancelDispute: '撤回争议',
      pickShiftFirstTitle: '请先选择班次',
      pickShiftFirstBody: '该日的金额来自多家经纪公司。请打开该日，选择要提出争议的班次，然后重试。',
      noVoucherTitle: '暂无可提出争议的结算单',
      noVoucherLast: '上周的结算单尚未发放 — 暂时没有可提出争议的内容。',
      noVoucherThis: '本周的结算单尚未开立 — 请先记录一个班次，之后才能对其中的金额提出争议。',
      disputeFailed: '争议提交失败',
      nVouchersThisWeek: '本周有 {n} 张结算单',
      multiAgencyHint: '你为多家经纪公司工作。每家分别付款并单独签名。',
      notYetNumbered: '尚未编号',
      penaltiesThisWeek: '本周罚款',
      cancelledShift: '已取消的班次',
      pctOfDailyWage: '日薪的 {pct}%',
      ruleMinShifts: '每周最少班次',
      ruleMaxMc: '每月最多病假',
      ruleLate: '每周迟到次数',
      ruleCancellation: '取消班次',
      dayAndDate: '{dow} {d}日',
      stampShort: '{mon}{d}日 {time}',
    },
    history: {
      title: '记录',
      shifts: '班次',
      payments: '结算',
      earnedInRange: '所选范围收入',
      wagesTotal: '工资',
      shiftHistory: '班次记录',
      searchPlaceholder: '搜索工资、销售、其他、酒水…',
      filterOutlet: '门店',
      filterStatus: '状态',
      filterDate: '日期',
      anyOutlet: '全部门店',
      anyStatus: '全部状态',
      anyDate: '全部日期',
      statusCurrent: '本周',
      statusSigned: '已签署',
      shiftCountOne: '{n} 个班次',
      shiftCountMany: '{n} 个班次',
      weekEarnLine: '收入 {earned} · 工资 {wages}',
      noShiftsInWeek: '该周暂无班次',
      noShiftsMatch: '没有符合筛选条件的班次',
      resetFilters: '重置筛选',
      totalPayout: '{amount} 总收入',
      cancelledNoPayout: '班次已取消 — 无收入',
      metricWages: '工资',
      metricOthers: '其他',
      pickDateFirst: '请先选择日期',
      tapToChoose: '点按选择',
      fromTime: '开始时间',
      toTime: '结束时间',
      done: '完成',
      calLegendWorked: '已出勤 · 有记录',
      calLegendNote: '可选至今天为止的任意日期 · 无记录的日期不会显示内容。',
      weekTitleCurrent: '本周 · {range}',
      tabCurrentWeek: '本周',
      tabPayrollWeeks: '薪资周',
      noPayrollWeeksYet: '暂无薪资周 — 代理开具首张付款凭证后会显示在这里。',
      weekTitlePayroll: '薪资周 · {range}',
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
      stampAm: '{y}年{mon}{d}日 上午 {time}',
      stampPm: '{y}年{mon}{d}日 下午 {time}',
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
      dateLine: '{y}年{mon}{d}日 {dow}',
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
      dateTopbar: '{mon}{d}日 {dow}',
      dateDayMonth: '{mon}{d}日',
      sealedPendingPv: '已封存 · 结算单待发放',
    },
    receipt: {
      captionDay: '{d}日 {dow}',
      captionVerified: '{n} 项已核实',
      captionApproved: '{n} 项已批准',
      captionOfOne: '共 {total} 项：{parts}',
      captionOfMany: '共 {total} 项：{parts}',
      captionWaiting: '{n} 项待经纪公司处理',
      captionWaitingOn: '{n} 项待经纪公司处理（{days}）',
      presetWrongCommission: '佣金有误',
      presetWrongQuantity: '数量有误',
      presetCountedTwice: '重复计算',
      presetMissingFromPv: '结算单中缺失',
      presetWrongRate: '费率有误',
      presetNotMyShift: '不是我的班次',
      presetOthers: '其他',
      statusPending: '待审核',
      statusApproved: '已批准',
      statusDisputed: '有异议',
      statusVerified: '已核实',
      statusDeducted: '已扣款',
      scannedThisShift: '本班次已扫描的收据',
      groupTipsService: '小费 / 服务',
      pictureOne: '{n} 张照片',
      pictureMany: '{n} 张照片',
      itemLoggedOne: '已记录 {n} 项',
      itemLoggedMany: '已记录 {n} 项',
    },
    evidence: {
      kindWages: '日薪',
      kindOthers: '加班 / 其他',
      kindDeductions: '扣款',
      sourceScanned: '已扫描',
      sourceSelfLogged: '自行记录',
      sourceSealed: '签退时封存',
      dayShort: '{mon}{d}日 {dow}',
      dayLong: '{y}年{mon}{d}日 {dow}',
      notLinked: '未关联班次',
      noShiftNote: '这笔记录是在没有开班的情况下登记的，因此没有签到记录可显示。下方的收据仍是凭证。',
      shiftTimesUnavailable: '目前无法获取班次时间。下方的收据仍是凭证。',
      shiftFallback: '班次',
      expandA11y: '{title} — 点击查看签到、收据与项目',
      tapForDetails: '点击查看详情',
      shiftWas: '原定时间',
      youCancelled: '你取消的时间',
      noticeGiven: '提前通知',
      feeBand: '费用档次',
      feePctOfShift: '本班次的 {pct}%',
      feePctWithRm: '本班次的 {pct}% · RM {rm}',
      shiftEnd: '班次结束',
      stillOnDuty: '仍在值班',
      durationWithOtRecorded: '{base} · 已记录加班 +{ot} 分钟',
      timeNotSet: '未设定时间',
      notRecorded: '未记录',
      noticeSpanHoursMinutes: '{h} 小时 {m} 分',
      noticeSpanHours: '{h} 小时',
      noticeSpanMinutes: '{m} 分',
      noticeBefore: '班次开始前 {span}',
      noticeAfter: '班次开始后 {span}',
      hint: '构成这个金额的全部明细。请用纸质收据核对订单号。',
      mismatch: '此清单合计为 {listed}，但表格显示 {grid}。请上报此问题 — 不要签字确认。',
      openDisputeWholeDay: '你有一项未结的争议涵盖这一整天 — 下方每个班次都包含在内。',
      nothingLogged: '这一天没有任何记录。',
      tagDisputed: '有争议',
      tagVerified: '已核实',
      tagSettled: '已结清',
      noOrderNo: '无订单号',
      printedOn: '打印于 {date}',
      printedAt: '打印于 {date} {time}',
      waitingOnAgency: '等待经纪公司处理',
      openPhotoA11y: '全屏查看收据照片',
      shiftSubtotal: '班次小计 · {amount}',
      disputeAmount: '对此金额提出争议',
    },
    swaps: {
      header: '门店换班请求',
      fromFallback: '你的门店',
      toFallback: '新门店',
      hint: '只有你同意后，班次才会改到该门店。',
      decline: '婉拒',
      approve: '同意',
      sending: '发送中…',
      loadFailed: '无法加载你的换班请求',
      respondFailed: '无法发送你的回复',
    },
    payHistory: {
      heading: '结算记录',
      filter: '筛选',
      searchPlaceholder: '搜索结算单号、门店、周次、银行参考号…',
      outletLabel: '门店',
      anyOutlet: '所有门店',
      fromTime: '起始时间',
      toTime: '结束时间',
      chipAll: '全部',
      chipToSign: '待签署',
      statusPaid: '已支付',
      statusSigned: '已签署',
      statusPending: '待处理',
      clearAllFilters: '清除所有筛选',
      weeks: '周数',
      totalNet: '净额合计',
      paidSummary: '{n} 周已支付 · {amount}',
      signedSummary: '{n} 周已签署 · {amount}',
      excelOpening: 'Excel 正在浏览器中打开 — 请查看下载内容',
      excelOpenFailed: '无法打开 Excel — 请重试',
      excelDownloaded: '结算单 Excel 已下载',
      excelDownloadFailed: '无法下载 Excel — 请重试',
      pdfDownloading: 'PDF 下载中 — 请从通知栏打开',
      voucherOpenFailed: '无法打开结算单 — 请重试',
      pdfOpened: '结算单 PDF 已打开',
      pdfOpenFailed: '无法打开 PDF — 请重试',
      noPayments: '暂无结算记录',
      noMatches: '没有符合筛选条件的结算记录。',
      openPayment: '打开结算',
      sheetTitle: '筛选结算记录',
      statusLabel: '状态',
      netPaidLabel: '实付净额（RM）',
      netPaidPlaceholder: '例如 898',
      applyFilters: '应用筛选',
      clearAndClose: '清除并关闭',
      cardMetaOne: '{n} 个班次 · 签发于 {date}',
      cardMetaMany: '{n} 个班次 · 签发于 {date}',
      signThisWeek: '签署此周',
      metricWages: '工资',
      metricCommission: '提成',
      metricEarlyWithdrawal: '提前提现',
      weekBreakdown: '周明细',
      pvIssuedSunday: '结算单每周日签发',
      colDate: '日期',
      colType: '类型',
      colAmount: '金额',
      netPayable: '应付净额',
      bankRef: '银行参考号：{ref}',
      sign: '签署',
      openPv: '打开结算单',
      metaPaidOn: '已于 {when} 支付',
      metaSignedOn: '已于 {when} 签署',
      metaDisputed: '有争议 — 等待经纪公司处理',
      metaAwaitingSignature: '等待你签署',
      metaAwaitingIssue: '等待经纪公司签发',
      multiOutlet: '{n} 家门店',
      lineWages: '每日工资',
      lineDrinks: '酒水提成',
      lineTips: '小费提成',
      lineOthers: '其他',
      shiftPaidSealed: '已支付 · 已封存',
      shiftSealedSignedPv: '已封存 · 结算单已签署',
      shiftSealedPvUnsigned: '已封存 · 结算单尚未签署',
      perPvWeekBreakdown: '按结算单周明细',
    },
    pv: {
      rowWages: '日薪工资',
      rowOthers: '其他',
      rowDeductions: '扣款',
      total: '合计',
      weekSummary: '本周汇总',
      dayVerified: '已核实',
      dayPending: '待审核',
      dayDisputed: '有异议',
      dayDeducted: '已扣款',
      verifiedCount: '已核实 {n} 天',
      tapHint: '点击酒水或小费金额可在结算页提出异议 — {red}金额表示已有未结异议。',
      tapHintRed: '红色',
      disputeOpen: '异议处理中',
      disputeBannerBody: '经纪公司正在复核被标记的金额 — 详情请见结算页。',
      pendingYourReview: '待你审阅',
      waitingForAgency: '等待经纪公司',
      reviewThenSign: '请逐日核对，然后签名确认本周收入。',
      notIssuedYet: '经纪公司尚未发出此结算单 — 你可以先查看，但在他们发出前无需签名。',
      awaitingSignature: '待签名',
      signed: '已签名',
      netPayable: '应付净额',
      payee: '收款人',
      prPersonnel: 'PR 人员',
      drinkTipRecords: '酒水与小费记录',
      hide: '收起',
      details: '详情',
      sourceScan: '扫描收据',
      sourceManual: '自行记录',
      sourceCheckin: '签退时自动封存',
      lineDate: '{y}年{mon}{d}日',
      receiptDetails: '收据详情',
      detailDateTime: '日期与时间',
      detailOutlet: '门店',
      detailReceipt: '收据',
      detailCommission: '佣金',
      matchedToThisPv: '已匹配到此结算单',
      pendingAgencyVerify: '待经纪公司核实',
      yourSignature: '你的签名',
      signaturePending: '待签名',
      signedWithName: '已签名 · {name} — 双方已签 · 转账处理中',
      signedSealed: '已签名 — 双方已签 · 转账处理中',
      notSentYet: '尚未发送给你 — 等待经纪公司',
      signVoucher: '签署结算单',
      paidInBank: '已支付 · {amount} 已到账',
      viewInHistory: '在记录中查看 · 结算记录',
      signSheetHint: '用手指绘制签名 — 签名会保存在结算单上，并打印在 PDF 中。',
      signingAs: '签署人',
      thisAccount: '此账号',
      signatureField: '签名',
      confirmSignature: '确认签名',
      drawSignatureTitle: '请绘制签名',
      drawSignatureBody: '请先用手指在签名区签名，再确认。',
      noVoucherTitle: '暂无可签署的结算单',
      noVoucherBody: '此结算单不在服务器上 — 请返回结算页刷新后重试。',
      notSignedTitle: '未签名',
      notSignedBody: '{reason}\n\n未保存任何内容 — 有信号时请重试。',
      couldNotReachAgency: '无法连接经纪公司。',
    },
    scan: {
      titleEdit: '编辑自行记录',
      titleSelfLogTips: '自行记录小费',
      titleSelfLogDrinks: '自行记录酒水',
      titleScanTips: '扫描小费收据',
      titleScanDrinks: '扫描酒水收据',
      itemNounTip: '小费 / 服务项目',
      itemNounTipPlural: '小费 / 服务项目',
      itemNounDrink: '酒水',
      itemNounDrinkPlural: '酒水',
      subEdit: '编辑后经纪公司会重新核实。',
      subScanWindow: '签到与签退之间扫描的收据计入本班次的结算单。',
      gateTitle: '请先签到',
      gateBody: '请先在出勤页签到，再扫描收据。',
      goToCheckIn: '前往签到',
      activeShift: '当前班次 · {outlet}',
      belongsTo: '归属',
      receiptsLogged: '已记录 {n} 张收据',
      timeIn: '签到 {time}',
      pointAndSnap: '对准收据拍照',
      scanningOcr: '扫描中…正在读取 OCR 字段',
      ocrExtracted: '— OCR 读取结果 —',
      ocrOrderNo: '订单号：{v}',
      ocrDate: '日期：{v}',
      ocrTime: '时间：{v}',
      ocrOutlet: '门店：{v}',
      ocrDetectedAsRead: 'OCR 识别结果 · 按收据原样读取',
      eachPrice: '每件 {price}',
      wasHappyHour: '（原价 {price} · 欢乐时光 −{pct}%）',
      detectedSummary: '{items} 项{noun} · {units} 件 · {total} · 预计佣金 {commission}',
      setQuantityAtLeastOne: '请至少为一个项目设置数量。',
      saving: '保存中…',
      confirmAndLog: '确认并记录收据',
      scanNow: '立即扫描收据',
      manualPill: '手动自行记录',
      keyInAmount: '输入金额 · 由经纪公司核实。',
      ocrMatchesCatalog: 'OCR 读取收据并匹配本门店的 {n} 项{noun}',
      dateIgnored: '已忽略“{raw}” → {parsed} · 与本班次相差 {days} 天（{shift}）',
      ocrLinesOne: '{n} 行',
      ocrLinesMany: '{n} 行',
      showOcrText: '查看 OCR 读到的内容（{lines}）',
      hideOcrText: '隐藏 OCR 读到的内容（{lines}）',
      ocrRawHint: '只有当项目名称出现在以上某一行时才会被识别。如果这里缺少名称或名称有误，问题出在纸质收据或照片上 — 请把收据放平、靠近后重新扫描。',
      notFoundOnScan: '扫描未识别 · 若收据上有请手动添加',
      eachPriceNotRead: '每件 {price} · OCR 未读到此项',
      addItem: '+ 添加',
      onlyAddWhatShows: '只添加收据上确实有的项目 — 经纪公司会对照你的照片核实。',
      pointOcrLists: '对准收据 — OCR 会列出读到的{noun}',
      scanAgainCatch: '再扫描一次，补上 OCR 漏掉的{noun}',
      scanItems: '扫描{noun}',
      scanAgain: '重新扫描',
      ocrDetectedAdjust: 'OCR 已识别 · 调整数量',
      noQtyPrinted: '收据上没有印数量 — 请核对这一项',
      selfLogSummary: '{items} 项{noun} · {units} 件',
      commissionPreview: '佣金预览：',
      tipAmountRm: '小费金额（RM）',
      drinkAmountRm: '酒水金额（RM）',
      proofRetakeTitle: '证明照片 · 重拍即可替换',
      proofRequiredTitle: '证明照片 · 必填',
      proofRetakeHint: '重新拍一张 — 新照片会替换此记录已保存的照片。',
      proofRequiredHint: '拍下收据作为证明 — 经纪公司会据此核实。',
      retakeAgain: '再重拍一次',
      retakePhoto: '重拍照片',
      addAnotherPhoto: '再添加一张照片',
      takeOrAttachPhoto: '拍照 / 上传照片',
      snapToEnableSubmit: '⚠ 拍一张照片后才能提交。',
      noteOptional: '给经纪公司的备注（选填）',
      noteRequired: '给经纪公司的备注（必填）',
      notePlaceholder: '收据上的数量 / 价格 / 日期不清楚？请说明 — 或确认全部一致。',
      updateSelfLog: '更新自行记录',
      submitScanFirst: '提交自行记录 · 请先扫描{noun}',
      writeNoteToSubmit: '填写给经纪公司的备注后才能提交',
      submitSelfLogAmount: '提交自行记录 · {amount}',
      snapProofToSubmit: '拍下证明照片后提交',
      submitSelfLog: '提交自行记录',
      receiptLogged: '收据已记录',
      addedToStatus: '已加入签到页状态 · 待经纪公司核实。',
      belongsToPv: '归属结算单：',
      receiptRef: '收据 {no}',
      orderRef: '订单 {no}',
      scanAnother: '再扫描一张',
      backToCheckIn: '返回签到',
      wrongScanPrefix: '扫错了？签到页 →',
      wrongScanSuffix: '· 待审核的自行记录可以编辑或删除。',
      backToAttendance: '返回出勤',
      ocrUnavailable: '手机端 OCR 需要开发版应用。照片已保留作为证明 — 请改用自行记录。',
      dateDroppedNote: '它确实读到了“{raw}”（{parsed}），但与本班次（{shift}）相差 {days} 天 — 距离太远，不可能是这张收据的日期，因此被丢弃，以免记到错误的周次。',
      noneMatchedWithList: 'OCR 读取了照片，但没有找到 {outlet} 的任何{noun} — 它查找的是：{wanted}。请扫描印有其中项目的收据，或在下方自行记录（照片已保留作为证明）。',
      noneMatched: 'OCR 读取了照片，但没有找到 {outlet} 的任何{noun}。请扫描印有这些项目的收据，或在下方自行记录（照片已保留作为证明）。',
      fieldOrderNo: '订单号',
      fieldDate: '日期',
      fieldTime: '时间',
      andJoin: '、',
      couldNotReadFields: 'OCR 还读不到收据上的{fields} — 请靠近收据的那一部分（放平、避免反光）后重新扫描。已读到的字段会保留。',
      couldNotSave: '保存失败，请重试。',
      setQuantityFirst: '请先设置{noun}的数量。',
      snapProofFirst: '提交前请先拍一张证明照片。',
      setQuantityAtLeastOneNoun: '请至少为一项{noun}设置数量。',
      setAmountFirst: '请先输入金额。',
    },
    errors: {
      backendUnreachable: '无法连接 InnocenZ 服务器 {base}。请确认它是否已启动。',
      requestFailed: '请求失败（{status}）',
      uploadFailed: '上传失败（{status}）',
      pdfExportFailed: 'PDF 导出失败（{status}）',
      excelExportFailed: 'Excel 导出失败（{status}）',
      photoTooLarge: '照片太大 — 请选择 5 MB 以下的照片',
      uploadUnreachable: '上传失败 — 无法与 {base} 完成通信（{detail}）。请检查 Wi-Fi，并确认服务器已启动。',
      networkError: '网络错误',
      notSignedIn: '尚未登录',
      invalidCode: '验证码无效',
      codeExpired: '验证码已过期 — 请重新获取',
      codeAlreadyUsed: '该验证码已被使用',
      codeSendFailed: '无法发送验证码 — 请稍后再试',
      codeCooldown: '请等待 {s} 秒后再获取验证码',
      sameEmail: '这已经是你的电子邮箱',
      samePhone: '这已经是你的手机号',
      emailTaken: '该电子邮箱已被其他账号使用',
      phoneTaken: '该手机号已被其他账号使用',
      noContactChannel: '你的账号没有可接收验证码的手机号或电子邮箱',
      addContactBeforePasswordChange: '请先为账号添加手机号或电子邮箱，再修改密码',
      currentPasswordIncorrect: '当前密码不正确',
      passwordMustDiffer: '新密码不能与当前密码相同',
      changeEmailInSecurity: '请在安全设置中更换电子邮箱',
      changePhoneInSecurity: '请在安全设置中更换手机号',
      setPasswordFirst: '请先设置密码，才能更换登录用的电子邮箱或手机号',
      useForgotPassword: '请在登录页面使用“忘记密码”',
      tooManyRequests: '尝试次数过多，请稍后再试。',
      lockedOut: '尝试次数过多。请在 {m} 分钟后再试。',
      tooManyCodeAttempts: '尝试次数过多 — 请重新获取验证码',
      invalidPhoneNumber: '请输入有效的手机号',
      enterSixDigitCode: '请输入 6 位数验证码',
      invalidEmailAddress: '请输入有效的电子邮箱',
      currentPasswordRequired: '请输入当前密码',
      enterEmailOrPhone: '请输入你的电子邮箱或手机号',
      enterNewContact: '请输入新的电子邮箱或手机号',
      couldNotStartChange: '无法开始本次更改 — 请稍后再试',
      couldNotSendCode: '无法发送验证码',
      cannotChangePasswordHere: '此账号无法在这里修改密码',
      validationFailed: '提交的内容有误 — 请检查后重试',
      internalServerError: '服务器出错 — 请稍后再试',
      unauthorized: '未获授权 — 请重新登录',
      passwordMinLength: '密码至少 {n} 位',
      passwordMaxLength: '密码最多 {n} 位',
    },
    notif: {
      shiftAssignedTitle: '你有新的班次',
      shiftAssignedBody: '你的班次在 {date}。',
      shiftCancelledTitle: '班次已取消',
      shiftCancelledBody: '你已不在 {date} 的这个班次上。',
      shiftWithdrawnTitle: '班次已撤销',
      shiftWithdrawnBody: '{venue} 撤销了 {date} 的班次，你已不在这个班次上。',
      shiftWithdrawnBodyNoVenue: '门店撤销了 {date} 的班次，你已不在这个班次上。',
      leaveApprovedTitle: '病假 / 请假已批准',
      leaveApprovedBody: '经纪公司已批准你的申请 — 本次班次免责且不扣款。',
      leaveRejectedTitle: '病假 / 请假被拒绝',
      leaveRejectedBody: '经纪公司拒绝了你的申请 — 你仍需出勤这个班次。',
      overtimeApprovedTitle: '加班已批准',
      overtimeApprovedBody: '{date} 的 {minutes} 分钟加班已获批准 — {amount} 已列入该周的结算单。',
      overtimeRejectedTitle: '加班未获批准',
      overtimeRejectedBody: '{date} 的 {minutes} 分钟加班未获批准。如认为有误，请联系你的经纪公司。',
      disputeAcceptedTitle: '你的争议已被接受',
      disputeRejectedTitle: '你的争议已被拒绝',
      disputeBody: '{date} 的{component}',
      disputeBodyWithNote: '{date} 的{component} — {note}',
      pvIssuedTitle: '你的结算单已就绪',
      pvIssuedBody: '{start} 至 {end} 这一周。请核对金额，如有出入请提出争议。',
      releasedEarlyTitle: '你被安排提前收工',
      swapRequestTitle: '换班请求 — 需要你的答复',
      joinAcceptedTitle: '经纪公司已接受你的申请',
      joinAcceptedBody: '现在可以为你安排班次了。',
      joinDeclinedTitle: '你的加入申请被拒绝',
      departureApprovedTitle: '你的离开申请已批准',
      departureApprovedBody: '你已不再隶属这家经纪公司。',
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
      discardTitle: '確定不完成就離開？',
      discardBody: '已輸入的內容將遺失，重新開始時需要新的驗證碼。',
      keepGoing: '繼續填寫',
      leave: '離開',
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
      logoAlt: 'InnocenZ 標誌',
    },
    forgot: {
      title: '重設密碼',
      phoneHint: '請輸入帳號的手機號碼。我們會透過 WhatsApp、簡訊和電子郵件向帳號上的聯絡方式傳送驗證碼。',
      byPhone: '手機號',
      byEmail: '電子郵箱',
      emailHint: '請輸入帳號的電子郵箱。我們會透過 WhatsApp、簡訊和電子郵件向帳號上的聯絡方式傳送驗證碼。',
      emailLabel: '電子郵箱',
      sendCode: '傳送驗證碼',
      sending: '傳送中…',
      otpTitle: '輸入驗證碼',
      otpHint: '請輸入 6 位驗證碼，{m} 分鐘內有效。',
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
      codeSentInfo: '如果該帳號存在，我們已透過 WhatsApp、簡訊和電子郵件傳送驗證碼。',
      passwordHint: '為你的帳號設定新密碼，至少 6 位。',
      resetFailed: '無法重設密碼',
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
      bankDetails: '銀行資料',
      bankName: '銀行',
      bankNamePlaceholder: '例如 Maybank',
      bankAccountNo: '帳號',
      bankAccountPlaceholder: '例如 512345678901',
      bankSearchPlaceholder: '搜尋你的銀行',
      bankHint: '經紀公司會將每週付款單轉帳至此帳戶。兩欄清空即可刪除。',
      noBankDetails: '未填寫 — 沒有這項資料，經紀公司無法轉帳給你。',
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
      accountEyebrow: '帳戶',
      editingBadge: '編輯中',
      comcardIcBadge: '照片名片卡 · 身分證',
      floorNickname: '現場暱稱',
      legalIcName: '身分證姓名',
      agencies: '經紀公司',
      selectAgencies: '選擇經紀公司…',
      agencyTied: '經紀公司 · {names}',
      awaitingApproval: '等待審批 · {names}',
      departureWaiting: '離開申請等待 {names} 審批',
      icNumber: '身分證 {ic}',
      agencyLockedJoin: '等待 {names} 審批 — 在他們批准或拒絕前，無法更改經紀公司。',
      agencyLockedLeave: '離開申請等待 {names} 審批 — 在有結果前，無法更改經紀公司。',
      agencyDeparturePending: '{name} · 離開待審批',
      leaveConfirm: '離開 {name}？薪資與班次必須結清，並需對方批准。',
      requestToLeave: '申請離開',
      keep: '保留',
      departureRequested: '已提交離開申請 — 等待 {name} 審批',
      departureFailed: '無法提交離開申請',
      nicknameLength: '現場暱稱需為 2–20 個字元',
      icNameRequired: '請輸入身分證姓名',
      languageRequired: '請至少選擇一種語言',
      emailInvalid: '請輸入有效的電子郵箱',
      emailChangeHint: '請在安全設定中更改',
      leaveEditTitle: '不儲存就離開？',
      leaveEditBody: '未儲存的資料修改將會遺失。',
      keepEditing: '繼續編輯',
      profileSaved: '資料已儲存',
      saveFailed: '無法儲存資料',
      comcardUpdated: '名片卡已更新',
      galleryUnavailable: '無法開啟相簿 — 請重新建置開發版應用（expo run:android）。',
      imageTooLarge: '圖片需小於 5 MB',
      avatarUpdated: '頭像已更新',
      avatarUploadFailed: '無法上傳照片',
      portfolioUploadFailed: '無法上傳作品集照片',
      someImagesSkipped: '部分圖片超過 5 MB，已略過',
      removePhotoTitle: '移除照片？',
      removePhotoBody: '移除作品集照片 {label}？這會從你的資料中刪除它。',
      portfolioRemoveFailed: '無法移除作品集照片',
      savingArrangement: '正在儲存排列…',
      rearrangeFailed: '無法重新排列作品集',
      portfolioRearranged: '作品集已重新排列',
      portfolio: '作品集',
      portfolioDragHint: '長按拖動 · 放開交換',
      portfolioShowcase: '展示照片',
      portfolioCount: '照片 {n} / {total}',
      noLanguages: '尚未新增語言 — 點擊「編輯資料」新增。',
      tier1: '一級',
      tier2: '二級',
      tier3: '三級',
      tier4: '四級',
      tier5: '五級',
      tierServant: '服務生',
      tierCommissionOnly: '純佣金',
      slotTapToSwap: '點擊另一個位置交換 · 再次點擊取消',
      slotDragHint: '長按拖動 · 拖到上下邊緣可捲動 · 放開交換',
      viewerReturn: '返回',
      viewerHint: '雙指縮放或雙擊放大 · 拖動移動 · 點 ✕ 返回 關閉',
      signHere: '用手指在此簽名',
      clearSignature: '清除',
      comcardAge: '年齡 {n}',
      ageSuffix: '歲',
    },
    security: {
      title: '安全',
      changePassword: '修改密碼',
      changePhone: '更換手機號',
      changeEmail: '更換電子郵箱',
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
      passwordMax: '密碼最多 72 位',
      passwordMismatch: '兩次輸入的密碼不一致',
      phoneUpdated: '手機號已更新',
      emailUpdated: '電子郵箱已更新',
      sendOtp: '傳送驗證碼',
      verifyOtp: '驗證驗證碼',
      eyebrow: '帳號',
      intro:
        '此處的每項更改都需要目前密碼和一則驗證碼。同一則驗證碼會傳送到你的 WhatsApp、簡訊和電子郵箱 — 你能看到哪個都可以。',
      currentPhone: '目前：{phone}',
      currentEmail: '郵箱：{email}',
      changePasswordHint:
        '請輸入目前密碼和新密碼。我們會向帳號上的手機和電子郵箱傳送一則驗證碼，輸入驗證碼後新密碼即生效。',
      passwordCodeTitle: '確認新密碼',
      changePhoneHint:
        '請輸入新手機號和你的目前密碼。我們會向新號碼和帳號上的電子郵箱傳送一則驗證碼 — 不會向舊號碼傳送任何訊息。',
      changeEmailHint:
        '請輸入新電子郵箱和你的目前密碼。我們會向新郵箱和帳號上的手機傳送一則驗證碼 — 不會向舊郵箱傳送任何訊息。',
      newMobileNumber: '新手機號碼',
      newEmail: '新電子郵箱',
      newPhoneCodeTitle: '驗證新手機號',
      newEmailCodeTitle: '驗證新電子郵箱',
      codeValidFor: '驗證碼 {m} 分鐘內有效。',
      pendingInvites:
        '有 {n} 個待處理的邀請傳送到了你目前的電子郵箱。更換後將無法接受這些邀請 — 請先接受，或請對方向新郵箱重新傳送邀請。',
      startAgain: '重新開始',
      otpLabel: '驗證碼',
      verifyAndSave: '驗證並儲存',
      channelWhatsapp: 'WhatsApp',
      channelSms: '簡訊',
      channelEmail: '電子郵件',
      channelJoin: ' 和 ',
      sentVia: '透過 {channels} 傳送至 {to}',
      sentPartJoin: '，並',
      sentSummary: '驗證碼已{parts}',
      sentLoggedOnly: '測試模式：驗證碼已寫入伺服器日誌，並未實際傳送。',
      sentNowhere: '驗證碼未能送達。請稍後點擊重新傳送。',
      updatePasswordFailed: '無法更新密碼',
      sendCodeFailed: '無法傳送驗證碼',
      updatePhoneFailed: '無法更新手機號',
      updateEmailFailed: '無法更新電子郵箱',
      deleteAccountFailed: '無法刪除帳號',
      signInAgainBody: '為了帳號安全，請重新登入。',
      signInAgain: '重新登入',
      sessionEnded: '登入已失效，本次沒有做任何更改。',
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
      agency: '經紀公司',
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
      booked: '已排班',
      noShift: '無班次',
      attendanceFailed: '出勤操作失敗',
      viewingEarlier: '正在查看較早的班次 · 點按前往目前班次',
      loadingShift: '正在載入你的班次…',
      idleEmpty: '經紀公司會為你安排班次 — 安排後即可簽到。',
      eventFallback: '班次',
      dayAndDate: '星期與日期',
      locating: '定位中…',
      metresFrom: '距離 {name} {m} 米',
      metresAway: '距離 {m} 米 — 請再靠近一些',
      gpsNote: '只有在距離 {name} {m} 米以內才能簽到。手機僅為本次出勤紀錄分享位置。',
      gpsNoteBypass: '只有在距離 {name} {m} 米以內才能簽到 — 示範期間暫時略過定位。',
      duration: '時長 {d}',
      otEstimate: '加班 {h} 小時（約 {amount}）— 這是我們根據你的簽到簽退時間估算的 · 未傳送給經紀公司，也不計入本次收入。如應支付，請與他們溝通。',
      cancelWarning: '經紀公司指派的班次 — 取消可能影響薪資。',
      reasonPlaceholder: '你為什麼要取消？',
      locationExplainer: 'InnocenZ 僅將你的位置用於一件事 — 證明你簽到時確實在門店。',
      locCheckRadius: '距離門店 50 米內即可簽到',
      locCheckStamp: '簽到與簽退各紀錄一次位置',
      locCheckNoTracking: '絕不進行背景追蹤',
      holding: '按住中 {p}%',
      missingPhotoOne: '有 {n} 筆紀錄缺少照片 — 請點按該列的紅色相機重新拍攝，或刪除該列，然後才能簽退。',
      missingPhotoMany: '有 {n} 筆紀錄缺少照片 — 請點按該列的紅色相機重新拍攝，或刪除該列，然後才能簽退。',
      nothingLogged: '尚未記錄任何項目。請在簽退前掃描收據，或自行記錄至少一筆酒水或小費 — 並附上照片。班次一旦結束，該筆佣金將無法再申報。',
      emptyShiftTitle: '未記錄任何項目就簽退？',
      emptyShiftWarning:
        '本班次您尚未記錄任何酒水或小費。簽退即代表班次結束，之後無法再補登今晚的佣金。確實無項可記錄時才請繼續。',
      emptyShiftConfirm: '確認，仍然簽退',
      locPermissionOff: '定位權限已關閉 — 請允許後再簽到。',
      gpsReadFailed: '無法讀取定位 — 請檢查定位權限後重試。',
      locationDenied: 'InnocenZ 需要定位權限才能在門店為你簽到。請在 設定 > InnocenZ > 位置 中開啟，然後重試。',
      locationDisabled: '本機的定位服務已關閉。請開啟 GPS／定位後重試。',
      locationTimeout: '無法取得定位。請到戶外或窗邊後重試。',
      locationUnknown: '無法讀取你的位置。',
    },
    payment: {
      title: '結算',
      history: '結算紀錄',
      bankNudgeTitle: '填寫你的銀行資料',
      bankNudgeBody: '經紀公司無法轉出這筆錢。請填寫銀行與帳號，付款單才能轉帳給你。',
      bankNudgeAction: '現在填寫',
      lastWeek: '上週',
      thisWeek: '本週',
      lastWeekTitle: '上週',
      thisWeekTitle: '本週',
      lastWeekRange: '上週 {range}',
      verifiedDays: '已核實天數 {n}/7',
      approvedDays: '已批准天數',
      agencyFallback: '經紀公司',
      gridTotal: '合計',
      gridTotalSub: '本週',
      rowWages: '日薪',
      rowDrinks: '酒水',
      rowTips: '小費',
      rowOthers: '其他',
      rowDeductions: '扣款',
      nVerified: '{n} 已核實',
      nPending: '{n} 待處理',
      statusPending: '待處理',
      statusApproved: '已批准',
      statusDisputed: '爭議中',
      statusVerified: '已核實',
      statusDeducted: '已扣除',
      statusPaid: '已付款',
      statusSigned: '已簽名',
      statusSent: '已發出',
      disputeOpen: '爭議處理中 · 經紀公司審核中',
      disputeOpenNamed: '{agency} · 爭議處理中 · 經紀公司審核中',
      disputeBannerHint: '點按任一金額可查看其收據，並在那裡撤回此爭議。',
      tapHint: '點按任一金額可查看其單號、班次與項目，並在那裡提出爭議 · 點按{red}金額可撤回誤報的爭議。',
      redWord: '紅色',
      pvIssuedSunday: '結算單每週日發放 · 合計',
      pvOnDay: '結算單 {day} 發放',
      totalLower: '合計',
      couldNotLoadLastWeek: '無法載入上週資料 — 請檢查網路後下拉刷新。',
      noLastWeekPv: '上週暫無結算單 — 本週結算單將於下週日發放。',
      checkOutToSeal: '請在出勤頁簽退，將今日薪資與佣金封存到本週結算單。',
      reviewSign: '審閱並簽名 · {amount}',
      reviewSignNamed: '審閱並簽名 · {agency} · {amount}',
      whatYouDisputed: '你提出的爭議',
      receiptsThisDay: '當日收據',
      nTotal: '共 {n} 張',
      receiptCounts: '{v} 已核實 · {a} 已批准 · {p} 待處理',
      claimOpen: '處理中',
      claimAccepted: '已接受',
      claimRejected: '已拒絕',
      claimWithdrawn: '已撤回',
      voucherSaid: '結算單金額為 {amount}',
      raisedAt: '提出於 {when}',
      filedWholeDay: '針對整天提出 — 涵蓋下方兩個班次。',
      shiftFallback: '班次',
      shiftTimeUnknown: '班次時間未知',
      inOutWindow: '簽到 {inAt} · 簽退 {outAt} · {window}',
      noOrderNo: '無單號',
      wholeReceipt: '整張收據',
      noReceiptBehind: '此項沒有收據 — 它由你的簽到與簽退時間計算得出。',
      agencyAnswer: '經紀公司：{note}',
      cancelThisDispute: '撤回此爭議',
      cancelling: '撤回中…',
      durationUnknown: '時長未知',
      hours: '{h} 小時',
      hoursMinutes: '{h} 小時 {m} 分鐘',
      minutes: '{m} 分鐘',
      withOvertime: '{base} · 加班 +{m} 分鐘',
      otOnDay: '{day} {mins}',
      otPending: '{parts} — 加班已在簽退時記錄，正在等待經紀公司處理。以上金額未包含這部分。',
      withdrawDisputeTitle: '撤回爭議？',
      disputeThisAmount: '對此金額提出爭議',
      whichOneWrong: '哪一筆有誤？',
      alreadyDisputed: '已提出爭議',
      notReviewedYetShort: '尚未審核',
      selected: '已選擇',
      pickShift: '請選擇你要提出爭議的班次。',
      disputingOf: '正在對當日 {day} 中的 {picked} 提出爭議。',
      whichItem: '哪一項？',
      pickOneItem: '請至少選擇一項。',
      quickReason: '原因',
      noteFollowsItems:
        '根據你勾選的項目自動產生。可直接修改 —— 經紀公司看到的就是這段內容。',
      reasonWrongCommission: '佣金有誤',
      reasonWrongQuantity: '數量有誤',
      reasonCountedTwice: '重複計算',
      reasonMissingFromPv: '結算單中缺少',
      reasonWrongRate: '費率有誤',
      reasonNotMyShift: '不是我的班次',
      reasonOthers: '其他',
      notePlaceholder: '為經紀公司補充說明…',
      attachImages: '附加檔案（圖片）',
      optional: '選填',
      imagesAttachedOne: '已附上 {n} 張圖片作為證據',
      imagesAttachedMany: '已附上 {n} 張圖片作為證據',
      proofOptional: '證據圖片為選填 — 如有收據照片可一併附上。',
      submitting: '提交中…',
      submitDispute: '提交爭議',
      withdrawSub: '誤標了此金額？撤回後它將恢復為已核實。',
      proofCleared: '將清除 {n} 張證據圖片。',
      withdrawing: '撤回中…',
      withdrawDispute: '撤回爭議',
      notDisputedHereTitle: '此處不可提出爭議',
      notDisputedHereBody: '{row} 由你的簽到與簽退時間計算得出，並非來自收據。如有誤，請讓經紀公司更正 {day} 的班次紀錄。',
      notReviewedTitle: '尚未審核',
      notReviewedBody: '經紀公司仍在核對 {day} 的 {row} 收據。審核通過後，你即可在此對該金額提出爭議。',
      openDayFirstTitle: '請先打開該日',
      openDayFirstBody: '該日的金額來自多家經紀公司，因此無法在此把這項爭議匹配到結算單。請打開該日，選擇班次，並在那裡撤回。',
      couldNotCancel: '無法撤回',
      tryAgain: '請重試。',
      cancelConfirmTitle: '撤回此爭議？',
      cancelConfirmBody: '經紀公司將停止審核。如仍有異議，你之後可以再次提出。',
      keepIt: '保留',
      cancelDispute: '撤回爭議',
      pickShiftFirstTitle: '請先選擇班次',
      pickShiftFirstBody: '該日的金額來自多家經紀公司。請打開該日，選擇要提出爭議的班次，然後重試。',
      noVoucherTitle: '暫無可提出爭議的結算單',
      noVoucherLast: '上週的結算單尚未發放 — 暫時沒有可提出爭議的內容。',
      noVoucherThis: '本週的結算單尚未開立 — 請先記錄一個班次，之後才能對其中的金額提出爭議。',
      disputeFailed: '爭議提交失敗',
      nVouchersThisWeek: '本週有 {n} 張結算單',
      multiAgencyHint: '你為多家經紀公司工作。每家分別付款並單獨簽名。',
      notYetNumbered: '尚未編號',
      penaltiesThisWeek: '本週罰款',
      cancelledShift: '已取消的班次',
      pctOfDailyWage: '日薪的 {pct}%',
      ruleMinShifts: '每週最少班次',
      ruleMaxMc: '每月最多病假',
      ruleLate: '每週遲到次數',
      ruleCancellation: '取消班次',
      dayAndDate: '{dow} {d}日',
      stampShort: '{mon}{d}日 {time}',
    },
    history: {
      title: '紀錄',
      shifts: '班次',
      payments: '結算',
      earnedInRange: '所選範圍收入',
      wagesTotal: '工資',
      shiftHistory: '班次紀錄',
      searchPlaceholder: '搜尋工資、銷售、其他、酒水…',
      filterOutlet: '門店',
      filterStatus: '狀態',
      filterDate: '日期',
      anyOutlet: '全部門店',
      anyStatus: '全部狀態',
      anyDate: '全部日期',
      statusCurrent: '本週',
      statusSigned: '已簽署',
      shiftCountOne: '{n} 個班次',
      shiftCountMany: '{n} 個班次',
      weekEarnLine: '收入 {earned} · 工資 {wages}',
      noShiftsInWeek: '該週暫無班次',
      noShiftsMatch: '沒有符合篩選條件的班次',
      resetFilters: '重置篩選',
      totalPayout: '{amount} 總收入',
      cancelledNoPayout: '班次已取消 — 無收入',
      metricWages: '工資',
      metricOthers: '其他',
      pickDateFirst: '請先選擇日期',
      tapToChoose: '點按選擇',
      fromTime: '開始時間',
      toTime: '結束時間',
      done: '完成',
      calLegendWorked: '已出勤 · 有紀錄',
      calLegendNote: '可選至今天為止的任意日期 · 無紀錄的日期不會顯示內容。',
      weekTitleCurrent: '本週 · {range}',
      tabCurrentWeek: '本週',
      tabPayrollWeeks: '薪資週',
      noPayrollWeeksYet: '暫無薪資週 — 代理開具首張付款憑證後會顯示在這裡。',
      weekTitlePayroll: '薪資週 · {range}',
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
      stampAm: '{y}年{mon}{d}日 上午 {time}',
      stampPm: '{y}年{mon}{d}日 下午 {time}',
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
      dateLine: '{y}年{mon}{d}日 {dow}',
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
      dateTopbar: '{mon}{d}日 {dow}',
      dateDayMonth: '{mon}{d}日',
      sealedPendingPv: '已封存 · 結算單待發放',
    },
    receipt: {
      captionDay: '{d}日 {dow}',
      captionVerified: '{n} 項已核實',
      captionApproved: '{n} 項已批准',
      captionOfOne: '共 {total} 項：{parts}',
      captionOfMany: '共 {total} 項：{parts}',
      captionWaiting: '{n} 項待經紀公司處理',
      captionWaitingOn: '{n} 項待經紀公司處理（{days}）',
      presetWrongCommission: '佣金有誤',
      presetWrongQuantity: '數量有誤',
      presetCountedTwice: '重複計算',
      presetMissingFromPv: '結算單中缺失',
      presetWrongRate: '費率有誤',
      presetNotMyShift: '不是我的班次',
      presetOthers: '其他',
      statusPending: '待審核',
      statusApproved: '已批准',
      statusDisputed: '有異議',
      statusVerified: '已核實',
      statusDeducted: '已扣款',
      scannedThisShift: '本班次已掃描的收據',
      groupTipsService: '小費 / 服務',
      pictureOne: '{n} 張照片',
      pictureMany: '{n} 張照片',
      itemLoggedOne: '已記錄 {n} 項',
      itemLoggedMany: '已記錄 {n} 項',
    },
    evidence: {
      kindWages: '日薪',
      kindOthers: '加班 / 其他',
      kindDeductions: '扣款',
      sourceScanned: '已掃描',
      sourceSelfLogged: '自行記錄',
      sourceSealed: '簽退時封存',
      dayShort: '{mon}{d}日 {dow}',
      dayLong: '{y}年{mon}{d}日 {dow}',
      notLinked: '未關聯班次',
      noShiftNote: '這筆紀錄是在沒有開班的情況下登記的，因此沒有簽到紀錄可顯示。下方的收據仍是憑證。',
      shiftTimesUnavailable: '目前無法取得班次時間。下方的收據仍是憑證。',
      shiftFallback: '班次',
      expandA11y: '{title} — 點擊查看簽到、收據與項目',
      tapForDetails: '點擊查看詳情',
      shiftWas: '原定時間',
      youCancelled: '你取消的時間',
      noticeGiven: '提前通知',
      feeBand: '費用檔次',
      feePctOfShift: '本班次的 {pct}%',
      feePctWithRm: '本班次的 {pct}% · RM {rm}',
      shiftEnd: '班次結束',
      stillOnDuty: '仍在值班',
      durationWithOtRecorded: '{base} · 已記錄加班 +{ot} 分鐘',
      timeNotSet: '未設定時間',
      notRecorded: '未記錄',
      noticeSpanHoursMinutes: '{h} 小時 {m} 分',
      noticeSpanHours: '{h} 小時',
      noticeSpanMinutes: '{m} 分',
      noticeBefore: '班次開始前 {span}',
      noticeAfter: '班次開始後 {span}',
      hint: '構成這個金額的全部明細。請用紙本收據核對訂單號。',
      mismatch: '此清單合計為 {listed}，但表格顯示 {grid}。請回報此問題 — 不要簽名確認。',
      openDisputeWholeDay: '你有一項未結的爭議涵蓋這一整天 — 下方每個班次都包含在內。',
      nothingLogged: '這一天沒有任何紀錄。',
      tagDisputed: '有爭議',
      tagVerified: '已核實',
      tagSettled: '已結清',
      noOrderNo: '無訂單號',
      printedOn: '列印於 {date}',
      printedAt: '列印於 {date} {time}',
      waitingOnAgency: '等待經紀公司處理',
      openPhotoA11y: '全螢幕檢視收據照片',
      shiftSubtotal: '班次小計 · {amount}',
      disputeAmount: '對此金額提出爭議',
    },
    swaps: {
      header: '門店換班請求',
      fromFallback: '你的門店',
      toFallback: '新門店',
      hint: '只有你同意後，班次才會改到該門店。',
      decline: '婉拒',
      approve: '同意',
      sending: '傳送中…',
      loadFailed: '無法載入你的換班請求',
      respondFailed: '無法傳送你的回覆',
    },
    payHistory: {
      heading: '結算紀錄',
      filter: '篩選',
      searchPlaceholder: '搜尋結算單號、門店、週次、銀行參考號…',
      outletLabel: '門店',
      anyOutlet: '所有門店',
      fromTime: '起始時間',
      toTime: '結束時間',
      chipAll: '全部',
      chipToSign: '待簽署',
      statusPaid: '已支付',
      statusSigned: '已簽署',
      statusPending: '待處理',
      clearAllFilters: '清除所有篩選',
      weeks: '週數',
      totalNet: '淨額合計',
      paidSummary: '{n} 週已支付 · {amount}',
      signedSummary: '{n} 週已簽署 · {amount}',
      excelOpening: 'Excel 正在瀏覽器中開啟 — 請查看下載內容',
      excelOpenFailed: '無法開啟 Excel — 請重試',
      excelDownloaded: '結算單 Excel 已下載',
      excelDownloadFailed: '無法下載 Excel — 請重試',
      pdfDownloading: 'PDF 下載中 — 請從通知欄開啟',
      voucherOpenFailed: '無法開啟結算單 — 請重試',
      pdfOpened: '結算單 PDF 已開啟',
      pdfOpenFailed: '無法開啟 PDF — 請重試',
      noPayments: '暫無結算紀錄',
      noMatches: '沒有符合篩選條件的結算紀錄。',
      openPayment: '開啟結算',
      sheetTitle: '篩選結算紀錄',
      statusLabel: '狀態',
      netPaidLabel: '實付淨額（RM）',
      netPaidPlaceholder: '例如 898',
      applyFilters: '套用篩選',
      clearAndClose: '清除並關閉',
      cardMetaOne: '{n} 個班次 · 簽發於 {date}',
      cardMetaMany: '{n} 個班次 · 簽發於 {date}',
      signThisWeek: '簽署此週',
      metricWages: '工資',
      metricCommission: '提成',
      metricEarlyWithdrawal: '提前提現',
      weekBreakdown: '週明細',
      pvIssuedSunday: '結算單每週日簽發',
      colDate: '日期',
      colType: '類型',
      colAmount: '金額',
      netPayable: '應付淨額',
      bankRef: '銀行參考號：{ref}',
      sign: '簽署',
      openPv: '開啟結算單',
      metaPaidOn: '已於 {when} 支付',
      metaSignedOn: '已於 {when} 簽署',
      metaDisputed: '有爭議 — 等待經紀公司處理',
      metaAwaitingSignature: '等待你簽署',
      metaAwaitingIssue: '等待經紀公司簽發',
      multiOutlet: '{n} 家門店',
      lineWages: '每日工資',
      lineDrinks: '酒水提成',
      lineTips: '小費提成',
      lineOthers: '其他',
      shiftPaidSealed: '已支付 · 已封存',
      shiftSealedSignedPv: '已封存 · 結算單已簽署',
      shiftSealedPvUnsigned: '已封存 · 結算單尚未簽署',
      perPvWeekBreakdown: '按結算單週明細',
    },
    pv: {
      rowWages: '日薪工資',
      rowOthers: '其他',
      rowDeductions: '扣款',
      total: '合計',
      weekSummary: '本週彙總',
      dayVerified: '已核實',
      dayPending: '待審核',
      dayDisputed: '有異議',
      dayDeducted: '已扣款',
      verifiedCount: '已核實 {n} 天',
      tapHint: '點擊酒水或小費金額可在結算頁提出異議 — {red}金額表示已有未結異議。',
      tapHintRed: '紅色',
      disputeOpen: '異議處理中',
      disputeBannerBody: '經紀公司正在複核被標記的金額 — 詳情請見結算頁。',
      pendingYourReview: '待你審閱',
      waitingForAgency: '等待經紀公司',
      reviewThenSign: '請逐日核對，然後簽名確認本週收入。',
      notIssuedYet: '經紀公司尚未發出此結算單 — 你可以先查看，但在他們發出前無需簽名。',
      awaitingSignature: '待簽名',
      signed: '已簽名',
      netPayable: '應付淨額',
      payee: '收款人',
      prPersonnel: 'PR 人員',
      drinkTipRecords: '酒水與小費紀錄',
      hide: '收起',
      details: '詳情',
      sourceScan: '掃描收據',
      sourceManual: '自行記錄',
      sourceCheckin: '簽退時自動封存',
      lineDate: '{y}年{mon}{d}日',
      receiptDetails: '收據詳情',
      detailDateTime: '日期與時間',
      detailOutlet: '門店',
      detailReceipt: '收據',
      detailCommission: '佣金',
      matchedToThisPv: '已匹配到此結算單',
      pendingAgencyVerify: '待經紀公司核實',
      yourSignature: '你的簽名',
      signaturePending: '待簽名',
      signedWithName: '已簽名 · {name} — 雙方已簽 · 轉帳處理中',
      signedSealed: '已簽名 — 雙方已簽 · 轉帳處理中',
      notSentYet: '尚未傳送給你 — 等待經紀公司',
      signVoucher: '簽署結算單',
      paidInBank: '已支付 · {amount} 已到帳',
      viewInHistory: '在紀錄中查看 · 結算紀錄',
      signSheetHint: '用手指繪製簽名 — 簽名會儲存在結算單上，並列印在 PDF 中。',
      signingAs: '簽署人',
      thisAccount: '此帳號',
      signatureField: '簽名',
      confirmSignature: '確認簽名',
      drawSignatureTitle: '請繪製簽名',
      drawSignatureBody: '請先用手指在簽名區簽名，再確認。',
      noVoucherTitle: '暫無可簽署的結算單',
      noVoucherBody: '此結算單不在伺服器上 — 請返回結算頁重新整理後再試。',
      notSignedTitle: '未簽名',
      notSignedBody: '{reason}\n\n未儲存任何內容 — 有訊號時請重試。',
      couldNotReachAgency: '無法連線經紀公司。',
    },
    scan: {
      titleEdit: '編輯自行記錄',
      titleSelfLogTips: '自行記錄小費',
      titleSelfLogDrinks: '自行記錄酒水',
      titleScanTips: '掃描小費收據',
      titleScanDrinks: '掃描酒水收據',
      itemNounTip: '小費 / 服務項目',
      itemNounTipPlural: '小費 / 服務項目',
      itemNounDrink: '酒水',
      itemNounDrinkPlural: '酒水',
      subEdit: '編輯後經紀公司會重新核實。',
      subScanWindow: '簽到與簽退之間掃描的收據計入本班次的結算單。',
      gateTitle: '請先簽到',
      gateBody: '請先在出勤頁簽到，再掃描收據。',
      goToCheckIn: '前往簽到',
      activeShift: '目前班次 · {outlet}',
      belongsTo: '歸屬',
      receiptsLogged: '已記錄 {n} 張收據',
      timeIn: '簽到 {time}',
      pointAndSnap: '對準收據拍照',
      scanningOcr: '掃描中…正在讀取 OCR 欄位',
      ocrExtracted: '— OCR 讀取結果 —',
      ocrOrderNo: '訂單號：{v}',
      ocrDate: '日期：{v}',
      ocrTime: '時間：{v}',
      ocrOutlet: '門店：{v}',
      ocrDetectedAsRead: 'OCR 辨識結果 · 按收據原樣讀取',
      eachPrice: '每件 {price}',
      wasHappyHour: '（原價 {price} · 歡樂時光 −{pct}%）',
      detectedSummary: '{items} 項{noun} · {units} 件 · {total} · 預計佣金 {commission}',
      setQuantityAtLeastOne: '請至少為一個項目設定數量。',
      saving: '儲存中…',
      confirmAndLog: '確認並記錄收據',
      scanNow: '立即掃描收據',
      manualPill: '手動自行記錄',
      keyInAmount: '輸入金額 · 由經紀公司核實。',
      ocrMatchesCatalog: 'OCR 讀取收據並比對本門店的 {n} 項{noun}',
      dateIgnored: '已忽略「{raw}」 → {parsed} · 與本班次相差 {days} 天（{shift}）',
      ocrLinesOne: '{n} 行',
      ocrLinesMany: '{n} 行',
      showOcrText: '查看 OCR 讀到的內容（{lines}）',
      hideOcrText: '隱藏 OCR 讀到的內容（{lines}）',
      ocrRawHint: '只有當項目名稱出現在以上某一行時才會被辨識。如果這裡缺少名稱或名稱有誤，問題出在紙本收據或照片上 — 請把收據放平、靠近後重新掃描。',
      notFoundOnScan: '掃描未辨識 · 若收據上有請手動新增',
      eachPriceNotRead: '每件 {price} · OCR 未讀到此項',
      addItem: '+ 新增',
      onlyAddWhatShows: '只新增收據上確實有的項目 — 經紀公司會對照你的照片核實。',
      pointOcrLists: '對準收據 — OCR 會列出讀到的{noun}',
      scanAgainCatch: '再掃描一次，補上 OCR 漏掉的{noun}',
      scanItems: '掃描{noun}',
      scanAgain: '重新掃描',
      ocrDetectedAdjust: 'OCR 已辨識 · 調整數量',
      noQtyPrinted: '收據上沒有印數量 — 請核對這一項',
      selfLogSummary: '{items} 項{noun} · {units} 件',
      commissionPreview: '佣金預覽：',
      tipAmountRm: '小費金額（RM）',
      drinkAmountRm: '酒水金額（RM）',
      proofRetakeTitle: '證明照片 · 重拍即可取代',
      proofRequiredTitle: '證明照片 · 必填',
      proofRetakeHint: '重新拍一張 — 新照片會取代此紀錄已儲存的照片。',
      proofRequiredHint: '拍下收據作為證明 — 經紀公司會據此核實。',
      retakeAgain: '再重拍一次',
      retakePhoto: '重拍照片',
      addAnotherPhoto: '再新增一張照片',
      takeOrAttachPhoto: '拍照 / 上傳照片',
      snapToEnableSubmit: '⚠ 拍一張照片後才能提交。',
      noteOptional: '給經紀公司的備註（選填）',
      noteRequired: '給經紀公司的備註（必填）',
      notePlaceholder: '收據上的數量 / 價格 / 日期不清楚？請說明 — 或確認全部一致。',
      updateSelfLog: '更新自行記錄',
      submitScanFirst: '提交自行記錄 · 請先掃描{noun}',
      writeNoteToSubmit: '填寫給經紀公司的備註後才能提交',
      submitSelfLogAmount: '提交自行記錄 · {amount}',
      snapProofToSubmit: '拍下證明照片後提交',
      submitSelfLog: '提交自行記錄',
      receiptLogged: '收據已記錄',
      addedToStatus: '已加入簽到頁狀態 · 待經紀公司核實。',
      belongsToPv: '歸屬結算單：',
      receiptRef: '收據 {no}',
      orderRef: '訂單 {no}',
      scanAnother: '再掃描一張',
      backToCheckIn: '返回簽到',
      wrongScanPrefix: '掃錯了？簽到頁 →',
      wrongScanSuffix: '· 待審核的自行記錄可以編輯或刪除。',
      backToAttendance: '返回出勤',
      ocrUnavailable: '手機端 OCR 需要開發版應用。照片已保留作為證明 — 請改用自行記錄。',
      dateDroppedNote: '它確實讀到了「{raw}」（{parsed}），但與本班次（{shift}）相差 {days} 天 — 距離太遠，不可能是這張收據的日期，因此被丟棄，以免記到錯誤的週次。',
      noneMatchedWithList: 'OCR 讀取了照片，但沒有找到 {outlet} 的任何{noun} — 它查找的是：{wanted}。請掃描印有其中項目的收據，或在下方自行記錄（照片已保留作為證明）。',
      noneMatched: 'OCR 讀取了照片，但沒有找到 {outlet} 的任何{noun}。請掃描印有這些項目的收據，或在下方自行記錄（照片已保留作為證明）。',
      fieldOrderNo: '訂單號',
      fieldDate: '日期',
      fieldTime: '時間',
      andJoin: '、',
      couldNotReadFields: 'OCR 還讀不到收據上的{fields} — 請靠近收據的那一部分（放平、避免反光）後重新掃描。已讀到的欄位會保留。',
      couldNotSave: '儲存失敗，請重試。',
      setQuantityFirst: '請先設定{noun}的數量。',
      snapProofFirst: '提交前請先拍一張證明照片。',
      setQuantityAtLeastOneNoun: '請至少為一項{noun}設定數量。',
      setAmountFirst: '請先輸入金額。',
    },
    errors: {
      backendUnreachable: '無法連線 InnocenZ 伺服器 {base}。請確認它是否已啟動。',
      requestFailed: '請求失敗（{status}）',
      uploadFailed: '上傳失敗（{status}）',
      pdfExportFailed: 'PDF 匯出失敗（{status}）',
      excelExportFailed: 'Excel 匯出失敗（{status}）',
      photoTooLarge: '照片太大 — 請選擇 5 MB 以下的照片',
      uploadUnreachable: '上傳失敗 — 無法與 {base} 完成通訊（{detail}）。請檢查 Wi-Fi，並確認伺服器已啟動。',
      networkError: '網路錯誤',
      notSignedIn: '尚未登入',
      invalidCode: '驗證碼無效',
      codeExpired: '驗證碼已過期 — 請重新取得',
      codeAlreadyUsed: '此驗證碼已被使用',
      codeSendFailed: '無法傳送驗證碼 — 請稍後再試',
      codeCooldown: '請等待 {s} 秒後再取得驗證碼',
      sameEmail: '這已經是你的電子郵箱',
      samePhone: '這已經是你的手機號',
      emailTaken: '此電子郵箱已被其他帳號使用',
      phoneTaken: '此手機號已被其他帳號使用',
      noContactChannel: '你的帳號沒有可接收驗證碼的手機號或電子郵箱',
      addContactBeforePasswordChange: '請先為帳號新增手機號或電子郵箱，再修改密碼',
      currentPasswordIncorrect: '目前密碼不正確',
      passwordMustDiffer: '新密碼不能與目前密碼相同',
      changeEmailInSecurity: '請在安全設定中更換電子郵箱',
      changePhoneInSecurity: '請在安全設定中更換手機號',
      setPasswordFirst: '請先設定密碼，才能更換登入用的電子郵箱或手機號',
      useForgotPassword: '請在登入頁面使用「忘記密碼」',
      tooManyRequests: '嘗試次數過多，請稍後再試。',
      lockedOut: '嘗試次數過多。請在 {m} 分鐘後再試。',
      tooManyCodeAttempts: '嘗試次數過多 — 請重新取得驗證碼',
      invalidPhoneNumber: '請輸入有效的手機號',
      enterSixDigitCode: '請輸入 6 位數驗證碼',
      invalidEmailAddress: '請輸入有效的電子郵箱',
      currentPasswordRequired: '請輸入目前密碼',
      enterEmailOrPhone: '請輸入你的電子郵箱或手機號',
      enterNewContact: '請輸入新的電子郵箱或手機號',
      couldNotStartChange: '無法開始本次變更 — 請稍後再試',
      couldNotSendCode: '無法傳送驗證碼',
      cannotChangePasswordHere: '此帳號無法在這裡修改密碼',
      validationFailed: '提交的內容有誤 — 請檢查後重試',
      internalServerError: '伺服器出錯 — 請稍後再試',
      unauthorized: '未獲授權 — 請重新登入',
      passwordMinLength: '密碼至少 {n} 位',
      passwordMaxLength: '密碼最多 {n} 位',
    },
    notif: {
      shiftAssignedTitle: '你有新的班次',
      shiftAssignedBody: '你的班次在 {date}。',
      shiftCancelledTitle: '班次已取消',
      shiftCancelledBody: '你已不在 {date} 的這個班次上。',
      shiftWithdrawnTitle: '班次已撤銷',
      shiftWithdrawnBody: '{venue} 撤銷了 {date} 的班次，你已不在這個班次上。',
      shiftWithdrawnBodyNoVenue: '門店撤銷了 {date} 的班次，你已不在這個班次上。',
      leaveApprovedTitle: '病假 / 請假已批准',
      leaveApprovedBody: '經紀公司已批准你的申請 — 本次班次免責且不扣款。',
      leaveRejectedTitle: '病假 / 請假被拒絕',
      leaveRejectedBody: '經紀公司拒絕了你的申請 — 你仍需出勤這個班次。',
      overtimeApprovedTitle: '加班已批准',
      overtimeApprovedBody: '{date} 的 {minutes} 分鐘加班已獲批准 — {amount} 已列入該週的結算單。',
      overtimeRejectedTitle: '加班未獲批准',
      overtimeRejectedBody: '{date} 的 {minutes} 分鐘加班未獲批准。如認為有誤，請聯繫你的經紀公司。',
      disputeAcceptedTitle: '你的爭議已被接受',
      disputeRejectedTitle: '你的爭議已被拒絕',
      disputeBody: '{date} 的{component}',
      disputeBodyWithNote: '{date} 的{component} — {note}',
      pvIssuedTitle: '你的結算單已就緒',
      pvIssuedBody: '{start} 至 {end} 這一週。請核對金額，如有出入請提出爭議。',
      releasedEarlyTitle: '你被安排提前收工',
      swapRequestTitle: '換班請求 — 需要你的答覆',
      joinAcceptedTitle: '經紀公司已接受你的申請',
      joinAcceptedBody: '現在可以為你安排班次了。',
      joinDeclinedTitle: '你的加入申請被拒絕',
      departureApprovedTitle: '你的離開申請已批准',
      departureApprovedBody: '你已不再隸屬這家經紀公司。',
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
 *
 * ⚠️ Only the sentences /auth/login alone sends. A screen must call
 * `localizeSignInError` (lib/api-error-copy.ts), which falls back to the shared
 * mapping for the limiter 429, the 500 catch-all and the client's own messages —
 * calling this one bare shipped those in English to a 中文 sign-in screen.
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
