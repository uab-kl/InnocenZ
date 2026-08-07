import React, { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatMessage, useLocale } from '../../i18n';
import { C, F } from '../../theme/theme';
import { IzButton } from '../../components/ui';
import { Building2, Check, Search, UserIcon } from '../../components/icons';
import { assetUrl, type PublicAgency } from '../../lib/api';
import { Field, fieldStyles as styles } from './fields';
import { reportFocusFromView, useKeyboardScroll } from './keyboard-scroll';
import type { Draft, FieldErrors } from './types';

type AgencyState = 'idle' | 'loading' | 'ready' | 'failed';

type Props = {
	draft: Draft;
	fieldErrors: FieldErrors;
	patch: (part: Partial<Draft>) => void;
	clearFieldError: (key: keyof FieldErrors) => void;
	agencies: PublicAgency[];
	visibleAgencies: PublicAgency[];
	agencyState: AgencyState;
	agencySearch: string;
	setAgencySearch: (v: string) => void;
	loadAgencies: () => void;
};

/** Agency list thumb — paints `logoUrl` from `agency/{id}/logo/…` on the CDN. */
function AgencyLogo({
	logoUrl,
	logoImage,
	name,
	selected,
}: {
	logoUrl?: string | null;
	logoImage?: string | null;
	name: string;
	selected: boolean;
}) {
	const uri = (logoUrl || assetUrl(logoImage) || '').trim() || null;
	const [broken, setBroken] = useState(false);
	React.useEffect(() => {
		setBroken(false);
	}, [uri]);
	const show = Boolean(uri) && !broken;
	const initial = name.trim().charAt(0).toUpperCase() || '?';
	return (
		<View style={[agencyStyles.avatar, selected && agencyStyles.avatarOn]}>
			{show ? (
				<Image
					key={uri!}
					source={{ uri: uri! }}
					style={agencyStyles.avatarImg}
					resizeMode="cover"
					onError={() => setBroken(true)}
				/>
			) : (
				<Text style={[agencyStyles.avatarInitial, selected && agencyStyles.avatarInitialOn]}>
					{initial}
				</Text>
			)}
		</View>
	);
}

function PathCard({
	title,
	body,
	icon: Icon,
	on,
	onPress,
}: {
	title: string;
	body: string;
	icon: typeof Building2;
	on: boolean;
	onPress: () => void;
}) {
	return (
		<Pressable
			onPress={onPress}
			style={[pathStyles.card, on && pathStyles.cardOn]}
			accessibilityRole="button"
			accessibilityState={{ selected: on }}
		>
			<View style={[pathStyles.iconWrap, on && pathStyles.iconWrapOn]}>
				<Icon size={18} color={on ? C.accent : C.prMuted} strokeWidth={2.1} />
			</View>
			<View style={pathStyles.copy}>
				<Text style={[pathStyles.title, on && pathStyles.titleOn]}>{title}</Text>
				<Text style={pathStyles.body}>{body}</Text>
			</View>
			<View style={[pathStyles.radio, on && pathStyles.radioOn]}>
				{on ? <View style={pathStyles.radioDot} /> : null}
			</View>
		</Pressable>
	);
}

