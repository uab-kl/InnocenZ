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
/** Server origin for legacy `/img/…` assets (strip `/api` or `/api/v1` like web). */
const API_ORIGIN = API_URL.replace(/\/$/, '').replace(/\/api(\/v1)?$/, '');

/** Same blank placeholder the backend / web treat as “no photo”. */
const DEFAULT_PROFILE_IMAGE = '/img/blank-profile-picture.png';

/** Cached from `/auth/me` / user responses so the phone does not need Expo env. */
let cachedR2PublicBase: string | null = null;

/** Remember R2 public base from any API payload that includes `r2PublicUrl`. */
export function noteR2PublicUrl(payload: { r2PublicUrl?: string | null } | null | undefined): void {
  const raw = payload?.r2PublicUrl?.trim();
  if (raw) cachedR2PublicBase = raw.replace(/\/$/, '');
}

/** The R2 public base noted from API responses so far (no trailing slash). */
export function notedR2PublicBase(): string | null {
  return cachedR2PublicBase;
}

/** Public R2 base — env first, then value learned from the backend. */
export function r2PublicBase(): string | null {
  const fromEnv = process.env.EXPO_PUBLIC_R2_PUBLIC_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (cachedR2PublicBase) return cachedR2PublicBase;
  const fromExtra = Constants.expoConfig?.extra?.r2PublicUrl;
  if (typeof fromExtra === 'string' && fromExtra.trim()) {
    return fromExtra.trim().replace(/\/$/, '');
  }
  return null;
}

function isR2ObjectKey(ref: string): boolean {
  return (
    ref.startsWith('user/') ||
    ref.startsWith('agency/') ||
    ref.startsWith('outlet/')
  );
}

/**
 * Absolute URL for a stored image path — same rules as web `apiAssetUrl`.
 * - blank / missing → null (show initials, not the placeholder PNG)
 * - `https://…` / `data:` → as-is
 * - `user/` | `agency/` | `outlet/` (R2 key) → public base + key
 * - `/img/…` (legacy) → API origin + path
 */
