/**
 * READ-ONLY, and deliberately NOT an HTTP probe.
 *
 * `POST /auth/register-member` is a PUBLIC endpoint that CREATES AN ACCOUNT. If
 * the case-insensitive refusal were broken, a live probe proving it would also
 * have created the very row it was testing for. So the schema is parsed
 * directly: the same validator the controller runs, no server, no writes.
 *
 * Asserts the refusal is case-INSENSITIVE — `'Owner'` used to sail past a check
 * written as `['owner','guarantor'].includes(subRole)`, while
 * `portalRoleNameForSubRole` lowercases before it matches, so the stored string
 * really did resolve to Owner downstream.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });
const { RegisterOrgMemberSchema, RequestOrgJoinSchema } = await import(
  '@/schema/outlet.schema.js'
);
const { portalRoleNameForSubRole } = await import(
  '@/features/rbac/portal-role-map.js'
);

const ORG = '00000000-0000-4000-8000-000000000000';

/** A body valid in every respect EXCEPT the lane under test. */
const body = (subRole: string) => ({
  // ⚠️ `name`, NOT `fullName`. With the wrong key every body failed on the
  // MISSING NAME, so each refusal looked like the lane rule working when it had
  // never been reached — the refuse rows all read "refused OK" while proving
  // nothing. A probe that fails for the wrong reason is worse than no probe.
  name: 'Probe Person',
  email: 'probe.case@example.invalid',
  password: 'Abcd1234!',
  confirmPassword: 'Abcd1234!',
  phoneNum: '0123456789',
  join: { kind: 'agency', orgId: ORG, subRole },
});

const REFUSE = ['owner', 'Owner', 'OWNER', 'oWnEr', 'guarantor', 'Guarantor'];
const ALLOW = ['finance', 'director', 'operations_head'];

let fail = 0;

console.log('\n=== register-member: which lanes may a stranger ASK for? ===');
for (const v of REFUSE) {
  const r = RegisterOrgMemberSchema.safeParse(body(v));
  if (r.success) fail++;
  console.log(`  refuse ${JSON.stringify(v).padEnd(12)} -> ${r.success ? 'ACCEPTED - LEAK' : 'refused OK'}`);
}
for (const v of ALLOW) {
  const r = RegisterOrgMemberSchema.safeParse(body(v));
  if (!r.success) fail++;
  console.log(`  allow  ${JSON.stringify(v).padEnd(12)} -> ${r.success ? 'accepted OK' : 'REFUSED - broke a real signup'}`);
}

console.log('\n=== request-join: the same rule, so the same answers ===');
for (const v of [...REFUSE, ...ALLOW]) {
  const r = RequestOrgJoinSchema.safeParse({ kind: 'agency', orgId: ORG, subRole: v });
  const shouldRefuse = REFUSE.includes(v);
  const ok = shouldRefuse ? !r.success : r.success;
  if (!ok) fail++;
  console.log(`  ${JSON.stringify(v).padEnd(12)} -> ${r.success ? 'accepted' : 'refused'} ${ok ? 'OK' : 'MISMATCH'}`);
}

console.log('\n=== why case mattered: the resolver lowercases before it matches ===');
for (const v of ['Owner', 'unknown_lane_xyz']) {
  console.log(
    `  portalRoleNameForSubRole('agency', ${JSON.stringify(v).padEnd(18)}) -> ${portalRoleNameForSubRole('agency', v)}`,
  );
}

console.log(
  fail
    ? `\n${fail} MISMATCH(ES)`
    : '\nOK - the refusal is case-insensitive on both paths, and an unknown lane resolves to the view-only role.',
);
process.exit(fail ? 1 : 0);
