/**
 * Fill the blanks on the ORGANISATION records — `agency` and `outlet`.
 *
 * Every earlier pass this session filled PERSON records (`user`, `user_profile`)
 * and never touched the org tables, so the agency sheet printed "—" for phone
 * while the owner's own account showed one on the screen beside it.
 *
 *   npx tsx --tsconfig tsconfig.json src/scripts/seed-org-details.ts          # dry run
 *   npx tsx --tsconfig tsconfig.json src/scripts/seed-org-details.ts --apply
 *
 * ── The rule that matters here ─────────────────────────────────────────────
 *
 * CONTACT DETAILS ARE COPIED FROM THE REAL OWNER, NEVER INVENTED. `contact_name`,
 * `contact_email` and `contact_phone` are read off the `user` row of the account
 * that actually holds the agency through `agency_user`. So the agency card and
 * the owner's account page cannot disagree — which is exactly what was spotted:
 * David's account showed +60104686830 while his agency showed nothing.
 *
 * ⚠️ It is still a COPY, and a copy is a second home for one fact — the thing
 * the database rules warn about. It is done here only because these columns
 * already exist on `agency` and the sign-up writes them; the honest fix is for
 * the read path to resolve the owner through the FK and drop the columns. Worth
 * doing, out of scope for a data backfill — noted rather than silently
 * entrenched.
 *
 * An ADDRESS cannot be derived from anything, since no other row holds it, so it
 * is generated deterministically per org id and only where the column is blank.
 */
import 'dotenv/config';

import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db/index';
import { UserTable } from '@/features/user/user.model';
import { AgencyTable, AgencyUserTable } from '@/features/agency/agency.model';
import { OutletTable } from '@/features/outlet/outlet.model';

const ACTOR = 'seed-org-details';
const APPLY = process.argv.includes('--apply');

/** Same places the person backfill uses, so an org sits in a real state. */
const PLACES = [
  { state: 'Kuala Lumpur', city: 'Kuala Lumpur', postcodes: ['50450', '55100', '58200'] },
  { state: 'Selangor', city: 'Petaling Jaya', postcodes: ['46050', '47810', '40150'] },
  { state: 'Penang', city: 'George Town', postcodes: ['10450', '11900'] },
  { state: 'Johor', city: 'Johor Bahru', postcodes: ['80100', '81100'] },
  { state: 'Sabah', city: 'Kota Kinabalu', postcodes: ['88300'] },
] as const;

const STREETS = [
  'Jalan Bukit Bintang',
  'Jalan Ampang',
  'Jalan Sultan Ismail',
  'Persiaran KLCC',
  'Jalan Raja Chulan',
  'Persiaran Gurney',
];
const UNITS = ['Level 3', 'Level 8', 'Suite 12-A', 'Unit 5-2', 'Lot 22'];

