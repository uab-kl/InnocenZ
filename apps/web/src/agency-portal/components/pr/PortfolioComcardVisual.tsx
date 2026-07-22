import {
  comcardWeight,
  type ComcardPreviewData,
} from '@agency-portal/components/agency/Comcard3dPreview';
import { publicAssetPath } from '@agency-portal/lib/public-asset';
import { cn } from '@agency-portal/lib/utils';
import { useState } from 'react';

function portfolioImageSrc(src: string) {
  return src.startsWith('data:') ? src : publicAssetPath(src);
}

/** First four filled portfolio slots — used for the photo comcard grid */
export function portfolioPhotosForComcard(
  portfolio: (string | null)[],
): string[] {
  return portfolio.filter((src): src is string => Boolean(src)).slice(0, 4);
}

export function canGeneratePortfolioComcard(
  portfolio: (string | null)[],
): boolean {
  return portfolioPhotosForComcard(portfolio).length >= 4;
}

export function StaticComcardVisual({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  return (
    <div className={cn('iz-static-comcard', className)}>
      <img
        src={portfolioImageSrc(src)}
        alt="PR comcard"
        className="iz-static-comcard__img"
      />
    </div>
  );
}

/** Compact comcard for PR picker cards — falls back to emoji avatar. */
export function PrComcardPickerThumb({
  comcardImageUrl,
  avatar,
  name,
}: {
  comcardImageUrl?: string | null;
  avatar: string;
  name: string;
}) {
  if (comcardImageUrl) {
    return (
      <StaticComcardVisual
        src={comcardImageUrl}
        className="iz-static-comcard--picker"
      />
    );
  }
  return (
    <div className="flex aspect-[3/4] w-full items-center justify-center rounded-[10px] bg-[var(--iz-violet-ink)] text-4xl">
      <span aria-hidden>{avatar}</span>
      <span className="sr-only">{name}</span>
    </div>
  );
}

function PortfolioComcardCell({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="iz-portfolio-comcard__cell">
      {!failed && (
        <img
          src={portfolioImageSrc(src)}
          alt=""
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

export function PortfolioComcardVisual({
  photos,
  pr,
  className,
}: {
  photos: string[];
  pr: ComcardPreviewData;
  className?: string;
}) {
  const weight = comcardWeight(pr.weight);
  const grid = photos.slice(0, 4);

  return (
    <div className={cn('iz-portfolio-comcard', className)}>
      <div className="iz-portfolio-comcard__frame">
        <div className="iz-portfolio-comcard__grid" aria-hidden={false}>
          {grid.map((src, i) => (
            <PortfolioComcardCell key={`${src}-${i}`} src={src} />
          ))}
        </div>
        <div className="iz-portfolio-comcard__overlay">
          <p className="iz-portfolio-comcard__name">{pr.name}</p>
          <p className="iz-portfolio-comcard__line">Age {pr.age}</p>
          <p className="iz-portfolio-comcard__line">
            {pr.height}cm · {weight}kg
          </p>
        </div>
        <span className="iz-portfolio-comcard__badge">Photo Comcard</span>
      </div>
    </div>
  );
}

/** Gallery tile that disappears if the asset 404s (deleted upload, etc.). */
export function PortfolioGalleryTile({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div
      className={cn(
        'aspect-square overflow-hidden rounded-lg border border-[var(--iz-line)]',
        className,
      )}
    >
      <img
        src={portfolioImageSrc(src)}
        alt=""
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
