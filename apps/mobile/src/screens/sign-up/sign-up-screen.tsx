/**
 * PR self sign-up — six-step register wizard against the real backend.
 * Step UIs live in step-1…step-6; this file owns wizard state + navigation.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../../theme/theme';
import { font } from '../../theme/fonts';
import {
	ApiError,
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
} from '../../lib/api';
import { localizeApiError } from '../../lib/api-error-copy';
import {
	codeReachedEmail,
	isPlausibleEmail,
	normalizeEmailInput,
} from '../../lib/code-delivery';
import { resolveUploadFile } from '../../lib/photo-file';
import { withRetries } from '../../lib/retry';
import { useSession } from '../../lib/session';
import { formatMessage, useLocale } from '../../i18n';
import { IzButton } from '../../components/ui';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { ChevronLeft } from '../../components/icons';
import { CODE_LENGTH, RESEND_SECONDS, STEPS } from './constants';
import { emptyDraft, phoneParts, validateStep, type Draft, type FieldErrors } from './types';
import { KeyboardScrollProvider, useKeyboardScroll } from './keyboard-scroll';
import { spentReceiptRefusal } from './register-refusal';
import { Step1Persona } from './step-1';
import { Step2Address } from './step-2';
import { Step3Agency } from './step-3';
import { Step4VerifyPhotos } from './step-4';
import { Step5Summary } from './step-5';
import { Step6Otp } from './step-6';

/**
 * `onBackToSignIn(notice)` — the sign-in screen shows `notice` above its form.
 * Passed only when the account now EXISTS (see `verifyAndSubmit`).
 */
