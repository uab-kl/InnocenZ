import { BrandLogo } from "@/components/landing/BrandLogo";
import {
	PortalLocaleProvider,
	usePortalLocale,
} from "@/lib/portal-i18n/context";
import { cn } from "@/lib/utils";

type PortalGateLoadingProps = {
	/** Admin uses the light app background; agency/outlet use the dark portal shell. */
	variant?: "admin" | "portal";
	className?: string;
	/** A failed profile lookup can be retried without opening the portal gate. */
	onRetry?: () => void;
	retrying?: boolean;
};

/**
 * Full-viewport brand splash while client portal auth is resolving.
 *
 * It carries its OWN locale provider because of WHEN it renders: every one of
 * its three call sites returns it INSTEAD of the shell that mounts
 * `PortalLocaleProvider`, so an un-provided consumer here would fall back to
 * English and pin the splash to English for a reader who already picked 中文.
 * Nesting is harmless if a caller ever moves it inside a shell — both providers
 * read the same stored locale.
 *
 * No `accountLocale`: the profile has not loaded yet at this point, which is
 * the whole reason this screen exists. The browser's remembered pick is the
 * only answer available, and it is the right one.
 */
export function PortalGateLoading(props: PortalGateLoadingProps) {
	return (
		<PortalLocaleProvider>
			<PortalGateLoadingBody {...props} />
		</PortalLocaleProvider>
	);
}

function PortalGateLoadingBody({
	variant = "admin",
	className,
	onRetry,
	retrying = false,
}: PortalGateLoadingProps) {
	const { t } = usePortalLocale();
	const isPortal = variant === "portal";
	return (
		<output
			className={cn(
				"relative flex min-h-svh w-full flex-col items-center justify-center overflow-hidden px-6",
				isPortal
					? "bg-[#0b0a0d] text-[#bdb6ad]"
					: "bg-[#0b0a0d] text-[#bdb6ad]",
				className,
			)}
			aria-live="polite"
			aria-label={onRetry ? t.chooseOrg.failed : t.webShell.loadingLabel}
		>
			{isPortal ? (
				<div className="pointer-events-none absolute inset-0" aria-hidden>
					<div className="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-[rgba(255,95,158,0.10)] blur-2xl" />
					<div className="absolute left-[-4rem] top-[38%] h-52 w-52 rounded-full bg-[rgba(203,176,137,0.07)] blur-2xl" />
					<div className="absolute bottom-[-5rem] right-8 h-60 w-60 rounded-full bg-[rgba(122,107,255,0.08)] blur-2xl" />
					<div className="absolute inset-0 bg-[rgba(11,10,13,0.35)]" />
				</div>
			) : (
				<div className="pointer-events-none absolute inset-0" aria-hidden>
					<div className="absolute inset-0 bg-[radial-gradient(900px_500px_at_50%_-10%,color-mix(in_oklab,#ff5f9e_10%,transparent),transparent_60%)]" />
				</div>
			)}

			<div className="relative z-10 flex w-full max-w-[18rem] flex-col items-center">
				{/*
				  Both loops run ONLY when the reader allows motion (`motion-safe:`).
				  Under reduced motion the logo rests, and the bar's moving segment is
				  not drawn at all (`motion-reduce:hidden`): the still, empty track
				  and the "getting ready" line say it is loading. A segment frozen
				  mid-track would read as progress stuck at 40%, and a full one as
				  "done" — an empty track claims no amount either way.
				*/}
				<div
					className={cn(
						"mb-1 motion-safe:animate-[iz-boot-pulse_2.2s_ease-in-out_infinite]",
						isPortal && "drop-shadow-[0_0_28px_rgba(203,176,137,0.22)]",
					)}
				>
					<BrandLogo variant="stacked" size="sm" />
				</div>

				<p
					className={cn(
						"mt-5 text-center text-sm font-medium tracking-wide",
						"text-[#bdb6ad]",
					)}
				>
					{onRetry ? t.chooseOrg.failed : t.webShell.gettingReady}
				</p>

				{onRetry ? (
					<button
						type="button"
						onClick={onRetry}
						disabled={retrying}
						className={cn(
							"mt-6 min-h-11 w-full rounded-lg px-4 py-3 text-base font-semibold disabled:opacity-60",
							"bg-[#cbb089] text-[#1c160e] hover:bg-[#d6bd99]",
						)}
					>
						{retrying ? t.common.loading : t.common.retry}
					</button>
				) : (
					<div
						className={cn(
							"relative mt-6 h-[3px] w-40 overflow-hidden rounded-full",
							"bg-white/10",
						)}
					>
						<span
							className={cn(
								"absolute inset-y-0 left-0 w-2/5 rounded-full motion-safe:animate-[iz-boot-bar_1.6s_ease-in-out_infinite] motion-reduce:hidden",
								"bg-[#cbb089]",
							)}
						/>
					</div>
				)}
			</div>

			<style>{`
				@keyframes iz-boot-pulse {
					0%, 100% { transform: scale(1); opacity: 1; }
					50% { transform: scale(1.03); opacity: 0.92; }
				}
				/* A transform, not left, so the loop never lays the page out again.
				   Same path as the old left: -40% → 100% of the track: translateX
				   percentages are of the SEGMENT (2/5 of the track), so -100% of it
				   is -40% of the track and 250% of it is 100%. */
				@keyframes iz-boot-bar {
					0% { transform: translateX(-100%); }
					100% { transform: translateX(250%); }
				}
			`}</style>
		</output>
	);
}
