/**
 * WHAT MAY NEVER REACH THE PUBLIC CHAT — one scanner, used in three places:
 *   1. `pnpm chat:facts` refuses to write facts with a finding (and `--check` fails);
 *   2. public-safety.test.ts proves the committed facts are clean;
 *   3. landing-chat.service.ts refuses a Gemini REPLY with a finding before it is
 *      cached for 24 h and shown to other visitors.
 *
 * Owner, 5 Oct 2026: the chat must follow the system — flows, database structure
 * and md files — automatically. The facts are sent to Google on a free key (which
 * may use them) and answered to anonymous visitors, so what they may carry is
 * PRODUCT KNOWLEDGE only: never a person's details, a live row, a secret, an
 * internal file or name, or a known weakness. TEST_SCRIPT.md:4806 reported a
 * "public-safety scan" on 2 Oct that was never committed; this is that scanner.
 *
 * It flags VALUES and internal identifiers, not product concepts: "IC", "bank",
 * "GPS", "password" are words visitors legitimately ask about. A finding names
 * the rule and where — never the matched text — so a log or CI run cannot leak
 * what it caught. Dependency-free on purpose: the generator imports it by path.
 */

export type SafetyRule =
  | 'email'
  | 'ic-number'
  | 'phone-number'
  | 'long-number'
  | 'passport-number'
  | 'uuid'
  | 'ip-address'
  | 'url'
  | 'env-name'
  | 'code-identifier'
  | 'file-path'
  | 'demo-name'
  | 'internal-note';

export interface SafetyFinding {
  rule: SafetyRule;
  /** Character offset in the scanned text — the value itself is never returned. */
  offset: number;
}

/** Sites the public chat may name. */
const PUBLIC_HOSTS = /^(?:www\.)?innocenz\.net$/i;

/* Separators people put inside numbers: hyphen, space, dot, en/em dash. */
const SEP = '[-\\s.\\u2013\\u2014]?';

const VALUE_RULES: Array<[SafetyRule, RegExp]> = [
  ['email', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi],
  // Malaysian IC: 6+2+4 digits, with or without separators. Digit look-arounds,
  // not \b — "IC900101-14-5678" has no word boundary before the digits.
  ['ic-number', /(?<!\d)\d{6}[-\s/]?\d{2}[-\s/]?\d{4}(?!\d)/g],
  // Malaysian mobile (01x…, "(012) …", +60 / 60 prefixed) and landline (03-…, 04-… 09-…).
  ['phone-number', new RegExp(`(?<!\\d)(?:\\+?60${SEP}|\\(?0)1\\d\\)?${SEP}\\d{3,4}${SEP}\\d{4}(?!\\d)`, 'g')],
  ['phone-number', new RegExp(`(?<!\\d)\\(?0[3-9]\\)?${SEP}\\d{3,4}${SEP}\\d{4}(?!\\d)`, 'g')],
  // Any other country: +65 9123 4567, +44 20 7946 0958, +86 138 0013 8000.
  ['phone-number', /\+\d{1,3}[-\s.]?\(?\d{1,4}\)?(?:[-\s.]?\d{2,4}){2,4}(?!\d)/g],
  ['passport-number', /\b[A-Z]{1,2}\d{7,8}\b/g],
  ['uuid', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi],
  // `(?!\.?\d)`, not `(?![\d.])` — the second missed "… is 10.0.0.12." at a sentence end.
  ['ip-address', /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?!\.?\d)/g],
  // LAST, the catch-all: a long run of digits — an account, card or phone number in
  // any other shape. A value an earlier rule already named is reported once, by it.
  ['long-number', /(?<![\d.,])\d{9,}(?![\d.,])|(?<![\d.,])\d{3,4}(?:[-\s.]\d{3,4}){2,}(?![\d.,])/g],
];

