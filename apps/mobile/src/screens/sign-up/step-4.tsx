import React, { useCallback, useState } from 'react';
import {
	ActivityIndicator,
	Image,
	Modal,
	Pressable,
	StyleSheet,
	Text,
	View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, GRADIENTS, grad } from '../../theme/theme';
import { Camera, Check, Shield } from '../../components/icons';
import { captureFromCamera } from '../../lib/photo-file';
import {
	isValidNricFormat,
	nricMatchesDob,
	verifyIdPhotoMatches,
	type IdOcrMatch,
} from '../../lib/id-ocr';
import type { Draft, FieldErrors, IdType } from './types';

type Slot = 'idPhotoFrontUri' | 'idPhotoBackUri';

type Props = {
	draft: Draft;
	fieldErrors: FieldErrors;
	patch: (part: Partial<Draft>) => void;
	clearFieldError: (key: keyof FieldErrors) => void;
};

/**
 * Play / App Store: show an in-app rationale the first time the user taps
 * camera on Step 4 — even if OS camera permission was already granted
 * elsewhere. Survives Step 4 remounts in this JS session so it does not
 * nag again after they tap Allow.
 */
let idCameraExplainerAcked = false;

function idLabel(idType: IdType | ''): string {
	if (idType === 'Passport') return 'passport';
	if (idType === 'Work permit') return 'work permit';
	return 'NRIC';
}

function ocrMessage(
	side: 'front' | 'back',
	result: IdOcrMatch | null,
	busy: boolean,
): { text: string; tone: 'ok' | 'bad' | 'muted' } {
	if (busy) return { text: `Reading ${side} ID number…`, tone: 'muted' };
	if (!result) {
		return {
			text: `${side === 'front' ? 'Front' : 'Back'} photo will be checked against your ID number.`,
			tone: 'muted',
		};
	}
	if (result.status === 'matched') {
		return { text: `ID number matched: ${result.seen}`, tone: 'ok' };
	}
	if (result.status === 'mismatch') {
		return {
			text: result.seen
				? `Photo shows ${result.seen}, but you entered ${result.expected}. Retake or fix Step 1.`
				: `Could not find ID ${result.expected} on the ${side}. Retake a clearer shot.`,
			tone: 'bad',
		};
	}
	if (result.status === 'unreadable') {
		return {
			text: `Could not read any ID number on the ${side}. Retake with better light, no glare.`,
			tone: 'bad',
		};
	}
	return {
		text: 'OCR is not available in this build — use the phone app with ML Kit. Cannot skip.',
		tone: 'bad',
	};
}

function passportOcrMessage(
	result: IdOcrMatch | null,
	busy: boolean,
): { text: string; tone: 'ok' | 'bad' | 'muted' } {
	if (busy) return { text: 'Reading passport number…', tone: 'muted' };
	if (!result) {
		return {
			text: 'Passport photo page will be checked against your passport number.',
			tone: 'muted',
		};
	}
	if (result.status === 'matched') {
		return { text: `Passport number matched: ${result.seen}`, tone: 'ok' };
	}
	if (result.status === 'mismatch') {
		return {
			text: result.seen
				? `Photo shows ${result.seen}, but you entered ${result.expected}. Retake or fix Step 1.`
				: `Could not find passport ${result.expected} on the page. Retake a clearer shot.`,
			tone: 'bad',
		};
	}
	if (result.status === 'unreadable') {
		return {
			text: 'Could not read the passport number. Retake with better light, no glare.',
			tone: 'bad',
		};
	}
	return {
		text: 'OCR is not available in this build — use the phone app with ML Kit. Cannot skip.',
		tone: 'bad',
	};
}

