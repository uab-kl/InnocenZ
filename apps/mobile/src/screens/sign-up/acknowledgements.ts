/**
 * PR signup acknowledgements — copy from i18n (`t.signup.disclaimer*`).
 */

export type PrDisclaimerId =
	| 'personal-info'
	| 'declaration-of-truth'
	| 'information-sharing'
	| 'terms';

export type PrDisclaimer = {
	id: PrDisclaimerId;
	title: string;
	body: string;
};

export type PrDisclaimerCopy = {
	disclaimerPersonalTitle: string;
	disclaimerPersonalBody: string;
	disclaimerTruthTitle: string;
	disclaimerTruthBody: string;
	disclaimerSharingTitle: string;
	disclaimerSharingBody: string;
	disclaimerTermsTitle: string;
	disclaimerTermsBody: string;
};

export function getPrDisclaimerFromCopy(
	copy: PrDisclaimerCopy,
	id: PrDisclaimerId,
): PrDisclaimer {
	switch (id) {
		case 'personal-info':
			return {
				id,
				title: copy.disclaimerPersonalTitle,
				body: copy.disclaimerPersonalBody,
			};
		case 'declaration-of-truth':
			return {
				id,
				title: copy.disclaimerTruthTitle,
				body: copy.disclaimerTruthBody,
			};
		case 'information-sharing':
			return {
				id,
				title: copy.disclaimerSharingTitle,
				body: copy.disclaimerSharingBody,
			};
		case 'terms':
			return {
				id,
				title: copy.disclaimerTermsTitle,
				body: copy.disclaimerTermsBody,
			};
	}
}