export function assetUrl(pathname: string | null | undefined): string | null {
  if (!pathname || pathname === DEFAULT_PROFILE_IMAGE) return null;
  if (/^https?:\/\//.test(pathname) || pathname.startsWith('data:')) return pathname;
  if (isR2ObjectKey(pathname)) {
    const base = r2PublicBase();
    if (!base) {
      console.warn('[assetUrl] R2 public URL unknown; cannot resolve key', pathname);
      return null;
    }
    return `${base}/${pathname}`;
  }
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${API_ORIGIN}${normalized}`;
}

export type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
  /** Present on some public/auth payloads so clients can resolve R2 object keys. */
  r2PublicUrl?: string | null;
};

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
  comcardBustCm: number | null;
  comcardWaistCm: number | null;
  comcardHipCm: number | null;
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
  /** From backend `R2_PUBLIC_URL` — join with `user/…` keys for Image URIs. */
  r2PublicUrl?: string | null;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data: unknown = null,
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
    throw new ApiError(body?.message ?? `Request failed (${res.status})`, res.status, body?.data ?? null);
  }
  // Envelope-level (e.g. public /auth/agencies) — signup has no /auth/me yet.
  noteR2PublicUrl(body);
  if (body.data && typeof body.data === 'object') {
    noteR2PublicUrl(body.data as { r2PublicUrl?: string | null });
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
 * these three calls are the PR-only path. Backend: POST /auth/otp/send|verify
 * + WhatsApp Cloud API (META_WHATSAPP_*) and table phone_verification.
 *
 * `registerPr` deliberately sends NO roleId. `POST /auth/register`
 * currently takes one from the client while being unauthenticated
 * (auth.routes.ts + auth.schema.ts), which lets a caller mint any
 * role. The OTP path derives the PR role server-side from
 * accountType + a verified phone_verification row.
 * ------------------------------------------------------------------ */

/** Name + id (+ optional logo key/url) — enough to pick an agency during sign-up. */
export type PublicAgency = {
  id: string;
  name: string;
  logoImage?: string | null;
  /** Absolute CDN URL resolved right after fetch (signup has no /auth/me yet). */
  logoUrl?: string | null;
};

/**
 * Agency list for the sign-up wizard. Must live under /auth to be reachable:
 * `GET /agency` sits below `v1Router.use(authenticateJWT)` (router/v1.ts:32)
 * so a PR who has no account yet gets a 401 from it.
 *
 * Prefer server-built `logoUrl` (`https://cdn…/agency/{id}/logo/…`); fall back
 * to joining `r2PublicUrl` + `logoImage` key on the client.
 */
export async function fetchPublicAgencies(): Promise<PublicAgency[]> {
  const res = await fetch(`${API_BASE}/auth/agencies?_=${Date.now()}`, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
  }).catch(() => null);
  if (!res) {
    throw new ApiError(`Cannot reach the InnocenZ backend at ${API_BASE}. Is it running?`, 0);
  }
  const body = (await res.json().catch(() => null)) as ApiEnvelope<
    Array<{
      id: string;
      name: string;
      logoImage?: string | null;
      logoUrl?: string | null;
    }>
  > | null;
  if (!res.ok || !body?.success || !Array.isArray(body.data)) {
    throw new ApiError(body?.message ?? `Request failed (${res.status})`, res.status);
  }
  noteR2PublicUrl(body);
  const base = (body.r2PublicUrl ?? cachedR2PublicBase)?.replace(/\/$/, '') || null;
  return body.data.map((a) => {
    const key = a.logoImage?.replace(/^\//, '') || null;
    const fromServer = a.logoUrl?.trim() || null;
    const joined = key && base ? `${base}/${key}` : null;
    return {
      id: a.id,
      name: a.name,
      logoImage: key,
      logoUrl: fromServer || joined || assetUrl(key),
    };
  });
}

/** Step-1 gate: phone + ID must not already belong to an account. */
export type RegisterCheckConflict = { field: 'phone' | 'idNo'; message: string };

export function checkPrRegisterAvailability(
  phoneNum: string,
  idNo: string,
): Promise<{ available: true }> {
  return request<{ available: true }>('/auth/register/check', {
    method: 'POST',
    body: JSON.stringify({ phoneNum, idNo }),
  });
}

/** Seconds the code stays valid, and how long before Resend is allowed. */
export type OtpSendResult = { expiresInSec: number; resendAfterSec: number };

/** Receipt proving this number passed — handed back to register / reset / change-phone. */
export type OtpVerifyResult = { verificationId: string };

export type OtpPurpose = 'signup' | 'forgot_password' | 'change_phone';

export function sendPrOtp(
  phoneNum: string,
  purpose: OtpPurpose = 'signup',
  accessToken?: string | null,
): Promise<OtpSendResult> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return request<OtpSendResult>('/auth/otp/send', {
    method: 'POST',
    headers,
    body: JSON.stringify({ phoneNum, channel: 'whatsapp', purpose }),
  });
}

export function verifyPrOtp(
  phoneNum: string,
  code: string,
  purpose: OtpPurpose = 'signup',
): Promise<OtpVerifyResult> {
  return request<OtpVerifyResult>('/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phoneNum, code, purpose }),
  });
}

/** Forgot password — consume WhatsApp OTP receipt (purpose=forgot_password). */
export function resetPasswordWithOtp(
  phoneNum: string,
  verificationId: string,
  password: string,
): Promise<null> {
  return request<null>('/auth/password/reset-otp', {
    method: 'POST',
    body: JSON.stringify({ phoneNum, verificationId, password }),
  });
}

