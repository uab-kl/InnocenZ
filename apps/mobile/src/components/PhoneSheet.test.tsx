// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test/jest as globals.
import * as fs from 'fs';
import * as path from 'path';
import * as React from 'react';
import { Platform, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { act, render } from '@testing-library/react-native';

import { PhoneSheet } from './PhoneSheet';
import { motionAllowed, registerOpenSheet } from './phone-sheet-web';

/*
 * THE ONE OVERLAY HOST. A bare RN `Modal` on the web build portals to the
 * browser's <body> and covers the whole window, outside the phone frame the
 * app draws in (28 Sep 2026 audit: CheckIn ×3, the history pickers, the
 * evidence sheet, the photo viewer, Security, Forgot password, the sign-up
 * pickers …). They all go through PhoneSheet now; this file pins how it
 * behaves, and that nothing new slips back to a bare Modal.
 */

jest.setTimeout(30_000);

jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: jest.fn((node: unknown) => node),
}));

type PortalMock = jest.Mock<
  unknown,
  [React.ReactElement<{ style: StyleProp<ViewStyle> }>, unknown]
>;

function portal(): PortalMock {
  return (jest.requireMock('react-dom') as { createPortal: PortalMock }).createPortal;
}

/** Run `body` as the web build, with a phone-screen element to portal into. */
async function onWeb(body: (host: object) => Promise<void>) {
  const host = { id: 'iz-phone-screen' };
  const doc = globalThis as { document?: unknown };
  const savedDocument = doc.document;
  const savedOs = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'web' });
  doc.document = { getElementById: (id: string) => (id === 'iz-phone-screen' ? host : null) };
  try {
    await body(host);
  } finally {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => savedOs });
    doc.document = savedDocument;
  }
}

beforeEach(() => {
  portal().mockClear();
});

describe('PhoneSheet on the web build', () => {
  test('portals into the phone screen element, not the browser window', async () => {
    await onWeb(async (host) => {
      const screen = await render(
        <PhoneSheet visible onRequestClose={jest.fn()}>
          <Text>inside</Text>
        </PhoneSheet>,
      );
      expect(screen.getByText('inside')).toBeTruthy();
      expect(portal()).toHaveBeenCalledWith(expect.anything(), host);
    });
  });

  test('a closed sheet renders nothing and portals nothing', async () => {
    await onWeb(async () => {
      const screen = await render(
        <PhoneSheet visible={false} onRequestClose={jest.fn()}>
          <Text>inside</Text>
        </PhoneSheet>,
      );
      expect(screen.queryByText('inside')).toBeNull();
      expect(portal()).not.toHaveBeenCalled();
    });
  });

  test('a sheet opened INSIDE a sheet stacks above it — even when both mount in one commit', async () => {
    // React appends a portal's children before its parent's, so DOM order
    // alone would put the parent on top and hide the picker just opened.
    await onWeb(async () => {
      await render(
        <PhoneSheet visible onRequestClose={jest.fn()}>
          <Text>outer</Text>
          <PhoneSheet visible onRequestClose={jest.fn()}>
            <Text>inner</Text>
          </PhoneSheet>
        </PhoneSheet>,
      );
      const z = portal().mock.calls.map(
        ([overlay]) => StyleSheet.flatten(overlay.props.style)?.zIndex,
      );
      expect(z).toEqual([100, 101]);
    });
  });

  test('with no phone element yet (first paint) it renders in place rather than dropping', async () => {
    const doc = globalThis as { document?: unknown };
    const savedDocument = doc.document;
    const savedOs = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'web' });
    doc.document = { getElementById: () => null };
    try {
      const screen = await render(
        <PhoneSheet visible onRequestClose={jest.fn()}>
          <Text>inside</Text>
        </PhoneSheet>,
      );
      expect(screen.getByText('inside')).toBeTruthy();
      expect(portal()).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, get: () => savedOs });
      doc.document = savedDocument;
    }
  });
});

/*
 * THE WEB SHEET'S KEYBOARD, FOCUS AND MOTION (29 Sep 2026). A phone's Modal
 * closes on the back button, owns focus and animates; the in-frame web overlay
 * did none of it — Escape did nothing, Tab walked out into the page behind, and
 * it popped in and out. Driven here against a small fake document (listeners,
 * focus, one node per sheet): nothing opens a browser.
 */
type FakeNode = {
  id: string;
  children: FakeNode[];
  focus: jest.Mock;
  contains: (other: unknown) => boolean;
  querySelectorAll: () => FakeNode[];
  getAttribute: () => null;
  isConnected: boolean;
};