function CaptureRow({
	label,
	uri,
	msg,
	error,
	busy,
	spinning,
	onCapture,
	onClear,
}: {
	label: string;
	uri: string;
	msg: { text: string; tone: 'ok' | 'bad' | 'muted' };
	error?: string;
	busy: boolean;
	spinning: boolean;
	onCapture: () => void;
	onClear: () => void;
}) {
	return (
		<View style={styles.row}>
			<Text style={styles.label}>{label}</Text>
			{uri ? (
				<Image source={{ uri }} style={styles.thumb} />
			) : (
				<View style={styles.thumbEmpty}>
					<Camera size={20} color={C.muted2} strokeWidth={2} />
				</View>
			)}
			<Text
				style={[
					styles.ocrLine,
					msg.tone === 'ok' && styles.ocrOk,
					msg.tone === 'bad' && styles.ocrBad,
				]}
			>
				{msg.text}
			</Text>
			{error ? <Text style={styles.error}>{error}</Text> : null}
			<View style={styles.actions}>
				{uri ? (
					<>
						<Pressable style={styles.btnSoft} onPress={onClear} disabled={busy}>
							<Text style={styles.btnSoftText}>Remove</Text>
						</Pressable>
						<Pressable style={styles.btnPrimary} onPress={onCapture} disabled={busy}>
							{spinning ? (
								<ActivityIndicator color="#241a08" />
							) : (
								<>
									<Camera size={15} color="#241a08" strokeWidth={2.2} />
									<Text style={styles.btnPrimaryText}>Retake</Text>
								</>
							)}
						</Pressable>
					</>
				) : (
					<Pressable style={styles.btnPrimary} onPress={onCapture} disabled={busy}>
						{spinning ? (
							<ActivityIndicator color="#241a08" />
						) : (
							<>
								<Camera size={15} color="#241a08" strokeWidth={2.2} />
								<Text style={styles.btnPrimaryText}>Open camera</Text>
							</>
						)}
					</Pressable>
				)}
			</View>
		</View>
	);
}

