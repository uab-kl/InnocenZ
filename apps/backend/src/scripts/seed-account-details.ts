/**
 * Fill in every blank sign-up field on every EXISTING account — PR, admin, and
 * every agency/outlet lane role (Owner, Finance, Ops Head, Director, Guarantor).
 *
 *   cd apps/backend
 *   npx tsx --tsconfig tsconfig.json src/scripts/seed-account-details.ts          # dry run
 *   npx tsx --tsconfig tsconfig.json src/scripts/seed-account-details.ts --apply  # write
 *
 * Flags: --apply writes, --no-images skips the R2 uploads (much faster),
 *        --only=pr|web restricts the population.
 *
 * ── The rules this obeys ──────────────────────────────────────────────────
 *
 * 1. BLANKS ONLY. A column that already holds a value is never overwritten, so
 *    re-running is safe and real data is never replaced by a generated one.
 *    Junk that is nevertheless non-blank (`phone_num` = '00000000' on two
 *    accounts) is REPORTED, not silently rewritten: `phone_num` is the login
 *    identifier the mobile app signs in with, and changing it would lock that
 *    account out to fix a cosmetic problem.
 *
 * 2. THE AGE RULE. A Malaysian NRIC's first six digits ARE the birth date, so
 *    every generated IC is built FROM the chosen date of birth and then proved
 *    by round-tripping it back through `dobFromNric` — the same function the API
 *    derives age with. `dob` is then set to that round-tripped value, which makes
 *    an IC/dob conflict impossible by construction rather than by care. Accounts
 *    already in the database that disagree with their own IC are reported and
 *    never edited, because only a human can say which side is right.
 *
 * 3. NO DUPLICATES. `id_no`, `phone_num` and `bank_account_no` must each be
 *    unique. Every existing value is loaded into a registry before generation
 *    starts, and each new value is checked against it and added to it — so a
 *    generated value can collide neither with a stored one nor with another
 *    generated in the same run. `user.phone_num` also carries a UNIQUE index, so
 *    a collision there would be a failed transaction, not a silent duplicate.
 *
 * 4. DETERMINISTIC. Every random draw comes from a PRNG seeded with the account's
 *    own uuid, so a second run proposes exactly the same values as the first.
 *    That is what makes the dry run worth reading: what it prints is what
 *    `--apply` will write.
 *
 * 5. LINKING. Identity lives on `user` + `user_profile` (FK `user_id`) and
 *    nowhere else — no name, IC or phone is copied onto a roster table. Agency
 *    membership is not touched at all: it belongs to `agency_pr`, which already
 *    covers every PR here.
 *
 * Everything generated is SYNTHETIC and shaped for the innocenz-test database.
 */
import 'dotenv/config';

import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { db } from '@/db/index';
import { UserTable } from '@/features/user/user.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { PortalTable } from '@/features/rbac/portal/portal.model';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model';
import { dobFromNric } from '@/features/pr-personnel/ic-dob';
import { idDocObjectKey } from '@/util/user-profile-image';
import { profileImageObjectKey } from '@/util/profile-image';
import { portfolioImageObjectKey } from '@/util/portfolio-image';
import { primeUserFolders } from '@/util/user-folder';
import { r2Configured, r2PutObject } from '@/util/r2';

const ACTOR = 'seed-account-details';
const APPLY = process.argv.includes('--apply');
const SKIP_IMAGES = process.argv.includes('--no-images');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').split('=')[1] ?? '';
/** Give the lane accounts named after their own role a real person's name. */
const RENAME_PLACEHOLDERS = process.argv.includes('--rename-placeholders');
/**
 * Re-render every ID card, whether or not this run changes the data on it.
 *
 * Needed because a card is an IMAGE: the script can see that the name, IC or
 * gender it is about to write differs from the row, but it cannot read the name
 * printed on a PNG already sitting in R2. So a card rendered before an earlier
 * rename stays wrong forever — the run that renamed the person saw a stale card
 * and had no way to know it, and every run after that sees nothing to change.
 * This flag is the way out of that blind spot.
 */
const REGENERATE_CARDS = process.argv.includes('--regenerate-cards');
/**
 * Settle an IC-vs-`dob` disagreement the owner's way: *"age rule (IC wins)"*.
 * Off by default — a stored birth date is somebody's fact, and overwriting one
 * because two columns disagree needs a person to say so.
 */
const TRUST_IC_DOB = process.argv.includes('--trust-ic-dob');
/**
 * The demo-data direction: keep the stored `dob` and re-issue the IC's date
 * digits to match it. Mutually exclusive with `--trust-ic-dob`, which does the
 * reverse; passing both is refused rather than silently resolved, because "which
 * of these two dates is the real one" is the entire question and a default would
 * be answering it by accident.
 */
const IC_FOLLOWS_DOB = process.argv.includes('--ic-follows-dob');
if (TRUST_IC_DOB && IC_FOLLOWS_DOB) {
  throw new Error('--trust-ic-dob and --ic-follows-dob are opposites; pass one.');
}

/** Fixed "today" so a re-run cannot drift someone's age by a day. */
const TODAY = new Date('2026-09-08T00:00:00Z');

// ── deterministic randomness ────────────────────────────────────────────────

/** FNV-1a. Same account id in, same stream of draws out. */
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

const intBetween = (rng: () => number, lo: number, hi: number): number =>
  lo + Math.floor(rng() * (hi - lo + 1));

// ── Malaysian reference data ────────────────────────────────────────────────

/**
 * NRIC birthplace code paired with the state name and a real postcode for it.
 *
 * `state` is spelled exactly as `STATES_BY_COUNTRY.Malaysia` spells it
 * (apps/mobile/src/screens/sign-up/imi-states.ts) — "Penang", not "Pulau
 * Pinang"; "Malacca", not "Melaka". A near-miss here would store a state the
 * sign-up's own picker cannot select, so the value would be unusable the moment
 * anyone opened the form to edit it.
 */
const PLACES = [
  { icCode: '01', state: 'Johor', city: 'Johor Bahru', postcodes: ['80100', '81100', '79100'] },
  { icCode: '02', state: 'Kedah', city: 'Alor Setar', postcodes: ['05100', '06000'] },
  { icCode: '03', state: 'Kelantan', city: 'Kota Bharu', postcodes: ['15200', '16100'] },
  { icCode: '04', state: 'Malacca', city: 'Melaka', postcodes: ['75100', '75450'] },
  { icCode: '05', state: 'Negeri Sembilan', city: 'Seremban', postcodes: ['70100', '71800'] },
  { icCode: '06', state: 'Pahang', city: 'Kuantan', postcodes: ['25200', '26600'] },
  { icCode: '07', state: 'Penang', city: 'George Town', postcodes: ['10450', '11900', '14000'] },
  { icCode: '08', state: 'Perak', city: 'Ipoh', postcodes: ['30250', '31400'] },
  { icCode: '09', state: 'Perlis', city: 'Kangar', postcodes: ['01000'] },
  { icCode: '10', state: 'Selangor', city: 'Petaling Jaya', postcodes: ['46050', '47810', '40150'] },
  { icCode: '11', state: 'Terengganu', city: 'Kuala Terengganu', postcodes: ['20200'] },
  { icCode: '12', state: 'Sabah', city: 'Kota Kinabalu', postcodes: ['88300', '89500'] },
  { icCode: '13', state: 'Sarawak', city: 'Kuching', postcodes: ['93100', '96000'] },
  { icCode: '14', state: 'Kuala Lumpur', city: 'Kuala Lumpur', postcodes: ['50450', '55100', '58200'] },
  { icCode: '15', state: 'Labuan', city: 'Labuan', postcodes: ['87000'] },
  { icCode: '16', state: 'Putrajaya', city: 'Putrajaya', postcodes: ['62100'] },
] as const;

const STREETS = [
  'Jalan Bukit Bintang',
  'Jalan Ampang',
  'Jalan Sultan Ismail',
  'Jalan Tun Razak',
  'Persiaran Gurney',
  'Jalan Kelawai',
  'Lorong Maarof',
  'Jalan SS2/24',
  'Jalan Damai Perdana',
  'Jalan Puteri 1/2',
  'Jalan Raja Chulan',
  'Persiaran KLCC',
];

