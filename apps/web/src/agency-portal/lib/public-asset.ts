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
 * The ONE resolver for a stored PR photo reference.
 *
 * A PR photo arrives as one of three things and each needs a different helper:
 *   - an R2 OBJECT KEY (`user/<id>/comcard/<uuid>.jpg`) — the shape the backend
 *     stores. Only `apiAssetUrl` can turn that into a URL.
 *   - a `/public` demo asset — needs the Vite deploy base, i.e. this file's
 *     `publicAssetPath`.
 *   - an absolute http(s) or data URL — passes through either way.
 *
 * Calling only `publicAssetPath` on the first kind leaves `user/<id>/…`
 * untouched and prepends the Vite base, so the browser requests a path that
 * does not exist and the card renders a broken image. That is the whole bug —
 * `managedPrFromBackend` resolves its own photos correctly, but every caller
 * that builds a comcard preview by hand (Approvals) skipped the resolver.
 *
 * Returns null rather than a guess: an R2 key with no public base configured is
 * "we cannot show this photo", not "try it as a local file".
 */
export function prPhotoSrc(ref: string | null | undefined): string | null {
	if (!ref) return null;
	const resolved = apiAssetUrl(ref);
	if (resolved) return resolved;
	if (ref.startsWith("user/")) return null;
	return publicAssetPath(ref);
}
