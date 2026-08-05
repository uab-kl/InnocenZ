/**
 * Receipt parser — build steps 2B-1 + 2B-2.
 *
 * Takes the raw text ML Kit read off a receipt photo and hunts 3 facts:
 *   1. the DATE,
 *   2. the ORDER / RECEIPT NUMBER,
 *   3. the ITEM LINES — matched FORGIVINGLY against the outlet's own menu
 *      (ignore capitals/spaces, allow up to 2 typo letters), so "tigerbeer"
 *      still finds "Tiger Beer" and brings the correct price.
 *
 * Pure functions, no I/O — testable with any receipt text.
 */
import type { MenuDrink } from './pr-rate';

// 1. THE DATE — matches things shaped like 23/07/26, 23-07-2026 or 2026-07-23.
const DATE_RE = /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})|(\d{4}-\d{2}-\d{2})/;

// 2. THE ORDER NUMBER — the code after "Order No." / "Receipt #" etc. The
//    capture MUST contain a digit (so "RE-ORDER\nTable" can never win) and the
//    strict "keyword + No." form is tried before the loose "No: 12345" form.
const ORDER_NO_STRICT_RE =
  /(?:receipt|order|inv(?:oice)?|bill|chk)\s*(?:no|num|number)?\.?\s*[:#.]?\s*([A-Z]{0,6}\d[A-Z0-9-]+)/i;
const ORDER_NO_LOOSE_RE = /(?:no\.?|#)\s*[:#.]?\s*([A-Z]{0,6}\d[A-Z0-9-]+)/i;
// Last resort: an order-code-shaped token ANYWHERE in the text (ORD0389,
// INV-1234, CHK0021…). ML Kit often splits "Order No." and its value into
// far-apart text blocks, so keyword adjacency can't be relied on.
const ORDER_TOKEN_RE = /\b(?:ORD|INV|BIL|BILL|CHK|RCP|TKT|REC)[-#]?[A-Z]{0,3}\d{2,}[A-Z0-9-]*\b/i;

// Order-code prefixes we know are LETTERS; everything after them is DIGITS.
const ORDER_PREFIXES = ['ORD', 'INV', 'RCP', 'BILL', 'BIL', 'CHK', 'TKT', 'REC', 'NO'];
// The camera's classic letter↔digit confusions, digit-side corrections.
const DIGIT_FIXES: Record<string, string> = {
  O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', G: '6', B: '8',
};

/**
 * Clean an OCR-read order code: when it starts with a known prefix (ORD, INV…),
 * every confusable LETTER in the number part becomes its digit twin — so
 * "ORDO389" (letter O) auto-corrects to "ORD0389". Tokens without a known
 * prefix are left untouched.
 */
export function normalizeOrderToken(raw: string): string {
  const token = raw.toUpperCase();
  const prefix = ORDER_PREFIXES.find((p) => token.startsWith(p) && token.length > p.length);
  if (!prefix) return token;
  const tail = token
    .slice(prefix.length)
    .split('')
    .map((ch) => DIGIT_FIXES[ch] ?? ch)
    .join('');
  // Only accept the fix if the tail is now digits/dashes — otherwise the token
  // wasn't letters+number shaped and we keep the original read.
  return /^[0-9-]+$/.test(tail) ? prefix + tail : token;
}

function findOrderNo(text: string): string | null {
  const hit =
    ORDER_NO_STRICT_RE.exec(text) ?? ORDER_NO_LOOSE_RE.exec(text) ?? ORDER_TOKEN_RE.exec(text);
  if (!hit) return null;
  return normalizeOrderToken(hit[1] ?? hit[0]);
}

// THE TIME — "09:43 PM" / "21:43", normalised to 24h "HH:MM". Colon form only
// (prices like 150.00 use a dot, so they can never be mistaken for a time);
// keeps scanning until a plausible clock value is found.
const TIME_RE = /(\d{1,2}):(\d{2})\s*(AM|PM)?/gi;

// OCR sometimes reads the colon as a dot ("09.43 PM") — accept the dot form
// ONLY when AM/PM follows (a price like 30.00 never has a meridiem).
const TIME_DOT_RE = /(\d{1,2})\.(\d{2})\s*(AM|PM)/gi;

export function findReceiptTime(text: string): string | null {
  for (const re of [TIME_RE, TIME_DOT_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      let h = Number(m[1]);
      const min = Number(m[2]);
      if (h > 23 || min > 59) continue;
      const mer = m[3]?.toUpperCase();
      if (mer === 'PM' && h < 12) h += 12;
      if (mer === 'AM' && h === 12) h = 0;
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    }
  }
  return null;
}

// 3. AN ITEM LINE — starts with a quantity, ends with a price.
//    example:  "2  Tiger Beer   36.00"  →  qty 2, name "Tiger Beer", amount 36.00
const ITEM_RE = /^(\d{1,2})\s+(.+?)\s+(\d+[.,]\d{2})$/;

// Also understands "Tiger Beer x2" / "2x Tiger Beer" style quantities.
const QTY_SUFFIX_RE = /(?:^|\s)[x×](\d{1,2})(?:\s|$)|(?:^|\s)(\d{1,2})[x×](?:\s|$)/i;

// 4. A QUANTITY WITH NO PRICE ON THE LINE — "2 Havoc", "1 Booking Commision".
//    Plenty of receipts list what was ordered and put the money elsewhere, or
//    nowhere at all for tips and service items. ITEM_RE above REQUIRES a
//    trailing price, so every one of those lines used to read as quantity 1
//    however many the receipt actually said.
//    The `\D` lookahead keeps this off "2 1000.00", where the second number is
//    an amount rather than a name.
const LEADING_QTY_RE = /^(\d{1,2})\s+(?=\D)/;

// 5. ...and the same line with the space lost: "2Havoc". Guarded by the item
//    name at the call site, because a name can legitimately START with digits —
//    "7Up" must never be read as seven Ups.
const LEADING_QTY_NOSPACE_RE = /^(\d{1,2})(?=[a-z])/i;

export type ParsedReceipt = {
  /** Receipt date normalised to YYYY-MM-DD, or null when unreadable. */
  date: string | null;
  /** Receipt time normalised to 24h HH:MM, or null when unreadable. */
  time: string | null;
  /** Order / receipt number, or null when unreadable. */
  orderNo: string | null;
  /** Menu items the OCR text mentioned, with the best quantity guess. */
  matches: ReceiptMatch[];
  /** Every non-empty line the OCR read (for debugging / "show raw text"). */
  lines: string[];
};

export type ReceiptMatch = {
  /** Menu slug (outlet_drink_menu.slug) — self-log keys quantities on it. */
  id: string;
  /** Menu display name. */
  name: string;
  /** Unit price from the OUTLET MENU (never trust the receipt's arithmetic). */
  priceRm: number;
  /** Quantity read off the receipt line, default 1. */
  qty: number;
  /**
   * Whether that quantity was actually READ, or assumed because the line did
   * not print one. A silent default of 1 is indistinguishable from a real 1 on
   * screen, which is how a receipt saying "2 Havoc" was logged as one — so the
   * screen can mark the assumed ones and ask the PR to check.
   */
  qtyFromReceipt: boolean;
};

/** lowercase + strip everything but letters/digits: "Tiger Beer" → "tigerbeer". */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Levenshtein distance with an early exit above `max` (only need ≤2). */
function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let best = max + 1;
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = tmp;
      if (prev[j] < best) best = prev[j];
    }
    if (best > max) return max + 1;
  }
  return prev[b.length];
}