/** Signed-in password change (current password — no OTP). */
export function changePassword(
  accessToken: string,
  currentPassword: string,
  newPassword: string,
): Promise<null> {
  return request<null>('/auth/password/change', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

/** Signed-in phone change — OTP on the new number (purpose=change_phone). */
export function changePhoneWithOtp(
  accessToken: string,
  phoneNum: string,
  verificationId: string,
): Promise<Me> {
  return request<Me>('/auth/phone/change', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ phoneNum, verificationId }),
  });
}

/** Soft-delete own account (status=inactive + PII scrub). Requires current password. */
export function deleteOwnAccount(
  accessToken: string,
  userId: string,
  password: string,
): Promise<{ id: string; status: string }> {
  return request<{ id: string; status: string }>(`/user/${userId}/delete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ password }),
  });
}

export type RegisterPrProfile = {
  fullName: string;
  nationality: string;
  idType: string;
  idNo: string;
  dob: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  postcode: string;
  state: string;
  country: string;
  comcardHeightCm?: number;
  comcardWeightKg?: number;
  comcardBustCm?: number;
  comcardWaistCm?: number;
  comcardHipCm?: number;
  languages: string[];
};

export function registerPr(input: {
  verificationId: string;
  phoneNum: string;
  username: string;
  password: string;
  email?: string;
  /** Optional agency join request — creates agency_pr by user_id (pending). */
  agencyId?: string;
  /** Identity + address → user_profile (required for public PR sign-up). */
  profile: RegisterPrProfile;
  /** Optional avatar — register route already accepts multipart `profileImage`. */
  profileImage?: { file: Blob; filename: string };
}): Promise<null> {
  const fields = {
    accountType: 'pr',
    verificationId: input.verificationId,
    phoneNum: input.phoneNum,
    username: input.username,
    password: input.password,
    ...(input.email ? { email: input.email } : {}),
    ...(input.agencyId ? { agencyId: input.agencyId } : {}),
    ...input.profile,
  };

  if (!input.profileImage) {
    return request<null>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(fields),
    });
  }

  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value == null) continue;
    // Arrays/objects must stay JSON — FormData stringifies them as useless text.
    form.append(
      key,
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : JSON.stringify(value),
    );
  }
  (form as unknown as { append: (name: string, value: Blob, fileName?: string) => void }).append(
    'profileImage',
    input.profileImage.file,
    input.profileImage.filename,
  );

  return (async () => {
    let res: Response;
    try {
      // Do not set Content-Type — RN/fetch must attach the multipart boundary.
      res = await fetch(`${API_BASE}/auth/register`, { method: 'POST', body: form });
    } catch {
      throw new ApiError(`Cannot reach the InnocenZ backend at ${API_BASE}. Is it running?`, 0);
    }
    const body = (await res.json().catch(() => null)) as ApiEnvelope<null> | null;
    if (!res.ok || !body?.success) {
      throw new ApiError(body?.message ?? `Request failed (${res.status})`, res.status);
    }
    return body.data;
  })();
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
  /** Operational pr row when present; null if account-only membership. */
  prId: string | null;
  userId: string;
  agencyId: string;
  agencyName: string;
  agencyCode: string;
  approveStatus: string;
  /**
   * This agency's grading of us (`agency_pr.tier`), e.g. 'tier_3'. Null until
   * they grade us. Per-membership — two agencies may grade the same PR
   * differently and both are correct, so the profile shows whose tier is whose
   * rather than picking one and calling it "the" tier.
   */
  tier: string | null;
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

/**
 * Every active agency the PR can ask to join.
 * Uses `/auth/agencies` (id + name only) — `GET /agency` is admin/agency-only
 * after RBAC, so a PR JWT gets 403 there and the profile picker stayed empty.
 */
export function fetchAgencies(_accessToken?: string): Promise<{ id: string; name: string }[]> {
  return fetchPublicAgencies();
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
  /** One-time identity fill when register left id_no empty. */
  idType?: string;
  idNo?: string;
  dob?: string;
  portfolioPhotos?: (string | null)[];
  comcardHeightCm?: number | null;
  comcardWeightKg?: number | null;
  comcardBustCm?: number | null;
  comcardWaistCm?: number | null;
  comcardHipCm?: number | null;
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

function meFromUpload(res: Response, body: ApiEnvelope<Me> | null): Me {
  if (!res.ok || !body?.success || !body.data) {
    throw new ApiError(body?.message ?? `Upload failed (${res.status})`, res.status);
  }
  noteR2PublicUrl(body.data);
  return body.data;
}

/** RN file descriptor from expo-image-picker — not a real Blob. */
type NativeUploadFile = { uri: string; name?: string; type?: string };

/**
 * Append a photo for multipart upload.
 * - Native: FormData MUST receive `{ uri, name, type }` with only 2 args.
 *   Passing a 3rd filename (web Blob style) makes okhttp abort → "Network request failed"
 *   which we previously mislabeled as "Cannot reach backend".
 * - Web: File/Blob + optional filename as the 3rd argument.
 */
function appendMultipartFile(
  form: FormData,
  field: string,
  file: Blob | NativeUploadFile,
  filename: string,
): void {
  const native =
    file &&
    typeof file === 'object' &&
    'uri' in file &&
    typeof (file as NativeUploadFile).uri === 'string'
      ? (file as NativeUploadFile)
      : null;

  if (native) {
    const safeName = sanitizeUploadFilename(native.name || filename);
    form.append(field, {
      uri: native.uri,
      name: safeName,
      type: native.type || guessMime(safeName),
    } as unknown as Blob);
    return;
  }

  (
    form as unknown as {
      append: (name: string, value: Blob, fileName?: string) => void;
    }
  ).append(field, file as Blob, sanitizeUploadFilename(filename));
}

function sanitizeUploadFilename(name: string): string {
  const base = name.trim() || 'photo.jpg';
  // Multer only allows jpg/png/webp — iPhone HEIC names must be remapped.
  if (/\.(heic|heif)$/i.test(base)) return base.replace(/\.(heic|heif)$/i, '.jpg');
  if (!/\.(jpe?g|png|webp)$/i.test(base)) return `${base.replace(/\.[^.]+$/, '') || 'photo'}.jpg`;
  return base;
}

function guessMime(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function unreachableBackend(cause: unknown): ApiError {
  const detail =
    cause instanceof Error && cause.message
      ? cause.message
      : typeof cause === 'string'
        ? cause
        : 'network error';
  return new ApiError(
    `Upload failed — could not finish talking to ${API_BASE} (${detail}). Check Wi‑Fi / that the backend is running.`,
    0,
  );
}

/** Upload profile image (multipart) — same endpoint the admin portal uses. */
export async function uploadUserProfileImage(
  accessToken: string,
  userId: string,
  file: Blob,
  filename = 'avatar.jpg',
): Promise<Me> {
  const form = new FormData();
  appendMultipartFile(form, 'profileImage', file, filename);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/user/${userId}/profile-image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
  } catch (e) {
    // Multer's 5 MB cap aborts the request mid-body, which surfaces here as a
    // failed fetch. Reporting that as "cannot reach the backend" sends people
    // hunting their Wi-Fi for a problem that is really the file size.
    const size = (file as { size?: number }).size;
    if (size != null && size > 5 * 1024 * 1024) {
      throw new ApiError('That photo is too large — pick one under 5 MB', 413);
    }
    throw unreachableBackend(e);
  }
  const body = (await res.json().catch(() => null)) as ApiEnvelope<Me> | null;
  return meFromUpload(res, body);
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
  appendMultipartFile(form, 'portfolioPhoto', file, filename);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/user/${userId}/portfolio/${slot}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
  } catch (e) {
    throw unreachableBackend(e);
  }
  const body = (await res.json().catch(() => null)) as ApiEnvelope<Me> | null;
  return meFromUpload(res, body);
}

/** Upload the auto-generated photo comcard — stored on user_profile.comcard_image. */
export async function uploadUserComcardImage(
  accessToken: string,
  userId: string,
  file: Blob,
  filename = 'comcard.png',
): Promise<Me> {
  const form = new FormData();
  appendMultipartFile(form, 'comcardImage', file, filename);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/user/${userId}/comcard-image`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
  } catch (e) {
    throw unreachableBackend(e);
  }
  const body = (await res.json().catch(() => null)) as ApiEnvelope<Me> | null;
  return meFromUpload(res, body);
}

