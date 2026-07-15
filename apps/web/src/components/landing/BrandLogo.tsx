import { LANDING_IMAGES } from "@/lib/landing-assets";

const LOGO_SRC = LANDING_IMAGES.innocenzLogo;
const LOGO_INTRINSIC = { width: 447, height: 434 } as const;

const markClass =
	"shrink-0 rounded-full object-contain object-center ring-2 ring-gold/45 shadow-[0_0_28px_color-mix(in_oklab,var(--royal-gold)_25%,transparent)]";

const sizes = {
	sm: {
		mark: "h-16 w-16",
		wordmark: "text-[1.875rem]",
		tagline: "text-[13px]",
		motto: "text-[13px]",
	},
	md: {
		mark: "h-[5.5rem] w-[5.5rem]",
		wordmark: "text-[2.5rem]",
		tagline: "text-sm",
		motto: "text-sm",
	},
	lg: {
		mark: "h-40 w-40 sm:h-44 sm:w-44",
		wordmark: "text-[3.75rem] sm:text-[4.25rem]",
		tagline: "text-base sm:text-lg",
		motto: "text-lg sm:text-xl",
	},
	hero: {
		mark: "h-48 w-48 sm:h-52 sm:w-52",
		wordmark: "text-[4rem] sm:text-[4.5rem]",
		tagline: "text-[1.3125rem] sm:text-[1.4375rem]",
		motto: "text-[1.4375rem] sm:text-[1.5625rem]",
	},
} as const;

const wordmarkClass =
	"text-gradient-royal drop-shadow-[0_0_22px_color-mix(in_oklab,var(--royal-gold)_35%,transparent)]";

function Wordmark({ className = "" }: { className?: string }) {
	return (
		<span className={`brand-wordmark ${wordmarkClass} ${className}`}>
			InnocenZ
		</span>
	);
}

type BrandLogoProps = {
	variant?: "horizontal" | "stacked";
	size?: keyof typeof sizes;
	showTagline?: boolean;
	showMotto?: boolean;
	className?: string;
};

export function BrandLogo({
	variant = "horizontal",
	size = "md",
	showTagline = false,
	showMotto = false,
	className = "",
}: BrandLogoProps) {
	const s = sizes[size];

	if (variant === "stacked") {
		return (
			<div className={`flex flex-col items-center text-center ${className}`}>
				<img
					src={LOGO_SRC}
					alt="InnocenZ crown badge"
					width={LOGO_INTRINSIC.width}
					height={LOGO_INTRINSIC.height}
					decoding="async"
					className={`${s.mark} ${markClass}`}
				/>
				<Wordmark className={`mt-5 ${s.wordmark}`} />
				{showMotto && (
					<p className={`brand-motto mt-4 text-lavender/90 ${s.motto}`}>
						Connect · Engage · Entertain
					</p>
				)}
				{showTagline && (
					<p className={`brand-tagline mt-3 text-lavender/75 ${s.tagline}`}>
						Crowned nightlife
					</p>
				)}
			</div>
		);
	}

	return (
		<div className={`flex items-center gap-3.5 ${className}`}>
			<img
				src={LOGO_SRC}
				alt="InnocenZ crown badge"
				width={LOGO_INTRINSIC.width}
				height={LOGO_INTRINSIC.height}
				decoding="async"
				className={`${s.mark} ${markClass}`}
			/>
			<div className="flex flex-col">
				<Wordmark className={s.wordmark} />
				{showMotto && (
					<p className={`brand-motto mt-2 text-gold-bright/90 ${s.motto}`}>
						Connect · Engage · Entertain
					</p>
				)}
				{showTagline && (
					<p
						className={`brand-tagline mt-1.5 text-gold-bright/70 ${s.tagline}`}
					>
						Crowned nightlife
					</p>
				)}
			</div>
		</div>
	);
}
