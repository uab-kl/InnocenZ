/**
 * Organisation logo upload (outlet / agency signup + Settings).
 *
 * R2 key shapes — NAMED folders, the same convention `user/` already uses:
 *   agency → agency/atlas-agency-c30fcd15/logo/{filename}
 *   outlet → outlet/emhub-testing-31ffefb5/logo/{filename}
 *
 * These were bare uuids, so the Cloudflare dashboard listed three folders
 * called `31ffefb5-21e3-…` and nothing said which venue was which. The org
 * name was ALREADY being passed in and thrown away ("kept for call-site
 * compatibility; not used in the R2 key") — every caller supplied it, nothing
 * spent it.
 *
 * WHY THE ID SUFFIX STAYS: same reason as `user-folder.ts`. Two outlets may be
 * named "Emhub Testing", and a name-only folder would merge them into one
 * prefix. The name is decoration and may change; the id may not.
 *
 * OLD KEYS KEEP WORKING and are deliberately NOT migrated. `logo_image` stores
 * the FULL key, so an existing row still points at its existing object — the
 * bucket simply holds both shapes until a logo is re-uploaded. Nothing derives
 * the org id back out of a key, so the shape is free to change.
 *
 * Stores the **object key** in `agency.logo_image` / `outlet.logo_image`.
 * Clients resolve display as `R2_PUBLIC_URL + '/' + key`.
 */
import path from 'node:path';
import { sanitizePathSegment } from '@/util/profile-image';
import { r2Configured, r2PutObject } from '@/util/r2';
import { slugifyUsername } from '@/util/user-folder';

export type OrgLogoKind = 'agency' | 'outlet';

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/** Max decoded payload (~5 MB) — matches the web signup client check. */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * `atlas-agency-c30fcd15` — readable, and still unique per org.
 *
 * Falls back to the FULL uuid when the org has no usable name, which is a
 * valid key and matches what every existing row already holds.
 */
export function orgFolder(orgId: string, orgName: string | null | undefined): string {
  const slug = slugifyUsername(orgName);
  // FULL uuid behind the name, matching the user folders — the folder carries
  // the whole identity, so a key traces back to its row without a lookup.
  return slug ? `${slug}-${orgId}` : orgId;
}

export function orgLogoObjectKey(
  kind: OrgLogoKind,
  orgId: string,
  orgName: string | null | undefined,
  filename: string,
): string {
  const safeBase = sanitizePathSegment(filename.replace(/\.[^.]+$/, '')) || 'logo';
  const ext = path.extname(filename).toLowerCase() || '.jpg';
  return `${kind}/${orgFolder(orgId, orgName)}/logo/${safeBase}${ext}`;
}

function extFromFileName(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return ALLOWED_EXT.has(ext) ? ext : '';
}

function extFromContentType(contentType: string | undefined): string {
  if (!contentType) return '';
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };
  return map[contentType.toLowerCase()] ?? '';
}

/** Strip a `data:image/…;base64,` prefix if the client sent a data URL. */
export function decodeLogoBase64(raw: string): Buffer {
  const trimmed = raw.trim();
  const comma = trimmed.indexOf(',');
  const payload =
    trimmed.startsWith('data:') && comma !== -1
      ? trimmed.slice(comma + 1)
      : trimmed;
  return Buffer.from(payload, 'base64');
}

/**
 * Upload an org logo from signup base64 fields. Returns the R2 object key.
 * Throws a plain Error with a client-safe message on bad input.
 */
export async function saveOrgLogoFromBase64(input: {
  kind: OrgLogoKind;
  orgId: string;
  /** Names the folder. Every caller already passed it; it used to be dropped. */
  orgName?: string;
  fileName: string;
  contentType?: string;
  base64: string;
}): Promise<string> {
  if (!r2Configured()) {
    throw new Error('Image storage (R2) is not configured on this server');
  }

  const ext =
    extFromFileName(input.fileName) ||
    extFromContentType(input.contentType) ||
    '';
  if (!ext) {
    throw new Error('Only JPG, PNG, WebP, and GIF images are allowed');
  }

  const body = decodeLogoBase64(input.base64);
  if (!body.length) {
    throw new Error('Logo file is empty');
  }
  if (body.length > MAX_BYTES) {
    throw new Error('Logo must be 5 MB or smaller');
  }

  const contentType =
    input.contentType && input.contentType.startsWith('image/')
      ? input.contentType
      : (CONTENT_TYPE_BY_EXT[ext] ?? 'application/octet-stream');

  // Unique name so a re-upload never serves a cached previous logo.
  const filename = `logo-${Date.now()}${ext}`;
  const key = orgLogoObjectKey(input.kind, input.orgId, input.orgName, filename);
  return r2PutObject({ key, body, contentType });
}
