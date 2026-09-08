/**
 * Full-image viewer: the tapped picture, whole and uncropped, on a dark
 * backdrop. FINGERS FIRST (owner, 20 Aug 2026: "the finger touch screen
 * cannot zoom in and out freely"): pinch to zoom, drag to move once zoomed,
 * double-tap to jump 1×↔2× — and the ✕ Return button is the ONE way to
 * close (owner's call: no tap-to-close; a stray tap must never dismiss) —
 * button (owner: closing must never depend on knowing the hidden tap), red =
 * close per the app's colour rule. The −/+ buttons stay for mouse users on
 * the web build — same clamp, same scale.
 *
 * ONE shared box so the profile photo, the comcard, the gallery, the outlet
 * logo, the shift picture and the receipt photos all zoom the same way.
 *
 * `ZoomHint` is the little magnifier chip that marks a picture as zoomable —
 * the owner's rule: the user must be TOLD a picture opens bigger, on every
 * picture that does.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { C, F } from '../theme/theme';
import { font } from '../theme/fonts';
import { useLocale } from '../i18n';
import { XIcon, ZoomIn } from './icons';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const STEP = 0.5;
/** Finger travel under this many px still counts as a tap. */
const TAP_JITTER_PX = 8;
/** Two taps inside this window = double-tap (same beat as the TopBar). */
const DOUBLE_TAP_MS = 280;

/** Structural touch types — the mobile tsconfig has no DOM lib. */
type WebTouch = { pageX: number; pageY: number };
type WebTouchList = { length: number; [index: number]: WebTouch };
type WebTouchEvent = {
  touches: WebTouchList;
  target: unknown;
  preventDefault: () => void;
};
type WebEventTarget = {
  addEventListener?: (
    type: string,
    handler: (e: WebTouchEvent) => void,
    options?: { passive?: boolean; capture?: boolean },
  ) => void;
  removeEventListener?: (
    type: string,
    handler: (e: WebTouchEvent) => void,
    options?: { capture?: boolean },
  ) => void;
};
type WebFrameNode = WebEventTarget & {
  contains?: (target: unknown) => boolean;
  ownerDocument?: WebEventTarget;
};

