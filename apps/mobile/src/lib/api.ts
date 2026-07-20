/**
 * REST client for the InnocenZ backend (the same API the admin portal uses).
 * Base URL comes from EXPO_PUBLIC_API_URL if explicitly set (see
 * tools/scripts/dev-mobile.mjs), otherwise autodetected from Expo's hostUri —
 * the dev machine's LAN IP, which is what physical devices need to reach it.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';

const DEFAULT_BACKEND_PORT = 7777;

function detectApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim()?.replace(/\/$/, '');
  const loc = (globalThis as { location?: { protocol: string; hostname: string } }).location;

  // Web: match API host to the page host. EXPO_PUBLIC_API_URL is often set to the
  // LAN IP for Expo Go on a phone; opening the app at localhost:8081 must still
  // call localhost:7777, not 192.168.x.x (often blocked or unreachable from the browser).
  if (Platform.OS === 'web' && loc) {
    const pageHost = loc.hostname;
    if (pageHost === 'localhost' || pageHost === '127.0.0.1') {
      return `${loc.protocol}//${pageHost}:${DEFAULT_BACKEND_PORT}/api`;
    }
    if (fromEnv) {
      try {
        const envHost = new URL(fromEnv).hostname;
        if (pageHost === envHost) return fromEnv;
      } catch {
        /* ignore malformed env URL */
      }
    }
    return `${loc.protocol}//${pageHost}:${DEFAULT_BACKEND_PORT}/api`;
  }

  if (fromEnv) return fromEnv;

  // Native: Metro host is the dev machine's LAN IP.
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
  firstName: string | null;
  lastName: string | null;
  nationality: string | null;
  gender: string | null;
  race: string | null;
  idType: string | null;
  idNo: string | null;
  dob: string | null;
  underAgency: boolean | null;
  agencyId: string | null;
  verificationStatus: string | null;
  /** Showcase fields — gallery paths served by the backend /img route. */
  portfolioPhotos: (string | null)[] | null;
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

/** Agencies this PR belongs to — same rows the admin PR list joins on. */
export function fetchMemberships(accessToken: string, userId: string): Promise<AgencyMembership[]> {
  const query = new URLSearchParams({ userIds: userId, subRole: 'pr' }).toString();
  return request<AgencyMembership[]>(`/agency/memberships?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export type ProfileUpdate = {
  username: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  portfolioPhotos?: (string | null)[];
  comcardHeightCm?: number | null;
  comcardWeightKg?: number | null;
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

/**
 * The PR portal sign-in accepts the digits the prototype uses ("60123456789")
 * while user.phone_num stores E.164-style "+60123456789" — try sensible
 * candidates in order.
 */
export function phoneCandidates(rawId: string): string[] {
  const raw = rawId.trim();
  if (raw.includes('@')) return [raw];
  const digits = raw.replace(/[^\d]/g, '');
  const candidates = [raw.startsWith('+') ? raw : `+${digits}`, raw, digits];
  return [...new Set(candidates.filter(Boolean))];
}
