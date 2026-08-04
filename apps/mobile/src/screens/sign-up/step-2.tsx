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
	const country = draft.country.trim();
	const isMalaysia = country === 'Malaysia';
	const stateOptions = country ? [...statesForCountry(country)] : [];
	const stateSet = new Set(stateOptions);

	return (
		<>
			<Field label="Address line 1*" error={fieldErrors.addressLine1}>
				<Input
					value={draft.addressLine1}
					onChangeText={(t) => {
						clearFieldError('addressLine1');
						patch({ addressLine1: t });
					}}
					placeholder="Unit, street"
				/>
			</Field>
			<Field label="Address line 2">
				<Input
					value={draft.addressLine2}
					onChangeText={(t) => patch({ addressLine2: t })}
					placeholder="Area"
				/>
			</Field>
			<Field label="City*" error={fieldErrors.city}>
				<Input
					value={draft.city}
					onChangeText={(t) => {
						clearFieldError('city');
						patch({ city: t });
					}}
					placeholder="City"
					autoCapitalize="words"
				/>
			</Field>
			<Field label="Country*" error={fieldErrors.country}>
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
					title="Country"
					searchable
					placeholder="Choose"
				/>
			</Field>
			<Field
				label={isMalaysia ? 'State*' : 'State / province*'}
				error={fieldErrors.state}
				hint={!country ? 'Choose a country first — the list depends on it.' : undefined}
			>
				{!country ? (
					<Input value="" editable={false} placeholder="Choose country first" />
				) : stateOptions.length > 0 ? (
					<Picker
						key={country}
						value={stateSet.has(draft.state) ? draft.state : null}
						options={stateOptions}
						onSelect={(v) => {
							clearFieldError('state');
							patch({ state: v });
						}}
						title={isMalaysia ? 'State' : 'State / province'}
						placeholder="Choose"
						searchable={stateOptions.length > 12}
					/>
				) : (
					<Input
						value={draft.state}
						onChangeText={(t) => {
							clearFieldError('state');
							patch({ state: t });
						}}
						placeholder="State or province"
						autoCapitalize="words"
					/>
				)}
			</Field>
			<Field
				label="Postcode*"
				error={fieldErrors.postcode}
			>
				{!country ? (
					<Input value="" editable={false} placeholder="Choose country first" />
				) : (
					<Input
						key={`postcode-${country}`}
						value={draft.postcode}
						onChangeText={(t) => {
							clearFieldError('postcode');
							patch({ postcode: sanitizePostcode(country, t) });
						}}
						placeholder={isMalaysia ? '50000' : 'Postcode'}
						keyboardType={isMalaysia ? 'number-pad' : 'default'}
					/>
				)}
			</Field>
		</>
	);
}
