import {
	type ComcardPreviewData,
	comcardMeasure,
} from "@agency-portal/components/agency/Comcard3dPreview";
import { prPhotoSrc } from "@agency-portal/lib/public-asset";
import { cn } from "@agency-portal/lib/utils";
import { useState } from "react";
import { COMCARD_LOCALE } from "@/lib/portal-i18n/comcard-locale";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

/**
 * A comcard photo is a stored R2 OBJECT KEY, a demo /public path, or a data
 * URL. This used to call `publicAssetPath` for anything that was not a data
 * URL, which leaves `user/<id>/comcard/<uuid>.jpg` untouched and prefixes the
 * Vite base — a broken image for every real PR whose caller had not already
 * resolved the key. `prPhotoSrc` handles all three kinds.
 */
function portfolioImageSrc(src: string) {
	return prPhotoSrc(src) ?? undefined;
}

/** First four filled portfolio slots — used for the photo comcard grid */
export function portfolioPhotosForComcard(
	portfolio: (string | null)[],
): string[] {
	return portfolio.filter((src): src is string => Boolean(src)).slice(0, 4);
}

/**
 * 3 photos are enough (owner's rule, 13 Aug 2026): a tri-layout comcard —
 * one big photo left, two stacked right, details plate centred as usual —
 * matches how real printed comcards are laid out. Below 3 there is no grid
 * worth building, so the caller falls back to its avatar/silhouette.
 */
export function canGeneratePortfolioComcard(
	portfolio: (string | null)[],
): boolean {
	return portfolioPhotosForComcard(portfolio).length >= 3;
}

/** The 3-photo card gets the tri layout; 4+ keeps the 2×2 grid. */
export function portfolioComcardGridClass(count: number): string {
	return cn(
		"iz-portfolio-comcard__grid",
		count === 3 && "iz-portfolio-comcard__grid--tri",
	);
}

export function StaticComcardVisual({
	src,
	className,
}: {
	src: string;
	className?: string;
}) {
	// The card's own COPY stays English (COMCARD_LOCALE) — this alt text is not
	// on the card. It is never screenshotted, printed or forwarded; it is what a
	// screen reader announces to THIS viewer, so it follows their language.
	const { t } = usePortalLocale();
	return (
		<div className={cn("iz-static-comcard", className)}>
			<img
				src={portfolioImageSrc(src)}
				alt={t.prMedia.prComcardAlt}
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
	// The empty state below is PICKER chrome, not comcard copy, so it reads the
	// viewer's dictionary. Everything drawn ON the card keeps COMCARD_LOCALE.
	const { t } = usePortalLocale();
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
	const gridPhotos = portfolioPhotosForComcard(portfolio);
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
				<div className={portfolioComcardGridClass(gridPhotos.length)}>
					{gridPhotos.map((src) => (
						<PortfolioComcardCell key={src} src={src} />
					))}
				</div>
				{/* Frosted at the same 0.62 + 8px blur as `.iz-portfolio-comcard__overlay`
				    and the two PNG generators. The plate is inline rather than the shared
				    class only because its type scales in `cqw`; the GLASS must not drift. */}
				<div
					className="absolute left-1/2 top-1/2 w-max min-w-[25cqw] max-w-[76%] -translate-x-1/2 -translate-y-1/2 rounded-[2px] bg-white/[0.62] text-center shadow-[0_4px_12px_rgba(0,0,0,0.35)] backdrop-blur-[8px]"
					// Same geometry as `.iz-portfolio-comcard__overlay`, which in turn
					// tracks the generated PNG (a 150-wide plate with 32px/21px type on a
					// 600-wide canvas), so this plate matches a SAVED comcard sitting next
					// to it in the list. `w-max` with a floor: the plate grows for a long
					// nickname, never crops it.
					style={{ fontSize: "5.33cqw", padding: "0.105em 0.501em" }}
				>
					{/* Not `truncate` — the plate widens for the name instead of cutting it. */}
					<p className="whitespace-nowrap font-sora font-extrabold leading-tight tracking-wide text-[#111]">
						{pr.name}
					</p>
					<p
						className="whitespace-nowrap font-semibold leading-tight text-[#222]"
						style={{ fontSize: "0.657em", marginTop: "0.066em" }}
					>
						{fill(COMCARD_LOCALE.managePr.ageLabel, {
							n: comcardMeasure(pr.age),
						})}
					</p>
					<p
						className="whitespace-nowrap font-semibold leading-tight text-[#222]"
						style={{ fontSize: "0.657em" }}
					>
						{comcardMeasure(pr.height, "cm")} ·{" "}
						{comcardMeasure(pr.weight, "kg")}
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
				{t.prMedia.noComcardYet}
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
	const grid = photos.slice(0, 4);

	return (
		<div className={cn("iz-portfolio-comcard", className)}>
			<div className="iz-portfolio-comcard__frame">
				<div
					className={portfolioComcardGridClass(grid.length)}
					aria-hidden={false}
				>
					{grid.map((src) => (
						<PortfolioComcardCell key={src} src={src} />
					))}
				</div>
				<div className="iz-portfolio-comcard__overlay">
					<p className="iz-portfolio-comcard__name">{pr.name}</p>
					<p className="iz-portfolio-comcard__line">
						{fill(COMCARD_LOCALE.managePr.ageLabel, {
							n: comcardMeasure(pr.age),
						})}
					</p>
					<p className="iz-portfolio-comcard__line">
						{comcardMeasure(pr.height, "cm")} ·{" "}
						{comcardMeasure(pr.weight, "kg")}
					</p>
				</div>
				{showBadge && (
					<span className="iz-portfolio-comcard__badge">
						{COMCARD_LOCALE.managePr.photoComcard}
					</span>
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
