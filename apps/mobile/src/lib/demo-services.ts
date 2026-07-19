/**
 * PR special-service / job-posting demo data — mirrors InnocenZ-proto
 * `special-service-demo.ts` (Vicky p1 seeds + agency offers).
 */

export type ServiceOffer = {
  id: string;
  label: string;
  summary: string;
  defaultRate: number;
  unit: string;
};

export const SERVICE_OFFERS: ServiceOffer[] = [
  {
    id: 'transportation',
    label: 'Transportation',
    summary: 'Shift pickup, late-night return, and outlet transfers',
    defaultRate: 45,
    unit: 'per trip',
  },
  {
    id: 'delivery',
    label: 'Deliveries',
    summary: 'Outfits, heels, props, and supplies sent to venue',
    defaultRate: 35,
    unit: 'per delivery',
  },
  {
    id: 'wardrobe',
    label: 'Wardrobe & styling',
    summary: 'Gown rental, dress code sourcing, and styling coordination',
    defaultRate: 95,
    unit: 'per booking',
  },
  {
    id: 'makeup',
    label: 'Makeup & grooming',
    summary: 'Professional makeup before VIP or launch events',
    defaultRate: 120,
    unit: 'per session',
  },
  {
    id: 'vip_escort',
    label: 'VIP escort',
    summary: 'Premium table hosting and high-value guest coverage',
    defaultRate: 180,
    unit: 'per shift',
  },
  {
    id: 'uniform',
    label: 'Uniform & documents',
    summary: 'Uniform handling, badge printing, and compliance docs',
    defaultRate: 25,
    unit: 'per item',
  },
  {
    id: 'emergency_cover',
    label: 'Emergency cover',
    summary: 'Last-minute replacement PR sourcing and dispatch',
    defaultRate: 150,
    unit: 'per call-out',
  },
  {
    id: 'training',
    label: 'Training top-up',
    summary: 'Tier upgrades, coaching sessions, and certification fees',
    defaultRate: 80,
    unit: 'per session',
  },
  {
    id: 'others',
    label: 'Others',
    summary: 'Name your own service — describe what you need below',
    defaultRate: 50,
    unit: 'per booking',
  },
  {
    id: 'leave_agency',
    label: 'Leave agency',
    summary: 'Before 1 year you must raise a support ticket for early leave',
    defaultRate: 0,
    unit: 'support ticket',
  },
];

export type ServiceStatus =
  | 'pending_admin'
  | 'accepted'
  | 'rejected'
  | 'pending_agency'
  | 'pending_pr'
  | 'confirmed'
  | 'declined'
  | 'paid';

export const STATUS_FILTER_OPTIONS: { id: string; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending_admin', label: 'Pending review' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'pending_agency', label: 'Pending agency' },
  { id: 'pending_pr', label: 'Awaiting PR' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'declined', label: 'Declined' },
  { id: 'paid', label: 'Paid' },
];

export type ServiceOrder = {
  id: string;
  prName: string;
  outlet: string;
  date: string;
  time: string;
  serviceType: string;
  description: string;
  amountIn: number;
  amountOut: number;
  initiatedBy: 'agency' | 'outlet' | 'pr';
  raisedBy: string;
  status: ServiceStatus;
  statusLabel: string;
};

function todayLabel() {
  const d = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/** Vicky (p1) seeds — SS-2026-014 + SS-2026-017 */
export function seedVickyServiceOrders(): ServiceOrder[] {
  const date = todayLabel();
  return [
    {
      id: 'SS-2026-014',
      prName: 'Vicky',
      outlet: 'Velvet 23',
      date,
      time: '22:00',
      serviceType: 'vip_escort',
      description: 'Table 7, Velvet 23 — 3h Hennessy launch coverage',
      amountIn: 250,
      amountOut: 180,
      initiatedBy: 'agency',
      raisedBy: 'Agency Owner',
      status: 'accepted',
      statusLabel: 'Accepted',
    },
    {
      id: 'SS-2026-017',
      prName: 'Vicky',
      outlet: 'Velvet 23',
      date,
      time: '20:00',
      serviceType: 'makeup',
      description: 'VIP table night, 20:00 — soft glam full face',
      amountIn: 80,
      amountOut: 0,
      initiatedBy: 'agency',
      raisedBy: 'Agency Owner',
      status: 'pending_admin',
      statusLabel: 'Pending review',
    },
  ];
}

export function offerLabel(id: string) {
  return SERVICE_OFFERS.find((o) => o.id === id)?.label ?? id;
}

export const PR_LANGUAGE_OPTIONS = [
  'English',
  'Mandarin',
  'Cantonese',
  'Malay',
  'Japanese',
  'Korean',
  'Thai',
  'Hindi',
  'Tagalog',
  'Vietnamese',
  'Tamil',
  'Hokkien',
] as const;

export const PR_AGENCY_OPTIONS = [
  { id: 'atlas', name: 'Atlas Agency' },
  { id: 'delta', name: 'Delta Agency' },
  { id: 'nova', name: 'Nova Hosting' },
] as const;
