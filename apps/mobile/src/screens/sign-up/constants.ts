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

export const STEPS: { title: string; subtitle: string; icon: IconComponent }[] = [
	{ title: 'Persona', subtitle: 'Your details', icon: UserIcon },
	{ title: 'Address', subtitle: 'Where you live', icon: MapPin },
	{ title: 'Agency', subtitle: 'Optional tie', icon: Building2 },
	{ title: 'Verify', subtitle: 'ID & gallery photos', icon: Shield },
	{ title: 'Summary', subtitle: 'Review & submit', icon: ClipboardList },
	{ title: 'OTP', subtitle: 'Verify your mobile', icon: Phone },
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
 * Allowed nationalities for PR signup:
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

/** Country names for nationality / address country pickers. */
export const NATIONALITIES = COUNTRY_DIAL_OPTIONS.map((c) => c.name);

/** Nationality picker rows with flag (no dial code). */
export const NATIONALITY_OPTIONS = COUNTRY_DIAL_OPTIONS.map((c) => ({
	value: c.name,
	label: `${c.flag ? `${c.flag} ` : ''}${c.name}`,
	flag: c.flag,
	name: c.name,
}));

/** Malaysia states — same list as `STATES_BY_COUNTRY.Malaysia`. */
export const MY_STATES = [...STATES_BY_COUNTRY.Malaysia];

export const ID_TYPES = ['NRIC', 'Passport', 'Work permit'] as const;

export const NRIC_LENGTH = 12;
export const CODE_LENGTH = 6;
export const MIN_PASSWORD = 6; // matches RegisterSchema on the backend
export const RESEND_SECONDS = 60;
