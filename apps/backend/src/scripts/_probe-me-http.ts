/**
 * What the RUNNING backend actually returns from /auth/me for one account.
 *
 * Importers/callers: none — standalone probe, run by hand. READ-ONLY over HTTP.
 * Owner's instruction: "they can see the the status can login or not
 * deactivate or active if in approval been declined cannot be the orgs member".
 *
 * Reads the live server rather than the database, because the question is what
 * the CLIENT is handed — a repository that returns a row proves nothing if the
 * controller filters it out, or if the dev server is serving stale code.
 *
 *   cd apps/backend && npx tsx --tsconfig tsconfig.json src/scripts/_probe-me-http.ts <email> <password>
 */
import 'dotenv/config';

const BASE = `http://localhost:${process.env.BACKEND_PORT ?? 7777}/api/v1`;

async function main() {
  const email = process.argv[2] ?? 'probe.member.one@innocenz.test';
  const password = process.argv[3] ?? 'Password123!';

  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const loginBody = (await login.json()) as {
    data?: { accessToken?: string; token?: string };
    message?: string;
  };
  const token = loginBody?.data?.accessToken ?? loginBody?.data?.token;
  console.log(
    `\nlogin ${login.status} ${token ? '(token received)' : `- ${loginBody?.message}`}`,
  );
  if (!token) process.exit(1);

  const me = await fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await me.json()) as {
    data?: {
      email?: string;
      roles?: unknown[];
      organisations?: Record<string, unknown>[];
    };
  };
  const orgs = body?.data?.organisations ?? [];
  console.log(`/auth/me ${me.status} - ${body?.data?.email}`);
  console.log(`roles: ${JSON.stringify(body?.data?.roles)}`);
  console.log(`portals: ${JSON.stringify((body?.data as any)?.portals)}`);
  console.log(`organisations returned: ${orgs.length}`);
  for (const o of orgs) {
    console.log(
      `  ${o.kind} | ${o.name} | membershipStatus=${o.membershipStatus} | orgStatus=${o.orgStatus} | enterable=${o.enterable} | ${o.memberCode}`,
    );
  }
  console.log(
    '\n(a `rejected` membership must NOT appear at all; an `inactive` one must appear with enterable=false)',
  );
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
