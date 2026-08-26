import { countries } from 'country-codes-flags-phone-codes';
import {
	Building2,
	ClipboardList,
	MapPin,
	Phone,
	Shield,
	UserIcon,
	type IconComponent,
} from '../../components/icons';
import { STATES_BY_COUNTRY, statesForCountry } from './imi-states';

export { STATES_BY_COUNTRY, statesForCountry };

/**
 * Wizard step icons, in order. The step TITLE and SUBTITLE are rendered from
 * `t.signup.steps[i]` — they are not kept here, because an English copy beside
 * the icon is a fallback that quietly ships English when the dictionary moves.
 */
export const STEPS: IconComponent[] = [
	UserIcon,
	MapPin,
	Building2,
	Shield,
	ClipboardList,
	Phone,
];

export type CountryDialOption = {
	/** ISO 3166-1 alpha-2 */
	countryCode: string;
	/** E.164 calling code with leading `+` */
	dialCode: string;
	name: string;
	/** Flag emoji from country-codes-flags-phone-codes */
	flag: string;
	/** Full row text for search, e.g. `🇲🇾 Malaysia (+60)` */
	label: string;
};

/**
 * Allowed countries for PR signup:
 * - Malaysia (local)
 * - IMI foreign-worker source countries
 *   https://www.imi.gov.my/index.php/en/main-services/foreign-worker/
 */
export const IMI_FOREIGN_WORKER_COUNTRY_CODES = [
	'MY', // Malaysia (local PR / citizen)
	'ID', // Indonesia
	'TH', // Thailand
	'KH', // Cambodia
	'BD', // Bangladesh
	'MM', // Myanmar
	'LA', // Laos
	'VN', // Vietnam
	'PK', // Pakistan
	'LK', // Sri Lanka
	'TM', // Turkmenistan
	'UZ', // Uzbekistan
	'KZ', // Kazakhstan
	'NP', // Nepal
	'PH', // Philippines
	'IN', // India
] as const;

/**
 * ISO → demonym for `user_profile.nationality`.
 * Country pickers keep the country name (e.g. Malaysia); nationality stores
 * Malaysian — same shape as seed-sample-prs.
 */
const NATIONALITY_BY_COUNTRY_CODE: Record<string, string> = {
	MY: 'Malaysian',
	ID: 'Indonesian',
	TH: 'Thai',
	KH: 'Cambodian',
	BD: 'Bangladeshi',
	MM: 'Myanmar',
	LA: 'Lao',
	VN: 'Vietnamese',
	PK: 'Pakistani',
	LK: 'Sri Lankan',
	TM: 'Turkmen',
	UZ: 'Uzbek',
	KZ: 'Kazakh',
	NP: 'Nepali',
	PH: 'Filipino',
	IN: 'Indian',
};

const IMI_CODE_SET = new Set<string>(IMI_FOREIGN_WORKER_COUNTRY_CODES);

/** IMI-allowed countries only — name, flag emoji, and dial code. */
export const COUNTRY_DIAL_OPTIONS: CountryDialOption[] = [...countries]
	.filter(
		(c) =>
			IMI_CODE_SET.has(c.code) &&
			Boolean(c.name) &&
			Boolean(c.dialCode),
	)
	.map((c) => ({
		countryCode: c.code,
		dialCode: c.dialCode.startsWith('+') ? c.dialCode : `+${c.dialCode}`,
		name: c.name,
		flag: c.flag || '',
		label: `${c.flag ? `${c.flag} ` : ''}${c.name} (${c.dialCode})`,
	}))
	.sort((a, b) => a.name.localeCompare(b.name));

export const COUNTRY_BY_CODE: Record<string, CountryDialOption> = Object.fromEntries(
	COUNTRY_DIAL_OPTIONS.map((c) => [c.countryCode, c]),
);

/**
 * Locale copy the option-label resolvers below need. Every list above holds the
 * VALUE that is posted to the backend (country name, demonym, ID type) and
 * never changes; only the label rendered beside it is localised. A module-scope
 * map cannot read the dictionary, so these take the copy as a parameter — pass
 * `t.signup` from inside a component.
 */