const UNIT_PREFIX = ['A', 'B', 'C', 'D'];
const BUILDINGS = [
  'Residensi Damai',
  'The Vertica',
  'Pangsapuri Seri Mutiara',
  'Menara Impian',
  'Vista Alam',
  'Sunway Vivaldi',
];

/** Ethnicity drives the name, the race column and the language mix together. */
type Ethnicity = 'chinese' | 'malay' | 'indian';

const CHINESE_SURNAMES = ['Tan', 'Lim', 'Lee', 'Ng', 'Wong', 'Chan', 'Goh', 'Ooi', 'Yeoh', 'Chong', 'Teoh', 'Koh', 'Sim', 'Loh', 'Cheah'];
const CHINESE_GIVEN_F = ['Mei Ling', 'Wei Qi', 'Jia Yi', 'Xin Yi', 'Hui Min', 'Pei Shan', 'Li Wen', 'Zhi Ying', 'Shu Fen', 'Yan Ting'];
const CHINESE_GIVEN_M = ['Wei Jie', 'Jun Hao', 'Zhi Wei', 'Kah Wai', 'Yong Sheng', 'Chee Keong', 'Ming Han', 'Jia Xuan'];

const MALAY_GIVEN_F = ['Nurul Aina', 'Siti Aisyah', 'Nur Farah', 'Aisyah Sofea', 'Nurin Batrisyia', 'Puteri Damia'];
const MALAY_GIVEN_M = ['Muhammad Haziq', 'Ahmad Zulkifli', 'Mohd Firdaus', 'Amirul Hakim', 'Muhammad Danish'];
const MALAY_FATHER = ['Rahman', 'Ismail', 'Abdullah', 'Zainal', 'Othman', 'Hamzah', 'Yusof'];

const INDIAN_GIVEN_F = ['Priya', 'Kavitha', 'Shalini', 'Anjali', 'Meena'];
const INDIAN_GIVEN_M = ['Rajesh', 'Suresh', 'Vikneswaran', 'Arun', 'Dinesh'];
const INDIAN_FATHER = ['Kumar', 'Muthusamy', 'Ramasamy', 'Subramaniam', 'Krishnan'];

/**
 * Given names already present on the seeded accounts. RECOGNITION ONLY — these
 * are never used to build a name, only to read the ones already there, which is
 * how "Michelle Lim", "Frank Lee" and "Arjun Kumar" get a gender at all.
 *
 * `Arjun` is the reason this list has to exist separately from the generation
 * pools: those hold `Arun`, so "Arjun Kumar" matched nothing, kept a male
 * nickname on a female profile, and looked like the rename had simply skipped
 * her. A vocabulary good enough to WRITE names is not automatically good enough
 * to READ the ones somebody else wrote.
 */
const WESTERN_GIVEN_F = ['Michelle', 'Alice', 'Angie', 'Hannah', 'Janice', 'Vicky', 'Victoria'];
const WESTERN_GIVEN_M = [
  'Frank',
  'Daniel',
  'David',
  'Kevin',
  'Jason',
  'Arjun',
  'Haziq',
  'Razif',
  'Zulkifli',
  'Khoon',
  'Siaw Long',
  // NOT "Yao Zong" or "Jun Yu". Adding them made `nameGender` recognise two real
  // colleagues as male, which in turn made them eligible for the sub-role
  // rename and queued their actual names for replacement. Leaving a real
  // person's name unrecognised is the safe failure here: unrecognised means the
  // script keeps its hands off.
];

const LANGUAGE_POOL: Record<Ethnicity, string[][]> = {
  chinese: [
    ['English', 'Mandarin'],
    ['English', 'Mandarin', 'Cantonese'],
    ['English', 'Mandarin', 'Hokkien'],
    ['English', 'Mandarin', 'Malay'],
    ['English', 'Cantonese', 'Malay'],
  ],
  malay: [
    ['Malay', 'English'],
    ['Malay', 'English', 'Mandarin'],
    ['Malay', 'English', 'Thai'],
  ],
  indian: [
    ['English', 'Tamil'],
    ['English', 'Tamil', 'Malay'],
    ['English', 'Tamil', 'Hindi'],
  ],
};

/** Bank name with the account-number length that bank actually issues. */
const BANKS = [
  { name: 'Maybank', digits: 12 },
  { name: 'CIMB Bank', digits: 14 },
  { name: 'Public Bank', digits: 10 },
  { name: 'RHB Bank', digits: 14 },
  { name: 'Hong Leong Bank', digits: 12 },
  { name: 'AmBank', digits: 13 },
  { name: 'Bank Islam', digits: 14 },
] as const;

/** Malaysian mobile prefixes. 011 carries eight subscriber digits, the rest seven. */
const MOBILE_PREFIXES = ['10', '11', '12', '13', '14', '16', '17', '18', '19'] as const;

// ── helpers ─────────────────────────────────────────────────────────────────

const digitsOnly = (value: string): string => value.replace(/\D/g, '');
const iso = (date: Date): string => date.toISOString().slice(0, 10);

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * A stored phone that is present but cannot be dialled — '00000000',
 * '0000000000', '+admin-d31f28719a87'. Reported, never rewritten: see rule 1.
 */
function isJunkPhone(value: string | null): boolean {
  if (!value) return false;
  const digits = digitsOnly(value);
  if (digits.length < 9) return true;
  if (/^0+$/.test(digits)) return true;
  return !/^(60|0)?1\d{8,9}$/.test(digits);
}

/**
 * Every account on this platform is female — OWNER'S RULE, 8 Sep 2026:
 * *"and make all the gender is female"*. PRs are promoters, and the owner wants
 * the whole test population consistent rather than a mix seeded by chance.
 */
const GENDER: 'female' = 'female';

/**
 * Gender as the IC states it: the last digit is odd for male, even for female.
 *
 * READ-ONLY here. It is used to detect disagreement, never to settle it — see
 * `alignNricToGender` for which side gives way, and why that is the opposite of
 * the age rule.
 *
 * Null when there is no parseable NRIC — a passport carries no such digit.
 */
function genderFromNric(idNo: string | null | undefined): 'male' | 'female' | null {
  if (!idNo || !dobFromNric(idNo, TODAY)) return null;
  const digits = digitsOnly(idNo);
  return Number(digits[digits.length - 1]) % 2 === 1 ? 'male' : 'female';
}

/**
 * Re-issue an NRIC so its gender digit agrees with the person — OWNER'S RULE,
 * 8 Sep 2026: *"gender is girl so ic also follow"*.
 *
 * ⚠️ This runs the OPPOSITE way to the age rule, deliberately, and the two only
 * look contradictory until you ask what the digits ARE. A birth date is not
 * merely encoded in the first six: it IS those six, so `dobFromNric` decodes
 * rather than infers, and there the IC is simply the better copy of a fact.
 * Gender is encoded only by a parity convention, and these demo ICs were
 * hand-written without honouring it — so the person is the authority and the
 * number is the thing that is wrong. Reading it the other way round would have
 * stamped `male` on "Victoria Tan Mei Lin" and on "Nurul Aina BINTI Rahman",
 * binti meaning daughter of.
 *
 * Only the final digit moves. The first six stay untouched, so the birth date —
 * and therefore the age — is exactly what it was; the loop re-proves that with
 * `dobFromNric` instead of trusting this paragraph. `taken` keeps the re-issued
 * number unique, and the old value is released so it cannot block a later one.
 *
 * Returns null when the IC already agrees, or is not an NRIC at all.
 */
/**
 * Re-issue an NRIC so its DATE digits match the stored `dob` — the demo-data
 * direction of the owner's rule, 8 Sep 2026: *"ic follow the age from database
 * for current demo, if real user make the age need exactly is related to ic
 * number"*.
 *
 * The two halves of that sentence are not in conflict, and getting the split
 * right matters:
 *
 *  · DEMO rows carry a `dob` somebody chose and an IC this project fabricated,
 *    so the fabricated half gives way — that is this function.
 *  · A REAL account is the opposite: nothing derives a date from `dob` at all.
 *    `derivedAge` reads the IC first and always has, so a real user's age is
 *    already "exactly related to the IC number" with no code change needed.
 *    This function must therefore never run over real data.
 *
 * Only the first six digits move. The birthplace code, the serial and the
 * gender parity digit are all preserved, so the gender alignment done elsewhere
 * is not undone, and the result is checked by round-tripping through
 * `dobFromNric` before it is returned.
 *
 * Returns null when the IC already encodes that date, or is not an NRIC.
 */
