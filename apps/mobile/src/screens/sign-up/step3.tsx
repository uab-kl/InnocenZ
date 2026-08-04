import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { C, F } from '../../theme/theme';
import { IzButton } from '../../components/ui';
import { Check } from '../../components/icons';
import type { PublicAgency } from '../../lib/api';
import { Choice, Field, Input, fieldStyles as styles } from './fields';
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
	return (
		<>
			<Field
				label="Did an agency refer you?"
				hint="Either way, an agency has to add you before you can be given shifts."
				error={fieldErrors.underAgency}
			>
				<View style={styles.inline}>
					<Choice
						label="Yes"
						on={draft.underAgency === true}
						onPress={() => {
							clearFieldError('underAgency');
							clearFieldError('agencyId');
							setAgencySearch('');
							patch({ underAgency: true, agencyId: null });
						}}
					/>
					<Choice
						label="No"
						on={draft.underAgency === false}
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
					label={draft.underAgency ? 'Which agency added you?' : 'Agencies you can ask to join'}
					hint={
						draft.underAgency
							? 'Pick the agency that signed you up.'
							: 'Optional — pick one and they get your request. You can also do this later from Profile.'
					}
					error={fieldErrors.agencyId}
				>
					{agencyState === 'loading' ? <Text style={styles.note}>Loading agencies…</Text> : null}

					{agencyState === 'ready' && agencies.length > 0 ? (
						<View style={{ marginBottom: 10 }}>
							<Input
								value={agencySearch}
								onChangeText={setAgencySearch}
								placeholder="Search agencies"
							/>
						</View>
					) : null}

					{agencyState === 'ready' && visibleAgencies.length > 0 ? (
						<View style={agencyStyles.list}>
							{visibleAgencies.map((a) => (
								<Pressable
									key={a.id}
									onPress={() => {
										clearFieldError('agencyId');
										patch({ agencyId: draft.agencyId === a.id ? null : a.id });
									}}
									style={[agencyStyles.row, draft.agencyId === a.id && agencyStyles.rowOn]}
								>
									<Text
										style={[agencyStyles.name, draft.agencyId === a.id && agencyStyles.nameOn]}
										numberOfLines={1}
									>
										{a.name}
									</Text>
									{draft.agencyId === a.id ? (
										<Check size={15} color={C.accent} strokeWidth={2.6} />
									) : null}
								</Pressable>
							))}
						</View>
					) : null}

					{agencyState === 'ready' && agencies.length === 0 ? (
						<Text style={styles.note}>No agencies are listed yet.</Text>
					) : null}

					{/* Only agencies returned by the backend can be picked, so a
					    fruitless search means the agency genuinely is not on the
					    platform — never a typo the PR can talk their way around. */}
					{agencyState === 'ready' && agencies.length > 0 && visibleAgencies.length === 0 ? (
						<Text style={styles.note}>No agency matches “{agencySearch.trim()}”.</Text>
					) : null}

					{agencyState === 'failed' ? (
						<View>
							<Text style={[styles.note, { marginBottom: 8 }]}>Could not load the agency list.</Text>
							<IzButton label="Try again" variant="soft" small onPress={loadAgencies} />
						</View>
					) : null}
				</Field>
			) : null}

			{draft.underAgency === true &&
			!draft.agencyId &&
			(agencyState === 'failed' ||
				(agencyState === 'ready' && agencies.length > 0 && visibleAgencies.length === 0)) ? (
				<Text style={styles.note}>
					Tell your agency your floor nickname and mobile number — they link you from Manage PR.
				</Text>
			) : null}
			{draft.underAgency === false && draft.agencyId ? (
				<Text style={styles.note}>They still have to accept you before you can be given shifts.</Text>
			) : null}
		</>
	);
}

const agencyStyles = StyleSheet.create({
	list: {
		borderRadius: 14,
		borderWidth: 1,
		borderColor: C.line,
		backgroundColor: C.bg2,
		overflow: 'hidden',
	},
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		gap: 10,
		paddingVertical: 12,
		paddingHorizontal: 14,
		borderBottomWidth: 1,
		borderBottomColor: C.line,
	},
	rowOn: { backgroundColor: 'rgba(227,184,119,0.10)' },
	name: { flex: 1, fontFamily: F.sora, fontSize: 15, fontWeight: '600', color: C.prMuted },
	nameOn: { color: C.accent },
});
