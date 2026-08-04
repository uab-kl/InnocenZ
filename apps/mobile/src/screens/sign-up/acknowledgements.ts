/**
 * PR signup acknowledgements — copy patterned on semutz-sj-mobile
 * (member-registration-form-step-5 / activation-form), with InnocenZ branding.
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

export const PR_ACKNOWLEDGEMENTS: PrDisclaimer[] = [
	{
		id: 'personal-info',
		title: 'Personal Information Disclaimer',
		body: [
			'By submitting this registration, you consent to the collection and use of your personal information — including your full name, IC/NRIC or passport number, date of birth, contact details, address, identity photos, and related data — by InnocenZ for the purposes of account management, shift coordination, and official correspondence.',
			'',
			'Your information will be handled in accordance with our Privacy Policy and applicable data protection laws. We will not share your personal data with third parties without your consent, except as required by law or as described under Agency Information Sharing.',
		].join('\n'),
	},
	{
		id: 'declaration-of-truth',
		title: 'Declaration of Truth',
		body: [
			'I hereby declare that all information provided in this registration form is true, accurate, and complete to the best of my knowledge.',
			'',
			'I understand that providing false or misleading information may result in:',
			'  • Rejection of my account application',
			'  • Cancellation of an approved account',
			'  • Potential legal consequences depending on the nature of the false information',
			'',
			'I agree to notify InnocenZ promptly if any of the information provided changes.',
		].join('\n'),
	},
	{
		id: 'information-sharing',
		title: 'Agency Information Sharing',
		body: [
			'By registering as a PR on InnocenZ, you consent to sharing relevant profile information — including your floor nickname, contact details, photos, and work-related profile data — with linked agencies and outlets for rostering, shift coordination, and payment purposes.',
			'',
			'Sensitive identity documents (IC/NRIC, passport photos) remain restricted to InnocenZ compliance staff and authorized platform operators. Information shared with agencies and outlets is limited to what is required to operate bookings, shifts, and payment vouchers on the platform, except as required by law.',
		].join('\n'),
	},
];

export const PR_TERMS_DISCLAIMER: PrDisclaimer = {
	id: 'terms',
	title: 'Terms and Conditions',
	body: [
		'By creating an InnocenZ PR account, you agree to the InnocenZ platform rules, including shift booking and sealing, commission transparency, payment voucher processes, and dispute handling.',
		'',
		'You agree to use the platform lawfully and in good faith, keep your login credentials secure, and not misrepresent your identity or work eligibility.',
		'',
		'Your personal data is processed as described in the InnocenZ Privacy Policy. Continued use of the platform constitutes acceptance of updates to these Terms and Conditions and the Privacy Policy.',
	].join('\n'),
};

export function getPrDisclaimer(id: PrDisclaimerId): PrDisclaimer {
	if (id === 'terms') return PR_TERMS_DISCLAIMER;
	const found = PR_ACKNOWLEDGEMENTS.find((item) => item.id === id);
	if (!found) return PR_TERMS_DISCLAIMER;
	return found;
}
