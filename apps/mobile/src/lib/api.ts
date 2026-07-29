/**
 * REST client for the InnocenZ backend (the same API the admin portal uses).
 * Base URL comes from EXPO_PUBLIC_API_URL if explicitly set (see
 * tools/scripts/dev-mobile.mjs), otherwise autodetected from Expo's hostUri —
 * the dev machine's LAN IP, which is what physical devices need to reach it.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { DeviceFix } from './device-location';

const DEFAULT_BACKEND_PORT = 7777;

function detectApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const loc = (globalThis as { location?: { protocol: string; hostname: string } }).location;
  if (Platform.OS === 'web' && loc) {
    return `${loc.protocol}//${loc.hostname}:${DEFAULT_BACKEND_PORT}/api`;
  }

  // Native: the Metro host serving the bundle is the dev machine's LAN IP.
  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0];
  return `http://${host || 'localhost'}:${DEFAULT_BACKEND_PORT}/api`;
}

const API_URL = detectApiUrl(); // e.g. http://localhost:7777/api
const API_BASE = `${API_URL}/v1`;
const API_ORIGIN = API_URL.replace(/\/api$/, '');

/** Absolute URL for backend-served assets like /img/pr/profile/vicky.png */
export function assetUrl(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  if (/^https?:\/\//.test(pathname)) return pathname;
  return `${API_ORIGIN}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
}

export type ApiEnvelope<T> = { success: boolean; message: string; data: T };

export type LoginResult = {
  accessToken: string;
  refreshToken: string;
  expiredAt: number | null;
};

export type MeProfile = {
  /** Legal full name from user_profile.full_name — what admin/agency read. */
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  nationality: string | null;
  gender: string | null;
  race: string | null;
  /** Spoken languages persisted to user_profile.languages. */
  languages: string[] | null;
  idType: string | null;
  idNo: string | null;
  dob: string | null;
  underAgency: boolean | null;
  agencyId: string | null;
  verificationStatus: string | null;
  /** Showcase fields — gallery paths served by the backend /img route. */
  portfolioPhotos: (string | null)[] | null;
  /** Saved auto-generated photo comcard path (`user_profile.comcard_image`). */
  comcardImage: string | null;
  comcardHeightCm: number | null;
  comcardWeightKg: number | null;
};

export type Me = {
  id: string;
  username: string;
  email: string | null;
  phoneNum: string | null;
  profileImage: string | null;
  status: string;
  profile: MeProfile;
  roles: { id: string; roleName: string }[];
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(`Cannot reach the InnocenZ backend at ${API_BASE}. Is it running?`, 0);
  }
  const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!res.ok || !body?.success) {
    throw new ApiError(body?.message ?? `Request failed (${res.status})`, res.status);
  }
  return body.data;
}

export function login(identifier: string, password: string): Promise<LoginResult> {
  const payload = identifier.includes('@')
    ? { email: identifier, password }
    : { phoneNum: identifier, password };
  return request<LoginResult>('/auth/login', { method: 'POST', body: JSON.stringify(payload) });
}

/* ------------------------------------------------------------------ *
 * PR self sign-up (WhatsApp OTP)
 *
 * Agency + outlet accounts verify by EMAIL; only PRs verify by WhatsApp, so
 * these three calls are the PR-only path. The backend half is Build
 * Steps §4B and does NOT exist yet — until it lands these resolve to
 * 404 and SignUpScreen surfaces the error normally.
 *
 * `registerPr` deliberately sends NO roleId. `POST /auth/register`
 * currently takes one from the client while being unauthenticated
 * (auth.routes.ts:12 + auth.schema.ts:29), which lets a caller mint any
 * role. The OTP path must derive the PR role server-side from the
 * verified phone_verification row instead — see Build Steps 4B-4.
 * ------------------------------------------------------------------ */

/** Name + id only — enough to pick an agency during sign-up, nothing more. */
export type PublicAgency = { id: string; name: string };

/**
 * Agency list for the sign-up wizard. Must live under /auth to be reachable:
 * `GET /agency` sits below `v1Router.use(authenticateJWT)` (router/v1.ts:32)
 * so a PR who has no account yet gets a 401 from it. Not built yet — the
 * screen falls back to typing the agency name by hand.
 */
export function fetchPublicAgencies(): Promise<PublicAgency[]> {
  return request<PublicAgency[]>('/auth/agencies');
}

/** Seconds the code stays valid, and how long before Resend is allowed. */
export type OtpSendResult = { expiresInSec: number; resendAfterSec: number };

/** Receipt proving this number passed — handed back to registerPr. */
export type OtpVerifyResult = { verificationId: string };

export function sendPrOtp(phoneNum: string): Promise<OtpSendResult> {
  return request<OtpSendResult>('/auth/otp/send', {
    method: 'POST',
    body: JSON.stringify({ phoneNum, channel: 'whatsapp' }),
  });
}

export function verifyPrOtp(phoneNum: string, code: string): Promise<OtpVerifyResult> {
  return request<OtpVerifyResult>('/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phoneNum, code }),
  });
}

export function registerPr(input: {
  verificationId: string;
  phoneNum: string;
  username: string;
  password: string;
  email?: string;
}): Promise<null> {
  return request<null>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      verificationId: input.verificationId,
      phoneNum: input.phoneNum,
      username: input.username,
      password: input.password,
      // Email stays optional — RegisterSchema already allows it to be absent.
      ...(input.email ? { email: input.email } : {}),
    }),
  });
}

export function fetchMe(accessToken: string): Promise<Me> {
  return request<Me>('/auth/me', { headers: { Authorization: `Bearer ${accessToken}` } });
}

export type AgencyMembership = {
  membershipId: string;
  userId: string;
  agencyId: string;
  agencyName: string;
  agencyCode: string;
  subRole: string;
  status: string;
};

/** One agency_pr link, including links still waiting on agency approval. */
export type PrAgencyLink = {
  prId: string;
  userId: string;
  agencyId: string;
  agencyName: string;
  agencyCode: string;
  approveStatus: string;
};

/**
 * This PR's agency links from `agency_pr` — the table the agency roster reads.
 * Unlike /agency/memberships (portal operators in `agency_user`) this includes
 * `pending` links, so the profile can show a request the agency hasn't
 * approved yet.
 */
export function fetchMyAgencyLinks(accessToken: string, userId: string): Promise<PrAgencyLink[]> {
  const query = new URLSearchParams({ userIds: userId }).toString();
  return request<PrAgencyLink[]>(`/agency/pr-links?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/** Every agency the PR can ask to join — real rows, real ids, from `agency`. */
export function fetchAgencies(accessToken: string): Promise<{ id: string; name: string }[]> {
  return request<{ id: string; name: string }[]>('/agency?pageSize=100', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/**
 * Set which agencies this PR wants to be under. New links land as `pending`
 * in agency_pr — the agency still approves before the PR joins its roster.
 */
export function updateMyAgencies(
  accessToken: string,
  agencyIds: string[],
): Promise<unknown> {
  return request<unknown>('/pr/mine/agencies', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ agencyIds }),
  });
}

/** Agencies this PR belongs to — same rows the admin PR list joins on. */
export function fetchMemberships(accessToken: string, userId: string): Promise<AgencyMembership[]> {
  const query = new URLSearchParams({ userIds: userId, subRole: 'pr' }).toString();
  return request<AgencyMembership[]>(`/agency/memberships?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export type ProfileUpdate = {
  username: string;
  /** Legal full name — persisted to user_profile.full_name (what admin reads). */
  fullName?: string;
  email?: string;
  portfolioPhotos?: (string | null)[];
  comcardHeightCm?: number | null;
  comcardWeightKg?: number | null;
  /** Spoken languages — persisted to user_profile.languages. */
  languages?: string[];
};

export function portfolioSlotsFromProfile(
  photos: (string | null)[] | null | undefined,
  slotCount = 8,
): (string | null)[] {
  const slots: (string | null)[] = Array.from({ length: slotCount }, () => null);
  if (!photos?.length) return slots;
  for (let i = 0; i < Math.min(photos.length, slotCount); i++) {
    const value = photos[i];
    slots[i] = value && String(value).trim() ? String(value).trim() : null;
  }
  return slots;
}

export function updateUserProfile(
  accessToken: string,
  userId: string,
  patch: ProfileUpdate,
): Promise<Me> {
  return request<Me>(`/user/${userId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(patch),
  });
}

/** Upload profile image (multipart) — same endpoint the admin portal uses. */
export async function uploadUserProfileImage(
  accessToken: string,
  userId: string,
  file: Blob,
  filename = 'avatar.jpg',
): Promise<Me> {
  const form = new FormData();
  // React Native FormData typings only allow 2 args; web multer needs the filename.
  (form as unknown as { append: (name: string, value: Blob, fileName?: string) => void }).append(
    'profileImage',
    file,
    filename,
  );
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/user/${userId}/profile-image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
  } catch {
    throw new ApiError(`Cannot reach the InnocenZ backend at ${API_BASE}. Is it running?`, 0);
  }
  const body = (await res.json().catch(() => null)) as ApiEnvelope<Me> | null;
  if (!res.ok || !body?.success) {
    throw new ApiError(body?.message ?? `Upload failed (${res.status})`, res.status);
  }
  return body.data;
}

