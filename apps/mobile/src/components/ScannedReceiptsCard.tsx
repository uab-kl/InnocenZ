/**
 * "What have I scanned?" — the receipt photos captured this shift, grouped by
 * category (Drinks vs Tips/Service) with a picture count per group. Shown on
 * the Scan page (above Back to attendance) and on Check-In (above Check out),
 * fed by the same current-week receipt lines the STATUS table uses.
 */
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, F } from '../theme/theme';
import { font } from '../theme/fonts';
import type { PrReceiptLine } from '../lib/api';
import { resolveProofPhotoUri } from '../lib/proof-photo';
import { formatMessage, useLocale, type AppTranslations } from '../i18n';

/**
 * `id` is a STABLE ENGLISH id, never the heading. It is this row's React key,
 * and a key made of copy would remount every thumbnail on a locale switch.
 */
type PhotoGroup = {
  id: 'drinks' | 'tipsService';
  photos: string[];
  lineCount: number;
};

/** The heading each group shows. The record KEY is the id above, not copy. */
const GROUP_LABEL: Record<PhotoGroup['id'], (t: AppTranslations) => string> = {
  drinks: (t) => t.shiftStatus.drinks,
  tipsService: (t) => t.receipt.groupTipsService,
};

/** Photos per category — a line's proofPhotos are the scanned receipt shots. */
export function collectReceiptPhotoGroups(lines: PrReceiptLine[]): PhotoGroup[] {
  // `match` compares the line's stored `kind` — 'drinks' / 'tips' / 'others'
  // are API values and stay English.
  const defs: { id: PhotoGroup['id']; match: (kind: string) => boolean }[] = [
    { id: 'drinks', match: (k) => k === 'drinks' },
    { id: 'tipsService', match: (k) => k === 'tips' || k === 'others' },
  ];
  return defs
    .map((d) => {
      const rows = lines.filter((l) => d.match(l.kind));
      return {
        id: d.id,
        /*
         * ONE ENTRY PER PICTURE, however many items came off it.
         *
         * Every item scanned from a receipt carries that receipt's photo, so a
         * three-item tips scan counted as "3 pictures" and drew the same paper
         * three times. The count is meant to answer "how many receipts did I
         * photograph" — with duplicates it answered nothing, and a PR checking
         * their own proof could not tell one receipt from three.
         */
        photos: [...new Set(rows.flatMap((l) => l.proofPhotos ?? []))],
        lineCount: rows.length,
      };
    })
    .filter((g) => g.photos.length > 0);
}

export function ScannedReceiptsCard({
  lines,
  // No default value: a default is evaluated before any hook, so it could
  // never read the dictionary. Resolved in the body with `??` instead.
  title,
}: {
  lines: PrReceiptLine[];
  title?: string;
}) {
  const { t } = useLocale();
  const groups = collectReceiptPhotoGroups(lines);
  if (groups.length === 0) return null;
  return (
    <View style={s.card}>
      <Text style={s.title}>{title ?? t.receipt.scannedThisShift}</Text>
      {groups.map((g) => {
        /*
         * Three self-contained phrases joined by a separator, each its own key
         * — never an English sentence with the counts spliced in. Chinese has
         * no plural, so the count picks the whole phrase rather than adding
         * an 's' to it.
         */
        const summary = [
          GROUP_LABEL[g.id](t),
          formatMessage(
            g.photos.length === 1
              ? t.receipt.pictureOne
              : t.receipt.pictureMany,
            { n: g.photos.length },
          ),
          formatMessage(
            g.lineCount === 1
              ? t.receipt.itemLoggedOne
              : t.receipt.itemLoggedMany,
            { n: g.lineCount },
          ),
        ].join(' · ');
        return (
          <View key={g.id} style={s.group}>
            <Text style={s.groupLabel}>{summary}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={s.thumbs}>
                {g.photos.map((src, i) => (
                  /* `src` may be an R2 key — resolved for display; the key (and the
                     dedupe in collectReceiptPhotoGroups) stays on the raw string. */
                  <Image
                    key={`${i}-${src.slice(0, 24)}`}
                    source={{ uri: resolveProofPhotoUri(src) }}
                    style={s.thumb}
                  />
                ))}
              </View>
            </ScrollView>
          </View>
        );
      })}
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
    ...font(800),
    fontSize: 13,
    color: C.goldL,
  },
  group: { marginTop: 10 },
  groupLabel: {
    ...font(),
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
