export function LoginAsideBackdrop() {
	return (
		<div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
			<div className="absolute inset-0 bg-section-violet" />
			<div className="absolute inset-0 bg-aurora opacity-35" />
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,color-mix(in_oklab,var(--royal-gold)_12%,transparent),transparent_55%)]" />
		</div>
	);
}
