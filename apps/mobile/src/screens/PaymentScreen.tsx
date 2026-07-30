/**
 * Payment — port of InnocenZ-proto `/host/PaymentVoucher`:
 * Payroll header, week tabs, LAST WEEK card with full pay grid + dispute taps.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { C, F, GRADIENTS, grad } from '../theme/theme';
import {
  formatRM,
  weekPayGridTotal,
  weekPvIssueDayLabel,
  weekRangeLabel,
  type WeeklyDayPay,
} from '../lib/demo-shifts';
import { usePrEarnings } from '../lib/pr-earnings';
import {
  fetchMyLastWeek,
  raiseMyDispute,
  withdrawMyDispute,
  type PrCurrentWeek,
  type PrDisputeState,
  type PrReceiptLine,
} from '../lib/api';
import { useSession } from '../lib/session';
import { useSignedPvs } from '../lib/signed-pv';
import { buildWeekGridFromLines } from '../lib/week-pay-grid';
import { useKeyboardInset } from '../lib/use-keyboard-inset';
import { useViewportSize } from '../lib/viewport';
import { IzButton, Pill } from '../components/ui';
import { ChevronDown, Flag, ImagePlus, Wallet, XIcon } from '../components/icons';
import type { PrTab } from '../components/BottomNav';
import { usePrNav } from '../lib/pr-nav';

type WeekTab = 'last' | 'current';
type IncomeKey = 'wages' | 'drinks' | 'tips' | 'others';

type DisputeTarget = {
  key: string;
  dateIso: string;
  dayLabel: string;
  dateNum: number;
  incomeKey: IncomeKey;
  incomeLabel: string;
  amount: number;
};

type HtmlFileInput = {
  type: string;
  accept: string;
  multiple: boolean;
  files: FileList | null;
  onchange: ((ev: Event) => void) | null;
  click: () => void;
};

function readImageFiles(files: FileList | null): Promise<string[]> {
  if (!files?.length) return Promise.resolve([]);
  const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
  return Promise.all(
    imageFiles.map(
      (file) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        }),
    ),
  );
}

function pickDisputeImages(onPicked: (urls: string[]) => void) {
  if (Platform.OS !== 'web') return;
  const doc = (globalThis as { document?: { createElement: (tag: string) => HtmlFileInput } })
    .document;
  if (!doc) return;
  const input = doc.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = () => {
    void readImageFiles(input.files).then((urls) => {
      if (urls.length) onPicked(urls);
    });
  };
  input.click();
}

const DISPUTE_PRESETS = [
  'Unmatch commission',
  'Missing record',
  'Unmatch wages',
  'Repeated record',
  'Others',
] as const;

const INCOME_ROWS: { key: IncomeKey; label: string }[] = [
  { key: 'wages', label: 'Daily wages' },
  { key: 'drinks', label: 'Drinks' },
  { key: 'tips', label: 'Tips' },
  { key: 'others', label: 'Others' },
];

function cellAmount(day: WeeklyDayPay, key: IncomeKey): number {
  if (key === 'wages') return day.wages;
  if (key === 'drinks') return day.drinks ?? 0;
  if (key === 'tips') return day.tips ?? 0;
  return day.others ?? 0;
}

function formatCell(value: number): string {
  if (value <= 0) return '—';
  return value.toFixed(2);
}

// buildWeekGridFromLines moved to lib/week-pay-grid so PvDetailScreen renders
// the identical grid for the same voucher.

export function PaymentScreen({ onNavigate }: { onNavigate: (tab: PrTab) => void }) {
  const { openPv, route } = usePrNav();
  const { token } = useSession();
  const keyboardInset = useKeyboardInset();
  const { current, refresh: refreshEarnings } = usePrEarnings();
  const { isSigned } = useSignedPvs();
  const { width } = useViewportSize();
  const titleSize = Math.min(28, Math.max(22.4, width * 0.052));
  const thisGrid = useMemo(() => buildWeekGridFromLines(current), [current]);
  const thisWeekTotal = useMemo(() => weekPayGridTotal(thisGrid), [thisGrid]);
  const thisPendingDays = thisGrid.filter((d) => d.status === 'pending').length;
  const hasThisWeekRows = thisPendingDays > 0;

  // Last week's voucher comes from the same backend as this week — real data,
  // no demo grid. Fetched once on mount (it rarely changes mid-session).
  const [lastWeek, setLastWeek] = useState<PrCurrentWeek | null>(null);
  useEffect(() => {
    if (!token) return;
    let alive = true;
    void fetchMyLastWeek(token)
      .then((w) => {
        if (alive) setLastWeek(w);
      })
      .catch(() => {
        if (alive) setLastWeek(null);
      });
    return () => {
      alive = false;
    };
  }, [token]);

  // Check-out lands here with paymentWeek: 'current' so This week (sealed
  // shift) is visible immediately — not Last week.
  const focusWeek =
    route.name === 'tabs' && route.tab === 'payment' ? route.paymentWeek : undefined;
  const [weekTab, setWeekTab] = useState<WeekTab>(() =>
    focusWeek === 'current' || (!focusWeek && hasThisWeekRows) ? 'current' : 'last',
  );
  const [lastOpen, setLastOpen] = useState(true);
  const [thisOpen, setThisOpen] = useState(true);

  useEffect(() => {
    if (focusWeek === 'current') {
      setWeekTab('current');
      setThisOpen(true);
      void refreshEarnings();
    } else if (focusWeek === 'last') {
      setWeekTab('last');
      setLastOpen(true);
    }
  }, [focusWeek, refreshEarnings]);
  const [disputedKeys, setDisputedKeys] = useState<Set<string>>(() => new Set());
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeMode, setDisputeMode] = useState<'dispute' | 'withdraw'>('dispute');
  const [disputeTarget, setDisputeTarget] = useState<DisputeTarget | null>(null);
  const [disputePreset, setDisputePreset] = useState<string>(DISPUTE_PRESETS[0]);
  const [disputeNote, setDisputeNote] = useState('');
  const [disputePhotos, setDisputePhotos] = useState<string[]>([]);
  /** Optional proof kept with submitted disputes (image upload is still local). */
  const [disputePhotoMap, setDisputePhotoMap] = useState<Record<string, string[]>>({});
  const [disputeBusy, setDisputeBusy] = useState(false);

  const lastLabel = weekRangeLabel(1);
  const thisLabel = weekRangeLabel(0);
  const issueDay = weekPvIssueDayLabel(0);
  const grid = useMemo(() => buildWeekGridFromLines(lastWeek), [lastWeek]);
  const weekTotal = useMemo(() => weekPayGridTotal(grid), [grid]);
  const verifiedDays = grid.filter((d) => d.status === 'verified').length;
  const hasLastWeekRows = grid.some((d) => d.status !== 'empty');
  // Only a real, agency-sent voucher the PR hasn't signed yet is reviewable.
  const awaiting =
    lastWeek?.voucherId &&
    (lastWeek.status === 'awaiting_pr' || lastWeek.status === 'sent') &&
    !isSigned(lastWeek.voucherId)
      ? { id: lastWeek.voucherId, net: Number(lastWeek.net) }
      : undefined;
  const reviewAmount = weekTotal > 0 ? weekTotal : awaiting?.net ?? 0;
  // The dispute is persisted at the voucher grain (payment_voucher.status), so
  // the whole "Last week" PV is either under dispute or not (§3 F).
  const voucherDisputed = lastWeek?.status === 'disputed';

  const openDispute = (day: WeeklyDayPay, row: (typeof INCOME_ROWS)[number]) => {
    const amount = cellAmount(day, row.key);
    if (amount <= 0 || day.status === 'empty') return;
    const key = `${day.dateIso}-${row.key}`;
    const target: DisputeTarget = {
      key,
      dateIso: day.dateIso,
      dayLabel: day.day,
      dateNum: day.date,
      incomeKey: row.key,
      incomeLabel: row.label,
      amount,
    };
    setDisputeTarget(target);
    // A PV already under dispute → tapping any amount offers to withdraw it.
    if (voucherDisputed) {
      setDisputeMode('withdraw');
      setDisputeNote('');
      setDisputePhotos([]);
    } else {
      setDisputeMode('dispute');
      setDisputePreset(DISPUTE_PRESETS[0]);
      setDisputeNote(
        `${row.label} · ${day.day} ${day.date} · ${formatRM(amount)} — please verify`,
      );
      setDisputePhotos([]);
    }
    setDisputeOpen(true);
  };

  const closeDispute = () => {
    setDisputeOpen(false);
    setDisputeTarget(null);
    setDisputePhotos([]);
  };

  const submitDispute = async () => {
    if (!disputeTarget || disputeBusy) return;
    const voucherId = lastWeek?.voucherId;
    if (!token || !voucherId) {
      Alert.alert(
        'No voucher to dispute yet',
        'Last week’s payment voucher hasn’t been issued yet — there’s nothing to dispute.',
      );
      return;
    }
    setDisputeBusy(true);
    try {
      // The tapped cell already knows its day and its income row, so both are
      // sent as structured fields. They used to be flattened into the note's
      // prose, which meant the server had to take the PR's word for what was
      // being disputed and could not price the claim.
      const result =
        disputeMode === 'withdraw'
          ? await withdrawMyDispute(token, voucherId, {
              disputeDate: disputeTarget.dateIso,
              component: disputeTarget.incomeKey,
            })
          : await raiseMyDispute(token, voucherId, {
              disputeDate: disputeTarget.dateIso,
              component: disputeTarget.incomeKey,
              reason: disputePreset,
              note: disputeNote.trim() || undefined,
              proofPhotos: disputePhotos.length ? disputePhotos : undefined,
            });
      const next = result.voucher;
      // Reflect the persisted state so the grid + header pill update immediately
      // and survive a reload (getMyLastWeek returns these fields).
      setLastWeek((prev) =>
        prev
          ? {
              ...prev,
              status: next.status,
              disputeReason: next.disputeReason,
              disputeNote: next.disputeNote,
              disputedAt: next.disputedAt,
            }
          : prev,
      );
      setDisputedKeys((prev) => {
        // Withdraw clears the whole voucher dispute; raise echoes the tapped cell.
        if (disputeMode === 'withdraw') return new Set();
        const nextSet = new Set(prev);
        nextSet.add(disputeTarget.key);
        return nextSet;
      });
      setDisputePhotoMap((prev) => {
        if (disputeMode === 'withdraw') return {};
        if (!disputePhotos.length) return prev;
        return { ...prev, [disputeTarget.key]: disputePhotos };
      });
      closeDispute();
    } catch (error) {
      Alert.alert(
        'Dispute failed',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setDisputeBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.pageHeader}>
        <View style={styles.headerTitleRow}>
          <Wallet size={22} color={C.accent} />
          <Text style={[styles.headerTitle, { fontSize: titleSize }]}>Payment</Text>
        </View>
      </View>

      <View style={styles.weekTabs}>
        <Pressable
          style={[styles.weekTab, weekTab === 'last' && styles.weekTabOn]}
          onPress={() => setWeekTab('last')}
        >
          <Text style={[styles.weekTabTitle, weekTab === 'last' && { color: C.txt }]}>
            Last week
          </Text>
          <Text style={styles.weekTabSub}>{lastLabel}</Text>
        </Pressable>
        <Pressable
          style={[styles.weekTab, weekTab === 'current' && styles.weekTabOn]}
          onPress={() => setWeekTab('current')}
        >
          <Text style={[styles.weekTabTitle, weekTab === 'current' && { color: C.txt }]}>
            This week
          </Text>
          <Text style={styles.weekTabSub}>{thisLabel}</Text>
        </Pressable>
      </View>

      {weekTab === 'last' ? (
        <View style={styles.section}>
          <Pressable style={styles.sectionHd} onPress={() => setLastOpen((o) => !o)}>
            <View style={{ flex: 1 }}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>LAST WEEK</Text>
                {lastWeek?.status && (
                  <Pill variant={voucherDisputed ? 'red' : verifiedDays > 0 ? 'green' : 'amber'}>
                    {voucherDisputed
                      ? 'DISPUTED'
                      : lastWeek.status === 'paid'
                        ? 'PAID'
                        : lastWeek.status === 'signed'
                          ? 'SIGNED'
                          : verifiedDays > 0
                            ? 'SENT'
                            : 'PENDING'}
                  </Pill>
                )}
                <Text style={styles.sectionFrac}>
                  {verifiedDays}/7
                </Text>
              </View>
              <Text style={styles.sectionAction}>
                {lastOpen ? 'Tap to collapse' : 'Tap to expand'}
              </Text>
            </View>
            <ChevronDown
              size={16}
              color={C.goldL}
              style={lastOpen ? { transform: [{ rotate: '180deg' }] } : undefined}
            />
          </Pressable>

          {lastOpen && (
            <View style={styles.sectionBody}>
              <Text style={styles.weekCaption}>Last week {lastLabel}</Text>
              <Text style={styles.verified}>Verified days {verifiedDays}/7</Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator
                style={{ marginTop: 12 }}
              >
                <View>
                  <View style={styles.gridRow}>
                    <Text style={[styles.gridCorner, styles.gridLabel]}> </Text>
                    {grid.map((d) => (
                      <View key={d.dateIso} style={styles.gridCol}>
                        <Text style={styles.gridDay}>{d.day}</Text>
                        <Text style={styles.gridDate}>{d.date}</Text>
                      </View>
                    ))}
                    <View style={styles.gridCol}>
                      <Text style={styles.gridDay}>TOT</Text>
                      <Text style={styles.gridDate}> </Text>
                    </View>
                  </View>

                  {INCOME_ROWS.map((row) => {
                    const rowTotal = grid.reduce((s, d) => s + cellAmount(d, row.key), 0);
                    return (
                      <View key={row.key} style={styles.gridRow}>
                        <Text style={styles.gridLabel}>{row.label}</Text>
                        {grid.map((d) => {
                          const amount = cellAmount(d, row.key);
                          const key = `${d.dateIso}-${row.key}`;
                          const isDisputed = disputedKeys.has(key);
                          const canTap = amount > 0 && d.status !== 'empty';
                          return (
                            <Pressable
                              key={key}
                              style={[
                                styles.gridCol,
                                canTap && styles.gridColTap,
                                isDisputed && styles.gridColDisputed,
                              ]}
                              onPress={() => canTap && openDispute(d, row)}
                              disabled={!canTap}
                            >
                              <Text
                                style={[
                                  styles.gridVal,
                                  isDisputed && styles.gridValDisputed,
                                ]}
                              >
                                {formatCell(amount)}
                              </Text>
                              {canTap && (
                                <Flag
                                  size={9}
                                  color={isDisputed ? C.red : C.muted2}
                                  style={{ marginTop: 2 }}
                                />
                              )}
                            </Pressable>
                          );
                        })}
                        <View style={styles.gridCol}>
                          <Text style={styles.gridVal}>{formatCell(rowTotal)}</Text>
                        </View>
                      </View>
                    );
                  })}

                  <View style={styles.gridRow}>
                    <Text style={styles.gridLabel}>Status</Text>
                    {grid.map((d) => {
                      const dayDisputed =
                        voucherDisputed ||
                        INCOME_ROWS.some((r) => disputedKeys.has(`${d.dateIso}-${r.key}`));
                      const label =
                        d.status === 'empty'
                          ? '—'
                          : dayDisputed
                            ? 'DISPUTED'
                            : 'VERIFIED';
                      return (
                        <View key={`st-${d.dateIso}`} style={styles.gridCol}>
                          <Text
                            style={[
                              styles.statusPill,
                              dayDisputed && styles.statusPillDisputed,
                              d.status === 'empty' && { color: C.muted2 },
                            ]}
                          >
                            {label}
                          </Text>
                        </View>
                      );
                    })}
                    <View style={styles.gridCol}>
                      <Text style={styles.statusPill}>{verifiedDays} verified</Text>
                    </View>
                  </View>
                </View>
              </ScrollView>

              {voucherDisputed && (
                <View style={styles.disputeBanner}>
                  <Text style={styles.disputeBannerTitle}>Dispute open · agency reviewing</Text>
                  {lastWeek?.disputeReason ? (
                    <Text style={styles.disputeBannerBody}>
                      {lastWeek.disputeReason}
                      {lastWeek.disputeNote ? ` — ${lastWeek.disputeNote}` : ''}
                    </Text>
                  ) : null}
                  <Text style={styles.disputeBannerHint}>
                    Tap any amount to withdraw this dispute.
                  </Text>
                </View>
              )}

              {hasLastWeekRows ? (
                <>
                  <Text style={styles.disputeHint}>
                    Tap any amount to dispute · tap a{' '}
                    <Text style={{ color: C.red }}>red</Text> amount to withdraw a mistaken dispute.
                  </Text>

                  <Text style={styles.footNote}>
                    PV issued every Sunday · Total{' '}
                    <Text style={styles.footTotal}>{formatRM(reviewAmount)}</Text>
                  </Text>
                </>
              ) : (
                <Text style={styles.emptyWeekHint}>
                  No PV for last week yet — this week’s PV is issued next Sunday.
                </Text>
              )}

              {awaiting && (
                <IzButton
                  label={`Review & sign · ${formatRM(reviewAmount)}`}
                  small
                  onPress={() => openPv(awaiting.id)}
                  style={{ marginTop: 10 }}
                />
              )}
            </View>
          )}
        </View>
      ) : (
        <View style={styles.section}>
          <Pressable style={styles.sectionHd} onPress={() => setThisOpen((o) => !o)}>
            <View style={{ flex: 1 }}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>THIS WEEK</Text>
                <Text style={styles.sectionFrac}>{thisPendingDays}/7</Text>
              </View>
              <Text style={styles.sectionAction}>
                {thisOpen ? 'Tap to collapse' : 'Tap to expand'}
              </Text>
            </View>
            <ChevronDown
              size={16}
              color={C.goldL}
              style={thisOpen ? { transform: [{ rotate: '180deg' }] } : undefined}
            />
          </Pressable>

          {thisOpen && (
            <View style={styles.sectionBody}>
              <View style={styles.thisHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.weekCaption}>This week</Text>
                  <Text style={styles.weekCaptionRange}>{thisLabel}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.verifiedTiny}>Verified days</Text>
                  <Text style={styles.sectionFrac}>{thisPendingDays}/7</Text>
                </View>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator
                style={{ marginTop: 12 }}
              >
                <View>
                  <View style={styles.gridRow}>
                    <Text style={[styles.gridCorner, styles.gridLabel]}> </Text>
                    {thisGrid.map((d) => (
                      <View key={d.dateIso} style={styles.gridCol}>
                        <Text style={styles.gridDay}>{d.day}</Text>
                        <Text style={styles.gridDate}>{d.date}</Text>
                      </View>
                    ))}
                    <View style={styles.gridCol}>
                      <Text style={styles.gridDay}>TOT</Text>
                      <Text style={styles.gridDate}> </Text>
                    </View>
                  </View>

                  {INCOME_ROWS.map((row) => {
                    const rowTotal = thisGrid.reduce(
                      (s, d) => s + cellAmount(d, row.key),
                      0,
                    );
                    return (
                      <View key={row.key} style={styles.gridRow}>
                        <Text style={styles.gridLabel}>{row.label}</Text>
                        {thisGrid.map((d) => {
                          const amount = cellAmount(d, row.key);
                          return (
                            <View key={`${d.dateIso}-${row.key}`} style={styles.gridCol}>
                              <Text
                                style={[
                                  styles.gridVal,
                                  d.status === 'pending' && amount > 0 && styles.gridValPending,
                                ]}
                              >
                                {formatCell(amount)}
                              </Text>
                            </View>
                          );
                        })}
                        <View style={styles.gridCol}>
                          <Text style={styles.gridVal}>{formatCell(rowTotal)}</Text>
                        </View>
                      </View>
                    );
                  })}

                  <View style={styles.gridRow}>
                    <Text style={styles.gridLabel}>Status</Text>
                    {thisGrid.map((d) => {
                      const label =
                        d.status === 'empty'
                          ? '—'
                          : d.status === 'pending'
                            ? 'PENDING'
                            : 'VERIFIED';
                      return (
                        <View key={`st-${d.dateIso}`} style={styles.gridCol}>
                          <Text
                            style={[
                              styles.statusPill,
                              d.status === 'pending' && styles.statusPillPending,
                              d.status === 'empty' && { color: C.muted2 },
                            ]}
                          >
                            {label}
                          </Text>
                        </View>
                      );
                    })}
                    <View style={styles.gridCol}>
                      <Text style={styles.statusPill}>
                        {thisPendingDays > 0 ? `${thisPendingDays} pending` : '0 verified'}
                      </Text>
                    </View>
                  </View>
                </View>
              </ScrollView>

              <Text style={styles.footNote} numberOfLines={1}>
                PV on <Text style={styles.footBold}>{issueDay}</Text> · total{' '}
                <Text style={styles.footTotal}>{formatRM(thisWeekTotal)}</Text>
              </Text>

              {!hasThisWeekRows && (
                <Text style={styles.emptyWeekHint}>
                  Check out from Attendance to seal today’s wages and commissions here for this
                  week’s PV.
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      <Modal
        visible={disputeOpen}
        transparent
        animationType="slide"
        onRequestClose={closeDispute}
      >
        <Pressable style={styles.backdrop} onPress={closeDispute}>
          <Pressable
            style={[styles.sheet, keyboardInset > 0 && { paddingBottom: keyboardInset + 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
            <Text style={styles.sheetTitle}>
              {disputeMode === 'withdraw' ? 'Withdraw dispute?' : 'Dispute this amount'}
            </Text>
            {disputeTarget && (
              <View style={styles.targetPill}>
                <Text style={styles.targetPillText}>
                  {disputeTarget.dayLabel} {disputeTarget.dateNum} · {disputeTarget.incomeLabel} ·{' '}
                  {formatRM(disputeTarget.amount)}
                </Text>
              </View>
            )}

            {disputeMode === 'dispute' ? (
              <>
                <Text style={styles.fieldLabel}>Quick reason</Text>
                <View style={styles.presetWrap}>
                  {DISPUTE_PRESETS.map((p) => (
                    <Pressable
                      key={p}
                      style={[styles.presetChip, disputePreset === p && styles.presetChipOn]}
                      onPress={() => setDisputePreset(p)}
                    >
                      <Text
                        style={[
                          styles.presetChipText,
                          disputePreset === p && { color: C.violetL },
                        ]}
                      >
                        {p}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput
                  value={disputeNote}
                  onChangeText={setDisputeNote}
                  style={[styles.input, { minHeight: 88, textAlignVertical: 'top', marginTop: 10 }]}
                  multiline
                  placeholder="Add detail for your agency…"
                  placeholderTextColor={C.muted2}
                />

                <Pressable
                  style={styles.attachBtn}
                  onPress={() =>
                    pickDisputeImages((urls) =>
                      setDisputePhotos((prev) => [...prev, ...urls].slice(0, 6)),
                    )
                  }
                >
                  <ImagePlus size={14} color={C.txt} />
                  <Text style={styles.attachBtnText}>Attach files (images)</Text>
                  <Text style={styles.attachOptional}>optional</Text>
                </Pressable>

                {disputePhotos.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.photoRow}
                    contentContainerStyle={{ gap: 8 }}
                  >
                    {disputePhotos.map((src, index) => (
                      <View key={`${index}-${src.slice(0, 24)}`} style={styles.photoThumb}>
                        <Image source={{ uri: src }} style={styles.photoImg} />
                        <Pressable
                          style={styles.photoRemove}
                          onPress={() =>
                            setDisputePhotos((prev) => prev.filter((_, i) => i !== index))
                          }
                          hitSlop={6}
                        >
                          <XIcon size={12} color={C.txt} />
                        </Pressable>
                      </View>
                    ))}
                  </ScrollView>
                )}

                <Text style={styles.attachHint}>
                  {disputePhotos.length > 0
                    ? `${disputePhotos.length} image${disputePhotos.length === 1 ? '' : 's'} attached as proof`
                    : 'Proof images are optional — attach a receipt photo if you have one.'}
                </Text>

                <View style={styles.sheetActions}>
                  <Pressable style={styles.backBtn} onPress={closeDispute}>
                    <Text style={styles.backBtnText}>Back</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.submitBtn, grad(GRADIENTS.accent, C.accent), disputeBusy && { opacity: 0.6 }]}
                    onPress={submitDispute}
                    disabled={disputeBusy}
                  >
                    <Text style={styles.primaryText}>
                      {disputeBusy ? 'Submitting…' : 'Submit dispute'}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.sheetSub}>
                  Flagged this amount by mistake? Withdraw and it returns to verified.
                  {(disputeTarget && disputePhotoMap[disputeTarget.key]?.length)
                    ? ` · ${disputePhotoMap[disputeTarget.key].length} proof image(s) will be cleared.`
                    : ''}
                </Text>
                <Pressable
                  style={[styles.dangerBtn, disputeBusy && { opacity: 0.6 }]}
                  onPress={submitDispute}
                  disabled={disputeBusy}
                >
                  <Text style={styles.dangerBtnText}>
                    {disputeBusy ? 'Withdrawing…' : 'Withdraw dispute'}
                  </Text>
                </Pressable>
                <Pressable style={styles.cancel} onPress={closeDispute}>
                  <Text style={styles.cancelText}>Back</Text>
                </Pressable>
              </>
            )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: 6, paddingHorizontal: 18, paddingBottom: 26 },
  pageHeader: { paddingTop: 2 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  headerTitle: { fontFamily: F.sora, fontWeight: '800', letterSpacing: -0.45, color: C.txt },
  weekTabs: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  weekTab: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  weekTabOn: {
    borderColor: 'rgba(183,156,232,0.45)',
    backgroundColor: 'rgba(183,156,232,0.1)',
  },
  weekTabTitle: { fontFamily: F.sora, fontSize: 14, fontWeight: '700', color: C.muted },
  weekTabSub: {
    marginTop: 4,
    fontFamily: F.manrope,
    fontSize: 11,
    color: C.prMuted2,
    textAlign: 'center',
  },
  section: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  sectionHd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  sectionTitle: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: C.txt,
  },
  sectionFrac: { fontFamily: F.sora, fontSize: 13, fontWeight: '700', color: C.goldL },
  sectionAction: {
    marginTop: 4,
    fontFamily: F.manrope,
    fontSize: 12,
    fontWeight: '600',
    color: C.goldL,
  },
  sectionBody: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: C.line },
  weekCaption: {
    marginTop: 12,
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '700',
    color: C.txt,
  },
  weekCaptionRange: {
    marginTop: 2,
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '700',
    color: C.txt,
  },
  thisHead: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  verified: { marginTop: 4, fontFamily: F.manrope, fontSize: 13, color: C.prMuted },
  verifiedTiny: {
    fontFamily: F.manrope,
    fontSize: 11,
    color: C.prMuted2,
  },
  emptyWeekHint: {
    marginTop: 10,
    fontFamily: F.manrope,
    fontSize: 12,
    lineHeight: 17,
    color: C.prMuted,
    textAlign: 'center',
  },
  gridRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  gridCorner: { width: 78 },
  gridLabel: {
    width: 78,
    fontFamily: F.manrope,
    fontSize: 11,
    color: C.muted2,
  },
  gridCol: { width: 56, alignItems: 'center', paddingVertical: 2 },
  gridColTap: {
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  gridColDisputed: {
    backgroundColor: 'rgba(240,138,138,0.1)',
  },
  gridDay: { fontFamily: F.sora, fontSize: 10, fontWeight: '700', color: C.muted2 },
  gridDate: { fontFamily: F.manrope, fontSize: 11, color: C.prMuted },
  gridVal: { fontFamily: F.sora, fontSize: 12, fontWeight: '700', color: C.txt },
  gridValPending: { color: C.amber },
  gridValDisputed: { color: C.red },
  statusPill: {
    fontFamily: F.sora,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: C.green,
    textAlign: 'center',
  },
  statusPillPending: { color: C.amber },
  statusPillDisputed: { color: C.red },
  disputeHint: {
    marginTop: 10,
    fontFamily: F.manrope,
    fontSize: 12,
    lineHeight: 17,
    color: C.prMuted,
    textAlign: 'center',
  },
  disputeBanner: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(240,138,138,0.4)',
    backgroundColor: C.redBg,
    padding: 12,
  },
  disputeBannerTitle: {
    fontFamily: F.sora,
    fontSize: 13,
    fontWeight: '800',
    color: C.red,
  },
  disputeBannerBody: {
    marginTop: 4,
    fontFamily: F.manrope,
    fontSize: 12,
    lineHeight: 17,
    color: C.txt,
  },
  disputeBannerHint: {
    marginTop: 6,
    fontFamily: F.manrope,
    fontSize: 11,
    color: C.prMuted,
  },

  footNote: {
    marginTop: 10,
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.muted2,
    textAlign: 'center',
  },
  footBold: {
    fontFamily: F.sora,
    fontWeight: '800',
    color: C.txt,
  },
  footTotal: {
    fontFamily: F.sora,
    fontWeight: '800',
    color: C.accent,
  },
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
  sheetSub: {
    marginTop: 6,
    fontFamily: F.manrope,
    fontSize: 13,
    color: C.prMuted,
    lineHeight: 18,
  },
  targetPill: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(0,0,0,0.28)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  targetPillText: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '700',
    color: C.goldL,
  },
  fieldLabel: {
    marginTop: 12,
    marginBottom: 4,
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: C.prMuted2,
  },
  presetWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  presetChipOn: {
    borderColor: 'rgba(183,156,232,0.5)',
    backgroundColor: 'rgba(183,156,232,0.14)',
  },
  presetChipText: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '600',
    color: C.txt,
  },
  input: {
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '600',
    color: C.txt,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  attachBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  attachBtnText: {
    fontFamily: F.sora,
    fontSize: 13,
    fontWeight: '600',
    color: C.txt,
  },
  attachOptional: {
    fontFamily: F.manrope,
    fontSize: 11,
    color: C.muted2,
  },
  attachHint: {
    marginTop: 8,
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.prMuted,
    lineHeight: 16,
  },
  photoRow: {
    marginTop: 10,
    maxHeight: 78,
  },
  photoThumb: {
    width: 68,
    height: 68,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  photoImg: {
    width: '100%',
    height: '100%',
  },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6,3,12,0.72)',
    borderWidth: 1,
    borderColor: C.line2,
  },
  sheetActions: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 8,
  },
  backBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  backBtnText: {
    fontFamily: F.sora,
    fontSize: 15,
    fontWeight: '700',
    color: C.prMuted,
  },
  submitBtn: {
    flex: 1.4,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryText: { fontFamily: F.sora, fontSize: 15, fontWeight: '700', color: '#241a08' },
  dangerBtn: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(240,138,138,0.45)',
    backgroundColor: 'rgba(240,138,138,0.12)',
  },
  dangerBtnText: { fontFamily: F.sora, fontSize: 15, fontWeight: '700', color: C.red },
  cancel: { marginTop: 10, alignItems: 'center', padding: 10 },
  cancelText: { fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.muted },
});
