/**
 * PV detail — port of InnocenZ-proto `/host/PaymentVoucher?pvId=`
 * Week summary, signature pad, dispute sheet.
 */
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { C, F, GRADIENTS, grad } from '../theme/theme';
import {
  PAYMENT_VOUCHERS,
  buildLastWeekPayGrid,
  formatRM,
} from '../lib/demo-shifts';
import { PAYMENT_HISTORY_WEEKS } from '../lib/demo-payment-history';
import { usePrNav } from '../lib/pr-nav';
import { Pill } from '../components/ui';
import { Check, ChevronLeft, Pencil, Shield, XIcon } from '../components/icons';

const DISPUTE_PRESETS = [
  'Unmatch commission',
  'Missing record',
  'Unmatch wages',
  'Repeated record',
  'Others',
] as const;

export function PvDetailScreen({ pvId }: { pvId: string }) {
  const { goBack, setTab } = usePrNav();
  const hist = PAYMENT_HISTORY_WEEKS.find((p) => p.id === pvId);
  const inbox = PAYMENT_VOUCHERS.find((p) => p.id === pvId);
  const pv = hist
    ? {
        id: hist.id,
        ref: hist.ref,
        outlet: hist.outlet,
        weekLabel: hist.weekLabel,
        net: hist.net,
        status: hist.status === 'paid' ? ('paid' as const) : ('signed' as const),
        statusLabel: hist.statusMeta,
      }
    : inbox ?? PAYMENT_VOUCHERS[0];
  const grid = useMemo(() => buildLastWeekPayGrid(), []);

  const [signed, setSigned] = useState(pv.status !== 'awaiting_pr');
  const [sigName, setSigName] = useState('');
  const [signOpen, setSignOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputePreset, setDisputePreset] = useState<string>(DISPUTE_PRESETS[0]);
  const [disputeNote, setDisputeNote] = useState('');
  const [disputed, setDisputed] = useState(false);
  const [receiptsOpen, setReceiptsOpen] = useState(false);

  const confirmSign = () => {
    if (sigName.trim().length < 2) return;
    setSigned(true);
    setSignOpen(false);
  };

  const submitDispute = () => {
    setDisputed(true);
    setDisputeOpen(false);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.topRow}>
        <Pressable style={styles.back} onPress={goBack}>
          <ChevronLeft size={20} color={C.goldL} />
          <Text style={styles.backText}>Payment</Text>
        </Pressable>
        <Pressable onPress={goBack} hitSlop={8}>
          <XIcon size={18} color={C.muted} />
        </Pressable>
      </View>

      <View style={styles.statusRow}>
        <Pill variant={signed ? (pv.status === 'paid' ? 'green' : 'amber') : 'amber'}>
          {disputed ? 'Dispute open' : signed ? pv.statusLabel : 'Pending your review'}
        </Pill>
        <Text style={styles.pvId}>{pv.ref}</Text>
      </View>

      {!signed && !disputed && (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Pending your review</Text>
          <Text style={styles.bannerBody}>Sign-by Sunday · Finance Head already signed</Text>
        </View>
      )}
      {disputed && (
        <View style={[styles.banner, styles.bannerDispute]}>
          <Text style={styles.bannerTitle}>Dispute open</Text>
          <Text style={styles.bannerBody}>{disputePreset} — agency will review</Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>WEEK SUMMARY</Text>
      <Text style={styles.weekLabel}>{pv.weekLabel}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
        <View>
          <View style={styles.gridRow}>
            <Text style={[styles.gridLabel, { width: 78 }]}> </Text>
            {grid.map((d) => (
              <Pressable
                key={d.day + d.date}
                style={styles.gridCol}
                onPress={() => setDisputeOpen(true)}
              >
                <Text style={styles.gridDay}>{d.day}</Text>
                <Text style={styles.gridDate}>{d.date}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.gridRow}>
            <Text style={styles.gridLabel}>Daily wages</Text>
            {grid.map((d) => (
              <Pressable
                key={`w-${d.date}`}
                style={styles.gridCol}
                onPress={() => setDisputeOpen(true)}
              >
                <Text style={styles.gridVal}>{d.wages.toFixed(2)}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.gridRow}>
            <Text style={styles.gridLabel}>Drinks</Text>
            {grid.map((d) => (
              <Pressable
                key={`d-${d.date}`}
                style={styles.gridCol}
                onPress={() => setDisputeOpen(true)}
              >
                <Text style={styles.gridVal}>
                  {d.drinks != null ? d.drinks.toFixed(2) : '—'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
      <Text style={styles.tapHint}>Tap an amount to dispute / withdraw</Text>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryK}>Net payable</Text>
        <Text style={styles.summaryV}>{formatRM(pv.net)}</Text>
        <Text style={styles.summaryK}>Payee</Text>
        <Text style={styles.summaryBody}>PR Personnel · {pv.outlet}</Text>
      </View>

      <Pressable style={styles.collapse} onPress={() => setReceiptsOpen((o) => !o)}>
        <Text style={styles.collapseTitle}>LINKED RECEIPT SCANS</Text>
        <Text style={styles.collapseAction}>{receiptsOpen ? 'Hide' : 'Details'}</Text>
      </Pressable>
      {receiptsOpen && (
        <View style={styles.receiptBox}>
          <Text style={styles.receiptLine}>RSV-0512-A · Hennessy VSOP · RM 125.00 · Matched</Text>
          <Text style={styles.receiptLine}>RSV-0512-B · Guest tip · RM 50.00 · Matched</Text>
        </View>
      )}

      <View style={styles.sigCard}>
        <Text style={styles.sectionLabel}>YOUR SIGNATURE</Text>
        <Text style={styles.sigRole}>PR Personnel</Text>
        {signed ? (
          <View style={styles.signedRow}>
            <Check size={16} color={C.green} />
            <Text style={styles.signedText}>
              Signed{sigName ? ` · ${sigName}` : ''} — Dual-signed · transfer processing
            </Text>
          </View>
        ) : (
          <Text style={styles.pendingSig}>Pending</Text>
        )}
      </View>

      {!signed && (
        <Pressable
          style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
          onPress={() => setSignOpen(true)}
        >
          <Pencil size={16} color="#241a08" />
          <Text style={styles.primaryText}>Sign payment voucher</Text>
        </Pressable>
      )}

      {signed && pv.status === 'paid' && (
        <View style={styles.paidBox}>
          <Shield size={16} color={C.green} />
          <Text style={styles.paidText}>PAID · {formatRM(pv.net)} in your bank</Text>
        </View>
      )}

      {signed && (
        <Pressable style={styles.soft} onPress={() => setTab('history')}>
          <Text style={styles.softText}>View in History · Payment history</Text>
        </Pressable>
      )}

      {/* Signature sheet */}
      <Modal visible={signOpen} transparent animationType="slide" onRequestClose={() => setSignOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSignOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Sign payment voucher</Text>
            <Text style={styles.sheetHint}>
              Type your floor nickname as signature (demo pad).
            </Text>
            <Text style={styles.fieldLabel}>Signature</Text>
            <TextInput
              value={sigName}
              onChangeText={setSigName}
              style={styles.input}
              placeholder="Vicky"
              placeholderTextColor={C.muted2}
            />
            <View style={styles.sigPad}>
              <Text style={styles.sigPadText}>{sigName || 'Sign here'}</Text>
            </View>
            <Pressable
              style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
              onPress={confirmSign}
            >
              <Text style={styles.primaryText}>Confirm signature</Text>
            </Pressable>
            <Pressable style={styles.sheetCancel} onPress={() => setSignOpen(false)}>
              <Text style={styles.sheetCancelText}>Back</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Dispute sheet */}
      <Modal
        visible={disputeOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setDisputeOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setDisputeOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>
              {disputed ? 'Withdraw dispute?' : 'Dispute this amount'}
            </Text>
            {!disputed && (
              <>
                <Text style={styles.fieldLabel}>Reason</Text>
                {DISPUTE_PRESETS.map((p) => (
                  <Pressable
                    key={p}
                    style={[styles.preset, disputePreset === p && styles.presetOn]}
                    onPress={() => setDisputePreset(p)}
                  >
                    <Text style={styles.presetText}>{p}</Text>
                  </Pressable>
                ))}
                <Text style={styles.fieldLabel}>Note</Text>
                <TextInput
                  value={disputeNote}
                  onChangeText={setDisputeNote}
                  style={styles.input}
                  placeholderTextColor={C.muted2}
                />
                <Text style={styles.sheetHint}>Attach files (images) — skipped in demo</Text>
                <Pressable
                  style={[styles.primary, grad(GRADIENTS.accent, C.accent)]}
                  onPress={submitDispute}
                >
                  <Text style={styles.primaryText}>Submit dispute</Text>
                </Pressable>
              </>
            )}
            {disputed && (
              <Pressable
                style={styles.dangerBtn}
                onPress={() => {
                  setDisputed(false);
                  setDisputeOpen(false);
                }}
              >
                <Text style={styles.dangerBtnText}>Withdraw dispute</Text>
              </Pressable>
            )}
            <Pressable style={styles.sheetCancel} onPress={() => setDisputeOpen(false)}>
              <Text style={styles.sheetCancelText}>Back</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 10, paddingHorizontal: 18, paddingBottom: 26 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: C.txt },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  pvId: { fontFamily: F.sora, fontSize: 13, fontWeight: '700', color: C.prMuted },
  banner: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(232,198,106,0.35)',
    backgroundColor: C.amberBg,
    padding: 12,
  },
  bannerDispute: {
    borderColor: 'rgba(240,138,138,0.4)',
    backgroundColor: C.redBg,
  },
  bannerTitle: { fontFamily: F.sora, fontSize: 14, fontWeight: '700', color: C.txt },
  bannerBody: { marginTop: 2, fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
  sectionLabel: {
    marginTop: 16,
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: C.muted2,
  },
  weekLabel: { marginTop: 4, fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: C.txt },
  gridRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  gridLabel: {
    width: 78,
    fontFamily: F.manrope,
    fontSize: 11,
    color: C.muted2,
  },
  gridCol: { width: 56, alignItems: 'center' },
  gridDay: { fontFamily: F.sora, fontSize: 10, fontWeight: '700', color: C.muted2 },
  gridDate: { fontFamily: F.manrope, fontSize: 11, color: C.prMuted },
  gridVal: { fontFamily: F.sora, fontSize: 12, fontWeight: '700', color: C.txt },
  tapHint: { marginTop: 4, fontFamily: F.manrope, fontSize: 11, color: C.prMuted2 },
  summaryCard: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line2,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  summaryK: {
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: C.muted2,
    marginTop: 6,
  },
  summaryV: {
    fontFamily: F.sora,
    fontSize: 28,
    fontWeight: '800',
    color: C.accentL,
  },
  summaryBody: { fontFamily: F.manrope, fontSize: 14, color: C.txt },
  collapse: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  collapseTitle: {
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: C.muted2,
  },
  collapseAction: { fontFamily: F.sora, fontSize: 13, fontWeight: '600', color: C.goldL },
  receiptBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    padding: 12,
    gap: 6,
  },
  receiptLine: { fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
  sigCard: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line2,
    padding: 14,
  },
  sigRole: { marginTop: 4, fontFamily: F.manrope, fontSize: 13, color: C.prMuted },
  signedRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  signedText: { flex: 1, fontFamily: F.manrope, fontSize: 13, color: C.green },
  pendingSig: { marginTop: 8, fontFamily: F.sora, fontSize: 14, fontWeight: '700', color: C.amber },
  primary: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  primaryText: { fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: '#241a08' },
  soft: { marginTop: 12, alignItems: 'center', padding: 10 },
  softText: { fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.goldL },
  paidBox: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: C.greenBg,
    borderWidth: 1,
    borderColor: 'rgba(93,217,160,0.35)',
  },
  paidText: { fontFamily: F.sora, fontSize: 14, fontWeight: '700', color: C.green },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(6,3,12,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.panel,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: C.line2,
    padding: 18,
    paddingBottom: 28,
    maxWidth: 392,
    width: '100%',
    alignSelf: 'center',
  },
  sheetTitle: { fontFamily: F.sora, fontSize: 20, fontWeight: '800', color: C.txt },
  sheetHint: {
    marginTop: 6,
    marginBottom: 8,
    fontFamily: F.manrope,
    fontSize: 13,
    color: C.prMuted,
  },
  fieldLabel: {
    marginTop: 10,
    marginBottom: 4,
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: C.prMuted2,
  },
  input: {
    fontFamily: F.sora,
    fontSize: 16,
    fontWeight: '600',
    color: C.txt,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  sigPad: {
    marginTop: 12,
    height: 88,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.line2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  sigPadText: {
    fontFamily: F.playfair,
    fontSize: 28,
    fontStyle: 'italic',
    color: C.txt,
  },
  sheetCancel: { marginTop: 10, alignItems: 'center', padding: 10 },
  sheetCancelText: { fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.muted },
  preset: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: 6,
  },
  presetOn: {
    borderColor: 'rgba(183,156,232,0.5)',
    backgroundColor: 'rgba(183,156,232,0.12)',
  },
  presetText: { fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.txt },
  dangerBtn: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: C.redBg,
    borderWidth: 1,
    borderColor: 'rgba(240,138,138,0.4)',
  },
  dangerBtnText: { fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: C.red },
});
