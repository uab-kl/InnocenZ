import { BrandLogo } from "@/components/landing/BrandLogo";
import { cn } from "@/lib/utils";

type PortalGateLoadingProps = {
	/** Admin uses the light app background; agency/outlet use the dark portal shell. */
	variant?: "admin" | "portal";
	className?: string;
};

/** Full-viewport brand splash while client portal auth is resolving. */
export function PortalGateLoading({
	variant = "admin",
	className,
}: PortalGateLoadingProps) {
	const isPortal = variant === "portal";
	return (
		<div
			className={cn(
				"relative flex min-h-svh w-full flex-col items-center justify-center overflow-hidden px-6",
				isPortal
					? "bg-[#0e0a1a] text-white/70"
					: "bg-background text-muted-foreground",
				className,
			)}
			role="status"
			aria-live="polite"
			aria-label="Loading"
		>
			{isPortal ? (
				<div className="pointer-events-none absolute inset-0" aria-hidden>
					<div className="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-[rgba(183,156,232,0.16)] blur-2xl" />
					<div className="absolute left-[-4rem] top-[38%] h-52 w-52 rounded-full bg-[rgba(227,184,119,0.1)] blur-2xl" />
					<div className="absolute bottom-[-5rem] right-8 h-60 w-60 rounded-full bg-[rgba(155,126,217,0.12)] blur-2xl" />
					<div className="absolute inset-0 bg-[rgba(20,17,32,0.35)]" />
				</div>
			) : (
				<div className="pointer-events-none absolute inset-0" aria-hidden>
					<div className="absolute inset-0 bg-[radial-gradient(900px_500px_at_50%_-10%,color-mix(in_oklab,var(--primary)_12%,transparent),transparent_60%)]" />
				</div>
			)}

			<div className="relative z-10 flex w-full max-w-[18rem] flex-col items-center">
				<div
					className={cn(
						"mb-1 animate-[iz-boot-pulse_2.2s_ease-in-out_infinite]",
						isPortal && "drop-shadow-[0_0_28px_rgba(183,156,232,0.25)]",
					)}
				>
					<BrandLogo variant="stacked" size="sm" />
				</div>

				<p
					className={cn(
						"mt-5 text-sm font-medium tracking-wide",
						isPortal ? "text-white/55" : "text-muted-foreground",
					)}
				>
					Getting things ready…
				</p>

				<div
					className={cn(
						"relative mt-6 h-[3px] w-40 overflow-hidden rounded-full",
						isPortal ? "bg-white/10" : "bg-muted",
					)}
				>
					<span
						className={cn(
							"absolute inset-y-0 w-2/5 rounded-full animate-[iz-boot-bar_1.6s_ease-in-out_infinite]",
							isPortal ? "bg-[#b79ce8]" : "bg-primary",
						)}
					/>
				</div>
			</div>

			<style>{`
				@keyframes iz-boot-pulse {
					0%, 100% { transform: scale(1); opacity: 1; }
					50% { transform: scale(1.03); opacity: 0.92; }
				}
				@keyframes iz-boot-bar {
					0% { left: -40%; }
					100% { left: 100%; }
				}
			`}</style>
		</div>
	);
}
