import { afterEach, describe, expect, it } from "vitest";
import { resolvePublicPageLocale } from "./public-page-locale";

const LANDING_KEY = "innocenz-landing-locale";
const PORTAL_KEY = "innocenz-portal-locale";

describe("resolvePublicPageLocale — the language of /about and /legal", () => {
	afterEach(() => {
		localStorage.removeItem(LANDING_KEY);
		localStorage.removeItem(PORTAL_KEY);
	});

	it("follows a 中文 pick made on the landing page", () => {
		localStorage.setItem(LANDING_KEY, "zh");
		expect(resolvePublicPageLocale()).toBe("zh");
	});

	it("lets the landing pick win over a different portal pick", () => {
		localStorage.setItem(LANDING_KEY, "en");
		localStorage.setItem(PORTAL_KEY, "zh");
		expect(resolvePublicPageLocale()).toBe("en");
	});

	it("falls back to the portal's own pick when the landing has none", () => {
		localStorage.setItem(PORTAL_KEY, "zh");
		expect(resolvePublicPageLocale()).toBe("zh");
	});

	it("ignores a landing value it does not recognise", () => {
		localStorage.setItem(LANDING_KEY, "fr");
		localStorage.setItem(PORTAL_KEY, "zh");
		expect(resolvePublicPageLocale()).toBe("zh");
	});
});
