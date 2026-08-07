import { loadPhoneCountryCode } from '../../lib/phone-prefs';
import { isValidNricFormat, nricMatchesDob } from '../../lib/id-ocr';
import {
	COUNTRY_BY_CODE,
	ID_TYPES,
	MALAYSIAN_NATIONALITY,
	MIN_PASSWORD,
	NRIC_LENGTH,
} from './constants';

export type IdType = (typeof ID_TYPES)[number];

/** One local photo chosen for optional comcard / portfolio. */
export type DraftPhoto = {
	uri: string;
	/** FormData-ready file from the camera/gallery picker. */
	file: Blob;
};

/** Same cap as Profile portfolio slots (`normalizePortfolioPhotos` default 8). */
export const PORTFOLIO_PHOTO_MAX = 8;

export type Draft = {
	floorNickname: string;
	/** Legal full name → user_profile.full_name */
	fullName: string;
	email: string;
	/** ISO country for the dial picker (unique even when dial codes are shared). */
	phoneCountryCode: string | null;
	phoneNumber: string;
	nationality: string;
	idType: IdType | '';
	idNo: string;
	dob: string;
	/** Digit strings → user_profile.comcard_height_cm / weight_kg / BWH. */
	heightCm: string;
	weightKg: string;
	bustCm: string;
	waistCm: string;
	hipCm: string;
	/** Preferred spoken languages → user_profile.languages. */
	languages: string[];
	password: string;
	confirm: string;
	addressLine1: string;
	addressLine2: string;
	city: string;
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
	/** Local camera preview URIs — Step 4 (ID front / back only). */
	idPhotoFrontUri: string;
	idPhotoBackUri: string;
	/** FormData-ready files for POST /user/:id/id-photo/{front|back}. */
	idPhotoFrontFile: Blob | null;
	idPhotoBackFile: Blob | null;
	/**
	 * Front/back OCR matched the typed ID. Unavailable / mismatch / unreadable
	 * stay false — nothing is skipped; Continue stays blocked until both match.
	 */
	idFrontOcrOk: boolean;
	idBackOcrOk: boolean;
	/** Step 5 — required → `user.profile_image`. */
	profileImageUri: string;
	profileImageFile: Blob | null;
	/** Step 5 — optional many → `user_profile.portfolio_photos` (comcard preview is auto from these). */
	portfolioPhotos: DraftPhoto[];
	/** Step 5 — must acknowledge before Create account (same pattern as web). */
	ackPersonalInfo: boolean;
	ackDeclarationOfTruth: boolean;
	ackInformationSharing: boolean;
	acceptTerms: boolean;
};

