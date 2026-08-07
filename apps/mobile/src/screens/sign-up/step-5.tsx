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
import { formatMessage, useLocale } from '../../i18n';
import { C, F, GRADIENTS, grad } from '../../theme/theme';
import { Camera, Check, ImagePlus, XIcon } from '../../components/icons';
import {
	getPrDisclaimerFromCopy,
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
type SingleSlot = 'profile';

function Fact({ label, value }: { label: string; value: string }) {
	return (
		<View style={styles.fact}>
			<Text style={styles.factLabel}>{label}</Text>
			<Text style={styles.factValue}>{value || '—'}</Text>
		</View>
	);
}

function ageFromDob(dob: string): number {
	if (!dob) return 0;
	const d = new Date(dob);
	if (Number.isNaN(d.getTime())) return 0;
	return Math.max(0, new Date().getFullYear() - d.getFullYear());
}

function SinglePhotoCard({
	title,
	optional,
	optionalLabel,
	hint,
	uri,
	error,
	busy,
	aspect,
	addLabel,
	removeLabel,
	cameraLabel,
	galleryLabel,
	onCamera,
	onGallery,
	onClear,
}: {
	title: string;
	optional?: boolean;
	optionalLabel: string;
	hint: string;
	uri: string;
	error?: string;
	busy: boolean;
	aspect: 'square' | 'portrait';
	addLabel: string;
	removeLabel: string;
	cameraLabel: string;
	galleryLabel: string;
	onCamera: () => void;
	onGallery: () => void;
	onClear: () => void;
}) {
	return (
		<View style={styles.block}>
			<View style={styles.blockHead}>
				<Text style={styles.photoTitle}>{title}</Text>
				{optional ? <Text style={styles.optionalPill}>{optionalLabel}</Text> : null}
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
									<Text style={styles.photoEmptyText}>{addLabel}</Text>
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
								<Text style={styles.softBtnText}>{removeLabel}</Text>
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
									<Text style={styles.primaryBtnText}>{cameraLabel}</Text>
								</>
							)}
						</Pressable>
						<Pressable style={styles.softBtn} onPress={onGallery} disabled={busy}>
							<ImagePlus size={14} color={C.prMuted} strokeWidth={2.2} />
							<Text style={styles.softBtnText}>{galleryLabel}</Text>
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

const ACK_ROWS: { key: AckKey; disclaimerId: PrDisclaimerId; labelKey: 'ackPersonalInfo' | 'ackDeclaration' | 'ackSharing' }[] = [
	{
		key: 'ackPersonalInfo',
		disclaimerId: 'personal-info',
		labelKey: 'ackPersonalInfo',
	},
	{
		key: 'ackDeclarationOfTruth',
		disclaimerId: 'declaration-of-truth',
		labelKey: 'ackDeclaration',
	},
	{
		key: 'ackInformationSharing',
		disclaimerId: 'information-sharing',
		labelKey: 'ackSharing',
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
	const { t } = useLocale();
	const insets = useSafeAreaInsets();
	const [busySlot, setBusySlot] = useState<SingleSlot | 'portfolio' | null>(null);
	const [openDisclaimer, setOpenDisclaimer] = useState<PrDisclaimerId | null>(null);
	const [portfolioGridW, setPortfolioGridW] = useState(0);
	const portfolioGap = 10;
	const portfolioTileW =
		portfolioGridW > 0 ? (portfolioGridW - portfolioGap) / 2 : 0;
	const portfolioTileH = portfolioTileW > 0 ? portfolioTileW * (4 / 3) : 0;
	const legalName = draft.fullName.trim();
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
	const activeDisclaimer = openDisclaimer
		? getPrDisclaimerFromCopy(t.signup, openDisclaimer)
		: null;

	const toggleAck = (key: AckKey) => {
		clearFieldError(key);
		patch({ [key]: !draft[key] });
	};

	const pickSingle = useCallback(
		async (slot: SingleSlot, source: PhotoSource) => {
			if (busySlot) return;
			setBusySlot(slot);
			try {
				const picked =
					source === 'gallery'
						? await pickImageFromGallery()
						: await captureFromCamera({
								facing: 'front',
								aspect: [1, 1],
								filename: 'avatar.jpg',
							});
				if (!picked?.previewUri) return;
				clearFieldError('profileImageUri');
				patch({
					profileImageUri: picked.previewUri,
					profileImageFile: picked.file,
				});
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
	const displayName = draft.floorNickname.trim() || legalName || 'PR';
	const age = ageFromDob(draft.dob);
	const height = draft.heightCm.replace(/\D/g, '') || '—';
	const weight = draft.weightKg.replace(/\D/g, '') || '—';
	const comcardPaths = Array.from(
		{ length: 4 },
		(_, i) => draft.portfolioPhotos[i]?.uri ?? null,
	);
	const hasComcardPhotos = comcardPaths.some(Boolean);

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
						{draft.floorNickname || t.signup.yourNickname}
					</Text>
					<Text style={styles.heroLegal} numberOfLines={1}>
						{legalName || t.signup.legalName}
					</Text>
					<Text style={styles.heroPhone}>{fullPhone || '—'}</Text>
				</View>
			</View>

			<Text style={styles.sectionEyebrow}>{t.signup.yourPhotos}</Text>

			{/* 1. Profile → user.profile_image */}
			<SinglePhotoCard
				title={t.signup.profilePhoto}
				hint={t.signup.profilePhotoHint}
				uri={draft.profileImageUri}
				error={fieldErrors.profileImageUri}
				busy={busySlot === 'profile'}
				aspect="square"
				optionalLabel={t.signup.optional}
				addLabel={t.signup.addPhotos}
				removeLabel={t.signup.remove}
				cameraLabel={t.signup.camera}
				galleryLabel={t.signup.gallery}
				onCamera={() => void pickSingle('profile', 'camera')}
				onGallery={() => void pickSingle('profile', 'gallery')}
				onClear={() => {
					clearFieldError('profileImageUri');
					patch({ profileImageUri: '', profileImageFile: null });
				}}
			/>

			{/* 2. Portfolio → user_profile.portfolio_photos */}
			<View style={styles.block}>
				<View style={styles.blockHead}>
					<Text style={styles.photoTitle}>{t.signup.portfolio}</Text>
					<Text style={styles.optionalPill}>{t.signup.optional}</Text>
				</View>
				<Text style={styles.photoHint}>
					{formatMessage(t.signup.portfolioHint, { max: PORTFOLIO_PHOTO_MAX })}
					{draft.portfolioPhotos.length
						? formatMessage(t.signup.portfolioHintCount, {
								count: draft.portfolioPhotos.length,
								max: PORTFOLIO_PHOTO_MAX,
							})
						: ''}
				</Text>
				{fieldErrors.portfolioPhotos ? (
					<Text style={styles.photoError}>{fieldErrors.portfolioPhotos}</Text>
				) : null}

				<View
					style={styles.grid}
					onLayout={(e) => {
						const w = e.nativeEvent.layout.width;
						if (w > 0 && Math.abs(w - portfolioGridW) > 0.5) setPortfolioGridW(w);
					}}
				>
					{draft.portfolioPhotos.map((photo, index) => {
						const label = String(index + 1).padStart(2, '0');
						const tileSize =
							portfolioTileW > 0
								? { width: portfolioTileW, height: portfolioTileH }
								: null;
						return (
							<View
								key={`${photo.uri}-${index}`}
								style={[styles.cell, styles.cellFilled, tileSize]}
							>
								<Image
									source={{ uri: photo.uri }}
									style={styles.thumb}
									resizeMode="cover"
								/>
								<View style={styles.cellShade} pointerEvents="none" />
								<View style={styles.cellBadge}>
									<Text style={styles.cellBadgeText}>{label}</Text>
									{index < 4 ? (
										<Text style={styles.cellBadgeTag}>{t.signup.cardTag}</Text>
									) : null}
								</View>
								<Pressable
									style={styles.removeBtn}
									onPress={() => removePortfolio(index)}
									hitSlop={8}
								>
									<XIcon size={12} color="#fff" strokeWidth={2.6} />
								</Pressable>
							</View>
						);
					})}
					{canAddPortfolio ? (
						<View
							style={[
								styles.cell,
								styles.addCell,
								portfolioTileW > 0
									? { width: portfolioTileW, height: portfolioTileH }
									: null,
							]}
						>
							{busySlot === 'portfolio' ? (
								<ActivityIndicator color={C.accent} />
							) : (
								<>
									<View style={styles.addIconWrap}>
										<ImagePlus size={18} color={C.violetL} strokeWidth={1.8} />
									</View>
									<Text style={styles.addTitle}>{t.signup.addPhotos}</Text>
									<View style={styles.addActions}>
										<Pressable
											style={styles.addBtn}
											onPress={() => void addPortfolio('camera')}
										>
											<Camera size={14} color={C.accent} strokeWidth={2.2} />
											<Text style={styles.addText}>{t.signup.camera}</Text>
										</Pressable>
										<Pressable
											style={styles.addBtn}
											onPress={() => void addPortfolio('gallery')}
										>
											<ImagePlus size={14} color={C.prMuted} strokeWidth={2.2} />
											<Text style={styles.addTextMuted}>{t.signup.gallery}</Text>
										</Pressable>
									</View>
								</>
							)}
						</View>
					) : null}
				</View>
			</View>

			{/* 3. Comcard preview — same 2×2 + overlay as Profile (auto, not uploaded by hand) */}
			<View style={styles.block}>
				<View style={styles.blockHead}>
					<Text style={styles.photoTitle}>{t.signup.comcardPreview}</Text>
					<Text style={styles.optionalPill}>{t.signup.comcardAuto}</Text>
				</View>
				<Text style={styles.photoHint}>{t.signup.comcardHint}</Text>
				<View style={styles.comcardWrap}>
					<View style={styles.comcard}>
						{hasComcardPhotos ? (
							<View style={styles.collage}>
								{comcardPaths.map((uri, idx) =>
									uri ? (
										<Image
											key={`${uri}-${idx}`}
											source={{ uri }}
											style={styles.collageTile}
											resizeMode="cover"
										/>
									) : (
										<View
											key={`empty-${idx}`}
											style={[styles.collageTile, styles.collageTileEmpty]}
										/>
									),
								)}
								<View style={styles.comcardOverlay}>
									<Text style={styles.comcardOverlayName} numberOfLines={1}>
										{displayName.slice(0, 20)}
									</Text>
									<Text style={styles.comcardOverlayStats}>
										{formatMessage(t.signup.ageStat, { age: age || '—' })}
									</Text>
									<Text style={styles.comcardOverlayStats}>
										{height}cm {weight}kg
									</Text>
								</View>
							</View>
						) : (
							<View style={[styles.collage, styles.collageEmpty]}>
								<Text style={styles.collageEmptyText}>{t.signup.comcardEmpty}</Text>
							</View>
						)}
					</View>
				</View>
			</View>

			<Text style={styles.sectionEyebrow}>{t.signup.review}</Text>

			<View style={styles.card}>
				<Text style={styles.cardTitle}>{t.signup.reviewIdentity}</Text>
				<Fact label={t.signup.nationality} value={draft.nationality} />
				<Fact label={draft.idType || 'ID'} value={draft.idNo} />
				<Fact label={t.signup.dob} value={draft.dob} />
				<Fact label={t.signup.email} value={draft.email || '—'} />
				<Fact
					label={t.signup.heightWeight}
					value={`${draft.heightCm || '—'} cm · ${draft.weightKg || '—'} kg`}
				/>
				<Fact
					label={t.signup.bwh}
					value={`${draft.bustCm || '—'} · ${draft.waistCm || '—'} · ${draft.hipCm || '—'} cm`}
				/>
				<Fact
					label={t.signup.languages}
					value={draft.languages.length ? draft.languages.join(', ') : '—'}
				/>
			</View>

			<View style={styles.card}>
				<Text style={styles.cardTitle}>{t.signup.reviewAddress}</Text>
				<Text style={styles.addressText}>{address || '—'}</Text>
			</View>

			<View style={styles.card}>
				<Text style={styles.cardTitle}>{t.signup.reviewAgency}</Text>
				<Fact
					label={t.signup.referral}
					value={
						draft.underAgency === true
							? t.signup.referralYes
							: draft.underAgency === false
								? t.signup.referralNo
								: '—'
					}
				/>
				<Fact
					label={draft.underAgency ? t.signup.addedBy : t.signup.askingToJoin}
					value={agencyName}
				/>
			</View>

			<Text style={styles.sectionEyebrow}>{t.signup.loginPassword}</Text>
			<View style={styles.passwordCard}>
				<Row>
					<Field label={t.signup.password} flex error={fieldErrors.password}>
						<Input
							value={draft.password}
							onChangeText={(text) => {
								clearFieldError('password');
								patch({ password: text });
							}}
							placeholder={t.signup.passwordPlaceholder}
							secureTextEntry
							autoCapitalize="none"
						/>
					</Field>
					<Field label={t.signup.confirmPassword} flex error={fieldErrors.confirm}>
						<Input
							value={draft.confirm}
							onChangeText={(text) => {
								clearFieldError('confirm');
								patch({ confirm: text });
							}}
							placeholder={t.signup.confirmPasswordPlaceholder}
							secureTextEntry
							autoCapitalize="none"
						/>
					</Field>
				</Row>
			</View>

			<Text style={styles.sectionEyebrow}>{t.signup.agreeContinue}</Text>
			<View style={styles.ackCard}>
				{ACK_ROWS.map((row, index) => (
					<View
						key={row.key}
						style={[styles.ackItem, index < ACK_ROWS.length && styles.ackItemBorder]}
					>
						<AckCheck
							checked={draft[row.key]}
							label={t.signup[row.labelKey]}
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
								{t.signup.ackTermsPrefix}
								<Text
									style={styles.ackLink}
									onPress={() => setOpenDisclaimer('terms')}
								>
									{t.signup.ackTermsLink}
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
							<Text style={styles.modalDoneText}>{t.signup.ackDone}</Text>
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
	comcardWrap: {
		alignItems: 'center',
		marginTop: 4,
	},
	comcard: {
		width: '100%',
		maxWidth: 280,
		aspectRatio: 3 / 4,
		borderRadius: 16,
		overflow: 'hidden',
		borderWidth: 1,
		borderColor: C.line2,
		backgroundColor: C.bg2,
	},
	collage: {
		flex: 1,
		flexDirection: 'row',
		flexWrap: 'wrap',
		position: 'relative',
		backgroundColor: C.panel,
	},
	collageTile: { width: '50%', height: '50%' },
	collageTileEmpty: { backgroundColor: C.panel },
	collageEmpty: {
		alignItems: 'center',
		justifyContent: 'center',
		padding: 20,
	},
	collageEmptyText: {
		fontFamily: F.manrope,
		fontSize: 13,
		lineHeight: 18,
		color: C.prMuted,
		textAlign: 'center',
	},
	comcardOverlay: {
		position: 'absolute',
		left: '50%',
		top: '50%',
		transform: [{ translateX: -56 }, { translateY: -36 }],
		width: 112,
		backgroundColor: '#fff',
		paddingVertical: 8,
		paddingHorizontal: 10,
		alignItems: 'center',
	},
	comcardOverlayName: {
		fontFamily: F.sora,
		fontSize: 14,
		fontWeight: '800',
		color: '#111',
	},
	comcardOverlayStats: {
		fontFamily: F.manrope,
		fontSize: 11,
		color: '#333',
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
		justifyContent: 'space-between',
		rowGap: 10,
		marginTop: 4,
	},
	cell: {
		width: '48.5%',
		aspectRatio: 3 / 4,
		borderRadius: 16,
		overflow: 'hidden',
		position: 'relative',
		backgroundColor: C.bg2,
	},
	cellFilled: {
		borderWidth: 1,
		borderColor: 'rgba(227,184,119,0.28)',
	},
	thumb: {
		...StyleSheet.absoluteFillObject,
	},
	cellShade: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		height: 48,
		backgroundColor: 'rgba(20,17,32,0.58)',
	},
	cellBadge: {
		position: 'absolute',
		left: 8,
		bottom: 8,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 5,
	},
	cellBadgeText: {
		fontFamily: F.sora,
		fontSize: 12,
		fontWeight: '800',
		color: C.txt,
		letterSpacing: 0.6,
	},
	cellBadgeTag: {
		fontFamily: F.sora,
		fontSize: 9,
		fontWeight: '700',
		letterSpacing: 0.5,
		color: '#241a08',
		backgroundColor: C.accent,
		paddingHorizontal: 5,
		paddingVertical: 2,
		borderRadius: 5,
		overflow: 'hidden',
		textTransform: 'uppercase',
	},
	removeBtn: {
		position: 'absolute',
		top: 8,
		right: 8,
		width: 26,
		height: 26,
		borderRadius: 13,
		backgroundColor: 'rgba(240,138,138,0.92)',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.2)',
		alignItems: 'center',
		justifyContent: 'center',
	},
	addCell: {
		borderWidth: 1.5,
		borderStyle: 'dashed',
		borderColor: 'rgba(183,156,232,0.4)',
		backgroundColor: 'rgba(183,156,232,0.06)',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 8,
		padding: 10,
	},
	addIconWrap: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: 'rgba(183,156,232,0.14)',
		borderWidth: 1,
		borderColor: 'rgba(183,156,232,0.28)',
		alignItems: 'center',
		justifyContent: 'center',
	},
	addTitle: {
		fontFamily: F.sora,
		fontSize: 12,
		fontWeight: '700',
		color: C.violetL,
	},
	addActions: {
		flexDirection: 'row',
		gap: 8,
		marginTop: 2,
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
