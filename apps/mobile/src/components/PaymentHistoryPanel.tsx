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
import { font } from '../theme/fonts';
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
  localizePayLineType,
  localizePayOutlet,
  localizePayStatusMeta,
} from '../lib/payment-history-map';
import { formatMessage, useLocale, type AppTranslations } from '../i18n';
import {
  createMyVoucherExportTicket,
  fetchMyVoucherExcelBlob,
  fetchMyVoucherPdfBlob,
} from '../lib/api';
import { useSession } from '../lib/session';
import { useKeyboardInset } from '../lib/use-keyboard-inset';
import { useShiftSession } from '../lib/shift-session';
import { usePrNav } from '../lib/pr-nav';
import { useSignedPvs } from '../lib/signed-pv';
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

// Four states, matching the badge the cards already draw. 'pending' was the one
// the rows could SHOW but the filter could not SELECT — so the single question a
// PR opens this screen to ask ("what still needs me?") was the one it could not
// answer, and an unsigned week from a fortnight ago stayed buried among paid ones.
type StatusChip = 'all' | 'paid' | 'signed' | 'pending';

/**
 * One label map instead of a ternary repeated at both chip rows. The ternary
 * ended `: 'Signed'`, so ANY new state would silently have rendered as "Signed"
 * — on the one screen where that word is an attestation about money.
 *
 * Ordered pending → signed → paid on screen because that is the order a week
 * actually moves through, and the first one is the only one the PR can act on.
 *
 * It holds RESOLVERS, not strings: this map is module scope, so it is built once
 * before any hook has run and cannot read the dictionary itself. The record KEY
 * is the stored status and never moves with the locale.
 */