/** Words of a raw line, lowercased ("Lemon Drop 12" → ['lemon','drop','12']). */
function lineTokens(line: string): string[] {
  const lower = line.toLowerCase();
  const plain = lower.split(/[^a-z0-9]+/).filter(Boolean);
  // Thermal receipts kern tight and OCR often loses the space between the
  // quantity and the name — "1 Tips" comes back as "1Tips", one token, so an
  // exact-word test on a short name finds nothing. Splitting digit/letter
  // boundaries recovers it. The plain tokens are kept as well, because a name
  // may legitimately contain digits ("7Up") and must still match whole.
  const split = lower
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return [...new Set([...plain, ...split])];
}

/**
 * Fold the digit-for-letter substitutions OCR actually makes on receipt paper:
 * 0/o, 1/i, 5/s, 8/b. Applied to BOTH sides before comparing, so "T1ps" reaches
 * "tips" — while a real word cannot: "this" folds to "this", not "tips".
 *
 * Only digits become letters, never the reverse. Letter-to-letter guesses (l→i,
 * rn→m) are where short-name matching starts inventing hits.
 */
function foldOcrDigits(token: string): string {
  return token.replace(/0/g, 'o').replace(/1/g, 'i').replace(/5/g, 's').replace(/8/g, 'b');
}