/** Server-side 2×2 portfolio comcard (same layout as Profile preview) → R2 key. */
export async function generateUserComcard(
  accessToken: string,
  userId: string,
): Promise<Me> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/user/${userId}/comcard/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (e) {
    throw unreachableBackend(e);
  }
  const body = (await res.json().catch(() => null)) as ApiEnvelope<Me> | null;
  return meFromUpload(res, body);
}

/** Upload NRIC/passport side — stored on user_profile.id_photo_front / id_photo_back. */
export async function uploadUserIdDoc(
  accessToken: string,
  userId: string,
  side: 'front' | 'back',
  file: Blob,
  filename = 'id.jpg',
): Promise<Me> {
  const form = new FormData();
  appendMultipartFile(form, 'idPhoto', file, filename);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/user/${userId}/id-photo/${side}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
  } catch (e) {
    throw unreachableBackend(e);
  }
  const body = (await res.json().catch(() => null)) as ApiEnvelope<Me> | null;
  return meFromUpload(res, body);
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
  /**
   * MC / medical-certificate photos filed with a leave request
   * (shift_assignment.leave_proof_photos jsonb). Null until leave is requested.
   */
  leaveProofPhotos: string[] | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  /**
   * How `payAmount` was arrived at (migration 0097). Null until check-out seals
   * the shift, and on every row sealed before the rule existed.
   *
   * ⚠️ `payAmount` is the EARNED amount — pro-rated by the minutes actually
   * worked — so it is what the PR is owed and what reaches the voucher.
   * `dayRateAmount` is the full rate it was taken from. Display `payAmount`; the
   * rate card is only the forecast, and only until the shift closes.
   * `scheduledMinutes` is also the divisor overtime is priced on, so the phone's
   * OT estimate agrees with what the agency approves.
   */
  dayRateAmount: string | null;
  workedMinutes: number | null;
  scheduledMinutes: number | null;
  payRule: string | null;
  /** Shift day as YYYY-MM-DD. */
  shiftDate: string;
  slot: string | null;
  eventName: string | null;
  /** `shift.event_kind` — 'normal' | 'special'. Never null (DB default). */
  eventKind: string;
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

