import { LandingLocaleProvider } from "@/lib/landing-i18n";
import {
	HandoffAIFeatures,
	HandoffPlatformModules,
} from "./HandoffPlatform";
import {
	HandoffBenefits,
	HandoffTestimonials,
	HandoffWhyInnocenz,
} from "./HandoffBenefits";
import {
	HandoffChallenges,
	HandoffSolutionFlow,
} from "./HandoffChallenges";
import { HandoffDashboards } from "./HandoffDashboards";
import { HandoffHero } from "./HandoffHero";
import { HandoffNav } from "./HandoffNav";
import {
	HandoffFinalCTA,
	HandoffFooter,
	HandoffPricing,
} from "./HandoffPricing";
import { LandingBackground } from "./primitives";

export function HandoffHomePage() {
	return (
		<LandingLocaleProvider>
		<div className="landing-page min-h-screen w-full overflow-x-hidden">
			<LandingBackground />
			<div className="hz-page">
				<HandoffNav />
				<HandoffHero />
				<div className="hz-hair" />
				<HandoffChallenges />
				<HandoffSolutionFlow />
				<HandoffPlatformModules />
				<HandoffAIFeatures />
				<HandoffDashboards />
				<HandoffBenefits />
				<HandoffWhyInnocenz />
				<HandoffTestimonials />
				<HandoffPricing />
				<HandoffFinalCTA />
				<HandoffFooter />
			</div>
		</div>
		</LandingLocaleProvider>
	);
}
