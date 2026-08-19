import {
	countryName,
	DEFAULT_COUNTRY_CODE,
	stateCodeFromName,
	stateName,
} from "@/lib/geo/country-state-city";

/** Shared org address shape for outlet / agency Settings (mirrors signup columns). */
export type OrgAddress = {
	addressLine1: string;
	addressLine2: string;
	city: string;
	postcode: string;
	/** Display / DB value (full state name, as signup writes). */
	state: string;
	/** Display / DB value (full country name). */
	country: string;
	/** ISO state code for cascading selects — not a DB column. */
	stateCode: string;
};

export const EMPTY_ORG_ADDRESS: OrgAddress = {
	addressLine1: "",
	addressLine2: "",
	city: "",
	postcode: "",
	state: "",
	country: "",
	stateCode: "",
};

export function orgAddressFromRow(
	row:
		| {
				addressLine1?: string | null;
				addressLine2?: string | null;
				city?: string | null;
				postcode?: string | null;
				state?: string | null;
				country?: string | null;
		  }
		| null
		| undefined,
): OrgAddress {
	if (!row) return { ...EMPTY_ORG_ADDRESS };
	const state = row.state?.trim() ?? "";
	return {
		addressLine1: row.addressLine1?.trim() ?? "",
		addressLine2: row.addressLine2?.trim() ?? "",
		city: row.city?.trim() ?? "",
		postcode: row.postcode?.trim() ?? "",
		state,
		country: row.country?.trim() ?? "",
		stateCode: stateCodeFromName(DEFAULT_COUNTRY_CODE, state) ?? "",
	};
}

/**
 * Resolve ISO codes → display names for PUT (same as signup register-api).
 * Country is locked to Malaysia.
 */
export function resolveOrgAddressForSave(a: OrgAddress): {
	addressLine1: string;
	addressLine2: string;
	city: string;
	postcode: string;
	state: string;
	country: string;
} {
	const code = a.stateCode.trim();
	const resolvedState =
		(code ? stateName(DEFAULT_COUNTRY_CODE, code) : undefined) ||
		a.state.trim();
	const resolvedCountry =
		countryName(DEFAULT_COUNTRY_CODE) || a.country.trim() || "Malaysia";
	return {
		addressLine1: a.addressLine1.trim(),
		addressLine2: a.addressLine2.trim(),
		city: a.city.trim(),
		postcode: a.postcode.trim(),
		state: resolvedState,
		country: resolvedCountry,
	};
}

/** Display helper — join non-empty parts with commas. */
export function joinOrgAddress(
	a: Partial<OrgAddress> | null | undefined,
): string {
	if (!a) return "";
	return [
		a.addressLine1,
		a.addressLine2,
		a.city,
		a.postcode,
		a.state,
		a.country,
	]
		.map((p) => p?.trim())
		.filter((p): p is string => !!p)
		.join(", ");
}
