/**
 * Public account-deletion instructions for Google Play / App Store review.
 * Live URL: /delete-account
 */

import {
	PRIVACY_CONTACT_LABEL,
	PRIVACY_CONTACT_WHATSAPP,
} from "@/lib/legal/privacy-policy"

export const DELETE_ACCOUNT_EFFECTIVE_DATE = "7 August 2026"
export const DELETE_ACCOUNT_LAST_UPDATED = "7 August 2026"

export type DeleteAccountSection = {
	id: string
	title: string
	paragraphs: string[]
	bullets?: string[]
}

export const deleteAccountIntro =
	"InnocenZ lets PR (promoter / host) users delete their account from the mobile app. This page explains how deletion works, what is removed, and what may be retained for legal or payroll reasons — as required by Google Play and Apple App Store account-deletion policies."

export const deleteAccountSections: DeleteAccountSection[] = [
	{
		id: "in-app",
		title: "1. Delete from the InnocenZ PR app (recommended)",
		paragraphs: [
			"If you have the InnocenZ PR mobile app installed and can sign in:",
		],
		bullets: [
			"Open the app and sign in with your phone number and password.",
			"Go to Profile → Security (or Account security).",
			"Tap Delete account.",
			"Enter your current password and confirm Delete my account.",
			"Your account is soft-deleted immediately: you are signed out and can no longer sign in.",
		],
	},
	{
		id: "web-request",
		title: "2. Request deletion without the app",
		paragraphs: [
			"If you cannot use the app (for example you uninstalled it or lost access), contact us and ask for account deletion. We will verify that you own the account before processing.",
		],
		bullets: [
			`Contact InnocenZ support on WhatsApp: ${PRIVACY_CONTACT_LABEL}.`,
			"Include the phone number registered on your InnocenZ account and a short request to delete the account.",
			"We aim to complete verified requests within a reasonable time (typically within 30 days).",
		],
	},
	{
		id: "what-removed",
		title: "3. What is deleted or removed",
		paragraphs: [
			"When deletion is completed (in-app or via support), we soft-delete the account and scrub personal profile data:",
		],
		bullets: [
			"Account is set inactive — sign-in is blocked immediately.",
			"Mobile number and email are released so they can be used to register a new account later.",
			"Legal name, ID number, date of birth, address, and bank details are cleared from the profile.",
			"Identity document photos, profile photo, portfolio photos, and comcard images are removed from storage.",
			"Password is invalidated.",
		],
	},
	{
		id: "what-retained",
		title: "4. What may be retained",
		paragraphs: [
			"We do not hard-delete the database row when it is still referenced by operational records. Limited data may be retained as required for payroll history, dispute resolution, audit, fraud prevention, and applicable law (including PDPA retention duties).",
		],
		bullets: [
			"Payment vouchers, shift attendance, and similar financial / work records may remain with anonymised or deactivated account references.",
			"Security and audit logs related to the deletion event may be kept.",
			"After retention periods expire, remaining personal data is removed or further anonymised where feasible.",
		],
	},
	{
		id: "contact",
		title: "5. Contact",
		paragraphs: [
			`For deletion or privacy questions: ${PRIVACY_CONTACT_LABEL} (${PRIVACY_CONTACT_WHATSAPP}). See also our Privacy Policy at /policy.`,
		],
	},
]
