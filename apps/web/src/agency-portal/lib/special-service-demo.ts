import { resolveRosterPrName } from '@agency-portal/lib/agency-demo';
import { DEFAULT_ROSTER_DATE_ISO } from '@agency-portal/lib/roster-availability';
import { fmtDateLabelFromIso } from '@agency-portal/lib/pr-demo';

export type SpecialServiceInitiator = 'agency' | 'outlet' | 'pr';

export type PartyAcceptance = 'pending' | 'accepted' | 'declined' | 'n/a';

export type SpecialServiceStatus =
  | 'pending_admin'
  | 'accepted'
  | 'rejected'
  | 'pending_agency'
  | 'pending_pr'
  | 'pending_outlet'
  | 'pending_both'
  | 'confirmed'
  | 'declined'
  | 'paid';

export type AgencySpecialServiceOffer = {
  id: string;
  label: string;
  summary: string;
  remarkHint: string;
  defaultRate: number;
  unit: string;
};

/** Services the agency offers to PRs and outlets beyond standard shift PV */
export const AGENCY_SPECIAL_SERVICE_OFFERS: AgencySpecialServiceOffer[] = [
  {
    id: 'transportation',
    label: 'Transportation',
    summary: 'Shift pickup, late-night return, and outlet transfers',
    remarkHint: 'Pickup location and destination',
    defaultRate: 45,
    unit: 'per trip',
  },
  {
    id: 'delivery',
    label: 'Deliveries',
    summary: 'Outfits, heels, props, and supplies sent to venue',
    remarkHint: 'What to deliver and delivery address',
    defaultRate: 35,
    unit: 'per delivery',
  },
  {
    id: 'wardrobe',
    label: 'Wardrobe & styling',
    summary: 'Gown rental, dress code sourcing, and styling coordination',
    remarkHint: 'Outfit or item needed, size, and occasion',
    defaultRate: 95,
    unit: 'per booking',
  },
  {
    id: 'makeup',
    label: 'Makeup & grooming',
    summary: 'Professional makeup before VIP or launch events',
    remarkHint: 'Event, start time, and look required',
    defaultRate: 120,
    unit: 'per session',
  },
  {
    id: 'vip_escort',
    label: 'VIP escort',
    summary: 'Premium table hosting and high-value guest coverage',
    remarkHint: 'Guest or table, venue, and coverage hours',
    defaultRate: 180,
    unit: 'per shift',
  },
  {
    id: 'uniform',
    label: 'Uniform & documents',
    summary: 'Uniform handling, badge printing, and compliance docs',
    remarkHint: 'Uniform or document type and quantity',
    defaultRate: 25,
    unit: 'per item',
  },
  {
    id: 'emergency_cover',
    label: 'Emergency cover',
    summary: 'Last-minute replacement PR sourcing and dispatch',
    remarkHint: 'Outlet, shift time, and PRs needed',
    defaultRate: 150,
    unit: 'per call-out',
  },
  {
    id: 'training',
    label: 'Training top-up',
    summary: 'Tier upgrades, coaching sessions, and certification fees',
    remarkHint: 'PR name and training topic or tier goal',
    defaultRate: 80,
    unit: 'per session',
  },
  {
    id: 'others',
    label: 'Others',
    summary: 'Name your own service — describe what you need below',
    remarkHint: 'Details for your custom service',
    defaultRate: 50,
    unit: 'per booking',
  },
  {
    id: 'leave_agency',
    label: 'Leave agency',
    summary: 'Before 1 year you must raise a support ticket for early leave',
    remarkHint: 'Reason and intended last working date',
    defaultRate: 0,
    unit: 'support ticket',
  },
];

export const LEAVE_AGENCY_SERVICE_ID = 'leave_agency';
export const OTHERS_SERVICE_ID = 'others';

export function isLeaveAgencyService(serviceType: string): boolean {
  return serviceType === LEAVE_AGENCY_SERVICE_ID;
}

