import React from 'react';
import { MY_STATES, NATIONALITY_OPTIONS } from './constants';
import { Field, Input, Picker, Row } from './fields';
import type { Draft, FieldErrors } from './types';

type Props = {
	draft: Draft;
	fieldErrors: FieldErrors;
	patch: (part: Partial<Draft>) => void;
	clearFieldError: (key: keyof FieldErrors) => void;
};

export function Step2Address({ draft, fieldErrors, patch, clearFieldError }: Props) {
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
			<Field label="Address line 2" hint="Optional.">
				<Input
					value={draft.addressLine2}
					onChangeText={(t) => patch({ addressLine2: t })}
					placeholder="Area"
				/>
			</Field>
			<Row>
				<Field label="Postcode*" flex error={fieldErrors.postcode}>
					<Input
						value={draft.postcode}
						onChangeText={(t) => {
							clearFieldError('postcode');
							patch({ postcode: t.replace(/\D/g, '').slice(0, 5) });
						}}
						placeholder="50000"
						keyboardType="number-pad"
					/>
				</Field>
				<Field label="State*" flex error={fieldErrors.state}>
					<Picker
						value={draft.state || null}
						options={MY_STATES}
						onSelect={(v) => {
							clearFieldError('state');
							patch({ state: v });
						}}
						title="State"
						placeholder="Choose"
					/>
				</Field>
			</Row>
			<Field label="Country*" error={fieldErrors.country}>
				<Picker
					value={draft.country || null}
					options={NATIONALITY_OPTIONS}
					onSelect={(v) => {
						clearFieldError('country');
						patch({ country: v });
					}}
					title="Country"
					searchable
					placeholder="Choose"
				/>
			</Field>
		</>
	);
}
