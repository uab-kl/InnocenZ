/**
 * Lock PhoneFrame's ScrollView while a portfolio drag is active, and allow
 * programmatic edge-auto-scroll so a drag from slot 8 can still reach slot 1.
 *
 * Locking uses setNativeProps (no React re-render) so the PanResponder touch
 * is not torn down mid-gesture.
 */
import type { ScrollView } from 'react-native';

type ScrollTarget = ScrollView;

let lockCount = 0;
let scrollRef: ScrollTarget | null = null;
let scrollY = 0;
let viewportH = 0;
let contentH = 0;
/** ScrollView frame in window coords — edge detect must use this, not screen 0. */
let windowTop = 0;
let windowH = 0;

const EDGE = 96;

function applyLock() {
  scrollRef?.setNativeProps?.({ scrollEnabled: lockCount === 0 });
}

/** PhoneFrame registers its ScrollView once mounted. */
export function registerPhoneScrollView(ref: ScrollTarget | null) {
  scrollRef = ref;
  applyLock();
  refreshPhoneScrollWindow();
}

/** Called from PhoneFrame onScroll / onLayout so auto-scroll knows bounds. */
export function notePhoneScrollMetrics(
  offsetY: number | undefined,
  viewportHeight: number | undefined,
  contentHeight: number | undefined,
) {
  if (typeof offsetY === 'number') scrollY = offsetY;
  if (typeof viewportHeight === 'number' && viewportHeight > 0) viewportH = viewportHeight;
  if (typeof contentHeight === 'number' && contentHeight > 0) contentH = contentHeight;
}

/** Re-measure ScrollView on screen (call when a drag starts). */
export function refreshPhoneScrollWindow(then?: () => void) {
  const node = scrollRef as (ScrollTarget & {
    measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void;
  }) | null;
  if (!node?.measureInWindow) {
    then?.();
    return;
  }
  node.measureInWindow((_x, y, _w, h) => {
    windowTop = y;
    if (h > 0) {
      windowH = h;
      viewportH = h;
    }
    then?.();
  });
}

/**
 * -1 = scroll up (finger near top of ScrollView), +1 = scroll down, 0 = none.
 * Uses the ScrollView's window rect so the TopBar doesn't block detection.
 */
export function autoScrollDirectionForFinger(pageY: number): -1 | 0 | 1 {
  const h = windowH > 0 ? windowH : viewportH;
  if (h <= 0) return 0;
  const top = windowTop;
  const bottom = windowTop + h;
  if (pageY <= top + EDGE) return -1;
  if (pageY >= bottom - EDGE) return 1;
  return 0;
}

export function getPhoneScrollY() {
  return scrollY;
}

export function getPhoneViewportHeight() {
  return windowH > 0 ? windowH : viewportH;
}

/**
 * Programmatic scroll while drag has scrollEnabled=false.
 * Returns the actual delta applied (0 if already at edge).
 *
 * Android often ignores scrollTo while scrollEnabled is false — briefly
 * re-enable for the programmatic jump, then lock again.
 */
export function scrollPhoneBy(dy: number): number {
  if (!scrollRef || dy === 0) return 0;
  const vh = viewportH > 0 ? viewportH : windowH;
  if (vh <= 0) return 0;
  const maxY = contentH > vh ? Math.max(0, contentH - vh) : Math.max(scrollY + Math.abs(dy), 0);
  const next = Math.max(0, Math.min(maxY, scrollY + dy));
  const applied = next - scrollY;
  if (Math.abs(applied) < 0.5) return 0;
  scrollY = next;
  // Momentary unlock so native scrollTo actually moves content on Android.
  scrollRef.setNativeProps?.({ scrollEnabled: true });
  scrollRef.scrollTo({ y: next, animated: false });
  if (lockCount > 0) {
    scrollRef.setNativeProps?.({ scrollEnabled: false });
  }
  return applied;
}

export function lockPhoneScroll() {
  lockCount += 1;
  applyLock();
  refreshPhoneScrollWindow();
}

export function unlockPhoneScroll() {
  lockCount = Math.max(0, lockCount - 1);
  applyLock();
}
