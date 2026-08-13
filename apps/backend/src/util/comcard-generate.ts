import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  isR2ObjectKey,
  r2Configured,
  r2KeepOnly,
  r2PublicUrl,
  r2PutObject,
} from '@/util/r2';
import { normalizePortfolioSlots } from '@/util/portfolio-image';
// Leaf (imports nothing) — the single age rule, shared with both read paths.
import { derivedAge } from '@/features/pr-personnel/ic-dob';
import { userFolder } from '@/util/user-folder';

const W = 600;
const H = 800;
const CELL_W = W / 2;
const CELL_H = H / 2;

/**
 * The name plate in the middle of the collage. Tighter than the old fixed
 * 168×88 box, with the type left full size so the words read LARGER within it.
 * Kept in step with `.iz-portfolio-comcard__overlay` (apps/web
 * prototype-theme.css) and the phone's canvas renderer, so a SAVED comcard and
 * a live collage look like the same object.
 */
const PLATE_H = 106;
const PLATE_Y = (H - PLATE_H) / 2;
const PLATE_MIN_W = 150;
const PLATE_PAD_X = 16;
const NAME_SIZE = 32;
const LINE_SIZE = 21;
/** How much of the photo shows through — it used to be a solid `#ffffff` sticker. */
const PLATE_ALPHA = 0.62;
/** Blur under the plate — translucent white alone leaves the words on a face. */
const PLATE_BLUR = 8;

/**
 * Roughly how wide a line of Arial/Helvetica runs, so the plate can be sized to
 * its contents. SVG text is not clipped by the rect behind it, so an unsized
 * plate does not truncate a long nickname — it lets it hang off the white into
 * the photo, which is worse. Deliberately generous: too wide is a slightly
 * roomy plate, too narrow is a name half on the glass.
 */
