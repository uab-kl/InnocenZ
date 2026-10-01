/**
 * A special night's OWN price list, shown beside the list the PR logs from
 * (ScanScreen — the scan review and the self-log list).
 *
 * Nothing here is tappable: the rows she taps are the list above it. Since 29 Sep
 * 2026 (owner: "Use event prices") that list IS this one on such a night — the
 * server sends it as `drinkMenu` — so the card names tonight's prices and the
 * note says they are the ones her lines are priced from.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C } from '../theme/theme';
import { font } from '../theme/fonts';
import { formatRM } from '../lib/demo-shifts';
import type { EventPriceRow } from '../lib/special-event';

export function EventPriceCard({
  title,
  rows,
  note,
}: {
  /** "VIP night prices" — already localized. */
  title: string;
  rows: EventPriceRow[];
  /** The sentence under the list — already localized. */
  note: string;
}) {
  return (
    <View style={styles.card} testID="event-price-card">
      <Text style={styles.title}>{title.toUpperCase()}</Text>
      {rows.map((row) => (
        <View key={row.id} style={styles.row}>
          {/* The item's name is the venue's own text — never translated. */}
          <Text style={styles.name} numberOfLines={2}>
            {row.name}
          </Text>
          <View style={styles.prices}>
            <Text style={styles.price}>{formatRM(row.priceRm)}</Text>
          </View>
        </View>
      ))}
      <Text style={styles.note}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(227,184,119,0.35)',
    backgroundColor: 'rgba(227,184,119,0.06)',
    padding: 12,
    gap: 6,
  },
  title: {
    ...font(800),
    fontSize: 11,
    letterSpacing: 1,
    color: C.accentL,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  name: { ...font(600), fontSize: 13, color: C.txt, flex: 1, minWidth: 0 },
  prices: { alignItems: 'flex-end', flexShrink: 0 },
  price: { ...font(700), fontSize: 13, color: C.txt, fontVariant: ['tabular-nums'] },
  note: { ...font(), fontSize: 11, lineHeight: 16, color: C.prMuted, marginTop: 4 },
});