function fakeDom() {
  const listeners: Record<string, ((event: unknown) => void)[]> = {};
  const host = { id: 'iz-phone-screen' };
  /** One node per sheet, created the first time the sheet looks itself up. */
  const sheets: FakeNode[] = [];
  /** Nodes every sheet contains — a control rendered inside it. */
  const inside: FakeNode[] = [];
  const doc = {
    activeElement: null as unknown,
    body: { id: 'body' },
    getElementById(id: string): unknown {
      if (id === 'iz-phone-screen') return host;
      if (!id.startsWith('iz-sheet-')) return null;
      const found = sheets.find((s) => s.id === id);
      if (found) return found;
      const node = makeNode(id, sheets);
      node.children.push(...inside);
      return node;
    },
    addEventListener(type: string, fn: (event: unknown) => void) {
      listeners[type] = [...(listeners[type] ?? []), fn];
    },
    removeEventListener(type: string, fn: (event: unknown) => void) {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
    },
  };
  function makeNode(id: string, into?: FakeNode[]): FakeNode {
    const node: FakeNode = {
      id,
      children: [],
      focus: jest.fn(() => {
        doc.activeElement = node;
      }),
      contains: (other) => other === node || node.children.includes(other as FakeNode),
      querySelectorAll: () => node.children,
      getAttribute: () => null,
      isConnected: true,
    };
    into?.push(node);
    return node;
  }
  /** Fires a document event at every listener, as the browser would. */
  function dispatch(type: string, event: object) {
    for (const fn of [...(listeners[type] ?? [])]) fn(event);
  }
  return { doc, sheets, inside, listeners, makeNode, dispatch };
}

/** Takes focus while it mounts — what an `autoFocus` search box does. */
function FocusesOnMount({ onMount }: { onMount: () => void }) {
  React.useLayoutEffect(onMount, [onMount]);
  return <Text>search</Text>;
}

/** Run `body` as the web build, against a fresh `fakeDom()`. */
async function onFakeWeb(body: (dom: ReturnType<typeof fakeDom>) => Promise<void>) {
  const dom = fakeDom();
  const g = globalThis as { document?: unknown };
  const savedDocument = g.document;
  const savedOs = Platform.OS;
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'web' });
  g.document = dom.doc;
  try {
    await body(dom);
  } finally {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => savedOs });
    g.document = savedDocument;
  }
}

const escapeKey = (extra: object = {}) => ({ key: 'Escape', preventDefault: jest.fn(), ...extra });

describe('PhoneSheet on the web — Escape', () => {
  test('Escape asks the sheet to close, through its own onRequestClose', async () => {
    await onFakeWeb(async (dom) => {
      const onRequestClose = jest.fn();
      await render(
        <PhoneSheet visible onRequestClose={onRequestClose}>
          <Text>inside</Text>
        </PhoneSheet>,
      );
      const event = escapeKey();
      dom.dispatch('keydown', event);
      expect(onRequestClose).toHaveBeenCalledTimes(1);
      expect(event.preventDefault).toHaveBeenCalled();
    });
  });

  test('a picker open inside a sheet: Escape closes the PICKER only — even when both mounted in one commit', async () => {
    // React runs the picker's effects before its parent's, so "the last sheet
    // registered" would be the PARENT here. The top is the deepest.
    await onFakeWeb(async (dom) => {
      const closeSheet = jest.fn();
      const closePicker = jest.fn();
      await render(
        <PhoneSheet visible onRequestClose={closeSheet}>
          <Text>sheet</Text>
          <PhoneSheet visible onRequestClose={closePicker}>
            <Text>picker</Text>
          </PhoneSheet>
        </PhoneSheet>,
      );
      dom.dispatch('keydown', escapeKey());
      expect(closePicker).toHaveBeenCalledTimes(1);
      expect(closeSheet).not.toHaveBeenCalled();
    });
  });

  test('Escape that ends an IME composition (a PR mid-word in Chinese) closes nothing', async () => {
    await onFakeWeb(async (dom) => {
      const onRequestClose = jest.fn();
      await render(
        <PhoneSheet visible onRequestClose={onRequestClose}>
          <Text>inside</Text>
        </PhoneSheet>,
      );
      dom.dispatch('keydown', escapeKey({ isComposing: true }));
      dom.dispatch('keydown', escapeKey({ keyCode: 229 }));
      expect(onRequestClose).not.toHaveBeenCalled();
    });
  });

  test('Escape asks the handler the sheet has NOW, not the one it opened with', async () => {
    await onFakeWeb(async (dom) => {
      const first = jest.fn();
      const now = jest.fn();
      const screen = await render(
        <PhoneSheet visible onRequestClose={first}>
          <Text>inside</Text>
        </PhoneSheet>,
      );
      await screen.rerender(
        <PhoneSheet visible onRequestClose={now}>
          <Text>inside</Text>
        </PhoneSheet>,
      );
      dom.dispatch('keydown', escapeKey());
      expect(now).toHaveBeenCalledTimes(1);
      expect(first).not.toHaveBeenCalled();
    });
  });

  test('the document listens only while a sheet is open — none left behind after it closes', async () => {
    await onFakeWeb(async (dom) => {
      const onRequestClose = jest.fn();
      const screen = await render(
        <PhoneSheet visible onRequestClose={onRequestClose}>
          <Text>inside</Text>
        </PhoneSheet>,
      );
      expect(dom.listeners.keydown).toHaveLength(1);
      expect(dom.listeners.focusin).toHaveLength(1);
      await screen.rerender(
        <PhoneSheet visible={false} onRequestClose={onRequestClose}>
          <Text>inside</Text>
        </PhoneSheet>,
      );
      expect(dom.listeners.keydown).toHaveLength(0);
      expect(dom.listeners.focusin).toHaveLength(0);
      dom.dispatch('keydown', escapeKey());
      expect(onRequestClose).not.toHaveBeenCalled();
    });
  });
});