function alignNricToDob(idNo: string, dob: string, taken: Set<string>): string | null {
  if (!dobFromNric(idNo, TODAY)) return null;
  if (dobFromNric(idNo, TODAY) === dob) return null;

  const born = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return null;

  const yy = String(born.getUTCFullYear() % 100).padStart(2, '0');
  const mm = String(born.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(born.getUTCDate()).padStart(2, '0');

  const digits = digitsOnly(idNo);
  const tail = digits.slice(6); // birthplace + serial + gender digit, untouched
  const candidate = `${yy}${mm}${dd}${tail}`;

  // The whole point is that the new number reads back as this date. If the
  // century convention lands it elsewhere, refuse rather than store a number
  // that decodes to a different birthday than the column it was built from.
  if (dobFromNric(candidate, TODAY) !== dob) return null;
  if (taken.has(candidate)) return null;

  taken.delete(digits);
  taken.add(candidate);
  return `${candidate.slice(0, 6)}-${candidate.slice(6, 8)}-${candidate.slice(8)}`;
}

function alignNricToGender(
  idNo: string,
  gender: 'male' | 'female',
  taken: Set<string>,
): string | null {
  const dob = dobFromNric(idNo, TODAY);
  if (!dob) return null;
  if (genderFromNric(idNo) === gender) return null;

  const digits = digitsOnly(idNo);
  const head = digits.slice(0, 11);
  const current = Number(digits[11]);

  // Nearest same-parity digit first, so the number moves as little as it can:
  // 7 -> 8, and only if 8 is taken 6, then 0, 4, 2.
  const wanted = gender === 'male' ? [1, 3, 5, 7, 9] : [0, 2, 4, 6, 8];
  const ordered = [...wanted].sort(
    (a, b) => Math.abs(a - current) - Math.abs(b - current) || a - b,
  );

  for (const last of ordered) {
    const candidate = `${head}${last}`;
    if (taken.has(candidate)) continue;
    if (dobFromNric(candidate, TODAY) !== dob) continue; // the date must not move
    taken.delete(digits);
    taken.add(candidate);
    // Re-emit punctuated, the way the rest of the stored ICs are written.
    return `${candidate.slice(0, 6)}-${candidate.slice(6, 8)}-${candidate.slice(8)}`;
  }
  return null;
}

/**
 * Is this "name" actually a label for the seat rather than a person?
 *
 * "Emhub Testing Guarantor", "Atlas Agency Director", "Tes" — the lane accounts
 * were seeded named after the lane, which reads as a placeholder everywhere the
 * admin sheet prints a person.
 *
 * ⚠️ Deliberately narrow. Two of the sub-role holders are real colleagues with
 * ordinary names (Ng Yao Zong on outlet Finance, Ng Jun Yu), and "rename every
 * account that holds a sub-role" would have renamed those people. Matching the
 * SHAPE of a placeholder rather than the role it holds is what keeps a
 * convenience rename from overwriting somebody's actual name.
 */
function looksLikePlaceholderName(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return true;
  if (n.length <= 4) return true; // "Tes", "jk"
  return /\b(test|testing|testee|tester|demo|sample|dummy|placeholder)\b/.test(n) ||
    /\b(owner|director|guarantor|finance|financial|ops|operation|head|admin|agency|outlet|user|account|member)\b/.test(
      n,
    );
}

/**
 * Does this name read as a man's, when every account is now female?
 *
 * `bin` and `a/l` mean *son of*, so they are statements, not hints — and the
 * female links must be tested FIRST, because `binti` contains `bin` and a
 * careless check reads every daughter as a son.
 *
 * These names are not wrong data somebody entered; they are what an earlier pass
 * of THIS script generated, before the owner set the all-female rule. Leaving
 * them would put "Ahmad Zulkifli bin Abdullah" on a profile whose gender field,
 * IC digit and card all say PEREMPUAN.
 */
function looksMaleName(name: string): boolean {
  return nameGender(name) === 'male';
}

/**
 * What a name says about gender, or null when it says nothing.
 *
 * Separate from `looksMaleName` because "not male" and "female" are different
 * answers, and collapsing them loses the only thing that lets one name outrank
 * another: "Michelle Lim" is positively female, while "Loh Yan Ting" is merely
 * not positively male.
 */
function nameGender(name: string): 'male' | 'female' | null {
  const n = ` ${name.toLowerCase().replace(/[^a-z/ ]/g, ' ').replace(/\s+/g, ' ')} `;
  // Explicit links settle it outright. Female first: `binti` contains `bin`.
  if (/ (binti|bt|a\/p) /.test(n)) return 'female';
  if (/ (bin|a\/l) /.test(n)) return 'male';
  /**
   * Match WHOLE given names, never their words.
   *
   * Splitting the pools into single tokens looked equivalent and was not: the
   * two-word Chinese given names share their first word across genders — "Jia
   * Yi" (f) vs "Jia Xuan" (m), "Wei Qi" (f) vs "Wei Jie" (m), "Zhi Ying" (f) vs
   * "Zhi Wei" (m). The token "jia" therefore made every Jia Yi male, which this
   * script then "corrected" by flipping her gender, re-issuing her IC and
   * re-rendering her card — a wrong answer that rewrote three things and came
   * back every run, because the next pass read the same name and disagreed again.
   *
   * Female is checked first for the same reason the links are: on any overlap,
   * the safe reading is the one that does not trigger a rewrite.
   */
  const has = (list: readonly string[]) =>
    list.some((given) => n.includes(` ${given.toLowerCase()} `));
  if (has([...CHINESE_GIVEN_F, ...MALAY_GIVEN_F, ...INDIAN_GIVEN_F, ...WESTERN_GIVEN_F])) {
    return 'female';
  }
  if (has([...CHINESE_GIVEN_M, ...MALAY_GIVEN_M, ...INDIAN_GIVEN_M, ...WESTERN_GIVEN_M])) {
    return 'male';
  }
  return null;
}

/** Guess ethnicity from whatever name the account already carries. */
function ethnicityFrom(name: string, rng: () => number): Ethnicity {
  const n = name.toLowerCase();
  if (/\b(bin|binti|bt)\b|ahmad|muhammad|mohd|nurul|siti|aisyah|razif|zulkifli|firdaus|amirul|hakim/.test(n)) {
    return 'malay';
  }
  if (/\ba\/l\b|\ba\/p\b|rajesh|kumar|suresh|priya|kavitha|muthu|ramasamy|subramaniam|krishnan|vikne/.test(n)) {
    return 'indian';
  }
  if (/tan|lim|lee|\bng\b|wong|chan|goh|ooi|yeoh|chong|teoh|koh|loh|cheah|chen|wei|jie|xiao|yuki|weiqi/.test(n)) {
    return 'chinese';
  }
  return pick(rng, ['chinese', 'chinese', 'malay', 'indian'] as const);
}

/** A legal name in the local convention, built around the nickname when there is one. */
function buildFullName(
  nickname: string,
  ethnicity: Ethnicity,
  gender: 'male' | 'female',
  rng: () => number,
): string {
  const clean = nickname.replace(/[^A-Za-z' ]/g, '').trim();
  if (ethnicity === 'malay') {
    const given = pick(rng, gender === 'female' ? MALAY_GIVEN_F : MALAY_GIVEN_M);
    const link = gender === 'female' ? 'binti' : 'bin';
    return `${given} ${link} ${pick(rng, MALAY_FATHER)}`;
  }
  if (ethnicity === 'indian') {
    const given = pick(rng, gender === 'female' ? INDIAN_GIVEN_F : INDIAN_GIVEN_M);
    const link = gender === 'female' ? 'a/p' : 'a/l';
    return `${given} ${link} ${pick(rng, INDIAN_FATHER)}`;
  }
  const surname = pick(rng, CHINESE_SURNAMES);
  const given = pick(rng, gender === 'female' ? CHINESE_GIVEN_F : CHINESE_GIVEN_M);
  // Keep the nickname inside the legal name when it looks like a western given
  // name — "Alice" really is on the IC of an "Alice Tan Mei Ling".
  return clean && /^[A-Z][a-z]+$/.test(clean) ? `${clean} ${surname} ${given}` : `${surname} ${given}`;
}

/**
 * A distinct female name for a lane account that was seeded with a placeholder.
 *
 * Female because every account on this platform is now female (see `GENDER`),
 * and unique because two "Nurul Aina binti Rahman"s on the same team page is the
 * kind of detail that makes a whole screen read as fake.
 */
function mintName(
  rng: () => number,
  ethnicity: Ethnicity,
  gender: 'male' | 'female',
  taken: Set<string>,
): string {
  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const name = buildFullName('', ethnicity, gender, rng);
    const key = name.toLowerCase();
    if (taken.has(key)) continue;
    taken.add(key);
    return name;
  }
  throw new Error('Could not mint a free name');
}

/**
 * A Malaysian NRIC that encodes exactly this birth date, this birthplace and
 * this gender — and is not already taken.
 *
 * The round-trip through `dobFromNric` is the point: it is the same function the
 * API derives every displayed age from, so a number that fails it would be one
 * the product cannot read back. Rejecting rather than trusting the arithmetic is
 * what makes "age follows the IC" true here instead of merely intended.
 */
function buildNric(
  rng: () => number,
  birth: Date,
  gender: 'male' | 'female',
  icCode: string,
  taken: Set<string>,
): string {
  const yy = String(birth.getUTCFullYear() % 100).padStart(2, '0');
  const mm = String(birth.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(birth.getUTCDate()).padStart(2, '0');

  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const serial = String(intBetween(rng, 0, 999)).padStart(3, '0');
    let last = intBetween(rng, 0, 9);
    // Odd = male, even = female. Nudge rather than redraw so the stream stays short.
    if (gender === 'male' && last % 2 === 0) last = (last + 1) % 10;
    if (gender === 'female' && last % 2 === 1) last = (last + 1) % 10;

    const nric = `${yy}${mm}${dd}-${icCode}-${serial}${last}`;
    if (taken.has(digitsOnly(nric))) continue;
    if (dobFromNric(nric, TODAY) !== iso(birth)) continue;
    taken.add(digitsOnly(nric));
    return nric;
  }
  throw new Error(`Could not mint a free NRIC for ${iso(birth)} / ${icCode}`);
}

function buildPhone(rng: () => number, taken: Set<string>): string {
  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const prefix = pick(rng, MOBILE_PREFIXES);
    const width = prefix === '11' ? 8 : 7;
    let body = '';
    for (let i = 0; i < width; i += 1) body += String(intBetween(rng, 0, 9));
    const phone = `+60${prefix}${body}`;
    if (taken.has(digitsOnly(phone))) continue;
    taken.add(digitsOnly(phone));
    return phone;
  }
  throw new Error('Could not mint a free phone number');
}

function buildBank(rng: () => number, taken: Set<string>): { name: string; accountNo: string } {
  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const bank = pick(rng, BANKS);
    let accountNo = '';
    for (let i = 0; i < bank.digits; i += 1) accountNo += String(intBetween(rng, 0, 9));
    if (taken.has(accountNo)) continue;
    taken.add(accountNo);
    return { name: bank.name, accountNo };
  }
  throw new Error('Could not mint a free bank account number');
}

