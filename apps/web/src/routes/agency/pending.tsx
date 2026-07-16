import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@agency-portal/lib/store';
import type { PendingCutlostRequest } from '@agency-portal/lib/outlet-cutlost-requests';
import {
  cutlostRequestDetail,
  cutlostRequestTitle,
} from '@agency-portal/lib/outlet-cutlost-requests';
import { nowAgencyDateTime } from '@agency-portal/lib/agency-demo';
import { agencyCan } from '@agency-portal/lib/agency-rbac';
import type { PendingPR, PendingAgencyLink } from '@agency-portal/lib/store';
import { IzCard, IzPill } from '@agency-portal/components/iz/ui';
import { IzSheet } from '@agency-portal/components/iz/Sheet';
import {
  Calendar,
  Camera,
  Check,
  Clock,
  Contact,
  Image,
  Mail,
  Phone,
  Sparkles,
  TrendingDown,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react';
import { publicAssetPath } from '@agency-portal/lib/public-asset';
import { portfolioFilledCount } from '@agency-portal/components/pr/PortfolioGalleryPicker';
import {
  canGeneratePortfolioComcard,
  PortfolioComcardVisual,
  portfolioPhotosForComcard,
  StaticComcardVisual,
} from '@agency-portal/components/pr/PortfolioComcardVisual';
import {
  Comcard3dPreviewVisual,
  type ComcardPreviewData,
} from '@agency-portal/components/agency/Comcard3dPreview';
import { cn } from '@agency-portal/lib/utils';

function docImageSrc(src: string) {
  return src.startsWith('data:') ? src : publicAssetPath(src);
}

function pendingPRToComcardPreview(signup: PendingPR): ComcardPreviewData {
  return {
    id: signup.id,
    name: signup.name,
    height: signup.height ?? 165,
    weight: signup.weight ?? 52,
    age: signup.age ?? 24,
    portfolioPhotos: signup.portfolioPhotos,
    comcardImageUrl: signup.comcardImageUrl,
  };
}

function comcardTabMeta(signup: PendingPR) {
  if (signup.comcardImageUrl) return { ready: true, label: 'Photo comcard' };
  if (canGeneratePortfolioComcard(signup.portfolioPhotos ?? []))
    return { ready: true, label: 'Photo comcard' };
  if (signup.name) return { ready: true, label: '3D preview' };
  return { ready: false, label: 'Empty' };
}

function PendingComcardVisual({
  signup,
  className,
  compact,
}: {
  signup: PendingPR;
  className?: string;
  compact?: boolean;
}) {
  const pr = pendingPRToComcardPreview(signup);
  const photos = portfolioPhotosForComcard(signup.portfolioPhotos ?? []).map(
    docImageSrc,
  );

  if (signup.comcardImageUrl) {
    return (
      <StaticComcardVisual src={signup.comcardImageUrl} className={className} />
    );
  }
  if (photos.length >= 4) {
    return (
      <PortfolioComcardVisual photos={photos} pr={pr} className={className} />
    );
  }
  return (
    <Comcard3dPreviewVisual
      pr={pr}
      className={className}
      showName={!compact}
      compact={compact}
      showStats={!compact}
    />
  );
}

type Tab = 'signups' | 'cutlost';

const AVATAR_VARIANTS = ['rose', 'sky', 'violet', 'amber', 'mint'] as const;

function avatarVariant(id: string) {
  let hash = 0;
  for (const c of id) hash = (hash + c.charCodeAt(0)) % AVATAR_VARIANTS.length;
  return AVATAR_VARIANTS[hash];
}

function ApprovalsAvatar({
  name,
  id,
  size = 'md',
}: {
  name: string;
  id: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const initial = name.trim()[0]?.toUpperCase() ?? '?';
  return (
    <span
      className={cn(
        'iz-approvals-avatar',
        `iz-approvals-avatar--${avatarVariant(id)}`,
        size,
      )}
    >
      {initial}
    </span>
  );
}

function pendingFloorNickname(signup: PendingPR) {
  return signup.name.trim() || 'PR';
}

function pendingLegalIcName(signup: PendingPR) {
  const legal = signup.icName?.trim();
  if (!legal) return '';
  if (legal.toLowerCase() === pendingFloorNickname(signup).toLowerCase())
    return '';
  return legal;
}

function VerificationBadge({
  ok,
  label,
  count,
  variant,
}: {
  ok: boolean;
  label: string;
  count?: number;
  variant?: 'gallery' | 'comcard';
}) {
  return (
    <span
      className={cn(
        'iz-approvals-verify-badge',
        variant === 'comcard' && (ok ? 'comcard' : 'bad'),
        variant !== 'comcard' &&
          (count !== undefined ? 'gallery' : ok ? 'ok' : 'bad'),
      )}
    >
      {label}
      {ok ? ' ✓' : ' ✕'}
      {count !== undefined && count > 0 ? ` · ${count}` : ''}
    </span>
  );
}

function RejectSheet({
  open,
  title,
  subtitle,
  placeholder,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  placeholder: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  if (!open) return null;

  return (
    <IzSheet open onClose={onClose}>
      <div className="iz-sheet-head">
        <div>
          <button
            type="button"
            className="iz-chip mb-2 !px-2 !py-1 !text-[10px]"
            onClick={onClose}
          >
            ← Back
          </button>
          <h3>{title}</h3>
          {subtitle && <p className="iz-tiny iz-muted mt-1">{subtitle}</p>}
        </div>
        <button
          type="button"
          className="iz-sheet-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <textarea
        className="iz-field-input min-h-[80px] !text-sm"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="iz-btn iz-btn-primary mt-3 w-full"
        disabled={!reason.trim()}
        onClick={() => onConfirm(reason.trim())}
      >
        {confirmLabel}
      </button>
    </IzSheet>
  );
}

function DocPreviewSheet({
  preview,
  signup,
  icPhotoFront,
  icPhotoBack,
  selfiePhoto,
  gallerySlots,
  onClose,
}: {
  preview: 'ic' | 'selfie' | 'gallery' | 'comcard' | null;
  signup: PendingPR;
  icPhotoFront?: string;
  icPhotoBack?: string;
  selfiePhoto?: string;
  gallerySlots: string[];
  onClose: () => void;
}) {
  if (!preview) return null;
  const title =
    preview === 'ic'
      ? 'IC photos'
      : preview === 'selfie'
        ? 'Selfie verification'
        : preview === 'comcard'
          ? 'Comcard'
          : 'Portfolio gallery';

  return (
    <IzSheet open onClose={onClose}>
      <div className="iz-sheet-head">
        <div>
          <button
            type="button"
            className="iz-chip mb-2 !px-2 !py-1 !text-[10px]"
            onClick={onClose}
          >
            ← Back
          </button>
          <h3>{title}</h3>
        </div>
        <button
          type="button"
          className="iz-sheet-close"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {preview === 'ic' && (
        <div className="grid grid-cols-2 gap-3 px-4 pb-4">
          {(
            [
              { side: 'Front', src: icPhotoFront },
              { side: 'Back', src: icPhotoBack },
            ] as const
          ).map(({ side, src }) => (
            <div key={side} className="space-y-1">
              <p className="iz-tiny iz-muted2">{side}</p>
              {src ? (
                <img
                  src={docImageSrc(src)}
                  alt={`IC ${side.toLowerCase()}`}
                  className="aspect-[3/2] w-full rounded-xl border border-[var(--iz-line)] object-cover"
                />
              ) : (
                <div className="aspect-[3/2] rounded-xl bg-gradient-to-br from-[var(--iz-bg3)] to-[var(--iz-line)]" />
              )}
            </div>
          ))}
        </div>
      )}
      {preview === 'selfie' && (
        <div className="px-4 pb-4">
          {selfiePhoto ? (
            <img
              src={docImageSrc(selfiePhoto)}
              alt="Selfie verification"
              className="mx-auto aspect-[3/4] max-w-[220px] rounded-xl border border-[var(--iz-line)] object-cover"
            />
          ) : (
            <div className="mx-auto aspect-[3/4] max-w-[220px] rounded-xl bg-gradient-to-br from-[var(--iz-violet-bg)] to-[var(--iz-bg3)]" />
          )}
        </div>
      )}
      {preview === 'gallery' && (
        <div className="grid grid-cols-3 gap-2 px-4 pb-4">
          {gallerySlots.map((src, i) => (
            <div
              key={i}
              className="aspect-square overflow-hidden rounded-lg border border-[var(--iz-line)]"
            >
              <img
                src={docImageSrc(src)}
                alt={`Portfolio ${i + 1}`}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      )}
      {preview === 'comcard' && (
        <div className="px-4 pb-4">
          <PendingComcardVisual signup={signup} className="mx-auto" />
        </div>
      )}
    </IzSheet>
  );
}

type DocTab = 'ic' | 'selfie' | 'gallery' | 'comcard';

function DocumentTabs({
  activeTab,
  onTabChange,
  hasIcPhotos,
  hasSelfie,
  galleryCount,
  comcardMeta,
}: {
  activeTab: DocTab;
  onTabChange: (tab: DocTab) => void;
  hasIcPhotos: boolean;
  hasSelfie: boolean;
  galleryCount: number;
  comcardMeta: { ready: boolean; label: string };
}) {
  return (
    <div
      className="iz-approvals-doc-tabs"
      role="tablist"
      aria-label="Document types"
    >
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'ic'}
        className={cn(
          'iz-approvals-doc-tab',
          hasIcPhotos && 'ok',
          activeTab === 'ic' && 'on',
        )}
        onClick={() => onTabChange('ic')}
      >
        {hasIcPhotos ? (
          <Check className="h-4 w-4 text-[var(--iz-green)]" />
        ) : (
          <Camera className="h-4 w-4 text-[var(--iz-muted)]" />
        )}
        <span className="t">IC photos</span>
        <span className="s">{hasIcPhotos ? 'Verified' : 'Missing'}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'selfie'}
        className={cn(
          'iz-approvals-doc-tab',
          hasSelfie && 'ok',
          activeTab === 'selfie' && 'on',
        )}
        onClick={() => onTabChange('selfie')}
      >
        {hasSelfie ? (
          <Check className="h-4 w-4 text-[var(--iz-green)]" />
        ) : (
          <Camera className="h-4 w-4 text-[var(--iz-muted)]" />
        )}
        <span className="t">Selfie</span>
        <span className="s">{hasSelfie ? 'Verified' : 'Missing'}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'gallery'}
        className={cn(
          'iz-approvals-doc-tab',
          galleryCount > 0 && 'gallery',
          activeTab === 'gallery' && 'on',
        )}
        onClick={() => onTabChange('gallery')}
      >
        <Image className="h-4 w-4" />
        <span className="t">Gallery</span>
        <span className="s">
          {galleryCount > 0 ? `${galleryCount} photos` : 'Empty'}
        </span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'comcard'}
        className={cn(
          'iz-approvals-doc-tab',
          comcardMeta.ready && 'comcard',
          activeTab === 'comcard' && 'on',
        )}
        onClick={() => onTabChange('comcard')}
      >
        <Contact className="h-4 w-4" />
        <span className="t">Comcard</span>
        <span className="s">{comcardMeta.label}</span>
      </button>
    </div>
  );
}

function DocumentPreviewStack({
  activeTab,
  signup,
  hasIcPhotos,
  hasSelfie,
  icPhotoFront,
  icPhotoBack,
  selfiePhoto,
  gallerySlots,
  onPreview,
}: {
  activeTab: DocTab;
  signup: PendingPR;
  hasIcPhotos: boolean;
  hasSelfie: boolean;
  icPhotoFront?: string;
  icPhotoBack?: string;
  selfiePhoto?: string;
  gallerySlots: string[];
  onPreview: (kind: 'ic' | 'selfie' | 'gallery' | 'comcard') => void;
}) {
  const galleryPlaceholders = gallerySlots.length > 0 ? 0 : 4;

  const icCell = (label: string, src: string | undefined, aria: string) => (
    <button
      type="button"
      className="iz-approvals-doc-cell verified ic"
      onClick={() => onPreview('ic')}
      aria-label={aria}
    >
      <span className="cell-label">{label}</span>
      <div className="cell-media">
        {src ? (
          <img src={docImageSrc(src)} alt={aria} />
        ) : (
          <span className="cell-fill ic" />
        )}
      </div>
    </button>
  );

  return (
    <div className="iz-approvals-doc-previews" role="tabpanel">
      {activeTab === 'ic' && (
        <div className="iz-approvals-doc-row iz-approvals-doc-row--ic">
          {hasIcPhotos ? (
            <>
              {icCell('IC · Front', icPhotoFront, 'IC front')}
              {icCell('IC · Back', icPhotoBack, 'IC back')}
            </>
          ) : (
            <>
              <div className="iz-approvals-doc-cell empty" aria-hidden>
                <Camera className="h-6 w-6 opacity-30" />
              </div>
              <div className="iz-approvals-doc-cell empty" aria-hidden>
                <Camera className="h-6 w-6 opacity-30" />
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'selfie' && (
        <div className="iz-approvals-doc-row iz-approvals-doc-row--selfie">
          {hasSelfie ? (
            <button
              type="button"
              className="iz-approvals-doc-cell verified selfie"
              onClick={() => onPreview('selfie')}
              aria-label="Selfie verification"
            >
              <span className="cell-label">Selfie</span>
              <div className="cell-media">
                {selfiePhoto ? (
                  <img
                    src={docImageSrc(selfiePhoto)}
                    alt="Selfie verification"
                  />
                ) : (
                  <span className="cell-fill selfie" />
                )}
              </div>
            </button>
          ) : (
            <div className="iz-approvals-doc-cell empty" aria-hidden>
              <Camera className="h-6 w-6 opacity-30" />
            </div>
          )}
        </div>
      )}

      {activeTab === 'gallery' && (
        <div className="iz-approvals-doc-row iz-approvals-doc-row--gallery">
          {gallerySlots.length > 0
            ? gallerySlots.map((src, i) => (
                <button
                  key={i}
                  type="button"
                  className="iz-approvals-doc-cell gallery has-photo"
                  onClick={() => onPreview('gallery')}
                  aria-label={`Portfolio ${i + 1}`}
                >
                  <img src={docImageSrc(src)} alt={`Portfolio ${i + 1}`} />
                </button>
              ))
            : Array.from({ length: galleryPlaceholders }).map((_, i) => (
                <div
                  key={i}
                  className="iz-approvals-doc-cell empty"
                  aria-hidden
                >
                  <Image className="h-6 w-6 opacity-30" />
                </div>
              ))}
        </div>
      )}

      {activeTab === 'comcard' && (
        <div className="iz-approvals-doc-row iz-approvals-doc-row--comcard">
          {comcardTabMeta(signup).ready ? (
            <button
              type="button"
              className="iz-approvals-doc-cell comcard-preview"
              onClick={() => onPreview('comcard')}
              aria-label="View comcard"
            >
              <PendingComcardVisual signup={signup} compact />
            </button>
          ) : (
            <div className="iz-approvals-doc-cell empty" aria-hidden>
              <Contact className="h-6 w-6 opacity-30" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SignupDetailPanel({
  signup,
  onApprove,
  onReject,
}: {
  signup: PendingPR;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [preview, setPreview] = useState<
    'ic' | 'selfie' | 'gallery' | 'comcard' | null
  >(null);
  const [docTab, setDocTab] = useState<DocTab>('ic');
  const galleryCount = portfolioFilledCount(signup.portfolioPhotos ?? []);
  const gallerySlots = (signup.portfolioPhotos ?? []).filter(
    Boolean,
  ) as string[];
  const comcardMeta = comcardTabMeta(signup);

  useEffect(() => {
    setDocTab('ic');
    setPreview(null);
  }, [signup.id]);

  return (
    <>
      <div className="iz-approvals-detail-head">
        <div className="iz-approvals-detail-profile">
          <ApprovalsAvatar
            name={pendingFloorNickname(signup)}
            id={signup.id}
            size="lg"
          />
          <div className="min-w-0">
            <h2 className="iz-approvals-detail-name">
              {pendingFloorNickname(signup)}
            </h2>
            {pendingLegalIcName(signup) && (
              <p className="iz-approvals-detail-meta">
                Legal · {pendingLegalIcName(signup)}
              </p>
            )}
            <p className="iz-approvals-detail-meta">
              {signup.languages}
              {signup.submittedAt ? ` · Applied ${signup.submittedAt}` : ''}
            </p>
            {signup.source === 'owner-invite' && (
              <IzPill variant="amber" className="mt-1.5">
                Owner invite
              </IzPill>
            )}
          </div>
        </div>
        <div className="iz-approvals-detail-actions">
          <button
            type="button"
            className="iz-btn iz-btn-primary !py-2 !text-xs"
            onClick={onApprove}
          >
            Approve
          </button>
          <button
            type="button"
            className="iz-btn iz-btn-soft !py-2 !text-xs"
            onClick={() => setRejectOpen(true)}
          >
            Reject
          </button>
        </div>
      </div>

      <div className="iz-approvals-info-grid">
        <div className="iz-approvals-info-card">
          <h3 className="iz-approvals-info-title">Personal info</h3>
          <div className="iz-approvals-info-chips">
            {signup.race && <IzPill variant="violet">{signup.race}</IzPill>}
            {signup.age && <IzPill variant="violet">Age {signup.age}</IzPill>}
            {signup.height && (
              <IzPill variant="violet">{signup.height} cm</IzPill>
            )}
            {signup.weight && (
              <IzPill variant="violet">{signup.weight} kg</IzPill>
            )}
          </div>
          {signup.ic && (
            <p className="iz-approvals-info-line">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              IC {signup.ic}
            </p>
          )}
          {pendingLegalIcName(signup) && (
            <p className="iz-approvals-info-line">
              <Contact className="h-3.5 w-3.5 shrink-0" />
              {pendingLegalIcName(signup)}
            </p>
          )}
        </div>
        <div className="iz-approvals-info-card">
          <h3 className="iz-approvals-info-title">Contact</h3>
          {signup.email && (
            <p className="iz-approvals-info-line">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              {signup.email}
            </p>
          )}
          {signup.mobile && (
            <p className="iz-approvals-info-line">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              {signup.mobile}
            </p>
          )}
        </div>
      </div>

      <section className="iz-approvals-docs">
        <h3 className="iz-approvals-info-title">Documents</h3>
        <DocumentTabs
          activeTab={docTab}
          onTabChange={setDocTab}
          hasIcPhotos={!!signup.hasIcPhotos}
          hasSelfie={!!signup.hasSelfie}
          galleryCount={galleryCount}
          comcardMeta={comcardMeta}
        />
        <DocumentPreviewStack
          activeTab={docTab}
          signup={signup}
          hasIcPhotos={!!signup.hasIcPhotos}
          hasSelfie={!!signup.hasSelfie}
          icPhotoFront={signup.icPhotoFront}
          icPhotoBack={signup.icPhotoBack}
          selfiePhoto={signup.selfiePhoto}
          gallerySlots={gallerySlots}
          onPreview={setPreview}
        />
      </section>

      <RejectSheet
        open={rejectOpen}
        title={`Reject ${pendingFloorNickname(signup)}`}
        subtitle="Reason is sent to PR (mandatory)"
        placeholder="e.g. Incomplete IC verification…"
        confirmLabel="Confirm reject"
        onClose={() => setRejectOpen(false)}
        onConfirm={(reason) => {
          onReject(reason);
          setRejectOpen(false);
        }}
      />
      <DocPreviewSheet
        preview={preview}
        signup={signup}
        icPhotoFront={signup.icPhotoFront}
        icPhotoBack={signup.icPhotoBack}
        selfiePhoto={signup.selfiePhoto}
        gallerySlots={gallerySlots}
        onClose={() => setPreview(null)}
      />
    </>
  );
}

function CutlostDetailPanel({
  req,
  onApprove,
  onReject,
}: {
  req: PendingCutlostRequest;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const Icon =
    req.kind === 'best_effort'
      ? Sparkles
      : req.kind === 'release_prs'
        ? UserMinus
        : TrendingDown;

  return (
    <>
      <div className="iz-approvals-detail-head">
        <div className="iz-approvals-detail-profile">
          <span className="iz-approvals-cutlost-icon">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="iz-approvals-detail-name">{req.outletName}</h2>
            <p className="iz-approvals-detail-meta">{req.shiftEvent}</p>
            <p className="iz-approvals-detail-meta mt-0.5">
              <Clock className="mr-1 inline h-3 w-3" />
              Requested {req.requestedAt}
            </p>
          </div>
        </div>
        <div className="iz-approvals-detail-actions">
          <button
            type="button"
            className="iz-btn iz-btn-primary !py-2 !text-xs"
            onClick={onApprove}
          >
            Approve
          </button>
          <button
            type="button"
            className="iz-btn iz-btn-soft !py-2 !text-xs"
            onClick={() => setRejectOpen(true)}
          >
            Decline
          </button>
        </div>
      </div>

      <div className="iz-approvals-cutlost-summary">
        <Icon className="h-4 w-4 shrink-0 text-[var(--iz-gold-l)]" />
        <div className="min-w-0">
          <p className="font-sora text-sm font-bold text-[var(--iz-txt)]">
            {cutlostRequestTitle(req)}
          </p>
          <p className="iz-tiny iz-muted2 mt-0.5">
            {cutlostRequestDetail(req)}
          </p>
        </div>
      </div>

      <div className="iz-approvals-info-chips mt-3">
        <IzPill variant="violet">{req.dateLabel}</IzPill>
        <IzPill variant="violet">{req.shiftLabel}</IzPill>
        {req.model === 'best_effort' && (
          <IzPill variant="violet">Best effort</IzPill>
        )}
        <IzPill variant="red">
          Cutlost RM {Math.round(req.cutlostBefore).toLocaleString('en-MY')}
        </IzPill>
        <IzPill variant="green">
          Saves ~RM {Math.round(req.estimatedSavings).toLocaleString('en-MY')}
        </IzPill>
      </div>

      {req.releasedPrNames?.length ? (
        <div className="iz-approvals-info-card mt-3">
          <h3 className="iz-approvals-info-title">PRs affected</h3>
          <p className="iz-tiny iz-muted">{req.releasedPrNames.join(', ')}</p>
          <p className="iz-tiny iz-muted2 mt-2">
            On approve: paid for hours worked + commissions. They are sent home
            unless you reassign them to another outlet on the roster.
          </p>
        </div>
      ) : null}

      {req.rationale?.length ? (
        <div className="iz-approvals-info-card mt-3">
          <h3 className="iz-approvals-info-title">Rationale</h3>
          <ul className="iz-approvals-rationale">
            {req.rationale.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <RejectSheet
        open={rejectOpen}
        title="Decline cutlost request"
        subtitle={`${req.outletName} · ${cutlostRequestTitle(req)}`}
        placeholder="Reason for declining…"
        confirmLabel="Confirm decline"
        onClose={() => setRejectOpen(false)}
        onConfirm={(reason) => {
          onReject(reason);
          setRejectOpen(false);
        }}
      />
    </>
  );
}

function LinkRequestDetailPanel({
  link,
  onApprove,
  onReject,
}: {
  link: PendingAgencyLink;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <>
      <div className="iz-approvals-detail-head">
        <div className="iz-approvals-detail-profile">
          <ApprovalsAvatar name={link.prName} id={link.id} size="lg" />
          <div className="min-w-0">
            <h2 className="iz-approvals-detail-name">{link.prName}</h2>
            <p className="iz-approvals-detail-meta">
              Wants to link to {link.agencyName} · {link.requestedAt}
            </p>
            <IzPill variant="amber" className="mt-1.5">
              Agency-link request
            </IzPill>
          </div>
        </div>
        <div className="iz-approvals-detail-actions">
          <button
            type="button"
            className="iz-btn iz-btn-primary !py-2 !text-xs"
            onClick={onApprove}
          >
            Approve link
          </button>
          <button
            type="button"
            className="iz-btn iz-btn-soft !py-2 !text-xs"
            onClick={onReject}
          >
            Reject
          </button>
        </div>
      </div>

      <div className="iz-approvals-info-grid">
        <div className="iz-approvals-info-card">
          <h3 className="iz-approvals-info-title">Link request</h3>
          <p className="iz-approvals-info-line">
            <UserPlus className="h-3.5 w-3.5 shrink-0" />
            {link.prName} is asking to join {link.agencyName}.
          </p>
          <p className="iz-tiny iz-muted2 mt-1">
            Approve to add them to your roster — they can then be scheduled like
            any tied PR.
          </p>
        </div>
      </div>
    </>
  );
}

export const Route = createFileRoute('/agency/pending')({
  component: AgencyPending,
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } => ({
    tab: search.tab === 'cutlost' ? 'cutlost' : undefined,
  }),
});

function AgencyPending() {
  const { tab: tabFromSearch } = Route.useSearch();
  const {
    pendingPRs,
    pendingCutlostRequests,
    approvePendingPR,
    rejectPendingPR,
    approveCutlostRequest,
    rejectCutlostRequest,
    invitePendingPR,
    agencySubRole,
    pendingAgencyLinks,
    activeAgencyId,
    approveAgencyLink,
    rejectAgencyLink,
  } = useStore();
  const agencyLinkRequests = useMemo(
    () =>
      pendingAgencyLinks.filter(
        (l) => l.status === 'pending' && l.agencyId === activeAgencyId,
      ),
    [pendingAgencyLinks, activeAgencyId],
  );
  const { date, time } = nowAgencyDateTime();
  const [tab, setTab] = useState<Tab>('signups');
  const [selectedSignupId, setSelectedSignupId] = useState<string | null>(null);
  const [selectedCutlostId, setSelectedCutlostId] = useState<string | null>(
    null,
  );
  const [addOpen, setAddOpen] = useState(false);
  const [invite, setInvite] = useState({
    name: '',
    ic: '',
    mobile: '',
    email: '',
  });

  useEffect(() => {
    if (tabFromSearch) setTab(tabFromSearch);
  }, [tabFromSearch]);

  const signups = useMemo(
    () =>
      pendingPRs.filter(
        (p) =>
          p.status === 'pending' && (p.agencyId ?? 'atlas') === activeAgencyId,
      ),
    [pendingPRs, activeAgencyId],
  );
  const cutlostRequests = useMemo(
    () => pendingCutlostRequests.filter((r) => r.status === 'pending'),
    [pendingCutlostRequests],
  );

  useEffect(() => {
    if (tab === 'signups') {
      setSelectedSignupId((id) => {
        const ids = [
          ...signups.map((s) => s.id),
          ...agencyLinkRequests.map((l) => l.id),
        ];
        return id && ids.includes(id) ? id : (ids[0] ?? null);
      });
    } else {
      setSelectedCutlostId((id) =>
        id && cutlostRequests.some((r) => r.id === id)
          ? id
          : (cutlostRequests[0]?.id ?? null),
      );
    }
  }, [tab, signups, agencyLinkRequests, cutlostRequests]);

  const selectedSignup = signups.find((s) => s.id === selectedSignupId) ?? null;
  const selectedLink =
    agencyLinkRequests.find((l) => l.id === selectedSignupId) ?? null;
  const selectedCutlost =
    cutlostRequests.find((r) => r.id === selectedCutlostId) ?? null;

  if (!agencyCan(agencySubRole, 'approvePrSignups')) {
    return (
      <div className="iz-screen iz-approvals-page">
        <IzCard className="text-center">
          <p className="iz-sm iz-muted">
            Finance role cannot approve PR sign-ups.
          </p>
        </IzCard>
      </div>
    );
  }

  return (
    <div className="iz-screen iz-approvals-page">
      <div className="iz-approvals-layout">
        <aside className="iz-approvals-sidebar">
          <header className="iz-approvals-sidebar-head">
            <h1 className="iz-approvals-title">Approvals</h1>
            <p className="iz-tiny iz-muted2 mt-0.5">
              {date} · {time}
            </p>
          </header>

          <div className="iz-approvals-tabs">
            <button
              type="button"
              className={cn('iz-approvals-tab', tab === 'signups' && 'on')}
              onClick={() => setTab('signups')}
            >
              Agency-Tied ({signups.length + agencyLinkRequests.length})
            </button>
            <button
              type="button"
              className={cn('iz-approvals-tab', tab === 'cutlost' && 'on')}
              onClick={() => setTab('cutlost')}
            >
              Cutlost ({cutlostRequests.length})
            </button>
          </div>

          {tab === 'signups' && (
            <button
              type="button"
              className="iz-approvals-add-btn"
              onClick={() => setAddOpen(true)}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add PR
            </button>
          )}

          <div className="iz-approvals-list">
            {tab === 'signups' ? (
              signups.length === 0 && agencyLinkRequests.length === 0 ? (
                <p className="iz-tiny iz-muted px-1 py-4 text-center">
                  No pending sign-ups
                </p>
              ) : (
                <>
                  {signups.map((p) => {
                    const galleryCount = portfolioFilledCount(
                      p.portfolioPhotos ?? [],
                    );
                    const comcardReady = comcardTabMeta(p).ready;
                    const floorName = pendingFloorNickname(p);
                    const legalName = pendingLegalIcName(p);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={cn(
                          'iz-approvals-list-item',
                          selectedSignupId === p.id && 'on',
                        )}
                        onClick={() => setSelectedSignupId(p.id)}
                      >
                        <ApprovalsAvatar name={floorName} id={p.id} size="sm" />
                        <div className="min-w-0 flex-1">
                          <span className="name">{floorName}</span>
                          <span className="sub">
                            {legalName ? `Legal · ${legalName} · ` : ''}
                            {p.languages}
                          </span>
                          <span className="badges">
                            <VerificationBadge
                              ok={!!p.hasIcPhotos}
                              label="IC"
                            />
                            <VerificationBadge
                              ok={!!p.hasSelfie}
                              label="Selfie"
                            />
                            <VerificationBadge
                              ok={galleryCount > 0}
                              label="Gallery"
                              count={galleryCount}
                            />
                            <VerificationBadge
                              ok={comcardReady}
                              label="Comcard"
                              variant="comcard"
                            />
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  {agencyLinkRequests.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      className={cn(
                        'iz-approvals-list-item',
                        selectedSignupId === l.id && 'on',
                      )}
                      onClick={() => setSelectedSignupId(l.id)}
                    >
                      <ApprovalsAvatar name={l.prName} id={l.id} size="sm" />
                      <div className="min-w-0 flex-1">
                        <span className="name">{l.prName}</span>
                        <span className="sub">
                          Wants to link · {l.requestedAt}
                        </span>
                        <span className="badges">
                          <span className="iz-approvals-verify-badge gallery">
                            Link request
                          </span>
                        </span>
                      </div>
                    </button>
                  ))}
                </>
              )
            ) : cutlostRequests.length === 0 ? (
              <p className="iz-tiny iz-muted px-1 py-4 text-center">
                No cutlost requests
              </p>
            ) : (
              cutlostRequests.map((req) => (
                <button
                  key={req.id}
                  type="button"
                  className={cn(
                    'iz-approvals-list-item',
                    selectedCutlostId === req.id && 'on',
                  )}
                  onClick={() => setSelectedCutlostId(req.id)}
                >
                  <span className="iz-approvals-cutlost-icon sm">
                    {req.kind === 'best_effort' ? (
                      <Sparkles className="h-3.5 w-3.5" />
                    ) : req.kind === 'release_prs' ? (
                      <UserMinus className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="name">{req.outletName}</span>
                    <span className="sub">{cutlostRequestTitle(req)}</span>
                    <span className="badges">
                      <span className="iz-approvals-verify-badge gallery">
                        ~RM{' '}
                        {Math.round(req.estimatedSavings).toLocaleString(
                          'en-MY',
                        )}
                      </span>
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="iz-approvals-detail">
          {tab === 'signups' ? (
            selectedSignup ? (
              <SignupDetailPanel
                signup={selectedSignup}
                onApprove={() => approvePendingPR(selectedSignup.id)}
                onReject={(reason) =>
                  rejectPendingPR(selectedSignup.id, reason)
                }
              />
            ) : selectedLink ? (
              <LinkRequestDetailPanel
                link={selectedLink}
                onApprove={() => approveAgencyLink(selectedLink.id)}
                onReject={() => rejectAgencyLink(selectedLink.id)}
              />
            ) : (
              <div className="iz-approvals-empty">
                <p className="iz-sm iz-muted">Select a sign-up to review</p>
              </div>
            )
          ) : selectedCutlost ? (
            <CutlostDetailPanel
              req={selectedCutlost}
              onApprove={() => approveCutlostRequest(selectedCutlost.id)}
              onReject={(reason) =>
                rejectCutlostRequest(selectedCutlost.id, reason)
              }
            />
          ) : (
            <div className="iz-approvals-empty">
              <p className="iz-sm iz-muted">
                Select a cutlost request to review
              </p>
            </div>
          )}
        </main>
      </div>

      {addOpen && (
        <IzSheet open onClose={() => setAddOpen(false)}>
          <div className="iz-sheet-head">
            <div>
              <button
                type="button"
                className="iz-chip mb-2 !px-2 !py-1 !text-[10px]"
                onClick={() => setAddOpen(false)}
              >
                ← Back
              </button>
              <h3>Owner-initiated onboarding</h3>
            </div>
            <button
              type="button"
              className="iz-sheet-close"
              onClick={() => setAddOpen(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="iz-tiny iz-muted mb-3">
            Enter IC + contact → invite sent to complete profile
          </p>
          {(['name', 'ic', 'mobile', 'email'] as const).map((field) => (
            <div key={field} className="mb-2">
              <span className="iz-field-label capitalize">{field}</span>
              <input
                className="iz-field-input !text-sm"
                value={invite[field]}
                onChange={(e) =>
                  setInvite((v) => ({ ...v, [field]: e.target.value }))
                }
              />
            </div>
          ))}
          <button
            type="button"
            className="iz-btn iz-btn-primary mt-2 w-full"
            disabled={!invite.name || !invite.ic}
            onClick={() => {
              invitePendingPR(invite);
              setAddOpen(false);
              setInvite({ name: '', ic: '', mobile: '', email: '' });
            }}
          >
            Send invite
          </button>
        </IzSheet>
      )}
    </div>
  );
}