function seedFrom(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
function makeRng(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T>(rng: () => number, list: readonly T[]): T =>
  list[Math.floor(rng() * list.length) % list.length];
const intBetween = (rng: () => number, lo: number, hi: number) =>
  lo + Math.floor(rng() * (hi - lo + 1));

const isBlank = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim().length === 0);

async function main() {
  const agencies = await db
    .select({
      id: AgencyTable.id,
      name: AgencyTable.name,
      code: AgencyTable.agencyCode,
      contactName: AgencyTable.contactName,
      contactEmail: AgencyTable.contactEmail,
      contactPhone: AgencyTable.contactPhone,
      addressLine1: AgencyTable.addressLine1,
      addressLine2: AgencyTable.addressLine2,
      city: AgencyTable.city,
      postcode: AgencyTable.postcode,
      state: AgencyTable.state,
      country: AgencyTable.country,
    })
    .from(AgencyTable);

  const outlets = await db
    .select({
      id: OutletTable.id,
      name: OutletTable.name,
      ssmNo: OutletTable.ssmNo,
      businessLicense: OutletTable.businessLicense,
      addressLine1: OutletTable.addressLine1,
      addressLine2: OutletTable.addressLine2,
      city: OutletTable.city,
      postcode: OutletTable.postcode,
      state: OutletTable.state,
      country: OutletTable.country,
    })
    .from(OutletTable);

  const agencyOwners = agencies.length
    ? await db
        .select({
          agencyId: AgencyUserTable.agencyId,
          username: UserTable.username,
          email: UserTable.email,
          phone: UserTable.phoneNum,
        })
        .from(AgencyUserTable)
        .innerJoin(UserTable, eq(UserTable.id, AgencyUserTable.userId))
        .where(
          inArray(
            AgencyUserTable.agencyId,
            agencies.map((a) => a.id),
          ),
        )
    : [];
  const ownerOf = new Map<string, (typeof agencyOwners)[number]>();
  for (const o of agencyOwners) if (!ownerOf.has(o.agencyId)) ownerOf.set(o.agencyId, o);

  console.log(`\n${APPLY ? '=== APPLYING ===' : '=== DRY RUN (add --apply) ==='}`);
  let changed = 0;

  for (const a of agencies) {
    const rng = makeRng(seedFrom(a.id));
    const place = pick(rng, PLACES);
    const owner = ownerOf.get(a.id);
    const patch: Record<string, unknown> = {};

    if (isBlank(a.contactName) && owner?.username) patch.contactName = owner.username;
    if (isBlank(a.contactEmail) && owner?.email) patch.contactEmail = owner.email;
    if (isBlank(a.contactPhone) && owner?.phone) patch.contactPhone = owner.phone;

    if (isBlank(a.addressLine1)) {
      patch.addressLine1 = `${intBetween(rng, 1, 120)}, ${pick(rng, STREETS)}`;
    }
    if (isBlank(a.addressLine2)) patch.addressLine2 = pick(rng, UNITS);
    if (isBlank(a.city)) patch.city = place.city;
    if (isBlank(a.postcode)) patch.postcode = pick(rng, place.postcodes);
    if (isBlank(a.state)) patch.state = place.state;
    if (isBlank(a.country)) patch.country = 'Malaysia';

    if (Object.keys(patch).length === 0) continue;
    console.log(`\n  AGENCY ${a.name} (${a.code})`);
    for (const [k, v] of Object.entries(patch)) {
      const from = ['contactName', 'contactEmail', 'contactPhone'].includes(k)
        ? '   <- copied from the owner account'
        : '';
      console.log(`    ${k.padEnd(14)} = ${v}${from}`);
    }
    if (!APPLY) continue;
    await db
      .update(AgencyTable)
      .set({ ...patch, updatedBy: ACTOR, updatedAt: new Date() })
      .where(eq(AgencyTable.id, a.id));
    changed += 1;
  }

  for (const o of outlets) {
    const rng = makeRng(seedFrom(o.id));
    const place = pick(rng, PLACES);
    const patch: Record<string, unknown> = {};

    if (isBlank(o.addressLine1)) {
      patch.addressLine1 = `${intBetween(rng, 1, 120)}, ${pick(rng, STREETS)}`;
    }
    if (isBlank(o.addressLine2)) patch.addressLine2 = pick(rng, UNITS);
    if (isBlank(o.city)) patch.city = place.city;
    if (isBlank(o.postcode)) patch.postcode = pick(rng, place.postcodes);
    if (isBlank(o.state)) patch.state = place.state;
    if (isBlank(o.country)) patch.country = 'Malaysia';
    if (isBlank(o.ssmNo)) patch.ssmNo = `SSM-${intBetween(rng, 100000, 999999)}-X`;
    if (isBlank(o.businessLicense)) patch.businessLicense = `BL-${intBetween(rng, 10000, 99999)}`;

    if (Object.keys(patch).length === 0) continue;
    console.log(`\n  OUTLET ${o.name}`);
    for (const [k, v] of Object.entries(patch)) console.log(`    ${k.padEnd(16)} = ${v}`);
    if (!APPLY) continue;
    await db
      .update(OutletTable)
      .set({ ...patch, updatedBy: ACTOR, updatedAt: new Date() })
      .where(eq(OutletTable.id, o.id));
    changed += 1;
  }

  console.log(`\n${APPLY ? `Updated ${changed} organisation(s).` : 'Nothing written — dry run.'}\n`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
