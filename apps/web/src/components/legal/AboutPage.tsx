import { PoweredByBadge } from "@/components/landing/PoweredByBadge";
import {
	type LandingLocale,
	translations as landingTranslations,
} from "@/lib/landing-i18n";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import {
	DocumentSection,
	PublicDocumentShell,
	PublicPageLocaleProvider,
} from "./PublicDocumentShell";

/**
 * `/about` — the landing footer's About link. Every sentence below is the
 * landing page's own copy, in both languages, so this page can never promise
 * something the home page does not. Company facts the repo does not hold (a
 * founding story, team, address) are deliberately absent, not invented.
 */
export function AboutPage() {
	return (
		<PublicPageLocaleProvider>
			<AboutBody />
		</PublicPageLocaleProvider>
	);
}

/**
 * Joins a landing two-part phrase. English needs the space; each Chinese first
 * half already ends in punctuation (，/。), so a space there is a stray gap.
 */
function join(locale: LandingLocale, first: string, second: string): string {
	return locale === "zh" ? `${first}${second}` : `${first} ${second}`;
}

function AboutBody() {
	const { t, locale } = usePortalLocale();
	const lt = landingTranslations[locale];
	const dash = locale === "zh" ? "：" : " — ";
	// The hero subtitle breaks its line for the big type; here it is one sentence.
	const subtitle = lt.hero.subtitle.replace(/\n/g, locale === "zh" ? "" : " ");

	return (
		<PublicDocumentShell
			eyebrow={t.webShell.companyEyebrow}
			title={t.webShell.aboutTitle}
			contactLabel={t.webShell.contactUs}
		>
			<p className="text-base leading-relaxed text-foreground/85">
				{join(locale, lt.footer.tagline, subtitle)}
			</p>

			<div className="mt-10 flex flex-col gap-9">
				<DocumentSection
					id="problem"
					title={join(
						locale,
						lt.challenges.titlePrefix,
						lt.challenges.titleHighlight,
					)}
					body={lt.challenges.sub}
				/>
				<DocumentSection
					id="platform"
					title={lt.solution.eyebrow}
					body={lt.solution.sub}
					bullets={[
						`${lt.solution.outletLabel}${dash}${lt.solution.outletDesc}`,
						`${lt.solution.agencyLabel}${dash}${lt.solution.agencyDesc}`,
						`${lt.solution.prLabel}${dash}${lt.solution.prDesc}`,
					]}
				/>
				<DocumentSection
					id="why"
					title={lt.why.eyebrow}
					body={lt.why.sub}
					bullets={lt.why.advantages.map((a) => `${a.title}${dash}${a.desc}`)}
				/>
			</div>

			<PoweredByBadge className="mt-10" />
		</PublicDocumentShell>
	);
}
