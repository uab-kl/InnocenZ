import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, F } from '../../theme/theme';
import { Phone } from '../../components/icons';
import { CODE_LENGTH } from './constants';

type Props = {
	fullPhone: string;
	otp: string;
	setOtp: (v: string) => void;
	resendIn: number;
	busy: boolean;
	onResend: () => void;
};

export function Step6Otp({ fullPhone, otp, setOtp, resendIn, busy, onResend }: Props) {
	return (
		<View style={styles.otpWrap}>
			<View style={styles.otpIcon}>
				<Phone size={26} color={C.accentL} strokeWidth={2} />
			</View>
			<Text style={styles.otpLead}>
				Enter the 6-digit code sent on WhatsApp to <Text style={styles.otpPhone}>{fullPhone}</Text>
			</Text>
			<TextInput
				style={styles.otpInput}
				value={otp}
				onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, CODE_LENGTH))}
				placeholder="123456"
				placeholderTextColor={C.muted2}
				keyboardType="number-pad"
				autoFocus
			/>
			<Pressable onPress={() => resendIn === 0 && onResend()} disabled={resendIn > 0 || busy} hitSlop={8}>
				<Text style={[styles.resend, resendIn > 0 && styles.resendOff]}>
					{resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend OTP'}
				</Text>
			</Pressable>
		</View>
	);
}

const styles = StyleSheet.create({
	otpWrap: { alignItems: 'center', paddingVertical: 18, gap: 14 },
	otpIcon: {
		height: 64,
		width: 64,
		borderRadius: 18,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: C.bg2,
		borderWidth: 1,
		borderColor: C.line,
	},
	otpLead: {
		fontFamily: F.manrope,
		fontSize: C.fsTiny,
		lineHeight: C.fsTiny * 1.5,
		color: C.prMuted,
		textAlign: 'center',
		maxWidth: 260,
	},
	otpPhone: { fontFamily: F.sora, fontWeight: '700', color: C.txt },
	otpInput: {
		width: 220,
		textAlign: 'center',
		paddingVertical: 13,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: C.line,
		backgroundColor: C.bg2,
		fontFamily: F.sora,
		fontSize: 20,
		fontWeight: '700',
		letterSpacing: 8,
		color: C.txt,
	},
	resend: { fontFamily: F.sora, fontSize: 13, fontWeight: '600', color: C.accent },
	resendOff: { color: C.muted2 },
});
