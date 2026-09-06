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

/*
 * `LoginAsideBackdrop` was removed here on 6 Sep 2026.
 *
 * It was the pre-ambience login background: three STATIC layers
 * (bg-section-violet + bg-aurora at 35% + a gold radial). `/login` stopped
 * rendering it when it turned out to be a second lighting rig over the
 * animated field, and `/signup` replaced it with `LoginAmbience`, which left
 * it with no render site at all.
 *
 * The `bg-aurora` and `bg-section-violet` utilities it used are NOT dead —
 * HeroSection and PlatformShowcase still use them, so those stay in
 * styles.css. The now-inert `.login-page .bg-aurora` reduced-motion selectors
 * are deliberately left alone: they share a selector list with the live
 * `.landing-page` half, and splitting that to delete a no-op is more risk
 * than two dead lines are worth.
 */
