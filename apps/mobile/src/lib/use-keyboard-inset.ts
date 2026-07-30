/**
 * Height of the soft keyboard while it is open, else 0.
 *
 * Exists because Android ignores adjustResize inside TRANSPARENT Modals — the
 * window keeps its size and the keyboard simply covers the bottom sheet, so
 * whatever the user types is hidden under it. Every input-bearing sheet adds
 * this value to its bottom padding, which pushes the focused field above the
 * keyboard on both platforms. Non-modal screens don't need it: there the
 * window itself resizes.
 */
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => {
      setInset(e.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener(hideEvent, () => setInset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return inset;
}
