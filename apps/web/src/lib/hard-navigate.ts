import { localizeHref } from "@/paraglide/runtime";

/**
 * Full-page navigation that keeps the locale prefix.
 *
 * The app is locale-prefixed (`/en/...`). TanStack `<Link>` localizes for us,
 * but a raw `window.location.assign('/agency')` does not — it lands on the
 * un-prefixed path, which falls through to the marketing home page. That is
 * what sent every successful portal login to the landing page instead of the
 * portal.
 *
 * Any navigation that leaves the router (post-login redirects, the auth guard's
 * kick to /login, signing out) must go through here rather than calling
 * `window.location.assign` directly.
 */
export function hardNavigate(path: string): void {
	if (typeof window === "undefined") return;
	window.location.assign(localizeHref(path));
}
