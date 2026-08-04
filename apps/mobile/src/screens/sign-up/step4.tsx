import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { C, F } from '../../theme/theme';
import { Shield } from '../../components/icons';

export function Step4VerifyPhotos() {
	return (
		<View style={styles.placeholder}>
			<Shield size={26} color={C.muted2} strokeWidth={1.8} />
			<Text style={styles.placeholderTitle}>ID & gallery photos</Text>
			<Text style={styles.placeholderBody}>
				ID front and back, profile photo and portfolio gallery are not built on mobile yet. You can
				finish signing up now and add them from Profile afterwards.
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	placeholder: {
		alignItems: 'center',
		gap: 8,
		paddingVertical: 30,
		paddingHorizontal: 12,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: C.line,
		borderStyle: 'dashed',
	},
	placeholderTitle: { fontFamily: F.sora, fontSize: 16, fontWeight: '700', color: C.prMuted },
	placeholderBody: {
		fontFamily: F.manrope,
		fontSize: C.fsTiny,
		lineHeight: C.fsTiny * 1.5,
		color: C.muted2,
		textAlign: 'center',
	},
});