/* Internal identifiers: things a visitor never needs, which map the system for an attacker. */
const INTERNAL_RULES: Array<[SafetyRule, RegExp]> = [
  // GEMINI_API_KEY, LANDING_CHAT_DAILY_LIMIT, R2_SECRET_ACCESS_KEY …
  ['env-name', /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){1,}\b/g],
  // payment_voucher, agency_pr, shift_assignment — database and code names.
  ['code-identifier', /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g],
  ['file-path', /\b[\w-]+\.(?:tsx?|mjs|cjs|jsx?|sql|mts|json|ya?ml|env)\b|(?:^|[\s(])(?:src|apps|tools|docs)\/[\w./-]+/g],
  // Seed and demo people/venues that run through TEST_SCRIPT and the demo store.
  ['demo-name', /\b(?:Velvet\s*23|Atlas\s+Agency|Vicky|Victoria\s+Tan|Emhub)\b/gi],
  // Engineering status language — a public fact never describes an open defect.
  ['internal-note', /\b(?:TODO|FIXME|vulnerab\w*|exploit\w*|backdoor|TEST_SCRIPT|CLAUDE\.md)\b|🔴|§\s?\d+/gi],
];

/**
 * Every match, in rule order — and a span an EARLIER rule already matched is not
 * reported again ("012-345 6789" is one phone number, not a phone number plus a
 * long number).
 */
function findAll(text: string, rules: Array<[SafetyRule, RegExp]>): SafetyFinding[] {
  const out: SafetyFinding[] = [];
  const spans: Array<[number, number]> = [];
  for (const [rule, pattern] of rules) {
    pattern.lastIndex = 0;
    for (const m of text.matchAll(pattern)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (spans.some(([s, e]) => start < e && end > s)) continue;
      spans.push([start, end]);
      out.push({ rule, offset: start });
    }
  }
  return out;
}

/*
 * The HOST only — letters, digits, dots and hyphens — so a link before "。", "，",
 * a full stop, ":443" or "?q=" is still read as innocenz.net (review, 5 Oct 2026:
 * "访问 https://innocenz.net。" was refused). Scheme-less links count too: "www.x.com"
 * and "x.com/help".
 */
const LINKS = [
  /\bhttps?:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi,
  /(?<![\w.@/-])(www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi,
  /(?<![\w.@/-])([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|my|app|me|sg|info|biz))\/[^\s]/gi,
];

function urlFindings(text: string): SafetyFinding[] {
  const out: SafetyFinding[] = [];
  const seen = new Set<number>();
  for (const pattern of LINKS) {
    for (const m of text.matchAll(pattern)) {
      const at = m.index ?? 0;
      if (seen.has(at) || PUBLIC_HOSTS.test(m[1])) continue;
      seen.add(at);
      out.push({ rule: 'url', offset: at });
    }
  }
  return out;
}

/** Fullwidth digits and letters ("０１２…") read as their plain forms, at the same offsets. */
function plain(text: string): string {
  return text.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

/**
 * Everything wrong with a text that will be PUBLISHED (the generated facts):
 * personal values, internal identifiers, demo names and engineering notes.
 */
export function scanPublicText(text: string): SafetyFinding[] {
  const flat = plain(text);
  return [...findAll(flat, VALUE_RULES), ...urlFindings(flat), ...findAll(text, INTERNAL_RULES)].sort(
    (a, b) => a.offset - b.offset,
  );
}

/**
 * The narrower check for a model's REPLY: personal values and outside links.
 * Identifier rules are left out here — a reply may legitimately echo a visitor's
 * own capitalised words — but a phone number, IC or email must never be shown to
 * one visitor and cached for the next.
 */
export function scanReplyText(text: string): SafetyFinding[] {
  const flat = plain(text);
  return [...findAll(flat, VALUE_RULES), ...urlFindings(flat)].sort((a, b) => a.offset - b.offset);
}

/** "rule×count" summary for logs and CI — names only, never values. */
export function describeFindings(findings: SafetyFinding[]): string {
  const counts = new Map<SafetyRule, number>();
  for (const f of findings) counts.set(f.rule, (counts.get(f.rule) ?? 0) + 1);
  return [...counts].map(([rule, n]) => `${rule}×${n}`).join(', ');
}
