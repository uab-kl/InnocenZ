import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { AppTopbar } from '@agency-portal/components/Nav';
import { OutletSection } from '@agency-portal/components/outlet/OutletSection';
import { AgencyBroadcastSheet } from '@agency-portal/components/agency/AgencyBroadcastSheet';
import { ManagePrGridCard } from '@agency-portal/components/agency/ManagePrGridCard';
import { Comcard3dPreviewVisual } from '@agency-portal/components/agency/Comcard3dPreview';
import { toComcardPreview } from '@agency-portal/components/agency/PrComcardIdentity';
import { canGeneratePortfolioComcard, PortfolioGalleryTile } from '@agency-portal/components/pr/PortfolioComcardVisual';
import { IzSheet } from '@agency-portal/components/iz/Sheet';
import { useStore } from '@agency-portal/lib/store';
import type { AgencyManagedPR } from '@agency-portal/lib/agency-demo';
import {
  collectAgencyPrLanguages,
  languagesFromPr,
  resolveAgencyPrPhoto,
  sortAgencyPrsByName,
} from '@agency-portal/lib/agency-demo';
import { agencyCan } from '@agency-portal/lib/agency-rbac';
import { useAgencyPrs } from '@agency-portal/hooks/use-agency-prs';
import { useAgencyRatings } from '@agency-portal/hooks/use-agency-ratings';
import {
  IzCard,
  IzCardTitle,
  IzKpiLabel,
  IzPageTitle,
  IzPill,
  IzSectionLabel,
  IzSelect,
  formatRM,
} from '@agency-portal/components/iz/ui';
import { publicAssetPath } from '@agency-portal/lib/public-asset';
import { ProfileLanguagePicker } from '@agency-portal/components/iz/ProfileLanguagePicker';
import { shiftHistoryForPr } from '@agency-portal/lib/portal-sync';
import {
  RATING_WARN_THRESHOLD,
  getAgencyPrFlags,
  isAgencyPrActive,
  tiedMonthsLabel,
} from '@agency-portal/lib/agency-pr-flags';
import {
  evaluatePrPenalties,
  normalizePenaltyRules,
  prAttendanceWindow,
  PR_PAY_CLASSES,
  PR_PAY_CLASS_LABELS,
  prPayClass,
  totalPenaltyFineRm,
  type PrPayClass,
} from '@agency-portal/lib/pr-penalties';
import { DEFAULT_ROSTER_DATE_ISO } from '@agency-portal/lib/roster-availability';
import {
  AlertTriangle,
  ChevronDown,
  Filter,
  Megaphone,
  MousePointerClick,
  Pencil,
  Star,
  UserMinus,
} from 'lucide-react';

const KPI_TIER_OPTIONS = ['A', 'B', 'C'] as const;
const TRAINING_TIER_OPTIONS = [
  'Tier I',
  'Tier II',
  'Tier III',
  'Tier IV',
  'Tier V',
] as const;

export const Route = createFileRoute('/agency/prs')({
  component: AgencyManagePRs,
  validateSearch: (search: Record<string, unknown>): { pr?: string } => ({
    pr:
      typeof search.pr === 'string' && search.pr.trim()
        ? search.pr.trim()
        : undefined,
  }),
});

