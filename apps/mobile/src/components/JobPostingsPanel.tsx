/**
 * Job postings — port of proto `SpecialServicePortalSection` (role=pr)
 * shown on `/host?view=services`.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { DAY_SHORT, MONTH_SHORT, formatRM } from '../lib/demo-shifts';
import {
  SERVICE_OFFERS,
  STATUS_FILTER_OPTIONS,
  offerLabel,
  type ServiceOrder,
  type ServiceStatus,
} from '../lib/demo-services';
import { useSession } from '../lib/session';
import { useLocale, formatMessage, type AppTranslations } from '../i18n';
import {
  createPrSpecialService,
  fetchMySpecialServices,
  type SpecialServiceRecord,
} from '../lib/api';
import { EmptyDashed, IzButton, Pill } from './ui';
import {
  Check,
  ChevronDown,
  CircleHelp,
  Clock,
  Plus,
} from './icons';

type Filters = {
  date: string;
  service: string;
  status: string;
};

const EMPTY: Filters = { date: 'all', service: 'all', status: 'all' };

/**
 * Backend `special_service.status` -> the label the PR reads. The record KEY is
 * the stored enum and never changes; only the rendered label is translated.
 */
const PR_STATUS_LABEL: Record<string, (t: AppTranslations) => string> = {
  open: (t) => t.jobs.statusPendingReview,
  assigned: (t) => t.jobs.statusAssigned,
  in_progress: (t) => t.jobs.statusInProgress,
  completed: (t) => t.jobs.statusCompleted,
  cancelled: (t) => t.jobs.statusCancelled,
};

/** Filter option id (local-only, never sent) -> its rendered label. */
const STATUS_FILTER_LABEL: Record<string, (t: AppTranslations) => string> = {
  all: (t) => t.jobs.all,
  pending_admin: (t) => t.jobs.statusPendingReview,
  accepted: (t) => t.jobs.statusAccepted,
  rejected: (t) => t.jobs.statusRejected,
  pending_agency: (t) => t.jobs.statusPendingAgency,
  pending_pr: (t) => t.jobs.statusAwaitingPr,
  confirmed: (t) => t.jobs.statusConfirmed,
  declined: (t) => t.jobs.statusDeclined,
  paid: (t) => t.jobs.statusPaid,
};