/** Upload one portfolio gallery slot (0–7). Persists path in user_profile.portfolio_photos. */
export async function uploadUserPortfolioPhoto(
  accessToken: string,
  userId: string,
  slot: number,
  file: Blob,
  filename = 'portfolio.jpg',
): Promise<Me> {
  const form = new FormData();
  (form as unknown as { append: (name: string, value: Blob, fileName?: string) => void }).append(
    'portfolioPhoto',
    file,
    filename,
  );
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/user/${userId}/portfolio/${slot}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
  } catch {
    throw new ApiError(`Cannot reach the InnocenZ backend at ${API_BASE}. Is it running?`, 0);
  }
  const body = (await res.json().catch(() => null)) as ApiEnvelope<Me> | null;
  if (!res.ok || !body?.success) {
    throw new ApiError(body?.message ?? `Upload failed (${res.status})`, res.status);
  }
  return body.data;
}

/** Upload the auto-generated photo comcard — stored on user_profile.comcard_image. */
export async function uploadUserComcardImage(
  accessToken: string,
  userId: string,
  file: Blob,
  filename = 'comcard.png',
): Promise<Me> {
  const form = new FormData();
  (form as unknown as { append: (name: string, value: Blob, fileName?: string) => void }).append(
    'comcardImage',
    file,
    filename,
  );
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/user/${userId}/comcard-image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
  } catch {
    throw new ApiError(`Cannot reach the InnocenZ backend at ${API_BASE}. Is it running?`, 0);
  }
  const body = (await res.json().catch(() => null)) as ApiEnvelope<Me> | null;
  if (!res.ok || !body?.success) {
    throw new ApiError(body?.message ?? `Upload failed (${res.status})`, res.status);
  }
  return body.data;
}