export function isOthersService(serviceType: string): boolean {
  return serviceType === OTHERS_SERVICE_ID;
}

/** Service types available when raising a new order (role-specific). */
export function bookableServiceOffers(
  initiator: SpecialServiceInitiator,
  opts?: { prTiedLocked?: boolean },
): AgencySpecialServiceOffer[] {
  if (initiator === 'pr') {
    return AGENCY_SPECIAL_SERVICE_OFFERS.filter(
      (o) => !isLeaveAgencyService(o.id) || opts?.prTiedLocked,
    );
  }
  return AGENCY_SPECIAL_SERVICE_OFFERS.filter(
    (o) => !isLeaveAgencyService(o.id),
  );
}

export const SPECIAL_SERVICE_TYPE_LABELS = Object.fromEntries(
  AGENCY_SPECIAL_SERVICE_OFFERS.map((s) => [s.id, s.label]),
) as Record<string, string>;

export type SpecialServiceRecord = {
  id: string;
  prId: string;
  prName: string;
  outlet: string;
  date: string;
  dateIso: string;
  time: string;
  serviceType: string;
  /** Custom label when serviceType is "others" */
  customServiceName?: string;
  description: string;
  amountIn: number;
  amountOut: number;
  initiatedBy: SpecialServiceInitiator;
  raisedBy: string;
  /** InnocenZ admin review for agency- and outlet-posted jobs */
  adminAccepted: PartyAcceptance;
  agencyAccepted: PartyAcceptance;
  prAcceptance: PartyAcceptance;
  outletAcceptance: PartyAcceptance;
  status: SpecialServiceStatus;
  approvedAt?: string;
  declineReason?: string;
  declinedBy?: 'agency' | 'pr' | 'outlet' | 'admin';
};

export function recomputeSpecialServiceStatus(
  record: SpecialServiceRecord,
): SpecialServiceStatus {
  // Agency and outlet job postings are gated by InnocenZ admin review.
  if (record.initiatedBy === 'agency' || record.initiatedBy === 'outlet') {
    if (record.adminAccepted === 'declined') return 'rejected';
    if (record.adminAccepted === 'pending') return 'pending_admin';
    if (record.adminAccepted === 'accepted') return 'accepted';
    return 'pending_admin';
  }

  if (record.status === 'paid') return 'paid';

  if (
    record.agencyAccepted === 'declined' ||
    record.prAcceptance === 'declined' ||
    record.outletAcceptance === 'declined'
  ) {
    return 'declined';
  }

  if (record.agencyAccepted === 'pending') {
    return 'pending_agency';
  }

  const needsPr = record.prAcceptance !== 'n/a';
  const needsOutlet = record.outletAcceptance !== 'n/a';
  const prOk = !needsPr || record.prAcceptance === 'accepted';
  const outletOk = !needsOutlet || record.outletAcceptance === 'accepted';

  if (prOk && outletOk) return 'confirmed';

  const prPending = needsPr && record.prAcceptance === 'pending';
  const outletPending = needsOutlet && record.outletAcceptance === 'pending';

  if (prPending && outletPending) return 'pending_both';
  if (prPending) return 'pending_pr';
  if (outletPending) return 'pending_outlet';

  return 'confirmed';
}

export type SpecialServiceFilterState = {
  date: string;
  time: string;
  serviceType: string;
  status: 'all' | SpecialServiceStatus;
  amountInMin: string;
  amountOutMin: string;
};

export const EMPTY_SPECIAL_SERVICE_FILTERS: SpecialServiceFilterState = {
  date: '',
  time: '',
  serviceType: '',
  status: 'all',
  amountInMin: '',
  amountOutMin: '',
};

const DEMO_TODAY_LABEL = fmtDateLabelFromIso(DEFAULT_ROSTER_DATE_ISO);

