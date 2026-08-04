import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/** Live keyboard height — 0 when hidden. Use to pad forms / lift bottom sheets. */
export function useKeyboardHeight(): number {
	const [height, setHeight] = useState(0);

	useEffect(() => {
		const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
		const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
		const show = Keyboard.addListener(showEvent, (e) => {
			setHeight(e.endCoordinates.height);
		});
		const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
		return () => {
			show.remove();
			hide.remove();
		};
	}, []);

	return height;
}
