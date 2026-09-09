/**
 * THE ORIGINAL BEHIND A CROPPED IMAGE, kept beside it in R2.
 *
 * "Adjust crop" used to survive only until the tab was reloaded: the sheet
 * re-crops the ORIGINAL, the client held it in component state, and the server
 * was only ever sent the cropped square. Reload, and there was nothing to
 * adjust (see TEST_SCRIPT §9, 9 Sep 2026).
 *
 * ── WHY SIDECAR OBJECTS AND NOT COLUMNS (owner's call, 9 Sep 2026) ───────────
 * `outlet.logo_image`, `agency.logo_image` and `user_profile.profile_image` each
 * hold one varchar: an R2 object key. Recording a second key and a crop state
 * would have meant two new columns on three tables. Instead both live in the
 * SAME FOLDER as the image, at fixed names, so the existing column still
 * answers "where is this image?" and the folder answers the rest.
 *
 * The trade the owner accepted: the sidecar key is DERIVABLE from the public
 * image URL, so anyone holding a logo link can also fetch the uncropped
 * original. That is fine for a venue logo. It is worth remembering for personal
 * avatars, where a crop is sometimes used to leave somebody out of frame — an
 * unguessable key would have needed the column this design avoids.
 *
 * ── THE READ PATH IS SERVER-SIDE ON PURPOSE ──────────────────────────────────
 * Not an optimisation — a requirement. The public r2.dev host sends no
 * `Access-Control-Allow-Origin`, so the browser cannot `fetch()` the original,
 * and an `<img crossOrigin="anonymous">` fails to load. Loading it without that
 * attribute taints the canvas and `toDataURL()` then throws. See `r2GetObject`.
 */
import path from 'node:path';
import { logger } from '@/util/logger';
import { r2Configured, r2GetObject, r2PutObject } from '@/util/r2';

/** Where the frame was left. Mirrors the web's `CropState` exactly. */
export type CropState = { zoom: number; fx: number; fy: number };

/** What the sheet needs to reopen on the original at its previous framing. */
export type CropSource = {
  /** `data:image/…;base64,…` of the ORIGINAL, un-cropped. */
  dataUrl: string;
  fileName: string;
  contentType: string;
  state: CropState | null;
};

/**
 * Fixed basenames, in the image's own folder. `__` so they sort away from the
 * timestamped `logo-…`/`avatar-…` objects and read as machinery, not content.
 */
const MANIFEST_NAME = '__crop.json';
const SOURCE_STEM = '__source';

const MAX_BYTES = 5 * 1024 * 1024;

type Manifest = {
  sourceKey: string;
  fileName: string;
  contentType: string;
  state: CropState | null;
};

/** The folder an object key lives in, with the trailing slash. */
function folderOf(imageKey: string): string | null {
  const cut = imageKey.lastIndexOf('/');
  return cut > 0 ? imageKey.slice(0, cut + 1) : null;
}

function isCropState(value: unknown): value is CropState {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.zoom === 'number' &&
    typeof s.fx === 'number' &&
    typeof s.fy === 'number' &&
    Number.isFinite(s.zoom) &&
    Number.isFinite(s.fx) &&
    Number.isFinite(s.fy)
  );
}

/**
 * Parse a `data:` URL into bytes. Returns null on anything that is not a plain
 * base64 image payload — the client is the only writer today, but a stored
 * original is served back into a canvas, so it is not a place to be relaxed.
 */
function decodeDataUrl(
  raw: string,
): { body: Buffer; contentType: string; ext: string } | null {
  const match = /^data:(image\/[a-z+.-]+);base64,([\s\S]+)$/i.exec(raw.trim());
  if (!match) return null;
  const contentType = match[1].toLowerCase();
  const body = Buffer.from(match[2], 'base64');
  if (!body.length || body.length > MAX_BYTES) return null;
  const ext =
    contentType === 'image/jpeg'
      ? '.jpg'
      : contentType === 'image/png'
        ? '.png'
        : contentType === 'image/webp'
          ? '.webp'
          : contentType === 'image/gif'
            ? '.gif'
            : '';
  return ext ? { body, contentType, ext } : null;
}

