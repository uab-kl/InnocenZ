/**
 * Payment history panel — port of InnocenZ-proto `PrPaymentHistoryPanel`
 * on `/host/history?tab=payment`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Linking,
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
import { formatRM } from '../lib/demo-shifts';
import { paymentHistoryOutlets, type HistPayWeek } from '../lib/demo-payment-history';
import {
  buildDateOptionsFromKeys,
  collectPaymentWeekDateKeys,
  matchesPaymentWeekDayTime,
} from '../lib/hist-date-time-filters';
import { normalizeHistPayWeek } from '../lib/history-pay-sync';
import { usePaymentHistory } from '../lib/payment-history';
import {
  createMyVoucherExportTicket,
  fetchMyVoucherExcelBlob,
  fetchMyVoucherPdfBlob,
} from '../lib/api';
import { useSession } from '../lib/session';
import { useKeyboardInset } from '../lib/use-keyboard-inset';
import { useShiftSession } from '../lib/shift-session';
import { useSignedPvs } from '../lib/signed-pv';
import { usePrNav } from '../lib/pr-nav';
import { IzButton, Pill } from './ui';
import { HistDateField, HistDateTimeFilter, HistTimeInput } from './HistDateTimeFilter';
import {
  Briefcase,
  Calendar,
  ChevronDown,
  FileText,
  Filter,
  House,
  Search,
  Wallet,
} from './icons';

type StatusChip = 'all' | 'paid' | 'signed';

type Filters = {
  query: string;
  outlet: string;
  date: string;
  timeFrom: string;
  timeTo: string;
  status: StatusChip;
  netPaid: string;
};

const EMPTY: Filters = {
  query: '',
  outlet: 'all',
  date: '',
  timeFrom: '',
  timeTo: '',
  status: 'all',
  netPaid: '',
};

export function PaymentHistoryPanel({ onOpenPayment }: { onOpenPayment: () => void }) {
  const { openPv } = usePrNav();
  const { token } = useSession();
  const keyboardInset = useKeyboardInset();
  const { weekRecords } = useShiftSession();
  const { weeks: apiWeeks } = usePaymentHistory();
  const { signedWeeks } = useSignedPvs();
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filterOpen, setFilterOpen] = useState(false);
  const [openSelect, setOpenSelect] = useState<'outlet' | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [sheetCalendarOpen, setSheetCalendarOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Only keep local signed weeks that match a real API voucher (no demo phantoms).
  const allWeeks = useMemo(() => {
    const apiIds = new Set(apiWeeks.map((w) => w.id));
    const localOnly = signedWeeks
      .filter((w) => apiIds.has(w.id))
      .map(normalizeHistPayWeek);
    const mergedIds = new Set(localOnly.map((w) => w.id));
    return [
      ...localOnly,
      ...apiWeeks.filter((w) => !mergedIds.has(w.id)).map(normalizeHistPayWeek),
    ];
  }, [apiWeeks, signedWeeks]);

  useEffect(() => {
    if (allWeeks[0]?.id) setExpanded(allWeeks[0].id);
  }, [allWeeks]);

  const [toast, setToast] = useState<string | null>(null);

  const outlets = useMemo(() => paymentHistoryOutlets(allWeeks), [allWeeks]);

  const paymentWorkDayKeys = useMemo(() => {
    const keys = [
      ...allWeeks.flatMap((w) => collectPaymentWeekDateKeys(w)),
      ...weekRecords.map((r) => r.dateIso),
    ];
    return buildDateOptionsFromKeys(keys).map((o) => o.key);
  }, [allWeeks, weekRecords]);

  const filtered = useMemo(() => {
    const dayTime = {
      date: applied.date,
      timeFrom: applied.timeFrom,
      timeTo: applied.timeTo,
    };
    return allWeeks.filter((w) => {
      if (!matchesPaymentWeekDayTime(w, dayTime)) return false;
      if (applied.status === 'paid' && w.status !== 'paid') return false;
      if (applied.status === 'signed' && w.status !== 'signed') return false;
      if (applied.outlet !== 'all') {
        const hit =
          w.outlet === applied.outlet ||
          w.lines.some((l) => l.outlet === applied.outlet);
        if (!hit) return false;
      }
      if (applied.netPaid.trim()) {
        const n = Number(applied.netPaid.replace(/,/g, ''));
        if (Number.isFinite(n) && Math.abs(w.net - n) > 0.01) return false;
      }
      const q = applied.query.trim().toLowerCase();
      if (q) {
        const blob = [
          w.ref,
          w.weekLabel,
          w.outlet,
          w.status,
          w.statusMeta,
          w.bankRef ?? '',
          w.issued,
          ...w.lines.flatMap((l) => [l.type, l.outlet, l.date]),
        ]
          .join(' ')
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [applied, allWeeks]);

  const paidList = filtered.filter((w) => w.status === 'paid');
  const signedList = filtered.filter((w) => w.status === 'signed');
  const totalPaid = paidList.reduce((s, w) => s + w.net, 0);
  const totalSigned = signedList.reduce((s, w) => s + w.net, 0);
  const totalNet =
    applied.status === 'paid'
      ? totalPaid
      : applied.status === 'signed'
        ? totalSigned
        : totalPaid + totalSigned;
  const shifts = filtered.reduce((s, w) => s + w.shifts, 0);

  /** Streams the server-rendered workbook; the toast only fires on success. */
  const openExcel = async (w: HistPayWeek) => {
    if (!token) return;
    if (Platform.OS !== 'web') {
      // The system browser downloads the file, so hand it a short-lived
      // ticket URL — a browser tab can't send our Authorization header.
      try {
        const { xlsxUrl } = await createMyVoucherExportTicket(token, w.id);
        await Linking.openURL(xlsxUrl);
        flash('Excel opening in your browser — check Downloads');
      } catch {
        flash('Could not open the Excel — try again');
      }
      return;
    }
    try {
      const blob = await fetchMyVoucherExcelBlob(token, w.id);
      const doc = (globalThis as { document?: any }).document;
      const url = URL.createObjectURL(blob);
      const a = doc.createElement('a');
      a.href = url;
      a.download = `${w.ref}-payment-voucher.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      flash('Payment voucher Excel downloaded');
    } catch {
      flash('Could not download the Excel — try again');
    }
  };

  const openPdf = async (w: HistPayWeek) => {
    if (Platform.OS !== 'web') {
      if (!token) return;
      try {
        // Straight to the PDF file — the browser downloads it and the
        // notification opens it in the phone's PDF viewer.
        const { pdfUrl } = await createMyVoucherExportTicket(token, w.id);
        await Linking.openURL(pdfUrl);
        flash('PDF downloading — open it from your notifications');
      } catch {
        flash('Could not open the voucher — try again');
      }
      return;
    }
    // Web: the SAME server-rendered boxed PDF as the phone — opened in the
    // browser's PDF viewer, where view/print/save all live.
    if (!token) return;
    try {
      const blob = await fetchMyVoucherPdfBlob(token, w.id);
      const url = URL.createObjectURL(blob);
      const win = (globalThis as { open?: (u?: string, t?: string) => any }).open?.(url, '_blank');
      if (!win) {
        const doc = (globalThis as { document?: any }).document;
        const a = doc.createElement('a');
        a.href = url;
        a.download = `${w.ref}-payment-voucher.pdf`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      flash('Payment voucher PDF opened');
    } catch {
      flash('Could not open the PDF — try again');
    }
  };

  const filterCount = [
    applied.query,
    applied.outlet !== 'all',
    applied.date,
    applied.timeFrom,
    applied.timeTo,
    applied.status !== 'all',
    applied.netPaid,
  ].filter(Boolean).length;

  const openFilter = () => {
    setDraft(applied);
    setOpenSelect(null);
    setFilterOpen(true);
  };

  const applyFilters = () => {
    setApplied(draft);
    setFilterOpen(false);
  };

  const clearFilters = () => {
    setDraft(EMPTY);
    setApplied(EMPTY);
    setFilterOpen(false);
  };

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  return (
    <View>
      <View style={styles.secHead}>
        <View style={styles.secTitleRow}>
          <Wallet size={14} color={C.goldL} />
          <Text style={styles.secTitle}>PAYMENT HISTORY</Text>
        </View>
        <Pressable style={styles.filterBtn} onPress={openFilter}>
          <Filter size={12} color={C.muted} />
          <Text style={styles.filterBtnText}>Filter</Text>
          {filterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{filterCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <View style={styles.search}>
        <Search size={14} color={C.muted2} />
        <TextInput
          value={applied.query}
          onChangeText={(query) => setApplied((f) => ({ ...f, query }))}
          placeholder="Search PV ID, outlet, week, bank ref…"
          placeholderTextColor={C.muted2}
          style={styles.searchInput}
        />
      </View>

      <View style={styles.filterRow}>
        <FilterField
          icon={House}
          label="OUTLET"
          value={applied.outlet === 'all' ? 'Any outlet' : applied.outlet}
          onPress={() => {
            setOpenSelect((s) => (s === 'outlet' ? null : 'outlet'));
            setCalendarOpen(false);
          }}
        />
        <HistDateField
          date={applied.date}
          workDayKeys={paymentWorkDayKeys}
          calendarOpen={calendarOpen}
          onCalendarOpenChange={(open) => {
            setCalendarOpen(open);
            if (open) setOpenSelect(null);
          }}
          onDateChange={(date) =>
            setApplied((f) => ({
              ...f,
              date,
              timeFrom: date ? f.timeFrom : '',
              timeTo: date ? f.timeTo : '',
            }))
          }
          onClearSideEffects={() =>
            setApplied((f) => ({ ...f, timeFrom: '', timeTo: '' }))
          }
        />
      </View>

      {openSelect === 'outlet' && (
        <SelectList
          options={[{ id: 'all', label: 'Any outlet' }, ...outlets.map((o) => ({ id: o, label: o }))]}
          selected={applied.outlet}
          onPick={(id) => {
            setApplied((f) => ({ ...f, outlet: id }));
            setOpenSelect(null);
          }}
        />
      )}

      <View style={styles.timeRow}>
        <HistTimeInput
          label="FROM TIME"
          value={applied.timeFrom}
          onChange={(timeFrom) => setApplied((f) => ({ ...f, timeFrom }))}
          disabled={!applied.date}
        />
        <HistTimeInput
          label="TO TIME"
          value={applied.timeTo}
          onChange={(timeTo) => setApplied((f) => ({ ...f, timeTo }))}
          disabled={!applied.date}
        />
      </View>

      <View style={styles.chips}>
        {(['all', 'paid', 'signed'] as StatusChip[]).map((c) => (
          <Pressable
            key={c}
            style={[styles.chip, applied.status === c && styles.chipOn]}
            onPress={() => setApplied((f) => ({ ...f, status: c }))}
          >
            <Text style={[styles.chipText, applied.status === c && { color: C.txt }]}>
              {c === 'all' ? 'All' : c === 'paid' ? 'Paid' : 'Signed'}
            </Text>
          </Pressable>
        ))}
      </View>

      {filterCount > 0 && (
        <Pressable onPress={clearFilters} style={{ marginTop: 8 }}>
          <Text style={styles.clearAll}>Clear all filters</Text>
        </Pressable>
      )}

      <View style={styles.statRow}>
        <StatTile
          icon={Calendar}
          value={String(filtered.length)}
          label="Weeks"
        />
        <StatTile icon={Briefcase} value={String(shifts)} label="Shifts" />
        <StatTile
          value={formatRM(totalNet)}
          label={
            applied.status === 'paid'
              ? 'Paid'
              : applied.status === 'signed'
                ? 'Signed'
                : 'Total net'
          }
          valueColor={
            applied.status === 'paid'
              ? C.green
              : applied.status === 'signed'
                ? C.amber
                : C.goldL
          }
          accent
        />
      </View>

      {applied.status === 'all' && (paidList.length > 0 || signedList.length > 0) && (
        <Text style={styles.summaryLine}>
          <Text style={{ color: C.green, fontWeight: '700' }}>
            {paidList.length} paid · {formatRM(totalPaid)}
          </Text>
          <Text style={{ color: C.muted2 }}> · </Text>
          <Text style={{ color: C.amber, fontWeight: '700' }}>
            {signedList.length} signed · {formatRM(totalSigned)}
          </Text>
        </Text>
      )}

      {toast ? <Text style={styles.toast}>{toast}</Text> : null}

      <View style={styles.list}>
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {allWeeks.length === 0
                ? 'No payments yet'
                : 'No payments match your filters.'}
            </Text>
            {allWeeks.length === 0 && (
              <IzButton label="Open Payment" small onPress={onOpenPayment} />
            )}
          </View>
        ) : (
          filtered.map((w) => (
            <WeekCard
              key={w.id}
              week={w}
              open={expanded === w.id}
              onToggle={() => setExpanded((id) => (id === w.id ? null : w.id))}
              onOpenPv={() => openPv(w.id)}
              onPdf={() => void openPdf(w)}
              onExcel={() => void openExcel(w)}
            />
          ))
        )}
      </View>

      {/* Filter sheet */}
      <Modal
        visible={filterOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setFilterOpen(false)}>
          <Pressable
            style={[styles.sheet, keyboardInset > 0 && { paddingBottom: keyboardInset + 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.sheetHandle} />
            <View style={styles.sheetTitleRow}>
              <Wallet size={18} color={C.accent} />
              <Text style={styles.sheetTitle}>Filter payment history</Text>
            </View>

            <HistDateTimeFilter
              date={draft.date}
              timeFrom={draft.timeFrom}
              timeTo={draft.timeTo}
              workDayKeys={paymentWorkDayKeys}
              activityKind="payment"
              calendarOpen={sheetCalendarOpen}
              onCalendarOpenChange={setSheetCalendarOpen}
              onDateChange={(date) =>
                setDraft((d) => ({
                  ...d,
                  date,
                  timeFrom: date ? d.timeFrom : '',
                  timeTo: date ? d.timeTo : '',
                }))
              }
              onTimeFromChange={(timeFrom) => setDraft((d) => ({ ...d, timeFrom }))}
              onTimeToChange={(timeTo) => setDraft((d) => ({ ...d, timeTo }))}
            />

            <Text style={[styles.fieldLabel, { marginTop: 4 }]}>
              <House size={11} color={C.muted2} /> OUTLET
            </Text>
            <Pressable
              style={styles.sheetField}
              onPress={() => {
                const idx = outlets.indexOf(draft.outlet);
                const next =
                  draft.outlet === 'all'
                    ? outlets[0] ?? 'all'
                    : idx >= outlets.length - 1
                      ? 'all'
                      : outlets[idx + 1];
                setDraft((d) => ({ ...d, outlet: next }));
              }}
            >
              <Text style={styles.sheetFieldText}>
                {draft.outlet === 'all' ? 'Any outlet' : draft.outlet}
              </Text>
              <ChevronDown size={14} color={C.muted} />
            </Pressable>

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Status</Text>
            <View style={styles.chips}>
              {(['all', 'paid', 'signed'] as StatusChip[]).map((c) => (
                <Pressable
                  key={c}
                  style={[styles.chip, draft.status === c && styles.chipOn]}
                  onPress={() => setDraft((d) => ({ ...d, status: c }))}
                >
                  <Text style={[styles.chipText, draft.status === c && { color: C.txt }]}>
                    {c === 'all' ? 'All' : c === 'paid' ? 'Paid' : 'Signed'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>NET PAID (RM)</Text>
            <TextInput
              value={draft.netPaid}
              onChangeText={(netPaid) => setDraft((d) => ({ ...d, netPaid }))}
              placeholder="e.g. 898"
              placeholderTextColor={C.muted2}
              keyboardType="decimal-pad"
              style={styles.netInput}
            />

            <Pressable
              style={[styles.applyBtn, grad(GRADIENTS.accent, C.accent)]}
              onPress={applyFilters}
            >
              <Text style={styles.applyText}>Apply filters</Text>
            </Pressable>
            <Pressable style={styles.clearBtn} onPress={clearFilters}>
              <Text style={styles.clearBtnText}>Clear &amp; close</Text>
            </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function WeekCard({
  week,
  open,
  onToggle,
  onOpenPv,
  onPdf,
  onExcel,
}: {
  week: HistPayWeek;
  open: boolean;
  onToggle: () => void;
  onOpenPv: () => void;
  onPdf: () => void;
  onExcel: () => void;
}) {
  // Three states, not two. 'Pending' is the honest badge for a week the PR has
  // not signed — it used to read "Signed", asserting a signature that had never
  // been given, on the very screen a PR opens to check exactly that.
  const border =
    week.status === 'paid' ? 'rgba(93,217,160,0.35)' : 'rgba(232,198,106,0.35)';
  const statusLabel =
    week.status === 'paid' ? 'Paid' : week.status === 'signed' ? 'Signed' : 'Pending';
  return (
    <View style={[styles.card, { borderColor: border }]}>
      <Pressable onPress={onToggle} style={styles.cardHd}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardWeek}>{week.weekLabel}</Text>
            <Pill variant={week.status === 'paid' ? 'green' : 'amber'}>{statusLabel}</Pill>
          </View>
          <Text style={styles.cardSub} numberOfLines={1}>
            {/* Agency FIRST: two vouchers for one week are otherwise identical
                here down to the venue, with only the PV number differing. */}
            {week.agencyName ? `${week.agencyName} · ` : ''}
            {week.ref} · {week.outlet}
          </Text>
          <Text style={styles.cardSub} numberOfLines={1}>
            {week.shifts} shift{week.shifts !== 1 ? 's' : ''} · Issued {week.issued}
          </Text>
          <Text
            style={[
              styles.cardMeta,
              { color: week.status === 'paid' ? C.green : C.amber },
            ]}
          >
            {week.statusMeta}
          </Text>
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.cardNet}>{formatRM(week.net)}</Text>
          <ChevronDown
            size={16}
            color={C.goldL}
            style={open ? { transform: [{ rotate: '180deg' }] } : undefined}
          />
        </View>
      </Pressable>

      <View style={styles.metrics}>
        <Metric label="Wages" value={formatRM(week.wages)} color={C.violetL} />
        <Metric label="Commission" value={formatRM(week.commission)} color={C.goldL} />
        {week.earlyWithdrawal != null && week.earlyWithdrawal > 0 && (
          <Metric
            label="Early withdrawal"
            value={`−${formatRM(week.earlyWithdrawal)}`}
            color={C.red}
          />
        )}
      </View>

      {open && (
        <View style={styles.cardBody}>
          <Text style={styles.breakdownTitle}>WEEK BREAKDOWN</Text>
          <Text style={styles.breakdownNote}>PV issued every Sunday</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={styles.lineHead}>
                <Text style={[styles.th, { width: 70 }]}>Date</Text>
                <Text style={[styles.th, { width: 120 }]}>Type</Text>
                <Text style={[styles.th, { width: 90 }]}>Outlet</Text>
                <Text style={[styles.th, { width: 80, textAlign: 'right' }]}>Amount</Text>
              </View>
              {week.lines.map((l, i) => (
                <View key={`${l.date}-${l.type}-${i}`} style={styles.lineRow}>
                  <View style={{ width: 70 }}>
                    <Text style={styles.td}>{l.date}</Text>
                    <Text style={styles.tdTiny}>{l.day}</Text>
                  </View>
                  <Text style={[styles.td, { width: 120 }]} numberOfLines={1}>
                    {l.type}
                  </Text>
                  <Text style={[styles.td, { width: 90 }]} numberOfLines={1}>
                    {l.outlet}
                  </Text>
                  <Text
                    style={[
                      styles.td,
                      {
                        width: 80,
                        textAlign: 'right',
                        color: l.debit ? C.red : C.accentL,
                        fontFamily: F.sora,
                        fontWeight: '700',
                      },
                    ]}
                  >
                    {l.debit ? `−${formatRM(l.amount)}` : formatRM(l.amount)}
                  </Text>
                </View>
              ))}
              <View style={[styles.lineRow, styles.netRow]}>
                <Text style={[styles.td, { width: 280, fontFamily: F.sora, fontWeight: '700' }]}>
                  Net payable
                </Text>
                <Text
                  style={[
                    styles.td,
                    {
                      width: 80,
                      textAlign: 'right',
                      color: C.accentL,
                      fontFamily: F.sora,
                      fontWeight: '800',
                    },
                  ]}
                >
                  {formatRM(week.net)}
                </Text>
              </View>
            </View>
          </ScrollView>

          {week.bankRef ? (
            <Text style={styles.bankRef}>Bank ref: {week.bankRef}</Text>
          ) : null}

          <View style={styles.actions}>
            <IzButton label="Open PV" small fullWidth={false} onPress={onOpenPv} />
            <IzButton
              label="PDF"
              icon={FileText}
              variant="soft"
              small
              fullWidth={false}
              onPress={onPdf}
            />
            <IzButton
              label="Excel"
              variant="soft"
              small
              fullWidth={false}
              onPress={onExcel}
            />
          </View>
        </View>
      )}
    </View>
  );
}

function Metric({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricVal, { color }]}>{value}</Text>
    </View>
  );
}

function StatTile({
  icon: Icon,
  value,
  label,
  valueColor,
  accent,
}: {
  icon?: typeof Calendar;
  value: string;
  label: string;
  valueColor?: string;
  accent?: boolean;
}) {
  return (
    <View style={[styles.statTile, accent && styles.statTileAccent]}>
      {Icon ? <Icon size={12} color={C.muted2} /> : null}
      <Text
        style={[styles.statValue, valueColor ? { color: valueColor } : null]}
        adjustsFontSizeToFit
        minimumFontScale={0.55}
        numberOfLines={2}
      >
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function FilterField({
  icon: Icon,
  label,
  value,
  onPress,
  disabled,
  flex,
}: {
  icon: typeof House;
  label: string;
  value: string;
  onPress?: () => void;
  disabled?: boolean;
  flex?: boolean;
}) {
  return (
    <Pressable
      style={[styles.filterField, flex && { flex: 1 }, disabled && { opacity: 0.55 }]}
      onPress={disabled ? undefined : onPress}
      disabled={disabled || !onPress}
    >
      <Text style={styles.filterFieldLabel}>{label}</Text>
      <View style={styles.filterFieldValueRow}>
        <Icon size={12} color={C.muted2} />
        <Text style={styles.filterFieldValue} numberOfLines={1}>
          {value}
        </Text>
        {onPress && !disabled ? <ChevronDown size={12} color={C.muted} /> : null}
      </View>
    </Pressable>
  );
}

function SelectList({
  options,
  selected,
  onPick,
}: {
  options: { id: string; label: string }[];
  selected: string;
  onPick: (id: string) => void;
}) {
  return (
    <View style={styles.selectList}>
      {options.map((o) => (
        <Pressable
          key={o.id || 'any'}
          style={[styles.selectRow, selected === o.id && styles.selectRowOn]}
          onPress={() => onPick(o.id)}
        >
          <Text style={styles.selectText}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  secHead: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  secTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  secTitle: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: C.txt,
  },
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
  },
  filterBtnText: { fontFamily: F.sora, fontSize: 12, fontWeight: '600', color: C.muted },
  filterBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterBadgeText: { fontFamily: F.sora, fontSize: 9, fontWeight: '800', color: '#241a08' },
  search: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  searchInput: { flex: 1, fontFamily: F.manrope, fontSize: 14, color: C.txt, padding: 0 },
  filterRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  timeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  filterField: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  filterFieldLabel: {
    fontFamily: F.sora,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: C.muted2,
  },
  filterFieldValueRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterFieldValue: { flex: 1, fontFamily: F.manrope, fontSize: 12, color: C.txt },
  selectList: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: C.bg2,
    overflow: 'hidden',
  },
  selectRow: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  selectRowOn: { backgroundColor: 'rgba(183,156,232,0.1)' },
  selectText: { fontFamily: F.sora, fontSize: 13, fontWeight: '600', color: C.txt },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.line,
  },
  chipOn: { borderColor: C.violet, backgroundColor: C.violetInk },
  chipText: { fontFamily: F.sora, fontSize: 13, fontWeight: '600', color: C.muted },
  clearAll: { fontFamily: F.sora, fontSize: 12, fontWeight: '600', color: C.goldL },
  statRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  statTile: {
    flex: 1,
    minWidth: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    gap: 4,
  },
  statTileAccent: { borderColor: 'rgba(232,194,122,0.28)' },
  statValue: {
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '800',
    color: C.txt,
    flexShrink: 1,
  },
  statLabel: { fontFamily: F.manrope, fontSize: 11, color: C.muted2 },
  summaryLine: {
    marginTop: 10,
    textAlign: 'center',
    fontFamily: F.manrope,
    fontSize: 12,
  },
  toast: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: F.manrope,
    fontSize: 12,
    color: C.green,
  },
  list: { gap: 10, marginTop: 14 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 28 },
  emptyText: { fontFamily: F.manrope, fontSize: 14, color: C.prMuted },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
    overflow: 'hidden',
  },
  cardHd: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
  },
  cardTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  cardWeek: { fontFamily: F.sora, fontSize: 15, fontWeight: '700', color: C.txt },
  cardSub: { marginTop: 3, fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
  cardMeta: { marginTop: 4, fontFamily: F.sora, fontSize: 12, fontWeight: '700' },
  cardRight: { alignItems: 'flex-end', gap: 8 },
  cardNet: { fontFamily: F.sora, fontSize: 16, fontWeight: '800', color: C.accentL },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 10,
  },
  metric: { minWidth: '45%', flexGrow: 1 },
  metricLabel: {
    fontFamily: F.sora,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: C.muted2,
  },
  metricVal: { marginTop: 2, fontFamily: F.sora, fontSize: 14, fontWeight: '700' },
  cardBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 12,
  },
  breakdownTitle: {
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    color: C.muted2,
  },
  breakdownNote: { marginTop: 4, fontFamily: F.manrope, fontSize: 11, color: C.prMuted2 },
  lineHead: { flexDirection: 'row', marginTop: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.line },
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(232,224,245,0.06)' },
  netRow: { borderBottomWidth: 0, marginTop: 4 },
  th: {
    fontFamily: F.sora,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: C.muted2,
  },
  td: { fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
  tdTiny: { fontFamily: F.manrope, fontSize: 10, color: C.muted2 },
  bankRef: { marginTop: 8, fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
  actions: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: C.line2,
    marginBottom: 12,
  },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  sheetTitle: { fontFamily: F.sora, fontSize: 20, fontWeight: '800', color: C.txt },
  fieldLabel: {
    marginTop: 12,
    marginBottom: 4,
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: C.prMuted2,
  },
  sheetField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  sheetFieldText: { flex: 1, fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.txt },
  sheetFieldInput: { flex: 1, fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.txt, padding: 0 },
  netInput: {
    fontFamily: F.sora,
    fontSize: 15,
    fontWeight: '600',
    color: C.txt,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  applyBtn: {
    marginTop: 18,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyText: { fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: '#241a08' },
  clearBtn: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: C.glass2,
    borderWidth: 1,
    borderColor: C.line2,
  },
  clearBtnText: { fontFamily: F.sora, fontSize: 15, fontWeight: '600', color: C.txt },
});
