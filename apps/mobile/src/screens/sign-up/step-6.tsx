import React, { useCallback } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, F } from '../../theme/theme';
import { font } from '../../theme/fonts';
import { Phone } from '../../components/icons';
import { formatMessage, useLocale } from '../../i18n';
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
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const Clip = require('expo-clipboard') as {
			getStringAsync: () => Promise<string>;
		};
		return (await Clip.getStringAsync()) ?? '';
	} catch {
		try {
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
	const { t } = useLocale();
	const s = t.signup;

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
				{formatMessage(s.otpLead, { phone: fullPhone })}
			</Text>
			<Text style={styles.otpHint}>{s.otpHint}</Text>
			<TextInput
				style={styles.otpInput}
				value={otp}
				onChangeText={(text) => setOtp(normalizeOtpInput(text))}
				placeholder="123456"
				placeholderTextColor={C.muted2}
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
					<Text style={styles.paste}>{s.pasteCode}</Text>
				</Pressable>
				<Text style={styles.actionDot}>·</Text>
				<Pressable
					onPress={() => resendIn === 0 && onResend()}
					disabled={resendIn > 0 || busy}
					hitSlop={8}
				>
					<Text style={[styles.resend, resendIn > 0 && styles.resendOff]}>
						{resendIn > 0
							? formatMessage(s.resendIn, { s: resendIn })
							: s.resendOtp}
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
		...font(),
		fontSize: C.fsTiny,
		lineHeight: C.fsTiny * 1.5,
		color: C.prMuted,
		textAlign: 'center',
		maxWidth: 280,
	},
	otpHint: {
		...font(),
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
		...font(700),
		fontSize: 22,
		letterSpacing: 6,
		color: C.txt,
	},
	otpActions: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	paste: { ...font(700), fontSize: 13, color: C.accentL },
	actionDot: { ...font(), fontSize: 13, color: C.muted2 },
	resend: { ...font(600), fontSize: 13, color: C.accent },
	resendOff: { color: C.muted2 },
});
