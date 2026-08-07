/**
 * One photo picker that works everywhere: on the PHONE it opens the real
 * photo gallery (expo-image-picker); on web it falls back to the browser
 * file dialog. Returns a value the existing multipart upload endpoints
 * accept unchanged (a File on web, a React-Native file descriptor on
 * native — FormData understands both).
 *
 * `captureFromCamera` is camera-first (Shopee-style ID / selfie verify).
 * Gallery is only a fallback when the camera is unavailable or cancelled
 * on web.
 */
import { Platform } from 'react-native';

export type PickedImage = {
  /** Value FormData accepts on this platform. */
  file: Blob;
  filename: string;
  /** Local URI for an instant <Image> preview, when available. */
  previewUri: string | null;
  /** Size in bytes when known (used for the 5 MB guard). */
  size: number | null;
};

type NativeAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
};

type PickResult = {
  canceled: boolean;
  assets?: NativeAsset[];
};

type ImagePickerModule = {
  requestCameraPermissionsAsync: () => Promise<{ granted: boolean }>;
  launchCameraAsync: (opts: object) => Promise<PickResult>;
  launchImageLibraryAsync: (opts: object) => Promise<PickResult>;
  CameraType?: { front: unknown; back: unknown };
};

function toPicked(a: NativeAsset, fallbackName: string): PickedImage {
  let filename = a.fileName || fallbackName;
  // Expo often returns HEIC names; picker quality output is JPEG — keep multer happy.
  if (/\.(heic|heif)$/i.test(filename)) {
    filename = filename.replace(/\.(heic|heif)$/i, '.jpg');
  } else if (!/\.(jpe?g|png|webp)$/i.test(filename)) {
    filename = fallbackName.endsWith('.jpg') ? fallbackName : 'photo.jpg';
  }
  const type =
    a.mimeType && !/heic|heif/i.test(a.mimeType) ? a.mimeType : 'image/jpeg';
  const file = { uri: a.uri, name: filename, type } as unknown as Blob;
  return { file, filename, previewUri: a.uri, size: a.fileSize ?? null };
}

/**
 * RN multipart descriptor from a local image URI when the draft Blob was lost
 * but the preview URI is still present (e.g. after a long OTP wait).
 */
export function nativeUploadFileFromUri(
  uri: string,
  filename: string,
): Blob | null {
  const trimmed = uri.trim();
  if (!trimmed) return null;
  const name = filename.endsWith('.jpg') ? filename : `${filename}.jpg`;
  return { uri: trimmed, name, type: 'image/jpeg' } as unknown as Blob;
}

/** Prefer an existing draft file; otherwise rebuild from the preview URI. */
export function resolveUploadFile(
  file: Blob | null | undefined,
  uri: string | null | undefined,
  filename: string,
): Blob | null {
  if (file) return file;
  if (uri?.trim()) return nativeUploadFileFromUri(uri, filename);
  return null;
}

function loadImagePicker(): ImagePickerModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-image-picker') as ImagePickerModule;
  } catch {
    return null;
  }
}

type WebInput = {
  type: string;
  accept: string;
  files?: { 0?: File; length: number } | null;
  onchange: (() => void) | null;
  click: () => void;
};

/**
 * Open the device camera. `facing: 'front'` for selfie; `'back'` for ID card.
 * Returns null if permission denied, package missing, or user cancels.
 */
export async function captureFromCamera(opts?: {
  facing?: 'front' | 'back';
  /** Soft crop guide after shutter (ID card ≈ credit-card ratio). */
  aspect?: [number, number];
  filename?: string;
}): Promise<PickedImage | null> {
  const facing = opts?.facing ?? 'back';
  const filename = opts?.filename ?? (facing === 'front' ? 'selfie.jpg' : 'id.jpg');
  const ImagePicker = loadImagePicker();
  if (!ImagePicker) return null;

  if (Platform.OS !== 'web') {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return null;
      const cameraType =
        facing === 'front'
          ? (ImagePicker.CameraType?.front ?? 'front')
          : (ImagePicker.CameraType?.back ?? 'back');
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.85,
        exif: false,
        cameraType,
        allowsEditing: Boolean(opts?.aspect),
        aspect: opts?.aspect,
      });
      if (res.canceled || !res.assets?.length) return null;
      return toPicked(res.assets[0], filename);
    } catch {
      return null;
    }
  }

  // Web: prefer capture attribute; fall back to file picker.
  return pickImageFromGallery({ capture: facing === 'front' ? 'user' : 'environment' });
}

type GalleryPickOpts = {
  capture?: 'user' | 'environment';
  /** Cap how many images the user can select (e.g. remaining portfolio slots). */
  max?: number;
};

type WebFileList = {
  length: number;
  [index: number]: File | undefined;
};

/**
 * Gallery picker that can return one or many images.
 * Native: `allowsMultipleSelection` + `selectionLimit`.
 * Web: `<input type="file" multiple>`.
 */
export async function pickImagesFromGallery(
  opts?: GalleryPickOpts,
): Promise<PickedImage[]> {
  const max =
    opts?.max != null && Number.isFinite(opts.max)
      ? Math.max(0, Math.floor(opts.max))
      : undefined;
  if (max === 0) return [];

  if (Platform.OS !== 'web') {
    try {
      const ImagePicker = loadImagePicker();
      if (!ImagePicker) return [];
      const multi = max == null || max > 1;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        exif: false,
        allowsMultipleSelection: multi,
        ...(multi && max != null ? { selectionLimit: max } : {}),
      });
      if (res.canceled || !res.assets?.length) return [];
      const assets = max != null ? res.assets.slice(0, max) : res.assets;
      return assets.map((a, i) => toPicked(a, `photo-${i + 1}.jpg`));
    } catch {
      // expo-image-picker not in this build yet — rebuild the dev app.
      return [];
    }
  }

  return new Promise((resolve) => {
    type CaptureInput = WebInput & { capture?: string; multiple?: boolean };
    const doc = (globalThis as { document?: { createElement: (tag: string) => CaptureInput } })
      .document;
    if (!doc) return resolve([]);
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (opts?.capture) input.capture = opts.capture;
    if (max == null || max > 1) input.multiple = true;
    input.onchange = () => {
      const list = input.files as WebFileList | null | undefined;
      if (!list?.length) return resolve([]);
      const limit = max != null ? Math.min(list.length, max) : list.length;
      const out: PickedImage[] = [];
      for (let i = 0; i < limit; i++) {
        const file = list[i];
        if (!file || !file.type.startsWith('image/')) continue;
        const previewUri =
          typeof URL !== 'undefined' && 'createObjectURL' in URL
            ? URL.createObjectURL(file)
            : null;
        out.push({
          file,
          filename: file.name || `photo-${out.length + 1}.jpg`,
          previewUri,
          size: file.size,
        });
      }
      resolve(out);
    };
    input.click();
  });
}

/** Single-image gallery pick (avatar, ID, replace-one portfolio slot). */
export async function pickImageFromGallery(opts?: {
  capture?: 'user' | 'environment';
}): Promise<PickedImage | null> {
  const [one] = await pickImagesFromGallery({ ...opts, max: 1 });
  return one ?? null;
}
