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
import { LandingChatButton } from "./LandingChatButton";
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

/**
 * An in-page link (`#platform`, `#ai`, …) lands on a section that LazyMount
 * has not rendered yet unless the visitor scrolled past it, so the browser
 * finds no target and stays put. Following one mounts every section first.
 */
const MOUNT_ALL_EVENT = "hz:mount-all";
/** Longest wait for the section chunks to load before scrolling anyway. */
const HASH_SCROLL_WAIT_MS = 4000;
/**
 * A target carrying this attribute glows gold once it is reached — the
 * Benefits cards sit side by side, so the scroll alone cannot say which one.
 */
const FLASH_ATTR = "data-hash-flash";

function flashTarget(target: HTMLElement) {
	if (!target.hasAttribute(FLASH_ATTR)) return;
	target.setAttribute(FLASH_ATTR, "off");
	void target.offsetWidth; // restart the animation on a repeat click
	target.setAttribute(FLASH_ATTR, "on");
	target.addEventListener(
		"animationend",
		() => target.setAttribute(FLASH_ATTR, "off"),
		{ once: true },
	);
}

function scrollToHashTarget(hash: string) {
	const id = decodeURIComponent(hash.slice(1));
	if (!id) return;
	window.dispatchEvent(new Event(MOUNT_ALL_EVENT));
	const deadline = performance.now() + HASH_SCROLL_WAIT_MS;
	const tick = () => {
		const target = document.getElementById(id);
		const timedOut = performance.now() > deadline;
		// Scroll only once nothing above can still change height under it.
		const settled = !document.querySelector("[data-lazy-pending]");
		if (target && (settled || timedOut)) {
			target.scrollIntoView();
			flashTarget(target);
			return;
		}
		if (!timedOut) requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
}

/** Follow `#section` links, including one already in the URL on arrival. */
function useHashTargetScroll() {
	useEffect(() => {
		const onHashChange = () => scrollToHashTarget(window.location.hash);
		// Clicking the link for the hash already in the URL fires no
		// hashchange, so it would scroll without the flash.
		const onSameHashClick = (e: MouseEvent) => {
			const link = (e.target as Element | null)?.closest("a[href^='#']");
			if (link?.getAttribute("href") === window.location.hash) onHashChange();
		};
		if (window.location.hash) onHashChange();
		window.addEventListener("hashchange", onHashChange);
		document.addEventListener("click", onSameHashClick);
		return () => {
			window.removeEventListener("hashchange", onHashChange);
			document.removeEventListener("click", onSameHashClick);
		};
	}, []);
}

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
		const mountNow = () => {
			setShow(true);
			io.disconnect();
		};
		io.observe(el);
		window.addEventListener(MOUNT_ALL_EVENT, mountNow);
		return () => {
			io.disconnect();
			window.removeEventListener(MOUNT_ALL_EVENT, mountNow);
		};
	}, []);

	return (
		<div
			ref={ref}
			style={show ? undefined : { minHeight }}
			data-lazy-pending={show ? undefined : ""}
		>
			{show ? (
				<Suspense
					fallback={
						<div style={{ minHeight }} aria-hidden data-lazy-pending="" />
					}
				>
					{children}
				</Suspense>
			) : null}
		</div>
	);
}

export function HandoffHomePage() {
	useHashTargetScroll();

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
				{/* Bottom-left chat — WhatsApp's twin. Inside .landing-page for the
				    --hz-* tokens and the Sign in gold; see LandingChatButton. */}
				<LandingChatButton />
			</div>
		</LandingLocaleProvider>
	);
}
