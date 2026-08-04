import React, { useCallback, useState } from 'react';
import {
	ActivityIndicator,
	Image,
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PublicAgency } from '../../lib/api';
import { captureFromCamera, pickImageFromGallery } from '../../lib/photo-file';
import { C, F, GRADIENTS, grad } from '../../theme/theme';
import { Camera, Check, ImagePlus, XIcon } from '../../components/icons';
import {
	getPrDisclaimer,
	PR_ACKNOWLEDGEMENTS,
	type PrDisclaimerId,
} from './acknowledgements';
import { Field, Input, Row } from './fields';
import { PORTFOLIO_PHOTO_MAX, type Draft, type FieldErrors } from './types';

type Props = {
	draft: Draft;
	fullPhone: string;
	agencies: PublicAgency[];
	fieldErrors: FieldErrors;
	patch: (part: Partial<Draft>) => void;
	clearFieldError: (key: keyof FieldErrors) => void;
};

type PhotoSource = 'camera' | 'gallery';
type SingleSlot = 'profile' | 'comcard';

function Fact({ label, value }: { label: string; value: string }) {
	return (
		<View style={styles.fact}>
			<Text style={styles.factLabel}>{label}</Text>
			<Text style={styles.factValue}>{value || '—'}</Text>
		</View>
	);
}

function SinglePhotoCard({
	title,
	optional,
	hint,
	uri,
	error,
	busy,
	aspect,
	onCamera,
	onGallery,
	onClear,
}: {
	title: string;
	optional?: boolean;
	hint: string;
	uri: string;
	error?: string;
	busy: boolean;
	aspect: 'square' | 'portrait';
	onCamera: () => void;
	onGallery: () => void;
	onClear: () => void;
}) {
	return (
		<View style={styles.block}>
			<View style={styles.blockHead}>
				<Text style={styles.photoTitle}>{title}</Text>
				{optional ? <Text style={styles.optionalPill}>Optional</Text> : null}
			</View>
			<View style={styles.singleRow}>
				<View
					style={[styles.singleFrame, aspect === 'portrait' && styles.singleFramePortrait]}
				>
					{uri ? (
						<Image source={{ uri }} style={styles.photoImg} />
					) : (
						<View style={styles.photoEmpty}>
							{busy ? (
								<ActivityIndicator color={C.accent} />
							) : (
								<>
									<Camera size={22} color={C.muted2} strokeWidth={2} />
									<Text style={styles.photoEmptyText}>Add photo</Text>
								</>
							)}
						</View>
					)}
					{uri ? (
						<View style={styles.photoBadge}>
							<Check size={11} color="#241a08" strokeWidth={2.8} />
						</View>
					) : null}
				</View>
				<View style={styles.singleSide}>
					<Text style={styles.photoHint}>{hint}</Text>
					{error ? <Text style={styles.photoError}>{error}</Text> : null}
					<View style={styles.actionsCol}>
						{uri ? (
							<Pressable style={styles.softBtn} onPress={onClear} disabled={busy}>
								<Text style={styles.softBtnText}>Remove</Text>
							</Pressable>
						) : null}
						<Pressable
							style={[styles.primaryBtn, grad(GRADIENTS.accent, C.accent)]}
							onPress={onCamera}
							disabled={busy}
						>
							{busy ? (
								<ActivityIndicator color="#241a08" />
							) : (
								<>
									<Camera size={14} color="#241a08" strokeWidth={2.2} />
									<Text style={styles.primaryBtnText}>Camera</Text>
								</>
							)}
						</Pressable>
						<Pressable style={styles.softBtn} onPress={onGallery} disabled={busy}>
							<ImagePlus size={14} color={C.prMuted} strokeWidth={2.2} />
							<Text style={styles.softBtnText}>Gallery</Text>
						</Pressable>
					</View>
				</View>
			</View>
		</View>
	);
}

type AckKey =
	| 'ackPersonalInfo'
	| 'ackDeclarationOfTruth'
	| 'ackInformationSharing'
	| 'acceptTerms';

const ACK_ROWS: { key: AckKey; disclaimerId: PrDisclaimerId; label: string }[] = [
	{
		key: 'ackPersonalInfo',
		disclaimerId: 'personal-info',
		label: 'Personal Information Disclaimer',
	},
	{
		key: 'ackDeclarationOfTruth',
		disclaimerId: 'declaration-of-truth',
		label: 'Declaration of Truth',
	},
	{
		key: 'ackInformationSharing',
		disclaimerId: 'information-sharing',
		label: 'Agency Information Sharing',
	},
];

