/**
 * Renders the auto-generated photo comcard (2×2 portfolio + name/stats overlay)
 * to a PNG blob so it can be uploaded to `user_profile.comcard_image`.
 * Web-only — uses the DOM canvas API.
 */
import { assetUrl } from './api';

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
  textAlign: string;
  textBaseline: string;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  fillText: (text: string, x: number, y: number) => void;
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
    } catch {
      ctx.fillStyle = '#252b3b';
      ctx.fillRect(pos.x, pos.y, cellW, cellH);
    }
  }

  const boxW = 168;
  const boxH = 88;
  const boxX = (W - boxW) / 2;
  const boxY = (H - boxH) / 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(boxX, boxY, boxW, boxH);

  ctx.fillStyle = '#111111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 22px Sora, system-ui, sans-serif';
  ctx.fillText(input.name.slice(0, 20), W / 2, boxY + 24);
  ctx.font = '500 15px Manrope, system-ui, sans-serif';
  ctx.fillStyle = '#333333';
  ctx.fillText(`Age ${input.age}`, W / 2, boxY + 48);
  ctx.fillText(`${input.heightCm}cm ${input.weightKg}kg`, W / 2, boxY + 68);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Could not encode comcard PNG'));
    }, 'image/png');
  });
}
