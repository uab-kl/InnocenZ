import { motion, useReducedMotion } from "motion/react";
import { heroPortraitFrames, landingGallery, LANDING_IMAGES } from "@/lib/landing-assets";

export function HeroBackdrop() {
	return (
		<div aria-hidden className="pointer-events-none absolute inset-0 -z-20 overflow-hidden">
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,color-mix(in_oklab,var(--royal-gold)_18%,transparent),transparent_55%)]" />
			<div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--violet)_35%,transparent),transparent_70%)] blur-3xl" />
			<img
				src={landingGallery[0].src}
				alt=""
				className="absolute left-1/2 top-1/2 h-[min(70vh,640px)] w-[min(90vw,960px)] -translate-x-1/2 -translate-y-1/2 object-cover opacity-[0.12] blur-sm"
			/>
		</div>
	);
}

export function HeroPortraitRing() {
	const reduceMotion = useReducedMotion();

	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-0 -z-10 hidden overflow-hidden lg:block [mask-image:radial-gradient(ellipse_24%_16%_at_50%_13%,transparent_0%,transparent_42%,black_70%)]"
		>
			{heroPortraitFrames.map((frame, i) => (
				<motion.div
					key={`${frame.src}-${i}`}
					initial={reduceMotion ? false : { opacity: 0, scale: 0.88, y: 24 }}
					animate={{ opacity: 1, scale: 1, y: 0 }}
					transition={{ duration: 0.75, delay: 0.12 + i * 0.04 }}
					className={`landing-float-card absolute ${frame.pos} ${frame.size} overflow-hidden rounded-2xl border-2 border-royal-gold/40 shadow-[0_24px_60px_rgba(0,0,0,0.5)] ${frame.rot}`}
					style={{ animationDelay: `${i * 0.35}s` }}
				>
					<img
						src={frame.src}
						alt=""
						className="aspect-[4/5] h-full w-full object-cover"
					/>
					<div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
				</motion.div>
			))}
		</div>
	);
}

export function AtmosphereMosaic({
	src = LANDING_IMAGES.venueSkyline,
}: {
	src?: string;
} = {}) {
	return (
		<div aria-hidden className="absolute inset-0 -z-10">
			<img
				src={src}
				alt=""
				className="h-full w-full object-cover object-center"
			/>
			<div className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_oklab,var(--background)_78%,transparent),color-mix(in_oklab,var(--background)_88%,transparent))]" />
			<div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_120%,color-mix(in_oklab,var(--royal-gold)_22%,transparent),transparent_70%)]" />
		</div>
	);
}

export function VenueStrip({ className = "" }: { className?: string }) {
	return (
		<div className={`flex flex-wrap items-center justify-center gap-4 ${className}`}>
			<div className="flex items-center">
				{landingGallery.slice(0, 6).map((image, i) => (
					<div
						key={image.src}
						className="overflow-hidden rounded-full border-2 border-royal-gold/40 shadow-lg"
						style={{ marginLeft: i === 0 ? 0 : "-0.75rem" }}
					>
						<img
							src={image.src}
							alt={image.alt}
							className="h-14 w-14 object-cover sm:h-16 sm:w-16"
						/>
					</div>
				))}
			</div>
			<span className="text-base font-semibold text-foreground/75 sm:text-lg">
				Trusted across Malaysia&apos;s top venues
			</span>
		</div>
	);
}