export function emptyDraft(): Draft {
	return {
		floorNickname: '',
		fullName: '',
		email: '',
		phoneCountryCode: loadPhoneCountryCode(),
		phoneNumber: '',
		nationality: '',
		idType: '',
		idNo: '',
		dob: '',
		heightCm: '',
		weightKg: '',
		bustCm: '',
		waistCm: '',
		hipCm: '',
		languages: [],
		password: '',
		confirm: '',
		addressLine1: '',
		addressLine2: '',
		city: '',
		postcode: '',
		state: '',
		country: '',
		underAgency: null,
		agencyId: null,
		idPhotoFrontUri: '',
		idPhotoBackUri: '',
		idPhotoFrontFile: null,
		idPhotoBackFile: null,
		idFrontOcrOk: false,
		idBackOcrOk: false,
		profileImageUri: '',
		profileImageFile: null,
		portfolioPhotos: [],
		ackPersonalInfo: false,
		ackDeclarationOfTruth: false,
		ackInformationSharing: false,
		acceptTerms: false,
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

/** Empty is OK (optional). Non-empty must be an integer in range. */
function parseOptionalMeasure(
	raw: string,
	min: number,
	max: number,
	label: string,
): string | null {
	const digits = raw.replace(/\D/g, '');
	if (!digits) return null;
	const n = Number(digits);
	if (!Number.isFinite(n) || n < min || n > max) {
		return `${label} must be between ${min} and ${max}.`;
	}
	return null;
}

/** Collect per-field errors for the current step (all invalid fields at once). */
export function validateStep(
	step: number,
	draft: Draft,
	localDigits: string,
	copy?: {
		nicknameRequired?: string;
		fullNameRequired?: string;
		dialRequired?: string;
		phoneShort?: string;
		nationalityRequired?: string;
		idTypeRequired?: string;
		nricMalaysianOnly?: string;
		dobRequired?: string;
		idNoSelectFirst?: string;
		idNoRequired?: string;
		languagesRequired?: string;
		addressLine1Required?: string;
		cityRequired?: string;
		postcodeRequired?: string;
		stateRequired?: string;
		countryRequired?: string;
		joiningRequired?: string;
		agencyRequired?: string;
		profileRequired?: string;
		idFrontRequired?: string;
		idPassportPageRequired?: string;
		idFrontOcrFail?: string;
		idPassportOcrFail?: string;
		idBackRequired?: string;
		idBackOcrFail?: string;
		passwordRequired?: string;
		passwordMin?: string;
		confirmRequired?: string;
		passwordMismatch?: string;
		ackRequired?: string;
		fixHighlighted?: string;
	},
): StepValidation {
	const fields: FieldErrors = {};

	if (step === 1) {
		if (!draft.floorNickname.trim()) {
			fields.floorNickname = copy?.nicknameRequired ?? 'Nickname is required.';
		}
		if (!draft.fullName.trim()) {
			fields.fullName = copy?.fullNameRequired ?? 'Full name is required.';
		}
		if (!draft.phoneCountryCode) {
			fields.phoneCountryCode =
				copy?.dialRequired ?? 'Please choose a country dial code.';
		}
		if (localDigits.length < 9) {
			fields.phone = copy?.phoneShort ?? 'That mobile number looks too short.';
		}
		if (!draft.nationality.trim()) {
			fields.nationality = copy?.nationalityRequired ?? 'Nationality is required.';
		}
		if (!draft.idType) {
			fields.idType = copy?.idTypeRequired ?? 'Please select an ID type.';
		} else if (
			draft.idType === 'NRIC' &&
			draft.nationality.trim() !== MALAYSIAN_NATIONALITY
		) {
			fields.idType =
				copy?.nricMalaysianOnly ?? 'NRIC is only for Malaysian nationality.';
		}
		if (!draft.dob.trim()) {
			fields.dob = copy?.dobRequired ?? 'Date of birth is required.';
		}
		if (!draft.idType) {
			fields.idNo = copy?.idNoSelectFirst ?? 'Please select ID type first.';
		} else if (!draft.idNo.trim()) {
			fields.idNo = copy?.idNoRequired ?? 'ID number is required.';
		} else if (
			draft.idType === 'NRIC' &&
			draft.nationality.trim() === MALAYSIAN_NATIONALITY
		) {
			if (!isValidNricFormat(draft.idNo)) {
				fields.idNo = `NRIC must be ${NRIC_LENGTH} digits like 1234881234 (no dashes).`;
			} else if (draft.dob && !nricMatchesDob(draft.idNo, draft.dob)) {
				fields.idNo = 'First 6 digits must match DOB as YYMMDD (e.g. 030704…).';
			}
		}
		// Height / weight / BWH are optional — only validate when the PR typed something.
		const heightErr = parseOptionalMeasure(draft.heightCm, 100, 250, 'Height');
		if (heightErr) fields.heightCm = heightErr;
		const weightErr = parseOptionalMeasure(draft.weightKg, 25, 250, 'Weight');
		if (weightErr) fields.weightKg = weightErr;
		const bustErr = parseOptionalMeasure(draft.bustCm, 40, 200, 'Bust');
		if (bustErr) fields.bustCm = bustErr;
		const waistErr = parseOptionalMeasure(draft.waistCm, 40, 200, 'Waist');
		if (waistErr) fields.waistCm = waistErr;
		const hipErr = parseOptionalMeasure(draft.hipCm, 40, 200, 'Hip');
		if (hipErr) fields.hipCm = hipErr;
		if (draft.languages.length === 0) {
			fields.languages =
				copy?.languagesRequired ?? 'Pick at least one preferred language.';
		}
	} else if (step === 2) {
		if (!draft.addressLine1.trim()) {
			fields.addressLine1 =
				copy?.addressLine1Required ?? 'Address line 1 is required.';
		}
		if (!draft.city.trim()) {
			fields.city = copy?.cityRequired ?? 'City is required.';
		}
		if (!draft.postcode.trim()) {
			fields.postcode = copy?.postcodeRequired ?? 'Postcode is required.';
		}
		if (!draft.state.trim()) {
			fields.state = copy?.stateRequired ?? 'Please choose a state.';
		}
		if (!draft.country.trim()) {
			fields.country = copy?.countryRequired ?? 'Please choose a country.';
		}
	} else if (step === 3) {
		if (draft.underAgency === null) {
			fields.underAgency =
				copy?.joiningRequired ?? 'Please tell us whether an agency referred you.';
		} else if (draft.underAgency === true && !draft.agencyId) {
			fields.agencyId =
				copy?.agencyRequired ?? 'Please pick the agency that added you.';
		}
	} else if (step === 4) {
		const passportOnly = draft.idType === 'Passport';
		if (!draft.idPhotoFrontUri.trim()) {
			fields.idPhotoFrontUri = passportOnly
				? (copy?.idPassportPageRequired ?? 'Capture the passport photo page.')
				: (copy?.idFrontRequired ?? 'Capture the front of your ID.');
		} else if (!draft.idFrontOcrOk) {
			fields.idPhotoFrontUri = passportOnly
				? (copy?.idPassportOcrFail ??
					'Passport number on the photo must match what you entered. Retake.')
				: (copy?.idFrontOcrFail ??
					'Front photo must be the front of your ID and show the correct ID number. Retake.');
		}
		// Passport is one page only — no back. NRIC / work permit still need both sides.
		if (!passportOnly) {
			if (!draft.idPhotoBackUri.trim()) {
				fields.idPhotoBackUri =
					copy?.idBackRequired ?? 'Capture the back of your ID.';
			} else if (!draft.idBackOcrOk) {
				fields.idPhotoBackUri =
					copy?.idBackOcrFail ??
					'Back photo must be the back of your ID and show the correct ID number. Retake.';
			}
		}
	} else if (step === 5) {
		if (!draft.profileImageUri.trim() || !draft.profileImageFile) {
			fields.profileImageUri = copy?.profileRequired ?? 'Add a profile photo.';
		}
		if (!draft.password.trim()) {
			fields.password = copy?.passwordRequired ?? 'Password is required.';
		} else if (draft.password.length < MIN_PASSWORD) {
			fields.password =
				copy?.passwordMin ??
				`Password must be at least ${MIN_PASSWORD} characters.`;
		}
		if (!draft.confirm.trim()) {
			fields.confirm = copy?.confirmRequired ?? 'Confirm your password.';
		} else if (draft.password !== draft.confirm) {
			fields.confirm = copy?.passwordMismatch ?? 'Both passwords must match.';
		}
		const ackMsg =
			copy?.ackRequired ?? 'Please acknowledge the Personal Information Disclaimer.';
		if (!draft.ackPersonalInfo) {
			fields.ackPersonalInfo = ackMsg;
		}
		if (!draft.ackDeclarationOfTruth) {
			fields.ackDeclarationOfTruth = ackMsg;
		}
		if (!draft.ackInformationSharing) {
			fields.ackInformationSharing = ackMsg;
		}
		if (!draft.acceptTerms) {
			fields.acceptTerms = ackMsg;
		}
	}

	const messages = Object.values(fields).filter(Boolean) as string[];
	if (!messages.length) return { fields: {}, toast: null };

	const toast =
		messages.length === 1
			? messages[0]
			: (copy?.fixHighlighted ??
				`Please fix ${messages.length} fields before continuing.`);

	return { fields, toast };
}