function AckCheck({
	checked,
	label,
	error,
	onToggle,
	onOpen,
}: {
	checked: boolean;
	label: React.ReactNode;
	error?: string;
	onToggle: () => void;
	onOpen: () => void;
}) {
	return (
		<View style={styles.ackRow}>
			<Pressable
				style={[styles.ackBox, checked && styles.ackBoxOn]}
				onPress={onToggle}
				hitSlop={8}
			>
				{checked ? <Check size={11} color="#241a08" strokeWidth={3} /> : null}
			</Pressable>
			<View style={styles.ackLabelCol}>
				{typeof label === 'string' ? (
					<Pressable onPress={onOpen} hitSlop={4}>
						<Text style={styles.ackLink}>{label}</Text>
					</Pressable>
				) : (
					label
				)}
				{error ? <Text style={styles.ackError}>{error}</Text> : null}
			</View>
		</View>
	);
}

export function Step5Summary({
	draft,
	fullPhone,
	agencies,
	fieldErrors,
	patch,
	clearFieldError,
}: Props) {
	const insets = useSafeAreaInsets();
	const [busySlot, setBusySlot] = useState<SingleSlot | 'portfolio' | null>(null);
	const [openDisclaimer, setOpenDisclaimer] = useState<PrDisclaimerId | null>(null);
	const legalName = `${draft.firstName} ${draft.lastName}`.trim();
	const agencyName = agencies.find((a) => a.id === draft.agencyId)?.name || '—';
	const address = [
		draft.addressLine1,
		draft.addressLine2,
		draft.city,
		draft.postcode,
		draft.state,
		draft.country,
	]
		.filter(Boolean)
		.join(', ');
	const activeDisclaimer = openDisclaimer ? getPrDisclaimer(openDisclaimer) : null;

	const toggleAck = (key: AckKey) => {
		clearFieldError(key);
		patch({ [key]: !draft[key] });
	};

	const pickSingle = useCallback(
		async (slot: SingleSlot, source: PhotoSource) => {
			if (busySlot) return;
			setBusySlot(slot);
			try {
				const isProfile = slot === 'profile';
				const picked =
					source === 'gallery'
						? await pickImageFromGallery()
						: await captureFromCamera({
								facing: isProfile ? 'front' : 'back',
								aspect: isProfile ? [1, 1] : [3, 4],
								filename: isProfile ? 'avatar.jpg' : 'comcard.jpg',
							});
				if (!picked?.previewUri) return;
				if (isProfile) {
					clearFieldError('profileImageUri');
					patch({
						profileImageUri: picked.previewUri,
						profileImageFile: picked.file,
					});
				} else {
					clearFieldError('comcardImageUri');
					patch({
						comcardImageUri: picked.previewUri,
						comcardImageFile: picked.file,
					});
				}
			} finally {
				setBusySlot(null);
			}
		},
		[busySlot, clearFieldError, patch],
	);

	const addPortfolio = useCallback(
		async (source: PhotoSource) => {
			if (busySlot || draft.portfolioPhotos.length >= PORTFOLIO_PHOTO_MAX) return;
			setBusySlot('portfolio');
			try {
				const picked =
					source === 'gallery'
						? await pickImageFromGallery()
						: await captureFromCamera({
								facing: 'back',
								aspect: [3, 4],
								filename: `portfolio-${draft.portfolioPhotos.length + 1}.jpg`,
							});
				if (!picked?.previewUri) return;
				clearFieldError('portfolioPhotos');
				patch({
					portfolioPhotos: [
						...draft.portfolioPhotos,
						{ uri: picked.previewUri, file: picked.file },
					],
				});
			} finally {
				setBusySlot(null);
			}
		},
		[busySlot, clearFieldError, draft.portfolioPhotos, patch],
	);

	const removePortfolio = (index: number) => {
		clearFieldError('portfolioPhotos');
		patch({
			portfolioPhotos: draft.portfolioPhotos.filter((_, i) => i !== index),
		});
	};

	const initial = (draft.floorNickname.trim()[0] || legalName[0] || '?').toUpperCase();
	const canAddPortfolio = draft.portfolioPhotos.length < PORTFOLIO_PHOTO_MAX;

	return (
		<>
			<View style={[styles.hero, grad(GRADIENTS.card, C.panel)]}>
				<View style={styles.heroAvatarWrap}>
					{draft.profileImageUri ? (
						<Image source={{ uri: draft.profileImageUri }} style={styles.heroAvatar} />
					) : (
						<View style={[styles.heroAvatar, styles.heroAvatarEmpty]}>
							<Text style={styles.heroInitial}>{initial}</Text>
						</View>
					)}
				</View>
				<View style={styles.heroBody}>
					<Text style={styles.heroNick} numberOfLines={1}>
						{draft.floorNickname || 'Your nickname'}
					</Text>
					<Text style={styles.heroLegal} numberOfLines={1}>
						{legalName || 'Legal name'}
					</Text>
					<Text style={styles.heroPhone}>{fullPhone || '—'}</Text>
				</View>
			</View>

			<Text style={styles.sectionEyebrow}>YOUR PHOTOS</Text>

			{/* 1. Profile → user.profile_image */}
			<SinglePhotoCard
				title="Profile*"
				hint="Avatar · face clear · camera or gallery"
				uri={draft.profileImageUri}
				error={fieldErrors.profileImageUri}
				busy={busySlot === 'profile'}
				aspect="square"
				onCamera={() => void pickSingle('profile', 'camera')}
				onGallery={() => void pickSingle('profile', 'gallery')}
				onClear={() => {
					clearFieldError('profileImageUri');
					patch({ profileImageUri: '', profileImageFile: null });
				}}
			/>

			{/* 2. Comcard → user_profile.comcard_image (one, optional) */}
			<SinglePhotoCard
				title="Comcard"
				optional
				hint="One saved card image · venues see this first"
				uri={draft.comcardImageUri}
				error={fieldErrors.comcardImageUri}
				busy={busySlot === 'comcard'}
				aspect="portrait"
				onCamera={() => void pickSingle('comcard', 'camera')}
				onGallery={() => void pickSingle('comcard', 'gallery')}
				onClear={() => {
					clearFieldError('comcardImageUri');
					patch({ comcardImageUri: '', comcardImageFile: null });
				}}
			/>

			{/* 3. Portfolio → user_profile.portfolio_photos (many, optional) */}
			<View style={styles.block}>
				<View style={styles.blockHead}>
					<Text style={styles.photoTitle}>Portfolio</Text>
					<Text style={styles.optionalPill}>Optional</Text>
				</View>
				<Text style={styles.photoHint}>
					Up to {PORTFOLIO_PHOTO_MAX} gallery photos
					{draft.portfolioPhotos.length
						? ` · ${draft.portfolioPhotos.length}/${PORTFOLIO_PHOTO_MAX}`
						: ''}
				</Text>
				{fieldErrors.portfolioPhotos ? (
					<Text style={styles.photoError}>{fieldErrors.portfolioPhotos}</Text>
				) : null}

				<View style={styles.grid}>
					{draft.portfolioPhotos.map((photo, index) => (
						<View key={`${photo.uri}-${index}`} style={styles.cell}>
							<Image source={{ uri: photo.uri }} style={styles.thumb} />
							<Pressable
								style={styles.removeBtn}
								onPress={() => removePortfolio(index)}
								hitSlop={8}
							>
								<XIcon size={12} color={C.txt} strokeWidth={2.6} />
							</Pressable>
						</View>
					))}
					{canAddPortfolio ? (
						<View style={[styles.cell, styles.addCell]}>
							{busySlot === 'portfolio' ? (
								<ActivityIndicator color={C.accent} />
							) : (
								<>
									<Pressable
										style={styles.addBtn}
										onPress={() => void addPortfolio('camera')}
									>
										<Camera size={16} color={C.accent} strokeWidth={2.2} />
										<Text style={styles.addText}>Camera</Text>
									</Pressable>
									<Pressable
										style={styles.addBtn}
										onPress={() => void addPortfolio('gallery')}
									>
										<ImagePlus size={16} color={C.prMuted} strokeWidth={2.2} />
										<Text style={styles.addTextMuted}>Gallery</Text>
									</Pressable>
								</>
							)}
						</View>
					) : null}
				</View>
			</View>

			<Text style={styles.sectionEyebrow}>REVIEW DETAILS</Text>

			<View style={styles.card}>
				<Text style={styles.cardTitle}>Identity</Text>
				<Fact label="Nationality" value={draft.nationality} />
				<Fact label={draft.idType || 'ID'} value={draft.idNo} />
				<Fact label="Date of birth" value={draft.dob} />
				<Fact label="Email" value={draft.email || '—'} />
				<Fact
					label="Height / Weight"
					value={`${draft.heightCm || '—'} cm · ${draft.weightKg || '—'} kg`}
				/>
				<Fact
					label="3 dimensions (BWH)"
					value={`${draft.bustCm || '—'} · ${draft.waistCm || '—'} · ${draft.hipCm || '—'} cm`}
				/>
				<Fact
					label="Languages"
					value={draft.languages.length ? draft.languages.join(', ') : '—'}
				/>
			</View>

			<View style={styles.card}>
				<Text style={styles.cardTitle}>Address</Text>
				<Text style={styles.addressText}>{address || '—'}</Text>
			</View>

			<View style={styles.card}>
				<Text style={styles.cardTitle}>Agency</Text>
				<Fact
					label="Referral"
					value={
						draft.underAgency === true
							? 'Yes — referred'
							: draft.underAgency === false
								? 'No — asking to join'
								: '—'
					}
				/>
				<Fact label={draft.underAgency ? 'Added by' : 'Asking to join'} value={agencyName} />
			</View>

			<Text style={styles.sectionEyebrow}>LOGIN PASSWORD</Text>
			<View style={styles.passwordCard}>
				<Row>
					<Field label="Password*" flex error={fieldErrors.password}>
						<Input
							value={draft.password}
							onChangeText={(t) => {
								clearFieldError('password');
								patch({ password: t });
							}}
							placeholder="Min 6 characters"
							secureTextEntry
							autoCapitalize="none"
						/>
					</Field>
					<Field label="Confirm*" flex error={fieldErrors.confirm}>
						<Input
							value={draft.confirm}
							onChangeText={(t) => {
								clearFieldError('confirm');
								patch({ confirm: t });
							}}
							placeholder="Repeat password"
							secureTextEntry
							autoCapitalize="none"
						/>
					</Field>
				</Row>
			</View>

			<Text style={styles.sectionEyebrow}>AGREE & CONTINUE</Text>
			<View style={styles.ackCard}>
				{ACK_ROWS.map((row, index) => (
					<View
						key={row.key}
						style={[styles.ackItem, index < ACK_ROWS.length && styles.ackItemBorder]}
					>
						<AckCheck
							checked={draft[row.key]}
							label={
								PR_ACKNOWLEDGEMENTS.find((d) => d.id === row.disclaimerId)?.title ??
								row.label
							}
							error={fieldErrors[row.key]}
							onToggle={() => toggleAck(row.key)}
							onOpen={() => setOpenDisclaimer(row.disclaimerId)}
						/>
					</View>
				))}
				<View style={styles.ackItem}>
					<AckCheck
						checked={draft.acceptTerms}
						error={fieldErrors.acceptTerms}
						onToggle={() => toggleAck('acceptTerms')}
						onOpen={() => setOpenDisclaimer('terms')}
						label={
							<Text style={styles.ackTermsText}>
								I agree to the{' '}
								<Text
									style={styles.ackLink}
									onPress={() => setOpenDisclaimer('terms')}
								>
									Terms & Conditions
								</Text>
							</Text>
						}
					/>
				</View>
			</View>

			<Modal
				visible={openDisclaimer !== null}
				transparent
				animationType="fade"
				onRequestClose={() => setOpenDisclaimer(null)}
			>
				<View style={styles.modalBackdrop}>
					<View
						style={[
							styles.modalSheet,
							{ paddingBottom: 12 + Math.max(insets.bottom, 10) },
						]}
					>
						<ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
							<Text style={styles.modalTitle}>{activeDisclaimer?.title}</Text>
							<Text style={styles.modalBody}>{activeDisclaimer?.body}</Text>
						</ScrollView>
						<Pressable
							style={[styles.modalDone, grad(GRADIENTS.accent, C.accent)]}
							onPress={() => setOpenDisclaimer(null)}
						>
							<Text style={styles.modalDoneText}>Done</Text>
						</Pressable>
					</View>
				</View>
			</Modal>
		</>
	);
}

