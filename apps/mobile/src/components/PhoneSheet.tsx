/**
 * In-frame bottom-sheet host. RN `Modal` on web escapes the phone frame — it
 * overlays the whole browser viewport — so on web the overlay is portalled
 * into the PhoneFrame screen element and absolutely fills it: the sheet stays
 * inside the phone, clipped by its rounded corners. Native keeps the real
 * Modal (there the app already fills the physical screen). Children supply
 * the backdrop + sheet exactly as they would inside a Modal.
 */
import React, { type ReactNode } from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';
import { createPortal } from 'react-dom';
import { PHONE_SCREEN_ID } from './PhoneFrame';

export function PhoneSheet({
  visible,
  onRequestClose,
  children,
}: {
  visible: boolean;
  /** Hardware back (native Modal only) — web closes via the backdrop press. */
  onRequestClose: () => void;
  children: ReactNode;
}) {
  if (Platform.OS === 'web') {
    if (!visible) return null;
    const host =
      typeof document !== 'undefined' ? document.getElementById(PHONE_SCREEN_ID) : null;
    const overlay = <View style={styles.fill}>{children}</View>;
    // No phone element yet (first paint) — render in place rather than drop.
    return host ? createPortal(overlay, host) : overlay;
  }
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onRequestClose}>
      {children}
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    // Above the frame's pinned header (30) and tab bar (40).
    zIndex: 100,
  },
});
