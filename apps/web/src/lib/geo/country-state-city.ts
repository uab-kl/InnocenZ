import { City, Country, State } from "country-state-city";

/** Default for InnocenZ (MY market). */
export const DEFAULT_COUNTRY_CODE = "MY";

export type GeoCountry = { isoCode: string; name: string };
export type GeoState = { isoCode: string; name: string; countryCode: string };
export type GeoCity = { name: string; stateCode: string; countryCode: string };

export function listCountries(): GeoCountry[] {
	return Country.getAllCountries()
		.map((c) => ({ isoCode: c.isoCode, name: c.name }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function listStates(countryCode: string): GeoState[] {
	if (!countryCode) return [];
	return State.getStatesOfCountry(countryCode)
		.map((s) => ({
			isoCode: s.isoCode,
			name: s.name,
			countryCode: s.countryCode,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function listCities(countryCode: string, stateCode: string): GeoCity[] {
	if (!countryCode || !stateCode) return [];
	return City.getCitiesOfState(countryCode, stateCode)
		.map((c) => ({
			name: c.name,
			stateCode: c.stateCode,
			countryCode: c.countryCode,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function countryName(countryCode: string): string | undefined {
	if (!countryCode) return undefined;
	return Country.getCountryByCode(countryCode)?.name;
}

export function stateName(
	countryCode: string,
	stateCode: string,
): string | undefined {
	if (!countryCode || !stateCode) return undefined;
	return State.getStateByCodeAndCountry(stateCode, countryCode)?.name;
}