export function Step4VerifyPhotos({ draft, fieldErrors, patch, clearFieldError }: Props) {
	const insets = useSafeAreaInsets();
	const [busySlot, setBusySlot] = useState<Slot | null>(null);
	const [ocrBusySlot, setOcrBusySlot] = useState<Slot | null>(null);
	const [frontOcr, setFrontOcr] = useState<IdOcrMatch | null>(null);
	const [backOcr, setBackOcr] = useState<IdOcrMatch | null>(null);
	const [promptOpen, setPromptOpen] = useState(false);
	const [pendingSlot, setPendingSlot] = useState<Slot | null>(null);
	const doc = idLabel(draft.idType);

	const runOcr = useCallback(
		async (slot: Slot, uri: string) => {
			const okKey = slot === 'idPhotoFrontUri' ? 'idFrontOcrOk' : 'idBackOcrOk';
			const setResult = slot === 'idPhotoFrontUri' ? setFrontOcr : setBackOcr;
			setOcrBusySlot(slot);
			try {
				if (draft.idType === 'NRIC') {
					if (!isValidNricFormat(draft.idNo)) {
						setResult({
							status: 'mismatch',
							seen: null,
							expected: draft.idNo || '(empty)',
						});
						patch({ [okKey]: false });
						return;
					}
					if (!nricMatchesDob(draft.idNo, draft.dob)) {
						setResult({
							status: 'mismatch',
							seen: null,
							expected: `${draft.idNo} (must match DOB)`,
						});
						patch({ [okKey]: false });
						return;
					}
				}

				const result = await verifyIdPhotoMatches(uri, draft.idNo, draft.idType || 'NRIC');
				setResult(result);
				// Only a real match counts — never treat "OCR unavailable" as a skip/pass.
				const ok = result.status === 'matched';
				if (draft.idType === 'Passport' && slot === 'idPhotoFrontUri') {
					// Passport is one page — no back capture; keep back flags clear/satisfied.
					patch({
						idFrontOcrOk: ok,
						idPhotoBackUri: '',
						idPhotoBackFile: null,
						idBackOcrOk: true,
					});
				} else {
					patch({ [okKey]: ok });
				}
				if (ok) clearFieldError(slot);
			} finally {
				setOcrBusySlot(null);
			}
		},
		[clearFieldError, draft.dob, draft.idNo, draft.idType, patch],
	);

	const shoot = useCallback(
		async (slot: Slot) => {
			if (busySlot || ocrBusySlot) return;
			setBusySlot(slot);
			try {
				const passport = draft.idType === 'Passport';
				const picked = await captureFromCamera({
					facing: 'back',
					filename:
						slot === 'idPhotoFrontUri'
							? passport
								? 'id-passport.jpg'
								: 'id-front.jpg'
							: 'id-back.jpg',
				});
				if (!picked?.previewUri) return;
				clearFieldError(slot);
				const okKey = slot === 'idPhotoFrontUri' ? 'idFrontOcrOk' : 'idBackOcrOk';
				const fileKey =
					slot === 'idPhotoFrontUri' ? 'idPhotoFrontFile' : 'idPhotoBackFile';
				patch({
					[slot]: picked.previewUri,
					[fileKey]: picked.file,
					[okKey]: false,
					...(passport && slot === 'idPhotoFrontUri'
						? {
								idPhotoBackUri: '',
								idPhotoBackFile: null,
								idBackOcrOk: true,
							}
						: {}),
				});
				await runOcr(slot, picked.previewUri);
			} finally {
				setBusySlot(null);
			}
		},
		[busySlot, clearFieldError, draft.idType, ocrBusySlot, patch, runOcr],
	);

	const requestCapture = (slot: Slot) => {
		if (busySlot || ocrBusySlot) return;
		// First tap always shows the rationale (Google/Apple policy), even if
		// OS camera is already allowed. Later taps / remounts skip it.
		if (!idCameraExplainerAcked) {
			setPendingSlot(slot);
			setPromptOpen(true);
			return;
		}
		void shoot(slot);
	};

	const confirmCameraAccess = () => {
		idCameraExplainerAcked = true;
		const slot = pendingSlot;
		setPromptOpen(false);
		setPendingSlot(null);
		if (slot) void shoot(slot);
	};

	const passportOnly = draft.idType === 'Passport';
	const frontBusy = ocrBusySlot === 'idPhotoFrontUri';
	const frontMsg = passportOnly
		? passportOcrMessage(frontOcr, frontBusy)
		: ocrMessage('front', frontOcr, frontBusy);
	const backMsg = ocrMessage('back', backOcr, ocrBusySlot === 'idPhotoBackUri');
	const busy = busySlot !== null || ocrBusySlot !== null;
	const verified =
		frontOcr?.status === 'matched' &&
		(passportOnly || backOcr?.status === 'matched');

	return (
		<>
			<View style={styles.intro}>
				<Shield size={18} color={C.accent} strokeWidth={2.1} />
				<Text style={styles.introBody}>
					{passportOnly
						? 'Photograph the passport photo page only (one side). We OCR it and check the passport number matches what you entered.'
						: `Photograph the front and back of your ${doc}. We OCR both sides and check the ID number matches what you entered.`}
				</Text>
			</View>

			<CaptureRow
				label={passportOnly ? `1. ${doc} photo page*` : `1. ${doc} front*`}
				uri={draft.idPhotoFrontUri}
				msg={frontMsg}
				error={fieldErrors.idPhotoFrontUri}
				busy={busy}
				spinning={busySlot === 'idPhotoFrontUri' || ocrBusySlot === 'idPhotoFrontUri'}
				onCapture={() => requestCapture('idPhotoFrontUri')}
				onClear={() => {
					clearFieldError('idPhotoFrontUri');
					setFrontOcr(null);
					patch({
						idPhotoFrontUri: '',
						idPhotoFrontFile: null,
						idFrontOcrOk: false,
						...(passportOnly
							? {
									idPhotoBackUri: '',
									idPhotoBackFile: null,
									idBackOcrOk: true,
								}
							: {}),
					});
				}}
			/>

			{!passportOnly ? (
				<CaptureRow
					label={`2. ${doc} back*`}
					uri={draft.idPhotoBackUri}
					msg={backMsg}
					error={fieldErrors.idPhotoBackUri}
					busy={busy}
					spinning={busySlot === 'idPhotoBackUri' || ocrBusySlot === 'idPhotoBackUri'}
					onCapture={() => requestCapture('idPhotoBackUri')}
					onClear={() => {
						clearFieldError('idPhotoBackUri');
						setBackOcr(null);
						patch({
							idPhotoBackUri: '',
							idPhotoBackFile: null,
							idBackOcrOk: false,
						});
					}}
				/>
			) : null}

			{verified ? (
				<View style={styles.okBanner}>
					<Check size={14} color={C.green} strokeWidth={2.6} />
					<Text style={styles.okBannerText}>
						{passportOnly
							? 'Passport number verified on the photo page'
							: 'ID number verified on front and back'}
					</Text>
				</View>
			) : null}

			<Modal
				visible={promptOpen}
				transparent
				animationType="fade"
				onRequestClose={() => setPromptOpen(false)}
			>
				<View style={styles.promptBackdrop}>
					<View style={[styles.promptSheet, { paddingBottom: 18 + Math.max(insets.bottom, 12) }]}>
						<Camera size={26} color={C.accent} strokeWidth={2.2} />
						<Text style={styles.promptTitle}>Camera access needed</Text>
						<Text style={styles.promptBody}>
							{passportOnly
								? 'InnocenZ needs your camera to photograph the passport photo page. One photo is enough — we check the passport number with on-phone OCR.'
								: 'InnocenZ needs your camera to photograph your ID card. Front and back photos are recorded for validation, and we check the ID number on both sides with on-phone OCR.'}
						</Text>
						<Pressable
							style={[styles.promptEnableBtn, grad(GRADIENTS.accent, C.accent)]}
							onPress={confirmCameraAccess}
						>
							<Text style={styles.promptEnableText}>Allow camera & continue</Text>
						</Pressable>
						<Pressable
							style={styles.promptCancel}
							onPress={() => {
								setPromptOpen(false);
								setPendingSlot(null);
							}}
						>
							<Text style={styles.promptCancelText}>Not now</Text>
						</Pressable>
					</View>
				</View>
			</Modal>
		</>
	);
}

