import { loadPhoneCountryCode } from '../../lib/phone-prefs';
import { formatMessage } from '../../i18n';
import type { SignupFieldCopy } from '../../i18n/signup-copy';
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
	template: string,
): string | null {
	const digits = raw.replace(/\D/g, '');
	if (!digits) return null;
	const n = Number(digits);
	if (!Number.isFinite(n) || n < min || n > max) {
		return formatMessage(template, { label, min, max });
	}
	return null;
}

/** Collect per-field errors for the current step (all invalid fields at once). */
export function validateStep(
	step: number,
	draft: Draft,
	localDigits: string,
	/**
	 * Localised copy — pass `t.signup`. REQUIRED and deliberately without a
	 * default: an English fallback here would silently pin one locale forever
	 * for any caller that forgot the dictionary, and tsc could not see it.
	 */
	copy: SignupFieldCopy,
): StepValidation {
	const fields: FieldErrors = {};

	if (step === 1) {
		if (!draft.floorNickname.trim()) {
			fields.floorNickname = copy.nicknameRequired;
		}
		if (!draft.fullName.trim()) {
			fields.fullName = copy.fullNameRequired;
		}
		if (!draft.phoneCountryCode) {
			fields.phoneCountryCode = copy.dialRequired;
		}
		if (localDigits.length < 9) {
			fields.phone = copy.phoneShort;
		}
		/*
		 * Nationality, ID type, date of birth and ID number are OPTIONAL here
		 * (owner, 10 Sep 2026). A PR can finish sign-up without any of them and
		 * fill them in later; the agency screens already render an absent
		 * identity as blank rather than breaking.
		 *
		 * What is NOT relaxed is the shape of a value that IS given. An IC that
		 * does not parse is worse than no IC: age follows the IC on every
		 * surface, so a malformed one produces a wrong age rather than a
		 * missing one. Each check below therefore fires only when the field it
		 * judges has something in it.
		 */
		if (
			draft.idType === 'NRIC' &&
			draft.nationality.trim() &&
			draft.nationality.trim() !== MALAYSIAN_NATIONALITY
		) {
			fields.idType = copy.nricMalaysianOnly;
		}
		if (draft.idNo.trim() && !draft.idType) {
			fields.idNo = copy.idNoSelectFirst;
		} else if (draft.idType === 'NRIC' && draft.idNo.trim()) {
			// A blank nationality reads as Malaysian for an NRIC — that is what
			// the document means, and the server applies the same convention.
			if (!isValidNricFormat(draft.idNo)) {
				fields.idNo = formatMessage(copy.nricFormat, { n: NRIC_LENGTH });
			} else if (draft.dob.trim() && !nricMatchesDob(draft.idNo, draft.dob)) {
				fields.idNo = copy.nricDobPrefix;
			}
		}
		// Height / weight / BWH are optional — only validate when the PR typed something.
		const range = copy.measureRange;
		const heightErr = parseOptionalMeasure(draft.heightCm, 100, 250, copy.height, range);
		if (heightErr) fields.heightCm = heightErr;
		const weightErr = parseOptionalMeasure(draft.weightKg, 25, 250, copy.weight, range);
		if (weightErr) fields.weightKg = weightErr;
		const bustErr = parseOptionalMeasure(draft.bustCm, 40, 200, copy.bust, range);
		if (bustErr) fields.bustCm = bustErr;
		const waistErr = parseOptionalMeasure(draft.waistCm, 40, 200, copy.waist, range);
		if (waistErr) fields.waistCm = waistErr;
		const hipErr = parseOptionalMeasure(draft.hipCm, 40, 200, copy.hip, range);
		if (hipErr) fields.hipCm = hipErr;
		if (draft.languages.length === 0) {
			fields.languages = copy.languagesRequired;
		}
	} else if (step === 2) {
		if (!draft.addressLine1.trim()) {
			fields.addressLine1 = copy.addressLine1Required;
		}
		if (!draft.city.trim()) {
			fields.city = copy.cityRequired;
		}
		if (!draft.postcode.trim()) {
			fields.postcode = copy.postcodeRequired;
		}
		if (!draft.state.trim()) {
			fields.state = copy.stateRequired;
		}
		if (!draft.country.trim()) {
			fields.country = copy.countryRequired;
		}
	} else if (step === 3) {
		if (draft.underAgency === null) {
			fields.underAgency = copy.joiningRequired;
		} else if (draft.underAgency === true && !draft.agencyId) {
			fields.agencyId = copy.agencyRequired;
		}
	} else if (step === 4) {
		const passportOnly = draft.idType === 'Passport';
		if (!draft.idPhotoFrontUri.trim()) {
			fields.idPhotoFrontUri = passportOnly
				? copy.idPassportPageRequired
				: copy.idFrontRequired;
		} else if (!draft.idFrontOcrOk) {
			fields.idPhotoFrontUri = passportOnly
				? copy.idPassportOcrFail
				: copy.idFrontOcrFail;
		}
		// Passport is one page only — no back. NRIC / work permit still need both sides.
		if (!passportOnly) {
			if (!draft.idPhotoBackUri.trim()) {
				fields.idPhotoBackUri = copy.idBackRequired;
			} else if (!draft.idBackOcrOk) {
				fields.idPhotoBackUri = copy.idBackOcrFail;
			}
		}
	} else if (step === 5) {
		if (!draft.profileImageUri.trim() || !draft.profileImageFile) {
			fields.profileImageUri = copy.profileRequired;
		}
		if (!draft.password.trim()) {
			fields.password = copy.passwordRequired;
		} else if (draft.password.length < MIN_PASSWORD) {
			fields.password = copy.passwordMin;
		}
		if (!draft.confirm.trim()) {
			fields.confirm = copy.confirmRequired;
		} else if (draft.password !== draft.confirm) {
			fields.confirm = copy.passwordMismatch;
		}
		const ackMsg = copy.ackRequired;
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

	const toast = messages.length === 1 ? messages[0] : copy.fixHighlighted;

	return { fields, toast };
}