export function Step3Agency({
	draft,
	fieldErrors,
	patch,
	clearFieldError,
	agencies,
	visibleAgencies,
	agencyState,
	agencySearch,
	setAgencySearch,
	loadAgencies,
}: Props) {
	const { t } = useLocale();
	const referred = draft.underAgency === true;
	const independent = draft.underAgency === false;
	const searchWrapRef = useRef<View>(null);
	const keyboardScroll = useKeyboardScroll();

	return (
		<>
			<Field
				label={t.signup.joiningHow}
				hint={t.signup.joiningHint}
				error={fieldErrors.underAgency}
			>
				<View style={pathStyles.stack}>
					<PathCard
						title={t.signup.pickAgency}
						body=""
						icon={Building2}
						on={referred}
						onPress={() => {
							clearFieldError('underAgency');
							clearFieldError('agencyId');
							setAgencySearch('');
							patch({ underAgency: true, agencyId: null });
						}}
					/>
					<PathCard
						title={t.signup.joiningOwn}
						body=""
						icon={UserIcon}
						on={independent}
						onPress={() => {
							clearFieldError('underAgency');
							clearFieldError('agencyId');
							setAgencySearch('');
							patch({ underAgency: false, agencyId: null });
						}}
					/>
				</View>
			</Field>

			{draft.underAgency !== null ? (
				<Field
					label={referred ? t.signup.whichAgency : t.signup.askAgency}
					error={fieldErrors.agencyId}
				>
					{agencyState === 'loading' ? (
						<View style={agencyStyles.emptyBox}>
							<Text style={styles.note}>{t.signup.loadingAgencies}</Text>
						</View>
					) : null}

					{agencyState === 'ready' && agencies.length > 0 ? (
						<View ref={searchWrapRef} style={agencyStyles.searchWrap}>
							<Search size={16} color={C.muted2} strokeWidth={2.2} />
							<TextInput
								value={agencySearch}
								onChangeText={setAgencySearch}
								placeholder={t.signup.searchAgency}
								placeholderTextColor={C.muted2}
								style={agencyStyles.searchInput}
								autoCapitalize="none"
								autoCorrect={false}
								onFocus={() => {
									const reveal = () =>
										reportFocusFromView(
											searchWrapRef.current,
											keyboardScroll?.ensureVisible,
										);
									reveal();
									setTimeout(reveal, 120);
									setTimeout(reveal, 360);
								}}
							/>
						</View>
					) : null}

					{agencyState === 'ready' && visibleAgencies.length > 0 ? (
						<View style={agencyStyles.list}>
							{visibleAgencies.map((a, i) => {
								const on = draft.agencyId === a.id;
								const last = i === visibleAgencies.length - 1;
								return (
									<Pressable
										key={a.id}
										onPress={() => {
											clearFieldError('agencyId');
											patch({ agencyId: on ? null : a.id });
										}}
										style={[
											agencyStyles.row,
											on && agencyStyles.rowOn,
											last && agencyStyles.rowLast,
										]}
									>
										<AgencyLogo
											logoUrl={a.logoUrl}
											logoImage={a.logoImage}
											name={a.name}
											selected={on}
										/>
										<Text
											style={[agencyStyles.name, on && agencyStyles.nameOn]}
											numberOfLines={1}
										>
											{a.name}
										</Text>
										<View style={[agencyStyles.check, on && agencyStyles.checkOn]}>
											{on ? <Check size={12} color={C.bg} strokeWidth={3} /> : null}
										</View>
									</Pressable>
								);
							})}
						</View>
					) : null}

					{agencyState === 'ready' && agencies.length === 0 ? (
						<View style={agencyStyles.emptyBox}>
							<Text style={styles.note}>{t.signup.noAgencies}</Text>
						</View>
					) : null}

					{agencyState === 'ready' && agencies.length > 0 && visibleAgencies.length === 0 ? (
						<View style={agencyStyles.emptyBox}>
							<Text style={styles.note}>
								{formatMessage(t.signup.noAgencyMatch, { q: agencySearch.trim() })}
							</Text>
						</View>
					) : null}

					{agencyState === 'failed' ? (
						<View style={agencyStyles.emptyBox}>
							<Text style={[styles.note, { marginBottom: 10 }]}>
								{t.signup.agencyLoadFailed}
							</Text>
							<IzButton
								label={t.signup.tryAgain}
								variant="soft"
								small
								onPress={loadAgencies}
							/>
						</View>
					) : null}
				</Field>
			) : null}

			{referred &&
			!draft.agencyId &&
			(agencyState === 'failed' ||
				(agencyState === 'ready' && agencies.length > 0 && visibleAgencies.length === 0)) ? (
				<View style={agencyStyles.callout}>
					<Text style={agencyStyles.calloutText}>
						{t.signup.agencyCalloutReferred}
					</Text>
				</View>
			) : null}
			{independent && draft.agencyId ? (
				<View style={agencyStyles.callout}>
					<Text style={agencyStyles.calloutText}>
						{t.signup.agencyCalloutIndependent}
					</Text>
				</View>
			) : null}
		</>
	);
}