export const SEED_SPECIAL_SERVICES: SpecialServiceRecord[] = [
  {
    id: 'SS-2026-014',
    prId: 'p1',
    prName: 'Vicky',
    outlet: 'Velvet 23',
    date: DEMO_TODAY_LABEL,
    dateIso: DEFAULT_ROSTER_DATE_ISO,
    time: '22:00',
    serviceType: 'vip_escort',
    description: 'Table 7, Velvet 23 — 3h Hennessy launch coverage',
    amountIn: 250,
    amountOut: 180,
    initiatedBy: 'agency',
    raisedBy: 'Agency Owner',
    adminAccepted: 'accepted',
    agencyAccepted: 'accepted',
    prAcceptance: 'n/a',
    outletAcceptance: 'n/a',
    status: 'accepted',
    approvedAt: '18 Jun 2026 · 14:20',
  },
  {
    id: 'SS-2026-015',
    prId: 'pr-comcard-alice',
    prName: 'Alice',
    outlet: 'Onyx KL',
    date: DEMO_TODAY_LABEL,
    dateIso: DEFAULT_ROSTER_DATE_ISO,
    time: '04:15',
    serviceType: 'transportation',
    description: 'Onyx KL → Bangsar South (late shift return)',
    amountIn: 0,
    amountOut: 45,
    initiatedBy: 'pr',
    raisedBy: 'Alice (PR)',
    adminAccepted: 'n/a',
    agencyAccepted: 'pending',
    prAcceptance: 'accepted',
    outletAcceptance: 'n/a',
    status: 'pending_agency',
  },
  {
    id: 'SS-2026-016',
    prId: 'pr-comcard-angie',
    prName: 'Angie',
    outlet: 'Velvet 23',
    date: DEMO_TODAY_LABEL,
    dateIso: DEFAULT_ROSTER_DATE_ISO,
    time: '19:30',
    serviceType: 'delivery',
    description: 'Red heels size 38 + clutch — Velvet 23, Ladies Night',
    amountIn: 50,
    amountOut: 0,
    initiatedBy: 'outlet',
    raisedBy: 'Velvet 23',
    adminAccepted: 'pending',
    agencyAccepted: 'accepted',
    prAcceptance: 'n/a',
    outletAcceptance: 'accepted',
    status: 'pending_admin',
  },
  {
    id: 'SS-2026-017',
    prId: 'p1',
    prName: 'Vicky',
    outlet: 'Velvet 23',
    date: DEMO_TODAY_LABEL,
    dateIso: DEFAULT_ROSTER_DATE_ISO,
    time: '20:00',
    serviceType: 'makeup',
    description: 'VIP table night, 20:00 — soft glam full face',
    amountIn: 80,
    amountOut: 0,
    initiatedBy: 'agency',
    raisedBy: 'Agency Owner',
    adminAccepted: 'pending',
    agencyAccepted: 'accepted',
    prAcceptance: 'n/a',
    outletAcceptance: 'n/a',
    status: 'pending_admin',
  },
  {
    id: 'SS-2026-011',
    prId: 'pr-comcard-moon',
    prName: 'Moon',
    outlet: 'Mermate',
    date: 'Wed 03 Jun 2026',
    dateIso: '2026-06-03',
    time: '18:00',
    serviceType: 'makeup',
    description: 'Weekend VIP slot, 18:00 — natural evening look',
    amountIn: 100,
    amountOut: 100,
    initiatedBy: 'agency',
    raisedBy: 'Agency Owner',
    adminAccepted: 'accepted',
    agencyAccepted: 'accepted',
    prAcceptance: 'n/a',
    outletAcceptance: 'n/a',
    status: 'accepted',
    approvedAt: '3 Jun 2026 · 18:05',
  },
  {
    id: 'SS-2026-009',
    prId: 'pr-comcard-charlotte',
    prName: 'Charlotte',
    outlet: 'Bear Lounge',
    date: 'Tue 02 Jun 2026',
    dateIso: '2026-06-02',
    time: '17:45',
    serviceType: 'wardrobe',
    description: 'Black gown size S — Bear Lounge launch night',
    amountIn: 120,
    amountOut: 95,
    initiatedBy: 'outlet',
    raisedBy: 'Bear Lounge',
    adminAccepted: 'n/a',
    agencyAccepted: 'accepted',
    prAcceptance: 'accepted',
    outletAcceptance: 'n/a',
    status: 'paid',
    approvedAt: '2 Jun 2026 · 11:40',
  },
  {
    id: 'SS-2026-008',
    prId: 'pr-comcard-victoria',
    prName: 'Victoria',
    outlet: 'Urban Soul',
    date: 'Mon 02 Jun 2026',
    dateIso: '2026-06-02',
    time: '20:30',
    serviceType: 'emergency_cover',
    description: 'Urban Soul, 20:30 shift — 1 replacement PR',
    amountIn: 200,
    amountOut: 150,
    initiatedBy: 'outlet',
    raisedBy: 'Urban Soul',
    adminAccepted: 'n/a',
    agencyAccepted: 'accepted',
    prAcceptance: 'accepted',
    outletAcceptance: 'n/a',
    status: 'paid',
    approvedAt: '2 Jun 2026 · 19:10',
  },
];

