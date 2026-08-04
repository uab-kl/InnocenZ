/**
 * PR self sign-up — six-step register wizard against the real backend.
 * Step UIs live in step1…step6; this file owns wizard state + navigation.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../../theme/theme';
import {
	ApiError,
	fetchPublicAgencies,
	registerPr,
	sendPrOtp,
	verifyPrOtp,
	type PublicAgency,
} from '../../lib/api';
import { useSession } from '../../lib/session';
import { IzButton } from '../../components/ui';
import { ChevronLeft } from '../../components/icons';
import { CODE_LENGTH, RESEND_SECONDS, STEPS } from './constants';
import { emptyDraft, phoneParts, validateStep, type Draft, type FieldErrors } from './types';
import { Step1Persona } from './step1';
import { Step2Address } from './step2';
import { Step3Agency } from './step3';
import { Step4VerifyPhotos } from './step4';
import { Step5Summary } from './step5';
import { Step6Otp } from './step6';

export function SignUpScreen({ onBackToSignIn }: { onBackToSignIn: () => void }) {
	const { signIn } = useSession();
	const insets = useSafeAreaInsets();

	const [step, setStep] = useState(1);
	const [draft, setDraft] = useState<Draft>(emptyDraft);
	const [otp, setOtp] = useState('');
	const [verificationId, setVerificationId] = useState<string | null>(null);
	const [resendIn, setResendIn] = useState(0);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
	const [toast, setToast] = useState<string | null>(null);
	const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const [agencies, setAgencies] = useState<PublicAgency[]>([]);
	const [agencyState, setAgencyState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
	const [agencySearch, setAgencySearch] = useState('');

	const visibleAgencies = useMemo(() => {
		const q = agencySearch.trim().toLowerCase();
		if (!q) return agencies;
		return agencies.filter((a) => a.name.toLowerCase().includes(q));
	}, [agencies, agencySearch]);

	const loadAgencies = useCallback(() => {
		setAgencyState('loading');
		fetchPublicAgencies()
			.then((list) => {
				setAgencies(list);
				setAgencyState('ready');
			})
			.catch(() => setAgencyState('failed'));
	}, []);

	const agencyFetched = useRef(false);
	const scroller = useRef<ScrollView | null>(null);
	const current = STEPS[step - 1];
	const patch = (part: Partial<Draft>) => setDraft((d) => ({ ...d, ...part }));
	const clearFieldError = useCallback((key: keyof FieldErrors) => {
		setFieldErrors((prev) => {
			if (!prev[key]) return prev;
			const next = { ...prev };
			delete next[key];
			return next;
		});
	}, []);

	const showToast = useCallback((msg: string) => {
		if (toastTimer.current) clearTimeout(toastTimer.current);
		setToast(msg);
		toastTimer.current = setTimeout(() => setToast(null), 2800);
	}, []);

	const { localDigits, fullPhone, phoneNum } = phoneParts(draft);

	useEffect(() => {
		if (resendIn <= 0) return;
		const t = setInterval(() => setResendIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
		return () => clearInterval(t);
	}, [resendIn]);

	useEffect(() => {
		scroller.current?.scrollTo({ y: 0, animated: false });
		setError(null);
		setNotice(null);
		setFieldErrors({});
		setToast(null);
	}, [step]);

	useEffect(() => {
		if (step !== 3 || agencyFetched.current) return;
		agencyFetched.current = true;
		loadAgencies();
	}, [step, loadAgencies]);

	useEffect(
		() => () => {
			if (toastTimer.current) clearTimeout(toastTimer.current);
		},
		[],
	);

	const describe = (e: unknown, fallback: string) =>
		e instanceof ApiError ? e.message : fallback;

	const goNext = () => {
		const { fields, toast: toastMsg } = validateStep(step, draft, localDigits);
		if (toastMsg) {
			setFieldErrors(fields);
			showToast(toastMsg);
			return;
		}
		setFieldErrors({});
		setStep((s) => Math.min(s + 1, STEPS.length));
	};

	const goBack = () => {
		if (step === 1) {
			onBackToSignIn();
			return;
		}
		setStep((s) => s - 1);
	};

	const proceedToVerification = useCallback(
		async (resending = false) => {
			if (busy) return;
			setBusy(true);
			setError(null);
			setNotice(null);
			try {
				const res = await sendPrOtp(phoneNum);
				setResendIn(res.resendAfterSec || RESEND_SECONDS);
				setOtp('');
				setStep(6);
				setNotice(
					resending ? 'A new code is on its way.' : `Code sent on WhatsApp to ${fullPhone}.`,
				);
			} catch (e) {
				if (e instanceof ApiError && e.status === 409) {
					setStep(1);
					const msg = 'That number already has an account. Use another, or sign in.';
					setError(msg);
					showToast(msg);
				} else {
					const msg = describe(e, 'Could not send the code — please try again.');
					setError(msg);
					showToast(msg);
				}
			} finally {
				setBusy(false);
			}
		},
		[busy, phoneNum, fullPhone, showToast],
	);

	const verifyAndSubmit = async () => {
		if (busy) return;
		if (otp.length !== CODE_LENGTH) {
			const msg = 'Enter all six digits.';
			setError(msg);
			showToast(msg);
			return;
		}
		setBusy(true);
		setError(null);
		setNotice(null);
		try {
			const verified = verificationId ?? (await verifyPrOtp(phoneNum, otp)).verificationId;
			setVerificationId(verified);
			await registerPr({
				verificationId: verified,
				phoneNum,
				username: draft.floorNickname.trim(),
				password: draft.password,
				email: draft.email.trim() || undefined,
			});
			await signIn(phoneNum, draft.password);
		} catch (e) {
			setOtp('');
			const msg =
				e instanceof ApiError && e.status === 410
					? 'That code expired. Tap Resend for a new one.'
					: describe(e, 'That code is not right. Check and try again.');
			setError(msg);
			showToast(msg);
		} finally {
			setBusy(false);
		}
	};

	const primary =
		step < 5
			? { label: busy ? 'Please wait…' : 'Continue', onPress: goNext }
			: step === 5
				? { label: busy ? 'Sending…' : 'Create account', onPress: () => proceedToVerification() }
				: { label: busy ? 'Submitting…' : 'Verify & submit', onPress: verifyAndSubmit };

	return (
		<View
			style={[
				styles.screen,
				{
					paddingTop: Math.max(insets.top, 24) + 12,
					paddingBottom: 12 + Math.max(insets.bottom, 16),
				},
			]}
		>
			{toast ? (
				<View style={[styles.toast, { top: Math.max(insets.top, 12) + 4 }]} pointerEvents="none">
					<Text style={styles.toastText}>{toast}</Text>
				</View>
			) : null}

			<View style={styles.head}>
				<Text style={styles.eyebrow}>
					STEP {step} OF {STEPS.length}
				</Text>
				<View style={styles.titleRow}>
					<current.icon size={19} color={C.accent} strokeWidth={2.2} />
					<Text style={styles.title}>{current.title}</Text>
				</View>
				<Text style={styles.subtitle}>{current.subtitle}</Text>
			</View>

			<View style={styles.dots}>
				{STEPS.map((_, i) => (
					<View key={i} style={[styles.dot, i + 1 <= step && styles.dotOn]} />
				))}
			</View>

			<ScrollView
				ref={scroller}
				style={styles.body}
				contentContainerStyle={styles.bodyContent}
				keyboardShouldPersistTaps="handled"
			>
				{step === 1 ? (
					<Step1Persona
						draft={draft}
						localDigits={localDigits}
						fieldErrors={fieldErrors}
						patch={patch}
						clearFieldError={clearFieldError}
					/>
				) : null}
				{step === 2 ? (
					<Step2Address
						draft={draft}
						fieldErrors={fieldErrors}
						patch={patch}
						clearFieldError={clearFieldError}
					/>
				) : null}
				{step === 3 ? (
					<Step3Agency
						draft={draft}
						fieldErrors={fieldErrors}
						patch={patch}
						clearFieldError={clearFieldError}
						agencies={agencies}
						visibleAgencies={visibleAgencies}
						agencyState={agencyState}
						agencySearch={agencySearch}
						setAgencySearch={setAgencySearch}
						loadAgencies={loadAgencies}
					/>
				) : null}
				{step === 4 ? <Step4VerifyPhotos /> : null}
				{step === 5 ? (
					<Step5Summary draft={draft} fullPhone={fullPhone} agencies={agencies} />
				) : null}
				{step === 6 ? (
					<Step6Otp
						fullPhone={fullPhone}
						otp={otp}
						setOtp={setOtp}
						resendIn={resendIn}
						busy={busy}
						onResend={() => proceedToVerification(true)}
					/>
				) : null}

				{error ? <Text style={styles.error}>{error}</Text> : null}
				{notice && !error ? <Text style={styles.notice}>{notice}</Text> : null}
			</ScrollView>

			<View style={[styles.footer, { paddingBottom: 4 }]}>
				<View style={styles.footerHalf}>
					<IzButton
						label={step === 1 ? 'Back' : 'Previous'}
						icon={ChevronLeft}
						variant="soft"
						onPress={goBack}
						disabled={busy}
					/>
				</View>
				<View style={styles.footerHalf}>
					<IzButton label={primary.label} onPress={primary.onPress} disabled={busy} />
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, paddingHorizontal: 18 },
	head: { marginBottom: 12 },
	eyebrow: {
		fontFamily: F.sora,
		fontSize: 11,
		fontWeight: '700',
		letterSpacing: 1.6,
		color: C.muted2,
	},
	titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
	title: {
		fontFamily: F.sora,
		fontSize: 22,
		fontWeight: '800',
		letterSpacing: -0.3,
		color: C.txt,
	},
	subtitle: {
		fontFamily: F.manrope,
		fontSize: C.fsTiny,
		color: C.prMuted,
		marginTop: 2,
	},
	dots: { flexDirection: 'row', gap: 6, marginBottom: 14 },
	dot: {
		flex: 1,
		height: 3,
		borderRadius: 2,
		backgroundColor: C.line,
	},
	dotOn: { backgroundColor: C.accent },
	body: { flex: 1 },
	bodyContent: { paddingBottom: 14 },
	footer: { flexDirection: 'row', gap: 10, paddingTop: 10 },
	footerHalf: { flex: 1 },
	toast: {
		position: 'absolute',
		left: 18,
		right: 18,
		zIndex: 50,
		paddingVertical: 12,
		paddingHorizontal: 14,
		borderRadius: 12,
		backgroundColor: 'rgba(180, 40, 50, 0.95)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.12)',
	},
	toastText: {
		fontFamily: F.manrope,
		fontSize: 13,
		lineHeight: 18,
		fontWeight: '600',
		color: '#fff',
		textAlign: 'center',
	},
	error: {
		fontFamily: F.manrope,
		fontSize: C.fsTiny,
		lineHeight: C.fsTiny * 1.4,
		color: C.red,
		marginTop: 8,
	},
	notice: {
		fontFamily: F.manrope,
		fontSize: C.fsTiny,
		lineHeight: C.fsTiny * 1.4,
		color: C.green,
		marginTop: 8,
	},
});
