export type SignupDisclaimerId =
	| 'personal-info'
	| 'declaration-of-truth'
	| 'information-sharing'
	| 'terms'

export interface SignupDisclaimer {
	id: SignupDisclaimerId
	title: string
	body: string
}

export const signupAcknowledgements: SignupDisclaimer[] = [
	{
		id: 'personal-info',
		title: 'Personal Information Disclaimer',
		body: 'Your company registration documents, business contact details, and registered address are stored securely on InnocenZ. Only InnocenZ compliance staff and authorized platform operators supporting your outlet or agency account can access this data — other outlets, agencies, and PR professionals cannot view your private business records.',
	},
	{
		id: 'declaration-of-truth',
		title: 'Declaration of Truth',
		body: 'I declare that all company information and documents submitted on behalf of this outlet or agency are true, current, and accurate. I understand that false or misleading statements may result in account suspension or removal from the platform.',
	},
	{
		id: 'information-sharing',
		title: 'Outlet & Agency Information Sharing',
		body: 'Your outlet or agency profile may be shared with linked PR agencies and workforce participants on InnocenZ for rostering, shift coordination, payroll, and compliance purposes. Information shared is limited to what is required to operate bookings, shifts, and payment vouchers on the platform.',
	},
]

export const signupTermsDisclaimer: SignupDisclaimer = {
	id: 'terms',
	title: 'Terms & Conditions',
	body: 'I agree to InnocenZ platform rules, shift sealing, commission transparency, and dispute processes as described in the InnocenZ Outlet & Agency terms. Continued use of the platform constitutes acceptance of updates to these terms.',
}

export function getSignupDisclaimerById(
	id: SignupDisclaimerId,
): SignupDisclaimer | undefined {
	if (id === 'terms') return signupTermsDisclaimer
	return signupAcknowledgements.find((item) => item.id === id)
}
