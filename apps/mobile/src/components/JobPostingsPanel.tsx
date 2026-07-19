/**
 * Job postings — port of proto `SpecialServicePortalSection` (role=pr)
 * shown on `/host?view=services`.
 */
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, F, GRADIENTS, grad } from '../theme/theme';
import { formatRM } from '../lib/demo-shifts';
import {
  SERVICE_OFFERS,
  STATUS_FILTER_OPTIONS,
  offerLabel,
  seedVickyServiceOrders,
  type ServiceOrder,
} from '../lib/demo-services';
import { EmptyDashed, IzButton, Pill } from './ui';
import {
  Check,
  ChevronDown,
  CircleHelp,
  Plus,
} from './icons';

type Filters = {
  date: string;
  service: string;
  status: string;
};

const EMPTY: Filters = { date: 'all', service: 'all', status: 'all' };

export function JobPostingsPanel() {
  const [orders, setOrders] = useState<ServiceOrder[]>(() => seedVickyServiceOrders());
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [openSelect, setOpenSelect] = useState<'date' | 'service' | 'status' | null>(null);

  const [draftType, setDraftType] = useState(SERVICE_OFFERS[0].id);
  const [draftTime, setDraftTime] = useState('19:00');
  const [draftNote, setDraftNote] = useState('');

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

  const openOrderSheet = () => {
    setDraftType(SERVICE_OFFERS[0].id);
    setDraftTime('19:00');
    setDraftNote('');
    setOrderOpen(true);
  };

  const submitOrder = () => {
    if (isLeave && !draftNote.trim()) return;
    const id = `SS-${Date.now().toString(36).toUpperCase()}`;
    const next: ServiceOrder = {
      id,
      prName: 'Vicky',
      outlet: isLeave ? 'Agency service' : 'Velvet 23',
      date: seedVickyServiceOrders()[0]?.date ?? 'Today',
      time: isLeave ? '—' : draftTime,
      serviceType: draftType,
      description: draftNote.trim() || draftOffer.summary,
      amountIn: 0,
      amountOut: draftOffer.defaultRate,
      initiatedBy: 'pr',
      raisedBy: 'Vicky (PR)',
      status: isLeave ? 'pending_agency' : 'pending_agency',
      statusLabel: isLeave ? 'Pending agency' : 'Pending agency',
    };
    setOrders((prev) => [next, ...prev]);
    setOrderOpen(false);
    setOrdersOpen(true);
  };

  return (
    <View style={styles.root}>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          <Text style={{ color: C.violetL }}>✦ </Text>
          Request transportation, makeup, wardrobe, and other agency services — or raise Leave
          agency under Service.
        </Text>
      </View>

      <IzButton
        label="Order service"
        icon={Plus}
        small
        onPress={openOrderSheet}
        style={{ marginTop: 12, alignSelf: 'flex-start', width: 'auto', paddingHorizontal: 16 }}
      />

      <View style={styles.filterCard}>
        <View style={styles.filterHead}>
          <Text style={styles.filterTitle}>FILTER BOOKINGS</Text>
          <Text style={styles.filterCount}>
            {filtered.length} of {orders.length}
          </Text>
        </View>
        <View style={styles.filterGrid}>
          <FilterField
            label="DATE"
            value={filters.date === 'all' ? 'All dates' : filters.date}
            open={openSelect === 'date'}
            onToggle={() => setOpenSelect((s) => (s === 'date' ? null : 'date'))}
          />
          <FilterField
            label="STATUS"
            value={
              STATUS_FILTER_OPTIONS.find((o) => o.id === filters.status)?.label ?? 'All'
            }
            open={openSelect === 'status'}
            onToggle={() => setOpenSelect((s) => (s === 'status' ? null : 'status'))}
          />
          <FilterField
            label="SERVICE"
            value={filters.service === 'all' ? 'All' : offerLabel(filters.service)}
            open={openSelect === 'service'}
            onToggle={() => setOpenSelect((s) => (s === 'service' ? null : 'service'))}
          />
        </View>

        {openSelect === 'date' && (
          <SelectList
            options={dateOptions.map((d) => ({
              id: d,
              label: d === 'all' ? 'All dates' : d,
            }))}
            selected={filters.date}
            onPick={(id) => {
              setFilters((f) => ({ ...f, date: id }));
              setOpenSelect(null);
            }}
          />
        )}
        {openSelect === 'status' && (
          <SelectList
            options={STATUS_FILTER_OPTIONS}
            selected={filters.status}
            onPick={(id) => {
              setFilters((f) => ({ ...f, status: id }));
              setOpenSelect(null);
            }}
          />
        )}
        {openSelect === 'service' && (
          <SelectList
            options={[
              { id: 'all', label: 'All' },
              ...SERVICE_OFFERS.map((o) => ({ id: o.id, label: o.label })),
            ]}
            selected={filters.service}
            onPick={(id) => {
              setFilters((f) => ({ ...f, service: id }));
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
            <Text style={styles.clearText}>Clear filters</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.ordersSec}>
        <Pressable style={styles.ordersHd} onPress={() => setOrdersOpen((o) => !o)}>
          <View style={{ flex: 1 }}>
            <View style={styles.ordersTitleRow}>
              <CircleHelp size={14} color={C.muted2} />
              <Text style={styles.ordersTitle}>Your service orders</Text>
            </View>
            <Text style={styles.ordersHint}>
              {filtered.length} record{filtered.length !== 1 ? 's' : ''}
            </Text>
            <Text style={styles.tapHint}>
              {ordersOpen ? 'Tap to collapse' : 'Tap to expand'}
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
              <EmptyDashed>No service orders yet</EmptyDashed>
            ) : (
              filtered.map((row) => <OrderCard key={row.id} row={row} />)
            )}
          </View>
        )}
      </View>

      <Pressable style={styles.guide} onPress={() => setGuideOpen((o) => !o)}>
        <View style={styles.guideHd}>
          <CircleHelp size={14} color={C.muted} />
          <Text style={styles.guideTitle}>Icon guide</Text>
          <ChevronDown
            size={14}
            color={C.muted}
            style={guideOpen ? { transform: [{ rotate: '180deg' }] } : undefined}
          />
        </View>
        {guideOpen && (
          <Text style={styles.guideBody}>
            What each icon means — same icon, same meaning everywhere. Today · Post Job · Shifts ·
            Check-In · Payment · History · Profile · Notifications · Drinks · Tips · Sign out.
          </Text>
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
            <Text style={styles.sheetTitle}>
              {isLeave ? 'Service request' : 'Order agency service'}
            </Text>
            <Text style={styles.sheetSub}>
              Request an agency add-on service — your agency will review and confirm.
            </Text>

            <Text style={styles.fieldLabel}>Service</Text>
            <View style={styles.offerList}>
              {SERVICE_OFFERS.map((o) => (
                <Pressable
                  key={o.id}
                  style={[styles.offerRow, draftType === o.id && styles.offerRowOn]}
                  onPress={() => setDraftType(o.id)}
                >
                  <Text style={styles.offerLabel}>{o.label}</Text>
                  {draftType === o.id && <Check size={14} color={C.goldL} />}
                </Pressable>
              ))}
            </View>
            <Text style={styles.offerSummary}>{draftOffer.summary}</Text>

            {!isLeave && (
              <>
                <Text style={styles.fieldLabel}>Service time</Text>
                <TextInput
                  value={draftTime}
                  onChangeText={setDraftTime}
                  style={styles.input}
                  placeholderTextColor={C.muted2}
                />
              </>
            )}

            <Text style={styles.fieldLabel}>{isLeave ? 'Reason' : 'Notes'}</Text>
            <TextInput
              value={draftNote}
              onChangeText={setDraftNote}
              style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
              multiline
              placeholder={
                isLeave
                  ? 'Reason for early leave…'
                  : 'Pickup address, delivery items, outlet contact…'
              }
              placeholderTextColor={C.muted2}
            />

            <Pressable
              style={[styles.submit, grad(GRADIENTS.accent, C.accent)]}
              onPress={submitOrder}
            >
              <Text style={styles.submitText}>
                {isLeave ? 'Raise support ticket' : 'Submit to agency'}
              </Text>
            </Pressable>
            <Pressable style={styles.cancel} onPress={() => setOrderOpen(false)}>
              <Text style={styles.cancelText}>Back</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
    <View style={styles.selectList}>
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
    </View>
  );
}

function OrderCard({ row }: { row: ServiceOrder }) {
  return (
    <View style={styles.orderCard}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.orderTop}>
          <Text style={styles.orderId}>{row.id}</Text>
          <Pill variant={row.status === 'accepted' ? 'green' : 'amber'}>{row.statusLabel}</Pill>
          <View style={styles.initPill}>
            <Text style={styles.initPillText}>
              {row.initiatedBy === 'agency'
                ? 'Agency'
                : row.initiatedBy === 'outlet'
                  ? 'Outlet'
                  : 'PR'}
            </Text>
          </View>
        </View>
        <Text style={styles.orderPr}>{row.prName}</Text>
        <Text style={styles.orderMeta}>
          {offerLabel(row.serviceType)} · {row.outlet} · {row.date} · {row.time}
        </Text>
        <Text style={styles.orderDesc}>{row.description}</Text>
        <Text style={styles.orderMoney}>
          In {formatRM(row.amountIn)} · Out {row.amountOut > 0 ? formatRM(row.amountOut) : 'TBC'} ·
          Raised by {row.raisedBy}
        </Text>
      </View>
      <View style={styles.orderOut}>
        <Text style={styles.orderOutLabel}>Out</Text>
        <Text style={styles.orderOutAmt}>
          {row.amountOut > 0 ? formatRM(row.amountOut) : 'TBC'}
        </Text>
        {row.amountIn > 0 && (
          <Text style={styles.orderInAmt}>In {formatRM(row.amountIn)}</Text>
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
    overflow: 'hidden',
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
  ordersTitle: { fontFamily: F.sora, fontSize: 15, fontWeight: '700', color: C.txt },
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
    padding: 18,
    paddingBottom: 28,
    maxWidth: 392,
    width: '100%',
    alignSelf: 'center',
    maxHeight: '90%',
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
    maxHeight: 180,
    overflow: 'hidden',
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
  cancel: { marginTop: 10, alignItems: 'center', padding: 10 },
  cancelText: { fontFamily: F.sora, fontSize: 14, fontWeight: '600', color: C.muted },
});
