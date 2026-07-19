/**
 * Payment history demo — mirrors InnocenZ-proto paid/signed PVs for History tab.
 * Figures match deployed proto screenshot: 5 weeks · 21 shifts · RM 10,597.30.
 */

export type HistPayStatus = 'paid' | 'signed';

export type HistPayLine = {
  date: string;
  day: string;
  type: string;
  outlet: string;
  amount: number;
  /** Early withdrawal / deduction lines render red with − */
  debit?: boolean;
};

export type HistPayWeek = {
  id: string;
  ref: string;
  weekLabel: string;
  outlet: string;
  shifts: number;
  issued: string;
  status: HistPayStatus;
  statusMeta: string;
  net: number;
  wages: number;
  commission: number;
  earlyWithdrawal?: number;
  otherDeduction?: number;
  bankRef?: string;
  lines: HistPayLine[];
};

export const PAYMENT_HISTORY_WEEKS: HistPayWeek[] = [
  {
    id: 'pv-2026-0604-l',
    ref: 'PV-2026-0604-L',
    weekLabel: '05 Jul – 11 Jul 2026',
    outlet: 'Multi-outlet (4)',
    shifts: 6,
    issued: '12 Jul 2026',
    status: 'signed',
    statusMeta: 'Signed 14 Jul 2026 · 11:05 · Awaiting bank transfer',
    net: 2906,
    wages: 1860,
    commission: 1046,
    lines: [
      { date: '05 Jul', day: 'Sun', type: 'Daily wages', outlet: 'Velvet 23', amount: 310 },
      { date: '05 Jul', day: 'Sun', type: 'Drinks commission', outlet: 'Velvet 23', amount: 180 },
      { date: '06 Jul', day: 'Mon', type: 'Daily wages', outlet: 'Mermate', amount: 310 },
      { date: '07 Jul', day: 'Tue', type: 'Daily wages', outlet: 'Bear Lounge', amount: 310 },
      { date: '08 Jul', day: 'Wed', type: 'Daily wages', outlet: 'Urban Soul', amount: 310 },
      { date: '10 Jul', day: 'Fri', type: 'Daily wages', outlet: 'Velvet 23', amount: 310 },
      { date: '10 Jul', day: 'Fri', type: 'Tips commission', outlet: 'Velvet 23', amount: 220 },
      { date: '11 Jul', day: 'Sat', type: 'Daily wages', outlet: 'Velvet 23', amount: 310 },
      { date: '11 Jul', day: 'Sat', type: 'Drinks commission', outlet: 'Velvet 23', amount: 646 },
    ],
  },
  {
    id: 'pv-2026-w19-l',
    ref: 'PV-2026-W19-L',
    weekLabel: '28 Jun – 04 Jul 2026',
    outlet: 'Velvet 23',
    shifts: 4,
    issued: '05 Jul 2026',
    status: 'paid',
    statusMeta: 'Paid 8 Jul 2026 · 10:18',
    net: 1520,
    wages: 1200,
    commission: 320,
    bankRef: 'INZ-TRF-20260708001',
    lines: [
      { date: '28 Jun', day: 'Sun', type: 'Daily wages', outlet: 'Velvet 23', amount: 300 },
      { date: '29 Jun', day: 'Mon', type: 'Daily wages', outlet: 'Velvet 23', amount: 300 },
      { date: '01 Jul', day: 'Wed', type: 'Daily wages', outlet: 'Velvet 23', amount: 300 },
      { date: '03 Jul', day: 'Fri', type: 'Daily wages', outlet: 'Velvet 23', amount: 300 },
      { date: '03 Jul', day: 'Fri', type: 'Drinks commission', outlet: 'Velvet 23', amount: 320 },
    ],
  },
  {
    id: 'pv-2026-w18-l',
    ref: 'PV-2026-W18-L',
    weekLabel: '21 Jun – 27 Jun 2026',
    outlet: 'Velvet 23',
    shifts: 3,
    issued: '28 Jun 2026',
    status: 'paid',
    statusMeta: 'Paid 1 Jul 2026 · 11:42',
    net: 1148,
    wages: 900,
    commission: 248,
    bankRef: 'INZ-TRF-20260701001',
    lines: [
      { date: '21 Jun', day: 'Sun', type: 'Daily wages', outlet: 'Velvet 23', amount: 300 },
      { date: '21 Jun', day: 'Sun', type: 'Drinks commission', outlet: 'Velvet 23', amount: 95 },
      { date: '22 Jun', day: 'Mon', type: 'Daily wages', outlet: 'Velvet 23', amount: 300 },
      { date: '22 Jun', day: 'Mon', type: 'Tips commission', outlet: 'Velvet 23', amount: 88 },
      { date: '23 Jun', day: 'Tue', type: 'Daily wages', outlet: 'Velvet 23', amount: 300 },
      { date: '23 Jun', day: 'Tue', type: 'Tables commission', outlet: 'Velvet 23', amount: 65 },
    ],
  },
  {
    id: 'pv-2026-w20-l',
    ref: 'PV-2026-W20-L',
    weekLabel: '14 Jun – 20 Jun 2026',
    outlet: 'Multi-outlet (2)',
    shifts: 3,
    issued: '21 Jun 2026',
    status: 'paid',
    statusMeta: 'Paid 24 Jun 2026 · 11:42',
    net: 1050,
    wages: 890,
    commission: 310,
    earlyWithdrawal: 150,
    bankRef: 'INZ-TRF-202605191142',
    lines: [
      { date: '14 Jun', day: 'Sun', type: 'Daily wages', outlet: 'Mermate', amount: 300 },
      { date: '15 Jun', day: 'Mon', type: 'Daily wages', outlet: 'Velvet 23', amount: 290 },
      { date: '18 Jun', day: 'Thu', type: 'Daily wages', outlet: 'Velvet 23', amount: 300 },
      { date: '18 Jun', day: 'Thu', type: 'Drinks commission', outlet: 'Velvet 23', amount: 310 },
      {
        date: '20 Jun',
        day: 'Sat',
        type: 'Early withdrawal',
        outlet: '—',
        amount: 150,
        debit: true,
      },
    ],
  },
  {
    id: 'pv-2026-w0503-l',
    ref: 'PV-2026-W0503-L',
    weekLabel: '03 May – 09 May 2026',
    outlet: 'Multi-outlet (2)',
    shifts: 5,
    issued: '10 May 2026',
    status: 'paid',
    statusMeta: 'Paid 12 May 2026 · 11:42',
    net: 3973.3,
    wages: 2322.3,
    commission: 1651,
    bankRef: 'INZ-TRF-20260503',
    lines: [
      { date: '04 May', day: 'Sun', type: 'Daily wages', outlet: 'Mermate', amount: 460 },
      { date: '05 May', day: 'Mon', type: 'Daily wages', outlet: 'Mermate', amount: 460 },
      { date: '06 May', day: 'Tue', type: 'Daily wages', outlet: 'Bear Lounge', amount: 470 },
      { date: '07 May', day: 'Wed', type: 'Daily wages', outlet: 'Velvet 23', amount: 466.15 },
      { date: '08 May', day: 'Thu', type: 'Daily wages', outlet: 'Velvet 23', amount: 466.15 },
      { date: '08 May', day: 'Thu', type: 'Drinks commission', outlet: 'Velvet 23', amount: 1651 },
    ],
  },
];

/** Unique outlets for filter dropdown */
export function paymentHistoryOutlets(weeks = PAYMENT_HISTORY_WEEKS): string[] {
  const set = new Set<string>();
  for (const w of weeks) {
    if (w.outlet && !w.outlet.startsWith('Multi')) set.add(w.outlet);
    for (const line of w.lines) {
      if (line.outlet && line.outlet !== '—') set.add(line.outlet);
    }
  }
  return Array.from(set).sort();
}