describe('PhoneSheet on the web — focus', () => {
  test('focus moves INTO the sheet when it opens, and goes BACK to what had it when it closes', async () => {
    await onFakeWeb(async (dom) => {
      const opener = dom.makeNode('opener');
      dom.doc.activeElement = opener;
      const sheet = (visible: boolean) => (
        <PhoneSheet visible={visible} onRequestClose={jest.fn()}>
          <Text>inside</Text>
        </PhoneSheet>
      );
      const screen = await render(sheet(false));
      await screen.rerender(sheet(true));

      const [overlay] = dom.sheets;
      expect(overlay.focus).toHaveBeenCalledTimes(1);
      expect(dom.doc.activeElement).toBe(overlay);

      await screen.rerender(sheet(false));
      expect(opener.focus).toHaveBeenCalledTimes(1);
      expect(dom.doc.activeElement).toBe(opener);
    });
  });

  test('a search box that focuses itself on mount KEEPS focus — and closing still returns it to the opener', async () => {
    // The sign-up picker's search box does this. Asking "what had focus?" after
    // the sheet mounted would record the sheet's own input as the way back.
    await onFakeWeb(async (dom) => {
      const opener = dom.makeNode('opener');
      const search = dom.makeNode('search');
      dom.inside.push(search);
      dom.doc.activeElement = opener;
      const focusSearch = () => {
        dom.doc.activeElement = search;
      };
      const sheet = (visible: boolean) => (
        <PhoneSheet visible={visible} onRequestClose={jest.fn()}>
          <FocusesOnMount onMount={focusSearch} />
        </PhoneSheet>
      );
      const screen = await render(sheet(false));
      await screen.rerender(sheet(true));

      const [overlay] = dom.sheets;
      expect(dom.doc.activeElement).toBe(search);
      expect(overlay.focus).not.toHaveBeenCalled();

      await screen.rerender(sheet(false));
      expect(opener.focus).toHaveBeenCalledTimes(1);
      expect(dom.doc.activeElement).toBe(opener);
    });
  });

  test('Tab stays inside: last → first, Shift+Tab first → last, and a Tab from outside lands inside', () => {
    const dom = fakeDom();
    const sheet = dom.makeNode('iz-sheet-trap', dom.sheets);
    const [first, middle, last] = ['a', 'b', 'c'].map((id) => {
      const node = dom.makeNode(id);
      sheet.children.push(node);
      return node;
    });
    const unregister = registerOpenSheet({ id: sheet.id, depth: 0, close: jest.fn() }, dom.doc);
    try {
      dom.doc.activeElement = last;
      const wrap = { key: 'Tab', preventDefault: jest.fn() };
      dom.dispatch('keydown', wrap);
      expect(first.focus).toHaveBeenCalled();
      expect(wrap.preventDefault).toHaveBeenCalled();

      dom.doc.activeElement = first;
      dom.dispatch('keydown', { key: 'Tab', shiftKey: true, preventDefault: jest.fn() });
      expect(last.focus).toHaveBeenCalled();

      // Mid-list, the browser's own order is left alone.
      dom.doc.activeElement = middle;
      const inner = { key: 'Tab', preventDefault: jest.fn() };
      dom.dispatch('keydown', inner);
      expect(inner.preventDefault).not.toHaveBeenCalled();

      // Focus that wandered out to the page around the phone comes back in.
      first.focus.mockClear();
      dom.doc.activeElement = dom.doc.body;
      dom.dispatch('keydown', { key: 'Tab', preventDefault: jest.fn() });
      expect(first.focus).toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  test('a sheet with nothing to tab to keeps focus on itself', () => {
    const dom = fakeDom();
    const sheet = dom.makeNode('iz-sheet-empty', dom.sheets);
    const unregister = registerOpenSheet({ id: sheet.id, depth: 0, close: jest.fn() }, dom.doc);
    try {
      const tab = { key: 'Tab', preventDefault: jest.fn() };
      dom.dispatch('keydown', tab);
      expect(tab.preventDefault).toHaveBeenCalled();
      expect(sheet.focus).toHaveBeenCalled();
    } finally {
      unregister();
    }
  });

  test('focus that lands OUTSIDE the sheet on top is brought back into it', () => {
    const dom = fakeDom();
    const sheet = dom.makeNode('iz-sheet-guard', dom.sheets);
    const inside = dom.makeNode('inside');
    sheet.children.push(inside);
    const unregister = registerOpenSheet({ id: sheet.id, depth: 0, close: jest.fn() }, dom.doc);
    try {
      dom.dispatch('focusin', { target: inside });
      expect(sheet.focus).not.toHaveBeenCalled();
      dom.dispatch('focusin', { target: dom.makeNode('page-behind') });
      expect(sheet.focus).toHaveBeenCalled();
    } finally {
      unregister();
    }
  });
});

describe('PhoneSheet on the web — motion', () => {
  /** Lets real animation frames run INSIDE act, so each one is a flushed render. */
  const settle = (ms: number) =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  const overlayStyle = (screen: Awaited<ReturnType<typeof render>>) =>
    StyleSheet.flatten(screen.getByTestId('phone-sheet').props.style);

  /** The device answers "no preference" — motion is allowed. */
  async function withMotion(body: () => Promise<void>) {
    const g = globalThis as { matchMedia?: unknown };
    const saved = g.matchMedia;
    g.matchMedia = (query: string) => ({
      matches: query === '(prefers-reduced-motion: no-preference)',
    });
    try {
      await body();
    } finally {
      g.matchMedia = saved;
    }
  }

  test('it slides up and fades in, and leaves the same way — untouchable while it goes', async () => {
    await withMotion(() =>
      onFakeWeb(async () => {
        const sheet = (visible: boolean, text: string) => (
          <PhoneSheet visible={visible} animationType="slide" onRequestClose={jest.fn()}>
            <Text>{text}</Text>
          </PhoneSheet>
        );
        const screen = await render(sheet(true, 'inside'));
        expect(overlayStyle(screen).opacity).toBe(0);
        expect(overlayStyle(screen).transform).toEqual([{ translateY: 28 }]);

        await settle(400);
        expect(overlayStyle(screen).opacity).toBe(1);
        expect(overlayStyle(screen).transform).toEqual([{ translateY: 0 }]);
        expect(overlayStyle(screen).pointerEvents).toBe('auto');

        // Closing: still on screen for its exit, showing what it showed — a
        // cleared target must not collapse it mid-fade — and taking no touches.
        await screen.rerender(sheet(false, 'cleared'));
        expect(screen.getByText('inside')).toBeTruthy();
        expect(screen.queryByText('cleared')).toBeNull();
        expect(overlayStyle(screen).pointerEvents).toBe('none');

        await settle(400);
        expect(screen.queryByTestId('phone-sheet')).toBeNull();
      }),
    );
  });

  test("'fade' only fades — no slide", async () => {
    await withMotion(() =>
      onFakeWeb(async () => {
        const screen = await render(
          <PhoneSheet visible animationType="fade" onRequestClose={jest.fn()}>
            <Text>inside</Text>
          </PhoneSheet>,
        );
        expect(overlayStyle(screen).transform).toBeUndefined();
        await settle(400);
        expect(overlayStyle(screen).opacity).toBe(1);
      }),
    );
  });

  test('a device that asks for less motion — or cannot be asked — gets none: shown at once, gone at once', async () => {
    await onFakeWeb(async () => {
      const sheet = (visible: boolean) => (
        <PhoneSheet visible={visible} onRequestClose={jest.fn()}>
          <Text>inside</Text>
        </PhoneSheet>
      );
      const screen = await render(sheet(true));
      expect(overlayStyle(screen).opacity).toBe(1);
      expect(overlayStyle(screen).transform).toEqual([{ translateY: 0 }]);
      await screen.rerender(sheet(false));
      expect(screen.queryByTestId('phone-sheet')).toBeNull();
    });
  });

  test('motion is opt-in: only an explicit "no preference" allows it', () => {
    const g = globalThis as { matchMedia?: unknown };
    const saved = g.matchMedia;
    try {
      g.matchMedia = undefined;
      expect(motionAllowed()).toBe(false);
      g.matchMedia = () => ({ matches: false });
      expect(motionAllowed()).toBe(false);
      g.matchMedia = () => {
        throw new Error('not supported');
      };
      expect(motionAllowed()).toBe(false);
      g.matchMedia = (query: string) => ({
        matches: query === '(prefers-reduced-motion: no-preference)',
      });
      expect(motionAllowed()).toBe(true);
    } finally {
      g.matchMedia = saved;
    }
  });
});

describe('PhoneSheet on a phone — the native Modal, unchanged', () => {
  test.each(['slide', 'fade'] as const)(
    'renders the transparent %s Modal every bare Modal it replaced used',
    async (animationType) => {
      const onRequestClose = jest.fn();
      const screen = await render(
        <PhoneSheet visible animationType={animationType} onRequestClose={onRequestClose}>
          <Text>inside</Text>
        </PhoneSheet>,
      );
      const [modal] = screen.container.queryAll((n) => n.type === 'Modal');
      expect(modal).toBeDefined();
      expect(modal.props.visible).toBe(true);
      expect(modal.props.transparent).toBe(true);
      expect(modal.props.animationType).toBe(animationType);
      // The hardware back button still closes it.
      expect(modal.props.onRequestClose).toBe(onRequestClose);
      expect(screen.getByText('inside')).toBeTruthy();
      expect(portal()).not.toHaveBeenCalled();
    },
  );

  test('slides by default, as the sheets it first hosted did', async () => {
    const screen = await render(
      <PhoneSheet visible onRequestClose={jest.fn()}>
        <Text>inside</Text>
      </PhoneSheet>,
    );
    const [modal] = screen.container.queryAll((n) => n.type === 'Modal');
    expect(modal.props.animationType).toBe('slide');
  });
});

/*
 * THE RATCHET. Every overlay goes through PhoneSheet; the two files allowed to
 * hold a `Modal` are PhoneSheet itself (its native branch) and Toast (its own
 * portal, because a toast must never take a tap).
 */
describe('no bare Modal anywhere in the app', () => {
  const SRC = path.resolve(__dirname, '..');
  const ALLOWED = new Set(['components/PhoneSheet.tsx', 'components/Toast.tsx']);

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.(tsx?|jsx?)$/.test(entry.name) && !/\.(test|spec)\./.test(entry.name)
        ? [full]
        : [];
    });
  }

  /** Imports `Modal` from react-native, or renders a `<Modal`. */
  function usesModal(source: string): boolean {
    const imports = [...source.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]react-native['"]/g)];
    const imported = imports.some((m) =>
      m[1].split(',').some((name) => name.trim().split(/\s+as\s+/)[0] === 'Modal'),
    );
    return imported || /<Modal[\s>]/.test(source);
  }

  const files = sourceFiles(SRC);
  const rel = (file: string) => path.relative(SRC, file).split(path.sep).join('/');

  test('the scan sees the app — and would flag a Modal (it flags the two allowed files)', () => {
    // A zero result is evidence about the instrument first: prove it reads the
    // tree and recognises a Modal before trusting it to report none.
    expect(files.length).toBeGreaterThan(50);
    const flagged = files.filter((f) => usesModal(fs.readFileSync(f, 'utf8'))).map(rel);
    expect(flagged).toEqual(expect.arrayContaining([...ALLOWED]));
  });

  test('no other file imports or renders a Modal', () => {
    const offenders = files
      .map(rel)
      .filter((file) => !ALLOWED.has(file))
      .filter((file) => usesModal(fs.readFileSync(path.join(SRC, file), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