/**
 * The PR portal sign-in accepts the digits the prototype uses ("60123456789")
 * while user.phone_num stores E.164-style "+60123456789" — try sensible
 * candidates in order.
 */
/**
 * A special-service / job-posting row as the backend returns it. PR-initiated
 * postings (initiatedBy 'pr') carry the money budget the PR entered; the admin
 * portal reads the same rows.
 */
export type SpecialServiceRecord = {
  id: string;
  title: string;
  category: string;
  description: string | null;
  budget: string | null;
  status: string;
  initiatedBy: string;
  postingPrName: string | null;
  scheduledFor: string | null;
  createdAt: string;
};

export type CreatePrServiceInput = {
  title: string;
  category: string;
  description?: string | null;
  /** Money budget the PR attaches to the service (RM). */
  budget?: number;
  /** ISO datetime for the requested service time. */
  scheduledFor?: string | null;
};

/**
 * Raise a PR service order to the admin. The backend resolves this PR's pr.id
 * from the signed-in account, so the client never sends it.
 */
export function createPrSpecialService(
  accessToken: string,
  input: CreatePrServiceInput,
): Promise<SpecialServiceRecord> {
  return request<SpecialServiceRecord>('/special-service', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ ...input, initiatedBy: 'pr' }),
  });
}

/** This PR's own service orders — the same rows the admin portal shows. */
export function fetchMySpecialServices(accessToken: string): Promise<SpecialServiceRecord[]> {
  return request<SpecialServiceRecord[]>('/special-service/mine', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/**
 * The rate card resolved for this PR's tier at the shift's outlet (per-shift
 * override folded over the outlet workspace default). Numeric fields stay as the
 * backend's fixed(2) strings — parse like `payPerHour`. Null when the outlet has
 * no workspace/tier row configured; `overridden` flags a per-shift override.
 */
export type ShiftAssignmentRate = {
  wagePerHour: string | null;
  /** Normal-hour drink commission %. */
  drinkPct: string;
  /** Happy-hour drink commission % (null → use drinkPct in HH too). */
  happyHourDrinkPct: string | null;
  tipPct: string;
  otAfterHours: string | null;
  targetSalesRm: string | null;
  /** 'HH:MM' or '' when the outlet set no happy-hour window. */
  happyHourStart: string;
  happyHourEnd: string;
  overridden: boolean;
};

/** One drink on the shift outlet's menu (from outlet_drink_menu). */
export type OutletDrinkItem = {
  /** Menu slug — the mobile self-log keys quantities on it. */
  id: string;
  name: string;
  priceRm: string;
  /**
   * Catalog section — 'drink' | 'service' | 'tip' (outlet_drink_menu.category).
   * Splits the Drinks scan list from the Tips/Service scan list. Optional so an
   * older backend that doesn't send it yet still works (treated as 'drink').
   */
  category?: string | null;
};

/** One of this PR's shift assignments, with the shift + outlet context. */
export type ShiftAssignmentRecord = {
  id: string;
  status: string;
  payAmount: string;
  /**
   * Cancel / MC-leave reason (the reused shift_assignment.notes column). A
   * rejected leave request comes back prefixed '[Leave rejected] '.
   */
  notes: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  /** Shift day as YYYY-MM-DD. */
  shiftDate: string;
  slot: string | null;
  eventName: string | null;
  payPerHour: string;
  outletName: string | null;
  /** The shift outlet's address (composed from its address columns via FK). */
  outletAddress: string | null;
  /** Venue pin off the outlet FK — null until the outlet drops its pin. */
  outletLat: number | null;
  outletLng: number | null;
  outletGeoFenceRadiusM: number;
  /** This PR's tier (pr_tier enum), e.g. 'tier_5' / 'commission_only'. */
  tier: string;
  /** Resolved rate card for this PR's tier at this outlet, or null if unset. */
  rate: ShiftAssignmentRate | null;
  /** The shift outlet's real drink menu (empty when no workspace menu). */
  drinkMenu: OutletDrinkItem[];
};

/** This PR's shift assignments (mobile Shifts screen), scoped server-side. */
export function fetchMyShiftAssignments(accessToken: string): Promise<ShiftAssignmentRecord[]> {
  return request<ShiftAssignmentRecord[]>('/shift-assignment/mine', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/**
 * Stamp check-in on one of this PR's own assignments (Check-In screen). The
 * backend sets check_in_at server-side and verifies the assignment is the
 * caller's, so the client sends only the assignment id and — when the phone
 * could read one — its GPS fix.
 *
 * The fix is the phone's CLAIM, not a verdict: the backend recomputes the
 * metres itself from the outlet's saved pin and answers 422 with a readable
 * message ("You are 137 m from the venue...") when the PR is outside the
 * fence. That message is what `request` throws, so screens can show it as-is.
 *
 * `fix` is optional so an outlet that has not dropped its map pin yet still
 * works. Once that outlet HAS a pin, a check-in with no fix is refused.
 */
export function checkInShiftAssignment(
  accessToken: string,
  assignmentId: string,
  fix?: DeviceFix,
): Promise<ShiftAssignmentRecord> {
  return request<ShiftAssignmentRecord>(`/shift-assignment/mine/${assignmentId}/check-in`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(fix ?? {}),
  });
}

/**
 * Stamp check-out (seals the assignment as completed) — see checkInShiftAssignment.
 * The fix is RECORDED but never blocks: a PR who has already worked the shift
 * must always be able to close it, even from the car park.
 */
export function checkOutShiftAssignment(
  accessToken: string,
  assignmentId: string,
  fix?: DeviceFix,
): Promise<ShiftAssignmentRecord> {
  return request<ShiftAssignmentRecord>(`/shift-assignment/mine/${assignmentId}/check-out`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(fix ?? {}),
  });
}

/**
 * Cancel one of this PR's own upcoming assignments with a required reason. The
 * backend flips it to 'cancelled' and stores the reason so the agency is
 * notified. Fails for a shift already checked in or completed.
 */
export function cancelMyShiftAssignment(
  accessToken: string,
  assignmentId: string,
  reason: string,
): Promise<ShiftAssignmentRecord> {
  return request<ShiftAssignmentRecord>(`/shift-assignment/mine/${assignmentId}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ reason }),
  });
}

/**
 * An outlet swap the PR's agency has proposed: work a different outlet's shift
 * on the same night. Nothing moves until the PR approves — `pending_pr` is the
 * only live state, the other three are terminal.
 */
export type OutletSwapRecord = {
  id: string;
  assignmentId: string;
  status: 'pending_pr' | 'approved' | 'declined' | 'cancelled';
  /** The agency's reason for the move, shown to the PR. */
  agencyNote: string | null;
  prNote: string | null;
  respondedAt: string | null;
  createdAt: string;
  /** Where they are now. */
  fromOutletName: string | null;
  fromSlot: string | null;
  /** Where they would go. Same night — the backend refuses a date change. */
  toOutletName: string | null;
  toSlot: string | null;
  toEventName: string | null;
  /** Destination shift day as YYYY-MM-DD. */
  toShiftDate: string;
};

/** Outlet swaps addressed to this PR, scoped server-side by pr.id. */
export function fetchMyOutletSwaps(accessToken: string): Promise<OutletSwapRecord[]> {
  return request<OutletSwapRecord[]>('/outlet-swap/mine', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/**
 * Accept the move. This is the only call that changes the roster: the backend
 * repoints the PR's shift assignment at the destination shift inside one
 * transaction. It can still refuse — 409 when the destination filled up while
 * this screen was open, or when the request was already answered — so the
 * caller must surface the message rather than assume success.
 */
export function approveOutletSwap(
  accessToken: string,
  swapId: string,
  note?: string,
): Promise<OutletSwapRecord> {
  return request<OutletSwapRecord>(`/outlet-swap/mine/${swapId}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(note ? { note } : {}),
  });
}

/** Turn the move down — the PR stays on their original shift. */
export function declineOutletSwap(
  accessToken: string,
  swapId: string,
  note?: string,
): Promise<OutletSwapRecord> {
  return request<OutletSwapRecord>(`/outlet-swap/mine/${swapId}/decline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(note ? { note } : {}),
  });
}

/**
 * File an MC/leave request on one of this PR's own upcoming assignments. Unlike
 * cancel this is not immediate: the row goes to 'leave_pending' (reason stored
 * for the agency) until the agency approves (excused, no penalty) or rejects
 * (back to 'assigned', notes prefixed '[Leave rejected] ').
 */
export function requestMyShiftLeave(
  accessToken: string,
  assignmentId: string,
  reason: string,
): Promise<ShiftAssignmentRecord> {
  return request<ShiftAssignmentRecord>(`/shift-assignment/mine/${assignmentId}/leave`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ reason }),
  });
}

/**
 * One earning entry on the PR's current-week voucher (reused
 * payment_voucher_line). `kind` splits the Payment week grid; `pending` self-logs
 * await agency verification. `commission` is what feeds the voucher net; `sales`
 * is the gross figure shown on the receipt row only.
 */
export type PrReceiptKind = 'wages' | 'drinks' | 'tips' | 'others';
export type PrReceiptSource = 'scan' | 'manual' | 'checkin';

export type PrReceiptLine = {
  id: string;
  kind: PrReceiptKind;
  source: PrReceiptSource;
  item: string;
  quantity: number;
  sales: number;
  commission: number;
  /** Shift day as YYYY-MM-DD. */
  lineDate: string | null;
  outlet: string | null;
  /** ISO timestamp the line was logged. */
  at: string;
  pending: boolean;
  /** Proof photo(s) the PR attached to a self-log — [] when none. */
  proofPhotos: string[];
};

/** The PR's live current-week earnings — powers Check-In STATUS + Payment This-week. */
export type PrCurrentWeek = {
  voucherId: string | null;
  /** Mon–Sun window (YYYY-MM-DD) the server bucketed the lines into. */
  weekStart: string;
  weekEnd: string;
  net: string;
  status: string | null;
  /** Set on the "Last week" voucher when the PR has raised a dispute (§3 F). */
  disputeReason?: string | null;
  disputeNote?: string | null;
  disputedAt?: string | null;
  lines: PrReceiptLine[];
};

/** The four buckets a day's earnings split into — one dispute each, per day. */
export type PrDisputeComponent = 'wages' | 'drinks' | 'tips' | 'others';

/** One recorded dispute row. */
export type PrDispute = {
  id: string;
  disputeDate: string;
  component: PrDisputeComponent;
  reason: string | null;
  note: string | null;
  /** What the voucher said when raised — computed server-side. */
  disputedAmount: string | null;
  proofPhotos: string[] | null;
  outcome: 'accepted' | 'rejected' | 'withdrawn' | null;
  resolutionNote: string | null;
};

/**
 * Raise/withdraw return both halves: the dispute row that was written, and the
 * voucher's own state, which is what the grid header renders.
 */
export type PrDisputeResult = {
  dispute: PrDispute;
  voucher: PrDisputeState;
  /** Withdraw only — how many disputes are still open on the voucher. */
  openDisputes?: number;
};

/** The voucher's dispute state returned by the raise/withdraw endpoints (§3 F). */
export type PrDisputeState = {
  voucherId: string;
  status: string;
  disputeReason: string | null;
  disputeNote: string | null;
  disputedAt: string | null;
};

export type PrReceiptLineInput = {
  kind: PrReceiptKind;
  source: PrReceiptSource;
  item: string;
  quantity?: number;
  sales: number;
  commission: number;
  lineDate?: string;
  outlet?: string;
  /** For wages: the assignment id, so a repeated check-out never double-seals. */
  dedupeRef?: string;
  /** Proof photo(s) for a self-log (downscaled data URLs). Required for drinks. */
  proofPhotos?: string[];
};

export function fetchMyCurrentWeek(accessToken: string): Promise<PrCurrentWeek> {
  return request<PrCurrentWeek>('/payment-voucher/mine/current-week', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/** The PR's previous-week voucher (Payment "Last week") — same shape, real data. */
export function fetchMyLastWeek(accessToken: string): Promise<PrCurrentWeek> {
  return request<PrCurrentWeek>('/payment-voucher/mine/last-week', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/**
 * Signed/paid vouchers for History (Payment history + past payroll weeks).
 * Empty when the PR has no completed PVs — never invents demo amounts.
 */
export type PrHistoryVoucher = {
  voucherId: string;
  weekStart: string | null;
  weekEnd: string | null;
  net: string;
  wages: string;
  status: string;
  outlet: string | null;
  bankRef: string | null;
  issuedDate: string | null;
  prSignedAt: string | null;
  paidAt: string | null;
  lines: PrReceiptLine[];
};

export function fetchMyPaymentHistory(accessToken: string): Promise<PrHistoryVoucher[]> {
  return request<PrHistoryVoucher[]>('/payment-voucher/mine/history', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function addMyReceiptLine(
  accessToken: string,
  input: PrReceiptLineInput,
): Promise<PrReceiptLine> {
  return request<PrReceiptLine>('/payment-voucher/mine/lines', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
}

/** One item on a whole scanned/self-logged receipt. */
export type PrReceiptItemInput = {
  kind: PrReceiptKind;
  /** Catalog category from outlet_drink_menu: 'drink' | 'service' | 'tip'. */
  category: 'drink' | 'service' | 'tip';
  item: string;
  quantity: number;
  sales: number;
  commission: number;
};

/** One whole receipt: OCR header facts + item lines, saved in one call. */
export type PrReceiptSubmitInput = {
  source: PrReceiptSource;
  /** The active shift assignment this receipt belongs to. */
  assignmentId?: string;
  /** The order number OCR read off the paper (e.g. ORD0389). */
  orderNo?: string;
  receiptDate?: string;
  receiptTime?: string;
  /** PR's note to the agency (required for self-logs — what was unclear). */
  note?: string;
  outlet?: string;
  proofPhotos?: string[];
  items: PrReceiptItemInput[];
};

export type PrReceiptRecord = {
  id: string;
  /** Database-generated unique running number: RCP-000001, … */
  receiptNo: string;
  orderNo: string | null;
  receiptDate: string | null;
  receiptTime: string | null;
  source: string;
  lines: PrReceiptLine[];
};

/**
 * Saves ONE whole receipt (payment_voucher_receipt + FK-linked lines) on the
 * PR's current-week voucher. A duplicate order number answers 409 with a
 * readable message ("Receipt ORD0389 is already logged…").
 */
export function submitMyReceipt(
  accessToken: string,
  input: PrReceiptSubmitInput,
): Promise<PrReceiptRecord> {
  return request<PrReceiptRecord>('/payment-voucher/mine/receipts', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
}

export function updateMyReceiptLine(
  accessToken: string,
  lineId: string,
  input: Partial<PrReceiptLineInput>,
): Promise<PrReceiptLine> {
  return request<PrReceiptLine>(`/payment-voucher/mine/lines/${lineId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
}

export function deleteMyReceiptLine(accessToken: string, lineId: string): Promise<null> {
  return request<null>(`/payment-voucher/mine/lines/${lineId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/**
 * Raise (or amend) a dispute on one of the PR's own issued vouchers so the
 * agency payroll page can verify/reject it (§3 F). Persists on the reused
 * payment_voucher dispute columns — no new table.
 */
export function raiseMyDispute(
  accessToken: string,
  voucherId: string,
  input: {
    /** The tapped cell's day, yyyy-MM-dd. */
    disputeDate: string;
    component: PrDisputeComponent;
    reason: string;
    note?: string;
    /** Optional — the sheet says so, and the server agrees since 0064. */
    proofPhotos?: string[];
  },
): Promise<PrDisputeResult> {
  return request<PrDisputeResult>(`/payment-voucher/mine/${voucherId}/dispute`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
}

/**
 * Withdraw ONE dispute — the cell the PR tapped, not the whole voucher.
 *
 * Addressed by day + component because that is what the grid already knows; the
 * voucher only returns to review once nothing on it is still contested.
 */
export function withdrawMyDispute(
  accessToken: string,
  voucherId: string,
  input: { disputeDate: string; component: PrDisputeComponent },
): Promise<PrDisputeResult> {
  return request<PrDisputeResult>(`/payment-voucher/mine/${voucherId}/dispute/withdraw`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
}

export function phoneCandidates(rawId: string): string[] {
  const raw = rawId.trim();
  if (raw.includes('@')) return [raw];
  const digits = raw.replace(/[^\d]/g, '');
  const candidates = [raw.startsWith('+') ? raw : `+${digits}`, raw, digits];
  return [...new Set(candidates.filter(Boolean))];
}
