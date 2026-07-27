/**
 * One photo picker that works everywhere: on the PHONE it opens the real
 * photo gallery (expo-image-picker); on web it falls back to the browser
 * file dialog. Returns a value the existing multipart upload endpoints
 * accept unchanged (a File on web, a React-Native file descriptor on
 * native — FormData understands both).
 */
import { Platform } from 'react-native';

export type PickedImage = {
  /** Value FormData accepts on this platform. */
  file: Blob;
  filename: string;
  /** Local URI for an instant <Image> preview, when available. */
  previewUri: string | null;
  /** Size in bytes when known (used for the 2.5 MB guard). */
  size: number | null;
};

type WebInput = {
  type: string;
  accept: string;
  files?: { 0?: File; length: number } | null;
  onchange: (() => void) | null;
  click: () => void;
};

export async function pickImageFromGallery(): Promise<PickedImage | null> {
  if (Platform.OS !== 'web') {
    try {
      type PickResult = {
        canceled: boolean;
        assets?: {
          uri: string;
          fileName?: string | null;
          mimeType?: string | null;
          fileSize?: number | null;
        }[];
      };
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ImagePicker = require('expo-image-picker') as {
        launchImageLibraryAsync: (opts: object) => Promise<PickResult>;
      };
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        exif: false,
      });
      if (res.canceled || !res.assets?.length) return null;
      const a = res.assets[0];
      const filename = a.fileName || 'photo.jpg';
      const type = a.mimeType || 'image/jpeg';
      // React Native FormData takes {uri, name, type} where web takes a Blob.
      const file = { uri: a.uri, name: filename, type } as unknown as Blob;
      return { file, filename, previewUri: a.uri, size: a.fileSize ?? null };
    } catch {
      // expo-image-picker not in this build yet — rebuild the dev app.
      return null;
    }
  }

  return new Promise((resolve) => {
    const doc = (globalThis as { document?: { createElement: (tag: string) => WebInput } })
      .document;
    if (!doc) return resolve(null);
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0] ?? null;
      if (!file || !file.type.startsWith('image/')) return resolve(null);
      const previewUri =
        typeof URL !== 'undefined' && 'createObjectURL' in URL ? URL.createObjectURL(file) : null;
      resolve({ file, filename: file.name || 'photo.jpg', previewUri, size: file.size });
    };
    input.click();
  });
}
