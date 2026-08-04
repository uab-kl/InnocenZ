import { useEffect, useRef, useState, type ReactNode } from "react";
import { LANDING_IMAGES } from "@/lib/landing-assets";

/** Source asset is 447×434 — keep display ≤ ~120px for crisp zoom. */
const LOGO_INTRINSIC = { width: 447, height: 434 } as const;

export function useCursorGlow() {
	useEffect(() => {
		const finePointer = window.matchMedia("(pointer: fine)");
		const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
		if (!finePointer.matches || reduceMotion.matches) return;

		const root = document.documentElement;
		let raf = 0;
		let latestX = 0;
		let latestY = 0;

		const flush = () => {
			raf = 0;
			root.style.setProperty("--mx", `${latestX}px`);
			root.style.setProperty("--my", `${latestY}px`);
		};

		const onMove = (e: MouseEvent) => {
			latestX = e.clientX;
			latestY = e.clientY;
			if (!raf) raf = requestAnimationFrame(flush);
		};

		window.addEventListener("mousemove", onMove, { passive: true });
		return () => {
			window.removeEventListener("mousemove", onMove);
			if (raf) cancelAnimationFrame(raf);
		};
	}, []);
}

export function LandingBackground() {
	useCursorGlow();
	return (
		<>
			<div className="hz-aurora" aria-hidden />
			<div className="hz-aurora-3" aria-hidden />
			<div className="hz-spotlight" aria-hidden />
			<div className="hz-grain" aria-hidden />
		</>
	);
}

export function CountUp({
	to,
	dur = 1600,
	suffix = "",
	prefix = "",
	decimals = 0,
}: {
	to: number;
	dur?: number;
	suffix?: string;
	prefix?: string;
	decimals?: number;
}) {
	const ref = useRef<HTMLSpanElement>(null);
	const started = useRef(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		const format = (n: number) => {
			const display = decimals
				? n.toFixed(decimals)
				: Math.round(n).toLocaleString();
			el.textContent = `${prefix}${display}${suffix}`;
		};

		format(0);

		const io = new IntersectionObserver(
			(entries) => {
				entries.forEach((e) => {
					if (e.isIntersecting && !started.current) {
						started.current = true;
						const t0 = performance.now();
						const tick = (t: number) => {
							const p = Math.min(1, (t - t0) / dur);
							const eased = 1 - (1 - p) ** 3;
							format(to * eased);
							if (p < 1) requestAnimationFrame(tick);
						};
						requestAnimationFrame(tick);
					}
				});
			},
			{ threshold: 0.3 },
		);
		io.observe(el);
		return () => io.disconnect();
	}, [to, dur, suffix, prefix, decimals]);

	return <span ref={ref} />;
}

export function SplitTitle({
	prefix,
	highlight,
	suffix,
	accent = "gold",
}: {
	prefix?: string;
	highlight: string;
	suffix?: string;
	accent?: "gold" | "violet";
}) {
	const accentClass =
		accent === "violet" ? "hz-violet-text" : "hz-gold-text";

	if (prefix === undefined) {
		return (
			<>
				<span className={`hz-split-title__highlight ${accentClass}`}>
					{highlight}
				</span>
				{suffix ? (
					<span className="hz-split-title__suffix">{` ${suffix}`}</span>
				) : null}
			</>
		);
	}

	return (
		<>
			<span className="hz-split-title__prefix">{prefix}</span>
			<span className={`hz-split-title__highlight ${accentClass}`}>
				{highlight}
			</span>
			{suffix ? (
				<span className="hz-split-title__suffix">{` ${suffix}`}</span>
			) : null}
		</>
	);
}

export function SectionHead({
	eyebrow,
	title,
	sub,
	center,
}: {
	eyebrow: string;
	title: ReactNode;
	sub?: string;
	center?: boolean;
}) {
	return (
		<div
			className={`hz-section-head ${center ? "hz-section-head--center" : ""}`}
		>
			<span className={`hz-eyebrow ${center ? "hz-eyebrow--center" : ""}`}>
				{eyebrow}
			</span>
			<h2 className="hz-display">{title}</h2>
			{sub && <p>{sub}</p>}
		</div>
	);
}

export function Tag({
	children,
	color = "gold",
}: {
	children: ReactNode;
	color?: "gold" | "violet";
}) {
	const isGold = color === "gold";
	return (
		<span
			className="hz-mono hz-label"
			style={{
				letterSpacing: "0.14em",
				textTransform: "uppercase",
				padding: "4px 10px",
				borderRadius: 999,
				border: `1px solid ${isGold ? "rgba(242,198,107,.35)" : "rgba(182,124,255,.35)"}`,
				color: isGold ? "var(--hz-gold)" : "var(--hz-violet)",
				background: isGold
					? "rgba(242,198,107,.06)"
					: "rgba(182,124,255,.06)",
			}}
		>
			{children}
		</span>
	);
}

export function LogoMark({ size = 52 }: { size?: number }) {
	return (
		<img
			src={LANDING_IMAGES.innocenzLogo}
			alt="InnocenZ"
			width={LOGO_INTRINSIC.width}
			height={LOGO_INTRINSIC.height}
			decoding="async"
			className="hz-logo-mark shrink-0 rounded-full"
			style={{
				width: size,
				height: size,
			}}
		/>
	);
}

export function useTick(interval = 1500) {
	const [t, setT] = useState(0);

	useEffect(() => {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			return;
		}

		let id: ReturnType<typeof setInterval> | undefined;
		const start = () => {
			if (id || document.hidden) return;
			id = setInterval(() => setT((x) => x + 1), interval);
		};
		const stop = () => {
			if (!id) return;
			clearInterval(id);
			id = undefined;
		};

		const onVisibility = () => {
			if (document.hidden) stop();
			else start();
		};

		const section = document.getElementById("dashboards");
		let io: IntersectionObserver | undefined;
		if (section) {
			io = new IntersectionObserver(
				(entries) => {
					entries.forEach((entry) => {
						if (entry.isIntersecting && !document.hidden) start();
						else stop();
					});
				},
				{ threshold: 0.12 },
			);
			io.observe(section);
		} else {
			start();
		}

		document.addEventListener("visibilitychange", onVisibility);
		return () => {
			stop();
			io?.disconnect();
			document.removeEventListener("visibilitychange", onVisibility);
		};
	}, [interval]);

	return t;
}
