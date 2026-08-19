import { IzPill } from "@agency-portal/components/iz/ui";
import {
	canGeneratePortfolioComcard,
	PortfolioComcardVisual,
	portfolioPhotosForComcard,
	StaticComcardVisual,
} from "@agency-portal/components/pr/PortfolioComcardVisual";
import { getComcardDemoStyle } from "@agency-portal/lib/comcard-demo";
import { prPhotoSrc } from "@agency-portal/lib/public-asset";
import { cn } from "@agency-portal/lib/utils";
import type { ReactNode } from "react";
import { COMCARD_LOCALE } from "@/lib/portal-i18n/comcard-locale";

/** Languages the compact grid comcard shows before collapsing into "+N". */
const MAX_CARD_LANGUAGES = 2;

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

/**
 * One comcard measurement, or an em-dash when the account does not carry it.
 *
 * This replaces `comcardWeight()`, which substituted a hardcoded 52 kg. That
 * default is how the agency's card came to show a body the PR never entered —
 * her own profile read blank while Manage PR read "52kg", and nobody could tell
 * which screen was lying. A measurement is either on the account or it is not.
 * `0` is the mapper's spelling of "not set" (see pr-personnel-map.ts), so a
 * falsy value renders as the dash rather than as a number.
 */
export function comcardMeasure(
	value: number | null | undefined,
	unit = "",
): string {
	return value ? `${value}${unit}` : "—";
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
				["--cc-skin" as string]: style.skin,
				["--cc-hair" as string]: style.hair,
				["--cc-outfit" as string]: style.outfit,
				["--cc-outfit-accent" as string]: style.outfitAccent,
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
	variant = "full",
}: {
	pr: ComcardPreviewData;
	variant?: "thumb" | "card" | "full";
}) {
	const style = getComcardDemoStyle(pr.id, pr.name);
	const compact = variant === "thumb";
	const showPlate = variant !== "thumb";

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
					{comcardMeasure(pr.height, "cm")} · {comcardMeasure(pr.weight, "kg")}{" "}
					· {comcardMeasure(pr.age, "y")}
				</div>
			)}
			{variant === "full" && (
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
	// No PR passed at all — we know nothing, so we claim nothing. 0 renders as an
	// em-dash; the old { height: 165, age: 24 } literal drew a plausible stranger.
	const fallback: ComcardPreviewData = { name: "PR", height: 0, age: 0 };
	const data = pr ?? fallback;
	// Tiny thumbs must stay a single <img> — never mount PortfolioComcardVisual
	// here (its text overlay fills the crop and looks like a broken comcard).
	const thumbPhoto =
		data.comcardImageUrl ||
		data.avatarPhoto ||
		data.portfolioPhotos?.find((src): src is string => Boolean(src)) ||
		null;

	// `prPhotoSrc`, not `publicAssetPath`: a stored photo is an R2 OBJECT KEY
	// (`user/<id>/comcard/<uuid>.jpg`), and prefixing that with the Vite base
	// produces a URL nothing serves. The mapper already resolves the keys it
	// returns, but a caller that builds ComcardPreviewData by hand does not — so
	// the resolver belongs at the <img>, where it can never be skipped.
	const thumbSrc = prPhotoSrc(thumbPhoto);
	if (thumbSrc) {
		return (
			<div
				className={cn(
					"iz-comcard-3d-preview iz-comcard-3d-preview--thumb iz-comcard-3d-preview--thumb-photo overflow-hidden",
					className,
				)}
			>
				<img
					src={thumbSrc}
					alt=""
					className="iz-comcard-3d-preview--thumb-photo__img"
				/>
			</div>
		);
	}

	return (
		<div
			className={cn(
				"iz-comcard-3d-preview iz-comcard-3d-preview--thumb",
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
					"iz-comcard-grid-visual iz-comcard-grid-visual--photo",
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
					"iz-comcard-grid-visual iz-comcard-grid-visual--portfolio",
					className,
				)}
				// Grid cards own the top-right corner for their Active/Inactive pill.
				// The badge sat on top of it and hid the PR's status.
				showBadge={false}
			/>
		);
	}

	return (
		<div
			className={cn(
				"iz-comcard-3d-preview iz-comcard-3d-preview--card iz-comcard-3d-preview--card-compact iz-comcard-grid-visual",
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
	// Two fit; the rest are counted, not dropped. This was a bare `slice(0, 2)`
	// with nothing to say a third existed, so the same PR listed two languages
	// here and four on Manage PR.
	const allLangs = languages.filter(Boolean);
	const langLine = allLangs.slice(0, MAX_CARD_LANGUAGES).join(" · ");
	const hiddenLangs = Math.max(0, allLangs.length - MAX_CARD_LANGUAGES);

	return (
		<div
			className={cn(
				"iz-comcard-3d-preview iz-comcard-3d-preview--card iz-comcard-3d-preview--card-compact",
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
					{/* `> 0`, not `!= null`: every backend PR carries `rating: 0` as a
					    placeholder for "GET /pr returns no rating", and the old null-check
					    printed it as a gold "0★" — a score the outlet never gave. */}
					{rating != null && rating > 0 && (
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
					<p
						className="mt-0.5 line-clamp-1 text-[9px] text-[var(--iz-muted)]"
						title={allLangs.length > 0 ? allLangs.join(" · ") : undefined}
					>
						{[hiddenLangs > 0 ? `${langLine} +${hiddenLangs}` : langLine, place]
							.filter(Boolean)
							.join(" · ")}
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
	const portfolio = pr.portfolioPhotos ?? [];
	// Compact sheets fill their frame; the Manage PR detail keeps a modest card size.
	const visualClass = compact
		? "iz-comcard-3d-preview--sheet__visual"
		: "mx-auto";

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
				"iz-comcard-3d-preview",
				compact && "iz-comcard-3d-preview--sheet",
				className,
			)}
		>
			<div className={cn(compact && "iz-comcard-3d-preview--sheet__frame")}>
				{visual}
			</div>
			{showStats && (
				<div className="iz-comcard-3d-preview-stats">
					<ComcardStat
						label={COMCARD_LOCALE.managePr.statHeight}
						value={comcardMeasure(pr.height, " cm")}
					/>
					<ComcardStat
						label={COMCARD_LOCALE.managePr.statWeight}
						value={comcardMeasure(pr.weight, " kg")}
					/>
					<ComcardStat
						label={COMCARD_LOCALE.managePr.statAge}
						value={comcardMeasure(pr.age)}
					/>
				</div>
			)}
			{showName && (
				<p className="iz-tiny iz-muted mt-2 text-center truncate">{pr.name}</p>
			)}
		</div>
	);
}
