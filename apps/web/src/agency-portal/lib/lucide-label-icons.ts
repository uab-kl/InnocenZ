/**
 * Single source of truth for Lucide icons paired with UI labels.
 * Same label → same icon everywhere (all roles, all pages).
 * Icons: https://lucide.dev/icons/
 */
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  Calendar,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardList,
  Clock,
  Coins,
  CreditCard,
  Crown,
  Filter,
  HandCoins,
  History,
  Home,
  IdCard,
  KeyRound,
  Landmark,
  Lock,
  LogIn,
  LogOut,
  Mail,
  MapPin,
  Megaphone,
  MessageSquare,
  Phone,
  Plug,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Store,
  Trash2,
  TrendingUp,
  User,
  UserCheck,
  Users,
  UserX,
  Wallet,
  Wine,
  Zap,
} from 'lucide-react';

/** Normalize a label for lookup (lowercase, collapsed spaces). */
export function normalizeLabelKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Exact label → icon (canonical spellings used in nav, sections, metrics). */
const EXACT_LABEL_ICONS: Record<string, LucideIcon> = {
  // Nav — shared across roles
  home: Home,
  today: Home,
  roster: Calendar,
  approvals: UserCheck,
  payroll: Receipt,
  'job posting': Sparkles,
  'post job': Sparkles,
  history: History,
  'calendar page': Calendar,
  reports: BarChart3,
  shifts: Briefcase,
  'check-in': MapPin,
  'check in': MapPin,
  payment: Wallet,
  profile: User,
  'manage pr': Users,
  'manage outlet': Store,
  subscription: CreditCard,
  subscriptions: CreditCard,
  settings: Settings,
  workspace: SlidersHorizontal,
  'sign out': LogOut,
  notifications: Bell,
  'icon guide': CircleHelp,
  admin: Shield,

  // Portals & roles
  outlet: Store,
  'pr agency': Users,
  agency: Users,
  pr: Star,

  // Sub-roles
  owner: Crown,
  finance: Landmark,
  'operations head': ClipboardList,
  'agency owner': Crown,
  'agency finance': Landmark,
  'outlet owner': Crown,
  'outlet finance': Landmark,
  'outlet ops head': ClipboardList,

  // Shift metrics
  earned: Coins,
  'total earned': Coins,
  received: HandCoins,
  'total received': HandCoins,
  payout: Coins,
  'total payout': Coins,
  drinks: Wine,
  'total drinks': Wine,
  tips: Banknote,
  'total tips': Banknote,

  // Sections & actions
  'transaction log': ClipboardList,
  'shift log': ClipboardList,
  'filter by': Filter,
  filter: Filter,
  search: Search,
  welcome: Sparkles,
  'sign in': LogIn,
  'verify otp': ShieldCheck,

  // KPI & payroll labels
  wages: Receipt,
  others: Plus,
  commission: TrendingUp,
  'earned in range': Coins,
  'total pr': Users,
  'total outlets': Store,
  'pending payout': Wallet,
  'planned prs': Users,
  'active prs': UserCheck,
  'unavailable prs': UserX,
  'est payout': Coins,
  'shifts this week': Briefcase,
  'est. labour cost': Receipt,
  rating: Star,
  // The plural is the outlet nav label and page title; without it both fall
  // through every pattern rule to the CircleHelp fallback and render a "?".
  ratings: Star,
  attendance: UserCheck,
  kpi: TrendingUp,
  paid: CheckCircle2,
  weeks: CalendarDays,
  'early withdrawal': Wallet,
  other: Plus,
  'live gps': MapPin,
  'receipt scans': Camera,
  'receipt details': Receipt,
  'sign payment voucher': Receipt,
  'by pr': Users,
  'by outlet': Store,
  'paid pvs': Receipt,

  // Live sales — PR tonight floor earnings
  'daily wages': Receipt,
  hh: Zap,
  normal: Wine,
  ot: Clock,
  'total earn': Coins,
  'live sales': TrendingUp,
  'pr name': User,
  'pr id': IdCard,
  'tonight total': Coins,
  rate: Star,
  'to-do': ClipboardList,
  upcoming: CalendarDays,
  'outlet name': Store,
  date: Calendar,
  time: Clock,
  'total sales report': BarChart3,
};
const LABEL_ICON_RULES: { pattern: RegExp; icon: LucideIcon }[] = [
  { pattern: /shift history|history log/i, icon: History },
  { pattern: /transaction log|activity log|shift log/i, icon: ClipboardList },
  { pattern: /payment history|payroll history/i, icon: Wallet },
  {
    pattern: /pv line|payment voucher|sign payment|payroll|pv\b/i,
    icon: Receipt,
  },
  { pattern: /recommended pr/i, icon: Star },
  { pattern: /owner information|owner profile/i, icon: Crown },
  { pattern: /finance head|dual-sign/i, icon: Landmark },
  {
    pattern: /login.*security|sign.?in.*security|security settings/i,
    icon: Shield,
  },
  { pattern: /invite finance/i, icon: UserCheck },
  { pattern: /pos integration|integration/i, icon: Plug },
  { pattern: /pending review|pending verification|approvals?/i, icon: Clock },
  { pattern: /subscription|billing plan/i, icon: CreditCard },
  { pattern: /notification|alert/i, icon: Bell },
  { pattern: /broadcast|megaphone/i, icon: Megaphone },
  { pattern: /sos|incident/i, icon: AlertTriangle },
  { pattern: /verify otp|otp/i, icon: ShieldCheck },
  {
    pattern: /reset password|new password|set password|forgot password/i,
    icon: KeyRound,
  },
  { pattern: /sign in|sign-in|log in/i, icon: LogIn },
  { pattern: /welcome/i, icon: Sparkles },
  { pattern: /job posting|special service|post job/i, icon: Sparkles },
  { pattern: /roster|schedule|calendar page/i, icon: Calendar },
  { pattern: /shift|coverage|tonight/i, icon: Briefcase },
  { pattern: /check.?in|gps|location/i, icon: MapPin },
  { pattern: /payment|voucher|wallet/i, icon: Wallet },
  { pattern: /report|sales dashboard|analytics/i, icon: BarChart3 },
  { pattern: /trend|performance/i, icon: TrendingUp },
  { pattern: /filter/i, icon: Filter },
  { pattern: /search/i, icon: Search },
  { pattern: /workspace|operations/i, icon: SlidersHorizontal },
  { pattern: /settings|preferences/i, icon: Settings },
  { pattern: /profile|persona|account/i, icon: User },
  { pattern: /address|nationality|where you live/i, icon: MapPin },
  { pattern: /agency tie|agency|pr agency/i, icon: Building2 },
  { pattern: /outlet|store|venue/i, icon: Store },
  { pattern: /manage pr|manage outlet|staffing/i, icon: Users },
  { pattern: /availability/i, icon: CalendarDays },
  { pattern: /portfolio|gallery|photo|camera/i, icon: Camera },
  { pattern: /identity|id card|verify/i, icon: IdCard },
  { pattern: /summary|review/i, icon: ClipboardList },
  { pattern: /mobile|phone|whatsapp/i, icon: Phone },
  { pattern: /email|mail/i, icon: Mail },
  { pattern: /password|lock/i, icon: Lock },
  { pattern: /total earned|^earned$/i, icon: Coins },
  { pattern: /total drinks|^drinks$/i, icon: Wine },
  { pattern: /total tips|^tips$/i, icon: Banknote },
  { pattern: /drink|wine|bar/i, icon: Wine },
  { pattern: /delete|remove|cancel|decline/i, icon: Trash2 },
  { pattern: /reset|undo|restore/i, icon: RotateCcw },
  { pattern: /message|chat/i, icon: MessageSquare },
  { pattern: /home|today/i, icon: Home },
  { pattern: /history/i, icon: History },
  { pattern: /pr\b|host/i, icon: Star },
  { pattern: /owner/i, icon: Crown },
  { pattern: /finance/i, icon: Landmark },
  { pattern: /confirm|approved|complete/i, icon: CheckCircle2 },
  { pattern: /icon guide|what these/i, icon: CircleHelp },
];