export function SignUpScreen({ onBackToSignIn }: { onBackToSignIn: (notice?: string) => void }) {
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
	onBackToSignIn: (notice?: string) => void;
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
	/*
	 * The refusal a "Back to sign in" link belongs to. Tied to the SENTENCE, not
	 * a flag: any later error is a different sentence and hides the link.
	 */
	const [signInFor, setSignInFor] = useState<string | null>(null);
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
	// STEPS carries only the icons; the title/subtitle come from the dictionary,
	// so there is no English copy to fall back to and no locale to pin.
	const StepIcon = STEPS[step - 1];
	const stepCopy = t.signup.steps[step - 1];
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
		// NOT `t` — that shadows the locale dictionary inside this effect.
		const timer = setInterval(() => setResendIn((s) => (s <= 1 ? 0 : s - 1)), 1000);
		return () => clearInterval(timer);
	}, [resendIn]);

	/*
	 * A message that must SURVIVE A STEP CHANGE — a refusal sending her back to
	 * step 1, or the "code sent" line on the way forward to step 6.
	 *
	 * ⚠️ A message set BESIDE `setStep` never reaches the screen. Both updates
	 * land in one batch, and the effect keyed on [step] runs after that batch
	 * and clears exactly the fields the handler just filled — proven with a
	 * render probe, not assumed. That is why the 409 "already has an account"
	 * left the PR on step 1 with nothing said, and why "Code sent on WhatsApp
	 * to …" only ever appeared on a RESEND (the one send that does not change
	 * the step). A ref survives the wipe, because the effect itself reads it.
	 */
	const pendingAfterStep = useRef<
		| {
				kind: 'refusal';
				/** The box to mark, when the refusal is about one. */
				field?: keyof FieldErrors;
				msg: string;
				/** Offer "Back to sign in" under it — an account already exists. */
				signIn?: boolean;
		  }
		| { kind: 'notice'; msg: string }
		| null
	>(null);

	useEffect(() => {
		scroller.current?.scrollTo({ y: 0, animated: false });
		const carried = pendingAfterStep.current;
		pendingAfterStep.current = null;
		const refusal = carried?.kind === 'refusal' ? carried : null;
		setError(refusal ? refusal.msg : null);
		setFieldErrors(refusal?.field ? { [refusal.field]: refusal.msg } : {});
		setSignInFor(refusal?.signIn ? refusal.msg : null);
		setNotice(carried?.kind === 'notice' ? carried.msg : null);
		setToast(null);
		if (refusal) showToast(refusal.msg);
	}, [step, showToast]);

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

	// The server's own sentence, in her language where it is a known one (the
	// sign-up 409s, a wrong or expired code); anything else as it was sent.
	const describe = (e: unknown, fallback: string) =>
		e instanceof ApiError && e.message.trim()
			? localizeApiError(e.message, t.errors)
			: fallback;

	// `t.signup` IS the validation copy — validateStep takes Partial<SignupFieldCopy>,
	// so the hand-built 31-key map is gone. It is also one stable object per locale,
	// which the map was not: it was rebuilt every render and killed the memo below.
	/*
	 * No "is this number free?" lookup on step 1 any more (owner, 29 Sep 2026:
	 * "General message, both"). `/auth/register/check` told anybody whether a
	 * phone or an ID number had an account, so it no longer says, and asking
	 * would only cost a round trip. A number that has one is told so at the
	 * end, by `/auth/register`, once her code has proved it is hers.
	 */
	const goNext = () => {
		const { fields, toast: toastMsg } = validateStep(
			step,
			draft,
			localDigits,
			t.signup,
		);
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
			if (!resending) {
				const { fields, toast: toastMsg } = validateStep(
					5,
					draft,
					localDigits,
					t.signup,
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
				/*
				 * THE SAME CODE BY EMAIL TOO (owner, 21 Sep 2026: "must be the
				 * same otp"). The email is collected on step 1, so it is already
				 * in the draft by the time the phone is verified on step 6.
				 *
				 * ⚠️ ONLY WHEN IT PARSES. The field is OPTIONAL and nothing
				 * validates its shape (see validateStep — it judges the ID, the
				 * measurements and the phone, and never the email), so a typo
				 * would reach a PUBLIC endpoint's schema and 400 the send —
				 * blocking sign-up over a field the PR was told she could skip.
				 * A malformed address is simply not passed: she still gets the
				 * code on WhatsApp.
				 */
				const typedEmail = normalizeEmailInput(draft.email);
				const codeEmail = isPlausibleEmail(typedEmail) ? typedEmail : null;
				const res = await sendPrOtp(phoneNum, 'signup', { email: codeEmail });
				setResendIn(res.resendAfterSec || RESEND_SECONDS);
				setOtp('');
				/*
				 * The email half is named only when the SERVER says it went. Claiming
				 * an agency's stub account sends the code to the phone alone, and the
				 * old toast still said "and by email to …" — so she waited on an inbox
				 * that would never receive it.
				 */
				const sent = resending
					? t.signup.toastCodeResent
					: codeEmail && codeReachedEmail(res.sentTo)
						? formatMessage(t.signup.toastCodeSentWithEmail, {
								phone: fullPhone,
								email: codeEmail,
							})
						: formatMessage(t.signup.toastCodeSent, { phone: fullPhone });
				/*
				 * A RESEND does not change the step, so its effect never runs
				 * and the line is set directly. The FIRST send moves 5 → 6 and
				 * must travel through the ref, or it is wiped unread — which is
				 * exactly where "check your email too" would have been lost.
				 */
				if (resending) {
					setNotice(sent);
				} else {
					pendingAfterStep.current = { kind: 'notice', msg: sent };
				}
				setStep(6);
			} catch (e) {
				if (e instanceof ApiError && e.status === 409) {
					/*
					 * ONLY AN OLDER SERVER ANSWERS 409 HERE. Since 30 Sep 2026
					 * `/auth/otp/send` answers every sign-up alike — a number
					 * with an account gets its code on the phone alone, and the
					 * collision is told by `/auth/register` once the code proved
					 * it. Kept for a server not yet redeployed, which refused a
					 * taken phone (and, before 28 Sep, a taken email) with this
					 * status; each points at its own box, because telling her to
					 * change her phone number because of her email is how a PR
					 * gets stuck on a field that was fine.
					 */
					const emailTaken = /email/i.test(e.message);
					const msg = emailTaken
						? t.signup.toastEmailTaken
						: t.signup.toastPhoneTaken;
					/*
					 * Through the ref, never beside setStep — see
					 * pendingAfterStep. Safe because this handler is only ever
					 * reached from step 5 (Continue) or step 6 (Resend): the
					 * step ALWAYS changes here, so the effect always runs and
					 * always consumes it.
					 */
					pendingAfterStep.current = {
						kind: 'refusal',
						field: emailTaken ? 'email' : 'phone',
						msg,
					};
					setStep(1);
				} else {
					const msg = describe(e, t.signup.toastSendCodeFailed);
					setError(msg);
					showToast(msg);
				}
			} finally {
				setBusy(false);
			}
		},
		[busy, draft, localDigits, phoneNum, fullPhone, showToast, t.signup],
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
		/** True only while `registerPr` is the call in flight — see the catch. */
		let registering = false;
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
			registering = true;
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
			registering = false;
			/*
			 * THE ACCOUNT EXISTS NOW (30 Sep 2026). If the sign-in right after it
			 * fails — a dropped connection, a slow server — retrying the wizard
			 * could only spend a fresh code to be told "that phone number already
			 * has an account". So a failed sign-in HERE sends her straight to the
			 * sign-in screen, saying the account is ready. The photo uploads that
			 * follow need this session; their own retries live on Profile.
			 */
			let session: Awaited<ReturnType<typeof signIn>>;
			try {
				session = await signIn(phoneNum, draft.password);
			} catch {
				onBackToSignIn(t.signup.accountReadySignIn);
				return;
			}
			const { user: signedIn, accessToken } = session;
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

			/*
			 * The ID card is RETRIED; nothing else here is. It is the one asset
			 * with no second chance in the app beyond this screen — the avatar and
			 * gallery have their own buttons on Profile — so a single dropped
			 * connection used to lose it for good. A photo still missing after the
			 * retries is offered again on Profile ("ID card photos").
			 */
			const idRetry = { attempts: 3, delayMs: 1500 };
			const idFront = resolveUploadFile(
				draft.idPhotoFrontFile,
				draft.idPhotoFrontUri,
				'id-front.jpg',
			);
			if (idFront) {
				await runUpload('id-front', () =>
					withRetries(
						() => uploadUserIdDoc(accessToken, signedIn.id, 'front', idFront, 'id-front.jpg'),
						idRetry,
					),
				);
			}

			const needsIdBack = draft.idType !== 'Passport';
			const idBack = needsIdBack
				? resolveUploadFile(draft.idPhotoBackFile, draft.idPhotoBackUri, 'id-back.jpg')
				: null;
			if (idBack) {
				await runUpload('id-back', () =>
					withRetries(
						() => uploadUserIdDoc(accessToken, signedIn.id, 'back', idBack, 'id-back.jpg'),
						idRetry,
					),
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
				// Name what actually failed. A bare "some photos didn't upload" is
				// easy to miss and impossible to act on — an R2 outage silently ate
				// the avatar, the IC photos and the whole gallery behind this toast.
				// One sentence with a {list} slot, never a translated half plus an
				// English tail: Chinese puts the list somewhere else.
				showToast(
					formatMessage(t.signup.toastPhotosPartial, {
						list: uploadFailures.join(', '),
					}),
				);
			}
		} catch (e) {
			const spent = registering
				? spentReceiptRefusal(e, t.errors, t.signup.toastRegisterFailed)
				: null;
			if (spent) {
				/*
				 * HER RECEIPT IS DEAD (30 Sep 2026): the server spends it on ANY
				 * 409 as well as on success, and one sent again is refused with
				 * "Phone verification is missing or expired — verify again".
				 * Forget it and the code she typed, and take her back to step 5,
				 * whose submit sends a FRESH code — sending the same receipt could
				 * only collect that 400 again. Her draft is left exactly as typed.
				 *
				 * ⚠️ The sentence travels through `pendingAfterStep`, never beside
				 * `setStep` (see the comment there). Safe: this runs only from
				 * step 6, so the step always changes and the effect consumes it.
				 * A 409 also offers the way back to sign-in — both 409 sentences
				 * (a taken phone, or the general one) say "sign in".
				 */
				setVerificationId(null);
				setOtp('');
				pendingAfterStep.current = {
					kind: 'refusal',
					msg: spent.msg,
					signIn: spent.signIn,
				};
				setStep(5);
				return;
			}
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
					<StepIcon size={19} color={C.accent} strokeWidth={2.2} />
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
				{error && error === signInFor ? (
					<Pressable
						// Wrapped: handed straight to onPress, the tap EVENT would arrive
						// as the sign-in screen's notice.
						onPress={() => onBackToSignIn()}
						disabled={busy}
						hitSlop={8}
						accessibilityRole="link"
						style={styles.signInLink}
					>
						<Text style={styles.signInLinkText}>{t.signup.backToSignIn}</Text>
					</Pressable>
				) : null}
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
		...font(700),
		fontSize: 11,
		letterSpacing: 1.6,
		color: C.muted2,
	},
	titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
	title: {
		...font(800),
		fontSize: 22,
		letterSpacing: -0.3,
		color: C.txt,
	},
	subtitle: {
		...font(),
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
		...font(600),
		fontSize: 13,
		lineHeight: 18,
		color: '#fff',
		textAlign: 'center',
	},
	error: {
		...font(),
		fontSize: C.fsTiny,
		lineHeight: C.fsTiny * 1.4,
		color: C.red,
		marginTop: 8,
	},
	notice: {
		...font(),
		fontSize: C.fsTiny,
		lineHeight: C.fsTiny * 1.4,
		color: C.green,
		marginTop: 8,
	},
	signInLink: { alignSelf: 'flex-start', marginTop: 8 },
	signInLinkText: {
		...font(700),
		fontSize: C.fsTiny,
		color: C.accent,
		textDecorationLine: 'underline',
	},
});
