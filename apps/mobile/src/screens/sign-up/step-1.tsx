import React from 'react';
import { View } from 'react-native';
import { useLocale } from '../../i18n';
import { PR_LANGUAGE_OPTIONS } from '../../lib/demo-services';
import { savePhoneCountryCode } from '../../lib/phone-prefs';
import {
	COUNTRY_BY_CODE,
	COUNTRY_DIAL_OPTIONS,
	ID_TYPES,
	NATIONALITY_OPTIONS,
} from './constants';
import {
	Field,
	Input,
	Picker,
	DatePicker,
	Row,
	LanguageMultiPicker,
	fieldStyles as styles,
} from './fields';
import { mergeNricWithDob, type Draft, type FieldErrors, type IdType } from './types';

type Props = {
	draft: Draft;
	localDigits: string;
	fieldErrors: FieldErrors;
	patch: (part: Partial<Draft>) => void;
	clearFieldError: (key: keyof FieldErrors) => void;
};

const DIAL_PICKER_OPTIONS = COUNTRY_DIAL_OPTIONS.map((c) => ({
	value: c.countryCode,
	label: c.label,
	flag: c.flag,
	name: c.name,
	meta: c.dialCode,
}));

export function Step1Persona({
	draft,
	localDigits,
	fieldErrors,
	patch,
	clearFieldError,
}: Props) {
	const { t } = useLocale();
	const s = t.signup;
	const country = draft.phoneCountryCode
		? COUNTRY_BY_CODE[draft.phoneCountryCode]
		: null;
	const closedDialLabel = country
		? `${country.flag ? `${country.flag} ` : ''}${country.dialCode}`
		: null;

	return (
		<>
			<Field label={s.nickname} hint={s.nicknameHint} error={fieldErrors.floorNickname}>
				<Input
					value={draft.floorNickname}
					onChangeText={(text) => {
						clearFieldError('floorNickname');
						patch({ floorNickname: text.slice(0, 20) });
					}}
					placeholder={s.nicknamePlaceholder}
				/>
			</Field>
			<Field label={s.fullName} hint={s.fullNameHint} error={fieldErrors.fullName}>
				<Input
					value={draft.fullName}
					onChangeText={(text) => {
						clearFieldError('fullName');
						patch({ fullName: text });
					}}
					placeholder={s.fullNamePlaceholder}
					autoCapitalize="words"
				/>
			</Field>
			<Field
				label={s.phoneNumber}
				hint={s.phoneHint}
				error={fieldErrors.phoneCountryCode || fieldErrors.phone}
			>
				<View style={styles.inline}>
					<Picker
						value={draft.phoneCountryCode}
						options={DIAL_PICKER_OPTIONS}
						onSelect={(countryCode) => {
							clearFieldError('phoneCountryCode');
							patch({ phoneCountryCode: countryCode });
							savePhoneCountryCode(countryCode);
						}}
						width={128}
						placeholder={s.dialCode}
						displayValue={closedDialLabel}
						title={s.dialTitle}
						searchable
					/>
					<View style={{ flex: 1 }}>
						<Input
							value={localDigits}
							onChangeText={(text) => {
								clearFieldError('phone');
								patch({ phoneNumber: text });
							}}
							placeholder={s.phonePlaceholder}
							keyboardType="phone-pad"
						/>
					</View>
				</View>
			</Field>
			<Field label={s.email}>
				<Input
					value={draft.email}
					onChangeText={(text) => patch({ email: text })}
					placeholder={s.emailPlaceholder}
					keyboardType="email-address"
					autoCapitalize="none"
				/>
			</Field>
			<Field label={s.nationality} error={fieldErrors.nationality}>
				<Picker
					value={draft.nationality || null}
					options={NATIONALITY_OPTIONS}
					onSelect={(v) => {
						clearFieldError('nationality');
						patch({ nationality: v });
					}}
					title={s.nationality}
					searchable
					placeholder={s.choose}
				/>
			</Field>
			<Row>
				<Field label={s.idType} flex error={fieldErrors.idType}>
					<Picker
						value={draft.idType || null}
						options={[...ID_TYPES]}
						onSelect={(v) => {
							const idType = v as IdType;
							clearFieldError('idType');
							clearFieldError('idNo');
							patch({
								idType,
								idNo:
									idType === 'NRIC' && draft.dob
										? mergeNricWithDob(draft.dob, draft.idNo)
										: draft.idNo,
								idPhotoFrontUri: '',
								idPhotoBackUri: '',
								idPhotoFrontFile: null,
								idPhotoBackFile: null,
								idFrontOcrOk: false,
								idBackOcrOk: idType === 'Passport',
							});
						}}
						title={s.idType}
						placeholder={s.choose}
					/>
				</Field>
				<Field label={s.dob} flex error={fieldErrors.dob}>
					<DatePicker
						value={draft.dob}
						onSelect={(dob) => {
							clearFieldError('dob');
							patch({
								dob,
								idNo:
									draft.idType === 'NRIC'
										? mergeNricWithDob(dob, draft.idNo)
										: draft.idNo,
							});
						}}
						placeholder={s.dobPlaceholder}
						title={s.dob}
					/>
				</Field>
			</Row>
			<Field label={s.idNo} error={fieldErrors.idNo}>
				<Input
					value={draft.idType ? draft.idNo : ''}
					editable={Boolean(draft.idType)}
					keyboardType={draft.idType === 'NRIC' ? 'number-pad' : 'default'}
					maxLength={draft.idType === 'NRIC' ? 12 : undefined}
					onChangeText={(text) => {
						clearFieldError('idNo');
						patch({
							idNo:
								draft.idType === 'NRIC'
									? mergeNricWithDob(draft.dob, text)
									: text,
						});
					}}
					placeholder={
						draft.idType
							? draft.idType === 'NRIC'
								? s.idNoNricPlaceholder
								: s.idNoDocPlaceholder
							: s.idNoSelectTypeFirst
					}
				/>
			</Field>
			<Row>
				<Field label={s.height} flex error={fieldErrors.heightCm}>
					<Input
						value={draft.heightCm}
						onChangeText={(text) => {
							clearFieldError('heightCm');
							patch({ heightCm: text.replace(/\D/g, '').slice(0, 3) });
						}}
						placeholder={s.inCm}
						keyboardType="number-pad"
					/>
				</Field>
				<Field label={s.weight} flex error={fieldErrors.weightKg}>
					<Input
						value={draft.weightKg}
						onChangeText={(text) => {
							clearFieldError('weightKg');
							patch({ weightKg: text.replace(/\D/g, '').slice(0, 3) });
						}}
						placeholder={s.inKg}
						keyboardType="number-pad"
					/>
				</Field>
			</Row>
			<Field
				label={s.bwh}
				hint={s.bwhHint}
				error={
					fieldErrors.bustCm || fieldErrors.waistCm || fieldErrors.hipCm || null
				}
			>
				<View style={styles.inline}>
					<View style={{ flex: 1 }}>
						<Input
							value={draft.bustCm}
							onChangeText={(text) => {
								clearFieldError('bustCm');
								patch({ bustCm: text.replace(/\D/g, '').slice(0, 3) });
							}}
							placeholder={s.bust}
							keyboardType="number-pad"
						/>
					</View>
					<View style={{ flex: 1 }}>
						<Input
							value={draft.waistCm}
							onChangeText={(text) => {
								clearFieldError('waistCm');
								patch({ waistCm: text.replace(/\D/g, '').slice(0, 3) });
							}}
							placeholder={s.waist}
							keyboardType="number-pad"
						/>
					</View>
					<View style={{ flex: 1 }}>
						<Input
							value={draft.hipCm}
							onChangeText={(text) => {
								clearFieldError('hipCm');
								patch({ hipCm: text.replace(/\D/g, '').slice(0, 3) });
							}}
							placeholder={s.hip}
							keyboardType="number-pad"
						/>
					</View>
				</View>
			</Field>
			<Field label={s.preferredLanguages} error={fieldErrors.languages}>
				<LanguageMultiPicker
					value={draft.languages}
					options={PR_LANGUAGE_OPTIONS}
					onChange={(languages) => {
						clearFieldError('languages');
						patch({ languages });
					}}
				/>
			</Field>
		</>
	);
}
