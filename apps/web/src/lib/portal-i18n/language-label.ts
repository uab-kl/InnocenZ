import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/**
 * Display label for a spoken language held on a PR profile.
 *
 * The STORED value stays English. `PR_LANGUAGE_OPTIONS` is what gets written to
 * the profile and compared against on read, so translating the stored string
 * would orphan every row already saved and break the filter that matches on it.
 * Only what the screen shows changes here — the same split the notification
 * kinds and sub-role labels use.
 *
 * Unknown values pass through untouched rather than being blanked or replaced:
 * a PR may have a language typed by hand (the picker allows free entry), and
 * showing it as-is is right where inventing a translation would not be.
 */
export function languageLabel(raw: string, t: PortalTranslations): string {
	const map: Record<string, string> = {
		english: t.languages.english,
		mandarin: t.languages.mandarin,
		cantonese: t.languages.cantonese,
		malay: t.languages.malay,
		japanese: t.languages.japanese,
		korean: t.languages.korean,
		thai: t.languages.thai,
		hindi: t.languages.hindi,
		tagalog: t.languages.tagalog,
		vietnamese: t.languages.vietnamese,
		tamil: t.languages.tamil,
		hokkien: t.languages.hokkien,
		// Present in live data alongside the picker's own list.
		chinese: t.languages.chinese,
		indonesian: t.languages.indonesian,
	};
	return map[raw.trim().toLowerCase()] ?? raw;
}

/** Join a PR's languages for display — "英语 · 粤语". */
export function languageListLabel(
	langs: readonly string[],
	t: PortalTranslations,
): string {
	return langs.map((l) => languageLabel(l, t)).join(" · ");
}

/**
 * Display label for a PR's ethnicity.
 *
 * Same split as `languageLabel`: `pr.race` is the STORED value and Manage PR's
 * filter compares against it (`p.race !== race`), so only the rendered text
 * changes. Unrecognised values pass through — the field accepts free text.
 */
export function raceLabel(raw: string, t: PortalTranslations): string {
	const map: Record<string, string> = {
		chinese: t.races.chinese,
		malay: t.races.malay,
		indian: t.races.indian,
		indonesian: t.races.indonesian,
		thai: t.races.thai,
		vietnamese: t.races.vietnamese,
		filipino: t.races.filipino,
		other: t.races.other,
	};
	return map[raw.trim().toLowerCase()] ?? raw;
}

/**
 * Display label for an outlet PR tier.
 *
 * `OUTLET_PR_TIERS` ("Tier I"…"Tier V", "Servant") are the STORED values and
 * also the KEYS of the per-outlet `tierRates` record, so they must never be
 * translated in place — doing so would orphan every saved rate row. Only the
 * rendered text changes. Unknown values pass through.
 */
export function tierLabel(raw: string, t: PortalTranslations): string {
	const map: Record<string, string> = {
		"tier i": t.outletDetail.tier1,
		"tier ii": t.outletDetail.tier2,
		"tier iii": t.outletDetail.tier3,
		"tier iv": t.outletDetail.tier4,
		"tier v": t.outletDetail.tier5,
		// Both spellings appear in live data (backend enums vs demo fixtures).
		tier_1: t.outletDetail.tier1,
		tier_2: t.outletDetail.tier2,
		tier_3: t.outletDetail.tier3,
		tier_4: t.outletDetail.tier4,
		tier_5: t.outletDetail.tier5,
		"tier 1": t.outletDetail.tier1,
		"tier 2": t.outletDetail.tier2,
		"tier 3": t.outletDetail.tier3,
		"tier 4": t.outletDetail.tier4,
		"tier 5": t.outletDetail.tier5,
		servant: t.outletDetail.servant,
		"commission only": t.outletDetail.commissionOnly,
		commissiononly: t.outletDetail.commissionOnly,
	};
	return map[raw.trim().toLowerCase()] ?? raw;
}

/**
 * Display name for a dress code.
 *
 * `DRESS_CODE_OPTIONS` holds the STORED value — it is what a draft carries and
 * what `POST /shift` receives as `dressCode` — so the option `value` must never
 * change. Only the text shown inside the option does. Unknown codes (a custom
 * one the operator typed) pass through as themselves.
 */
export function dressCodeLabel(raw: string, t: PortalTranslations): string {
	const map: Record<string, string> = {
		"black elegant": t.postJob.dcBlackElegant,
		"cocktail attire": t.postJob.dcCocktailAttire,
		"brand uniform": t.postJob.dcBrandUniform,
		"smart casual": t.postJob.dcSmartCasual,
		"formal gown": t.postJob.dcFormalGown,
	};
	return map[raw.trim().toLowerCase()] ?? raw;
}
