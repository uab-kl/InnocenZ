import { Link } from '@tanstack/react-router';
import { useStore } from '@agency-portal/lib/store';
import { deriveLiveWorkforce } from '@agency-portal/lib/portal-sync';
import {
  computeAvailabilityStats,
  DEFAULT_ROSTER_DATE_ISO,
} from '@agency-portal/lib/roster-availability';
import { ChevronRight, Layers } from 'lucide-react';

export function AiSuggestionsPanel() {
  const agencyRoster = useStore((s) => s.agencyRoster);
  const agencyPRs = useStore((s) => s.agencyPRs);
  const outletCommissionRules = useStore((s) => s.outletCommissionRules);
  const perDrinkRm = useStore((s) => s.outletWorkspace.perDrinkRm);
  const workforce = deriveLiveWorkforce(
    agencyRoster,
    DEFAULT_ROSTER_DATE_ISO,
    outletCommissionRules,
    perDrinkRm,
  );
  const avail = computeAvailabilityStats(
    agencyPRs,
    agencyRoster,
    DEFAULT_ROSTER_DATE_ISO,
  );

  const onyxCount = workforce.filter((w) => w.outlet.includes('Onyx')).length;
  const pearlCount = workforce.filter((w) => w.outlet.includes('Pearl')).length;
  const lowKpi = agencyPRs.find((p) => !p.detached && (p.kpiScore ?? 100) < 75);

  const suggestions: {
    title: string;
    desc: string;
    to: string;
    search?: Record<string, unknown>;
  }[] = [];

  if (avail.free > 0) {
    suggestions.push({
      title: `Assign ${avail.free} free PR${avail.free === 1 ? '' : 's'} to outlets`,
      desc: 'Planning → pick outlet · bulk or one-by-one',
      to: '/agency/roster',
      search: { view: 'planning' },
    });
  } else if (onyxCount < 2) {
    suggestions.push({
      title: `Reassign ${2 - onyxCount} PRs to Onyx KL`,
      desc: 'Demand spike — floor understaffed',
      to: '/agency/roster',
    });
  }
  if (pearlCount > 0) {
    suggestions.push({
      title: 'Boost incentive at Pearl Lounge',
      desc: 'Retention risk on late shift',
      to: '/agency/outlets',
      search: { outlet: 'Pearl Lounge' },
    });
  }
  if (lowKpi) {
    suggestions.push({
      title: `Flag ${lowKpi.name} for review`,
      desc: `KPI ${lowKpi.kpiScore} — attendance pattern`,
      to: '/agency/prs',
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      title: 'Roster looks balanced',
      desc: 'No urgent AI actions tonight',
      to: '/agency/roster',
    });
  }

  const primary = suggestions[0];

  return (
    <Link to={primary.to} search={primary.search} className="iz-portal-ai-btn">
      <div className="iz-portal-ai-btn__label">
        <Layers className="h-4 w-4 text-[var(--iz-violet)]" strokeWidth={1.8} />
        <span>AI suggestion</span>
      </div>
      <div className="iz-portal-ai-btn__body">
        <div className="min-w-0 flex-1">
          <div className="font-sora text-sm font-semibold leading-snug">
            {primary.title}
          </div>
          <p className="iz-tiny iz-muted mt-0.5">{primary.desc}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--iz-muted)]" />
      </div>
    </Link>
  );
}