/** Resolve a Lucide icon for any UI label or title. Returns null when no match. */
export function iconForLabel(text: string): LucideIcon | null {
  const normalized = text.trim();
  if (!normalized) return null;
  const key = normalizeLabelKey(normalized);
  if (EXACT_LABEL_ICONS[key]) return EXACT_LABEL_ICONS[key];
  for (const { pattern, icon } of LABEL_ICON_RULES) {
    if (pattern.test(normalized)) return icon;
  }
  return null;
}

/** Nav/sidebar — always returns an icon (CircleHelp fallback). */
export function iconForNav(label: string): LucideIcon {
  return iconForLabel(label) ?? CircleHelp;
}

/** @deprecated Use iconForLabel — kept for existing TitleWithIcon imports. */
export const iconForTitle = iconForLabel;

export const PORTAL_TITLE_ICONS = {
  pr: iconForNav('PR'),
  outlet: iconForNav('Outlet'),
  agency: iconForNav('PR Agency'),
} as const satisfies Record<string, LucideIcon>;

export const SUB_ROLE_TITLE_ICONS: Record<string, LucideIcon> = {
  Owner: iconForNav('Owner'),
  Finance: iconForNav('Finance'),
  'Operations Head': iconForNav('Operations Head'),
};

/** Shift history metrics — shared outlet/agency/PR views. */
export type ShiftMetricKind = 'received' | 'payout';

export const SHIFT_METRIC_DEFS: {
  id: ShiftMetricKind;
  label: string;
  Icon: LucideIcon;
  hint: string;
}[] = [
  {
    id: 'received',
    label: 'Received',
    Icon: iconForNav('Received'),
    hint: 'Full drink sales + tips the PR generated for the outlet (before commission %).',
  },
  {
    id: 'payout',
    label: 'Payout',
    Icon: iconForNav('Earned'),
    hint: 'What the PR takes home — wages, OT, and commissions from Workspace rates.',
  },
];

export { ChevronDown, CircleHelp, Plus, Zap };
