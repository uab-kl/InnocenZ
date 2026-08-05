import {
	type ComcardPreviewData,
	comcardWeight,
} from "@agency-portal/components/agency/Comcard3dPreview";
import { publicAssetPath } from "@agency-portal/lib/public-asset";
import { cn } from "@agency-portal/lib/utils";
import { useState } from "react";

function portfolioImageSrc(src: string) {
	return src.startsWith("data:") ? src : publicAssetPath(src);
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
		<div className={cn("iz-static-comcard", className)}>
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
	pr,
}: {
	comcardImageUrl?: string | null;
	avatar: string;
	name: string;
	/** Identity + portfolio, so a PR with no SAVED comcard still gets one built. */
	pr?: ComcardPreviewData;
}) {
	if (comcardImageUrl) {
		return (
			<StaticComcardVisual
				src={comcardImageUrl}
				className="iz-static-comcard--picker"
			/>
		);
	}
	// Same fallback chain the agency comcard screens use: a saved comcard, else one
	// generated from four portfolio photos. Only handling the saved case made every
	// PR who had never exported a comcard look like a PR with no photos at all.
	const portfolio = pr?.portfolioPhotos ?? [];
	if (pr && canGeneratePortfolioComcard(portfolio)) {
		// Deliberately NOT <PortfolioComcardVisual/> — its overlay and "Photo
		// Comcard" badge are sized for a full-width card, and at picker size they
		// swallow the photos. This is the same 2×2 grid with a compact label, so a
		// generated comcard sits next to a SAVED one (which already has its label
		// baked in small) without one shouting louder than the other.
		return (
			<div
				className="relative aspect-[3/4] w-full overflow-hidden rounded-[10px] bg-[var(--iz-violet-ink)]"
				// The label is sized in `cqw`, so it scales with the CARD rather than
				// sitting at a fixed px size. A saved comcard's label is baked into the
				// image and shrinks with it; fixed-px DOM text does not, which is why the
				// generated card's caption dwarfed the saved one's at picker size.
				style={{ containerType: "inline-size" }}
			>
				<div className="iz-portfolio-comcard__grid">
					{portfolioPhotosForComcard(portfolio).map((src, i) => (
						<PortfolioComcardCell key={`${src}-${i}`} src={src} />
					))}
				</div>
				<div
					className="absolute left-1/2 top-1/2 max-w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-[2px] bg-white/95 text-center shadow-[0_4px_12px_rgba(0,0,0,0.35)]"
					style={{ fontSize: "4.4cqw", padding: "0.45em 0.6em" }}
				>
					<p className="truncate font-sora font-extrabold leading-tight tracking-wide text-[#111]">
						{pr.name}
					</p>
					<p
						className="font-semibold leading-tight text-[#222]"
						style={{ fontSize: "0.8em", marginTop: "0.15em" }}
					>
						Age {pr.age}
					</p>
					<p
						className="whitespace-nowrap font-semibold leading-tight text-[#222]"
						style={{ fontSize: "0.8em" }}
					>
						{pr.height}cm · {comcardWeight(pr.weight)}kg
					</p>
				</div>
			</div>
		);
	}
	// Nothing to build one from. Say so — a stand-in portrait here would read as
	// "this is their comcard" when the PR has never uploaded a single photo.
	return (
		<div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-1 rounded-[10px] bg-[var(--iz-violet-ink)]">
			<span aria-hidden className="text-3xl leading-none">
				{avatar}
			</span>
			<span className="text-[9px] leading-tight text-[var(--iz-muted)]">
				No comcard yet
			</span>
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
	showBadge = true,
}: {
	photos: string[];
	pr: ComcardPreviewData;
	className?: string;
	/**
	 * The badge sits top-right. Grid cards put their own status pill in that
	 * corner and the badge (z-index 3) covered it, so those callers turn it off.
	 */
	showBadge?: boolean;
}) {
	const weight = comcardWeight(pr.weight);
	const grid = photos.slice(0, 4);

	return (
		<div className={cn("iz-portfolio-comcard", className)}>
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
				{showBadge && (
					<span className="iz-portfolio-comcard__badge">Photo Comcard</span>
				)}
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
				"aspect-square overflow-hidden rounded-lg border border-[var(--iz-line)]",
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
