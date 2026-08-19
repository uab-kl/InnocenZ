import {
	lazy,
	type ReactNode,
	Suspense,
	useEffect,
	useRef,
	useState,
} from "react";
import { LandingLocaleProvider } from "@/lib/landing-i18n";
import { HandoffHero } from "./HandoffHero";
import { HandoffNav } from "./HandoffNav";
import { LandingBackground } from "./primitives";

const HandoffChallenges = lazy(() =>
	import("./HandoffChallenges").then((m) => ({ default: m.HandoffChallenges })),
);
const HandoffSolutionFlow = lazy(() =>
	import("./HandoffChallenges").then((m) => ({
		default: m.HandoffSolutionFlow,
	})),
);
const HandoffPlatformModules = lazy(() =>
	import("./HandoffPlatform").then((m) => ({
		default: m.HandoffPlatformModules,
	})),
);
const HandoffAIFeatures = lazy(() =>
	import("./HandoffPlatform").then((m) => ({ default: m.HandoffAIFeatures })),
);
const HandoffDashboards = lazy(() =>
	import("./HandoffDashboards").then((m) => ({ default: m.HandoffDashboards })),
);
const HandoffBenefits = lazy(() =>
	import("./HandoffBenefits").then((m) => ({ default: m.HandoffBenefits })),
);
const HandoffWhyInnocenz = lazy(() =>
	import("./HandoffBenefits").then((m) => ({ default: m.HandoffWhyInnocenz })),
);
const HandoffTestimonials = lazy(() =>
	import("./HandoffBenefits").then((m) => ({ default: m.HandoffTestimonials })),
);
const HandoffPricing = lazy(() =>
	import("./HandoffPricing").then((m) => ({ default: m.HandoffPricing })),
);
const HandoffFinalCTA = lazy(() =>
	import("./HandoffPricing").then((m) => ({ default: m.HandoffFinalCTA })),
);
const HandoffFooter = lazy(() =>
	import("./HandoffPricing").then((m) => ({ default: m.HandoffFooter })),
);

/** Mount children only when near the viewport (defers JS + DOM for below-fold). */
function LazyMount({
	children,
	minHeight = 480,
}: {
	children: ReactNode;
	minHeight?: number;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [show, setShow] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					setShow(true);
					io.disconnect();
				}
			},
			{ rootMargin: "480px 0px" },
		);
		io.observe(el);
		return () => io.disconnect();
	}, []);

	return (
		<div ref={ref} style={show ? undefined : { minHeight }}>
			{show ? (
				<Suspense fallback={<div style={{ minHeight }} aria-hidden />}>
					{children}
				</Suspense>
			) : null}
		</div>
	);
}

export function HandoffHomePage() {
	return (
		<LandingLocaleProvider>
			<div className="landing-page min-h-screen w-full overflow-x-hidden">
				<LandingBackground />
				<div className="hz-page">
					<HandoffNav />
					<HandoffHero />
					<div className="hz-hair" />
					<LazyMount minHeight={900}>
						<HandoffChallenges />
						<HandoffSolutionFlow />
					</LazyMount>
					<LazyMount minHeight={700}>
						<HandoffPlatformModules />
						<HandoffAIFeatures />
					</LazyMount>
					<LazyMount minHeight={800}>
						<HandoffDashboards />
					</LazyMount>
					<LazyMount minHeight={900}>
						<HandoffBenefits />
						<HandoffWhyInnocenz />
						<HandoffTestimonials />
					</LazyMount>
					<LazyMount minHeight={700}>
						<HandoffPricing />
						<HandoffFinalCTA />
						<HandoffFooter />
					</LazyMount>
				</div>
			</div>
		</LandingLocaleProvider>
	);
}
