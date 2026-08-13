/**
 * Renders the auto-generated photo comcard (2×2 portfolio + name/stats overlay)
 * to a PNG blob so it can be uploaded to `user_profile.comcard_image`.
 * Web-only — uses the DOM canvas API.
 */
import { assetUrl } from './api';

/**
 * The name plate in the middle of the collage — same geometry and glass as the
 * server's `comcard-generate.ts` and the web's `.iz-portfolio-comcard__overlay`,
 * so a comcard saved from this fallback path is indistinguishable from one the
 * server built. It was a solid `#ffffff` sticker punched through the photos.
 */
const PLATE_H = 106;
const PLATE_MIN_W = 150;
const PLATE_PAD_X = 16;
const NAME_SIZE = 32;
const LINE_SIZE = 21;
const PLATE_ALPHA = 0.62;
const PLATE_BLUR = 8;
const NAME_FONT = `800 ${NAME_SIZE}px Sora, system-ui, sans-serif`;
const LINE_FONT = `500 ${LINE_SIZE}px Manrope, system-ui, sans-serif`;

type RenderComcardInput = {
  /** Four portfolio paths (or fewer); empty cells fill with panel colour. */
  paths: (string | null)[];
  name: string;
  age: number;
  heightCm: number;
  weightKg: number;
};

type Ctx2d = {
  fillStyle: string;
  font: string;
  /** CSS filter for subsequent draws — how the plate frosts what sits behind it. */
  filter: string;
  textAlign: string;
  textBaseline: string;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  fillText: (text: string, x: number, y: number) => void;
  measureText: (text: string) => { width: number };
  save: () => void;
  restore: () => void;
  beginPath: () => void;
  rect: (x: number, y: number, w: number, h: number) => void;
  clip: () => void;
  drawImage: (image: never, dx: number, dy: number, dw: number, dh: number) => void;
};

type CanvasLike = {
  width: number;
  height: number;
  getContext: (id: '2d') => Ctx2d | null;
  toBlob: (
    callback: (blob: Blob | null) => void,
    type?: string,
    quality?: number,
  ) => void;
};

type ImageLike = {
  width: number;
  height: number;
  crossOrigin: string | null;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  src: string;
};

function createCanvas(width: number, height: number): CanvasLike | null {
  const doc = (globalThis as { document?: { createElement: (tag: string) => unknown } })
    .document;
  if (!doc) return null;
  const canvas = doc.createElement('canvas') as CanvasLike;
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function loadImage(src: string): Promise<ImageLike> {
  return new Promise((resolve, reject) => {
    const ImgCtor = (globalThis as { Image?: new () => ImageLike }).Image;
    if (!ImgCtor) {
      reject(new Error('Image API unavailable'));
      return;
    }
    const img = new ImgCtor();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

function drawCover(
  ctx: Ctx2d,
  img: ImageLike,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img as never, dx, dy, dw, dh);
  ctx.restore();
}

/** Fetch a remote (or absolute) image as a Blob — used for seed / saved single comcards. */
export async function fetchImageBlob(pathname: string): Promise<Blob> {
  const url = assetUrl(pathname);
  if (!url) throw new Error('Missing image path');
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not load comcard image');
  return res.blob();
}

export async function renderComcardPng(input: RenderComcardInput): Promise<Blob> {
  const W = 600;
  const H = 800;
  const canvas = createCanvas(W, H);
  if (!canvas) throw new Error('Canvas unavailable — open Profile on web to save comcard');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');

  ctx.fillStyle = '#1a1f2e';
  ctx.fillRect(0, 0, W, H);

  const cellW = W / 2;
  const cellH = H / 2;
  const positions = [
    { x: 0, y: 0 },
    { x: cellW, y: 0 },
    { x: 0, y: cellH },
    { x: cellW, y: cellH },
  ];

  /** Tiles that actually loaded — kept so the plate can frost what sits under it. */
  const drawn: { img: ImageLike; x: number; y: number }[] = [];

  for (let i = 0; i < 4; i++) {
    const path = input.paths[i] ?? null;
    const pos = positions[i]!;
    if (!path) {
      ctx.fillStyle = '#252b3b';
      ctx.fillRect(pos.x, pos.y, cellW, cellH);
      continue;
    }
    const url = assetUrl(path);
    if (!url) {
      ctx.fillStyle = '#252b3b';
      ctx.fillRect(pos.x, pos.y, cellW, cellH);
      continue;
    }
    try {
      const img = await loadImage(url);
      drawCover(ctx, img, pos.x, pos.y, cellW, cellH);
      drawn.push({ img, x: pos.x, y: pos.y });
    } catch {
      ctx.fillStyle = '#252b3b';
      ctx.fillRect(pos.x, pos.y, cellW, cellH);
    }
  }

  const nameText = input.name.slice(0, 20);
  const ageLine = `Age ${input.age}`;
  const sizeLine = `${input.heightCm}cm ${input.weightKg}kg`;

  // Size the plate to its longest line, so a long nickname widens the glass
  // instead of hanging off it. Canvas can measure the real font, which is why
  // this is exact here and an estimate in the server's SVG twin.
  ctx.font = NAME_FONT;
  const nameW = ctx.measureText(nameText).width;
  ctx.font = LINE_FONT;
  const lineW = Math.max(
    ctx.measureText(ageLine).width,
    ctx.measureText(sizeLine).width,
  );
  const boxW = Math.min(
    W - 2 * PLATE_PAD_X,
    Math.max(PLATE_MIN_W, Math.ceil(Math.max(nameW, lineW) + PLATE_PAD_X * 2)),
  );
  const boxX = (W - boxW) / 2;
  const boxY = (H - PLATE_H) / 2;

  // Frost the crop behind the plate — the canvas stand-in for `backdrop-filter`,
  // which a 2D context has no notion of. Clip to the plate, then redraw the same
  // tiles through a blur. A tile that failed to load simply isn't in `drawn`, so
  // its panel colour stays put exactly as before.
  ctx.save();
  ctx.beginPath();
  ctx.rect(boxX, boxY, boxW, PLATE_H);
  ctx.clip();
  ctx.filter = `blur(${PLATE_BLUR}px)`;
  for (const tile of drawn) {
    drawCover(ctx, tile.img, tile.x, tile.y, cellW, cellH);
  }
  ctx.restore();

  ctx.fillStyle = `rgba(255, 255, 255, ${PLATE_ALPHA})`;
  ctx.fillRect(boxX, boxY, boxW, PLATE_H);

  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = NAME_FONT;
  // Canvas centres on `textBaseline: middle`, SVG sits on the baseline — these
  // are the server's 35/66/92 baselines converted, so both renderers put the
  // words in the same place on the plate.
  ctx.fillText(nameText, W / 2, boxY + 23);
  ctx.font = LINE_FONT;
  ctx.fillStyle = '#222222';
  ctx.fillText(ageLine, W / 2, boxY + 58);
  ctx.fillText(sizeLine, W / 2, boxY + 84);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode comcard PNG'));
    }, 'image/png');
  });
}