export type SignedVoucher = {
  id: string;
  status: string;
  /** ISO timestamp the server stamped, not one the phone chose. */
  prSignedAt: string | null;
};

/**
 * Accept one of this PR's own vouchers.
 *
 * Idempotent server-side, so a retry after a dropped response is safe and will
 * not move the signature timestamp. Refuses with 409 while a dispute is open —
 * withdraw it first. Someone else's voucher answers 404.
 */
export function signMyVoucher(
  accessToken: string,
  voucherId: string,
  /** Finger-drawn ink from the sign pad — stored on the voucher, inked into the PDF. */
  signature?: { w: number; h: number; strokes: [number, number][][] },
): Promise<SignedVoucher> {
  return request<SignedVoucher>(`/payment-voucher/mine/${voucherId}/sign`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    ...(signature ? { body: JSON.stringify({ signature }) } : {}),
  });
}

/**
 * The same boxed voucher as a PDF blob — web builds open it in the browser's
 * PDF viewer so web and phone always show the ONE server-rendered document.
 */
export async function fetchMyVoucherPdfBlob(
  accessToken: string,
  voucherId: string,
): Promise<Blob> {
  const res = await fetch(`${API_BASE}/payment-voucher/mine/${voucherId}/export.pdf`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`PDF export failed (${res.status})`);
  return res.blob();
}

