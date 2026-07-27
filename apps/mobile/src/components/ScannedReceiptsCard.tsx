/**
 * "What have I scanned?" — the receipt photos captured this shift, grouped by
 * category (Drinks vs Tips/Service) with a picture count per group. Shown on
 * the Scan page (above Back to attendance) and on Check-In (above Check out),
 * fed by the same current-week receipt lines the STATUS table uses.
 */
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, F } from '../theme/theme';
import type { PrReceiptLine } from '../lib/api';

type PhotoGroup = { label: string; photos: string[]; lineCount: number };

/** Photos per category — a line's proofPhotos are the scanned receipt shots. */
export function collectReceiptPhotoGroups(lines: PrReceiptLine[]): PhotoGroup[] {
  const defs: { label: string; match: (kind: string) => boolean }[] = [
    { label: 'Drinks', match: (k) => k === 'drinks' },
    { label: 'Tips / Service', match: (k) => k === 'tips' || k === 'others' },
  ];
  return defs
    .map((d) => {
      const rows = lines.filter((l) => d.match(l.kind));
      return {
        label: d.label,
        photos: rows.flatMap((l) => l.proofPhotos ?? []),
        lineCount: rows.length,
      };
    })
    .filter((g) => g.photos.length > 0);
}

export function ScannedReceiptsCard({
  lines,
  title = 'Scanned receipts · this shift',
}: {
  lines: PrReceiptLine[];
  title?: string;
}) {
  const groups = collectReceiptPhotoGroups(lines);
  if (groups.length === 0) return null;
  return (
    <View style={s.card}>
      <Text style={s.title}>{title}</Text>
      {groups.map((g) => (
        <View key={g.label} style={s.group}>
          <Text style={s.groupLabel}>
            {g.label} · {g.photos.length} picture{g.photos.length === 1 ? '' : 's'} ·{' '}
            {g.lineCount} item{g.lineCount === 1 ? '' : 's'} logged
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.thumbs}>
              {g.photos.map((src, i) => (
                <Image key={`${i}-${src.slice(0, 24)}`} source={{ uri: src }} style={s.thumb} />
              ))}
            </View>
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(232,194,122,0.3)',
    backgroundColor: 'rgba(232,194,122,0.05)',
    padding: 12,
  },
  title: {
    fontFamily: F.sora,
    fontSize: 13,
    fontWeight: '800',
    color: C.goldL,
  },
  group: { marginTop: 10 },
  groupLabel: {
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.prMuted,
    marginBottom: 6,
  },
  thumbs: { flexDirection: 'row', gap: 8 },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
});
