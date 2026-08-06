/**
 * Organisation logo upload (outlet / agency signup + Settings).
 *
 * R2 key shapes (flat id folders, same style as user/{id}/…):
 *   agency → agency/{id}/logo/{filename}
 *   outlet → outlet/{id}/logo/{filename}
 *
 * Stores the **object key** in `agency.logo_image` / `outlet.logo_image`.
 * Clients resolve display as `R2_PUBLIC_URL + '/' + key`.
 */
import path from 'node:path';
import { sanitizePathSegment } from '@/util/profile-image';
import { r2Configured, r2PutObject } from '@/util/r2';

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

export function orgLogoObjectKey(
  kind: OrgLogoKind,
  orgId: string,
  filename: string,
): string {
  const safeBase = sanitizePathSegment(filename.replace(/\.[^.]+$/, '')) || 'logo';
  const ext = path.extname(filename).toLowerCase() || '.jpg';
  return `${kind}/${orgId}/logo/${safeBase}${ext}`;
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
  /** Kept for call-site compatibility; not used in the R2 key. */
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
  const key = orgLogoObjectKey(input.kind, input.orgId, filename);
  return r2PutObject({ key, body, contentType });
}
