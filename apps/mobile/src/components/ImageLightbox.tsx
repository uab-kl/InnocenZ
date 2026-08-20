/**
 * Full-image viewer: the tapped picture, whole and uncropped, on a dark
 * backdrop. FINGERS FIRST (owner, 20 Aug 2026: "the finger touch screen
 * cannot zoom in and out freely"): pinch to zoom, drag to move once zoomed,
 * double-tap to jump 1×↔2×, tap once to close — plus a visible ✕ Return
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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { C, F } from '../theme/theme';
import { XIcon, ZoomIn } from './icons';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const STEP = 0.5;
/** Finger travel under this many px still counts as a tap. */
const TAP_JITTER_PX = 8;
/** Two taps inside this window = double-tap (same beat as the TopBar). */
const DOUBLE_TAP_MS = 280;

function touchDistance(touches: { pageX: number; pageY: number }[]): number {
  return Math.hypot(
    touches[0].pageX - touches[1].pageX,
    touches[0].pageY - touches[1].pageY,
  );
}

export function ImageLightbox({
  uri,
  onClose,
}: {
  /** Resolved URI (assetUrl already applied); null renders nothing. */
  uri: string | null;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // The PanResponder is created once, so everything it reads lives in refs —
  // reading state directly would freeze the gesture at the first render's
  // values (the classic stale-closure bug).
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
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          moved.current = false;
          pinchBase.current = null;
          panBase.current = null;
        },
        onPanResponderMove: (e, g) => {
          const touches = e.nativeEvent.touches;
          if (touches.length >= 2) {
            // PINCH. Baseline resets whenever the 2nd finger (re)lands, so a
            // lift-and-repinch never jumps.
            const d = touchDistance(touches);
            if (!pinchBase.current) {
              pinchBase.current = { dist: d || 1, scale: scaleRef.current };
              panBase.current = null;
            }
            moved.current = true;
            applyScale(pinchBase.current.scale * (d / pinchBase.current.dist));
            return;
          }
          pinchBase.current = null;
          if (touches.length === 1 && scaleRef.current > MIN_SCALE) {
            // DRAG the zoomed picture. Baseline resets when the drag starts
            // (including after a pinch ends on one finger — no jump).
            const t = touches[0];
            if (!panBase.current) {
              panBase.current = {
                x: t.pageX,
                y: t.pageY,
                ox: offsetRef.current.x,
                oy: offsetRef.current.y,
              };
            }
            if (Math.hypot(g.dx, g.dy) > TAP_JITTER_PX) moved.current = true;
            applyOffset(
              panBase.current.ox + (t.pageX - panBase.current.x),
              panBase.current.oy + (t.pageY - panBase.current.y),
            );
            return;
          }
          if (Math.hypot(g.dx, g.dy) > TAP_JITTER_PX) moved.current = true;
        },
        onPanResponderRelease: () => {
          pinchBase.current = null;
          panBase.current = null;
          if (moved.current) return;
          // A clean tap. Double-tap toggles 1×↔2×; a lone tap closes after
          // one beat (the wait is what tells the two apart).
          if (tapTimer.current) {
            clearTimeout(tapTimer.current);
            tapTimer.current = null;
            applyScale(scaleRef.current > MIN_SCALE ? MIN_SCALE : 2);
            return;
          }
          tapTimer.current = setTimeout(() => {
            tapTimer.current = null;
            onCloseRef.current();
          }, DOUBLE_TAP_MS);
        },
        onPanResponderTerminate: () => {
          pinchBase.current = null;
          panBase.current = null;
        },
      }),
    [],
  );

  // A fresh picture always opens at 1×, centred.
  useEffect(() => {
    scaleRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [uri]);
  useEffect(() => {
    return () => {
      if (tapTimer.current) clearTimeout(tapTimer.current);
    };
  }, []);

  if (!uri) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        {/* The way OUT, stated — never only the hidden tap. Red = close. */}
        <View style={s.topBar}>
          <Pressable style={s.returnBtn} onPress={onClose} hitSlop={8}>
            <XIcon size={14} color={C.red} strokeWidth={2.4} />
            <Text style={s.returnText}>Return</Text>
          </Pressable>
        </View>
        <View
          // `touchAction: none` (web only): without it the phone BROWSER takes
          // the pinch for page zoom and the picture never sees the 2nd finger.
          // Native ignores the prop — it is not a valid RN style there.
          style={[
            s.imgFrame,
            Platform.OS === 'web'
              ? ({ touchAction: 'none' } as unknown as ViewStyle)
              : null,
          ]}
          {...responder.panHandlers}
          onLayout={(e) => {
            frameSize.current = {
              w: e.nativeEvent.layout.width,
              h: e.nativeEvent.layout.height,
            };
          }}
        >
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
        <View style={s.controls}>
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
        <Text style={s.hint}>
          Pinch or double-tap to zoom · drag to move · tap once to close
        </Text>
      </Pressable>
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
  returnText: { fontFamily: F.sora, fontSize: 13, fontWeight: '700', color: C.red },
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
  zoomBtnText: { fontFamily: F.sora, fontSize: 20, fontWeight: '700', color: '#fff', lineHeight: 24 },
  zoomPct: { fontFamily: F.manrope, fontSize: 13, color: C.txt, minWidth: 48, textAlign: 'center' },
  hint: {
    marginTop: 10,
    fontFamily: F.manrope,
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
