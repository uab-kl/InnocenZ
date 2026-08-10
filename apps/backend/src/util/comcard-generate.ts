import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { isR2ObjectKey, r2Configured, r2PublicUrl, r2PutObject } from '@/util/r2';
import { normalizePortfolioSlots } from '@/util/portfolio-image';
import { userFolder } from '@/util/user-folder';

const W = 600;
const H = 800;
const CELL_W = W / 2;
const CELL_H = H / 2;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ageFromDob(dob: string | Date | null | undefined): number {
  if (!dob) return 0;
  const d = typeof dob === 'string' ? new Date(dob) : dob;
  if (Number.isNaN(d.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return Math.max(0, age);
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

  const name = escapeXml((input.displayName || input.fullName || 'PR').slice(0, 20));
  const age = ageFromDob(input.dob);
  const height = input.heightCm && input.heightCm > 0 ? input.heightCm : '—';
  const weight = input.weightKg && input.weightKg > 0 ? input.weightKg : '—';

  const overlaySvg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${(W - 168) / 2}" y="${(H - 88) / 2}" width="168" height="88" fill="#ffffff"/>
  <text x="${W / 2}" y="${(H - 88) / 2 + 28}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800" fill="#111111">${name}</text>
  <text x="${W / 2}" y="${(H - 88) / 2 + 52}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#333333">Age ${age}</text>
  <text x="${W / 2}" y="${(H - 88) / 2 + 72}" text-anchor="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="15" fill="#333333">${height}cm ${weight}kg</text>
</svg>`;

  const png = await sharp(base)
    .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }])
    .png()
    .toBuffer();

  const key = `user/${userFolder(input.userId)}/comcard/comcard-${Date.now()}.png`;
  return r2PutObject({ key, body: png, contentType: 'image/png' });
}