/**
 * Store the original and its framing beside `imageKey`.
 *
 * NEVER THROWS. The cropped image — the thing everyone actually sees — has
 * already been written and the row already points at it by the time this runs.
 * Failing the whole save because the re-crop convenience could not be stored
 * would turn a working upload into a broken one; the cost of the quiet failure
 * is that Adjust stays session-only for that image, exactly as it was before.
 */
export async function saveCropSource(input: {
  imageKey: string;
  /** `data:image/…;base64,…` of the ORIGINAL, as picked. */
  sourceDataUrl: string | null | undefined;
  fileName: string;
  state?: CropState | null;
}): Promise<void> {
  try {
    if (!input.sourceDataUrl || !r2Configured()) return;
    const folder = folderOf(input.imageKey);
    if (!folder) return;

    const decoded = decodeDataUrl(input.sourceDataUrl);
    if (!decoded) {
      logger.warn('[crop-source] original rejected (not a supported image)', {
        imageKey: input.imageKey,
      });
      return;
    }

    const sourceKey = `${folder}${SOURCE_STEM}${decoded.ext}`;
    await r2PutObject({
      key: sourceKey,
      body: decoded.body,
      contentType: decoded.contentType,
    });

    const manifest: Manifest = {
      sourceKey,
      // The name carries the extension the crop sheet re-encodes against, the
      // same reason the upload path cares about it.
      fileName: path.basename(input.fileName || `source${decoded.ext}`),
      contentType: decoded.contentType,
      state: input.state && isCropState(input.state) ? input.state : null,
    };
    await r2PutObject({
      key: `${folder}${MANIFEST_NAME}`,
      body: Buffer.from(JSON.stringify(manifest), 'utf8'),
      contentType: 'application/json',
    });
  } catch (error) {
    logger.warn('[crop-source] could not store original (ignored)', {
      imageKey: input.imageKey,
      error,
    });
  }
}

/**
 * The original behind `imageKey`, or null when there is none.
 *
 * Null is the ordinary answer for every image uploaded before this shipped, and
 * the client treats it exactly as it treats today's reload: no Adjust button.
 */
export async function readCropSource(
  imageKey: string | null | undefined,
): Promise<CropSource | null> {
  try {
    if (!imageKey || !r2Configured()) return null;
    const folder = folderOf(imageKey);
    if (!folder) return null;

    const manifestObject = await r2GetObject(`${folder}${MANIFEST_NAME}`);
    if (!manifestObject) return null;

    const parsed = JSON.parse(manifestObject.body.toString('utf8')) as Manifest;
    if (!parsed?.sourceKey) return null;
    /**
     * The manifest names a key in ITS OWN folder or nowhere. It is written only
     * by `saveCropSource`, but it is also a bucket object at a derivable key —
     * so a manifest that pointed elsewhere would turn this endpoint into a
     * reader for any object in the bucket.
     */
    if (!parsed.sourceKey.startsWith(folder)) {
      logger.warn('[crop-source] manifest points outside its folder — ignored', {
        imageKey,
        sourceKey: parsed.sourceKey,
      });
      return null;
    }

    const source = await r2GetObject(parsed.sourceKey);
    if (!source) return null;

    const contentType = parsed.contentType || source.contentType;
    return {
      dataUrl: `data:${contentType};base64,${source.body.toString('base64')}`,
      fileName: parsed.fileName || 'source.png',
      contentType,
      state: isCropState(parsed.state) ? parsed.state : null,
    };
  } catch (error) {
    logger.warn('[crop-source] could not read original (ignored)', {
      imageKey,
      error,
    });
    return null;
  }
}
