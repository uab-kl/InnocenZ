/**
 * The PR's pending outlet-swap requests — the agency has asked them to work a
 * different venue tonight, and nothing moves until they answer here.
 *
 * Approving is the only action in the app that relocates a booked shift, so
 * each card states both ends of the move explicitly rather than just naming the
 * destination.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
// This app draws its own icons (components/icons.tsx) rather than pulling in
// lucide — there is no arrow-swap glyph, so the venue icon carries the meaning.
import { Store } from './icons';
import { C, F } from '../theme/theme';
import { IzButton } from './ui';
import type { OutletSwapRecord } from '../lib/api';
import type { OutletSwapsState } from '../lib/outlet-swaps';

/** "Fri, 27 Jul" from a YYYY-MM-DD shift day, parsed as a local date. */
function formatShiftDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function OutletSwapRequests({
  swaps,
}: {
  swaps: Pick<OutletSwapsState, 'pending' | 'actionError' | 'busyId' | 'respond'>;
}) {
  const { pending, actionError, busyId, respond } = swaps;
  if (pending.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {pending.map((swap) => (
        <SwapCard
          key={swap.id}
          swap={swap}
          busy={busyId === swap.id}
          // Any card being answered locks the others: the answers hit the same
          // assignment and the second would only race the first.
          disabled={busyId !== null && busyId !== swap.id}
          onRespond={(accept) => respond(swap.id, accept)}
        />
      ))}
      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
    </View>
  );
}

function SwapCard({
  swap,
  busy,
  disabled,
  onRespond,
}: {
  swap: OutletSwapRecord;
  busy: boolean;
  disabled: boolean;
  onRespond: (accept: boolean) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Store size={14} color={C.violet} />
        <Text style={styles.headText}>OUTLET SWAP REQUEST</Text>
      </View>

      <Text style={styles.move}>
        {swap.fromOutletName ?? 'Your outlet'}
        <Text style={styles.arrow}> → </Text>
        {swap.toOutletName ?? 'New outlet'}
      </Text>

      <Text style={styles.meta}>
        {formatShiftDay(swap.toShiftDate)}
        {swap.toSlot ? ` · ${swap.toSlot}` : ''}
      </Text>
      {swap.toEventName ? <Text style={styles.event}>{swap.toEventName}</Text> : null}

      {swap.agencyNote ? (
        <Text style={styles.note}>&ldquo;{swap.agencyNote}&rdquo;</Text>
      ) : null}

      <Text style={styles.hint}>
        Your shift moves to this outlet only if you approve.
      </Text>

      <View style={styles.actions}>
        <IzButton
          label="Decline"
          variant="soft"
          small
          fullWidth={false}
          disabled={busy || disabled}
          onPress={() => onRespond(false)}
          style={styles.action}
        />
        <IzButton
          label={busy ? 'Sending…' : 'Approve'}
          small
          fullWidth={false}
          disabled={busy || disabled}
          onPress={() => onRespond(true)}
          style={styles.action}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.violetInk,
    backgroundColor: C.glass,
    padding: 12,
    gap: 4,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headText: {
    fontFamily: F.sora,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 1,
    color: C.violet,
  },
  move: {
    fontFamily: F.sora,
    fontWeight: '700',
    fontSize: 15,
    color: C.txt,
    marginTop: 2,
  },
  arrow: { color: C.violet },
  meta: { fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
  event: { fontFamily: F.manrope, fontSize: 12, color: C.accent },
  note: {
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.muted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  hint: { fontFamily: F.manrope, fontSize: 11, color: C.muted, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  action: { flex: 1 },
  error: { fontFamily: F.manrope, fontSize: 12, color: C.red },
});
