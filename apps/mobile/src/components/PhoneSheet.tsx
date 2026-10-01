/**
 * In-frame bottom-sheet host. RN `Modal` on web escapes the phone frame — it
 * overlays the whole browser viewport — so on web the overlay is portalled
 * into the PhoneFrame screen element and absolutely fills it: the sheet stays
 * inside the phone, clipped by its rounded corners. Native keeps the real
 * Modal (there the app already fills the physical screen). Children supply
 * the backdrop + sheet exactly as they would inside a Modal.
 *
 * EVERY overlay in the app goes through here — a bare `Modal` is the bug this
 * file exists to fix, not an alternative to it. (The toast has its own portal
 * because it must never take a tap; see Toast.tsx.)
 *
 * A sheet opened from INSIDE a sheet — the dial-code picker in Forgot password,
 * the calendar in the History filter, a receipt photo zoomed out of the
 * evidence sheet — stacks above its parent by NESTING DEPTH, not by DOM order.
 * React appends a portal's children before its parent's, so two sheets mounted
 * in one commit would otherwise land parent-on-top and hide the one just opened.
 *
 * ON THE WEB it now also does what a phone's Modal does for free (29 Sep 2026):
 * ESCAPE closes the sheet on top through its own `onRequestClose`; FOCUS moves
 * in, stays in, and goes back on close (`phone-sheet-web.ts`); and it ARRIVES
 * and LEAVES with a short slide or fade — none at all when the device asks for
 * reduced motion. Before this a web sheet ignored the keyboard entirely, Tab
 * walked straight out of it into the page behind, and it popped in and out.
 * Native is untouched: the same Modal, the same props (PhoneSheet.test.tsx).
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, Easing, Modal, Platform, StyleSheet } from 'react-native';
import { createPortal } from 'react-dom';

/** Exactly what react-dom's createPortal accepts as a container. */
type PortalHost = Parameters<typeof createPortal>[1];
import { PHONE_SCREEN_ID } from './PhoneFrame';
import {
  focusIntoSheet,
  motionAllowed,
  registerOpenSheet,
  restoreFocus,
  webDocument,
} from './phone-sheet-web';

/** How many PhoneSheets enclose this one. Web only — a phone stacks Modals itself. */
const SheetDepth = createContext(0);

/** Above the frame's pinned header (30) and tab bar (40), below the toast (200). */
const SHEET_Z = 100;

/** Web motion, short on purpose — a sheet is furniture, not a show. */
const ENTER_MS = 200;
const EXIT_MS = 150;
/**
 * How far a 'slide' sheet travels on the web: a hint of where it came from,
 * not the full-height slide of a phone's Modal. The backdrop is part of the
 * children, so the whole overlay moves — a short distance keeps that subtle.
 */
const SLIDE_PX = 28;
/** Prefix of each web sheet's DOM id — how Escape and the focus trap find it. */
const SHEET_ID_PREFIX = 'iz-sheet-';

type PhoneSheetProps = {
  visible: boolean;
  /**
   * Hardware back on a phone (the native Modal), and ESCAPE on the web. It is a
   * request: the sheet decides, and may ask first (Forgot password's "discard?").
   */
  onRequestClose: () => void;
  children: ReactNode;
  /**
   * A phone: the Modal's own animation. The bell and the language picker FADED
   * as bare Modals before they moved in here, and keep doing so. The web: a
   * short slide-up-and-fade, or a fade.
   */
  animationType?: 'slide' | 'fade';
};

export function PhoneSheet({
  visible,
  onRequestClose,
  children,
  animationType = 'slide',
}: PhoneSheetProps) {
  const depth = useContext(SheetDepth);
  if (Platform.OS === 'web') {
    return (
      <WebSheet
        visible={visible}
        onRequestClose={onRequestClose}
        animationType={animationType}
        depth={depth}
      >
        {children}
      </WebSheet>
    );
  }
  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      onRequestClose={onRequestClose}
    >
      {children}
    </Modal>
  );
}

