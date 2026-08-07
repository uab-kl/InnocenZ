import { useLocale } from '../../i18n';
import { COUNTRY_OPTIONS, statesForCountry } from './constants';
import { Field, Input, Picker } from './fields';
import type { Draft, FieldErrors } from './types';

type Props = {
	draft: Draft;
	fieldErrors: FieldErrors;
	patch: (part: Partial<Draft>) => void;
	clearFieldError: (key: keyof FieldErrors) => void;
};

function sanitizePostcode(country: string, raw: string) {
	if (country === 'Malaysia') return raw.replace(/\D/g, '').slice(0, 5);
	return raw.replace(/[^\dA-Za-z\- ]/g, '').slice(0, 12);
}

export function Step2Address({ draft, fieldErrors, patch, clearFieldError }: Props) {
	const { t } = useLocale();
	const s = t.signup;
	const country = draft.country.trim();
	const isMalaysia = country === 'Malaysia';
	const stateOptions = country ? [...statesForCountry(country)] : [];
	const stateSet = new Set(stateOptions);

	return (
		<>
			<Field label={s.addressLine1} error={fieldErrors.addressLine1}>
				<Input
					value={draft.addressLine1}
					onChangeText={(text) => {
						clearFieldError('addressLine1');
						patch({ addressLine1: text });
					}}
					placeholder={s.addressLine1Placeholder}
				/>
			</Field>
			<Field label={s.addressLine2}>
				<Input
					value={draft.addressLine2}
					onChangeText={(text) => patch({ addressLine2: text })}
					placeholder={s.addressLine2Placeholder}
				/>
			</Field>
			<Field label={s.city} error={fieldErrors.city}>
				<Input
					value={draft.city}
					onChangeText={(text) => {
						clearFieldError('city');
						patch({ city: text });
					}}
					placeholder={s.cityPlaceholder}
					autoCapitalize="words"
				/>
			</Field>
			<Field label={s.country} error={fieldErrors.country}>
				<Picker
					value={country || null}
					options={COUNTRY_OPTIONS}
					onSelect={(v) => {
						clearFieldError('country');
						clearFieldError('state');
						clearFieldError('postcode');
						const nextStates = new Set(statesForCountry(v));
						patch({
							country: v,
							state: nextStates.has(draft.state) ? draft.state : '',
							postcode: sanitizePostcode(v, draft.postcode),
						});
					}}
					title={s.country}
					searchable
					placeholder={s.choose}
				/>
			</Field>
			<Field
				label={isMalaysia ? s.state : s.stateProvince}
				error={fieldErrors.state}
				hint={!country ? s.stateHintNeedCountry : undefined}
			>
				{!country ? (
					<Input value="" editable={false} placeholder={s.chooseCountryFirst} />
				) : stateOptions.length > 0 ? (
					<Picker
						key={country}
						value={stateSet.has(draft.state) ? draft.state : null}
						options={stateOptions}
						onSelect={(v) => {
							clearFieldError('state');
							patch({ state: v });
						}}
						title={isMalaysia ? s.state : s.stateProvince}
						placeholder={s.choose}
						searchable={stateOptions.length > 12}
					/>
				) : (
					<Input
						value={draft.state}
						onChangeText={(text) => {
							clearFieldError('state');
							patch({ state: text });
						}}
						placeholder={s.stateOrProvincePlaceholder}
						autoCapitalize="words"
					/>
				)}
			</Field>
			<Field label={s.postcode} error={fieldErrors.postcode}>
				{!country ? (
					<Input value="" editable={false} placeholder={s.chooseCountryFirst} />
				) : (
					<Input
						key={`postcode-${country}`}
						value={draft.postcode}
						onChangeText={(text) => {
							clearFieldError('postcode');
							patch({ postcode: sanitizePostcode(country, text) });
						}}
						placeholder={isMalaysia ? '50000' : s.postcodePlaceholder}
						keyboardType={isMalaysia ? 'number-pad' : 'default'}
					/>
				)}
			</Field>
		</>
	);
}
