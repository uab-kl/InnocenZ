/**
 * Shared proof-photo capture for self-logs (Scan) and the Check-In gallery.
 * Web-only for now (like the dispute picker); native camera is a follow-up.
 * Photos are downscaled to a bounded JPEG data URL so they stay small enough to
 * persist in payment_voucher_line.proof_photos (jsonb).
 */
import { Platform } from 'react-native';

type HtmlFileInput = {
  type: string;
  accept: string;
  capture: string;
  multiple: boolean;
  files: FileList | null;
  onchange: ((ev: Event) => void) | null;
  click: () => void;
};

/** Downscale a captured photo to a bounded JPEG data URL (falls back to raw). */
export function downscaleToDataUrl(file: Blob, maxPx = 1024, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const g = globalThis as unknown as {
        Image?: new () => {
          width: number;
          height: number;
          onload: (() => void) | null;
          onerror: (() => void) | null;
          src: string;
        };
        document?: { createElement: (t: string) => unknown };
      };
      if (!g.Image || !g.document) return resolve(dataUrl);
      const img = new g.Image();
      img.onerror = () => reject(new Error('Could not read image'));
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = g.document!.createElement('canvas') as {
          width: number;
          height: number;
          getContext: (t: string) => { drawImage: (...a: unknown[]) => void } | null;
          toDataURL: (t: string, q: number) => string;
        };
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrl);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Snap / pick proof photos. On the phone this opens the real camera (via
 * receipt-ocr's capture helper, expo-image-picker); on web it keeps the
 * existing file-input flow. Downscales each before returning.
 */
export function pickProofPhotos(onPicked: (urls: string[]) => void) {
  if (Platform.OS !== 'web') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { captureReceiptPhoto } = require('./receipt-ocr') as typeof import('./receipt-ocr');
    void captureReceiptPhoto().then((shot) => {
      if (shot?.dataUrl) onPicked([shot.dataUrl]);
    });
    return;
  }
  const doc = (globalThis as { document?: { createElement: (t: string) => HtmlFileInput } }).document;
  if (!doc) return;
  const input = doc.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';
  input.multiple = true;
  input.onchange = () => {
    const files = input.files
      ? Array.from(input.files).filter((f) => f.type.startsWith('image/'))
      : [];
    if (!files.length) return;
    void Promise.all(files.map((f) => downscaleToDataUrl(f))).then((urls) => {
      if (urls.length) onPicked(urls);
    });
  };
  input.click();
}