/**
 * A drawn signature in the shape the product actually stores.
 *
 * `signature_ink` is NOT an image data-URL — it is `JSON.stringify` of
 * `{ w, h, strokes: [[[x, y], …]] }` (SaveMySignatureSchema in
 * schema/user-profile.schema.ts), which the PV PDF re-draws stroke by stroke.
 * Writing a PNG here would typecheck, store fine, and then fail at the one
 * moment it matters — rendering a payment voucher.
 */
function buildSignatureInk(rng: () => number): string {
  const w = 600;
  const h = 200;
  const strokeCount = intBetween(rng, 2, 3);
  const strokes: Array<Array<[number, number]>> = [];

  let cursorX = 40;
  for (let s = 0; s < strokeCount; s += 1) {
    const points: Array<[number, number]> = [];
    const steps = intBetween(rng, 26, 44);
    const amplitude = intBetween(rng, 22, 46);
    const baseline = 110 + intBetween(rng, -12, 12);
    const step = intBetween(rng, 9, 14);
    for (let i = 0; i < steps; i += 1) {
      const x = cursorX + i * step;
      const y = baseline - Math.sin(i / 2.1 + s) * amplitude - (i / steps) * intBetween(rng, 0, 18);
      points.push([
        Math.round(Math.min(x, w - 10)),
        Math.round(Math.max(12, Math.min(y, h - 12))),
      ]);
    }
    cursorX = Math.min(points[points.length - 1][0] - intBetween(rng, 30, 90), w - 140);
    strokes.push(points);
  }
  return JSON.stringify({ w, h, strokes });
}

