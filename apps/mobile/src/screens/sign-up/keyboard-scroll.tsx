import React, { createContext, useCallback, useContext, useMemo, useRef, type RefObject } from 'react';
import { Dimensions, type ScrollView, View } from 'react-native';
import { useKeyboardHeight } from '../../lib/keyboard';

type KeyboardScrollApi = {
	/** Call from a field's onFocus after measuring it in the window. */
	ensureVisible: (windowY: number, height: number) => void;
	/** Track ScrollView content offset so ensureVisible can scroll by delta. */
	onScrollY: (y: number) => void;
	keyboardHeight: number;
};

const KeyboardScrollContext = createContext<KeyboardScrollApi | null>(null);

export function useKeyboardScroll(): KeyboardScrollApi | null {
	return useContext(KeyboardScrollContext);
}

/**
 * Scrolls the focused field above the keyboard + sticky footer.
 * Wrap the signup screen; Inputs call `ensureVisible` on focus.
 */
export function KeyboardScrollProvider({
	scrollRef,
	footerReserve = 88,
	children,
}: {
	scrollRef: RefObject<ScrollView | null>;
	/** Space reserved for Continue / Previous under the field. */
	footerReserve?: number;
	children: React.ReactNode;
}) {
	const keyboardHeight = useKeyboardHeight();
	const scrollY = useRef(0);

	const ensureVisible = useCallback(
		(windowY: number, height: number) => {
			const winH = Dimensions.get('window').height;
			const keyboardTop = winH - keyboardHeight;
			const clearBottom = keyboardTop - footerReserve;
			const fieldBottom = windowY + height + 8;
			if (fieldBottom <= clearBottom) return;
			const delta = fieldBottom - clearBottom;
			scrollRef.current?.scrollTo({
				y: Math.max(0, scrollY.current + delta),
				animated: true,
			});
		},
		[footerReserve, keyboardHeight, scrollRef],
	);

	const onScrollY = useCallback((y: number) => {
		scrollY.current = y;
	}, []);

	const api = useMemo(
		() => ({ ensureVisible, onScrollY, keyboardHeight }),
		[ensureVisible, onScrollY, keyboardHeight],
	);

	return (
		<KeyboardScrollContext.Provider value={api}>{children}</KeyboardScrollContext.Provider>
	);
}

/** Measure a wrapper View in the window and ask the signup scroller to reveal it. */
export function reportFocusFromView(
	view: View | null,
	ensureVisible?: (y: number, h: number) => void,
) {
	if (!view || !ensureVisible) return;
	view.measureInWindow((_x, y, _w, h) => {
		if (typeof y === 'number' && typeof h === 'number') ensureVisible(y, h);
	});
}
