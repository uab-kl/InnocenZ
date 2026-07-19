/**
 * Viewport size — `useWindowDimensions` can report a stale/small window on
 * react-native-web in some embedded browsers, so on web prefer the live
 * `window.innerWidth/Height` (still subscribing to dimension changes via the
 * RN hook so renders track resizes).
 */
import { Platform, useWindowDimensions } from 'react-native';

export function useViewportSize(): { width: number; height: number } {
  const dims = useWindowDimensions();
  if (Platform.OS !== 'web') return dims;
  const g = globalThis as { innerWidth?: number; innerHeight?: number };
  return {
    width: Math.max(dims.width, g.innerWidth ?? 0),
    height: Math.max(dims.height, g.innerHeight ?? 0),
  };
}