/**
 * Downloads the printed PV workbook (the prototype's Excel export layout,
 * rendered server-side from the real voucher + FK agency/PR rows). Web builds
 * save it via a blob link; native builds have no file sink in this APK yet.
 */
export async function fetchMyVoucherExcelBlob(
  accessToken: string,
  voucherId: string,
): Promise<Blob> {
  const res = await fetch(`${API_BASE}/payment-voucher/mine/${voucherId}/export.xlsx`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Excel export failed (${res.status})`);
  return res.blob();
}

export type VoucherExportLinks = {
  /** Absolute URLs the system browser can open — the ticket in the path is the credential. */
  xlsxUrl: string;
  pdfUrl: string;
  printUrl: string;
};

/**
 * Mints a 5-minute download ticket for one of this PR's vouchers, so the
 * phone's browser can open the Excel/print view without a Bearer header (and
 * without ever putting the session token in a URL).
 */
export async function createMyVoucherExportTicket(
  accessToken: string,
  voucherId: string,
): Promise<VoucherExportLinks> {
  const d = await request<{ xlsxPath: string; pdfPath: string; printPath: string }>(
    `/payment-voucher/mine/${voucherId}/export-ticket`,
    { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } },
  );
  return {
    xlsxUrl: `${API_BASE}${d.xlsxPath}`,
    pdfUrl: `${API_BASE}${d.pdfPath}`,
    printUrl: `${API_BASE}${d.printPath}`,
  };
}

/** The closed enum the backend writes — mirrors notification.model.ts. */
export type NotificationKind =
  | 'payment_voucher_issued'
  | 'payment_voucher_dispute_resolved'
  | 'overtime_pending_approval'
  | 'shift_assigned'
  | 'shift_cancelled'
  | 'agency_join_resolved';

export type NotificationRecord = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  payload: Record<string, unknown> | null;
  /** ISO timestamp, or null while unread. */
  readAt: string | null;
  createdAt: string;
};

/**
 * This PR's notifications, newest first.
 *
 * Scoped server-side by the caller's user id — there is no user id in the
 * route, so nothing to scope wrong from here.
 */
export function fetchMyNotifications(accessToken: string): Promise<NotificationRecord[]> {
  return request<NotificationRecord[]>('/notification?limit=50', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

/** Idempotent. A row that is not this PR's answers 404, which `request` throws. */
export function markNotificationRead(
  accessToken: string,
  id: string,
): Promise<NotificationRecord> {
  return request<NotificationRecord>(`/notification/${id}/read`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

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
/**
 * File an MC/leave request. `proofPhotos` (the MC picture) is REQUIRED — the
 * agency reviews it before excusing the shift, and the server rejects a
 * request without one.
 */
export function requestMyShiftLeave(
  accessToken: string,
  assignmentId: string,
  reason: string,
  proofPhotos: string[],
): Promise<ShiftAssignmentRecord> {
  return request<ShiftAssignmentRecord>(`/shift-assignment/mine/${assignmentId}/leave`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ reason, proofPhotos }),
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
  /** Still waiting on the agency — the parent receipt has not been approved. */
  pending: boolean;
  /** Proof photo(s) the PR attached to a self-log — [] when none. */
  proofPhotos: string[];
  /**
   * The parent receipt's review state, or null when this line has no receipt
   * behind it (a wages seal, a bare self-logged line, a legacy row).
   *
   * `pending` also means the line is still THIS PR's to edit or delete; once it
   * is approved the figure belongs to the agency and the way back is a dispute.
   */
  receiptStatus?: 'pending' | 'approved' | 'verified' | null;
  /**
   * The parent receipt's running number (`RCP-000007`), or null when this line
   * has no receipt behind it.
   *
   * This is the identifier the server quotes when it refuses the PR ("RCP-000007
   * has already been reviewed by the agency"), so without it the refusal names
   * something the PR cannot see anywhere in their own app.
   */
  receiptNo?: string | null;
  /** The parent receipt's uuid — what a dispute points at as a foreign key. */
  receiptId?: string | null;
  /**
   * The ORDER NUMBER printed on the paper (`ORD0389`) — what the PR can hold up
   * against the figure. Null when the paper carried none.
   */
  orderNo?: string | null;
  /** Date/time PRINTED on the paper — may legitimately differ from `lineDate`. */
  receiptDate?: string | null;
  receiptTime?: string | null;
  /**
   * WHICH SHIFT earned this — join it against `PrCurrentWeek.shifts`.
   *
   * Null means nothing links the line to a shift (logged with no active shift,
   * or a row predating the phone sending it). Show that honestly as "not linked"
   * — never fall back to matching on timestamps. Check-In and ShiftStatusPanel
   * do attribute lines by `loggedAt >= checkInAt`, which is fine for a live
   * display but WRONG as proof: it misfiles a receipt logged between two shifts.
   */
  shiftAssignmentId?: string | null;
  /**
   * May this money be disputed yet? ADVISORY — for greying a control, never as
   * the rule: the server refuses with a 409 whose message names the receipt.
   *
   * Wages are always true. They are sealed at check-out with no receipt to
   * approve, so requiring approval there would make a wage error the one thing
   * that could never be contested.
   */
  disputable?: boolean;
};

/**
 * One shift a week's lines point back at, with the attendance stamps that prove
 * when it was worked. A SIBLING array rather than fields on every line: a
 * three-item receipt would otherwise carry the same two timestamps three times.
 */
/**
 * One claim the PR has raised on this voucher — the day and bucket they
 * contested, and where it got to.
 *
 * Comes from the server so a disputed cell SURVIVES A RELOAD. It used to live
 * only in React state, so the PR's own open claim disappeared from their screen
 * on restart while the agency still had it in their queue — the one party who
 * needed to keep chasing it was the one who could no longer see it.
 */
export type PrWeekDispute = {
  id: string;
  /** The contested day, YYYY-MM-DD — pairs with `PrReceiptLine.lineDate`. */
  disputeDate: string;
  component: PrReceiptKind;
  reason: string | null;
  note: string | null;
  raisedAt: string;
  /** What the voucher said when raised — computed server-side, not claimed. */
  disputedAmount: string | null;
  claimedAmount: string | null;
  /**
   * WHICH receipts this claim names, by `receiptNo`.
   *
   * NULL means the PR did not narrow it, so the WHOLE day+component cell is
   * under argument — every receipt in that bucket. A non-null list names the
   * shift(s) they picked.
   */
  /** The FK to the shift's paper — match receipts on this, not on the number. */
  receiptId: string | null;
  /** @deprecated pre-0088 claims only; receipt NUMBERS as text. */
  receiptRefs: string[] | null;
  /**
   * WHICH ITEMS the claim names — "Lemon Drop", not just "drinks".
   *
   * A snapshot taken when the claim was raised, so it still reads correctly
   * after the agency edits the receipt or the voucher is rewritten. Null means
   * the whole receipt was claimed, or the row predates the column.
   */
  disputedItems: { lineId: string; description: string; quantity: number; amount: string }[] | null;
  /** null = STILL OPEN. Otherwise the agency has answered. */
  outcome: 'accepted' | 'rejected' | 'withdrawn' | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
};

export type PrWeekShift = {
  id: string;
  shiftDate: string;
  slot: string | null;
  eventName: string | null;
  /**
   * shift.event_kind — the outlet's Normal / Special event toggle.
   *
   * NOT NULL with a 'normal' default in the database, so it always has a value
   * once the shift row is reached. Optional HERE only because a backend that
   * has not been restarted yet omits it, and a week is better shown without
   * the tag than not shown at all.
   */
  eventKind?: string | null;
  outletName: string | null;
  /** ISO timestamp, or null when the shift was never started. */
  checkInAt: string | null;
  /**
   * ⚠️ CLAMPED to the shift's scheduled end when the PR taps out late — the
   * overrun survives only in `overtimeMinutes`. Label this "shift end", never
   * "when you tapped out".
   */
  checkOutAt: string | null;
  overtimeMinutes: number | null;
};

/** The PR's live current-week earnings — powers Check-In STATUS + Payment This-week. */
export type PrCurrentWeek = {
  voucherId: string | null;
  /**
   * The voucher's own number — `PV-000001`, stored (migration 0075).
   *
   * Print THIS. It used to be derived from the week end in four places in this
   * app, which meant every PR's voucher for a week showed the same number as
   * everyone else's. Null only for a row that predates the column.
   */
  voucherNo?: string | null;
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
  /**
   * The shifts `lines[].shiftAssignmentId` point at. Optional so the app keeps
   * working against a backend that has not restarted yet — absent means "cannot
   * prove the shift", which the evidence sheet says out loud rather than hiding.
   */
  shifts?: PrWeekShift[];
  /**
   * The agency's day-by-day sign-off, `date` matching `lines[].lineDate`.
   *
   * This is the only way the phone can tell that Tuesday has been ACCEPTED: the
   * voucher's own `status` stays `pending_review` for the entire week, so
   * without this a day the agency approved on Tuesday still read PENDING to the
   * PR until the voucher was sent on Sunday.
   *
   * `null` means nobody has decided yet, OR the day was approved and its total
   * has since changed — the server collapses a stale approval to null rather
   * than let it describe a figure that no longer exists.
   *
   * Optional so the app keeps working against a backend that has not restarted:
   * absent means no day is approved, which is what the screen assumed before.
   */
  dayReviews?: { date: string; status: 'approved' | 'held' | null }[];
  /**
   * Every claim the PR has raised on this voucher, OPEN and ANSWERED alike.
   *
   * Optional for the same not-yet-restarted reason; absent means the grid falls
   * back to in-session state, which is all it had before.
   */
  disputes?: PrWeekDispute[];
  /**
   * Public R2 base for resolving `user/…` proof-photo keys in `lines[].proofPhotos`
   * (and dispute proof photos). `request()` notes it via `noteR2PublicUrl`;
   * `resolveProofPhotoUri` (lib/proof-photo.ts) joins base + key at render time.
   */
  r2PublicUrl?: string | null;
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
  /** The stored voucher number (0075) — print it rather than deriving one. */
  voucherNo?: string | null;
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
    /**
     * WHICH receipts this claim is about, by `receiptNo` (`RCP-000012`).
     *
     * Omit to contest the whole cell. Send a subset when the day holds more than
     * one shift and only one of them is wrong — the server narrows the recorded
     * `disputedAmount` to exactly these, so the agency argues about the figure
     * the PR actually pointed at.
     *
     * `receiptNo`, not the order number: the same paper logged twice carries the
     * SAME order number, and telling those two apart is the whole point.
     */
    /**
     * WHICH SHIFT — the receipt's uuid, stored server-side as a foreign key.
     * Omit to dispute the whole day+bucket.
     */
    receiptId?: string;
    /**
     * WHICH ITEMS on that receipt are wrong. Only the id is sent — the server
     * reads the description, quantity and amount from the database, so the
     * figure a claim is measured against is never client-supplied.
     *
     * Omit to dispute the whole receipt.
     */
    items?: { lineId: string }[];
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
  input: {
    disputeDate: string;
    component: PrDisputeComponent;
    /**
     * WHICH claim — a PR can hold one open claim per SHIFT, so day+component
     * alone no longer names a single row. Omit for a whole-day claim.
     */
    receiptId?: string;
  },
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
