/**
 * The WEB half of PhoneSheet's behaviour — what a real Modal gives a phone for
 * free, and an in-frame overlay has to do for itself (29 Sep 2026):
 *
 *  - ESCAPE closes the sheet on top, through that sheet's own
 *    `onRequestClose` — so a sheet that asks "discard?" on the hardware back
 *    button asks it on Escape too. Never while an IME is composing: there
 *    Escape cancels the COMPOSITION (a Chinese PR mid-word), not the sheet.
 *  - FOCUS moves into the sheet when it opens, Tab and Shift+Tab stay inside
 *    it, focus that wanders out (a click on the page around the phone frame,
 *    a Tab from the body) is brought back, and on close it returns to what the
 *    PR had focused before — unless a newer sheet has since taken it.
 *
 * "On top" means the DEEPEST open sheet, newest first among equals — the same
 * nesting order PhoneSheet stacks by, not DOM or mount order: React mounts a
 * child sheet's effects before its parent's, so "the last one registered"
 * would be the PARENT whenever both open in one commit.
 *
 * Plain functions over a structural slice of the DOM (this app has no DOM lib,
 * deliberately — see PhoneSheet.tsx), so every rule is unit-tested against
 * fakes (`PhoneSheet.test.tsx`). Nothing here runs on a phone.
 */

/** The slice of a DOM element this file touches. */
export type SheetNode = {
  focus?: (options?: { preventScroll?: boolean }) => void;
  contains?: (other: unknown) => boolean;
  querySelectorAll?: (selector: string) => ArrayLike<SheetNode>;
  getAttribute?: (name: string) => string | null;
  getClientRects?: () => ArrayLike<unknown>;
  isConnected?: boolean;
};

type KeyEventLike = {
  key?: string;
  shiftKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
  defaultPrevented?: boolean;
  preventDefault?: () => void;
};

type FocusEventLike = { target?: unknown };

/** The slice of `document` this file touches. */
export type SheetDocument = {
  activeElement?: unknown;
  body?: unknown;
  getElementById?: (id: string) => unknown;
  addEventListener?: (type: string, listener: (event: never) => void) => void;
  removeEventListener?: (type: string, listener: (event: never) => void) => void;
};

/** The browser document, or undefined (a phone, a test that has none). */
export function webDocument(): SheetDocument | undefined {
  return (globalThis as { document?: SheetDocument }).document;
}

type OpenSheet = {
  /** DOM id of the sheet's overlay element. */
  id: string;
  /** How many sheets enclose it (PhoneSheet's SheetDepth). */
  depth: number;
  /** Registration order — breaks ties between sheets at one depth. */
  seq: number;
  /** The sheet's CURRENT onRequestClose. */
  close: () => void;
};

let openSheets: readonly OpenSheet[] = [];
let nextSeq = 0;
/** Removes the document listeners — set while at least one sheet is open. */
let detachListeners: (() => void) | null = null;

/** The sheet keys and focus belong to: the deepest, newest among equals. */
export function topSheet(): OpenSheet | undefined {
  return openSheets.reduce<OpenSheet | undefined>(
    (top, sheet) =>
      !top || sheet.depth > top.depth || (sheet.depth === top.depth && sheet.seq > top.seq)
        ? sheet
        : top,
    undefined,
  );
}

function asNode(value: unknown): SheetNode | null {
  return value != null && typeof value === 'object' ? (value as SheetNode) : null;
}

function nodeById(id: string, doc: SheetDocument | undefined): SheetNode | null {
  return asNode(doc?.getElementById?.(id));
}

function contains(node: SheetNode, other: unknown): boolean {
  return other != null && typeof node.contains === 'function' && node.contains(other);
}

function focusNode(node: SheetNode | null | undefined): void {
  node?.focus?.({ preventScroll: true });
}

/** What Tab can land on, in document order. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** The sheet's tabbable elements — hidden ones (no layout, aria-hidden) excluded. */
export function focusablesIn(node: SheetNode): SheetNode[] {
  return Array.from(node.querySelectorAll?.(FOCUSABLE) ?? []).filter((el) => {
    if (el.getAttribute?.('aria-hidden') === 'true') return false;
    const rects = el.getClientRects?.();
    return rects == null || rects.length > 0;
  });
}

/**
 * Escape and Tab while a sheet is open. Escape asks the sheet on top to close
 * — it decides, exactly as for a phone's back button. Tab wraps at either end,
 * and a Tab taken from outside the sheet lands back inside it.
 */
