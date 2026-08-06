/**
 * Receipt camera + on-phone OCR — build steps 2A-1 + 2A-2.
 *
 * captureReceiptPhoto(): opens the camera (falls back to the photo library,
 * which is also what the web preview uses), then downscales the shot to a
 * bounded JPEG data URL so it fits payment_voucher_line.proof_photos.
 *
 * recognizeReceiptText(): feeds the photo to Google's FREE on-device text
 * reader (ML Kit, @react-native-ml-kit/text-recognition — no account, no key,
 * works offline). Returns null when the OCR engine isn't available in this
 * build (web preview / Expo Go) — callers then fall back to manual self-log.
 */
import { Platform } from 'react-native';

export type ReceiptShot = {
  /** Local file URI — what ML Kit reads. */
  uri: string;
  /** Downscaled JPEG data URL — attached as the proof photo. Null if unavailable. */
  dataUrl: string | null;
};

/** Keep proof photos under the backend's 1.5 MB per-photo schema cap. */
const MAX_PROOF_CHARS = 1_400_000;

async function downscale(uri: string): Promise<{ uri: string; dataUrl: string | null }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const manip = require('expo-image-manipulator');
    const manipulateAsync = manip.manipulateAsync ?? manip.default?.manipulateAsync;
    const SaveFormat = manip.SaveFormat ?? manip.default?.SaveFormat;
    if (!manipulateAsync) return { uri, dataUrl: null };
    const out = await manipulateAsync(uri, [{ resize: { width: 1024 } }], {
      compress: 0.7,
      format: SaveFormat?.JPEG ?? 'jpeg',
      base64: true,
    });
    const dataUrl = out?.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
    return {
      uri: out?.uri ?? uri,
      dataUrl: dataUrl && dataUrl.length <= MAX_PROOF_CHARS ? dataUrl : null,
    };
  } catch {
    return { uri, dataUrl: null };
  }
}

/**
 * Snap (or pick) the receipt photo. Camera first on the phone; library picker
 * as the fallback and on web. Resolves null when the PR cancels.
 */
export async function captureReceiptPhoto(): Promise<ReceiptShot | null> {
  type PickResult = {
    canceled: boolean;
    assets?: { uri: string; base64?: string | null }[];
  };
  type ImagePickerModule = {
    requestCameraPermissionsAsync: () => Promise<{ granted: boolean }>;
    launchCameraAsync: (opts: object) => Promise<PickResult>;
    launchImageLibraryAsync: (opts: object) => Promise<PickResult>;
  };
  let ImagePicker: ImagePickerModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ImagePicker = require('expo-image-picker') as ImagePickerModule;
  } catch {
    return null; // package not installed yet — run the install step first
  }

  let result: PickResult | null = null;

  if (Platform.OS !== 'web') {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.granted) {
        result = await ImagePicker.launchCameraAsync({ quality: 1, exif: false });
      }
    } catch {
      result = null;
    }
  }
  if (!result || result.canceled || !result.assets?.length) {
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        exif: false,
      });
    } catch {
      return null;
    }
  }
  if (!result || result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  // OCR reads the FULL-RESOLUTION photo (small print like the time line needs
  // every pixel); only the proof copy is downscaled to fit the database cap.
  const { dataUrl } = await downscale(asset.uri);
  return { uri: asset.uri, dataUrl };
}

/**
 * Pick EXISTING photos from the library — no camera, no OCR.
 *
 * captureReceiptPhoto() opens the camera first and only falls back to the
 * library, which is right when the PR is standing at the till with a paper
 * receipt in hand. It is wrong for a control labelled "Attach files (images)",
 * where the photo they want was taken hours ago.
 *
 * Returns downscaled data URLs, already bounded by MAX_PROOF_CHARS. An empty
 * array means cancelled, denied, or a build without expo-image-picker — the
 * caller decides what to say about that, because saying nothing is what made
 * this button look broken in the first place.
 */
export async function pickPhotosFromLibrary(multiple = true): Promise<string[]> {
  type PickResult = { canceled: boolean; assets?: { uri: string }[] };
  type ImagePickerModule = {
    launchImageLibraryAsync: (opts: object) => Promise<PickResult>;
  };
  let ImagePicker: ImagePickerModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ImagePicker = require('expo-image-picker') as ImagePickerModule;
  } catch {
    return [];
  }
  let result: PickResult | null = null;
  try {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: multiple,
      quality: 1,
      exif: false,
    });
  } catch {
    return [];
  }
  if (!result || result.canceled || !result.assets?.length) return [];
  const shots = await Promise.all(result.assets.map((a) => downscale(a.uri)));
  // A photo too large to store is dropped here rather than sent to fail server-side.
  return shots.map((s) => s.dataUrl).filter((u): u is string => !!u);
}

/**
 * Photo → words (build step 2A-2). Every word the camera saw comes back as one
 * text blob, line by line. Null = OCR engine not available in this build
 * (web preview / Expo Go / package not installed) — NOT "unreadable receipt".
 */
export async function recognizeReceiptText(uri: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-ml-kit/text-recognition');
    const TextRecognition = mod.default ?? mod;
    if (!TextRecognition?.recognize) return null;
    const result = await TextRecognition.recognize(uri); // ← reads the photo

    /*
     * BOTH of ML Kit's representations, deduped — not just `result.text`.
     *
     * `result.text` is the flattened blob: the engine's blocks joined in ITS
     * reading order, which on a tilted or glared photo can interleave a
     * receipt's columns and separate "1 Tips" from its own line.
     * `blocks[].lines[]` is ML Kit's own line segmentation and survives that
     * far better.
     *
     * The two disagree often enough that one scan of this receipt found Havoc
     * and the next found only Booking commission. Feeding both costs nothing:
     * the parser matches per line and keys results by menu id, so a line
     * present in both forms is still matched once, while a name mangled in one
     * form can be found in the other. It also gives the date/order/time regexes
     * a second reading of the line they need.
     */
    const lines = new Set<string>();
    const add = (value: unknown) => {
      if (typeof value !== 'string') return;
      for (const raw of value.split(/\r?\n/)) {
        const trimmed = raw.trim();
        if (trimmed) lines.add(trimmed);
      }
    };

    add(result?.text);
    for (const block of result?.blocks ?? []) {
      for (const line of block?.lines ?? []) add(line?.text);
    }
    return [...lines].join('\n');
  } catch {
    return null;
  }
}
