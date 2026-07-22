import { IzPill } from '@agency-portal/components/iz/ui';
import {
  PortfolioComcardVisual,
  StaticComcardVisual,
  canGeneratePortfolioComcard,
  portfolioPhotosForComcard,
} from '@agency-portal/components/pr/PortfolioComcardVisual';
import { getComcardDemoStyle } from '@agency-portal/lib/comcard-demo';
import { publicAssetPath } from '@agency-portal/lib/public-asset';
import { cn } from '@agency-portal/lib/utils';
import type { ReactNode } from 'react';

export type ComcardPreviewData = {
  id?: string;
  name: string;
  height: number;
  weight?: number;
  age: number;
  avatarPhoto?: string | null;
  comcardImageUrl?: string | null;
  portfolioPhotos?: (string | null)[];
};

const DEFAULT_WEIGHT = 52;

export function comcardWeight(weight?: number) {
  return weight ?? DEFAULT_WEIGHT;
}

function ComcardFigure({
  style,
  compact,
}: {
  style: ReturnType<typeof getComcardDemoStyle>;
  compact?: boolean;
}) {
  return (
    <div
      className="iz-comcard-3d-preview-figure"
      style={{
        transform: `rotate(${style.poseDeg}deg) scale(${compact ? style.figureScale * 0.92 : style.figureScale})`,
        ['--cc-skin' as string]: style.skin,
        ['--cc-hair' as string]: style.hair,
        ['--cc-outfit' as string]: style.outfit,
        ['--cc-outfit-accent' as string]: style.outfitAccent,
      }}
      aria-hidden
    >
      <div className="iz-comcard-3d-preview-hair" />
      <div className="iz-comcard-3d-preview-head" />
      <div className="iz-comcard-3d-preview-torso" />
    </div>
  );
}

function ComcardStage({
  pr,
  variant = 'full',
}: {
  pr: ComcardPreviewData;
  variant?: 'thumb' | 'card' | 'full';
}) {
  const style = getComcardDemoStyle(pr.id, pr.name);
  const weight = comcardWeight(pr.weight);
  const compact = variant === 'thumb';
  const showPlate = variant !== 'thumb';

  return (
    <div
      className="iz-comcard-3d-preview-stage"
      style={{
        background: `linear-gradient(145deg, ${style.bgFrom} 0%, ${style.bgMid} 52%, ${style.bgTo} 100%)`,
      }}
    >
      {showPlate && (
        <>
          <div className="iz-comcard-3d-preview-plate">
            {(pr.name.trim().slice(0, 12) || style.plate).toUpperCase()}
          </div>
          <div className="iz-comcard-3d-preview-floor" aria-hidden />
        </>
      )}
      <ComcardFigure style={style} compact={compact} />
      {showPlate && (
        <div className="iz-comcard-3d-preview-measures">
          {pr.height}cm · {weight}kg · {pr.age}y
        </div>
      )}
      {variant === 'full' && (
        <IzPill
          variant="violet"
          className="iz-comcard-3d-preview-badge !py-0.5 !text-[9px]"
        >
          3D Comcard
        </IzPill>
      )}
    </div>
  );
}

export function Comcard3dPreviewThumb({
  pr,
  className,
}: {
  pr?: ComcardPreviewData;
  className?: string;
}) {
  const fallback: ComcardPreviewData = { name: 'PR', height: 165, age: 24 };
  const data = pr ?? fallback;
  // Tiny thumbs must stay a single <img> — never mount PortfolioComcardVisual
  // here (its text overlay fills the crop and looks like a broken comcard).
  const thumbPhoto =
    data.comcardImageUrl ||
    data.avatarPhoto ||
    data.portfolioPhotos?.find((src): src is string => Boolean(src)) ||
    null;

  if (thumbPhoto) {
    return (
      <div
        className={cn(
          'iz-comcard-3d-preview iz-comcard-3d-preview--thumb iz-comcard-3d-preview--thumb-photo overflow-hidden',
          className,
        )}
      >
        <img
          src={publicAssetPath(thumbPhoto)}
          alt=""
          className="iz-comcard-3d-preview--thumb-photo__img"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'iz-comcard-3d-preview iz-comcard-3d-preview--thumb',
        className,
      )}
    >
      <ComcardStage pr={data} variant="thumb" />
    </div>
  );
}

export type ComcardPreviewCardMeta = {
  trainingLevel?: string;
  rating?: number;
  languages?: string[];
  place?: string;
};