export type SignupOptionCopy = {
	countryNames: Record<string, string>;
	nationalityNames: Record<string, string>;
	idTypeNric: string;
	idTypePassport: string;
	idTypeWorkPermit: string;
	idTypeFallback: string;
};

/** Rendered label for a stored country name — passes through when unmapped. */
export function countryLabel(
	name: string,
	copy: Pick<SignupOptionCopy, 'countryNames'>,
): string {
	return copy.countryNames[name] ?? name;
}

/** Rendered label for a stored nationality demonym — passes through when unmapped. */
export function nationalityLabel(
	demonym: string,
	copy: Pick<SignupOptionCopy, 'nationalityNames'>,
): string {
	return copy.nationalityNames[demonym] ?? demonym;
}

/** Rendered label for a stored `ID_TYPES` value. Empty falls back to a generic word. */
export function idTypeLabel(
	idType: string,
	copy: Pick<
		SignupOptionCopy,
		'idTypeNric' | 'idTypePassport' | 'idTypeWorkPermit' | 'idTypeFallback'
	>,
): string {
	if (idType === 'NRIC') return copy.idTypeNric;
	if (idType === 'Passport') return copy.idTypePassport;
	if (idType === 'Work permit') return copy.idTypeWorkPermit;
	return copy.idTypeFallback;
}

/**
 * Dial-code picker rows. `value` stays the ISO code; the English name is kept
 * inside `label` so the search box still matches "Malaysia" in any locale.
 */
export function dialPickerOptions(copy: Pick<SignupOptionCopy, 'countryNames'>) {
	return COUNTRY_DIAL_OPTIONS.map((c) => {
		const shown = countryLabel(c.name, copy);
		return {
			value: c.countryCode,
			label: shown === c.name ? c.label : `${c.label} ${shown}`,
			flag: c.flag,
			name: shown,
			meta: c.dialCode,
		};
	});
}

/** Address country picker — `value` stays the English name that is stored. */
export function countryPickerOptions(copy: Pick<SignupOptionCopy, 'countryNames'>) {
	return COUNTRY_DIAL_OPTIONS.map((c) => {
		const shown = countryLabel(c.name, copy);
		return {
			value: c.name,
			label: `${c.flag ? `${c.flag} ` : ''}${shown}`,
			flag: c.flag,
			name: shown,
		};
	});
}

/** Nationality picker — `value` stays the demonym stored on `user_profile`. */
export function nationalityPickerOptions(
	copy: Pick<SignupOptionCopy, 'nationalityNames'>,
) {
	return COUNTRY_DIAL_OPTIONS.map((c) => {
		const demonym = NATIONALITY_BY_COUNTRY_CODE[c.countryCode] ?? c.name;
		const shown = nationalityLabel(demonym, copy);
		return {
			value: demonym,
			label: `${c.flag ? `${c.flag} ` : ''}${shown}`,
			flag: c.flag,
			name: shown,
		};
	});
}

/** Malaysia states — same list as `STATES_BY_COUNTRY.Malaysia`. */
export const MY_STATES = [...STATES_BY_COUNTRY.Malaysia];

export const ID_TYPES = ['NRIC', 'Passport', 'Work permit'] as const;

/** Demonym stored on `user_profile.nationality` for MY — NRIC is MY-only. */
export const MALAYSIAN_NATIONALITY = 'Malaysian';

/** NRIC only for Malaysians; everyone else gets Passport / Work permit. */
export function idTypesForNationality(
	nationality: string | null | undefined,
): readonly (typeof ID_TYPES)[number][] {
	if (nationality?.trim() === MALAYSIAN_NATIONALITY) {
		return ID_TYPES;
	}
	return ['Passport', 'Work permit'];
}

/** ID-type picker rows — `value` stays the English enum, only the label moves. */
export function idTypePickerOptions(
	nationality: string | null | undefined,
	copy: Pick<
		SignupOptionCopy,
		'idTypeNric' | 'idTypePassport' | 'idTypeWorkPermit' | 'idTypeFallback'
	>,
) {
	return idTypesForNationality(nationality).map((value) => ({
		value,
		label: idTypeLabel(value, copy),
	}));
}

export const NRIC_LENGTH = 12;
export const CODE_LENGTH = 6;
export const MIN_PASSWORD = 6; // matches RegisterSchema on the backend
export const RESEND_SECONDS = 60;