const CHIP_LABEL: Record<StatusChip, (t: AppTranslations) => string> = {
  all: (t) => t.payHistory.chipAll,
  pending: (t) => t.payHistory.chipToSign,
  signed: (t) => t.payHistory.statusSigned,
  paid: (t) => t.payHistory.statusPaid,
};

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
  const { t } = useLocale();
  const { openPv, lastOpenedPvId } = usePrNav();
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
  // Opens on the voucher she was just inside, and on nothing otherwise.
  //
  // The default is still every card collapsed — this only fires after a voucher
  // has actually been opened. Coming back from one, signed or not, used to drop
  // her onto a list of identical collapsed cards with nothing showing which one
  // she had just acted on; after signing that is the exact moment she is looking
  // for confirmation. Initialiser, not an effect, so it does not fight her if
  // she then collapses it.
  const [expanded, setExpanded] = useState<string | null>(
    () => lastOpenedPvId,
  );

  /**
   * 🔴 THE SERVER'S VOUCHER WINS. The local snapshot only covers the gap.
   *
   * This used to put `signedWeeks` FIRST and drop the API row for any voucher
   * that appeared in both — and since a local week with no API match is already
   * filtered out as a demo phantom, overriding the API was the only thing the
   * snapshot ever did. So the moment a PR signed, their History card froze at
   * the figures captured at signing: a later correction, a deduction, a resolved
   * dispute, the bank reference, even the change to Paid never reached that
   * card. The phone and the voucher disagreed permanently, and the phone is
   * where the PR checks whether they were paid.
   *
   * What the snapshot is genuinely FOR is the seconds after Confirm signature,
   * before the server's copy reflects it — so it is used only while the API
   * still calls that week `pending`. Once the API agrees the week is signed (or
   * paid), the API is the answer.
   *
   * ⚠️ `signed-pv.tsx` is web-only: `webStorage()` returns null unless
   * `Platform.OS === 'web'`, so on a real phone `signedWeeks` is always empty
   * and none of this applies. It applies to the web target the app is demoed and
   * tested on, which is where the frozen card was visible.
   */
  const allWeeks = useMemo(() => {
    const localById = new Map(
      signedWeeks.map((w) => [w.id, normalizeHistPayWeek(w)]),
    );
    return apiWeeks.map((w) => {
      const api = normalizeHistPayWeek(w);
      const local = localById.get(api.id);
      return local && api.status === 'pending' ? local : api;
    });
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
      if (applied.status === 'pending' && w.status !== 'pending') return false;
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
        // Both spellings of every localizable field: the stored English, which
        // is what the row IS, and the label the PR can actually see. Searching
        // only the stored side would mean a Chinese reader typing the words in
        // front of them matches nothing.
        const blob = [
          w.ref,
          w.weekLabel,
          w.outlet,
          localizePayOutlet(w.outlet, t),
          w.status,
          w.statusMeta,
          localizePayStatusMeta(w.statusMeta, t),
          w.bankRef ?? '',
          w.issued,
          ...w.lines.flatMap((l) => [
            l.type,
            localizePayLineType(l.type, t),
            l.outlet,
            l.date,
          ]),
        ]
          .join(' ')
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [applied, allWeeks, t]);

  const paidList = filtered.filter((w) => w.status === 'paid');
  const signedList = filtered.filter((w) => w.status === 'signed');
  const pendingList = filtered.filter((w) => w.status === 'pending');
  const totalPaid = paidList.reduce((s, w) => s + w.net, 0);
  const totalSigned = signedList.reduce((s, w) => s + w.net, 0);
  const totalPending = pendingList.reduce((s, w) => s + w.net, 0);
  // "All" now means all. It used to read `totalPaid + totalSigned`, which
  // quietly left unsigned weeks out of the headline figure — so a PR with a
  // fortnight-old voucher waiting on her signature saw a total that did not
  // include her own money, on the screen she opens to find exactly that.
  const totalNet =
    applied.status === 'paid'
      ? totalPaid
      : applied.status === 'signed'
        ? totalSigned
        : applied.status === 'pending'
          ? totalPending
          : totalPaid + totalSigned + totalPending;
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
        flash(t.payHistory.excelOpening);
      } catch {
        flash(t.payHistory.excelOpenFailed);
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
      flash(t.payHistory.excelDownloaded);
    } catch {
      flash(t.payHistory.excelDownloadFailed);
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
        flash(t.payHistory.pdfDownloading);
      } catch {
        flash(t.payHistory.voucherOpenFailed);
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
      flash(t.payHistory.pdfOpened);
    } catch {
      flash(t.payHistory.pdfOpenFailed);
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
          <Text style={styles.secTitle}>{t.payHistory.heading}</Text>
        </View>
        <Pressable style={styles.filterBtn} onPress={openFilter}>
          <Filter size={12} color={C.muted} />
          <Text style={styles.filterBtnText}>{t.payHistory.filter}</Text>
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
          placeholder={t.payHistory.searchPlaceholder}
          placeholderTextColor={C.muted2}
          style={styles.searchInput}
        />
      </View>

      <View style={styles.filterRow}>
        <FilterField
          icon={House}
          label={t.payHistory.outletLabel}
          value={applied.outlet === 'all' ? t.payHistory.anyOutlet : applied.outlet}
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
          options={[
            // `id` stays the stored 'all' — it is the filter VALUE and the row
            // key, so neither moves when the label does.
            { id: 'all', label: t.payHistory.anyOutlet },
            ...outlets.map((o) => ({ id: o, label: o })),
          ]}
          selected={applied.outlet}
          onPick={(id) => {
            setApplied((f) => ({ ...f, outlet: id }));
            setOpenSelect(null);
          }}
        />
      )}

      <View style={styles.timeRow}>
        <HistTimeInput
          label={t.payHistory.fromTime}
          value={applied.timeFrom}
          onChange={(timeFrom) => setApplied((f) => ({ ...f, timeFrom }))}
          disabled={!applied.date}
        />
        <HistTimeInput
          label={t.payHistory.toTime}
          value={applied.timeTo}
          onChange={(timeTo) => setApplied((f) => ({ ...f, timeTo }))}
          disabled={!applied.date}
        />
      </View>

      <View style={styles.chips}>
        {(['all', 'pending', 'signed', 'paid'] as StatusChip[]).map((c) => (
          <Pressable
            key={c}
            style={[styles.chip, applied.status === c && styles.chipOn]}
            onPress={() => setApplied((f) => ({ ...f, status: c }))}
          >
            <Text style={[styles.chipText, applied.status === c && { color: C.txt }]}>
              {CHIP_LABEL[c](t)}
            </Text>
          </Pressable>
        ))}
      </View>

      {filterCount > 0 && (
        <Pressable onPress={clearFilters} style={{ marginTop: 8 }}>
          <Text style={styles.clearAll}>{t.payHistory.clearAllFilters}</Text>
        </Pressable>
      )}

      <View style={styles.statRow}>
        <StatTile
          icon={Calendar}
          value={String(filtered.length)}
          label={t.payHistory.weeks}
        />
        <StatTile icon={Briefcase} value={String(shifts)} label={t.history.shifts} />
        <StatTile
          value={formatRM(totalNet)}
          label={
            applied.status === 'all'
              ? t.payHistory.totalNet
              : CHIP_LABEL[applied.status](t)
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
            {formatMessage(t.payHistory.paidSummary, {
              n: paidList.length,
              amount: formatRM(totalPaid),
            })}
          </Text>
          <Text style={{ color: C.muted2 }}> · </Text>
          <Text style={{ color: C.amber, fontWeight: '700' }}>
            {formatMessage(t.payHistory.signedSummary, {
              n: signedList.length,
              amount: formatRM(totalSigned),
            })}
          </Text>
        </Text>
      )}

      {toast ? <Text style={styles.toast}>{toast}</Text> : null}

      <View style={styles.list}>
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {allWeeks.length === 0
                ? t.payHistory.noPayments
                : t.payHistory.noMatches}
            </Text>
            {allWeeks.length === 0 && (
              <IzButton
                label={t.payHistory.openPayment}
                small
                onPress={onOpenPayment}
              />
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
              <Text style={styles.sheetTitle}>{t.payHistory.sheetTitle}</Text>
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
              <House size={11} color={C.muted2} /> {t.payHistory.outletLabel}
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
                {draft.outlet === 'all' ? t.payHistory.anyOutlet : draft.outlet}
              </Text>
              <ChevronDown size={14} color={C.muted} />
            </Pressable>

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>
              {t.payHistory.statusLabel}
            </Text>
            <View style={styles.chips}>
              {(['all', 'pending', 'signed', 'paid'] as StatusChip[]).map((c) => (
                <Pressable
                  key={c}
                  style={[styles.chip, draft.status === c && styles.chipOn]}
                  onPress={() => setDraft((d) => ({ ...d, status: c }))}
                >
                  <Text style={[styles.chipText, draft.status === c && { color: C.txt }]}>
                    {CHIP_LABEL[c](t)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>{t.payHistory.netPaidLabel}</Text>
            <TextInput
              value={draft.netPaid}
              onChangeText={(netPaid) => setDraft((d) => ({ ...d, netPaid }))}
              placeholder={t.payHistory.netPaidPlaceholder}
              placeholderTextColor={C.muted2}
              keyboardType="decimal-pad"
              style={styles.netInput}
            />

            <Pressable
              style={[styles.applyBtn, grad(GRADIENTS.accent, C.accent)]}
              onPress={applyFilters}
            >
              <Text style={styles.applyText}>{t.payHistory.applyFilters}</Text>
            </Pressable>
            <Pressable style={styles.clearBtn} onPress={clearFilters}>
              <Text style={styles.clearBtnText}>{t.payHistory.clearAndClose}</Text>
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
  const { t } = useLocale();
  // Three states, not two. 'Pending' is the honest badge for a week the PR has
  // not signed — it used to read "Signed", asserting a signature that had never
  // been given, on the very screen a PR opens to check exactly that.
  //
  // The LABEL moves with the locale; the `week.status` it is chosen by does not.
  const border =
    week.status === 'paid' ? 'rgba(93,217,160,0.35)' : 'rgba(232,198,106,0.35)';
  const statusLabel =
    week.status === 'paid'
      ? t.payHistory.statusPaid
      : week.status === 'signed'
        ? t.payHistory.statusSigned
        : t.payHistory.statusPending;
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
            {week.ref} · {localizePayOutlet(week.outlet, t)}
          </Text>
          <Text style={styles.cardSub} numberOfLines={1}>
            {/* Two whole keys, not a plural 's' glued on: Chinese has no plural
                form, and the sentence has to be one string in every locale. */}
            {formatMessage(
              week.shifts === 1
                ? t.payHistory.cardMetaOne
                : t.payHistory.cardMetaMany,
              { n: week.shifts, date: week.issued },
            )}
          </Text>
          <Text
            style={[
              styles.cardMeta,
              { color: week.status === 'paid' ? C.green : C.amber },
            ]}
          >
            {/* Localized HERE, not at the producer: the stored string is
                persisted verbatim by `signed-pv.tsx` and regex-migrated on read,
                so it has to stay English in storage. See `localizePayStatusMeta`. */}
            {localizePayStatusMeta(week.statusMeta, t)}
          </Text>
          {/* On the COLLAPSED card, beside the line that says it is waiting on
              her. The only other way in is Open PV, which sits below a full week
              breakdown inside the expanded body — so a PR who filtered to
              "To sign", got one result and wanted to sign it still had to expand,
              scroll past a table, and find a button whose label says nothing
              about signing. The action a filtered list exists for should not be
              three steps further in. */}
          {/* `canSign`, NOT `status === 'pending'`. The badge collapses three
              states into "Pending" and only one of them — `sent` — is the PR's
              move. Gating on the badge put "Sign this week" directly under this
              card's own line reading "Waiting for your agency to issue": an
              offer to sign a voucher that had never been handed over. */}
          {week.canSign && (
            <View style={{ marginTop: 8, alignSelf: 'flex-start' }}>
              <IzButton
                label={t.payHistory.signThisWeek}
                small
                fullWidth={false}
                onPress={onOpenPv}
              />
            </View>
          )}
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
        <Metric
          label={t.payHistory.metricWages}
          value={formatRM(week.wages)}
          color={C.violetL}
        />
        <Metric
          label={t.payHistory.metricCommission}
          value={formatRM(week.commission)}
          color={C.goldL}
        />
        {week.earlyWithdrawal != null && week.earlyWithdrawal > 0 && (
          <Metric
            label={t.payHistory.metricEarlyWithdrawal}
            value={`−${formatRM(week.earlyWithdrawal)}`}
            color={C.red}
          />
        )}
      </View>

      {open && (
        <View style={styles.cardBody}>
          <Text style={styles.breakdownTitle}>{t.payHistory.weekBreakdown}</Text>
          <Text style={styles.breakdownNote}>{t.payHistory.pvIssuedSunday}</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              <View style={styles.lineHead}>
                <Text style={[styles.th, { width: 70 }]}>{t.payHistory.colDate}</Text>
                <Text style={[styles.th, { width: 120 }]}>{t.payHistory.colType}</Text>
                <Text style={[styles.th, { width: 90 }]}>{t.common.outlet}</Text>
                <Text style={[styles.th, { width: 80, textAlign: 'right' }]}>
                  {t.payHistory.colAmount}
                </Text>
              </View>
              {week.lines.map((l, i) => (
                // Keyed on the STORED `l.type`, which does not move with the
                // locale — the row must not remount on a language switch.
                <View key={`${l.date}-${l.type}-${i}`} style={styles.lineRow}>
                  <View style={{ width: 70 }}>
                    <Text style={styles.td}>{l.date}</Text>
                    <Text style={styles.tdTiny}>{l.day}</Text>
                  </View>
                  <Text style={[styles.td, { width: 120 }]} numberOfLines={1}>
                    {localizePayLineType(l.type, t)}
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
                        ...font(700),
                      },
                    ]}
                  >
                    {l.debit ? `−${formatRM(l.amount)}` : formatRM(l.amount)}
                  </Text>
                </View>
              ))}
              <View style={[styles.lineRow, styles.netRow]}>
                <Text style={[styles.td, { width: 280, ...font(700) }]}>
                  {t.payHistory.netPayable}
                </Text>
                <Text
                  style={[
                    styles.td,
                    {
                      width: 80,
                      textAlign: 'right',
                      color: C.accentL,
                      ...font(800),
                    },
                  ]}
                >
                  {formatRM(week.net)}
                </Text>
              </View>
            </View>
          </ScrollView>

          {week.bankRef ? (
            <Text style={styles.bankRef}>
              {formatMessage(t.payHistory.bankRef, { ref: week.bankRef })}
            </Text>
          ) : null}

          <View style={styles.actions}>
            {/* SIGN LEADS when the week is waiting on her, and is absent when it
                is not — a button offering to sign an already-signed voucher is
                either a no-op or a second attestation, and neither is a thing
                this screen should suggest. It routes through `onOpenPv` rather
                than pulling the signature pad in here: one signing path, on the
                PV detail screen, where the full breakdown is in front of her
                when she signs for the money. */}
            {/* Same gate as the collapsed card — see the note there. */}
            {week.canSign && (
              <IzButton
                label={t.payHistory.sign}
                small
                fullWidth={false}
                onPress={onOpenPv}
              />
            )}
            {/* Open PV is soft only while it is the SECONDARY action. With no
                Sign button beside it, it is the only thing to press and should
                look it — the variant followed the badge, so an un-issued week
                quietly demoted its own single action. */}
            <IzButton
              label={t.payHistory.openPv}
              variant={week.canSign ? 'soft' : undefined}
              small
              fullWidth={false}
              onPress={onOpenPv}
            />
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
    ...font(800),
    fontSize: 12,
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
  filterBtnText: { ...font(600), fontSize: 12, color: C.muted },
  filterBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterBadgeText: { ...font(800), fontSize: 9, color: '#241a08' },
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
  searchInput: { flex: 1, ...font(), fontSize: 14, color: C.txt, padding: 0 },
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
    ...font(700),
    fontSize: 9,
    letterSpacing: 0.8,
    color: C.muted2,
  },
  filterFieldValueRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterFieldValue: { flex: 1, ...font(), fontSize: 12, color: C.txt },
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
  selectText: { ...font(600), fontSize: 13, color: C.txt },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.line,
  },
  chipOn: { borderColor: C.violet, backgroundColor: C.violetInk },
  chipText: { ...font(600), fontSize: 13, color: C.muted },
  clearAll: { ...font(600), fontSize: 12, color: C.goldL },
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
    ...font(800),
    fontSize: 14,
    color: C.txt,
    flexShrink: 1,
  },
  statLabel: { ...font(), fontSize: 11, color: C.muted2 },
  summaryLine: {
    marginTop: 10,
    textAlign: 'center',
    ...font(),
    fontSize: 12,
  },
  toast: {
    marginTop: 8,
    textAlign: 'center',
    ...font(),
    fontSize: 12,
    color: C.green,
  },
  list: { gap: 10, marginTop: 14 },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 28 },
  emptyText: { ...font(), fontSize: 14, color: C.prMuted },
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
  cardWeek: { ...font(700), fontSize: 15, color: C.txt },
  cardSub: { marginTop: 3, ...font(), fontSize: 12, color: C.prMuted },
  cardMeta: { marginTop: 4, ...font(700), fontSize: 12 },
  cardRight: { alignItems: 'flex-end', gap: 8 },
  cardNet: { ...font(800), fontSize: 16, color: C.accentL },
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
    ...font(700),
    fontSize: 10,
    letterSpacing: 0.6,
    color: C.muted2,
  },
  metricVal: { marginTop: 2, ...font(700), fontSize: 14 },
  cardBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 12,
  },
  breakdownTitle: {
    ...font(800),
    fontSize: 11,
    letterSpacing: 1,
    color: C.muted2,
  },
  breakdownNote: { marginTop: 4, ...font(), fontSize: 11, color: C.prMuted2 },
  lineHead: { flexDirection: 'row', marginTop: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.line },
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(232,224,245,0.06)' },
  netRow: { borderBottomWidth: 0, marginTop: 4 },
  th: {
    ...font(700),
    fontSize: 10,
    letterSpacing: 0.6,
    color: C.muted2,
  },
  td: { ...font(), fontSize: 12, color: C.prMuted },
  tdTiny: { ...font(), fontSize: 10, color: C.muted2 },
  bankRef: { marginTop: 8, ...font(), fontSize: 12, color: C.prMuted },
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
  sheetTitle: { ...font(800), fontSize: 20, color: C.txt },
  fieldLabel: {
    marginTop: 12,
    marginBottom: 4,
    ...font(600),
    fontSize: 11,
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
  sheetFieldText: { flex: 1, ...font(600), fontSize: 14, color: C.txt },
  sheetFieldInput: { flex: 1, ...font(600), fontSize: 14, color: C.txt, padding: 0 },
  netInput: {
    ...font(600),
    fontSize: 15,
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
  applyText: { ...font(700), fontSize: 16, color: '#241a08' },
  clearBtn: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: C.glass2,
    borderWidth: 1,
    borderColor: C.line2,
  },
  clearBtnText: { ...font(600), fontSize: 15, color: C.txt },
});