const styles = StyleSheet.create({
	hero: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 14,
		padding: 14,
		borderRadius: 18,
		borderWidth: 1,
		borderColor: C.line,
		marginBottom: 18,
	},
	heroAvatarWrap: {
		borderRadius: 22,
		overflow: 'hidden',
		borderWidth: 2,
		borderColor: 'rgba(227,184,119,0.45)',
	},
	heroAvatar: {
		width: 72,
		height: 72,
		borderRadius: 20,
		backgroundColor: C.bg2,
	},
	heroAvatarEmpty: {
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: 'rgba(183,156,232,0.18)',
	},
	heroInitial: {
		fontFamily: F.sora,
		fontSize: 28,
		fontWeight: '700',
		color: C.violetL,
	},
	heroBody: { flex: 1, minWidth: 0 },
	heroNick: {
		fontFamily: F.sora,
		fontSize: 18,
		fontWeight: '700',
		color: C.txt,
	},
	heroLegal: {
		fontFamily: F.manrope,
		fontSize: 14,
		color: C.prMuted,
		marginTop: 2,
	},
	heroPhone: {
		fontFamily: F.sora,
		fontSize: 13,
		fontWeight: '600',
		color: C.accent,
		marginTop: 6,
	},
	sectionEyebrow: {
		fontFamily: F.sora,
		fontSize: 11,
		fontWeight: '700',
		letterSpacing: 1.2,
		color: C.muted2,
		marginBottom: 8,
		marginTop: 2,
	},
	block: {
		marginBottom: 14,
		padding: 12,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: C.line,
		backgroundColor: C.panel,
	},
	blockHead: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		marginBottom: 8,
	},
	optionalPill: {
		fontFamily: F.sora,
		fontSize: 11,
		fontWeight: '700',
		color: C.muted2,
		letterSpacing: 0.4,
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 999,
		borderWidth: 1,
		borderColor: C.line,
		overflow: 'hidden',
	},
	singleRow: { flexDirection: 'row', gap: 12 },
	singleFrame: {
		width: 112,
		height: 112,
		borderRadius: 16,
		overflow: 'hidden',
		borderWidth: 1,
		borderColor: C.line,
		backgroundColor: C.bg2,
	},
	singleFramePortrait: {
		width: 96,
		height: 128,
	},
	singleSide: { flex: 1, minWidth: 0, justifyContent: 'center' },
	photoTitle: {
		fontFamily: F.sora,
		fontSize: 13,
		fontWeight: '700',
		color: C.txt,
	},
	photoImg: { width: '100%', height: '100%' },
	photoEmpty: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		gap: 6,
	},
	photoEmptyText: {
		fontFamily: F.manrope,
		fontSize: 12,
		color: C.muted2,
	},
	photoBadge: {
		position: 'absolute',
		top: 8,
		right: 8,
		width: 22,
		height: 22,
		borderRadius: 11,
		backgroundColor: C.accent,
		alignItems: 'center',
		justifyContent: 'center',
	},
	photoHint: {
		fontFamily: F.manrope,
		fontSize: 12,
		lineHeight: 16,
		color: C.muted2,
		marginBottom: 8,
	},
	photoError: {
		fontFamily: F.manrope,
		fontSize: 12,
		color: C.red,
		marginBottom: 6,
	},
	actionsCol: { gap: 6 },
	softBtn: {
		minHeight: 36,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: C.line2,
		backgroundColor: C.glass2,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 5,
		paddingHorizontal: 10,
	},
	softBtnText: {
		fontFamily: F.sora,
		fontSize: 12,
		fontWeight: '700',
		color: C.prMuted,
	},
	primaryBtn: {
		minHeight: 36,
		borderRadius: 10,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 5,
		paddingHorizontal: 10,
	},
	primaryBtnText: {
		fontFamily: F.sora,
		fontSize: 12,
		fontWeight: '700',
		color: '#241a08',
	},
	grid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 8,
		marginTop: 4,
	},
	cell: {
		width: '31%',
		aspectRatio: 3 / 4,
		borderRadius: 12,
		overflow: 'hidden',
		backgroundColor: C.bg2,
		borderWidth: 1,
		borderColor: C.line,
	},
	thumb: { width: '100%', height: '100%' },
	removeBtn: {
		position: 'absolute',
		top: 6,
		right: 6,
		width: 22,
		height: 22,
		borderRadius: 11,
		backgroundColor: 'rgba(0,0,0,0.55)',
		alignItems: 'center',
		justifyContent: 'center',
	},
	addCell: {
		borderStyle: 'dashed',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 6,
		padding: 6,
	},
	addBtn: {
		alignItems: 'center',
		justifyContent: 'center',
		gap: 2,
		paddingVertical: 4,
		paddingHorizontal: 6,
	},
	addText: {
		fontFamily: F.sora,
		fontSize: 11,
		fontWeight: '700',
		color: C.accent,
	},
	addTextMuted: {
		fontFamily: F.sora,
		fontSize: 11,
		fontWeight: '700',
		color: C.prMuted,
	},
	card: {
		padding: 14,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: C.line,
		backgroundColor: C.panel,
		marginBottom: 10,
	},
	cardTitle: {
		fontFamily: F.sora,
		fontSize: 14,
		fontWeight: '700',
		color: C.accentL,
		marginBottom: 10,
	},
	fact: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		gap: 12,
		paddingVertical: 6,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: C.line,
	},
	factLabel: {
		fontFamily: F.sora,
		fontSize: 12,
		fontWeight: '600',
		color: C.muted2,
		flexShrink: 0,
	},
	factValue: {
		flex: 1,
		fontFamily: F.manrope,
		fontSize: 13,
		fontWeight: '600',
		color: C.txt,
		textAlign: 'right',
	},
	addressText: {
		fontFamily: F.manrope,
		fontSize: 14,
		lineHeight: 20,
		color: C.txt,
	},
	passwordCard: {
		borderRadius: 12,
		borderWidth: 1,
		borderColor: C.line,
		backgroundColor: C.panel,
		paddingHorizontal: 12,
		paddingTop: 10,
		paddingBottom: 4,
		marginBottom: 12,
	},
	ackCard: {
		borderRadius: 12,
		borderWidth: 1,
		borderColor: C.line,
		backgroundColor: C.panel,
		marginBottom: 8,
		overflow: 'hidden',
	},
	ackItem: { paddingHorizontal: 12, paddingVertical: 8 },
	ackItemBorder: {
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: C.line,
	},
	ackRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
	ackBox: {
		width: 18,
		height: 18,
		borderRadius: 5,
		borderWidth: 1.5,
		borderColor: 'rgba(227,184,119,0.55)',
		backgroundColor: C.bg2,
		alignItems: 'center',
		justifyContent: 'center',
		flexShrink: 0,
	},
	ackBoxOn: {
		backgroundColor: C.accent,
		borderColor: C.accent,
	},
	ackLabelCol: { flex: 1, minWidth: 0, gap: 2 },
	ackLink: {
		fontFamily: F.sora,
		fontSize: 12,
		fontWeight: '600',
		color: C.accentL,
		textDecorationLine: 'underline',
	},
	ackTermsText: {
		fontFamily: F.manrope,
		fontSize: 12,
		lineHeight: 16,
		color: C.txt,
	},
	ackError: {
		fontFamily: F.manrope,
		fontSize: 11,
		color: C.red,
	},
	modalBackdrop: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.55)',
		justifyContent: 'flex-end',
		paddingHorizontal: 14,
	},
	modalSheet: {
		borderRadius: 16,
		borderWidth: 1,
		borderColor: C.line,
		backgroundColor: C.panel,
		paddingHorizontal: 16,
		paddingTop: 14,
		maxHeight: '70%',
		gap: 12,
	},
	modalScroll: { flexGrow: 0 },
	modalTitle: {
		fontFamily: F.sora,
		fontSize: 15,
		fontWeight: '700',
		color: C.txt,
		marginBottom: 8,
	},
	modalBody: {
		fontFamily: F.manrope,
		fontSize: 13,
		lineHeight: 19,
		color: C.prMuted,
		paddingBottom: 2,
	},
	modalDone: {
		minHeight: 40,
		borderRadius: 11,
		alignItems: 'center',
		justifyContent: 'center',
	},
	modalDoneText: {
		fontFamily: F.sora,
		fontSize: 13,
		fontWeight: '700',
		color: '#241a08',
	},
});