/**
 * Forgiving "does this receipt line mention this menu item?" test — but the
 * typo allowance SCALES with the name's length, so a short name like "Tip" /
 * "Tips" can never be faked by a nearby word ("this", "Shots"):
 *   < 5 letters  → must appear as an EXACT standalone word;
 *   5–8 letters  → up to 1 typo;
 *   9+ letters   → up to 2 typos.
 */
export function lineMentionsItem(line: string, itemName: string): boolean {
  return findItemInLine(line, itemName) >= 0;
}

/**
 * WHERE the item's name sits in the normalised line, or -1 if it is not there.
 *
 * Same test as `lineMentionsItem`, but returning the position — because the
 * quantity is the number immediately BEFORE the name, and on a line OCR welded
 * together ("1 Tips 1 Booking Commision 5 Havoc") that is the only way each item
 * gets its own number instead of the line's first one. Folding preserves length,
 * so an index found in the folded line is valid in the raw one.
 */
export function findItemInLine(line: string, itemName: string): number {
  const l = normalize(line);
  const n = normalize(itemName);
  if (!l || !n) return -1;
  const foldedName = foldOcrDigits(n);
  const foldedLine = foldOcrDigits(l);

  if (n.length < 5) {
    // Exact standalone word — but accept the singular/plural twin: receipts
    // print "TIP 5.00" while outlets configure the item as "Tips", and that
    // pair must match without opening the door to typo-matching short words.
    const hit = lineTokens(line).some((token) => {
      for (const t of [token, foldOcrDigits(token)]) {
        if (t === n || `${t}s` === n || t === `${n}s`) return true;
        if (t === foldedName || `${t}s` === foldedName || t === `${foldedName}s`) return true;
      }
      return false;
    });
    if (!hit) return -1;
    // Position for the quantity lookup. The folded search is the fallback for a
    // name OCR spelt with digits ("t1ps"); folding is 1:1 so the index still
    // points at the same place in the raw normalised line. Singular-on-paper
    // ("tip" for "Tips") won't index either — 0 is a safe answer there, since
    // the caller only counts digits BEFORE the name.
    const direct = l.indexOf(n);
    if (direct >= 0) return direct;
    const viaFold = foldedLine.indexOf(foldedName);
    if (viaFold >= 0) return viaFold;
    const singular = l.indexOf(n.replace(/s$/, ''));
    return singular >= 0 ? singular : 0;
  }

  const direct = l.indexOf(n);
  if (direct >= 0) return direct;
  const viaFold = foldedLine.indexOf(foldedName);
  if (viaFold >= 0) return viaFold;
  const maxTypos = n.length >= 9 ? 2 : 1;
  for (let start = 0; start + n.length - maxTypos <= l.length; start++) {
    const win = l.slice(start, start + n.length);
    if (editDistance(win, n, maxTypos) <= maxTypos) {
      /*
       * A fuzzy window can begin one character EARLY and swallow the quantity:
       * "3bookingcommision" is within two edits of "bookingcommission", so the
       * index would point at the 3 and the caller would find no digits before
       * the name. Step past leading digits so the index lands on the name
       * itself — unless the name genuinely starts with digits ("1664 Blanc"),
       * where those digits ARE the name.
       */
      let at = start;
      if (!/^\d/.test(n)) {
        while (at < l.length && /\d/.test(l[at])) at += 1;
      }
      return at;
    }
  }
  return -1;
}

/**
 * Best quantity guess for a line: priced item line, "x2"/"2x", a bare leading
 * number, else 1.
 *
 * Only ever called on a line that already matched a menu item by name, which is
 * what makes the bare-leading-number case safe: a date or a table number cannot
 * reach here unless it shares a line with the item.
 */
