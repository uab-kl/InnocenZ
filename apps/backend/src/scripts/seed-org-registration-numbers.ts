/**
 * Put every organisation's three registration numbers into the real Malaysian
 * formats (owner, 9 Sep 2026: "follow this format new").
 *
 *   cd apps/backend
 *   npx tsx --tsconfig tsconfig.json src/scripts/seed-org-registration-numbers.ts          # dry run
 *   npx tsx --tsconfig tsconfig.json src/scripts/seed-org-registration-numbers.ts --apply
 *
 * ── The three documents, and why they are three columns ──────────────────
 *
 * `ssm_no`              SSM's standard since 2019: TWELVE DIGITS, no letters,
 *                       `YYYY` (year of incorporation) + `XX` (entity code)
 *                       + `NNNNNN` (running number) — e.g. 202601024567.
 *                       Entity code 01 = local company (Sdn. Bhd.), which is
 *                       what every organisation here is; 03 would be a sole
 *                       proprietorship.
 *
 * `registration_no_old` The pre-2019 number the same company still carries,
 *                       conventionally shown in brackets after the new one —
 *                       1456789-W. OPTIONAL, and not a matter of taste: the old
 *                       format was retired in 2019, so a company incorporated
 *                       after that NEVER HAD ONE. Only rows whose 12-digit
 *                       number begins with a year before 2019 get one, and any
 *                       later row holding one has it CLEARED — a bracketed
 *                       number on a 2026 company is a fact that cannot exist.
 *
 * `business_license`    NOT issued by SSM at all. A local council grants it,
 *                       per premises, renewed annually — so its format is that
 *                       council's, not a national standard. Hence the map
 *                       below rather than one generator: DBKL numbers look
 *                       nothing like MBPJ's, and inventing a uniform format
 *                       would be the most convincing kind of wrong.
 *
 * ── The rules it obeys ───────────────────────────────────────────────────
 *
 * 1. A VALUE ALREADY IN THE RIGHT SHAPE IS KEPT. Atlas's `202301000001` is a
 *    valid 12-digit number and survives untouched; `SSM-WWM-0001`, a
 *    placeholder from a seed script, does not. This is deliberately NOT
 *    "blanks only" — the owner asked for the format to be applied, and every
 *    non-conforming value here is generated demo data.
 *
 * 2. DETERMINISTIC. Digits come from a hash of the organisation's own uuid, so
 *    the dry run prints exactly what `--apply` writes and a re-run is a no-op.
 *
 * 3. UNIQUE ACROSS BOTH TABLES, checked against one registry loaded before
 *    generation starts. None of the three columns carries a unique index —
 *    they are documents, not identifiers — which is why the check is here.
 *
 * 4. AN UNKNOWN CITY GETS NO LICENCE. There is no generic council. Skipped and
 *    reported, because a made-up authority is worse than an empty field.
 */
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { AgencyTable } from '@/features/agency/agency.model';
import { OutletTable } from '@/features/outlet/outlet.model';

const APPLY = process.argv.includes('--apply');

/** Local authorities, by the city they govern. */
const COUNCILS: Record<string, { code: string; style: 'dbkl' | 'slash' }> = {
  'kuala lumpur': { code: 'DBKL', style: 'dbkl' },
  'petaling jaya': { code: 'MBPJ', style: 'slash' },
  'shah alam': { code: 'MBSA', style: 'slash' },
  'johor bahru': { code: 'MBJB', style: 'slash' },
  subang: { code: 'MBSJ', style: 'slash' },
  'subang jaya': { code: 'MBSJ', style: 'slash' },
};

/** 12 digits, no letters, no separators. */
const SSM_NEW = /^\d{12}$/;
/** Pre-2019: a run of digits and a check letter, e.g. 1456789-W. */
const SSM_OLD = /^\d{6,9}-[A-Z]$/;
const LICENCE_DBKL = /^DBKL\.BP\.\d{4}\.\d{5}$/;
const LICENCE_SLASH = /^[A-Z]{4}\/[A-Z]\d{2}\/\d{2}\/\d{6}$/;

