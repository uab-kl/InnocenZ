/** Vite base path (e.g. `/InnocenZ-proto` on GitHub Pages). */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/**
 * Resolve a `/public` asset path for the current deploy base.
 * Leaves data URLs, blob URLs, and absolute http(s) links unchanged.
 */
export function publicAssetPath(path: string): string {
  if (
    path.startsWith('data:') ||
    path.startsWith('blob:') ||
    /^https?:\/\//i.test(path)
  ) {
    return path;
  }
  if (BASE && path.startsWith(`${BASE}/`)) return path;
  if (path.startsWith('/')) return BASE ? `${BASE}${path}` : path;
  return BASE ? `${BASE}/${path}` : `/${path}`;
}

export function publicAssetPathOrNull(
  path: string | null | undefined,
): string | null {
  return path ? publicAssetPath(path) : null;
}