function textWidth(text: string, fontSize: number, bold = false): number {
  return text.length * fontSize * (bold ? 0.62 : 0.55);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The age PRINTED on the card. Derived from the IC through the same leaf both
 * portals read, so the number burned into the PNG cannot disagree with the
 * number beside it on screen.
 *
 * This file used to carry its own `ageFromDob` fed the RAW stored `dob`, which
 * is how the card came to say "Age 30" while the profile said 31: one PR's
 * NRIC and her stored birth date differ by a year, and only the screen had
 * learned the IC wins. Deriving here — not at the two call sites — is what
 * stops the next caller reintroducing it.
 */
function comcardAge(input: { idNo?: string | null; dob?: string | Date | null }): number {
  const dob =
    input.dob instanceof Date ? input.dob.toISOString().slice(0, 10) : (input.dob ?? null);
  return derivedAge({ idNo: input.idNo ?? null, dob }).age ?? 0;
}

async function loadImageBuffer(src: string): Promise<Buffer | null> {
  try {
    const fetchUrl = isR2ObjectKey(src)
      ? r2PublicUrl(src)
      : /^https?:\/\//.test(src)
        ? src
        : null;
    if (fetchUrl) {
      const res = await fetch(fetchUrl);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    }
    if (src.startsWith('/img/')) {
      const filePath = path.join(process.cwd(), 'public', src.replace(/^\//, ''));
      if (!fs.existsSync(filePath)) return null;
      return fs.readFileSync(filePath);
    }
    return null;
  } catch {
    return null;
  }
}

async function cellTile(src: string | null): Promise<Buffer> {
  const empty = await sharp({
    create: {
      width: CELL_W,
      height: CELL_H,
      channels: 3,
      background: { r: 37, g: 43, b: 59 },
    },
  })
    .jpeg()
    .toBuffer();

  if (!src) return empty;
  const raw = await loadImageBuffer(src);
  if (!raw) return empty;

  try {
    return await sharp(raw)
      .resize(CELL_W, CELL_H, { fit: 'cover', position: 'centre' })
      .jpeg()
      .toBuffer();
  } catch {
    return empty;
  }
}

/**
 * Build a 2×2 portfolio comcard PNG (name / age / height / weight overlay)
 * and upload it to R2. Returns the object key to store in the DB.
 */
export async function generateAndStoreComcard(input: {
  userId: string;
  fullName: string | null | undefined;
  displayName: string;
  dob: string | Date | null | undefined;
  /**
   * The PR's ID number. Age follows it when it is an NRIC, so passing it is
   * what keeps the printed age equal to the one on screen; omit it and the
   * card falls back to `dob`, which for an NRIC holder may be a year out.
   */
  idNo?: string | null;
  heightCm: number | null | undefined;
  weightKg: number | null | undefined;
  portfolioPhotos: (string | null)[] | null | undefined;
}): Promise<string> {
  if (!r2Configured()) {
    throw new Error('Cloudflare R2 is not configured');
  }

  const slots = normalizePortfolioSlots(input.portfolioPhotos).slice(0, 4);
  const tiles = await Promise.all(slots.map((src) => cellTile(src)));

  const base = await sharp({
    create: {
      width: W,
      height: H,
      channels: 3,
      background: { r: 26, g: 31, b: 46 },
    },
  })
    .composite([
      { input: tiles[0]!, left: 0, top: 0 },
      { input: tiles[1]!, left: CELL_W, top: 0 },
      { input: tiles[2]!, left: 0, top: CELL_H },
      { input: tiles[3]!, left: CELL_W, top: CELL_H },
    ])
    .png()
    .toBuffer();

  const rawName = (input.displayName || input.fullName || 'PR').slice(0, 20);
  const name = escapeXml(rawName);
  const age = comcardAge({ idNo: input.idNo, dob: input.dob });
  const height = input.heightCm && input.heightCm > 0 ? input.heightCm : '—';
  const weight = input.weightKg && input.weightKg > 0 ? input.weightKg : '—';
  const ageLine = `Age ${age}`;
  const sizeLine = `${height}cm ${weight}kg`;

  // Size the plate to its longest line — measured on the RAW text, not the
  // XML-escaped one, or a name with an "&" in it would reserve five characters
  // of width for one glyph.
  const plateW = Math.min(
    W - 2 * PLATE_PAD_X,
    Math.max(
      PLATE_MIN_W,
      Math.ceil(
        Math.max(
          textWidth(rawName, NAME_SIZE, true),
          textWidth(ageLine, LINE_SIZE),
          textWidth(sizeLine, LINE_SIZE),
        ) +
          PLATE_PAD_X * 2,
      ),
    ),
  );
  const plateX = Math.round((W - plateW) / 2);

  const overlaySvg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${plateX}" y="${PLATE_Y}" width="${plateW}" height="${PLATE_H}"
        fill="#ffffff" fill-opacity="${PLATE_ALPHA}"/>
  <text x="${W / 2}" y="${PLATE_Y + 35}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="${NAME_SIZE}" font-weight="800" fill="#111111">${name}</text>
  <text x="${W / 2}" y="${PLATE_Y + 66}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="${LINE_SIZE}" fill="#222222">${escapeXml(ageLine)}</text>
  <text x="${W / 2}" y="${PLATE_Y + 92}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="${LINE_SIZE}" fill="#222222">${escapeXml(sizeLine)}</text>
</svg>`;

  // sharp has no `backdrop-filter`, so frost the crop by hand: lift the region
  // the plate covers, blur it, and drop it back before the translucent plate
  // goes on top. Without this the words land on whatever the photo happens to
  // show there, and a 0.62 plate is unreadable over a bright face.
  const frosted = await sharp(base)
    .extract({ left: plateX, top: PLATE_Y, width: plateW, height: PLATE_H })
    .blur(PLATE_BLUR)
    .png()
    .toBuffer();

  const png = await sharp(base)
    .composite([
      { input: frosted, left: plateX, top: PLATE_Y },
      { input: Buffer.from(overlaySvg), top: 0, left: 0 },
    ])
    .png()
    .toBuffer();

  // The key stays timestamped ON PURPOSE: the public URL is what the phone and
  // the portal render, and a stable name would let a cached PNG outlive the
  // re-render — which is the same "the card still says 30" complaint wearing a
  // different hat. Uniqueness is the cache-buster.
  //
  // The cost of that is an object per render, so the prune below is not
  // housekeeping, it is the other half of the design. It asks the BUCKET what
  // is under this PR's comcard prefix rather than trusting the previous value
  // in the database, so it also collects orphans left by a delete that silently
  // failed (`r2DeleteObject` swallows its own errors) — which is exactly how a
  // PR ended up with two.
  const prefix = `user/${userFolder(input.userId)}/comcard/`;
  const key = `${prefix}comcard-${Date.now()}.png`;
  const storedKey = await r2PutObject({ key, body: png, contentType: 'image/png' });
  // After the write, never before: a prune that ran first would leave the PR
  // with no comcard at all if the render then failed.
  await r2KeepOnly(prefix, storedKey);
  return storedKey;
}
