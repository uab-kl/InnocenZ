import type { SignupAccountType } from '@/constants/signup-types'
import { env } from '@/env'

export function getSignupRoleId(accountType: SignupAccountType): string {
	const roleId =
		accountType === 'outlet'
			? env.VITE_OUTLET_ROLE_ID
			: env.VITE_AGENCY_ROLE_ID

	if (!roleId) {
		const envKey =
			accountType === 'outlet'
				? 'VITE_OUTLET_ROLE_ID'
				: 'VITE_AGENCY_ROLE_ID'
		throw new Error(
			`Signup is not configured. Set ${envKey} in your environment.`,
		)
	}

	return roleId
}