/** A synthetic MyKad face as a PNG buffer, so the admin sheet has a real image. */
async function buildIdCardPng(input: {
  side: 'front' | 'back';
  fullName: string;
  idNo: string;
  address: string;
  gender: string;
  nationality: string;
}): Promise<Buffer> {
  const esc = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const body =
    input.side === 'front'
      ? `
        <text x="40" y="92" class="no">${esc(input.idNo)}</text>
        <text x="40" y="140" class="lbl">NAMA</text>
        <text x="40" y="172" class="val">${esc(input.fullName.toUpperCase())}</text>
        <text x="40" y="214" class="lbl">ALAMAT</text>
        <text x="40" y="242" class="small">${esc(input.address)}</text>
        <text x="40" y="300" class="lbl">WARGANEGARA</text>
        <text x="40" y="330" class="val">${esc(input.nationality.toUpperCase())}</text>
        <text x="330" y="330" class="val">${esc(input.gender === 'female' ? 'PEREMPUAN' : 'LELAKI')}</text>
        <rect x="600" y="120" width="150" height="190" rx="8" fill="#c8cfd8" stroke="#8d97a4"/>
        <text x="675" y="225" text-anchor="middle" class="lbl">FOTO</text>`
      : `
        <rect x="40" y="70" width="300" height="70" rx="6" fill="#2b2f36"/>
        <text x="52" y="114" class="chip">${esc(digitsOnly(input.idNo))}</text>
        <text x="40" y="190" class="lbl">TEMPAT LAHIR</text>
        <text x="40" y="220" class="val">MALAYSIA</text>
        <text x="40" y="266" class="lbl">CAP JARI / FINGERPRINT</text>
        <rect x="40" y="284" width="180" height="60" rx="6" fill="#c8cfd8" stroke="#8d97a4"/>
        <rect x="430" y="70" width="330" height="274" rx="8" fill="#dfe4ea" stroke="#8d97a4"/>
        <text x="595" y="215" text-anchor="middle" class="lbl">MAKLUMAT KESELAMATAN</text>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400">
      <style>
        .lbl { font: 600 15px sans-serif; fill: #5a6472; letter-spacing: 1px; }
        .val { font: 700 24px sans-serif; fill: #10141a; }
        .small { font: 500 17px sans-serif; fill: #23303f; }
        .no  { font: 800 34px monospace; fill: #10141a; letter-spacing: 2px; }
        .chip{ font: 700 20px monospace; fill: #e8edf3; letter-spacing: 3px; }
        .hdr { font: 800 19px sans-serif; fill: #ffffff; letter-spacing: 2px; }
      </style>
      <rect width="800" height="400" rx="18" fill="#eef2f7"/>
      <rect width="800" height="46" fill="#1f4e79"/>
      <text x="40" y="31" class="hdr">MYKAD — SPECIMEN (SYNTHETIC TEST DATA)</text>
      ${body}
      <rect x="1" y="1" width="798" height="398" rx="18" fill="none" stroke="#98a3b1" stroke-width="2"/>
    </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Initials on a soft gradient — a stand-in headshot, never a fabricated face. */
async function buildAvatarPng(fullName: string, rng: () => number): Promise<Buffer> {
  const initials = fullName
    .replace(/\b(bin|binti|a\/l|a\/p)\b/gi, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  const hue = intBetween(rng, 0, 359);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="hsl(${hue},52%,58%)"/>
        <stop offset="100%" stop-color="hsl(${(hue + 42) % 360},46%,34%)"/>
      </linearGradient></defs>
      <rect width="512" height="512" fill="url(#g)"/>
      <text x="256" y="256" text-anchor="middle" dominant-baseline="central"
        font-family="sans-serif" font-size="200" font-weight="700"
        fill="#ffffff" fill-opacity="0.92">${initials || 'PR'}</text>
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** A numbered portfolio tile in the 3:4 aspect the gallery renders. */
async function buildPortfolioPng(
  fullName: string,
  slot: number,
  rng: () => number,
): Promise<Buffer> {
  const hue = intBetween(rng, 0, 359);
  const esc = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0%" stop-color="hsl(${hue},44%,46%)"/>
        <stop offset="100%" stop-color="hsl(${(hue + 28) % 360},38%,22%)"/>
      </linearGradient></defs>
      <rect width="600" height="800" fill="url(#g)"/>
      <circle cx="300" cy="300" r="120" fill="#ffffff" fill-opacity="0.16"/>
      <text x="300" y="640" text-anchor="middle" font-family="sans-serif"
        font-size="34" font-weight="700" fill="#ffffff" fill-opacity="0.9">${esc(fullName)}</text>
      <text x="300" y="690" text-anchor="middle" font-family="sans-serif"
        font-size="24" fill="#ffffff" fill-opacity="0.65">Portfolio ${slot} - specimen</text>
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** How many gallery slots a generated portfolio fills. */
const PORTFOLIO_SLOTS = 4;

// ── main ────────────────────────────────────────────────────────────────────

type Plan = {
  userId: string;
  username: string;
  roles: string[];
  hasProfileRow: boolean;
  userPatch: Record<string, unknown>;
  profilePatch: Record<string, unknown>;
  images: Array<{ side: 'front' | 'back'; png: () => Promise<Buffer> }>;
  avatar: (() => Promise<Buffer>) | null;
  portfolio: Array<() => Promise<Buffer>>;
  notes: string[];
  loginPhone: string;
  loginEmail: string;
};

async function main() {
  await primeUserFolders();

  const rows = await db
    .select({
      id: UserTable.id,
      username: UserTable.username,
      email: UserTable.email,
      phoneNum: UserTable.phoneNum,
      profileImage: UserTable.profileImage,
      profileId: UserProfileTable.id,
      fullName: UserProfileTable.fullName,
      nationality: UserProfileTable.nationality,
      gender: UserProfileTable.gender,
      race: UserProfileTable.race,
      idType: UserProfileTable.idType,
      idNo: UserProfileTable.idNo,
      dob: UserProfileTable.dob,
      languages: UserProfileTable.languages,
      portfolioPhotos: UserProfileTable.portfolioPhotos,
      comcardHeightCm: UserProfileTable.comcardHeightCm,
      comcardWeightKg: UserProfileTable.comcardWeightKg,
      comcardBustCm: UserProfileTable.comcardBustCm,
      comcardWaistCm: UserProfileTable.comcardWaistCm,
      comcardHipCm: UserProfileTable.comcardHipCm,
      addressLine1: UserProfileTable.addressLine1,
      addressLine2: UserProfileTable.addressLine2,
      city: UserProfileTable.city,
      postcode: UserProfileTable.postcode,
      state: UserProfileTable.state,
      country: UserProfileTable.country,
      idPhotoFront: UserProfileTable.idPhotoFront,
      idPhotoBack: UserProfileTable.idPhotoBack,
      bankName: UserProfileTable.bankName,
      bankAccountNo: UserProfileTable.bankAccountNo,
      signatureInk: UserProfileTable.signatureInk,
      verificationStatus: UserProfileTable.verificationStatus,
    })
    .from(UserTable)
    .leftJoin(UserProfileTable, eq(UserProfileTable.userId, UserTable.id));

  const roleRows = await db
    .select({
      userId: UserRoleTable.userId,
      roleName: RoleTable.roleName,
      portalCode: PortalTable.code,
    })
    .from(UserRoleTable)
    .innerJoin(RoleTable, eq(RoleTable.id, UserRoleTable.roleId))
    .leftJoin(PortalTable, eq(PortalTable.id, RoleTable.portalId));

  const rolesByUser = new Map<string, string[]>();
  for (const r of roleRows) {
    const label = r.portalCode ? `${r.portalCode}:${r.roleName}` : r.roleName;
    const list = rolesByUser.get(r.userId) ?? [];
    if (!list.includes(label)) list.push(label);
    rolesByUser.set(r.userId, list);
  }

  // Rule 3 — the uniqueness registries, seeded with everything already stored.
  const takenIc = new Set<string>();
  const takenPhone = new Set<string>();
  const takenBank = new Set<string>();
  const takenName = new Set<string>();
  for (const row of rows) {
    if (row.idNo) takenIc.add(digitsOnly(row.idNo));
    if (row.phoneNum) takenPhone.add(digitsOnly(row.phoneNum));
    if (row.bankAccountNo) takenBank.add(row.bankAccountNo.trim());
    if (row.fullName) takenName.add(row.fullName.trim().toLowerCase());
    if (row.username) takenName.add(row.username.trim().toLowerCase());
  }

  const plans: Plan[] = [];
  const conflicts: string[] = [];

  for (const row of rows) {
    const roles = rolesByUser.get(row.id) ?? [];
    const isPr = roles.includes('pr');
    if (ONLY === 'pr' && !isPr) continue;
    if (ONLY === 'web' && isPr) continue;

    const rng = makeRng(seedFrom(row.id));
    const notes: string[] = [];
    const userPatch: Record<string, unknown> = {};
    const profilePatch: Record<string, unknown> = {};

    /**
     * An IC that disagrees with its own `dob` column.
     *
     * Reported and left alone by default, because picking a side is a human
     * decision. Under `--trust-ic-dob` the owner's rule settles it: *"age rule
     * (IC wins)"* — the IC's date is kept and the column is corrected to match.
     *
     * Only the COLUMN moves. The alternative, re-issuing the IC's first six
     * digits to match the column, would mint a new identity number for someone
     * who already has payment vouchers raised against the old one — a much
     * larger change than the inconsistency it fixes, and unnecessary because the
     * API derives every displayed age from the IC anyway (`derivedAge`), so the
     * IC's date is already the one on screen.
     */
    if (row.idNo && row.dob) {
      const fromIc = dobFromNric(row.idNo, TODAY);
      if (fromIc && fromIc !== row.dob && IC_FOLLOWS_DOB) {
        // Demo direction: the stored date stays, the fabricated number moves.
        const reissued = alignNricToDob(row.idNo, row.dob, takenIc);
        if (reissued) {
          notes.push(`IC ${row.idNo} -> ${reissued} (date now follows dob ${row.dob})`);
          profilePatch.idNo = reissued;
        } else {
          conflicts.push(
            `${row.username}: could not re-issue IC ${row.idNo} for dob ${row.dob} — left alone`,
          );
        }
      } else if (fromIc && fromIc !== row.dob && TRUST_IC_DOB) {
        notes.push(`dob "${row.dob}" -> ${fromIc} (IC wins)`);
        profilePatch.dob = fromIc;
      } else if (fromIc && fromIc !== row.dob) {
        conflicts.push(`${row.username}: IC ${row.idNo} says ${fromIc}, dob column says ${row.dob}`);
      }
    }
    if (isJunkPhone(row.phoneNum)) {
      notes.push(`phone "${row.phoneNum}" is not dialable — LEFT AS IS (it is the login id)`);
    }

    // ── identity ──
    const existingName = (row.fullName ?? row.username ?? '').trim();
    // `??` alone is wrong here: several rows hold race = '' rather than NULL, and
    // an empty string is not null, so the fallback never ran and the empty string
    // was written straight back — a no-op dressed as a fill. isBlank covers both.
    const storedRace = isBlank(row.race) ? null : (row.race as Ethnicity);
    const ethnicity = storedRace ?? ethnicityFrom(existingName, rng);
    if (isBlank(row.race)) profilePatch.race = ethnicity;

    /**
     * A lane account named after its lane gets a person's name — the one case
     * where a non-blank name is replaced, and only under an explicit flag.
     *
     * PRs are exempt: "Ash" and "Anonymouse" are floor NICKNAMES, which is what
     * that column is for on a promoter, so the placeholder test would have read
     * a working feature as broken data.
     */
    /**
     * The owner's own colleagues are off limits. `unitedalliedbusiness.com` is
     * the company domain, and those rows are real people with real names — a
     * cosmetic sweep must not rewrite them just because the sweep is running.
     * They are reported instead, so the decision stays with a human.
     */
    /**
     * ⚠️ A DOMAIN IS NOT A RELIABLE TEST OF "is this a real person".
     *
     * This started as `@unitedalliedbusiness.com` alone, and that gap renamed a
     * real colleague: the Atlas Financial Head signs in with a personal gmail,
     * so the guard did not fire and the sweep gave them the invented name "Lim
     * Jia Yi" plus a gender to match. The owner had to spot it on screen.
     *
     * Personal addresses are therefore listed explicitly. A list needs
     * maintaining, which is the cost of it — but the failure it prevents is
     * overwriting somebody's actual name, and the failure it risks is merely
     * leaving a demo account looking untidy.
     */
    const REAL_PEOPLE_EMAILS = ['siawlong0205@gmail.com', 'jycode777@gmail.com'];
    const email = (row.email ?? '').toLowerCase();
    const isRealColleague =
      email.includes('unitedalliedbusiness.com') || REAL_PEOPLE_EMAILS.includes(email);

    /**
     * SUB-ROLE SEATS ONLY — Finance, Ops Head, Director, Guarantor.
     *
     * Scoped to the roles the owner named, and deliberately NOT widened to
     * "every account whose name looks male". That wider rule ran once and
     * proposed renaming "Daniel Koh", "Michelle Lim" and "Dato' Lim Wei Khoon" —
     * the established demo identities of the agency and venue OWNERS, which
     * nobody asked about and which carry meaning on other screens. The trigger
     * was their generated LEGAL name reading male, which says nothing about
     * whether their display name needed touching.
     */
    const SUB_ROLE_SEATS = ['Finance', 'Ops Head', 'Director', 'Guarantor'];
    const holdsSubRole = roles.some((r) =>
      SUB_ROLE_SEATS.some((seat) => r === seat || r.endsWith(`:${seat}`)),
    );
    const legalIsPlaceholder =
      looksLikePlaceholderName(row.fullName ?? '') || looksMaleName(row.fullName ?? '');
    const displayIsPlaceholder = looksLikePlaceholderName(row.username ?? '');

    if (isRealColleague && holdsSubRole) {
      notes.push(`holds a sub-role but is a real colleague — name LEFT AS IS`);
    }
    /**
     * BOTH names are tested, not just one. An earlier pass had already filled
     * the blank `full_name` on these accounts with a generated person's name, so
     * checking the legal name alone found only two of seven — the seat label was
     * still sitting in `user.username`, which is exactly what the team list and
     * the member page print. A rename that fixes the column nobody reads is not
     * a rename.
     */
    /**
     * TWO populations, two reasons, one flag — and everyone else is left alone
     * ("the rest keep", owner, 8 Sep 2026).
     *
     *  · PRs whose NAME still reads male. Their gender, IC digit and card all say
     *    female now, so "Muhammad Haziq bin Iskandar" is the last thing left
     *    disagreeing. Only the name moves; the nickname stays a nickname unless
     *    it too reads male.
     *  · The sub-role SEATS — Finance, Ops Head, Director, Guarantor — named
     *    after the seat rather than a person ("Atlas Agency Director").
     *
     * An account that holds Owner is excluded even when it also holds Finance: it
     * is an owner with an extra hat, not a seat, and its name carries meaning on
     * other screens.
     */
    const holdsOwner = roles.some((r) => r === 'Owner' || r.endsWith(':Owner'));
    const prNameReadsMale =
      isPr && (looksMaleName(row.fullName ?? '') || looksMaleName(row.username ?? ''));
    const renamePlaceholder =
      RENAME_PLACEHOLDERS &&
      !isRealColleague &&
      (prNameReadsMale ||
        (!isPr && holdsSubRole && !holdsOwner && (legalIsPlaceholder || displayIsPlaceholder)));

    let fullName: string;
    if (renamePlaceholder) {
      // Keep a legal name that already reads as a real woman's; mint only when it
      // is a placeholder or reads male. No point burning a fresh identity.
      const needsNewLegal =
        legalIsPlaceholder || looksMaleName(row.fullName ?? '') || isBlank(row.fullName);
      fullName = needsNewLegal
        ? mintName(rng, ethnicity, 'female', takenName)
        : (row.fullName as string);
      if (needsNewLegal) {
        notes.push(`legal name "${row.fullName}" -> ${fullName}`);
        profilePatch.fullName = fullName;
      }
      // A PR's display name is a NICKNAME and stays one — replaced only when it
      // reads male, and then with the given name rather than the whole legal
      // name, because "Nurul Aina binti Rahman" is not what anyone calls her on
      // the floor. A seat's display name takes the full name.
      const displayNeedsWork = isPr
        ? looksMaleName(row.username ?? '')
        : displayIsPlaceholder || row.username !== fullName;
      if (displayNeedsWork) {
        // A PR's nickname is the GIVEN name — everything before the link word,
        // never the first two tokens. Slicing blindly produced "Kavitha a/p",
        // which is half a patronymic and not a name anybody is called.
        const givenOnly = fullName.split(/\s+(?:binti|bin|a\/p|a\/l)\s+/i)[0];
        const nextDisplay = isPr
          ? givenOnly.split(/\s+/).slice(0, 2).join(' ')
          : fullName;
        notes.push(`display name "${row.username}" -> ${nextDisplay}`);
        userPatch.username = nextDisplay;
      }
    } else if (!isPr && RENAME_PLACEHOLDERS && !isBlank(row.username) && row.fullName !== row.username) {
      /**
       * A PORTAL account's legal name IS its display name.
       *
       * Only a PR has two: a floor nickname and the name on their IC. A venue
       * owner or a finance head has one, so filling their blank `full_name` with
       * a freshly INVENTED name — which is what an earlier pass did — produced
       * 15 accounts showing two different people under one login: "Frank Lee"
       * with a legal name of "Lim Kah Wai", "Michelle Lim" as "Loh Yan Ting".
       * The blank was real; inventing a second identity to fill it was not the
       * way to close it.
       *
       * Copying the display name is honest about what we know: it is the only
       * name this account has ever actually carried. It also fixes case drift
       * ("Ng Jun Yu" vs "NG JUN YU") for free.
       */
      fullName = row.username as string;
      notes.push(`legal name "${row.fullName}" -> ${fullName} (matches the display name)`);
      profilePatch.fullName = fullName;
    } else if (isBlank(row.fullName)) {
      // There is no name yet to read a gender off, so seed one: a PR is female by
      // rule, and a web account borrows whatever its login name suggests. The
      // real `gender` below is then derived from the name this produces, so the
      // two cannot end up disagreeing.
      const seedGender: 'male' | 'female' =
        !isPr && looksMaleName(row.username ?? '') ? 'male' : GENDER;
      fullName = buildFullName(row.username ?? '', ethnicity, seedGender, rng);
      profilePatch.fullName = fullName;
    } else {
      fullName = row.fullName as string;
    }

    /**
     * GENDER IS DECIDED HERE, AFTER the name — the ordering is the rule, not an
     * accident of layout.
     *
     * Owner, 8 Sep 2026: every PR is female; and *"if the name for the outlet and
     * the agency feel like male then the gender is male, remember the ic also
     * need lelaki"*. So a venue or agency account takes its gender FROM its name,
     * which means the name has to be settled first — including any rename above.
     * Computing gender earlier (as this did) read the name before the rename and
     * could stamp `female` on an account that was about to be called Ahmad.
     *
     * Everything downstream then follows this one value: `alignNricToGender`
     * re-issues the parity digit, and the card prints LELAKI or PEREMPUAN.
     */
    /**
     * The DISPLAY name is asked first, and only then the legal one.
     *
     * Ordering, not an OR: an OR made "Michelle Lim" male, because the legal name
     * beside her was `Cheah Zhi Wei` — a name THIS script invented in an earlier
     * pass, holding no authority over the one a person actually chose. Ask the
     * seeded name first, fall back to the generated one, and default female.
     */
    const displayName = (userPatch.username as string | undefined) ?? row.username ?? '';
    const gender: 'male' | 'female' = isPr
      ? GENDER
      : (nameGender(displayName) ?? nameGender(fullName) ?? 'female');

    /**
     * ...and then make the legal name agree. Without this the profile would show
     * "Michelle Lim / Cheah Zhi Wei / female", where the middle value still reads
     * male — the same contradiction one field further along.
     */
    /**
     * Only a legal name we can RECOGNISE is corrected — `nameGender` returning
     * null means the name is not from the vocabulary this script generates, so it
     * is somebody's actual name and none of our business. That single condition
     * is what stops this pass renaming "Ng Yao Zong" and "NG JUN YU", two real
     * colleagues it had queued up purely because their names read male to the
     * gender default. "The rest keep" (owner), and unrecognised means keep.
     */
    const legalSignal = nameGender(fullName);
    if (
      !isPr &&
      RENAME_PLACEHOLDERS &&
      !isRealColleague &&
      legalSignal !== null &&
      legalSignal !== gender
    ) {
      const corrected = mintName(rng, ethnicity, gender, takenName);
      notes.push(`legal name "${fullName}" -> ${corrected} (to match ${gender})`);
      fullName = corrected;
      profilePatch.fullName = corrected;
    }

    if (row.gender !== gender) {
      if (!isBlank(row.gender)) notes.push(`gender "${row.gender}" -> ${gender}`);
      profilePatch.gender = gender;
    }

    if (isBlank(row.nationality)) profilePatch.nationality = 'Malaysian';

    // ── the age rule ──
    // A PR is a promoter, so 21-34; a portal account is management, so 30-54.
    const [minAge, maxAge] = isPr ? [21, 34] : [30, 54];
    const place = pick(rng, PLACES);
    let idNo: string;

    if (!isBlank(row.idNo)) {
      // Start from any re-issue the dob-conflict block above already planned,
      // NOT from the stored value — otherwise the gender alignment below would
      // read the old number and overwrite that plan with a variant of it, and
      // the date fix would vanish without a word.
      idNo = ((profilePatch.idNo as string | undefined) ?? row.idNo) as string;
      /**
       * The IC follows the person: re-issue the gender digit when it disagrees.
       *
       * The invariant to prove is that the SWAP moved nothing — so compare the
       * date this IC encodes before against the date it encodes after, and not
       * against the `dob` column. Those two can already disagree for reasons
       * that predate this script (Vicky's IC says 1995-03-12 while her dob column
       * says 1996-03-12), and checking against the column made a pre-existing
       * conflict look like damage this pass had just done.
       */
      const dobBefore = dobFromNric(idNo, TODAY);
      const realigned = alignNricToGender(idNo, gender, takenIc);
      if (realigned) {
        const dobAfter = dobFromNric(realigned, TODAY);
        if (dobAfter !== dobBefore) {
          throw new Error(`Realigning ${idNo} to ${realigned} moved its date ${dobBefore} -> ${dobAfter}`);
        }
        notes.push(`IC ${idNo} -> ${realigned} (gender digit now reads ${gender})`);
        idNo = realigned;
        profilePatch.idNo = realigned;
      }
      // The dob column can still be blank behind a good IC — fill it FROM the IC.
      if (isBlank(row.dob) && dobBefore) profilePatch.dob = dobBefore;
    } else {
      const age = intBetween(rng, minAge, maxAge);
      const year = TODAY.getUTCFullYear() - age;
      const month = intBetween(rng, 1, 12);
      const day = intBetween(rng, 1, 28);
      const birth = new Date(Date.UTC(year, month - 1, day));
      idNo = buildNric(rng, birth, gender, place.icCode, takenIc);
      profilePatch.idNo = idNo;
      profilePatch.idType = 'NRIC';
      profilePatch.dob = iso(birth);
      // Proof, not assumption: the value we are about to store must read back as
      // the date it was built from, through the API's own derivation.
      const readBack = dobFromNric(idNo, TODAY);
      if (readBack !== iso(birth)) {
        throw new Error(`IC ${idNo} does not read back as ${iso(birth)} (got ${readBack})`);
      }
    }
    if (isBlank(row.idType) && !isBlank(idNo)) profilePatch.idType = 'NRIC';

    // ── contact ──
    if (isBlank(row.phoneNum)) userPatch.phoneNum = buildPhone(rng, takenPhone);

    // ── address ──
    if (isBlank(row.addressLine1)) {
      profilePatch.addressLine1 = `${intBetween(rng, 1, 88)}, ${pick(rng, STREETS)}`;
    }
    if (isBlank(row.addressLine2)) {
      profilePatch.addressLine2 = `${pick(rng, UNIT_PREFIX)}-${intBetween(rng, 3, 28)}-${intBetween(rng, 1, 12)}, ${pick(rng, BUILDINGS)}`;
    }
    if (isBlank(row.city)) profilePatch.city = place.city;
    if (isBlank(row.postcode)) profilePatch.postcode = pick(rng, place.postcodes);
    if (isBlank(row.state)) profilePatch.state = place.state;
    if (isBlank(row.country)) profilePatch.country = 'Malaysia';

    // ── languages ──
    if (isBlank(row.languages)) profilePatch.languages = pick(rng, LANGUAGE_POOL[ethnicity]);

    // ── comcard: PRs only. A Finance manager has no bust measurement. ──
    if (isPr) {
      if (isBlank(row.comcardHeightCm)) profilePatch.comcardHeightCm = intBetween(rng, 155, 175);
      if (isBlank(row.comcardWeightKg)) profilePatch.comcardWeightKg = intBetween(rng, 42, 62);
      if (isBlank(row.comcardBustCm)) profilePatch.comcardBustCm = intBetween(rng, 78, 94);
      if (isBlank(row.comcardWaistCm)) profilePatch.comcardWaistCm = intBetween(rng, 58, 72);
      if (isBlank(row.comcardHipCm)) profilePatch.comcardHipCm = intBetween(rng, 84, 100);
    }

    // ── payout + signature ──
    if (isBlank(row.bankName) || isBlank(row.bankAccountNo)) {
      const bank = buildBank(rng, takenBank);
      if (isBlank(row.bankName)) profilePatch.bankName = bank.name;
      if (isBlank(row.bankAccountNo)) profilePatch.bankAccountNo = bank.accountNo;
    }
    if (isBlank(row.signatureInk)) profilePatch.signatureInk = buildSignatureInk(rng);
    if (isBlank(row.verificationStatus) || row.verificationStatus === 'draft') {
      profilePatch.verificationStatus = 'verified';
    }

    // ── ID document scans ──
    /**
     * The address printed on the card is the STORED one — for anyone who
     * completed sign-up that is exactly what they typed, and this only fills it
     * in for accounts that never had one.
     *
     * `addressLine2` was missing from this list, which quietly dropped the street
     * from every card: jk's real address is line 1 "20" and line 2 "Lorong Ria 1,
     * Taman Bunga Raya", so the card read "20, 53000, Setapak" — a house number
     * and a postcode with no road between them. The line that looked optional was
     * carrying the part that matters.
     */
    const address = [
      (profilePatch.addressLine1 ?? row.addressLine1) as string,
      (profilePatch.addressLine2 ?? row.addressLine2) as string,
      (profilePatch.postcode ?? row.postcode) as string,
      (profilePatch.city ?? row.city) as string,
      (profilePatch.state ?? row.state) as string,
    ]
      .filter(Boolean)
      .join(', ');

    const images: Plan['images'] = [];
    if (!SKIP_IMAGES) {
      const cardInput = {
        fullName,
        idNo,
        address,
        gender,
        nationality: (profilePatch.nationality ?? row.nationality ?? 'Malaysian') as string,
      };
      /**
       * A scan is stale, not just absent, once the number or the gender printed
       * on it has moved — the card face carries both (`900715-10-6033`, LELAKI /
       * PEREMPUAN). Re-rendering only the missing ones would leave the sheet
       * showing a document that contradicts the row beside it, which is the
       * exact failure this whole pass exists to remove.
       */
      /**
       * 🔴 NEVER overwrite a REAL scan with a generated one.
       *
       * This script writes exactly `id-front.png` / `id-back.png`; a genuine
       * upload is named `id-<side>-<timestamp>.<ext>` by `saveUserIdDocFile`. So
       * a stored key that is not one of ours belongs to a person who actually
       * photographed their IC, and regenerating over it destroys evidence.
       *
       * It already happened once: `--regenerate-cards` repointed jk — the one PR
       * with real front and back photographs — at a synthetic specimen. The
       * images survived in R2 only because the key differs; had the filenames
       * matched, the objects themselves would have been replaced and there would
       * have been nothing to restore. "Regenerate everything" is safe only for
       * the things this script generated.
       */
      const isGeneratedCard = (key: string | null) =>
        !key || /\/id-(front|back)\.png$/.test(key);
      const ownsBothCards =
        isGeneratedCard(row.idPhotoFront) && isGeneratedCard(row.idPhotoBack);
      if (!ownsBothCards) {
        notes.push('real uploaded ID scan on file — card NOT regenerated');
      }

      const cardIsStale =
        ownsBothCards &&
        (REGENERATE_CARDS ||
          Boolean(profilePatch.idNo) ||
          Boolean(profilePatch.gender) ||
          Boolean(profilePatch.fullName));
      if (isBlank(row.idPhotoFront) || cardIsStale) {
        images.push({ side: 'front', png: () => buildIdCardPng({ ...cardInput, side: 'front' }) });
      }
      if (isBlank(row.idPhotoBack) || cardIsStale) {
        images.push({ side: 'back', png: () => buildIdCardPng({ ...cardInput, side: 'back' }) });
      }
    }

    // Step 5 photos, PRs only — a Finance manager has no comcard gallery.
    let avatar: Plan['avatar'] = null;
    const portfolio: Plan['portfolio'] = [];
    if (isPr && !SKIP_IMAGES) {
      if (isBlank(row.profileImage)) {
        avatar = () => buildAvatarPng(fullName, makeRng(seedFrom(`${row.id}:avatar`)));
      }
      if (isBlank(row.portfolioPhotos)) {
        for (let slot = 1; slot <= PORTFOLIO_SLOTS; slot += 1) {
          portfolio.push(() =>
            buildPortfolioPng(fullName, slot, makeRng(seedFrom(`${row.id}:portfolio:${slot}`))),
          );
        }
      }
    }

    plans.push({
      userId: row.id,
      username: row.username ?? '(no username)',
      roles: roles.length ? roles : ['(no role)'],
      hasProfileRow: Boolean(row.profileId),
      userPatch,
      profilePatch,
      images,
      avatar,
      portfolio,
      notes,
      loginPhone: (userPatch.phoneNum as string) ?? row.phoneNum ?? '-',
      loginEmail: row.email ?? '-',
    });
  }

  // ── report ──
  const touching = plans.filter(
    (p) =>
      Object.keys(p.userPatch).length +
        Object.keys(p.profilePatch).length +
        p.images.length +
        p.portfolio.length +
        (p.avatar ? 1 : 0) >
      0,
  );
  console.log(`\n${APPLY ? '=== APPLYING ===' : '=== DRY RUN (add --apply to write) ==='}`);
  console.log(`accounts considered : ${plans.length}`);
  console.log(`accounts to change  : ${touching.length}`);
  console.log(`R2 configured       : ${r2Configured()}   images: ${SKIP_IMAGES ? 'SKIPPED' : 'on'}`);

  if (conflicts.length) {
    console.log('\n!! Contradictions against the IC - NOT touched, a human must pick a side:');
    for (const c of conflicts) console.log(`   ${c}`);
  }

  let changed = 0;
  let uploaded = 0;

  for (const plan of plans) {
    const fields = { ...plan.userPatch, ...plan.profilePatch };
    const fieldCount = Object.keys(fields).length;
    if (
      fieldCount === 0 &&
      plan.images.length === 0 &&
      plan.portfolio.length === 0 &&
      !plan.avatar &&
      plan.notes.length === 0
    ) {
      continue;
    }

    console.log(`\n  ${plan.username}  [${plan.roles.join(', ')}]`);
    for (const note of plan.notes) console.log(`    note: ${note}`);
    if (!plan.hasProfileRow) console.log('    creates the missing user_profile row');
    for (const [key, value] of Object.entries(fields)) {
      const shown = Array.isArray(value)
        ? value.join(' / ')
        : key === 'signatureInk'
          ? `${String(value).slice(0, 38)}... (stroke JSON)`
          : String(value);
      console.log(`    ${key.padEnd(18)} = ${shown}`);
    }
    if (plan.images.length) {
      console.log(`    id photos          = ${plan.images.map((i) => i.side).join(' + ')}`);
    }
    if (plan.avatar) console.log('    profileImage       = generated avatar');
    if (plan.portfolio.length) {
      console.log(`    portfolioPhotos    = ${plan.portfolio.length} generated tiles`);
    }

    if (!APPLY) continue;

    // ── write ──
    const profileWrite: Record<string, unknown> = { ...plan.profilePatch };

    if (!SKIP_IMAGES && r2Configured()) {
      for (const image of plan.images) {
        const key = idDocObjectKey(plan.userId, image.side, `id-${image.side}.png`);
        const stored = await r2PutObject({
          key,
          body: await image.png(),
          contentType: 'image/png',
        });
        profileWrite[image.side === 'front' ? 'idPhotoFront' : 'idPhotoBack'] = stored;
        uploaded += 1;
      }
    }

    const userWrite: Record<string, unknown> = { ...plan.userPatch };

    if (!SKIP_IMAGES && r2Configured()) {
      if (plan.avatar) {
        userWrite.profileImage = await r2PutObject({
          key: profileImageObjectKey(plan.userId, 'avatar.png'),
          body: await plan.avatar(),
          contentType: 'image/png',
        });
        uploaded += 1;
      }
      if (plan.portfolio.length) {
        const keys: string[] = [];
        for (let slot = 0; slot < plan.portfolio.length; slot += 1) {
          keys.push(
            await r2PutObject({
              key: portfolioImageObjectKey(plan.userId, `portfolio-${slot + 1}.png`),
              body: await plan.portfolio[slot](),
              contentType: 'image/png',
            }),
          );
          uploaded += 1;
        }
        profileWrite.portfolioPhotos = keys;
      }
    }

    if (Object.keys(userWrite).length > 0) {
      await db
        .update(UserTable)
        .set({ ...userWrite, updatedBy: ACTOR, updatedAt: new Date() })
        .where(eq(UserTable.id, plan.userId));
    }

    if (Object.keys(profileWrite).length > 0) {
      if (plan.hasProfileRow) {
        await db
          .update(UserProfileTable)
          .set({ ...profileWrite, updatedBy: ACTOR, updatedAt: new Date() })
          .where(eq(UserProfileTable.userId, plan.userId));
      } else {
        // All four audit columns together - the database rule, not a preference.
        await db.insert(UserProfileTable).values({
          userId: plan.userId,
          ...profileWrite,
          createdBy: ACTOR,
          updatedBy: ACTOR,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as typeof UserProfileTable.$inferInsert);
      }
    }
    // Only count a row that really changed. An account whose sole entry is a
    // note (an undialable phone we deliberately left alone) writes nothing, and
    // counting it would overstate what this run did.
    if (Object.keys(userWrite).length > 0 || Object.keys(profileWrite).length > 0) {
      changed += 1;
    }
  }

  // ── credentials ──
  console.log(`\n\n=== SIGN-IN IDENTIFIERS (${plans.length} accounts) ===`);
  console.log('Passwords are stored only as bcrypt hashes and cannot be read back.');
  console.log('Seeded demo accounts were created with: Password123!\n');
  console.log(
    `  ${'ACCOUNT'.padEnd(24)}${'ROLES'.padEnd(28)}${'PHONE (mobile login)'.padEnd(22)}EMAIL (web login)`,
  );
  for (const plan of [...plans].sort((a, b) => a.roles[0].localeCompare(b.roles[0]))) {
    console.log(
      `  ${plan.username.slice(0, 23).padEnd(24)}${plan.roles.join(',').slice(0, 27).padEnd(28)}${plan.loginPhone.padEnd(22)}${plan.loginEmail}`,
    );
  }

  console.log(
    `\n${APPLY ? `WROTE ${changed} accounts, uploaded ${uploaded} ID scans.` : 'Nothing written - this was a dry run.'}\n`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
