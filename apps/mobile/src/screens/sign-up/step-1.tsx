import React from 'react';
import { View } from 'react-native';
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
	const country = draft.phoneCountryCode
		? COUNTRY_BY_CODE[draft.phoneCountryCode]
		: null;
	const closedDialLabel = country
		? `${country.flag ? `${country.flag} ` : ''}${country.dialCode}`
		: null;

	return (
		<>
			<Field
				label="Nickname*"
				hint="Shown on roster and the outlet floor."
				error={fieldErrors.floorNickname}
			>
				<Input
					value={draft.floorNickname}
					onChangeText={(t) => {
						clearFieldError('floorNickname');
						patch({ floorNickname: t.slice(0, 20) });
					}}
					placeholder="E.g. Moon, Charlotte"
				/>
			</Field>
			<Row>
				<Field label="First name*" flex error={fieldErrors.firstName}>
					<Input
						value={draft.firstName}
						onChangeText={(t) => {
							clearFieldError('firstName');
							patch({ firstName: t });
						}}
						placeholder="E.g. Joe"
						autoCapitalize="words"
					/>
				</Field>
				<Field label="Last name*" flex error={fieldErrors.lastName}>
					<Input
						value={draft.lastName}
						onChangeText={(t) => {
							clearFieldError('lastName');
							patch({ lastName: t });
						}}
						placeholder="E.g. Low"
						autoCapitalize="words"
					/>
				</Field>
			</Row>
			<Field
				label="Phone number*"
				hint="Must registered on WhatsApp"
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
						placeholder="Code"
						displayValue={closedDialLabel}
						title="Country & dial code"
						searchable
					/>
					<View style={{ flex: 1 }}>
						<Input
							value={localDigits}
							onChangeText={(t) => {
								clearFieldError('phone');
								patch({ phoneNumber: t });
							}}
							placeholder="E.g. 123456789"
							keyboardType="phone-pad"
						/>
					</View>
				</View>
			</Field>
			<Field label="Email">
				<Input
					value={draft.email}
					onChangeText={(t) => patch({ email: t })}
					placeholder="you@example.com"
					keyboardType="email-address"
					autoCapitalize="none"
				/>
			</Field>
			<Field label="Nationality*" error={fieldErrors.nationality}>
				<Picker
					value={draft.nationality || null}
					options={NATIONALITY_OPTIONS}
					onSelect={(v) => {
						clearFieldError('nationality');
						patch({ nationality: v });
					}}
					title="Nationality"
					searchable
					placeholder="Choose"
				/>
			</Field>
			<Row>
				<Field label="ID type*" flex error={fieldErrors.idType}>
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
								// Changing ID type invalidates prior captures; passport needs no back.
								idPhotoFrontUri: '',
								idPhotoBackUri: '',
								idPhotoFrontFile: null,
								idPhotoBackFile: null,
								idFrontOcrOk: false,
								idBackOcrOk: idType === 'Passport',
							});
						}}
						title="ID type"
						placeholder="Choose"
					/>
				</Field>
				<Field label="Date of birth*" flex error={fieldErrors.dob}>
					<DatePicker
						value={draft.dob}
						onSelect={(dob) => {
							clearFieldError('dob');
							patch({
								dob,
								idNo: draft.idType === 'NRIC' ? mergeNricWithDob(dob, draft.idNo) : draft.idNo,
							});
						}}
						placeholder="YYYY-MM-DD"
						title="Date of birth"
					/>
				</Field>
			</Row>
			<Field
				label="ID No*"
				error={fieldErrors.idNo}
			>
				<Input
					value={draft.idType ? draft.idNo : ''}
					editable={Boolean(draft.idType)}
					keyboardType={draft.idType === 'NRIC' ? 'number-pad' : 'default'}
					maxLength={draft.idType === 'NRIC' ? 12 : undefined}
					onChangeText={(t) => {
						clearFieldError('idNo');
						patch({ idNo: draft.idType === 'NRIC' ? mergeNricWithDob(draft.dob, t) : t });
					}}
					placeholder={
						draft.idType
							? draft.idType === 'NRIC'
								? '1234881234'
								: 'Document number'
							: 'Please select ID type first'
					}
				/>
			</Field>
			<Row>
				<Field label="Height" flex error={fieldErrors.heightCm}>
					<Input
						value={draft.heightCm}
						onChangeText={(t) => {
							clearFieldError('heightCm');
							patch({ heightCm: t.replace(/\D/g, '').slice(0, 3) });
						}}
						placeholder="in cm"
						keyboardType="number-pad"
					/>
				</Field>
				<Field label="Weight" flex error={fieldErrors.weightKg}>
					<Input
						value={draft.weightKg}
						onChangeText={(t) => {
							clearFieldError('weightKg');
							patch({ weightKg: t.replace(/\D/g, '').slice(0, 3) });
						}}
						placeholder="in kg"
						keyboardType="number-pad"
					/>
				</Field>
			</Row>
			<Field
				label="3 dimensions (BWH)"
				hint="Optional — Bust · Waist · Hip in cm"
				error={
					fieldErrors.bustCm || fieldErrors.waistCm || fieldErrors.hipCm || null
				}
			>
				<View style={styles.inline}>
					<View style={{ flex: 1 }}>
						<Input
							value={draft.bustCm}
							onChangeText={(t) => {
								clearFieldError('bustCm');
								patch({ bustCm: t.replace(/\D/g, '').slice(0, 3) });
							}}
							placeholder="Bust"
							keyboardType="number-pad"
						/>
					</View>
					<View style={{ flex: 1 }}>
						<Input
							value={draft.waistCm}
							onChangeText={(t) => {
								clearFieldError('waistCm');
								patch({ waistCm: t.replace(/\D/g, '').slice(0, 3) });
							}}
							placeholder="Waist"
							keyboardType="number-pad"
						/>
					</View>
					<View style={{ flex: 1 }}>
						<Input
							value={draft.hipCm}
							onChangeText={(t) => {
								clearFieldError('hipCm');
								patch({ hipCm: t.replace(/\D/g, '').slice(0, 3) });
							}}
							placeholder="Hip"
							keyboardType="number-pad"
						/>
					</View>
				</View>
			</Field>
			<Field
				label="Preferred languages*"
				error={fieldErrors.languages}
			>
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
