/**
 * PR self sign-up — six-step register wizard against the real backend.
 * Step UIs live in step-1…step-6; this file owns wizard state + navigation.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../../theme/theme';
import {
	ApiError,
	checkPrRegisterAvailability,
	fetchPublicAgencies,
	generateUserComcard,
	registerPr,
	sendPrOtp,
	updateUserProfile,
	uploadUserIdDoc,
	uploadUserPortfolioPhoto,
	uploadUserProfileImage,
	verifyPrOtp,
	type PublicAgency,
	type RegisterCheckConflict,
} from '../../lib/api';
import { resolveUploadFile } from '../../lib/photo-file';
import { useSession } from '../../lib/session';
import { formatMessage, useLocale } from '../../i18n';
import { IzButton } from '../../components/ui';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { ChevronLeft } from '../../components/icons';
import { CODE_LENGTH, RESEND_SECONDS, STEPS } from './constants';
import { emptyDraft, phoneParts, validateStep, type Draft, type FieldErrors } from './types';
import { KeyboardScrollProvider, useKeyboardScroll } from './keyboard-scroll';
import { Step1Persona } from './step-1';
import { Step2Address } from './step-2';
import { Step3Agency } from './step-3';
import { Step4VerifyPhotos } from './step-4';
import { Step5Summary } from './step-5';
import { Step6Otp } from './step-6';

export function SignUpScreen({ onBackToSignIn }: { onBackToSignIn: () => void }) {
	const scroller = useRef<ScrollView | null>(null);
	return (
		<KeyboardScrollProvider scrollRef={scroller}>
			<SignUpScreenInner onBackToSignIn={onBackToSignIn} scroller={scroller} />
		</KeyboardScrollProvider>
	);
}

function SignUpScreenInner({
	onBackToSignIn,
	scroller,
}: {
	onBackToSignIn: () => void;
	scroller: React.RefObject<ScrollView | null>;
}) {
	const { signIn, refreshMe } = useSession();
	const { t } = useLocale();
	const insets = useSafeAreaInsets();
	const keyboardScroll = useKeyboardScroll();
	const keyboardHeight = keyboardScroll?.keyboardHeight ?? 0;

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
	const current = STEPS[step - 1];
	const stepCopy = t.signup.steps[step - 1] ?? {
		title: current.title,
		subtitle: current.subtitle,
	};
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

	const validationCopy = {
		nicknameRequired: t.signup.nicknameRequired,
		fullNameRequired: t.signup.fullNameRequired,
		dialRequired: t.signup.dialRequired,
		phoneShort: t.signup.phoneShort,
		nationalityRequired: t.signup.nationalityRequired,
		idTypeRequired: t.signup.idTypeRequired,
		nricMalaysianOnly: t.signup.nricMalaysianOnly,
		dobRequired: t.signup.dobRequired,
		idNoSelectFirst: t.signup.idNoSelectFirst,
		idNoRequired: t.signup.idNoRequired,
		languagesRequired: t.signup.languagesRequired,
		addressLine1Required: t.signup.addressLine1Required,
		cityRequired: t.signup.cityRequired,
		postcodeRequired: t.signup.postcodeRequired,
		stateRequired: t.signup.stateRequired,
		countryRequired: t.signup.countryRequired,
		joiningRequired: t.signup.joiningRequired,
		agencyRequired: t.signup.agencyRequired,
		profileRequired: t.signup.profileRequired,
		idFrontRequired: t.signup.idFrontRequired,
		idPassportPageRequired: t.signup.idPassportPageRequired,
		idFrontOcrFail: t.signup.idFrontOcrFail,
		idPassportOcrFail: t.signup.idPassportOcrFail,
		idBackRequired: t.signup.idBackRequired,
		idBackOcrFail: t.signup.idBackOcrFail,
		passwordRequired: t.signup.passwordRequired,
		passwordMin: t.signup.passwordMin,
		confirmRequired: t.signup.confirmRequired,
		passwordMismatch: t.signup.passwordMismatch,
		ackRequired: t.signup.ackRequired,
		fixHighlighted: t.signup.fixHighlighted,
	};

	const goNext = async () => {
		const { fields, toast: toastMsg } = validateStep(
			step,
			draft,
			localDigits,
			validationCopy,
		);
		if (toastMsg) {
			setFieldErrors(fields);
			showToast(toastMsg);
			return;
		}
		if (step === 1) {
			setBusy(true);
			setError(null);
			try {
				await checkPrRegisterAvailability(phoneNum, draft.idNo.trim());
			} catch (e) {
				if (e instanceof ApiError && e.status === 409) {
					const conflicts =
						e.data &&
						typeof e.data === 'object' &&
						Array.isArray((e.data as { conflicts?: RegisterCheckConflict[] }).conflicts)
							? (e.data as { conflicts: RegisterCheckConflict[] }).conflicts
							: [];
					const nextFields: FieldErrors = {};
					for (const c of conflicts) {
						if (c.field === 'phone') nextFields.phone = c.message;
						if (c.field === 'idNo') nextFields.idNo = c.message;
					}
					if (!nextFields.phone && !nextFields.idNo) {
						nextFields.phone = e.message;
					}
					setFieldErrors(nextFields);
					showToast(e.message);
					setBusy(false);
					return;
				}
				const msg = describe(e, t.signup.toastVerifyPhoneFailed);
				setError(msg);
				showToast(msg);
				setBusy(false);
				return;
			}
			setBusy(false);
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
			if (!resending) {
				const { fields, toast: toastMsg } = validateStep(
					5,
					draft,
					localDigits,
					validationCopy,
				);
				if (toastMsg) {
					setFieldErrors(fields);
					showToast(toastMsg);
					return;
				}
				setFieldErrors({});
			}
			setBusy(true);
			setError(null);
			setNotice(null);
			try {
				const res = await sendPrOtp(phoneNum);
				setResendIn(res.resendAfterSec || RESEND_SECONDS);
				setOtp('');
				setStep(6);
				setNotice(
					resending
						? t.signup.toastCodeResent
						: formatMessage(t.signup.toastCodeSent, { phone: fullPhone }),
				);
			} catch (e) {
				if (e instanceof ApiError && e.status === 409) {
					setStep(1);
					const msg = t.signup.toastPhoneTaken;
					setError(msg);
					showToast(msg);
				} else {
					const msg = describe(e, t.signup.toastSendCodeFailed);
					setError(msg);
					showToast(msg);
				}
			} finally {
				setBusy(false);
			}
		},
		[busy, draft, localDigits, phoneNum, fullPhone, showToast, validationCopy, t.signup],
	);

	const verifyAndSubmit = async () => {
		if (busy) return;
		if (!verificationId && otp.length !== CODE_LENGTH) {
			const msg = t.signup.toastOtpIncomplete;
			setError(msg);
			showToast(msg);
			return;
		}
		setBusy(true);
		setError(null);
		setNotice(null);
		let hasReceipt = Boolean(verificationId);
		try {
			// Verify OTP first (JSON). Register also JSON-only — multipart avatar on
			// /auth/register often fails on device ("Cannot reach backend") even when
			// OTP just succeeded. Avatar uploads after sign-in like comcard/portfolio.
			const verified = verificationId ?? (await verifyPrOtp(phoneNum, otp)).verificationId;
			hasReceipt = true;
			setVerificationId(verified);
			const optionalCm = (raw: string): number | undefined => {
				const digits = raw.replace(/\D/g, '');
				return digits ? Number(digits) : undefined;
			};
			const heightCm = optionalCm(draft.heightCm);
			const weightKg = optionalCm(draft.weightKg);
			const bustCm = optionalCm(draft.bustCm);
			const waistCm = optionalCm(draft.waistCm);
			const hipCm = optionalCm(draft.hipCm);
			await registerPr({
				verificationId: verified,
				phoneNum,
				username: draft.floorNickname.trim(),
				password: draft.password,
				email: draft.email.trim() || undefined,
				...(draft.agencyId ? { agencyId: draft.agencyId } : {}),
				profile: {
					fullName: draft.fullName.trim(),
					nationality: draft.nationality.trim(),
					idType: draft.idType,
					idNo: draft.idNo.trim(),
					dob: draft.dob.trim(),
					addressLine1: draft.addressLine1.trim(),
					...(draft.addressLine2.trim()
						? { addressLine2: draft.addressLine2.trim() }
						: {}),
					city: draft.city.trim(),
					postcode: draft.postcode.trim(),
					state: draft.state.trim(),
					country: draft.country.trim(),
					...(heightCm != null ? { comcardHeightCm: heightCm } : {}),
					...(weightKg != null ? { comcardWeightKg: weightKg } : {}),
					...(bustCm != null ? { comcardBustCm: bustCm } : {}),
					...(waistCm != null ? { comcardWaistCm: waistCm } : {}),
					...(hipCm != null ? { comcardHipCm: hipCm } : {}),
					languages: draft.languages,
				},
			});
			const { user: signedIn, accessToken } = await signIn(phoneNum, draft.password);
			// Guarantee ID is on user_profile — heal if register left it blank.
			if (
				!signedIn.profile.idNo &&
				draft.idType &&
				draft.idNo.trim() &&
				draft.dob.trim()
			) {
				await updateUserProfile(accessToken, signedIn.id, {
					username: signedIn.username,
					idType: draft.idType,
					idNo: draft.idNo.trim(),
					dob: draft.dob.trim(),
				}).catch(() => {
					/* non-fatal — register already created the account */
				});
			}
			// Must use accessToken + signedIn.id from signIn — session
			// upload* hooks still close over pre-login token/me (null).
			// Each asset uploads independently so one failure cannot skip IC.
			const uploadFailures: string[] = [];
			const runUpload = async (label: string, work: () => Promise<unknown>) => {
				try {
					await work();
				} catch {
					uploadFailures.push(label);
				}
			};

			const avatar = resolveUploadFile(
				draft.profileImageFile,
				draft.profileImageUri,
				'avatar.jpg',
			);
			if (avatar) {
				await runUpload('avatar', () =>
					uploadUserProfileImage(accessToken, signedIn.id, avatar, 'avatar.jpg'),
				);
			}

			const idFront = resolveUploadFile(
				draft.idPhotoFrontFile,
				draft.idPhotoFrontUri,
				'id-front.jpg',
			);
			if (idFront) {
				await runUpload('id-front', () =>
					uploadUserIdDoc(accessToken, signedIn.id, 'front', idFront, 'id-front.jpg'),
				);
			}

			const needsIdBack = draft.idType !== 'Passport';
			const idBack = needsIdBack
				? resolveUploadFile(draft.idPhotoBackFile, draft.idPhotoBackUri, 'id-back.jpg')
				: null;
			if (idBack) {
				await runUpload('id-back', () =>
					uploadUserIdDoc(accessToken, signedIn.id, 'back', idBack, 'id-back.jpg'),
				);
			}

			for (let i = 0; i < draft.portfolioPhotos.length; i++) {
				const slot = draft.portfolioPhotos[i];
				const file = resolveUploadFile(slot.file, slot.uri, `portfolio-${i + 1}.jpg`);
				if (!file) {
					uploadFailures.push(`portfolio-${i + 1}`);
					continue;
				}
				await runUpload(`portfolio-${i + 1}`, () =>
					uploadUserPortfolioPhoto(
						accessToken,
						signedIn.id,
						i,
						file,
						`portfolio-${i + 1}.jpg`,
					),
				);
			}
			if (draft.portfolioPhotos.length > 0 && !uploadFailures.some((f) => f.startsWith('portfolio-'))) {
				await runUpload('comcard', () => generateUserComcard(accessToken, signedIn.id));
			}

			await refreshMe(accessToken).catch(() => {
				/* non-fatal — uploads already persisted */
			});
			if (uploadFailures.length > 0) {
				showToast(t.signup.toastPhotosPartial);
			}
		} catch (e) {
			if (!hasReceipt) setOtp('');
			const msg =
				e instanceof ApiError && e.status === 410
					? t.signup.toastOtpExpired
					: hasReceipt
						? describe(e, t.signup.toastRegisterFailed)
						: describe(e, t.signup.toastOtpWrong);
			setError(msg);
			showToast(msg);
		} finally {
			setBusy(false);
		}
	};

	const primary =
		step < 5
			? { label: busy ? t.common.loading : t.common.continue, onPress: goNext }
			: step === 5
				? {
						label: busy ? t.signup.submitting : t.signup.submit,
						onPress: () => proceedToVerification(),
					}
				: {
						label: busy ? t.signup.submitting : t.common.continue,
						onPress: verifyAndSubmit,
					};

	// Shrink the screen by the keyboard height so fields + footer stay above it.
	const liftedPad = keyboardHeight > 0 ? Math.max(0, keyboardHeight - insets.bottom) : 0;

	return (
		<View
			style={[
				styles.screen,
				{
					paddingTop: Math.max(insets.top, 24) + 12,
					paddingBottom: 12 + Math.max(insets.bottom, 16) + liftedPad,
				},
			]}
		>
			{toast ? (
				<View style={[styles.toast, { top: Math.max(insets.top, 12) + 4 }]} pointerEvents="none">
					<Text style={styles.toastText}>{toast}</Text>
				</View>
			) : null}

			<View style={styles.head}>
				<View style={styles.langRow}>
					<LanguageSwitcher compact />
				</View>
				<Text style={styles.eyebrow}>
					{formatMessage(t.signup.stepOf, { step, total: STEPS.length })}
				</Text>
				<View style={styles.titleRow}>
					<current.icon size={19} color={C.accent} strokeWidth={2.2} />
					<Text style={styles.title}>{stepCopy.title}</Text>
				</View>
				<Text style={styles.subtitle}>{stepCopy.subtitle}</Text>
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
				keyboardDismissMode="on-drag"
				automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
				onScroll={(e) => keyboardScroll?.onScrollY(e.nativeEvent.contentOffset.y)}
				scrollEventThrottle={16}
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
				{step === 4 ? (
					<Step4VerifyPhotos
						draft={draft}
						fieldErrors={fieldErrors}
						patch={patch}
						clearFieldError={clearFieldError}
					/>
				) : null}
				{step === 5 ? (
					<Step5Summary
						draft={draft}
						fullPhone={fullPhone}
						agencies={agencies}
						fieldErrors={fieldErrors}
						patch={patch}
						clearFieldError={clearFieldError}
					/>
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
						label={step === 1 ? t.signup.backToSignIn : t.signup.previous}
						icon={ChevronLeft}
						variant="soft"
						small
						onPress={goBack}
						disabled={busy}
					/>
				</View>
				<View style={styles.footerHalf}>
					<IzButton
						label={primary.label}
						small
						onPress={primary.onPress}
						disabled={busy}
					/>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, paddingHorizontal: 18 },
	head: { marginBottom: 12 },
	langRow: {
		alignSelf: 'flex-end',
		marginBottom: 8,
	},
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
	footer: { flexDirection: 'row', gap: 8, paddingTop: 8 },
	footerHalf: { flex: 1, minWidth: 0 },
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