function statusFilterLabel(id: string, t: AppTranslations): string {
  const resolve = STATUS_FILTER_LABEL[id];
  if (resolve) return resolve(t);
  return STATUS_FILTER_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

/**
 * `SERVICE_OFFERS[].id` -> its rendered name and blurb. The id itself is the
 * `category` posted to the backend, so only these labels are translated.
 */
const OFFER_LABEL: Record<string, (t: AppTranslations) => string> = {
  transportation: (t) => t.jobs.offerTransportation,
  delivery: (t) => t.jobs.offerDelivery,
  wardrobe: (t) => t.jobs.offerWardrobe,
  makeup: (t) => t.jobs.offerMakeup,
  vip_escort: (t) => t.jobs.offerVipEscort,
  uniform: (t) => t.jobs.offerUniform,
  emergency_cover: (t) => t.jobs.offerEmergencyCover,
  training: (t) => t.jobs.offerTraining,
  others: (t) => t.jobs.offerOthers,
  leave_agency: (t) => t.jobs.offerLeaveAgency,
};

const OFFER_SUMMARY: Record<string, (t: AppTranslations) => string> = {
  transportation: (t) => t.jobs.offerTransportationSummary,
  delivery: (t) => t.jobs.offerDeliverySummary,
  wardrobe: (t) => t.jobs.offerWardrobeSummary,
  makeup: (t) => t.jobs.offerMakeupSummary,
  vip_escort: (t) => t.jobs.offerVipEscortSummary,
  uniform: (t) => t.jobs.offerUniformSummary,
  emergency_cover: (t) => t.jobs.offerEmergencyCoverSummary,
  training: (t) => t.jobs.offerTrainingSummary,
  others: (t) => t.jobs.offerOthersSummary,
  leave_agency: (t) => t.jobs.offerLeaveAgencySummary,
};

function localOfferLabel(id: string, t: AppTranslations): string {
  return OFFER_LABEL[id]?.(t) ?? offerLabel(id);
}

function localOfferSummary(id: string, t: AppTranslations): string {
  const offer = SERVICE_OFFERS.find((o) => o.id === id);
  return OFFER_SUMMARY[id]?.(t) ?? offer?.summary ?? '';
}

type InitiatedBy = ServiceOrder['initiatedBy'];

/** Who raised the order — the stored value stays 'agency' | 'outlet' | 'pr'. */
const INITIATED_BY_LABEL: Record<InitiatedBy, (t: AppTranslations) => string> = {
  agency: (t) => t.jobs.agency,
  outlet: (t) => t.common.outlet,
  pr: (t) => t.topbar.pr,
};

// English on purpose: this label doubles as the DATE FILTER's identity, so a
// locale switch must not silently invalidate the picked filter value. What the
// PR reads comes from `localDateLabel` below, which resolves it back.
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dateLabel(d: Date): string {
  return `${DAY_LABELS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * The same date, worded for the reader.
 *
 * `dateLabel` above stays the row's IDENTITY: it is the date filter's option
 * id and the value `filters.date` is compared against, so it must not move
 * when the language does. This resolves that identity back through the very
 * two arrays that built it, so only the FACE of the filter chip and of the
 * order row changes. An unrecognised shape falls through unchanged rather than
 * rendering blank.
 */
function localDateLabel(label: string, t: AppTranslations): string {
  const m = /^(\w{3}) (\d{2}) (\w{3}) (\d{4})$/.exec(label);
  if (!m) return label;
  const dow = DAY_LABELS.indexOf(m[1]);
  const mon = MONTH_LABELS.indexOf(m[3]);
  if (dow < 0 || mon < 0) return label;
  return formatMessage(t.jobs.dateLine, {
    dow: DAY_SHORT[dow](t),
    d: m[2],
    mon: MONTH_SHORT[mon](t),
    y: m[4],
  });
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Today at the given HH:MM, as an ISO string for scheduledFor. */
function isoFromTodayTime(time: string): string {
  const [h, m] = time.split(':').map((n) => Number(n));
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return d.toISOString();
}

const BUDGET_DEFAULT = '00.00';

/**
 * Calculator-style currency formatting: digits fill in from the right (cents
 * first) and thousands are grouped, so any amount works — "120000" -> "1,200.00".
 * Empty input falls back to the 00.00 default.
 */
function formatBudgetInput(text: string): string {
  const digits = text.replace(/\D/g, '');
  if (!digits) return BUDGET_DEFAULT;
  const amount = parseInt(digits, 10) / 100;
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** The numeric value of a formatted budget string ("1,200.00" -> 1200). */
function budgetToNumber(formatted: string): number {
  return Number(formatted.replace(/,/g, ''));
}

/** Backend special_service row -> the ServiceOrder shape the cards render. */
function recordToOrder(rec: SpecialServiceRecord, t: AppTranslations): ServiceOrder {
  const when = rec.scheduledFor ?? rec.createdAt;
  const d = new Date(when);
  const who = rec.postingPrName ?? t.jobs.you;
  return {
    id: rec.id,
    prName: who,
    outlet: t.jobs.adminService,
    date: dateLabel(d),
    time: rec.scheduledFor ? hhmm(d) : '—',
    serviceType: rec.category,
    description: rec.description ?? '',
    amountIn: 0,
    amountOut: rec.budget ? Number(rec.budget) : 0,
    initiatedBy: 'pr',
    raisedBy: formatMessage(t.jobs.raisedByPr, { name: who }),
    status: (rec.status === 'completed' ? 'accepted' : 'pending_admin') as ServiceStatus,
    statusLabel: PR_STATUS_LABEL[rec.status]?.(t) ?? rec.status,
  };
}

export function JobPostingsPanel({
  onOrdersCountChange,
}: {
  /** Keep the Shifts ↔ Job postings badge in sync with this list. */
  onOrdersCountChange?: (count: number) => void;
} = {}) {
  const { t } = useLocale();
  const { token } = useSession();
  const [records, setRecords] = useState<SpecialServiceRecord[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [openSelect, setOpenSelect] = useState<'date' | 'service' | 'status' | null>(null);

  const [draftType, setDraftType] = useState(SERVICE_OFFERS[0].id);
  const [draftTime, setDraftTime] = useState('19:00');
  const [draftNote, setDraftNote] = useState('');
  const [draftBudget, setDraftBudget] = useState(BUDGET_DEFAULT);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // This PR's real service orders — the same rows the admin portal reads.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchMySpecialServices(token)
      .then((rows) => {
        if (cancelled) return;
        setRecords(rows);
        onOrdersCountChange?.(rows.length);
      })
      .catch(() => {
        if (cancelled) return;
        setRecords([]);
        onOrdersCountChange?.(0);
      });
    return () => {
      cancelled = true;
    };
  }, [token, onOrdersCountChange]);

  // Re-derived from the raw rows so a locale switch relabels without refetching.
  const orders = useMemo(() => records.map((rec) => recordToOrder(rec, t)), [records, t]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (filters.service !== 'all' && o.serviceType !== filters.service) return false;
      if (filters.status !== 'all' && o.status !== filters.status) return false;
      if (filters.date !== 'all' && o.date !== filters.date) return false;
      return true;
    });
  }, [orders, filters]);

  const dateOptions = useMemo(() => {
    const set = new Set(orders.map((o) => o.date));
    return ['all', ...Array.from(set)];
  }, [orders]);

  const draftOffer = SERVICE_OFFERS.find((o) => o.id === draftType) ?? SERVICE_OFFERS[0];
  const isLeave = draftType === 'leave_agency';
  const filtersActive =
    filters.date !== 'all' || filters.service !== 'all' || filters.status !== 'all';

  const openOrderSheet = (serviceId?: string) => {
    setDraftType(serviceId ?? SERVICE_OFFERS[0].id);
    setDraftTime('19:00');
    setDraftNote('');
    setDraftBudget(BUDGET_DEFAULT);
    setSubmitError(null);
    setOrderOpen(true);
  };

  const submitOrder = async () => {
    if (!token || submitting) return;
    if (isLeave && !draftNote.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const budgetNum = budgetToNumber(draftBudget);
      const rec = await createPrSpecialService(token, {
        // English on purpose: title/description are STORED and read by admin.
        title: draftOffer.label,
        // Backend has no 'leave_agency' category — file it under 'others'.
        category: isLeave ? 'others' : draftType,
        description: draftNote.trim() || draftOffer.summary,
        budget: Number.isFinite(budgetNum) && budgetNum > 0 ? budgetNum : undefined,
        scheduledFor: isLeave ? null : isoFromTodayTime(draftTime),
      });
      setRecords((prev) => {
        const next = [rec, ...prev];
        onOrdersCountChange?.(next.length);
        return next;
      });
      setOrderOpen(false);
      setOrdersOpen(true);
    } catch (error) {
      // Surface the failure so a silent no-op never looks like success.
      setSubmitError(error instanceof Error ? error.message : t.jobs.submitFailed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          <Text style={{ color: C.violetL }}>✦ </Text>
          {t.jobs.banner}
        </Text>
      </View>

      <IzButton
        label={t.jobs.orderService}
        icon={Plus}
        small
        onPress={() => openOrderSheet()}
        style={{ marginTop: 12, alignSelf: 'flex-start', width: 'auto', paddingHorizontal: 16 }}
      />

      <View style={styles.filterCard}>
        <View style={styles.filterHead}>
          <Text style={styles.filterTitle}>{t.jobs.filterBookings}</Text>
          <Text style={styles.filterCount}>
            {formatMessage(t.jobs.countOf, {
              shown: filtered.length,
              total: orders.length,
            })}
          </Text>
        </View>
        <View style={styles.filterGrid}>
          <FilterField
            label={t.jobs.filterDate}
            value={
              filters.date === 'all'
                ? t.jobs.allDates
                : localDateLabel(filters.date, t)
            }
            open={openSelect === 'date'}
            onToggle={() => setOpenSelect((s) => (s === 'date' ? null : 'date'))}
          />
          <FilterField
            label={t.jobs.filterService}
            value={filters.service === 'all' ? t.jobs.all : localOfferLabel(filters.service, t)}
            open={openSelect === 'service'}
            onToggle={() => setOpenSelect((s) => (s === 'service' ? null : 'service'))}
          />
          <FilterField
            label={t.jobs.filterStatus}
            value={statusFilterLabel(filters.status, t)}
            open={openSelect === 'status'}
            onToggle={() => setOpenSelect((s) => (s === 'status' ? null : 'status'))}
          />
        </View>

        {openSelect === 'date' && (
          <SelectList
            options={dateOptions.map((d) => ({
              id: d,
              label: d === 'all' ? t.jobs.allDates : localDateLabel(d, t),
            }))}
            selected={filters.date}
            onPick={(id) => {
              setFilters((f) => ({ ...f, date: id }));
              setOpenSelect(null);
            }}
          />
        )}
        {openSelect === 'service' && (
          <SelectList
            options={[
              { id: 'all', label: t.jobs.all },
              ...SERVICE_OFFERS.map((o) => ({ id: o.id, label: localOfferLabel(o.id, t) })),
            ]}
            selected={filters.service}
            onPick={(id) => {
              setFilters((f) => ({ ...f, service: id }));
              setOpenSelect(null);
            }}
          />
        )}
        {openSelect === 'status' && (
          <SelectList
            options={STATUS_FILTER_OPTIONS.map((o) => ({
              id: o.id,
              label: statusFilterLabel(o.id, t),
            }))}
            selected={filters.status}
            onPick={(id) => {
              setFilters((f) => ({ ...f, status: id }));
              setOpenSelect(null);
            }}
          />
        )}

        {filtersActive && (
          <Pressable
            style={styles.clearBtn}
            onPress={() => {
              setFilters(EMPTY);
              setOpenSelect(null);
            }}
          >
            <Text style={styles.clearText}>{t.jobs.clearFilters}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.ordersSec}>
        <Pressable style={styles.ordersHd} onPress={() => setOrdersOpen((o) => !o)}>
          <View style={{ flex: 1 }}>
            <View style={styles.ordersTitleRow}>
              <CircleHelp size={14} color={C.muted2} />
              <Text style={styles.ordersTitle}>{t.jobs.yourServiceOrders}</Text>
            </View>
            <Text style={styles.ordersHint}>
              {formatMessage(
                filtered.length === 1 ? t.jobs.recordOne : t.jobs.recordMany,
                { n: filtered.length },
              )}
            </Text>
            <Text style={styles.tapHint}>
              {ordersOpen ? t.jobs.tapToCollapse : t.jobs.tapToExpand}
            </Text>
          </View>
          <ChevronDown
            size={16}
            color={C.goldL}
            style={ordersOpen ? { transform: [{ rotate: '180deg' }] } : undefined}
          />
        </Pressable>
        {ordersOpen && (
          <View style={styles.ordersBody}>
            {filtered.length === 0 ? (
              <EmptyDashed>{t.jobs.noOrders}</EmptyDashed>
            ) : (
              filtered.map((row) => <OrderCard key={row.id} row={row} />)
            )}
          </View>
        )}
      </View>

      <Pressable style={styles.guide} onPress={() => setGuideOpen((o) => !o)}>
        <View style={styles.guideHd}>
          <CircleHelp size={14} color={C.muted} />
          <Text style={styles.guideTitle}>{t.jobs.iconGuide}</Text>
          <ChevronDown
            size={14}
            color={C.muted}
            style={guideOpen ? { transform: [{ rotate: '180deg' }] } : undefined}
          />
        </View>
        {guideOpen && (
          <Text style={styles.guideBody}>{t.jobs.iconGuideBody}</Text>
        )}
      </Pressable>

      <Modal
        visible={orderOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setOrderOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOrderOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.sheetScroll}
            >
              <Text style={styles.sheetTitle}>
                {isLeave ? t.jobs.serviceRequestTitle : t.jobs.orderServiceTitle}
              </Text>
              <Text style={styles.sheetSub}>{t.jobs.sheetSubtitle}</Text>

              <Text style={styles.fieldLabel}>{t.jobs.service}</Text>
              <ScrollView
                style={styles.offerList}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                {SERVICE_OFFERS.map((o) => (
                  <Pressable
                    key={o.id}
                    style={[styles.offerRow, draftType === o.id && styles.offerRowOn]}
                    onPress={() => setDraftType(o.id)}
                  >
                    <Text style={styles.offerLabel}>{localOfferLabel(o.id, t)}</Text>
                    {draftType === o.id && <Check size={14} color={C.goldL} />}
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={styles.offerSummary}>{localOfferSummary(draftOffer.id, t)}</Text>

              {!isLeave && (
                <>
                  <Text style={styles.fieldLabel}>{t.jobs.budget}</Text>
                  <TextInput
                    value={draftBudget}
                    onChangeText={(text) => setDraftBudget(formatBudgetInput(text))}
                    style={styles.input}
                    keyboardType="numeric"
                    selectTextOnFocus
                  />

                  <Text style={styles.fieldLabel}>{t.jobs.serviceTime}</Text>
                  <ServiceTimePicker value={draftTime} onChange={setDraftTime} />
                </>
              )}

              <Text style={styles.fieldLabel}>{isLeave ? t.jobs.reason : t.jobs.notes}</Text>
              <TextInput
                value={draftNote}
                onChangeText={setDraftNote}
                style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
                multiline
                placeholder={
                  isLeave ? t.jobs.reasonPlaceholder : t.jobs.notesPlaceholder
                }
                placeholderTextColor={C.muted2}
              />

              {submitError && <Text style={styles.submitError}>{submitError}</Text>}

              <Pressable
                style={[
                  styles.submit,
                  grad(GRADIENTS.accent, C.accent),
                  submitting && { opacity: 0.6 },
                ]}
                onPress={submitOrder}
                disabled={submitting}
              >
                <Text style={styles.submitText}>
                  {submitting
                    ? t.jobs.submitting
                    : isLeave
                      ? t.jobs.raiseTicket
                      : t.jobs.submitToAdmin}
                </Text>
              </Pressable>
              <Pressable style={styles.cancel} onPress={() => setOrderOpen(false)}>
                <Text style={styles.cancelText}>{t.common.back}</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

type TimePeriod = 'AM' | 'PM';
type Time12Parts = { hour12: number; minute: number; period: TimePeriod };

const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const PERIODS: TimePeriod[] = ['AM', 'PM'];

function parseTime12(hhmm: string): Time12Parts {
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  const h24 = m ? Math.min(23, Math.max(0, parseInt(m[1], 10))) : 19;
  const minute = m ? Math.min(59, Math.max(0, parseInt(m[2], 10))) : 0;
  const period: TimePeriod = h24 >= 12 ? 'PM' : 'AM';
  return { hour12: h24 % 12 || 12, minute, period };
}

function formatTime24(parts: Time12Parts): string {
  let h24 = parts.hour12 % 12;
  if (parts.period === 'PM') h24 += 12;
  return `${String(h24).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function formatTimeLabel(hhmm: string, t: AppTranslations): string {
  const { hour12, minute, period } = parseTime12(hhmm);
  const clock = `${hour12}:${String(minute).padStart(2, '0')}`;
  // One template per period — Chinese puts 上午/下午 before the clock.
  return formatMessage(period === 'AM' ? t.jobs.timeAm : t.jobs.timePm, { time: clock });
}

function TimePickerColumn<T extends string | number>({
  items,
  value,
  onChange,
  formatItem,
}: {
  items: readonly T[];
  value: T;
  onChange: (v: T) => void;
  formatItem: (v: T) => string;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const selectedIndex = Math.max(0, items.indexOf(value));

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, selectedIndex * 36 - 36), animated: false });
    });
    return () => cancelAnimationFrame(id);
  }, [selectedIndex]);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.timeCol}
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
    >
      {items.map((item) => {
        const selected = item === value;
        return (
          <Pressable
            key={String(item)}
            style={[styles.timeColBtn, selected && styles.timeColBtnOn]}
            onPress={() => onChange(item)}
          >
            <Text style={[styles.timeColText, selected && styles.timeColTextOn]}>
              {formatItem(item)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Tap-to-open 12h time picker — mirrors proto `IzTimeInput`. */
function ServiceTimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const draft = useMemo(() => parseTime12(value || '19:00'), [value]);

  const apply = (next: Time12Parts) => onChange(formatTime24(next));

  return (
    <View>
      <Pressable
        style={[styles.timeTrigger, open && styles.timeTriggerOpen]}
        onPress={() => setOpen((o) => !o)}
      >
        <Clock size={16} color={C.muted2} />
        <Text style={styles.timeTriggerLabel}>{formatTimeLabel(value || '19:00', t)}</Text>
        <ChevronDown
          size={14}
          color={C.muted}
          style={open ? { transform: [{ rotate: '180deg' }] } : undefined}
        />
      </Pressable>
      {open && (
        <View style={styles.timePopover}>
          <View style={styles.timeColumns}>
            <TimePickerColumn
              items={HOURS_12}
              value={draft.hour12}
              onChange={(hour12) => apply({ ...draft, hour12 })}
              formatItem={(h) => String(h).padStart(2, '0')}
            />
            <TimePickerColumn
              items={MINUTES}
              value={draft.minute}
              onChange={(minute) => apply({ ...draft, minute })}
              formatItem={(m) => String(m).padStart(2, '0')}
            />
            <TimePickerColumn
              items={PERIODS}
              value={draft.period}
              onChange={(period) => apply({ ...draft, period })}
              formatItem={(p) => (p === 'AM' ? t.jobs.am : t.jobs.pm)}
            />
          </View>
        </View>
      )}
    </View>
  );
}

function FilterField({
  label,
  value,
  open,
  onToggle,
}: {
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable style={[styles.filterField, open && styles.filterFieldOpen]} onPress={onToggle}>
      <Text style={styles.filterFieldLabel}>{label}</Text>
      <View style={styles.filterFieldValueRow}>
        <Text style={styles.filterFieldValue} numberOfLines={1}>
          {value}
        </Text>
        <ChevronDown size={12} color={C.muted} />
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
    <ScrollView
      style={styles.selectList}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
    >
      {options.map((o) => (
        <Pressable
          key={o.id}
          style={[styles.selectRow, selected === o.id && styles.selectRowOn]}
          onPress={() => onPick(o.id)}
        >
          <Text style={[styles.selectText, selected === o.id && { color: C.violetL }]}>
            {o.label}
          </Text>
          {selected === o.id && <Check size={14} color={C.violetL} />}
        </Pressable>
      ))}
    </ScrollView>
  );
}

function OrderCard({ row }: { row: ServiceOrder }) {
  const { t } = useLocale();
  const outAmount = row.amountOut > 0 ? formatRM(row.amountOut) : t.jobs.tbc;
  return (
    <View style={styles.orderCard}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.orderTop}>
          <Text style={styles.orderId}>{row.id}</Text>
          <Pill variant={row.status === 'accepted' ? 'green' : 'amber'}>{row.statusLabel}</Pill>
          <View style={styles.initPill}>
            <Text style={styles.initPillText}>{INITIATED_BY_LABEL[row.initiatedBy](t)}</Text>
          </View>
        </View>
        <Text style={styles.orderPr}>{row.prName}</Text>
        <Text style={styles.orderMeta}>
          {localOfferLabel(row.serviceType, t)} · {row.outlet} ·{' '}
          {localDateLabel(row.date, t)} · {row.time}
        </Text>
        <Text style={styles.orderDesc}>{row.description}</Text>
        <Text style={styles.orderMoney}>
          {formatMessage(t.jobs.orderMoney, {
            inAmt: formatRM(row.amountIn),
            outAmt: outAmount,
            who: row.raisedBy,
          })}
        </Text>
      </View>
      <View style={styles.orderOut}>
        <Text style={styles.orderOutLabel}>{t.jobs.out}</Text>
        <Text style={styles.orderOutAmt}>{outAmount}</Text>
        {row.amountIn > 0 && (
          <Text style={styles.orderInAmt}>
            {formatMessage(t.jobs.inAmount, { amount: formatRM(row.amountIn) })}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginTop: 12 },
  banner: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(159,122,234,0.2)',
    backgroundColor: 'rgba(159,122,234,0.04)',
    padding: 12,
  },
  bannerText: {
    fontFamily: F.manrope,
    fontSize: 12,
    lineHeight: 17,
    color: C.prMuted2,
  },
  filterCard: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 12,
  },
  filterHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  filterTitle: {
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: C.muted2,
  },
  filterCount: { fontFamily: F.sora, fontSize: 12, fontWeight: '700', color: C.goldL },
  filterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  filterField: {
    flexGrow: 1,
    minWidth: '30%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  filterFieldOpen: {
    borderColor: 'rgba(183,156,232,0.5)',
    backgroundColor: 'rgba(183,156,232,0.08)',
  },
  filterFieldLabel: {
    fontFamily: F.sora,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: C.muted2,
  },
  filterFieldValueRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  filterFieldValue: { flex: 1, fontFamily: F.manrope, fontSize: 12, color: C.txt },
  selectList: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: C.bg2,
    maxHeight: 260,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  selectRowOn: { backgroundColor: 'rgba(183,156,232,0.1)' },
  selectText: { fontFamily: F.sora, fontSize: 13, fontWeight: '600', color: C.txt },
  clearBtn: { marginTop: 10, alignSelf: 'flex-start' },
  clearText: { fontFamily: F.sora, fontSize: 12, fontWeight: '600', color: C.goldL },
  ordersSec: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  ordersHd: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  ordersTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ordersTitle: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.44,
    color: C.txt,
  },
  ordersHint: { marginTop: 2, fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
  tapHint: { marginTop: 4, fontFamily: F.manrope, fontSize: 12, fontWeight: '600', color: C.goldL },
  ordersBody: { paddingHorizontal: 12, paddingBottom: 12, gap: 10, borderTopWidth: 1, borderTopColor: C.line },
  orderCard: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  orderTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  orderId: { fontFamily: F.sora, fontSize: 13, fontWeight: '800', color: C.violetL },
  initPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.line2,
  },
  initPillText: { fontFamily: F.sora, fontSize: 10, fontWeight: '700', color: C.muted },
  orderPr: { marginTop: 6, fontFamily: F.sora, fontSize: 14, fontWeight: '700', color: C.txt },
  orderMeta: { marginTop: 2, fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
  orderDesc: { marginTop: 4, fontFamily: F.manrope, fontSize: 12, color: C.prMuted2 },
  orderMoney: { marginTop: 4, fontFamily: F.manrope, fontSize: 11, color: C.muted2 },
  orderOut: { alignItems: 'flex-end', minWidth: 72 },
  orderOutLabel: { fontFamily: F.sora, fontSize: 10, fontWeight: '700', color: C.muted2 },
  orderOutAmt: { marginTop: 2, fontFamily: F.sora, fontSize: 14, fontWeight: '800', color: C.accentL },
  orderInAmt: { marginTop: 4, fontFamily: F.manrope, fontSize: 11, color: C.green },
  guide: {
    marginTop: 14,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    padding: 12,
  },
  guideHd: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  guideTitle: { flex: 1, fontFamily: F.sora, fontSize: 13, fontWeight: '700', color: C.txt },
  guideBody: { marginTop: 8, fontFamily: F.manrope, fontSize: 12, color: C.prMuted, lineHeight: 17 },
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
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    maxWidth: 392,
    width: '100%',
    alignSelf: 'center',
    maxHeight: '90%',
  },
  sheetScroll: {
    paddingBottom: 16,
  },
  sheetTitle: { fontFamily: F.sora, fontSize: 20, fontWeight: '800', color: C.txt },
  sheetSub: { marginTop: 6, fontFamily: F.manrope, fontSize: 13, color: C.prMuted, lineHeight: 18 },
  fieldLabel: {
    marginTop: 12,
    marginBottom: 4,
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: C.prMuted2,
  },
  offerList: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    maxHeight: 280,
  },
  offerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  offerRowOn: { backgroundColor: 'rgba(183,156,232,0.1)' },
  offerLabel: { fontFamily: F.sora, fontSize: 13, fontWeight: '600', color: C.txt },
  offerSummary: { marginTop: 6, fontFamily: F.manrope, fontSize: 12, color: C.prMuted },
  timeTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  timeTriggerOpen: {
    borderColor: 'rgba(183,156,232,0.5)',
    backgroundColor: 'rgba(183,156,232,0.08)',
  },
  timeTriggerLabel: {
    flex: 1,
    fontFamily: F.sora,
    fontSize: 15,
    fontWeight: '600',
    color: C.txt,
  },
  timePopover: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.line2,
    backgroundColor: C.bg2,
    padding: 8,
  },
  timeColumns: {
    flexDirection: 'row',
    gap: 6,
    height: 148,
  },
  timeCol: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  timeColBtn: {
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  timeColBtnOn: {
    backgroundColor: 'rgba(183,156,232,0.18)',
  },
  timeColText: {
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '600',
    color: C.muted,
  },
  timeColTextOn: {
    color: C.goldL,
  },
  input: {
    fontFamily: F.sora,
    fontSize: 15,
    fontWeight: '600',
    color: C.txt,
    borderWidth: 1,
    borderColor: C.line2,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  submit: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitText: { fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: '#241a08' },
  submitError: {
    marginTop: 12,
    fontFamily: F.manrope,
    fontSize: 12,
    color: '#ff8a8a',
    textAlign: 'center',
  },
  cancel: { marginTop: 10, alignItems: 'center', padding: 10 },
  cancelText: { fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.muted },
});
