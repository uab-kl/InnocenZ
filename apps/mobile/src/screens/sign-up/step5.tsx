import React from 'react';
import { Text } from 'react-native';
import type { PublicAgency } from '../../lib/api';
import { SummaryRow, fieldStyles as styles } from './fields';
import type { Draft } from './types';

type Props = {
	draft: Draft;
	fullPhone: string;
	agencies: PublicAgency[];
};

export function Step5Summary({ draft, fullPhone, agencies }: Props) {
	return (
		<>
			<SummaryRow label="Floor nickname" value={draft.floorNickname} />
			<SummaryRow label="Legal name" value={`${draft.firstName} ${draft.lastName}`.trim()} />
			<SummaryRow label="Mobile" value={fullPhone} />
			<SummaryRow label="Email" value={draft.email || '—'} />
			<SummaryRow label="Nationality" value={draft.nationality} />
			<SummaryRow label={draft.idType} value={draft.idNo} />
			<SummaryRow label="Date of birth" value={draft.dob} />
			<SummaryRow
				label="Address"
				value={[draft.addressLine1, draft.addressLine2, draft.postcode, draft.state, draft.country]
					.filter(Boolean)
					.join(', ')}
			/>
			<SummaryRow label="Agency referral" value={draft.underAgency ? 'Yes' : 'No'} />
			<SummaryRow
				label={draft.underAgency ? 'Added by' : 'Asking to join'}
				value={agencies.find((a) => a.id === draft.agencyId)?.name || '—'}
			/>
			<Text style={styles.note}>
				Tapping Create account sends a 6-digit code to {fullPhone} on WhatsApp.
			</Text>
		</>
	);
}
