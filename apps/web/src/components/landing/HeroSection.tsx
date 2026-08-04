import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { BrandLogo } from "@/components/landing/BrandLogo";
import { FloorConsole } from "@/components/landing/FloorConsole";
import {
	HeroBackdrop,
	HeroPortraitRing,
} from "@/components/landing/LandingImagery";
import { MaterialIcon } from "@/components/landing/MaterialIcon";
import { PortalTrustStrip } from "@/components/landing/PortalTrustStrip";

const wordVariant = {
	hidden: { opacity: 0, y: 40, rotateX: -40 },
	show: {
		opacity: 1,
		y: 0,
		rotateX: 0,
		transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
	},
} as const;

const fadeWord = {
	hidden: { opacity: 0 },
	show: { opacity: 1, transition: { duration: 0.4, ease: "easeOut" } },
} as const;

const workflowSteps = [
	{ icon: "calendar_month", label: "Roster" },
	{ icon: "receipt_long", label: "Receipt scan" },
	{ icon: "account_balance_wallet", label: "Payout PV" },
] as const;

const floatingSignals = [
	{
		icon: "verified_user",
		label: "GPS verified",
		pos: "left-0 top-[14%] -translate-x-[38%]",
	},
	{
		icon: "trending_up",
		label: "+6.2% variance",
		pos: "right-0 top-[6%] translate-x-[30%]",
	},
	{
		icon: "draw",
		label: "PV e-signed",
		pos: "right-0 bottom-[12%] translate-x-[28%]",
	},
] as const;

export function HeroSection() {
	const reduceMotion = useReducedMotion();

	return (
		<section className="hero-section relative isolate w-full overflow-hidden px-6 pb-24 pt-40 lg:pb-28 lg:pt-44">
			<div className="pointer-events-none absolute inset-0 -z-10">
				<div className="absolute inset-0 bg-aurora opacity-45" />
				<div className="hero-grid absolute inset-0 opacity-40" />
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,transparent_30%,color-mix(in_oklab,var(--background)_92%,transparent)_100%)]" />
			</div>
			<HeroBackdrop />
			<HeroPortraitRing />

			<div className="relative z-10 mx-auto w-full max-w-7xl">
				<motion.div
					initial={{ opacity: 0, y: 16 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5 }}
					className="mb-12 flex justify-center lg:mb-16"
				>
					<BrandLogo variant="stacked" size="hero" showTagline showMotto />
				</motion.div>

				<div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-12 xl:gap-16">
					<div className="relative z-10 text-left">
						<motion.span
							initial={{ opacity: 0, y: 16 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.5, delay: 0.1 }}
							className="hero-badge inline-flex items-center gap-2.5"
						>
							<span className="h-1.5 w-1.5 animate-glow-pulse rounded-full bg-signal-live" />
							Workforce OS for nightlife venues
						</motion.span>

						<motion.h1
							initial="hidden"
							animate="show"
							variants={{
								hidden: {},
								show: {
									transition: reduceMotion
										? { staggerChildren: 0 }
										: { staggerChildren: 0.1, delayChildren: 0.1 },
								},
							}}
							className="landing-hero-title mt-7 uppercase tracking-tight text-foreground"
						>
							{["One", "live", "floor", "for"].map((w) => (
								<motion.span
									key={w}
									variants={reduceMotion ? fadeWord : wordVariant}
									className="inline-block"
								>
									{w}&nbsp;
								</motion.span>
							))}
							<motion.span
								variants={reduceMotion ? fadeWord : wordVariant}
								className="inline-block text-gradient-royal drop-shadow-[0_0_28px_color-mix(in_oklab,var(--royal-gold)_45%,transparent)]"
							>
								every&nbsp;venue&nbsp;you&nbsp;run.
							</motion.span>
						</motion.h1>

						<motion.p
							initial={{ opacity: 0, y: 24 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.45 }}
							className="landing-hero-body mt-6 max-w-xl leading-relaxed text-foreground/78"
						>
							One platform connecting outlets, PR Agency, and PR — roster
							planning, GPS + selfie check-in, receipt-to-payout, and live
							P&amp;L, all reconciled in one place.
						</motion.p>

						<motion.div
							initial={{ opacity: 0, y: 16 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.5, delay: 0.55 }}
							className="mt-7 flex flex-wrap gap-2.5"
						>
							{workflowSteps.map((step) => (
								<span
									key={step.label}
									className="hero-workflow-chip inline-flex items-center gap-2"
								>
									<MaterialIcon
										name={step.icon}
										className="!text-lg text-royal-gold"
									/>
									{step.label}
								</span>
							))}
						</motion.div>

						<motion.div
							initial={{ opacity: 0, y: 24 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.65 }}
							className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap"
						>
							<a
								href="#pricing"
								className="landing-btn group relative inline-flex items-center justify-center gap-2.5 overflow-hidden bg-[image:var(--gradient-royal)] text-[#1a1726] shadow-glow-gold transition-transform hover:-translate-y-0.5"
							>
								<span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-sheen bg-white/30 blur-md" />
								Get priority access <ArrowRight className="h-5 w-5" />
							</a>
							<a
								href="#features"
								className="landing-btn inline-flex items-center justify-center border-2 border-foreground/20 text-foreground backdrop-blur-sm transition-all hover:border-foreground/40 hover:bg-foreground/5"
							>
								Explore solutions
							</a>
						</motion.div>

						<motion.a
							initial={{ opacity: 0, y: 16 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.5, delay: 0.72 }}
							href="https://ng8522.github.io/InnocenZ-proto/"
							target="_blank"
							rel="noopener noreferrer"
							className="landing-btn mt-3 inline-flex w-full items-center justify-center gap-2.5 border-2 border-gold/35 text-gold-bright backdrop-blur-sm transition-all hover:border-gold hover:bg-gold/10 sm:w-auto"
						>
							View our demo <ArrowRight className="h-5 w-5" />
						</motion.a>

						<motion.div
							initial={{ opacity: 0, y: 16 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.6, delay: 0.82 }}
							className="mt-10"
						>
							<PortalTrustStrip />
						</motion.div>
					</div>

					<motion.div
						initial={{ opacity: 0, y: 32 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.8, delay: 0.4 }}
						className="hero-console-stage relative mx-auto w-full lg:mx-0 lg:ml-auto lg:justify-self-end"
					>
						<div
							aria-hidden
							className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-[radial-gradient(circle_at_50%_50%,color-mix(in_oklab,var(--royal-gold)_22%,transparent),transparent_68%)] blur-2xl"
						/>
						<div
							aria-hidden
							className="pointer-events-none absolute -inset-px rounded-[1.35rem] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--royal-gold)_55%,transparent),transparent_40%,color-mix(in_oklab,var(--violet)_40%,transparent))] opacity-70"
						/>

						{floatingSignals.map((signal, i) => (
							<motion.div
								key={signal.label}
								initial={{ opacity: 0, scale: 0.9 }}
								animate={{ opacity: 1, scale: 1 }}
								transition={{ duration: 0.5, delay: 0.9 + i * 0.1 }}
								className={`hero-signal-chip pointer-events-none absolute z-20 hidden items-center gap-2 lg:inline-flex ${signal.pos}`}
							>
								<MaterialIcon
									name={signal.icon}
									className="!text-lg text-royal-gold"
								/>
								{signal.label}
							</motion.div>
						))}

						<div className="hero-console-frame relative">
							<FloorConsole variant="hero" />
						</div>
					</motion.div>
				</div>
			</div>
		</section>
	);
}
