import { COUNTRY_BY_CODE, ID_TYPES, MIN_PASSWORD, NRIC_LENGTH } from './constants';

export type IdType = (typeof ID_TYPES)[number];

export type Draft = {
	floorNickname: string;
	firstName: string;
	lastName: string;
	email: string;
	/** ISO country for the dial picker (unique even when dial codes are shared). */
	phoneCountryCode: string | null;
	phoneNumber: string;
	nationality: string;
	idType: IdType | '';
	idNo: string;
	dob: string;
	password: string;
	confirm: string;
	addressLine1: string;
	addressLine2: string;
	postcode: string;
	state: string;
	country: string;
	underAgency: boolean | null;
	/**
	 * Chosen from the backend list — the agency that referred them, or one to
	 * join. Only ids that came from `GET /auth/agencies` are ever stored, so a
	 * PR can never name an agency that does not exist.
	 */
	agencyId: string | null;
};

export function emptyDraft(): Draft {
	return {
		floorNickname: '',
		firstName: '',
		lastName: '',
		email: '',
		phoneCountryCode: null,
		phoneNumber: '',
		nationality: '',
		idType: '',
		idNo: '',
		dob: '',
		password: '',
		confirm: '',
		addressLine1: '',
		addressLine2: '',
		postcode: '',
		state: '',
		country: '',
		underAgency: null,
		agencyId: null,
	};
}

/** NRIC opens with the DOB as YYMMDD — same derivation as the prototype. */
export function dobToNricPrefix(dob: string): string {
	const [year, month, day] = dob.split('-');
	if (!year || !month || !day) return '';
	return `${year.slice(-2)}${month}${day}`;
}

/** Keep the NRIC suffix (digits 7–12) when DOB changes; refresh the prefix. */
export function mergeNricWithDob(dob: string, idNo: string): string {
	const prefix = dobToNricPrefix(dob);
	const digits = idNo.replace(/\D/g, '').slice(0, NRIC_LENGTH);
	if (!prefix) return digits;
	return prefix + (digits.length > 6 ? digits.slice(6) : '');
}

export function phoneParts(draft: Draft) {
	const localDigits = draft.phoneNumber.replace(/\D/g, '').replace(/^0+/, '').slice(0, 10);
	const dial = draft.phoneCountryCode
		? (COUNTRY_BY_CODE[draft.phoneCountryCode]?.dialCode ?? '')
		: '';
	const fullPhone = dial ? `${dial}${localDigits}` : localDigits;
	const phoneNum = dial ? `${dial.replace('+', '')}${localDigits}` : localDigits;
	return { localDigits, fullPhone, phoneNum, dial };
}

export type FieldErrors = Partial<Record<keyof Draft | 'phone' | 'otp', string>>;

export type StepValidation = {
	fields: FieldErrors;
	/** Short summary for the toast when Continue is tapped. */
	toast: string | null;
};

/** Collect per-field errors for the current step (all invalid fields at once). */
export function validateStep(step: number, draft: Draft, localDigits: string): StepValidation {
	const fields: FieldErrors = {};

	if (step === 1) {
		if (!draft.floorNickname.trim()) fields.floorNickname = 'A floor nickname is required.';
		if (!draft.firstName.trim()) fields.firstName = 'First name is required.';
		if (!draft.lastName.trim()) fields.lastName = 'Last name is required.';
		if (!draft.phoneCountryCode) fields.phoneCountryCode = 'Please choose a country dial code.';
		if (localDigits.length < 9) fields.phone = 'That mobile number looks too short.';
		if (!draft.nationality.trim()) fields.nationality = 'Nationality is required.';
		if (!draft.idType) fields.idType = 'Please select an ID type.';
		if (!draft.dob.trim()) fields.dob = 'Date of birth is required.';
		if (!draft.idType) {
			fields.idNo = 'Please select ID type first.';
		} else if (!draft.idNo.trim()) {
			fields.idNo = 'ID number is required.';
		}
		if (draft.password && draft.password.length < MIN_PASSWORD) {
			fields.password = `Password must be at least ${MIN_PASSWORD} characters.`;
		}
		if (draft.password && draft.password !== draft.confirm) {
			fields.confirm = 'Both passwords must match.';
		}
	} else if (step === 2) {
		if (!draft.addressLine1.trim()) fields.addressLine1 = 'Address line 1 is required.';
		if (!draft.postcode.trim()) fields.postcode = 'Postcode is required.';
		if (!draft.state.trim()) fields.state = 'Please choose a state.';
		if (!draft.country.trim()) fields.country = 'Please choose a country.';
	} else if (step === 3) {
		if (draft.underAgency === null) {
			fields.underAgency = 'Please tell us whether an agency referred you.';
		} else if (draft.underAgency === true && !draft.agencyId) {
			fields.agencyId = 'Please pick the agency that added you.';
		}
	}

	const messages = Object.values(fields).filter(Boolean) as string[];
	if (!messages.length) return { fields: {}, toast: null };

	const toast =
		messages.length === 1
			? messages[0]
			: `Please fix ${messages.length} fields before continuing.`;

	return { fields, toast };
}