export function specialServiceOffer(
  id: string,
): AgencySpecialServiceOffer | undefined {
  return AGENCY_SPECIAL_SERVICE_OFFERS.find((s) => s.id === id);
}

export function specialServiceRemarkHint(serviceType: string): string {
  return specialServiceOffer(serviceType)?.remarkHint ?? 'Add job details…';
}

/** Admin-arranged service cost — never above the agency budget (amountIn). */
export function adminServiceCostForOrder(
  record: Pick<SpecialServiceRecord, 'amountIn' | 'serviceType'>,
): number {
  const defaultRate = specialServiceOffer(record.serviceType)?.defaultRate ?? 0;
  if (record.amountIn <= 0) return 0;
  return Math.min(defaultRate, record.amountIn);
}

/** Canonical PR name on service orders — agency roster match + Luna → Vicky migration. */
export function resolveSpecialServicePrName(
  row: Pick<SpecialServiceRecord, 'prId' | 'prName'>,
  agencyPRs?: { id: string; name: string }[],
): string {
  return resolveRosterPrName(row.prId, row.prName, agencyPRs);
}

/** Keep demo seed names after localStorage hydrate (e.g. Luna → Vicky on p1). */
function normalizeAgencyJobDemoRow(
  row: SpecialServiceRecord,
  seedRow?: SpecialServiceRecord,
): SpecialServiceRecord {
  if (row.initiatedBy !== 'agency' && row.initiatedBy !== 'outlet') return row;

  let base =
    row.initiatedBy === 'agency' && seedRow
      ? {
          ...row,
          prName: seedRow.prName,
          description: seedRow.description,
          amountIn: seedRow.amountIn,
        }
      : row;

  // Legacy outlet posts went to agency first — migrate to admin review.
  if (
    base.initiatedBy === 'outlet' &&
    base.adminAccepted === 'n/a' &&
    base.agencyAccepted === 'pending'
  ) {
    base = {
      ...base,
      adminAccepted: 'pending',
      agencyAccepted: 'accepted',
      amountOut: 0,
    };
  }

  if (base.adminAccepted === 'pending') {
    return { ...base, amountOut: 0 };
  }
  if (base.adminAccepted === 'accepted' && base.amountIn > 0) {
    return { ...base, amountOut: adminServiceCostForOrder(base) };
  }
  return base;
}