export function handleSheetKeyDown(event: KeyEventLike, doc: SheetDocument | undefined): void {
  const top = topSheet();
  if (!top || event.defaultPrevented) return;

  if (event.key === 'Escape' || event.key === 'Esc') {
    if (event.isComposing || event.keyCode === 229) return;
    event.preventDefault?.();
    top.close();
    return;
  }
  if (event.key !== 'Tab') return;

  const node = nodeById(top.id, doc);
  if (!node) return;
  const items = focusablesIn(node);
  if (items.length === 0) {
    event.preventDefault?.();
    focusNode(node);
    return;
  }
  const active = doc?.activeElement;
  const inside = contains(node, active);
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey) {
    if (!inside || active === first || active === node) {
      event.preventDefault?.();
      focusNode(last);
    }
  } else if (!inside || active === last) {
    event.preventDefault?.();
    focusNode(first);
  }
}

/** Focus that lands OUTSIDE the sheet on top is brought back into it. */
export function handleSheetFocusIn(event: FocusEventLike, doc: SheetDocument | undefined): void {
  const top = topSheet();
  if (!top) return;
  const node = nodeById(top.id, doc);
  if (!node || contains(node, event.target)) return;
  focusNode(node);
}

/**
 * An open sheet joins the stack; the returned function takes it out. The
 * document listeners exist exactly while at least one sheet is open.
 */
export function registerOpenSheet(
  sheet: { id: string; depth: number; close: () => void },
  doc: SheetDocument | undefined = webDocument(),
): () => void {
  const entry: OpenSheet = { ...sheet, seq: ++nextSeq };
  openSheets = [...openSheets, entry];
  if (!detachListeners && doc?.addEventListener && doc.removeEventListener) {
    // Captured, and always called AS METHODS: a browser's add/removeEventListener
    // throws "Illegal invocation" once detached from its document.
    const target = doc;
    const onKeyDown = (event: KeyEventLike) => handleSheetKeyDown(event, target);
    const onFocusIn = (event: FocusEventLike) => handleSheetFocusIn(event, target);
    target.addEventListener?.('keydown', onKeyDown);
    target.addEventListener?.('focusin', onFocusIn);
    detachListeners = () => {
      target.removeEventListener?.('keydown', onKeyDown);
      target.removeEventListener?.('focusin', onFocusIn);
    };
  }
  return () => {
    openSheets = openSheets.filter((open) => open !== entry);
    if (openSheets.length === 0 && detachListeners) {
      detachListeners();
      detachListeners = null;
    }
  };
}

/**
 * Moves focus into a sheet that has just opened. Only the sheet ON TOP takes
 * focus: a parent mounted in the same commit as its picker must not pull focus
 * down under it. Leaves focus alone when it is already inside — a search box
 * that focused itself on mount, or a sheet re-shown mid-exit. (Where focus goes
 * BACK to is noted by PhoneSheet before the sheet mounts; see `restoreFocus`.)
 */
export function focusIntoSheet(id: string, doc: SheetDocument | undefined = webDocument()): void {
  const node = nodeById(id, doc);
  if (node && topSheet()?.id === id && !contains(node, doc?.activeElement)) focusNode(node);
}

/**
 * Gives focus back to what had it before the sheet opened — but only while it
 * is still this sheet's to give: focus inside the closing sheet, or dropped to
 * the page when the sheet left. A newer sheet that has taken it keeps it, and
 * an opener that no longer exists is left alone.
 */
export function restoreFocus(
  previous: unknown,
  id: string,
  doc: SheetDocument | undefined = webDocument(),
): void {
  const target = asNode(previous);
  if (!doc || !target || typeof target.focus !== 'function') return;
  if (target.isConnected === false) return;
  const active = doc.activeElement;
  const node = nodeById(id, doc);
  const ours = active == null || active === doc.body || (node != null && contains(node, active));
  if (ours) focusNode(target);
}

/**
 * Whether a sheet may MOVE. Motion is opt-in ("reduced motion first"): only
 * when the device answers that it has no preference against it. A PR who asked
 * for less motion gets none — the sheet simply appears and leaves — and so does
 * any environment that cannot be asked at all. Called as a method on the global
 * so the browser's `matchMedia` keeps its `this`.
 */
export function motionAllowed(): boolean {
  const g = globalThis as { matchMedia?: (query: string) => { matches: boolean } };
  try {
    return g.matchMedia?.('(prefers-reduced-motion: no-preference)').matches === true;
  } catch {
    return false;
  }
}
