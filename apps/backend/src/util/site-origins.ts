import { env } from '@/env';

/**
 * The web origins that ARE InnocenZ — ONE list, read by the server's CORS
 * (main.ts) and by the public chat's own origin check (landing-chat.routes.ts).
 *
 * There used to be two. CORS admitted both https://innocenz.net and
 * https://www.innocenz.net, while the chat route built its own list from
 * FRONTEND_URL + CORS_ALLOWED_ORIGINS only — so on production, where
 * FRONTEND_URL is the www address, every visitor on the apex domain got a 403
 * from the chat, the website quietly showed its written backup, and Gemini was
 * never asked (found 15 Oct 2026: POST from Origin https://innocenz.net → 403 in
 * 0.1 s while the CORS preflight for the same origin said 200).
 */
function originOf(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed).origin;
  } catch {
    return '';
  }
}

export function buildSiteOrigins(): Set<string> {
  const origins = new Set<string>([
    originOf(env.FRONTEND_URL),
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
  ]);
  // Staging (DuckDNS) + live (.net) — apex and www.
  for (const host of ['innocenz.duckdns.org', 'innocenz.net']) {
    origins.add(`https://${host}`);
    origins.add(`https://www.${host}`);
  }
  for (const raw of (env.CORS_ALLOWED_ORIGINS ?? '').split(',')) origins.add(originOf(raw));
  origins.delete('');
  return origins;
}

export const siteOrigins: ReadonlySet<string> = buildSiteOrigins();

/** Our own site — including any localhost port while developing. */
export function isSiteOrigin(origin: string): boolean {
  if (siteOrigins.has(origin)) return true;
  return env.NODE_ENV === 'development' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}
