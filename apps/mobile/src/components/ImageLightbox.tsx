/**
 * Full-image viewer: the tapped picture, whole and uncropped, on a dark
 * backdrop — −/+ to zoom, tap anywhere else to close. ONE shared box so the
 * profile photo, the comcard, the gallery, the outlet logo, the shift picture
 * and the receipt photos all zoom the same way (owner, 20 Aug 2026).
 *
 * `ZoomHint` is the little magnifier chip that marks a picture as zoomable —
 * the owner's rule: the user must be TOLD a picture opens bigger, on every
 * picture that does.
 */
import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { C, F } from '../theme/theme';
import { ZoomIn } from './icons';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const STEP = 0.5;

export function ImageLightbox({
  uri,
  onClose,
}: {
  /** Resolved URI (assetUrl already applied); null renders nothing. */
  uri: string | null;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  // A fresh picture always opens at 1× — a zoom left over from the previous
  // photo reads as a failed load.
  useEffect(() => {
    setScale(1);
  }, [uri]);
  if (!uri) return null;
  const zoomTo = (next: number) => setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, next)));
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <View style={s.imgFrame} pointerEvents="none">
          <Image source={{ uri }} style={[s.img, { transform: [{ scale }] }]} resizeMode="contain" />
        </View>
        <View style={s.controls}>
          <Pressable
            style={[s.zoomBtn, scale <= MIN_SCALE && s.zoomBtnOff]}
            disabled={scale <= MIN_SCALE}
            onPress={() => zoomTo(scale - STEP)}
            hitSlop={6}
          >
            <Text style={s.zoomBtnText}>−</Text>
          </Pressable>
          <Text style={s.zoomPct}>{Math.round(scale * 100)}%</Text>
          <Pressable
            style={[s.zoomBtn, scale >= MAX_SCALE && s.zoomBtnOff]}
            disabled={scale >= MAX_SCALE}
            onPress={() => zoomTo(scale + STEP)}
            hitSlop={6}
          >
            <Text style={s.zoomBtnText}>+</Text>
          </Pressable>
        </View>
        <Text style={s.hint}>Zoom with − / + · tap anywhere to close</Text>
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
  imgFrame: { width: '100%', height: '76%', overflow: 'hidden' },
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