function AgencyManagePRs() {
  const { pr: prFromSearch } = Route.useSearch();
  const navigate = useNavigate({ from: '/agency/prs' });
  // Manage-PR reads real backend PRs (mapped to the demo shape) and writes the
  // backend-backed actions; demo-only sections below still read the demo store.
  const {
    prs: agencyPRs,
    saveProfile: updateAgencyPrProfile,
    suspend: suspendAgencyPr,
    detach: detachAgencyPr,
  } = useAgencyPrs();
  const shiftHistory = useStore((s) => s.shiftHistory);
  // Real ratings an outlet left on this agency's PRs. Written to the `rating`
  // table since the rate sheet shipped, but never read back until now — a real
  // rating was invisible here while demo rows showed fine.
  const demoRatings = useStore((s) => s.ratings);
  const backendRatings = useAgencyRatings();
  const ratings = backendRatings.backed ? backendRatings.ratings : demoRatings;
  const agencySubRole = useStore((s) => s.agencySubRole);
  const requestAgencyPrDetach = useStore((s) => s.requestAgencyPrDetach);
  const rawPenaltyRules = useStore((s) => s.outletWorkspace.penaltyRules);
  const penalizedPrs = useMemo(() => {
    const rules = normalizePenaltyRules(rawPenaltyRules);
    return agencyPRs
      .map((pr) => {
        const breaches = evaluatePrPenalties(
          prPayClass(pr),
          prAttendanceWindow(pr),
          rules,
        );
        return { pr, breaches, total: totalPenaltyFineRm(breaches) };
      })
      .filter((x) => x.breaches.length > 0)
      .sort((a, b) => b.total - a.total);
  }, [agencyPRs, rawPenaltyRules]);
  const [ageMin, setAgeMin] = useState('');
  const [ratingMin, setRatingMin] = useState('');
  const [lang, setLang] = useState('');
  const [race, setRace] = useState('');
  const [place, setPlace] = useState('');
  const [expMin, setExpMin] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [penaltiesOpen, setPenaltiesOpen] = useState(false);

  useEffect(() => {
    if (prFromSearch) setDetailId(prFromSearch);
  }, [prFromSearch]);

  const openPrProfile = (id: string) => {
    setDetailId(id);
    void navigate({ search: { pr: id } });
  };

  const closePrProfile = () => {
    setDetailId(null);
    void navigate({ search: { pr: undefined } });
  };

  const canManage = agencyCan(agencySubRole, 'managePr');

  const languages = useMemo(
    () => collectAgencyPrLanguages(agencyPRs),
    [agencyPRs],
  );
  const races = useMemo(
    () => [...new Set(agencyPRs.map((p) => p.race).filter(Boolean))],
    [agencyPRs],
  );
  const places = useMemo(
    () => [...new Set(agencyPRs.map((p) => p.place).filter(Boolean))],
    [agencyPRs],
  );

  const filtered = useMemo(
    () =>
      sortAgencyPrsByName(
        agencyPRs.filter((p) => {
          if (p.detached) return false;
          if (ageMin && (p.age ?? 0) < Number(ageMin)) return false;
          if (ratingMin && (p.rating ?? 0) < Number(ratingMin)) return false;
          const langs = languagesFromPr(p);
          if (
            lang &&
            !langs.some((l) => l.toLowerCase() === lang.toLowerCase())
          )
            return false;
          if (race && p.race !== race) return false;
          if (place && p.place !== place) return false;
          if (expMin && (p.yearsExp ?? 0) < Number(expMin)) return false;
          return true;
        }),
      ),
    [agencyPRs, ageMin, ratingMin, lang, race, place, expMin],
  );

  const detail = agencyPRs.find((p) => p.id === detailId);
  const activeCount = useMemo(
    () => filtered.filter((p) => isAgencyPrActive(p)).length,
    [filtered],
  );

  if (!canManage) {
    return (
      <div className="iz-screen">
        <header>
          <IzPageTitle>Access restricted</IzPageTitle>
        </header>
        <IzCard className="text-center">
          <p className="iz-sm iz-muted">
            Finance role cannot manage PR roster.
          </p>
        </IzCard>
      </div>
    );
  }

  if (detail) {
    return (
      <AgencyPrDetail
        detail={detail}
        shiftHistory={shiftHistory}
        ratings={ratings}
        onBack={closePrProfile}
        onSaveProfile={updateAgencyPrProfile}
        onSuspend={suspendAgencyPr}
        onDetach={detachAgencyPr}
        onRequestDetach={requestAgencyPrDetach}
      />
    );
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelected(new Set(filtered.map((p) => p.id)));
  };

  const openBroadcast = () => {
    if (!selectMode) {
      setSelectMode(true);
      return;
    }
    if (selected.size > 0) setBroadcastOpen(true);
  };

  const finishBroadcast = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  return (
    <div className="iz-screen">
      <header className="iz-pr-manage-header">
        <div className="min-w-0">
          <IzPageTitle>Manage PR</IzPageTitle>
          <p className="iz-tiny iz-muted mt-0.5">
            Filter roster · bulk broadcast · auto-flags
          </p>
        </div>
        <div className="iz-pr-manage-header__actions">
          <button
            type="button"
            className={`iz-pr-manage-header__btn${selectMode ? ' iz-pr-manage-header__btn--active' : ''}`}
            onClick={() => {
              setSelectMode(!selectMode);
              setSelected(new Set());
            }}
          >
            <MousePointerClick className="h-4 w-4" />
            {selectMode ? 'Cancel' : 'Select'}
          </button>
          <button
            type="button"
            className="iz-pr-manage-header__btn iz-pr-manage-header__btn--primary"
            onClick={openBroadcast}
          >
            <Megaphone className="h-4 w-4" />
            Broadcast
          </button>
        </div>
      </header>

      <IzCard flat className="border-[var(--iz-line2)]">
        <button
          type="button"
          onClick={() => setPenaltiesOpen((v) => !v)}
          aria-expanded={penaltiesOpen}
          className="flex w-full items-center gap-1.5 text-left"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-[var(--iz-muted)] transition-transform ${
              penaltiesOpen ? '' : '-rotate-90'
            }`}
          />
          <b className="iz-tiny uppercase tracking-wide text-[var(--iz-red,#e5484d)]">
            Recent penalties
          </b>
          {penalizedPrs.length > 0 && (
            <span className="iz-tiny iz-muted2">
              · {penalizedPrs.length} PR{penalizedPrs.length > 1 ? 's' : ''} ·
              RM {penalizedPrs.reduce((s, x) => s + x.total, 0)} total
            </span>
          )}
        </button>
        {penaltiesOpen &&
          (penalizedPrs.length === 0 ? (
            <p className="iz-sm iz-muted2 mt-2">
              No active penalties this week.
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {penalizedPrs.map((x) => (
                <div
                  key={x.pr.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openPrProfile(x.pr.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openPrProfile(x.pr.id);
                    }
                  }}
                  className="cursor-pointer rounded-lg border border-[var(--iz-line)] bg-[rgba(255,255,255,0.02)] p-2 transition-colors hover:border-[var(--iz-line2)] hover:bg-[rgba(255,255,255,0.04)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <b className="iz-sm text-[var(--iz-txt)]">{x.pr.name}</b>
                    <span className="iz-sm font-semibold tabular-nums text-[var(--iz-red,#e5484d)]">
                      {x.total > 0 ? `RM ${x.total}` : 'Warning'}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-col gap-1">
                    {x.breaches.map((b) => (
                      <div
                        key={b.ruleId}
                        className="flex items-baseline justify-between gap-2"
                      >
                        <span className="iz-sm leading-snug">
                          <span className="text-[var(--iz-muted)]">
                            {b.label}
                          </span>
                          <span className="iz-muted2"> · {b.detail}</span>
                        </span>
                        {b.fineRm > 0 && (
                          <span className="iz-sm shrink-0 tabular-nums text-[var(--iz-muted2)]">
                            RM {b.fineRm}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
      </IzCard>

      <IzCard flat className="iz-pr-manage-filters-card">
        <div className="flex items-center gap-2 iz-sm iz-muted mb-2">
          <Filter className="h-4 w-4 shrink-0" /> Filter PRs
        </div>
        <div className="iz-pr-manage-filters-inline">
          <label className="iz-pr-manage-filter-chip">
            <input
              type="number"
              placeholder="Min age"
              className="iz-roster-filter-input iz-roster-filter-input--plain"
              value={ageMin}
              onChange={(e) => setAgeMin(e.target.value)}
            />
          </label>
          <label className="iz-pr-manage-filter-chip">
            <input
              type="number"
              min={0}
              max={5}
              step={0.1}
              placeholder="Min rating"
              className="iz-roster-filter-input iz-roster-filter-input--plain"
              value={ratingMin}
              onChange={(e) => setRatingMin(e.target.value)}
            />
          </label>
          <label className="iz-pr-manage-filter-chip">
            <input
              type="number"
              placeholder="Min years"
              className="iz-roster-filter-input iz-roster-filter-input--plain"
              value={expMin}
              onChange={(e) => setExpMin(e.target.value)}
            />
          </label>
          <label className="iz-pr-manage-filter-chip iz-pr-manage-filter-chip--wide">
            <IzSelect
              block
              value={lang}
              onChange={(e) => setLang(e.target.value)}
            >
              <option value="">All languages</option>
              {languages.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </IzSelect>
          </label>
          <label className="iz-pr-manage-filter-chip">
            <IzSelect
              block
              value={race}
              onChange={(e) => setRace(e.target.value)}
            >
              <option value="">All races</option>
              {races.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </IzSelect>
          </label>
          <label className="iz-pr-manage-filter-chip">
            <IzSelect
              block
              value={place}
              onChange={(e) => setPlace(e.target.value)}
            >
              <option value="">All places</option>
              {places.map((pl) => (
                <option key={pl} value={pl}>
                  {pl}
                </option>
              ))}
            </IzSelect>
          </label>
        </div>
      </IzCard>

      <section className="mt-4">
        <div className="iz-pr-manage-stats">
          <span className="iz-pr-manage-stats__count">
            {filtered.length} PR{filtered.length !== 1 ? 'S' : ''}
          </span>
          <span className="iz-pr-manage-stats__active">
            {activeCount} active
          </span>
        </div>
        {selectMode && (
          <p className="iz-tiny iz-muted2 mb-2">
            {selected.size === 0
              ? 'Tap PR cards to multi-select'
              : `${selected.size} selected`}
            {selected.size > 0 && (
              <>
                {' · '}
                <button
                  type="button"
                  className="iz-link !text-xs"
                  onClick={selectAllFiltered}
                >
                  Select all
                </button>
              </>
            )}
          </p>
        )}
        {selectMode && selected.size > 0 && (
          <button
            type="button"
            className="iz-btn iz-btn-primary mb-3 w-full !py-2.5 !text-xs"
            onClick={() => setBroadcastOpen(true)}
          >
            <Megaphone className="h-3.5 w-3.5" /> Broadcast shift / message (
            {selected.size})
          </button>
        )}
        <div className="iz-pr-manage-grid">
          {filtered.map((p) => {
            const flags = getAgencyPrFlags(p);
            const active = isAgencyPrActive(p);
            const picked = selectMode && selected.has(p.id);
            return (
              <ManagePrGridCard
                key={p.id}
                pr={p}
                active={active}
                flags={flags}
                selectMode={selectMode}
                picked={picked}
                onActivate={() => {
                  if (selectMode) toggleSelect(p.id);
                  else openPrProfile(p.id);
                }}
              />
            );
          })}
        </div>
      </section>

      <AgencyBroadcastSheet
        open={broadcastOpen}
        onClose={() => setBroadcastOpen(false)}
        prIds={[...selected]}
        onSent={finishBroadcast}
      />
    </div>
  );
}

type AgencyPrDraft = {
  name: string;
  icName: string;
  mobile: string;
  email: string;
  age: number;
  height: number;
  weight: number;
  race: string;
  place: string;
  yearsExp: number;
  languages: string[];
  kpiTier: string;
  trainingLevel: string;
  payClass: PrPayClass;
};

function buildAgencyPrDraft(pr: AgencyManagedPR): AgencyPrDraft {
  return {
    name: pr.name ?? '',
    icName: pr.icName ?? pr.name ?? '',
    mobile: pr.mobile ?? '',
    email: pr.email ?? '',
    age: pr.age ?? 22,
    height: pr.height ?? 165,
    weight: pr.weight ?? 52,
    race: pr.race ?? '',
    place: pr.place ?? '',
    yearsExp: pr.yearsExp ?? 0,
    languages: [...(pr.languages ?? [])],
    kpiTier: pr.kpiTier ?? 'B',
    trainingLevel: pr.trainingLevel,
    payClass: prPayClass(pr),
  };
}

function AgencyPrDetail({
  detail,
  shiftHistory,
  ratings,
  onBack,
  onSaveProfile,
  onSuspend,
  onDetach,
  onRequestDetach,
}: {
  detail: AgencyManagedPR;
  shiftHistory: ReturnType<typeof useStore.getState>['shiftHistory'];
  ratings: ReturnType<typeof useStore.getState>['ratings'];
  onBack: () => void;
  onSaveProfile: (
    prId: string,
    patch: Partial<
      Pick<
        AgencyManagedPR,
        | 'name'
        | 'icName'
        | 'mobile'
        | 'email'
        | 'age'
        | 'height'
        | 'weight'
        | 'race'
        | 'languages'
        | 'place'
        | 'yearsExp'
        | 'kpiTier'
        | 'trainingLevel'
        | 'payClass'
      >
    >,
  ) => void;
  onSuspend: (prId: string) => void;
  onDetach: (prId: string) => void;
  onRequestDetach: (prId: string) => void;
}) {
  const toast = useStore((s) => s.toast);
  const penaltyRules = normalizePenaltyRules(
    useStore((s) => s.outletWorkspace.penaltyRules),
  );
  const penaltyBreaches = evaluatePrPenalties(
    prPayClass(detail),
    prAttendanceWindow(detail),
    penaltyRules,
  );
  const penaltyTotalRm = totalPenaltyFineRm(penaltyBreaches);
  const [editing, setEditing] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [detachOpen, setDetachOpen] = useState(false);
  const [draft, setDraft] = useState<AgencyPrDraft>(() =>
    buildAgencyPrDraft(detail),
  );
  const agencyRoster = useStore((s) => s.agencyRoster);
  const [payClassConfirm, setPayClassConfirm] = useState<{
    payload: Parameters<typeof onSaveProfile>[1];
    next: PrPayClass;
    conflicts: number;
  } | null>(null);

  const flags = getAgencyPrFlags(detail);
  const tiedUnderOneYear = flags.tiedUnderOneYear;

  // Future booked shifts incompatible with a switch to commission-only
  // (commission-only PRs may only work commission-only shifts).
  const futureIncompatibleSlots = (next: PrPayClass) => {
    if (next !== 'commissionOnly') return [];
    return agencyRoster.filter(
      (s) =>
        s.prId === detail.id &&
        s.dateIso >= DEFAULT_ROSTER_DATE_ISO &&
        s.status !== 'unavailable' &&
        s.payTierId !== 'commission_only',
    );
  };

  const startEdit = () => {
    setDraft(buildAgencyPrDraft(detail));
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(buildAgencyPrDraft(detail));
    setEditing(false);
  };

  const saveEdit = () => {
    const name = draft.name.trim();
    if (!name) {
      toast('Enter floor nickname', 'warn');
      return;
    }
    if (name.length < 2 || name.length > 20) {
      toast('Floor nickname must be 2–20 characters', 'warn');
      return;
    }
    const icName = draft.icName.trim();
    if (!icName) {
      toast('Enter legal IC name', 'warn');
      return;
    }
    if (!draft.mobile.trim()) {
      toast('Enter mobile number', 'warn');
      return;
    }
    if (draft.languages.length === 0) {
      toast('Select at least one language', 'warn');
      return;
    }
    const payload = {
      name,
      icName,
      mobile: draft.mobile.trim(),
      email: draft.email.trim(),
      age: Math.max(18, Math.min(60, Math.round(draft.age))),
      height: Math.max(140, Math.min(220, Math.round(draft.height))),
      weight: Math.max(35, Math.min(120, Math.round(draft.weight))),
      race: draft.race.trim(),
      place: draft.place.trim(),
      yearsExp: Math.max(0, Math.min(40, Math.round(draft.yearsExp))),
      languages: draft.languages,
      kpiTier: draft.kpiTier,
      trainingLevel: draft.trainingLevel,
      payClass: draft.payClass,
    };
    // A pay-class flip is an employment change — confirm it (with any booking
    // conflicts) before applying. Everything else saves straight away.
    if (draft.payClass !== prPayClass(detail)) {
      setPayClassConfirm({
        payload,
        next: draft.payClass,
        conflicts: futureIncompatibleSlots(draft.payClass).length,
      });
      return;
    }
    onSaveProfile(detail.id, payload);
    setEditing(false);
  };

  const commitPayClassChange = () => {
    if (!payClassConfirm) return;
    onSaveProfile(detail.id, payClassConfirm.payload);
    setPayClassConfirm(null);
    setEditing(false);
  };

  const display = editing ? draft : buildAgencyPrDraft(detail);
  const avatarLetter = display.name.trim()[0]?.toUpperCase() ?? '?';
  const profilePhoto = resolveAgencyPrPhoto(detail);

  const confirmSuspend = () => {
    onSuspend(detail.id);
    setSuspendOpen(false);
  };

  const confirmDetach = () => {
    if (tiedUnderOneYear) return;
    onDetach(detail.id);
    setDetachOpen(false);
    onBack();
  };

  const requestAdminDetach = () => {
    onRequestDetach(detail.id);
    setDetachOpen(false);
  };

  return (
    <div className="iz-screen">
      <AppTopbar
        onBack={editing ? cancelEdit : onBack}
        backLabel={editing ? 'Cancel edit' : 'PR list'}
      />
      <header>
        <p className="iz-tiny iz-muted2 uppercase tracking-widest">
          Managed PR
        </p>
        <IzPageTitle>{display.name}</IzPageTitle>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <IzPill
            variant={isAgencyPrActive(detail) ? 'green' : 'ink'}
            className="!py-0.5 !text-[9px]"
          >
            {isAgencyPrActive(detail) ? 'Active' : 'Inactive'}
          </IzPill>
          <p className="iz-tiny iz-muted">
            IC {detail.ic} · {detail.rating} ★ avg
          </p>
        </div>
      </header>
      {editing && (
        <span className="iz-pill iz-pill-amber mt-2 !text-[10px]">Editing</span>
      )}

      <IzCard
        className={`mt-3${editing ? ' border-[rgba(217,185,122,.25)]' : ''}`}
      >
        <div className="flex gap-2.5">
          <div
            className={`iz-avatar iz-avatar--lg shrink-0${profilePhoto ? ' iz-avatar-photo' : ''}`}
          >
            {profilePhoto ? (
              <img src={publicAssetPath(profilePhoto)} alt="" />
            ) : (
              avatarLetter
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="iz-between items-start gap-2">
              {editing ? (
                <div className="iz-field !mb-0 min-w-0 flex-1">
                  <label className="!text-[9px]">Floor nickname</label>
                  <input
                    type="text"
                    value={draft.name}
                    maxLength={20}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, name: e.target.value }))
                    }
                  />
                </div>
              ) : (
                <div className="font-sora text-[17px] font-bold">
                  {display.name}
                </div>
              )}
              <span className="iz-tier shrink-0">
                <Star className="h-3 w-3" /> {display.trainingLevel}
              </span>
            </div>
            <p className="iz-tiny iz-muted mt-0.5">
              KPI {display.kpiTier} ·{' '}
              {display.languages.join(', ') || 'No languages'}
            </p>
          </div>
        </div>
      </IzCard>

      <div className="iz-outlet-stat-strip mt-3">
        <div className="iz-outlet-stat-cell">
          <IzKpiLabel>Rating</IzKpiLabel>
          <div className="n text-[var(--iz-gold)]">{detail.rating}★</div>
        </div>
        <div className="iz-outlet-stat-cell">
          <IzKpiLabel>Attendance</IzKpiLabel>
          <div className="n">{detail.attendancePct}%</div>
        </div>
        <div className="iz-outlet-stat-cell">
          <IzKpiLabel>KPI</IzKpiLabel>
          <div className="n">{detail.kpiScore}</div>
        </div>
        <div className="iz-outlet-stat-cell">
          <IzKpiLabel>Paid</IzKpiLabel>
          <div className="n text-[var(--iz-gold-l)]">
            {(detail.totalPaid / 1000).toFixed(1)}k
          </div>
        </div>
      </div>

      <IzSectionLabel>Penalties</IzSectionLabel>
      <IzCard flat>
        {penaltyBreaches.length === 0 ? (
          <p className="iz-sm iz-muted">No active penalties.</p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {penaltyBreaches.map((b) => (
                <div
                  key={b.ruleId}
                  className="rounded-lg border border-[var(--iz-line)] bg-[rgba(255,255,255,0.02)] p-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--iz-txt)]">
                      {b.label}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--iz-red,#e5484d)]">
                      {b.fineRm > 0 ? `RM ${b.fineRm}` : 'Warning'}
                    </span>
                  </div>
                  <p className="iz-sm iz-muted mt-0.5">{b.detail}</p>
                </div>
              ))}
            </div>
            {penaltyTotalRm > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-[rgba(229,72,77,0.08)] px-2.5 py-2">
                <span className="iz-sm font-semibold uppercase tracking-wide text-[var(--iz-red,#e5484d)]">
                  Pending deduction
                </span>
                <span className="text-base font-bold tabular-nums text-[var(--iz-red,#e5484d)]">
                  RM {penaltyTotalRm}
                </span>
              </div>
            )}
          </div>
        )}
        <p className="iz-tiny iz-muted2 mt-2">
          Preview only · {PR_PAY_CLASS_LABELS[prPayClass(detail)]} · not yet
          deducted from payouts.
        </p>
      </IzCard>

      <IzSectionLabel>
        {detail.comcardImageUrl ||
        canGeneratePortfolioComcard(detail.portfolioPhotos ?? [])
          ? 'Photo comcard'
          : '3D Comcard'}
        {editing && (
          <span className="ml-auto text-[var(--iz-gold-l)] normal-case tracking-normal">
            Editable
          </span>
        )}
      </IzSectionLabel>
      <IzCard
        className={editing ? 'border-[rgba(217,185,122,.25)]' : undefined}
      >
        {editing ? (
          <div className="iz-comcard-edit">
            <AgencyComcardInput
              label="Height (cm)"
              value={draft.height}
              onChange={(n) => setDraft((p) => ({ ...p, height: n }))}
            />
            <AgencyComcardInput
              label="Weight (kg)"
              value={draft.weight}
              onChange={(n) => setDraft((p) => ({ ...p, weight: n }))}
            />
            <AgencyComcardInput
              label="Age"
              value={draft.age}
              onChange={(n) => setDraft((p) => ({ ...p, age: n }))}
            />
          </div>
        ) : (
          <Comcard3dPreviewVisual pr={toComcardPreview(detail)} />
        )}
      </IzCard>

      {(detail.portfolioPhotos?.some(Boolean) ?? false) && (
        <>
          <IzSectionLabel>Portfolio gallery</IzSectionLabel>
          <IzCard>
            <div className="grid grid-cols-4 gap-2">
              {detail
                .portfolioPhotos!.filter((src): src is string => Boolean(src))
                .map((src, i) => (
                  <PortfolioGalleryTile key={`${src}-${i}`} src={src} />
                ))}
            </div>
            <p className="iz-tiny iz-muted2 mt-2">
              Synced from PR profile · {detail.name}
            </p>
          </IzCard>
        </>
      )}

      <div className="iz-pr-profile-fields">
        <div>
          <IzSectionLabel>Contact</IzSectionLabel>
          <IzCard
            flat
            className={editing ? 'border-[rgba(217,185,122,.25)]' : undefined}
          >
            {editing ? (
              <div className="space-y-2">
                <div className="iz-field !mb-0">
                  <label>Legal IC name</label>
                  <input
                    value={draft.icName}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, icName: e.target.value }))
                    }
                  />
                </div>
                <div className="iz-field !mb-0">
                  <label>Mobile</label>
                  <input
                    value={draft.mobile}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, mobile: e.target.value }))
                    }
                  />
                </div>
                <div className="iz-field !mb-0">
                  <label>Email</label>
                  <input
                    type="email"
                    value={draft.email}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, email: e.target.value }))
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="iz-kv-list">
                <div className="iz-v-sum">
                  <span className="iz-muted">Mobile</span>
                  <b>{display.mobile}</b>
                </div>
                <div className="iz-v-sum">
                  <span className="iz-muted">Email</span>
                  <b>{display.email}</b>
                </div>
                <div className="iz-v-sum">
                  <span className="iz-muted">IC</span>
                  <b>{detail.ic}</b>
                </div>
              </div>
            )}
          </IzCard>
        </div>

        <div>
          <IzSectionLabel>Profile details</IzSectionLabel>
          <IzCard
            flat
            className={editing ? 'border-[rgba(217,185,122,.25)]' : undefined}
          >
            {editing ? (
              <div className="space-y-2">
                <div className="iz-field !mb-0">
                  <label>Race</label>
                  <input
                    value={draft.race}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, race: e.target.value }))
                    }
                  />
                </div>
                <div className="iz-field !mb-0">
                  <label>Place</label>
                  <input
                    value={draft.place}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, place: e.target.value }))
                    }
                  />
                </div>
                <AgencyComcardInput
                  label="Years experience"
                  value={draft.yearsExp}
                  onChange={(n) => setDraft((p) => ({ ...p, yearsExp: n }))}
                />
                <div className="iz-field !mb-0">
                  <label>KPI tier</label>
                  <IzSelect
                    value={draft.kpiTier}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, kpiTier: e.target.value }))
                    }
                  >
                    {KPI_TIER_OPTIONS.map((tier) => (
                      <option key={tier} value={tier}>
                        Tier {tier}
                      </option>
                    ))}
                  </IzSelect>
                </div>
                <div className="iz-field !mb-0">
                  <label>Training tier</label>
                  <IzSelect
                    value={draft.trainingLevel}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, trainingLevel: e.target.value }))
                    }
                  >
                    {TRAINING_TIER_OPTIONS.map((tier) => (
                      <option key={tier} value={tier}>
                        {tier}
                      </option>
                    ))}
                  </IzSelect>
                </div>
                <div className="iz-field !mb-0">
                  <label>Pay class</label>
                  <IzSelect
                    value={draft.payClass}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        payClass: e.target.value as PrPayClass,
                      }))
                    }
                  >
                    {PR_PAY_CLASSES.map((cls) => (
                      <option key={cls} value={cls}>
                        {PR_PAY_CLASS_LABELS[cls]}
                      </option>
                    ))}
                  </IzSelect>
                </div>
              </div>
            ) : (
              <div className="iz-kv-list">
                <div className="iz-v-sum">
                  <span className="iz-muted">Race</span>
                  <b>{display.race}</b>
                </div>
                <div className="iz-v-sum">
                  <span className="iz-muted">Place</span>
                  <b>{display.place}</b>
                </div>
                <div className="iz-v-sum">
                  <span className="iz-muted">Experience</span>
                  <b>{display.yearsExp} yrs</b>
                </div>
                <div className="iz-v-sum">
                  <span className="iz-muted">KPI tier</span>
                  <b>{display.kpiTier}</b>
                </div>
                <div className="iz-v-sum">
                  <span className="iz-muted">Training tier</span>
                  <b>{display.trainingLevel}</b>
                </div>
                <div className="iz-v-sum">
                  <span className="iz-muted">Pay class</span>
                  <b>{PR_PAY_CLASS_LABELS[display.payClass]}</b>
                </div>
              </div>
            )}
          </IzCard>
        </div>
      </div>

      <IzSectionLabel>Languages</IzSectionLabel>
      <IzCard
        flat
        className={editing ? 'border-[rgba(217,185,122,.25)]' : undefined}
      >
        {editing ? (
          <ProfileLanguagePicker
            value={draft.languages}
            onChange={(languages) => setDraft((p) => ({ ...p, languages }))}
          />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {display.languages.map((l) => (
              <IzPill key={l} variant="violet">
                {l}
              </IzPill>
            ))}
          </div>
        )}
      </IzCard>

      {!editing && (
        <>
          {detail.suspended && (
            <IzCard flat className="mt-2.5 border-[var(--iz-red)]">
              <p className="iz-tiny text-[var(--iz-red)]">
                Suspended — shifts paused
              </p>
            </IzCard>
          )}
          {flags.warnLowAvg && !detail.suspended && (
            <IzCard flat className="mt-2.5 border-[var(--iz-amber)]">
              <p className="iz-tiny flex items-center gap-1 text-[var(--iz-amber)]">
                <AlertTriangle className="h-3 w-3" />
                Warn · average {detail.rating}★ is below {RATING_WARN_THRESHOLD}
                ★ — monitor performance
              </p>
            </IzCard>
          )}
          {flags.suspendStreak && !detail.suspended && (
            <IzCard flat className="mt-2.5 border-[var(--iz-red)]">
              <p className="iz-tiny text-[var(--iz-red)]">
                Auto-flag · {flags.suspendLabel} — consider suspend
              </p>
            </IzCard>
          )}
          {tiedUnderOneYear && (
            <IzCard flat className="mt-2.5 border-[var(--iz-violet)]">
              <p className="iz-tiny text-[var(--iz-violet-l)]">
                Tied {tiedMonthsLabel(detail)} · detach requires InnocenZ admin
                approval
              </p>
            </IzCard>
          )}

          <OutletSection title="Shift history" hint="Last 3 shifts">
            <IzCard flat>
              {shiftHistoryForPr(shiftHistory, detail.id)
                .slice(0, 3)
                .map((h) => (
                  <p
                    key={h.id}
                    className="iz-tiny iz-muted border-t border-[var(--iz-line)] py-2 first:border-0 first:pt-0"
                  >
                    {h.dateDisplay} · {h.outlet} · {formatRM(h.totalPayout)}
                  </p>
                ))}
            </IzCard>
          </OutletSection>

          {(detail.payClassHistory?.length ?? 0) > 0 && (
            <OutletSection title="Pay class history" hint="Audit trail">
              <IzCard flat>
                {[...detail.payClassHistory!]
                  .sort((a, b) => (a.fromIso < b.fromIso ? 1 : -1))
                  .map((c, i) => (
                    <div
                      key={`${c.fromIso}-${i}`}
                      className="iz-v-sum border-t border-[var(--iz-line)] py-1.5 first:border-0 first:pt-0"
                    >
                      <span className="iz-muted">From {c.fromIso}</span>
                      <b>{PR_PAY_CLASS_LABELS[c.payClass]}</b>
                    </div>
                  ))}
              </IzCard>
            </OutletSection>
          )}

          <OutletSection title="Ratings feed">
            <IzCard flat>
              {ratings
                .filter((r) => r.pr === detail.name)
                .slice(0, 3)
                .map((r) => (
                  <p key={r.id} className="iz-tiny iz-muted py-1">
                    {r.stars}★ · {r.note}
                  </p>
                ))}
              {ratings.filter((r) => r.pr === detail.name).length === 0 && (
                <p className="iz-tiny iz-muted">No ratings yet</p>
              )}
            </IzCard>
          </OutletSection>

          <OutletSection title="Agency actions" hint="Discipline">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="iz-btn iz-btn-soft !text-xs"
                disabled={detail.suspended}
                onClick={() => setSuspendOpen(true)}
              >
                Suspend
              </button>
              <button
                type="button"
                className="iz-btn iz-btn-soft !text-xs"
                onClick={() => setDetachOpen(true)}
              >
                <UserMinus className="h-3 w-3" />{' '}
                {tiedUnderOneYear ? 'Request detach' : 'Detach'}
              </button>
            </div>
          </OutletSection>
        </>
      )}

      <div className="iz-profile-actions mt-4">
        {editing ? (
          <>
            <button
              type="button"
              className="iz-btn iz-btn-primary"
              onClick={saveEdit}
            >
              Save profile
            </button>
            <button
              type="button"
              className="iz-btn iz-btn-soft mt-2.5"
              onClick={cancelEdit}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="iz-btn iz-btn-primary"
            onClick={startEdit}
          >
            <Pencil className="h-4 w-4" /> Edit profile
          </button>
        )}
      </div>

      <IzSheet open={suspendOpen} onClose={() => setSuspendOpen(false)}>
        <IzCardTitle>Suspend {detail.name}?</IzCardTitle>
        <p className="iz-tiny iz-muted mb-3 leading-relaxed">
          This pauses all shift offers and check-ins for this PR until you lift
          the suspension. Pending roster slots may need to be reassigned.
        </p>
        <div className="iz-grid2">
          <button
            type="button"
            className="iz-btn iz-btn-ghost"
            onClick={() => setSuspendOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="iz-btn iz-btn-primary"
            onClick={confirmSuspend}
          >
            Confirm suspend
          </button>
        </div>
      </IzSheet>

      <IzSheet open={detachOpen} onClose={() => setDetachOpen(false)}>
        <IzCardTitle>
          {tiedUnderOneYear ? 'Request detach' : 'Detach'} {detail.name}?
        </IzCardTitle>
        <p className="iz-tiny iz-muted mb-3 leading-relaxed">
          {tiedUnderOneYear ? (
            <>
              This PR has been tied for {tiedMonthsLabel(detail)} (under 1
              year). Direct detach is blocked — submit a request for InnocenZ
              admin to review.
            </>
          ) : (
            <>
              Detach removes this PR from your agency roster. They will no
              longer receive tied shifts or payroll from your agency.
            </>
          )}
        </p>
        <div className="iz-grid2">
          <button
            type="button"
            className="iz-btn iz-btn-ghost"
            onClick={() => setDetachOpen(false)}
          >
            Cancel
          </button>
          {tiedUnderOneYear ? (
            <button
              type="button"
              className="iz-btn iz-btn-primary"
              onClick={requestAdminDetach}
            >
              Submit admin request
            </button>
          ) : (
            <button
              type="button"
              className="iz-btn iz-btn-primary"
              onClick={confirmDetach}
            >
              Confirm detach
            </button>
          )}
        </div>
      </IzSheet>

      <IzSheet
        open={payClassConfirm !== null}
        onClose={() => setPayClassConfirm(null)}
      >
        <IzCardTitle>Change pay class?</IzCardTitle>
        <p className="iz-tiny iz-muted mb-3 leading-relaxed">
          {detail.name} moves from{' '}
          <b>{PR_PAY_CLASS_LABELS[prPayClass(detail)]}</b> to{' '}
          <b>
            {payClassConfirm ? PR_PAY_CLASS_LABELS[payClassConfirm.next] : ''}
          </b>
          , effective {DEFAULT_ROSTER_DATE_ISO}. Shifts already worked or booked
          keep their original pay; new shifts use the new class.
        </p>
        {payClassConfirm && payClassConfirm.conflicts > 0 && (
          <IzCard flat className="mb-3 border-[var(--iz-amber)]">
            <p className="iz-tiny flex items-start gap-1 text-[var(--iz-amber)]">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              {payClassConfirm.conflicts} upcoming booked shift
              {payClassConfirm.conflicts === 1 ? ' is' : 's are'} not
              commission-only. Commission-only PRs may only work commission-only
              shifts — review or reassign these bookings.
            </p>
          </IzCard>
        )}
        <div className="iz-grid2">
          <button
            type="button"
            className="iz-btn iz-btn-ghost"
            onClick={() => setPayClassConfirm(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="iz-btn iz-btn-primary"
            onClick={commitPayClassChange}
          >
            Confirm change
          </button>
        </div>
      </IzSheet>
    </div>
  );
}

function AgencyComcardInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="iz-comcard-field">
      <label>{label}</label>
      <input
        type="number"
        inputMode="numeric"
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