const pathStyles = StyleSheet.create({
	stack: { gap: 10 },
	card: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		paddingVertical: 14,
		paddingHorizontal: 14,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: C.line,
		backgroundColor: C.panel,
	},
	cardOn: {
		borderColor: 'rgba(227,184,119,0.55)',
		backgroundColor: 'rgba(227,184,119,0.08)',
	},
	iconWrap: {
		width: 40,
		height: 40,
		borderRadius: 12,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: C.glass2,
		borderWidth: 1,
		borderColor: C.line,
	},
	iconWrapOn: {
		backgroundColor: 'rgba(227,184,119,0.14)',
		borderColor: 'rgba(227,184,119,0.35)',
	},
	copy: { flex: 1, gap: 3 },
	title: {
		fontFamily: F.sora,
		fontSize: 15,
		fontWeight: '700',
		color: C.txt,
	},
	titleOn: { color: C.accentL },
	body: {
		fontFamily: F.manrope,
		fontSize: 12,
		lineHeight: 16,
		color: C.muted2,
	},
	radio: {
		width: 20,
		height: 20,
		borderRadius: 10,
		borderWidth: 1.5,
		borderColor: C.line2,
		alignItems: 'center',
		justifyContent: 'center',
	},
	radioOn: { borderColor: C.accent },
	radioDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		backgroundColor: C.accent,
	},
});

const agencyStyles = StyleSheet.create({
	searchWrap: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 10,
		marginBottom: 10,
		paddingHorizontal: 12,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: C.line,
		backgroundColor: C.bg2,
		minHeight: 48,
	},
	searchInput: {
		flex: 1,
		fontFamily: F.manrope,
		fontSize: 15,
		color: C.txt,
		paddingVertical: 12,
		paddingHorizontal: 0,
	},
	list: {
		borderRadius: 16,
		borderWidth: 1,
		borderColor: C.line,
		backgroundColor: C.panel,
		overflow: 'hidden',
	},
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		paddingVertical: 12,
		paddingHorizontal: 12,
		borderBottomWidth: 1,
		borderBottomColor: C.line,
	},
	rowLast: { borderBottomWidth: 0 },
	rowOn: { backgroundColor: 'rgba(227,184,119,0.08)' },
	avatar: {
		width: 34,
		height: 34,
		borderRadius: 10,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: C.glass2,
		borderWidth: 1,
		borderColor: C.line,
		overflow: 'hidden',
		position: 'relative',
	},
	avatarImg: {
		width: 34,
		height: 34,
	},
	avatarOn: {
		backgroundColor: 'rgba(227,184,119,0.14)',
		borderColor: 'rgba(227,184,119,0.35)',
	},
	avatarInitial: {
		fontFamily: F.sora,
		fontSize: 14,
		fontWeight: '700',
		color: C.prMuted,
	},
	avatarInitialOn: { color: C.accent },
	name: { flex: 1, fontFamily: F.sora, fontSize: 15, fontWeight: '600', color: C.prMuted },
	nameOn: { color: C.accentL },
	check: {
		width: 22,
		height: 22,
		borderRadius: 11,
		borderWidth: 1.5,
		borderColor: C.line2,
		alignItems: 'center',
		justifyContent: 'center',
	},
	checkOn: {
		borderColor: C.accent,
		backgroundColor: C.accent,
	},
	emptyBox: {
		paddingVertical: 16,
		paddingHorizontal: 14,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: C.line,
		borderStyle: 'dashed',
		backgroundColor: C.glass,
	},
	callout: {
		marginTop: 4,
		marginBottom: 8,
		paddingVertical: 12,
		paddingHorizontal: 14,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: 'rgba(183,156,232,0.28)',
		backgroundColor: C.violetInk,
	},
	calloutText: {
		fontFamily: F.manrope,
		fontSize: 13,
		lineHeight: 18,
		color: C.violetL,
	},
});