/** FNV-1a over the uuid: stable, so a row always proposes the same numbers. */
function seedOf(id: string): number {
  let hash = 0x811c9dc5;
  for (const char of id) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Nth draw from one seed, so each column gets its own digits. */
function draw(seed: number, index: number, modulo: number): number {
  return (Math.imul(seed ^ (index * 0x9e3779b9), 0x85ebca6b) >>> 0) % modulo;
}

/** The trailing letter on an old-format number — a convention, not a checksum. */
const CHECK_LETTERS = 'ABDHKMPTVWX';

/** SSM replaced the old format in 2019. Incorporated after that, you never had one. */
const OLD_FORMAT_RETIRED = 2019;

function build(
  id: string,
  year: number,
  city: string | null,
  taken: Set<string>,
): { ssm: string; old: string | null; licence: string | null } {
  const seed = seedOf(id);

  let ssm = '';
  for (let bump = 0; bump < 500; bump += 1) {
    // Entity code 01 — every organisation on this platform is a company.
    const running = String(draw(seed, 1 + bump, 1000000)).padStart(6, '0');
    ssm = `${year}01${running}`;
    if (!taken.has(ssm)) break;
  }

  let old: string | null = null;
  if (year < OLD_FORMAT_RETIRED) {
    for (let bump = 0; bump < 500; bump += 1) {
      const digits = String(draw(seed, 500 + bump, 9000000) + 1000000);
      const letter = CHECK_LETTERS[draw(seed, 900 + bump, CHECK_LETTERS.length)];
      old = `${digits}-${letter}`;
      if (!taken.has(old)) break;
    }
  }

  const council = COUNCILS[(city ?? '').trim().toLowerCase()];
  let licence: string | null = null;
  if (council) {
    for (let bump = 0; bump < 500; bump += 1) {
      licence =
        council.style === 'dbkl'
          ? // DBKL.BP.<year>.<running> — BP for Bangunan/Premis.
            `${council.code}.BP.${year}.${String(
              draw(seed, 1300 + bump, 100000),
            ).padStart(5, '0')}`
          : // MBPJ/L03/<yy>/<running> — L03 is the licence category.
            `${council.code}/L03/${String(year % 100).padStart(2, '0')}/${String(
              draw(seed, 1700 + bump, 1000000),
            ).padStart(6, '0')}`;
      if (!taken.has(licence)) break;
    }
  }

  return { ssm, old, licence };
}

type Row = {
  id: string;
  name: string;
  ssm: string | null;
  old: string | null;
  licence: string | null;
  city: string | null;
  createdAt: Date;
};

const agencies: Row[] = await db
  .select({
    id: AgencyTable.id,
    name: AgencyTable.name,
    ssm: AgencyTable.ssmNo,
    old: AgencyTable.registrationNoOld,
    licence: AgencyTable.businessLicense,
    city: AgencyTable.city,
    createdAt: AgencyTable.createdAt,
  })
  .from(AgencyTable)
  .orderBy(asc(AgencyTable.createdAt), asc(AgencyTable.id));

const outlets: Row[] = await db
  .select({
    id: OutletTable.id,
    name: OutletTable.name,
    ssm: OutletTable.ssmNo,
    old: OutletTable.registrationNoOld,
    licence: OutletTable.businessLicense,
    city: OutletTable.city,
    createdAt: OutletTable.createdAt,
  })
  .from(OutletTable)
  .orderBy(asc(OutletTable.createdAt), asc(OutletTable.id));

// Everything already canonical is reserved before anything is minted.
const taken = new Set<string>();
for (const row of [...agencies, ...outlets]) {
  if (row.ssm && SSM_NEW.test(row.ssm)) taken.add(row.ssm);
  if (row.old && SSM_OLD.test(row.old)) taken.add(row.old);
  if (
    row.licence &&
    (LICENCE_DBKL.test(row.licence) || LICENCE_SLASH.test(row.licence))
  ) {
    taken.add(row.licence);
  }
}
console.log(`${taken.size} value(s) already in the right format — kept\n`);

let changed = 0;
const noCouncil: string[] = [];

for (const [kind, rows] of [
  ['agency', agencies],
  ['venue', outlets],
] as const) {
  for (const row of rows) {
    const year = new Date(row.createdAt).getFullYear();
    const next = build(row.id, year, row.city, taken);

    const ssm = row.ssm && SSM_NEW.test(row.ssm) ? row.ssm : next.ssm;
    // The year to judge by is the one in the FINAL 12-digit number, not the row’s
    // created_at: Atlas kept `202301…` and Testing 2 kept `200410…`, and it is
    // those years — 2023 and 2004 — that say whether the company ever held an
    // old-format number, not the day someone seeded the row.
    const incorporated = Number(ssm.slice(0, 4));
    const old =
      incorporated >= OLD_FORMAT_RETIRED
        ? // Retired before this company existed. Clearing is the point of the
          // pass: a bracketed number here would be a document that was never
          // issued.
          null
        : row.old && SSM_OLD.test(row.old)
          ? row.old
          : (next.old ?? null);
    const licenceOk =
      row.licence &&
      (LICENCE_DBKL.test(row.licence) || LICENCE_SLASH.test(row.licence));
    const licence = licenceOk ? row.licence : next.licence;
    if (!licence) noCouncil.push(`${row.name} (city: ${row.city ?? 'none'})`);

    taken.add(ssm);
    if (old) taken.add(old);
    if (licence) taken.add(licence);

    if (ssm === row.ssm && old === row.old && licence === row.licence) continue;
    changed += 1;

    console.log(`  ${kind.padEnd(6)} ${row.name}`);
    if (ssm !== row.ssm) console.log(`      ssm      ${row.ssm ?? '(none)'} -> ${ssm}`);
    if (old !== row.old) {
      console.log(`      old      ${row.old ?? '(none)'} -> ${old ?? '(none — incorporated after 2019)'}`);
    }
    if (licence !== row.licence) {
      console.log(
        `      licence  ${row.licence ?? '(none)'} -> ${licence ?? '(no council)'}`,
      );
    }

    if (APPLY) {
      const values = {
        ssmNo: ssm,
        // Written even when null — clearing is a real outcome here.
        registrationNoOld: old,
        ...(licence ? { businessLicense: licence } : {}),
      };
      if (kind === 'agency') {
        await db.update(AgencyTable).set(values).where(eq(AgencyTable.id, row.id));
      } else {
        await db.update(OutletTable).set(values).where(eq(OutletTable.id, row.id));
      }
    }
  }
}

if (changed === 0) console.log('  (everything already conforms)');
if (noCouncil.length) {
  console.log(`\nNo council for: ${noCouncil.join(', ')} — licence left as it was.`);
}
console.log(
  APPLY ? `\n${changed} organisation(s) updated.` : `\n${changed} would change — add --apply.`,
);
process.exit(0);