function WebSheet({
  visible,
  onRequestClose,
  children,
  animationType,
  depth,
}: Required<PhoneSheetProps> & { depth: number }) {
  const nodeId = `${SHEET_ID_PREFIX}${useId()}`;

  // Escape asks whatever the sheet says NOW, not what it said when it opened.
  const closeRef = useRef(onRequestClose);
  useEffect(() => {
    closeRef.current = onRequestClose;
  });

  /*
   * ON SCREEN = visible, or LEAVING: a closed sheet stays for its short exit.
   * While it leaves it shows what it showed last — most sheets render their
   * content off a target the close has just cleared, and would otherwise
   * collapse to an empty frame mid-fade — and it takes no touches, so a stale
   * button can never fire on its way out.
   */
  const [leaving, setLeaving] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);
  /*
   * WHAT HAD FOCUS BEFORE IT OPENED — the place focus goes back to. Read while
   * RENDERING the open, before the commit that mounts the sheet: a control in
   * it that focuses itself on mount (the sign-up picker's search box) takes
   * focus during that commit, and asking afterwards would record the sheet's
   * own input as the way back.
   */
  const openerRef = useRef<unknown>(visible ? (webDocument()?.activeElement ?? null) : null);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    setLeaving(!visible);
    if (visible) openerRef.current = webDocument()?.activeElement ?? null;
  }
  const lastChildren = useRef<ReactNode>(children);
  if (visible) lastChildren.current = children;

  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible && !leaving) return;
    const animation = Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      // Zero = no motion at all: the value lands at once and a closing sheet
      // is gone at once (the device asked for less motion, or cannot be asked).
      duration: motionAllowed() ? (visible ? ENTER_MS : EXIT_MS) : 0,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setLeaving(false);
    });
    return () => animation.stop();
  }, [visible, leaving, progress]);

  /*
   * OPEN: join the stack Escape and the focus trap answer to, THEN take focus —
   * in that order, or the focus-in guard would hand focus back to the sheet
   * underneath, which is still "on top" for that instant. CLOSE (or unmount):
   * leave the stack and give focus back to what had it before.
   */
  useEffect(() => {
    if (!visible) return;
    const opener = openerRef.current;
    const unregister = registerOpenSheet({
      id: nodeId,
      depth,
      close: () => closeRef.current(),
    });
    focusIntoSheet(nodeId);
    return () => {
      unregister();
      restoreFocus(opener, nodeId);
    };
  }, [visible, nodeId, depth]);

  if (!visible && !leaving) return null;
  // RN has no DOM lib (deliberately), so reach the browser document through
  // globalThis rather than declaring a global — the same idiom as
  // lib/proof-photo.ts. A global `document` would let native-only files
  // reference it and still type-check, which is the bug this avoids.
  const doc = (
    globalThis as {
      document?: { getElementById: (id: string) => PortalHost | null };
    }
  ).document;
  const host = doc?.getElementById(PHONE_SCREEN_ID) ?? null;
  const overlay = (
    <Animated.View
      id={nodeId}
      testID="phone-sheet"
      role="dialog"
      aria-modal
      // Focusable by script only — the sheet takes focus when it opens, and
      // Tab then moves on to its first control.
      tabIndex={-1}
      style={[
        styles.fill,
        {
          zIndex: SHEET_Z + depth,
          opacity: progress,
          ...(animationType === 'slide'
            ? {
                transform: [
                  {
                    translateY: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [SLIDE_PX, 0],
                    }),
                  },
                ],
              }
            : {}),
          pointerEvents: visible ? 'auto' : 'none',
        },
      ]}
    >
      <SheetDepth.Provider value={depth + 1}>
        {visible ? children : lastChildren.current}
      </SheetDepth.Provider>
    </Animated.View>
  );
  // No phone element yet (first paint) — render in place rather than drop.
  return host ? createPortal(overlay, host) : overlay;
}

const styles = StyleSheet.create({
  // zIndex is set per sheet from its nesting depth — see SHEET_Z. No outline:
  // the overlay itself is a focus TARGET for script, never a control.
  fill: { ...StyleSheet.absoluteFillObject, outlineWidth: 0 },
});
