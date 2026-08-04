import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { C, F } from '../../theme/theme';
import { IzButton } from '../../components/ui';
import { Building2, Check, Search, UserIcon } from '../../components/icons';
import type { PublicAgency } from '../../lib/api';
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
	const referred = draft.underAgency === true;
	const independent = draft.underAgency === false;
	const searchWrapRef = useRef<View>(null);
	const keyboardScroll = useKeyboardScroll();

	return (
		<>
			<Field
				label="How are you joining?*"
				hint="An agency still has to add you before you can be given shifts."
				error={fieldErrors.underAgency}
			>
				<View style={pathStyles.stack}>
					<PathCard
						title="Pick an agency"
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
						title="Joining on my own"
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
					label={referred ? 'Which agency added you?* ' : 'Ask an agency to accept you'}
					
					error={fieldErrors.agencyId}
				>
					{agencyState === 'loading' ? (
						<View style={agencyStyles.emptyBox}>
							<Text style={styles.note}>Loading agencies…</Text>
						</View>
					) : null}

					{agencyState === 'ready' && agencies.length > 0 ? (
						<View ref={searchWrapRef} style={agencyStyles.searchWrap}>
							<Search size={16} color={C.muted2} strokeWidth={2.2} />
							<TextInput
								value={agencySearch}
								onChangeText={setAgencySearch}
								placeholder="Search by agency name"
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
										<View style={[agencyStyles.avatar, on && agencyStyles.avatarOn]}>
											<Building2 size={15} color={on ? C.accent : C.prMuted} strokeWidth={2.1} />
										</View>
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
							<Text style={styles.note}>No agencies are listed yet.</Text>
						</View>
					) : null}

					{agencyState === 'ready' && agencies.length > 0 && visibleAgencies.length === 0 ? (
						<View style={agencyStyles.emptyBox}>
							<Text style={styles.note}>No agency matches “{agencySearch.trim()}”.</Text>
						</View>
					) : null}

					{agencyState === 'failed' ? (
						<View style={agencyStyles.emptyBox}>
							<Text style={[styles.note, { marginBottom: 10 }]}>
								Could not load the agency list.
							</Text>
							<IzButton label="Try again" variant="soft" small onPress={loadAgencies} />
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
						Tell your agency your floor nickname and mobile number — they link you from Manage PR.
					</Text>
				</View>
			) : null}
			{independent && draft.agencyId ? (
				<View style={agencyStyles.callout}>
					<Text style={agencyStyles.calloutText}>
						They still have to accept you before you can be given shifts.
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
	},
	avatarOn: {
		backgroundColor: 'rgba(227,184,119,0.14)',
		borderColor: 'rgba(227,184,119,0.35)',
	},
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