export function mergeSpecialServiceOrders(
  persisted: SpecialServiceRecord[] | undefined,
  seed: SpecialServiceRecord[] = SEED_SPECIAL_SERVICES,
  agencyPRs?: { id: string; name: string }[],
): SpecialServiceRecord[] {
  if (!persisted?.length) return seed.map((r) => ({ ...r }));
  const hasNewModel = persisted.some(
    (r) => 'initiatedBy' in r && 'agencyAccepted' in r,
  );
  if (!hasNewModel) return seed.map((r) => ({ ...r }));

  const seedById = Object.fromEntries(seed.map((s) => [s.id, s]));
  const persistedIds = new Set(persisted.map((r) => r.id));

  const merged = persisted.map((row) => {
    const seedRow = seedById[row.id];
    const base = seedRow ? { ...seedRow, ...row } : row;
    const withPr = {
      ...base,
      prName: resolveSpecialServicePrName(base, agencyPRs),
    };
    const normalized = normalizeAgencyJobDemoRow(withPr, seedRow);
    if ('adminAccepted' in normalized) {
      return {
        ...normalized,
        status: recomputeSpecialServiceStatus(normalized),
      };
    }
    const migrated: SpecialServiceRecord = {
      ...normalized,
      adminAccepted:
        normalized.initiatedBy === 'agency' ||
        normalized.initiatedBy === 'outlet'
          ? normalized.status === 'declined' || normalized.status === 'rejected'
            ? 'declined'
            : normalized.status === 'pending_admin' ||
                normalized.status === 'pending_agency'
              ? 'pending'
              : 'accepted'
          : 'n/a',
    };
    return { ...migrated, status: recomputeSpecialServiceStatus(migrated) };
  });

  const missingSeed = seed
    .filter((s) => !persistedIds.has(s.id))
    .map((r) => normalizeAgencyJobDemoRow({ ...r }, r));
  return [...merged, ...missingSeed];
}

function hhmmToMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [h, m] = trimmed.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function specialServiceFiltersActive(
  f: SpecialServiceFilterState,
): boolean {
  return Boolean(
    f.date ||
    f.time ||
    f.serviceType ||
    f.status !== 'all' ||
    f.amountInMin ||
    f.amountOutMin,
  );
}

export function filterSpecialServiceRecords(
  records: SpecialServiceRecord[],
  f: SpecialServiceFilterState,
): SpecialServiceRecord[] {
  const inMin = f.amountInMin ? Number(f.amountInMin) : null;
  const outMin = f.amountOutMin ? Number(f.amountOutMin) : null;
  const timeFrom = hhmmToMinutes(f.time);

  return records.filter((row) => {
    if (f.status !== 'all' && row.status !== f.status) return false;
    if (f.date && row.dateIso !== f.date) return false;
    if (f.serviceType && row.serviceType !== f.serviceType) return false;
    if (timeFrom != null) {
      const rowMins = hhmmToMinutes(row.time);
      if (rowMins == null || rowMins < timeFrom) return false;
    }
    if (inMin != null && !Number.isNaN(inMin) && row.amountIn < inMin)
      return false;
    if (outMin != null && !Number.isNaN(outMin) && row.amountOut < outMin)
      return false;
    return true;
  });
}

export function collectSpecialServiceDateIsos(
  records: SpecialServiceRecord[],
): string[] {
  return [...new Set(records.map((r) => r.dateIso))].sort();
}

const SPECIAL_SERVICE_AMOUNT_PRESETS = [
  0, 25, 35, 45, 50, 80, 95, 120, 150, 180, 200, 250,
] as const;

function collectAmountMinOptions(
  records: SpecialServiceRecord[],
  field: 'amountIn' | 'amountOut',
): number[] {
  const fromOffers = AGENCY_SPECIAL_SERVICE_OFFERS.map((o) => o.defaultRate);
  const fromRecords = records.map((r) => r[field]);
  return [
    ...new Set([
      ...SPECIAL_SERVICE_AMOUNT_PRESETS,
      ...fromOffers,
      ...fromRecords,
    ]),
  ].sort((a, b) => a - b);
}

export function collectSpecialServiceAmountInOptions(
  records: SpecialServiceRecord[],
): number[] {
  return collectAmountMinOptions(records, 'amountIn');
}