function qtyFromLine(
  line: string,
  itemName: string,
  nameAt: number,
): { qty: number; read: boolean } {
  const trimmed = line.trim();

  /*
   * FIRST: the digits sitting immediately before THIS item's name.
   *
   * OCR sometimes returns several items welded into one line —
   * "1 Tips 1 Booking Commision 5 Havoc" — and every rule below reads the
   * LEADING number, which would bill five Havoc as one and one Tips as five.
   * Working from the name outwards gets each item its own quantity.
   *
   * `nameAt` comes from the matcher, so this works for a name found through the
   * typo allowance too ("Commision" for "commission") — re-deriving the index
   * here with an exact indexOf found nothing in exactly that case, and the
   * misspelt item silently took the line's first number.
   */
  const flat = normalize(trimmed);
  if (nameAt > 0) {
    const before = /(\d{1,2})$/.exec(flat.slice(0, nameAt));
    if (before) {
      const q = Number(before[1]);
      if (q >= 1 && q <= 99) return { qty: q, read: true };
    }
  }

  const item = ITEM_RE.exec(trimmed);
  if (item) {
    const q = Number(item[1]);
    if (q >= 1 && q <= 99) return { qty: q, read: true };
  }
  const suffix = QTY_SUFFIX_RE.exec(line);
  if (suffix) {
    const q = Number(suffix[1] ?? suffix[2]);
    if (q >= 1 && q <= 99) return { qty: q, read: true };
  }
  /*
   * A name that itself starts with digits — "1664", "100 Plus", "7Up", all
   * ordinary bar items here — defeats the `\D` lookahead below: "2 1664" is a
   * quantity followed by a name, and no general rule can tell that from a
   * number followed by an amount. The name we already matched settles it.
   */
  const nameKey = normalize(itemName);
  if (/^\d/.test(nameKey)) {
    const split = /^(\d{1,2})\s+(.*)$/.exec(trimmed);
    if (split && normalize(split[2]).startsWith(nameKey)) {
      const q = Number(split[1]);
      if (q >= 1 && q <= 99) return { qty: q, read: true };
    }
  }

  // Last, because they are the loosest: a leading number with no price after it,
  // then the same with the space lost.
  const leading = LEADING_QTY_RE.exec(trimmed);
  if (leading) {
    const q = Number(leading[1]);
    if (q >= 1 && q <= 99) return { qty: q, read: true };
  }
  const glued = LEADING_QTY_NOSPACE_RE.exec(trimmed);
  if (glued && !normalize(itemName).startsWith(glued[1])) {
    const q = Number(glued[1]);
    if (q >= 1 && q <= 99) return { qty: q, read: true };
  }
  return { qty: 1, read: false };
}

/** dd/mm/yy(yy) or yyyy-mm-dd → YYYY-MM-DD, or null when nonsense. */
export function normalizeReceiptDate(raw: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (iso) return raw;
  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(raw);
  if (!dmy) return null;
  const d = Number(dmy[1]);
  const m = Number(dmy[2]);
  let y = Number(dmy[3]);
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * The whole job in one call: OCR text + this outlet's menu (already sliced to
 * the scan category) → date, order number, and the matched menu items.
 */
export function parseReceipt(text: string, menu: MenuDrink[]): ParsedReceipt {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const dateRaw = DATE_RE.exec(text)?.[0] ?? null;
  const orderNo = findOrderNo(text);

  const byId = new Map<string, ReceiptMatch>();
  for (const line of lines) {
    for (const item of menu) {
      const nameAt = findItemInLine(line, item.name);
      if (nameAt < 0) continue;
      const { qty, read } = qtyFromLine(line, item.name, nameAt);
      const prev = byId.get(item.id);
      if (!prev) {
        byId.set(item.id, {
          id: item.id,
          name: item.name,
          priceRm: item.priceRm,
          qty,
          qtyFromReceipt: read,
        });
        continue;
      }
      // One item can appear on several lines ("2 Havoc", then "Havoc 2000.00").
      // A PRINTED number wins outright over an assumed one; between two printed
      // numbers take the larger, since OCR drops digits far more often than it
      // invents them.
      if (read && !prev.qtyFromReceipt) {
        prev.qty = qty;
        prev.qtyFromReceipt = true;
      } else if (read === prev.qtyFromReceipt) {
        prev.qty = Math.max(prev.qty, qty);
      }
    }
  }

  return {
    date: dateRaw ? normalizeReceiptDate(dateRaw) : null,
    time: findReceiptTime(text),
    orderNo,
    matches: [...byId.values()],
    lines,
  };
}

/** Fallback receipt ref when OCR couldn't read one: RCP-{OUTLET}-{yyyymmdd}-{hhmmss}. */
export function fallbackReceiptRef(outlet: string, now: Date = new Date()): string {
  const slug = outlet.replace(/[^a-zA-Z0-9]+/g, '').toUpperCase().slice(0, 8) || 'OUTLET';
  const p = (n: number) => String(n).padStart(2, '0');
  return `RCP-${slug}-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}