const styles = StyleSheet.create({
	intro: {
		flexDirection: 'row',
		gap: 10,
		marginBottom: 14,
		padding: 12,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: 'rgba(227,184,119,0.28)',
		backgroundColor: 'rgba(227,184,119,0.08)',
		alignItems: 'flex-start',
	},
	introBody: {
		flex: 1,
		fontFamily: F.manrope,
		fontSize: 13,
		lineHeight: 18,
		color: C.prMuted,
	},
	row: {
		marginBottom: 14,
		padding: 12,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: C.line,
		backgroundColor: C.panel,
	},
	label: {
		fontFamily: F.sora,
		fontSize: 14,
		fontWeight: '700',
		color: C.txt,
		marginBottom: 8,
	},
	thumb: {
		width: '100%',
		height: 140,
		borderRadius: 12,
		backgroundColor: '#0e0b16',
	},
	thumbEmpty: {
		height: 100,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: C.line,
		borderStyle: 'dashed',
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: C.bg2,
	},
	ocrLine: {
		fontFamily: F.manrope,
		fontSize: 12,
		lineHeight: 17,
		color: C.muted2,
		marginTop: 8,
	},
	ocrOk: { color: C.green },
	ocrBad: { color: C.red },
	error: {
		fontFamily: F.manrope,
		fontSize: 12,
		color: C.red,
		marginTop: 4,
	},
	actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
	btnPrimary: {
		flex: 1,
		minHeight: 44,
		borderRadius: 12,
		backgroundColor: C.accent,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 7,
	},
	btnPrimaryText: {
		fontFamily: F.sora,
		fontSize: 14,
		fontWeight: '700',
		color: '#241a08',
	},
	btnSoft: {
		minHeight: 44,
		paddingHorizontal: 16,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: C.line2,
		backgroundColor: C.glass2,
		alignItems: 'center',
		justifyContent: 'center',
	},
	btnSoftText: {
		fontFamily: F.sora,
		fontSize: 14,
		fontWeight: '700',
		color: C.prMuted,
	},
	okBanner: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		padding: 12,
		borderRadius: 12,
		backgroundColor: C.greenBg,
		marginBottom: 8,
	},
	okBannerText: {
		fontFamily: F.sora,
		fontSize: 13,
		fontWeight: '700',
		color: C.green,
	},
	promptBackdrop: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.62)',
		justifyContent: 'flex-end',
	},
	promptSheet: {
		paddingTop: 22,
		paddingHorizontal: 20,
		borderTopLeftRadius: 22,
		borderTopRightRadius: 22,
		borderWidth: 1,
		borderColor: C.line,
		backgroundColor: C.panel,
		alignItems: 'center',
		gap: 8,
	},
	promptTitle: {
		fontFamily: F.sora,
		fontSize: 18,
		fontWeight: '800',
		color: C.txt,
		textAlign: 'center',
	},
	promptBody: {
		fontFamily: F.manrope,
		fontSize: 14,
		lineHeight: 20,
		color: C.prMuted,
		textAlign: 'center',
		marginBottom: 8,
	},
	promptEnableBtn: {
		alignSelf: 'stretch',
		minHeight: 48,
		borderRadius: 14,
		alignItems: 'center',
		justifyContent: 'center',
	},
	promptEnableText: {
		fontFamily: F.sora,
		fontSize: 15,
		fontWeight: '800',
		color: '#241a08',
	},
	promptCancel: { paddingVertical: 10, paddingHorizontal: 16 },
	promptCancelText: {
		fontFamily: F.sora,
		fontSize: 14,
		fontWeight: '700',
		color: C.muted2,
	},
});
