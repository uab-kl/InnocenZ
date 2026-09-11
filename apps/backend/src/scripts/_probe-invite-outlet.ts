/**
 * Invite one existing account to a venue's team and print the RAW accept link.
 *
 * Importers/callers: none — standalone probe, run by hand.
 * Affected API: calls the existing `POST /outlet/:id/members` as the venue
 * owner. Creates an INVITE row; grants nothing until the invitee accepts.
 * Owner's instruction: "any untested do test for me" — this builds the
 * two-organisation account that has never existed, so the login chooser can
 * finally be seen.
 *
 * ⚠️ The raw token exists ONLY in this response. The row stores its sha256, so
 * reading the column back can never reconstruct a usable link — which is what
 * made the first attempt at this test fail.
 *
 *   cd apps/backend && npx tsx --tsconfig tsconfig.json src/scripts/_probe-invite-outlet.ts <inviteeEmail>
 */
import 'dotenv/config';

const BASE = `http://localhost:${process.env.BACKEND_PORT ?? 7777}/api/v1`;

async function main() {
  const invitee =
    process.argv[2] ?? 'siti.nurhaliza.abdullah@whywemet-finance.test';

  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'emhub@emhub.test',
      password: 'Password123!',
    }),
  });
  const lb = (await login.json()) as {
    data?: { accessToken?: string };
    message?: string;
  };
  const token = lb?.data?.accessToken;
  console.log(`owner login ${login.status} ${token ? 'ok' : `- ${lb?.message}`}`);
  if (!token) process.exit(1);

  const me = await fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const mb = (await me.json()) as {
    data?: { organisations?: { kind: string; id: string; name: string }[] };
  };
  const outlet = (mb?.data?.organisations ?? []).find((o) => o.kind === 'outlet');
  if (!outlet) {
    console.log('owner holds no outlet membership');
    process.exit(1);
  }
  console.log(`venue: ${outlet.name} (${outlet.id})`);

  const res = await fetch(`${BASE}/outlet/${outlet.id}/members`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email: invitee, subRole: 'operations_head' }),
  });
  const body = (await res.json()) as {
    success?: boolean;
    message?: string;
    data?: { acceptUrl?: string; emailed?: boolean };
  };
  console.log(`invite ${res.status}: ${body?.message}`);
  console.log(`emailed: ${body?.data?.emailed}`);
  console.log(`acceptUrl: ${body?.data?.acceptUrl ?? '(none)'}`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
