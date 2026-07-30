/**
 * Finger-drawn signature pad — plain PanResponder strokes rendered with
 * react-native-svg (already inside the built APK, so no rebuild). Emits the
 * compact {w,h,strokes} shape the sign endpoint validates and stores on
 * payment_voucher.pr_signature; the PDF re-draws the same points as ink.
 */
import React, { useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { C } from '../theme/theme';

export type SignatureInk = { w: number; h: number; strokes: [number, number][][] };

const PAD_H = 120;

function toPath(stroke: [number, number][]): string {
  return stroke.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ');
}

export function SignaturePad({ onChange }: { onChange: (ink: SignatureInk | null) => void }) {
  const [, setTick] = useState(0);
  const strokesRef = useRef<[number, number][][]>([]);
  const currentRef = useRef<[number, number][]>([]);
  const widthRef = useRef(1);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const redraw = () => setTick((t) => t + 1);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        currentRef.current = [[Math.round(locationX), Math.round(locationY)]];
        redraw();
      },
      onPanResponderMove: (e) => {
        const pts = currentRef.current;
        const last = pts[pts.length - 1];
        const x = Math.round(e.nativeEvent.locationX);
        const y = Math.round(e.nativeEvent.locationY);
        // Thin the stream: a point every ~2px keeps the JSON tiny and the
        // line still smooth.
        if (!last || Math.abs(x - last[0]) + Math.abs(y - last[1]) >= 2) {
          pts.push([x, y]);
          redraw();
        }
      },
      onPanResponderRelease: () => {
        if (currentRef.current.length >= 2) {
          strokesRef.current = [...strokesRef.current, currentRef.current];
          onChangeRef.current({
            w: Math.max(20, Math.round(widthRef.current)),
            h: PAD_H,
            strokes: strokesRef.current,
          });
        }
        currentRef.current = [];
        redraw();
      },
      onPanResponderTerminate: () => {
        currentRef.current = [];
        redraw();
      },
    }),
  ).current;

  const clear = () => {
    strokesRef.current = [];
    currentRef.current = [];
    onChangeRef.current(null);
    redraw();
  };

  const all = currentRef.current.length
    ? [...strokesRef.current, currentRef.current]
    : strokesRef.current;

  return (
    <View>
      <View
        style={styles.pad}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
        }}
        {...pan.panHandlers}
      >
        <Svg width="100%" height={PAD_H}>
          {all.map((s, i) => (
            <Path
              key={`s${i}`}
              d={toPath(s)}
              stroke={C.goldL}
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </Svg>
        {all.length === 0 && <Text style={styles.hint}>Sign here with your finger</Text>}
      </View>
      <Pressable onPress={clear} hitSlop={8} style={styles.clearBtn}>
        <Text style={styles.clearText}>Clear</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: {
    height: PAD_H,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  hint: { position: 'absolute', alignSelf: 'center', color: C.muted2, fontSize: 12 },
  clearBtn: { alignSelf: 'flex-end', marginTop: 6, paddingHorizontal: 4 },
  clearText: { color: C.muted, fontSize: 12 },
});
