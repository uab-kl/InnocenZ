/**
 * The signed-out page's moving background — decoration ONLY.
 *
 * `aria-hidden`, `pointer-events: none`, and painted beneath every control, so
 * nothing here can intercept a click or reach a screen reader. It spans the
 * WHOLE page rather than the aside: the form half carried no backdrop at all,
 * which is why that side read as flat black beside a decorated left column.
 *
 * Every layer animates transform/opacity only, so the work stays on the
 * compositor and never triggers layout. All of it stops under
 * `prefers-reduced-motion` — the composition is designed to hold still.
 */
export function LoginAmbience() {
	return (
		<div aria-hidden className="login-ambience">
			<div className="login-ambience__base" />
			{/* Two rotating wedges — the club light. This is what makes the
			    motion legible; drifting blur alone reads as a static haze. */}
			<div className="login-ambience__sweep" />
			<div className="login-ambience__pool login-ambience__pool--a" />
			<div className="login-ambience__pool login-ambience__pool--b" />
			<div className="login-ambience__pool login-ambience__pool--c" />
			{/* Fine raked lines. Gradients have no edges, so nothing in the
			    field could catch the light until these were added. */}
			<div className="login-ambience__rays" />
			<div className="login-ambience__beam" />
			<div className="login-ambience__grain" />
			<div className="login-ambience__vignette" />
		</div>
	);
}

export function LoginAsideBackdrop() {
	return (
		<div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
			<div className="absolute inset-0 bg-section-violet" />
			<div className="absolute inset-0 bg-aurora opacity-35" />
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,color-mix(in_oklab,var(--royal-gold)_12%,transparent),transparent_55%)]" />
		</div>
	);
}
