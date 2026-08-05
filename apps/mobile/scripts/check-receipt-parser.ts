/**
 * Receipt-parser check — runs on the PC, no phone and no APK rebuild.
 *
 *   cd apps/mobile && npx tsx scripts/check-receipt-parser.ts
 *
 * The parser is pure text-in/text-out, so the part that actually decides what a
 * PR gets paid can be proved here. Only the camera and ML Kit need a device:
 * this script starts from the TEXT ML Kit produces, which is where every bug
 * found on 4 Aug 2026 lived.
 *
 * The fixtures ARE those failures, kept so they cannot come back:
 *   • "2 Havoc" read as ×1        — ITEM_RE demanded a trailing price
 *   • "Tips" not detected at all  — short names need an exact word, and OCR
 *                                   loses the space ("1Tips") or reads i as 1
 *   • digit-leading names         — "2 1664" is a quantity AND a name
 */
import { parseReceipt, type ReceiptMatch } from '../src/lib/receipt-parser';
import type { MenuDrink } from '../src/lib/pr-rate';

/** Emhub Testing's real service entitlements, plus two digit-leading drinks. */
const MENU = [
  { id: 'tips', name: 'Tips', priceRm: 50 },
  { id: 'booking', name: 'Booking commission', priceRm: 100 },
  { id: 'havoc', name: 'Havoc', priceRm: 1000 },
  { id: '7up', name: '7Up', priceRm: 12 },
  { id: '1664', name: '1664 Blanc', priceRm: 28 },
] as unknown as MenuDrink[];

type Case = { label: string; text: string; expect: Record<string, number> };

const CASES: Case[] = [
  {
    label: 'the receipt from the report',
    text: [
      'Table No. S4',
      'Pax(s) : 0',
      'Order No.  ORD1111',
      '',
      '1 Tips',
      '2 Havoc',
      '',
      '16-06-2026   09:45PM',
      'BAR',
    ].join('\n'),
    expect: { Tips: 1, Havoc: 2 },
  },
  { label: 'OCR lost the spaces', text: '1Tips\n2Havoc', expect: { Tips: 1, Havoc: 2 } },
  { label: 'OCR read i as 1', text: '1 T1ps\n2 Havoc', expect: { Tips: 1, Havoc: 2 } },
  {
    label: 'priced item lines',
    text: '1  Tips   50.00\n2  Havoc  2000.00',
    expect: { Tips: 1, Havoc: 2 },
  },
  { label: 'x-suffix quantity', text: 'Havoc x3', expect: { Havoc: 3 } },
  { label: 'singular on paper, plural in the menu', text: 'TIP 5.00', expect: { Tips: 1 } },
  {
    label: 'digit-leading names carry a quantity',
    text: '3 7Up\n2 1664 Blanc',
    expect: { '7Up': 3, '1664 Blanc': 2 },
  },
  {
    // ML Kit's flattened text can weld a receipt's item lines into one. Each
    // item must still get ITS OWN number, not the line's leading one.
    label: 'items welded into one line',
    text: '1 Tips 1 Booking Commision 5 Havoc',
    expect: { Tips: 1, 'Booking commission': 1, Havoc: 5 },
  },
  {
    // The receipt's own typo, matched fuzzily, with a quantity that differs
    // from the line's first number — the case that used to pass by luck.
    label: 'welded, misspelt name, own quantity',
    text: '1 Tips 3 Booking Commision 5 Havoc',
    expect: { Tips: 1, 'Booking commission': 3, Havoc: 5 },
  },
  {
    label: 'welded, priced',
    text: '2 Havoc 2000.00 1 Tips 50.00',
    expect: { Havoc: 2, Tips: 1 },
  },
  {
    label: 'no quantity printed — assumed, and flagged',
    text: 'Havoc\nTips',
    expect: { Tips: 1, Havoc: 1 },
  },
];

/** Lines that must NEVER be read as an item — the short-name guard earning its keep. */
const MUST_NOT_MATCH = ['this round', 'Shots', 'Table No. S4', 'CASHIER 1', 'Pax(s) : 0', '5 Tops'];

function describeMatch(m: ReceiptMatch): string {
  return `${m.name} ×${m.qty}${m.qtyFromReceipt ? '' : ' (assumed)'}`;
}

let failures = 0;

for (const testCase of CASES) {
  const parsed = parseReceipt(testCase.text, MENU);
  const got: Record<string, number> = {};
  for (const m of parsed.matches) got[m.name] = m.qty;

  const names = new Set([...Object.keys(testCase.expect), ...Object.keys(got)]);
  const bad = [...names].filter((n) => (testCase.expect[n] ?? 0) !== (got[n] ?? 0));
  const total = parsed.matches.reduce((sum, m) => sum + m.qty * m.priceRm, 0);

  console.log(
    `${bad.length ? 'FAIL' : 'ok  '}  ${testCase.label.padEnd(38)} ` +
      `${parsed.matches.map(describeMatch).join(' | ') || '(nothing)'}  → RM ${total.toFixed(2)}`,
  );
  for (const n of bad) {
    failures += 1;
    console.log(`        ${n}: expected ×${testCase.expect[n] ?? 0}, got ×${got[n] ?? 0}`);
  }
}

let falsePositives = 0;
for (const line of MUST_NOT_MATCH) {
  const hit = parseReceipt(line, MENU).matches;
  if (hit.length > 0) {
    falsePositives += 1;
    failures += 1;
    console.log(
      `FAIL  ${JSON.stringify(line)} matched ${hit.map((m) => m.name).join(', ')} — it must match nothing`,
    );
  }
}
if (falsePositives === 0) {
  console.log(`ok    ${MUST_NOT_MATCH.length} non-item lines correctly matched nothing`);
}

console.log(failures === 0 ? '\nAll receipt-parser checks passed.' : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
