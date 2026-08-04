import React, { useCallback } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
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

/** Digits only — WhatsApp "Copy code" may paste spaces or extra text. */
export function normalizeOtpInput(raw: string): string {
	const digits = raw.replace(/\D/g, '');
	if (digits.length <= CODE_LENGTH) return digits;
	const run = raw.match(new RegExp(`\\d{${CODE_LENGTH}}`));
	return run ? run[0] : digits.slice(-CODE_LENGTH);
}

async function readClipboardText(): Promise<string> {
	try {
		// Optional — present when expo-clipboard is installed.
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const Clip = require('expo-clipboard') as {
			getStringAsync: () => Promise<string>;
		};
		return (await Clip.getStringAsync()) ?? '';
	} catch {
		try {
			// Legacy RN Clipboard (some builds still expose it).
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			const rn = require('react-native') as {
				Clipboard?: { getString: () => Promise<string> };
			};
			if (rn.Clipboard?.getString) return (await rn.Clipboard.getString()) ?? '';
		} catch {
			/* no clipboard module */
		}
	}
	return '';
}

export function Step6Otp({ fullPhone, otp, setOtp, resendIn, busy, onResend }: Props) {
	const pasteCode = useCallback(async () => {
		const text = await readClipboardText();
		const next = normalizeOtpInput(text);
		if (next) setOtp(next);
	}, [setOtp]);

	return (
		<View style={styles.otpWrap}>
			<View style={styles.otpIcon}>
				<Phone size={26} color={C.accentL} strokeWidth={2} />
			</View>
			<Text style={styles.otpLead}>
				Enter the 6-digit code sent on WhatsApp to <Text style={styles.otpPhone}>{fullPhone}</Text>
			</Text>
			<Text style={styles.otpHint}>
				After WhatsApp Copy code, tap Paste code — or long-press the box and Paste.
			</Text>
			<TextInput
				style={styles.otpInput}
				value={otp}
				onChangeText={(t) => setOtp(normalizeOtpInput(t))}
				placeholder="123456"
				placeholderTextColor={C.muted2}
				// Android number-pad often blocks paste from WhatsApp Copy code.
				keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
				textContentType="oneTimeCode"
				autoComplete="one-time-code"
				importantForAutofill="yes"
				inputMode="numeric"
				autoFocus
				selectTextOnFocus
			/>
			<View style={styles.otpActions}>
				<Pressable onPress={() => void pasteCode()} disabled={busy} hitSlop={8}>
					<Text style={styles.paste}>Paste code</Text>
				</Pressable>
				<Text style={styles.actionDot}>·</Text>
				<Pressable onPress={() => resendIn === 0 && onResend()} disabled={resendIn > 0 || busy} hitSlop={8}>
					<Text style={[styles.resend, resendIn > 0 && styles.resendOff]}>
						{resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend OTP'}
					</Text>
				</Pressable>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	otpWrap: { alignItems: 'center', paddingVertical: 18, gap: 12 },
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
		maxWidth: 280,
	},
	otpPhone: { fontFamily: F.sora, fontWeight: '700', color: C.txt },
	otpHint: {
		fontFamily: F.manrope,
		fontSize: 12,
		lineHeight: 16,
		color: C.muted2,
		textAlign: 'center',
		maxWidth: 300,
	},
	otpInput: {
		width: 240,
		textAlign: 'center',
		paddingVertical: 13,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: C.line,
		backgroundColor: C.bg2,
		fontFamily: F.sora,
		fontSize: 22,
		fontWeight: '700',
		letterSpacing: 6,
		color: C.txt,
	},
	otpActions: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	paste: { fontFamily: F.sora, fontSize: 13, fontWeight: '700', color: C.accentL },
	actionDot: { fontFamily: F.manrope, fontSize: 13, color: C.muted2 },
	resend: { fontFamily: F.sora, fontSize: 13, fontWeight: '600', color: C.accent },
	resendOff: { color: C.muted2 },
});
