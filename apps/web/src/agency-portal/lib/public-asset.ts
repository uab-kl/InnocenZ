import { apiAssetUrl } from "@/components/organization/details-sheet-parts";

/** Vite base path (e.g. `/InnocenZ-proto` on GitHub Pages). */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Resolve a `/public` asset path for the current deploy base.
 * Leaves data URLs, blob URLs, and absolute http(s) links unchanged.
 */
export function publicAssetPath(path: string): string {
	if (
		path.startsWith("data:") ||
		path.startsWith("blob:") ||
		/^https?:\/\//i.test(path)
	) {
		return path;
	}
	if (BASE && path.startsWith(`${BASE}/`)) return path;
	if (path.startsWith("/")) return BASE ? `${BASE}${path}` : path;
	return BASE ? `${BASE}/${path}` : `/${path}`;
}

export function publicAssetPathOrNull(
	path: string | null | undefined,
): string | null {
	return path ? publicAssetPath(path) : null;
}

/**
 * The ONE resolver for a PR photo reference, whatever shape it arrives in.
 *
 * There are two owners and they are not interchangeable:
 *   - `apiAssetUrl` owns anything the SERVER stores — R2 object keys
 *     (`user/<id>/comcard/<uuid>.jpg`), backend `/img/…` paths, and absolute
 *     http(s) / data URLs.
 *   - `publicAssetPath` owns `/public` assets, which need the Vite deploy base
 *     (`/InnocenZ-proto` on Pages) and must NOT be sent to the API host.
 *
 * Handing an R2 key to `publicAssetPath` leaves `user/<id>/…` untouched and
 * prefixes the Vite base — a URL nothing serves, which is the broken comcard
 * the agency saw. Handing a `/public` demo path to `apiAssetUrl` is the mirror
 * mistake: it would rewrite it onto the API origin. So the kind is decided
 * FIRST, by prefix, and only then routed. Never try one and fall back to the
 * other — the fallback is what makes a wrong URL look plausible.
 *
 * Null means "there is no photo we can show", not "guess".
 */
export function prPhotoSrc(ref: string | null | undefined): string | null {
	if (!ref) return null;
	// A local object URL for a file the user just picked — already a URL.
	if (ref.startsWith("blob:")) return ref;
	if (
		/^https?:\/\//i.test(ref) ||
		ref.startsWith("data:") ||
		// All THREE R2 key roots, not just `user/`. `apiAssetUrl` has always
		// handled agency/ and outlet/ keys; this gate did not list them, so an
		// outlet logo or an agency logo fell through to `publicAssetPath` and
		// got the Vite base prefixed onto an object key — the exact wrong URL
		// this function's docblock warns about, produced by this function.
		ref.startsWith("user/") ||
		ref.startsWith("agency/") ||
		ref.startsWith("outlet/") ||
		ref.startsWith("/img/") ||
		ref.startsWith("img/")
	) {
		// undefined here is apiAssetUrl saying it cannot resolve the key (no R2
		// public base configured) or that this is the blank-profile placeholder.
		return apiAssetUrl(ref) ?? null;
	}
	return publicAssetPath(ref);
}