function touchDistance(a: { pageX: number; pageY: number }, b: { pageX: number; pageY: number }): number {
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

/**
 * Every ACTIVE finger on screen — not the thin `nativeEvent.touches` array.
 *
 * Why: on native Android, PanResponder / Responder `nativeEvent.touches` (and
 * even `gestureState.numberActiveTouches`) often stays at **1** for the whole
 * pinch. The browser path never hit this; the owner's real phone did
 * (20 Aug 2026). `touchHistory.touchBank` is the RN multi-touch source of
 * truth (currentPageX/Y + touchActive). Web falls back to `touches`.
 */
type Finger = { pageX: number; pageY: number };
type TouchBankEntry = {
  touchActive?: boolean;
  currentPageX?: number;
  currentPageY?: number;
};
function activeFingers(e: {
  touchHistory?: { touchBank?: ReadonlyArray<TouchBankEntry | null | undefined> };
  nativeEvent: { touches: WebTouchList | ReadonlyArray<WebTouch> };
}): Finger[] {
  const bank = e.touchHistory?.touchBank;
  if (bank && bank.length > 0) {
    const out: Finger[] = [];
    for (const t of bank) {
      if (t?.touchActive && typeof t.currentPageX === 'number' && typeof t.currentPageY === 'number') {
        out.push({ pageX: t.currentPageX, pageY: t.currentPageY });
      }
    }
    if (out.length > 0) return out;
  }
  const touches = e.nativeEvent.touches;
  const n = touches.length;
  const out: Finger[] = [];
  for (let i = 0; i < n; i++) {
    const t = touches[i];
    if (t) out.push({ pageX: t.pageX, pageY: t.pageY });
  }
  return out;
}

export function ImageLightbox({
  uri,
  onClose,
}: {
  /** Resolved URI (assetUrl already applied); null renders nothing. */
  uri: string | null;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // The gesture handlers close over refs, so they stay correct across
  // re-renders even though the prop object is recreated each pass.
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const frameSize = useRef({ w: 0, h: 0 });
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  /** Pinch baseline: finger gap + scale at the moment the 2nd finger landed. */
  const pinchBase = useRef<{ dist: number; scale: number } | null>(null);
  /** Pan baseline: finger + offset at the moment the drag started. */
  const panBase = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const moved = useRef(false);
  const lastTapAt = useRef(0);
  /** The ✕ Return bar and the −/+ row — single fingers there keep their
      native tap; everywhere else the gesture layer owns the touch. */
  const controlRefs = useRef<(View | null)[]>([null, null]);
  const attachTopBar = useCallback((n: View | null) => {
    controlRefs.current[0] = n;
  }, []);
  const attachControls = useCallback((n: View | null) => {
    controlRefs.current[1] = n;
  }, []);

  // CALLBACK ref, not useRef: the Modal portals its content in a tick AFTER
  // the commit that set `uri`, so an effect keyed on [uri] runs while the
  // frame is still null and silently attaches nothing (proven live 20 Aug
  // 2026 — the by-hand probe listener worked, the component's never fired).
  // State re-runs the effect the moment the node actually exists.
  const [frameNode, setFrameNode] = useState<View | null>(null);
  const frameRef = useRef<View | null>(null);
  // STABLE identity (useCallback): an inline ref function is new every render,
  // so React detaches/reattaches it on EACH render — and every pinch step
  // renders — cycling the effect and wiping the gesture mid-pinch (proven
  // live: touchstart logged, the very next touchmove found active=false).
  const attachFrame = useCallback((n: View | null) => {
    frameRef.current = n;
    setFrameNode(n);
  }, []);

  const clampOffset = (x: number, y: number, atScale: number) => {
    // Keep the picture on screen: at scale s the frame can slide at most
    // half of the extra size in each direction. resizeMode="contain" may
    // letterbox, so this is a bound, not a fit — good enough to stop the
    // photo being flicked into the void.
    const maxX = (frameSize.current.w * (atScale - 1)) / 2;
    const maxY = (frameSize.current.h * (atScale - 1)) / 2;
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  };

  const applyScale = (next: number) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    scaleRef.current = clamped;
    setScale(clamped);
    // Snapping back to 1× recentres — a photo left parked off-screen from an
    // earlier pan reads as a failed load.
    if (clamped === MIN_SCALE) {
      offsetRef.current = { x: 0, y: 0 };
      setOffset({ x: 0, y: 0 });
    } else {
      const bounded = clampOffset(offsetRef.current.x, offsetRef.current.y, clamped);
      offsetRef.current = bounded;
      setOffset(bounded);
    }
  };

  const applyOffset = (x: number, y: number) => {
    const bounded = clampOffset(x, y, scaleRef.current);
    offsetRef.current = bounded;
    setOffset(bounded);
  };

  /** Double-tap toggles 1×↔2×. A lone tap does NOTHING — closing is the
      ✕ Return button's job alone (owner, 20 Aug 2026: a tap that closes can
      fire mid-fumbled-pinch and reads as the viewer breaking). */
  const handleTap = () => {
    const now = Date.now();
    if (now - lastTapAt.current < DOUBLE_TAP_MS) {
      lastTapAt.current = 0;
      applyScale(scaleRef.current > MIN_SCALE ? MIN_SCALE : 2);
      return;
    }
    lastTapAt.current = now;
  };

  /** Shared pinch / pan / tap math — used by native onTouch* AND the web
      document listeners. Kept outside any responder so a second finger that
      Android refuses to feed through PanResponder still reaches us. */
  const onFingers = (fingers: Finger[], phase: 'start' | 'move' | 'end') => {
    if (phase === 'end') {
      if (fingers.length === 0) {
        const wasMoved = moved.current;
        pinchBase.current = null;
        panBase.current = null;
        moved.current = false;
        if (!wasMoved) handleTap();
      } else {
        // One finger left after a pinch — re-baseline pan on next move.
        pinchBase.current = null;
        panBase.current = null;
      }
      return;
    }
    if (fingers.length >= 2) {
      const d = touchDistance(fingers[0], fingers[1]);
      if (!pinchBase.current || phase === 'start') {
        pinchBase.current = { dist: d || 1, scale: scaleRef.current };
        panBase.current = null;
      }
      moved.current = true;
      applyScale(pinchBase.current.scale * (d / pinchBase.current.dist));
      return;
    }
    pinchBase.current = null;
    if (fingers.length === 1 && scaleRef.current > MIN_SCALE) {
      // NOT `t` — that name belongs to the locale in this component.
      const finger = fingers[0];
      if (!panBase.current || phase === 'start') {
        panBase.current = {
          x: finger.pageX,
          y: finger.pageY,
          ox: offsetRef.current.x,
          oy: offsetRef.current.y,
        };
      }
      const dx = finger.pageX - panBase.current.x;
      const dy = finger.pageY - panBase.current.y;
      if (Math.hypot(dx, dy) > TAP_JITTER_PX) moved.current = true;
      applyOffset(panBase.current.ox + dx, panBase.current.oy + dy);
    }
  };

  // NATIVE: raw onTouch* — PanResponder on Android often reports touches.length
  // === 1 for a whole pinch AND can stop delivering Move the moment finger 2
  // lands (owner's phone, 20 Aug 2026). onTouchMove keeps both fingers.
  // Claim the responder so a parent ScrollView cannot steal the drag, but do
  // NOT capture on start (✕ Return / −/+ Pressables must still win their hits).
  const nativeTouchProps =
    Platform.OS === 'web'
      ? {}
      : {
          onStartShouldSetResponder: () => true,
          onMoveShouldSetResponder: () => true,
          onResponderTerminationRequest: () => false,
          onTouchStart: (e: {
            touchHistory?: { touchBank?: ReadonlyArray<TouchBankEntry | null | undefined> };
            nativeEvent: { touches: WebTouchList };
          }) => {
            const fingers = activeFingers(e);
            // A brand-new ONE-finger contact resets the tap/pan baselines.
            // A SECOND finger landing (length >= 2) must NOT wipe `moved` —
            // that is the pinch starting, and Android does fire touchStart
            // for finger 2.
            if (fingers.length < 2) {
              moved.current = false;
              pinchBase.current = null;
              panBase.current = null;
              return;
            }
            onFingers(fingers, 'start');
          },
          onTouchMove: (e: {
            touchHistory?: { touchBank?: ReadonlyArray<TouchBankEntry | null | undefined> };
            nativeEvent: { touches: WebTouchList };
          }) => {
            onFingers(activeFingers(e), 'move');
          },
          onTouchEnd: (e: {
            touchHistory?: { touchBank?: ReadonlyArray<TouchBankEntry | null | undefined> };
            nativeEvent: { touches: WebTouchList };
          }) => {
            // Prefer nativeEvent.touches length on end — touchBank can lag one
            // frame with touchActive still true on the finger that just lifted,
            // which would skip the tap/close baseline reset.
            const remaining = e.nativeEvent.touches?.length ?? 0;
            if (remaining === 0) onFingers([], 'end');
            else onFingers(activeFingers(e), 'end');
          },
          onTouchCancel: () => {
            onFingers([], 'end');
          },
        };

  // Web uses the document listeners below; native uses onTouch* above.

  // A fresh picture always opens at 1×, centred.
  useEffect(() => {
    scaleRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [uri]);

  // WEB (the phone browser on 8081): the RN-web gesture layer proved
  // unreliable for the SECOND finger on a real device (owner, 20 Aug 2026 —
  // "test on my phone devices not yet work"), so the pinch listens to the
  // browser's raw touch events instead, non-passive so preventDefault()
  // actually stops the page from zooming. Native keeps the PanResponder.
  useEffect(() => {
    if (Platform.OS !== 'web' || !uri) return;
    const node = frameNode as unknown as WebFrameNode | null;
    // DOCUMENT capture, not the frame: RN-web's root intercepts touch events
    // in the capture phase, so NO listener on an element inside it — bubble or
    // capture — ever hears a touch that targets the <img>. Proven live 20 Aug
    // 2026: the same pinch fired at the img was silent on frame listeners in
    // both phases and loud on the frame node itself. The document sits ABOVE
    // the root in the capture path, so it hears every finger first; touches
    // that do not start inside the frame are ignored (so ✕ / −/+ keep working).
    const doc = node?.ownerDocument;
    if (!node?.contains || !doc?.addEventListener || !doc.removeEventListener) return;

    let pinch: { dist: number; scale: number } | null = null;
    let pan: { x: number; y: number; ox: number; oy: number } | null = null;
    let movedHere = false;
    let active = false;

    const onTouchStart = (ev: WebTouchEvent) => {
      // TWO fingers anywhere = pinch. In a natural pinch the second finger
      // lands wherever the hand is — usually OFF the picture — and requiring
      // both fingers to start on the frame handed the gesture to the browser
      // (owner's phone, 20 Aug 2026: "still can't 2 finger spread"). The
      // viewer fills the screen, so any two-finger start can only mean zoom;
      // nobody two-finger-taps the ✕ or −/+ buttons.
      if (ev.touches.length >= 2) {
        active = true;
        ev.preventDefault();
        pinch = { dist: touchDistance(ev.touches[0], ev.touches[1]) || 1, scale: scaleRef.current };
        pan = null;
        movedHere = true;
        return;
      }
      // ONE finger: the ✕ Return and −/+ keep their native tap; EVERYWHERE
      // else the touch is claimed (preventDefault) immediately. This matters
      // for the thumb-first pinch: if the first finger lands on the backdrop
      // un-prevented, the browser owns the sequence before the second finger
      // arrives and the pinch dies (owner's phone, 20 Aug 2026).
      const onControls = controlRefs.current.some((c) =>
        (c as unknown as WebFrameNode | null)?.contains?.(ev.target),
      );
      if (onControls) return;
      active = true;
      ev.preventDefault();
      movedHere = false;
    };
    const onTouchMove = (ev: WebTouchEvent) => {
      if (!active) return;
      ev.preventDefault();
      if (ev.touches.length >= 2) {
        const d = touchDistance(ev.touches[0], ev.touches[1]);
        if (!pinch) pinch = { dist: d || 1, scale: scaleRef.current };
        movedHere = true;
        applyScale(pinch.scale * (d / pinch.dist));
        return;
      }
      pinch = null;
      if (ev.touches.length === 1 && scaleRef.current > MIN_SCALE) {
        // NOT `t` — that name belongs to the locale in this component.
        const finger = ev.touches[0];
        if (!pan) {
          pan = {
            x: finger.pageX,
            y: finger.pageY,
            ox: offsetRef.current.x,
            oy: offsetRef.current.y,
          };
        }
        if (Math.hypot(finger.pageX - pan.x, finger.pageY - pan.y) > TAP_JITTER_PX) {
          movedHere = true;
        }
        applyOffset(pan.ox + (finger.pageX - pan.x), pan.oy + (finger.pageY - pan.y));
      }
    };
    const onTouchEnd = (ev: WebTouchEvent) => {
      if (!active) return;
      if (ev.touches.length === 0) {
        active = false;
        pinch = null;
        pan = null;
        if (!movedHere) handleTap();
        movedHere = false;
      } else {
        // One finger left (pinch ended): re-baseline the pan on its next move.
        pinch = null;
        pan = null;
      }
    };

    const opts = { passive: false, capture: true };
    doc.addEventListener('touchstart', onTouchStart, opts);
    doc.addEventListener('touchmove', onTouchMove, opts);
    doc.addEventListener('touchend', onTouchEnd, opts);
    doc.addEventListener('touchcancel', onTouchEnd, opts);
    return () => {
      doc.removeEventListener?.('touchstart', onTouchStart, { capture: true });
      doc.removeEventListener?.('touchmove', onTouchMove, { capture: true });
      doc.removeEventListener?.('touchend', onTouchEnd, { capture: true });
      doc.removeEventListener?.('touchcancel', onTouchEnd, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs + stable setters only
  }, [uri, frameNode]);
  if (!uri) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* Plain View, NOT a closing Pressable: the ✕ Return button is the ONE
          way out (owner's call) — plus the hardware back via onRequestClose. */}
      <View
        style={s.backdrop}
        // NATIVE (Expo on the phone): onTouch* on the WHOLE viewer — see
        // nativeTouchProps. PanResponder was dropped: Android reports one
        // finger through it and can stop Move when finger 2 lands.
        // ✕ Return / −/+ Pressables still win their own one-finger taps
        // (deepest touchable claims the responder first; we do not capture).
        {...nativeTouchProps}
      >
        {/* The way OUT, stated. Red = close. */}
        <View style={s.topBar} ref={attachTopBar} pointerEvents="box-none">
          <Pressable style={s.returnBtn} onPress={onClose} hitSlop={8}>
            <XIcon size={14} color={C.red} strokeWidth={2.4} />
            <Text style={s.returnText}>{t.profile.viewerReturn}</Text>
          </Pressable>
        </View>
        <View
          ref={attachFrame}
          // `touchAction: none` (web only): without it the phone BROWSER takes
          // the pinch for page zoom and the picture never sees the 2nd finger.
          // Native ignores the prop — it is not a valid RN style there.
          style={[
            s.imgFrame,
            Platform.OS === 'web'
              ? ({ touchAction: 'none' } as unknown as ViewStyle)
              : null,
          ]}
          onLayout={(e) => {
            frameSize.current = {
              w: e.nativeEvent.layout.width,
              h: e.nativeEvent.layout.height,
            };
          }}
        >
          <View style={s.img} pointerEvents="none">
            <Image
              source={{ uri }}
              style={[
                s.img,
                {
                  transform: [
                    { translateX: offset.x },
                    { translateY: offset.y },
                    { scale },
                  ],
                },
              ]}
              resizeMode="contain"
            />
          </View>
        </View>
        <View style={s.controls} ref={attachControls} pointerEvents="box-none">
          <Pressable
            style={[s.zoomBtn, scale <= MIN_SCALE && s.zoomBtnOff]}
            disabled={scale <= MIN_SCALE}
            onPress={() => applyScale(scale - STEP)}
            hitSlop={6}
          >
            <Text style={s.zoomBtnText}>−</Text>
          </Pressable>
          <Text style={s.zoomPct}>{Math.round(scale * 100)}%</Text>
          <Pressable
            style={[s.zoomBtn, scale >= MAX_SCALE && s.zoomBtnOff]}
            disabled={scale >= MAX_SCALE}
            onPress={() => applyScale(scale + STEP)}
            hitSlop={6}
          >
            <Text style={s.zoomBtnText}>+</Text>
          </Pressable>
        </View>
        <Text style={s.hint}>{t.profile.viewerHint}</Text>
      </View>
    </Modal>
  );
}

/**
 * Magnifier chip overlaid on a zoomable picture. The PARENT positions it —
 * default bottom-right; pass `style` to move it. `pointerEvents="none"` so it
 * never steals the tap from the picture underneath it.
 */
export function ZoomHint({
  size = 22,
  style,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.chip, { width: size, height: size }, style]} pointerEvents="none">
      <ZoomIn size={Math.round(size * 0.55)} color="#fff" strokeWidth={2.2} />
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(6,3,12,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  /** Red = dismiss — mirrors the app's close buttons (PaymentScreen dangerBtn). */
  returnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(240,110,130,0.45)',
    backgroundColor: 'rgba(240,110,130,0.14)',
  },
  returnText: { ...font(700), fontSize: 13, color: C.red },
  imgFrame: { width: '100%', height: '72%', overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 12,
  },
  zoomBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  zoomBtnOff: { opacity: 0.35 },
  zoomBtnText: { ...font(700), fontSize: 20, color: '#fff', lineHeight: 24 },
  zoomPct: { ...font(), fontSize: 13, color: C.txt, minWidth: 48, textAlign: 'center' },
  hint: {
    marginTop: 10,
    ...font(),
    fontSize: 12,
    color: C.muted2,
  },
  chip: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
});
