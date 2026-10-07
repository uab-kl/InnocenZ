import { Link } from "@tanstack/react-router";
import { translations as landingTranslations } from "@/lib/landing-i18n";
import { PR_SIGNUP_DOCUMENTS } from "@/lib/legal/pr-signup-terms";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import {
	DocumentGroup,
	DocumentSection,
	PublicDocumentShell,
	PublicPageLocaleProvider,
} from "./PublicDocumentShell";

/**
 * `/legal` — the landing footer's Legal and Terms links. It writes no terms of
 * its own: it shows, word for word, what each sign-up already asks people to
 * accept — the web sign-up for outlets and agencies, the PR app's for PRs — in
 * the language they accepted it in. How personal data is handled stays on
 * /policy, linked from here rather than repeated.
 */
export function LegalPage() {
	return (
		<PublicPageLocaleProvider>
			<LegalBody />
		</PublicPageLocaleProvider>
	);
}

function LegalBody() {
	const { t, locale } = usePortalLocale();
	// The live web sign-up text itself, not a copy of it.
	const ack = landingTranslations[locale].signup.acknowledgements;
	const outletAgencyDocuments = [
		{ id: "terms", ...ack.terms },
		{ id: "truth", ...ack.declarationOfTruth },
		{ id: "personal", ...ack.personalInfo },
		{ id: "sharing", ...ack.informationSharing },
	];

	return (
		<PublicDocumentShell
			eyebrow={t.webShell.legalEyebrow}
			title={t.webShell.legalTitle}
			contactLabel={t.webShell.supportContact}
		>
			<p className="text-base leading-relaxed text-foreground/85">
				{t.webShell.legalIntro}
			</p>

			<div className="mt-10">
				<DocumentGroup
					id="outlet-agency"
					title={t.webShell.legalOutletAgencyHeading}
				>
					{outletAgencyDocuments.map((doc) => (
						<DocumentSection
							key={doc.id}
							id={`outlet-agency-${doc.id}`}
							title={doc.title}
							body={doc.body}
							heading="h3"
						/>
					))}
				</DocumentGroup>

				<DocumentGroup id="pr" title={t.webShell.legalPrHeading}>
					{PR_SIGNUP_DOCUMENTS[locale].map((doc) => (
						<DocumentSection
							key={doc.id}
							id={`pr-${doc.id}`}
							title={doc.title}
							body={doc.body}
							heading="h3"
						/>
					))}
				</DocumentGroup>

				<DocumentGroup id="related" title={t.webShell.relatedDocuments}>
					<ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-foreground/80">
						<li>
							<Link
								to="/policy"
								className="font-medium text-royal-gold underline-offset-4 hover:underline"
							>
								{t.webShell.privacyPolicyTitle}
							</Link>
						</li>
						<li>
							<Link
								to="/delete-account"
								className="font-medium text-royal-gold underline-offset-4 hover:underline"
							>
								{t.webShell.deleteAccountTitle}
							</Link>
						</li>
					</ul>
				</DocumentGroup>
			</div>
		</PublicDocumentShell>
	);
}