/** Grid-card visual only — photo comcard, portfolio collage, or 3D stage (no footer meta). */
export function ComcardGridVisual({
  pr,
  className,
}: {
  pr: ComcardPreviewData;
  className?: string;
}) {
  const portfolio = pr.portfolioPhotos ?? [];

  if (pr.comcardImageUrl) {
    return (
      <StaticComcardVisual
        src={pr.comcardImageUrl}
        className={cn(
          'iz-comcard-grid-visual iz-comcard-grid-visual--photo',
          className,
        )}
      />
    );
  }

  if (canGeneratePortfolioComcard(portfolio)) {
    return (
      <PortfolioComcardVisual
        photos={portfolioPhotosForComcard(portfolio)}
        pr={pr}
        className={cn(
          'iz-comcard-grid-visual iz-comcard-grid-visual--portfolio',
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        'iz-comcard-3d-preview iz-comcard-3d-preview--card iz-comcard-3d-preview--card-compact iz-comcard-grid-visual',
        className,
      )}
    >
      <ComcardStage pr={pr} variant="card" />
    </div>
  );
}

/** Grid-card identity preview — 3D figure, name plate, and key profile cues */
export function Comcard3dPreviewCard({
  pr,
  trainingLevel,
  rating,
  languages = [],
  place,
  className,
}: {
  pr: ComcardPreviewData;
  trainingLevel?: string;
  rating?: number;
  languages?: string[];
  place?: string;
  className?: string;
}) {
  const langLine = languages.filter(Boolean).slice(0, 2).join(' · ');

  return (
    <div
      className={cn(
        'iz-comcard-3d-preview iz-comcard-3d-preview--card iz-comcard-3d-preview--card-compact',
        className,
      )}
    >
      {pr.comcardImageUrl ? (
        <StaticComcardVisual src={pr.comcardImageUrl} className="!w-full" />
      ) : canGeneratePortfolioComcard(pr.portfolioPhotos ?? []) ? (
        <PortfolioComcardVisual
          photos={portfolioPhotosForComcard(pr.portfolioPhotos ?? [])}
          pr={pr}
          className="!w-full"
        />
      ) : (
        <ComcardStage pr={pr} variant="card" />
      )}
      <div className="iz-comcard-3d-preview-card-meta">
        <div className="flex items-center justify-between gap-1">
          <p className="min-w-0 truncate font-sora text-[11px] font-bold leading-tight text-[var(--iz-txt)]">
            {pr.name}
          </p>
          {rating != null && (
            <IzPill variant="gold" className="shrink-0 !px-1 !py-0 !text-[8px]">
              {rating}★
            </IzPill>
          )}
        </div>
        {trainingLevel && (
          <p className="mt-0.5 truncate text-[9px] text-[var(--iz-muted2)]">
            {trainingLevel}
          </p>
        )}
        {(langLine || place) && (
          <p className="mt-0.5 line-clamp-1 text-[9px] text-[var(--iz-muted)]">
            {[langLine, place].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </div>
  );
}

function ComcardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="font-sora text-lg font-extrabold text-[var(--iz-gold-l)]">
        {value}
      </div>
      <div className="iz-tiny iz-muted2 mt-0.5 tracking-wide">{label}</div>
    </div>
  );
}

export function Comcard3dPreviewVisual({
  pr,
  className,
  showName = true,
  showStats = true,
  compact = false,
}: {
  pr: ComcardPreviewData;
  className?: string;
  showName?: boolean;
  showStats?: boolean;
  /** Tighter layout for outlet preview sheets — fits one screen without scrolling. */
  compact?: boolean;
}) {
  const weight = comcardWeight(pr.weight);
  const portfolio = pr.portfolioPhotos ?? [];
  // Compact sheets fill their frame; the Manage PR detail keeps a modest card size.
  const visualClass = compact
    ? 'iz-comcard-3d-preview--sheet__visual'
    : 'mx-auto';

  let visual: ReactNode;
  if (pr.comcardImageUrl) {
    visual = (
      <StaticComcardVisual src={pr.comcardImageUrl} className={visualClass} />
    );
  } else if (canGeneratePortfolioComcard(portfolio)) {
    visual = (
      <PortfolioComcardVisual
        photos={portfolioPhotosForComcard(portfolio)}
        pr={pr}
        className={visualClass}
      />
    );
  } else {
    visual = <ComcardStage pr={pr} variant="full" />;
  }

  return (
    <div
      className={cn(
        'iz-comcard-3d-preview',
        compact && 'iz-comcard-3d-preview--sheet',
        className,
      )}
    >
      <div className={cn(compact && 'iz-comcard-3d-preview--sheet__frame')}>
        {visual}
      </div>
      {showStats && (
        <div className="iz-comcard-3d-preview-stats">
          <ComcardStat label="HEIGHT" value={`${pr.height} cm`} />
          <ComcardStat label="WEIGHT" value={`${weight} kg`} />
          <ComcardStat label="AGE" value={String(pr.age)} />
        </div>
      )}
      {showName && (
        <p className="iz-tiny iz-muted mt-2 text-center truncate">{pr.name}</p>
      )}
    </div>
  );
}