export function collectSpecialServiceAmountOutOptions(
  records: SpecialServiceRecord[],
): number[] {
  return collectAmountMinOptions(records, 'amountOut');
}

export function specialServiceStatusLabel(
  status: SpecialServiceStatus,
): string {
  switch (status) {
    case 'pending_admin':
      return 'Pending Admin Review';
    case 'accepted':
      return 'Accepted';
    case 'rejected':
      return 'Rejected';
    case 'pending_agency':
      return 'Pending agency';
    case 'pending_pr':
      return 'Awaiting PR';
    case 'pending_outlet':
      return 'Awaiting outlet';
    case 'pending_both':
      return 'Awaiting PR & outlet';
    case 'confirmed':
      return 'Confirmed';
    case 'declined':
      return 'Declined';
    case 'paid':
      return 'Paid';
  }
}

export function agencyJobPostingInzLabel(record: SpecialServiceRecord): string {
  if (record.adminAccepted === 'declined') return 'Rejected';
  if (record.adminAccepted === 'pending') return 'Pending review';
  if (record.adminAccepted === 'accepted') return 'Accepted';
  return specialServiceStatusLabel(record.status);
}

export type AgencyJobPostingStatusTone =
  'accepted' | 'pending' | 'rejected' | 'neutral';

export function agencyJobPostingStatusTone(
  record: SpecialServiceRecord,
): AgencyJobPostingStatusTone {
  if (record.adminAccepted === 'declined') return 'rejected';
  if (record.adminAccepted === 'pending') return 'pending';
  if (record.adminAccepted === 'accepted') return 'accepted';
  if (
    record.status === 'pending_admin' ||
    record.status === 'pending_agency' ||
    record.status === 'pending_pr' ||
    record.status === 'pending_outlet' ||
    record.status === 'pending_both'
  ) {
    return 'pending';
  }
  if (
    record.status === 'accepted' ||
    record.status === 'confirmed' ||
    record.status === 'paid'
  ) {
    return 'accepted';
  }
  if (record.status === 'rejected' || record.status === 'declined')
    return 'rejected';
  return 'neutral';
}

export function agencyJobPostingInzVariant(
  record: SpecialServiceRecord,
): 'ink' | 'amber' | 'green' | 'violet' {
  if (record.adminAccepted === 'declined') return 'ink';
  if (record.adminAccepted === 'pending') return 'amber';
  if (record.adminAccepted === 'accepted') return 'violet';
  return specialServiceStatusVariant(record.status);
}

export function specialServiceStatusVariant(
  status: SpecialServiceStatus,
): 'ink' | 'amber' | 'green' | 'violet' {
  switch (status) {
    case 'pending_admin':
    case 'pending_agency':
    case 'pending_pr':
    case 'pending_outlet':
    case 'pending_both':
      return 'amber';
    case 'accepted':
    case 'confirmed':
      return 'violet';
    case 'rejected':
    case 'declined':
      return 'ink';
    case 'paid':
      return 'green';
  }
}

export function specialServiceInitiatorLabel(
  initiatedBy: SpecialServiceInitiator,
): string {
  switch (initiatedBy) {
    case 'agency':
      return 'Agency';
    case 'outlet':
      return 'Outlet';
    case 'pr':
      return 'PR';
  }
}

export function specialServiceTypeLabel(
  type: string,
  customServiceName?: string,
): string {
  if (isOthersService(type)) {
    const name = customServiceName?.trim();
    return name ? `Others - ${name}` : 'Others';
  }
  return (
    SPECIAL_SERVICE_TYPE_LABELS[type] ??
    specialServiceOffer(type)?.label ??
    type
  );
}

export function specialServiceRecordTypeLabel(
  record: Pick<SpecialServiceRecord, 'serviceType' | 'customServiceName'>,
): string {
  return specialServiceTypeLabel(record.serviceType, record.customServiceName);
}
