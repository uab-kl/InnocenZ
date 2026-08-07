import { createFileRoute } from "@tanstack/react-router"
import { DeleteAccountPage } from "@/components/legal/DeleteAccountPage"

export const Route = createFileRoute("/delete-account")({
	head: () => ({
		meta: [
			{ title: "Delete account — InnocenZ" },
			{
				name: "description",
				content:
					"How to delete your InnocenZ PR account in the mobile app or by contacting support. Required account-deletion information for Google Play and App Store.",
			},
			{ property: "og:title", content: "Delete account — InnocenZ" },
			{
				property: "og:description",
				content:
					"How to delete your InnocenZ PR account in the mobile app or by contacting support.",
			},
		],
	}),
	component: DeleteAccountPage,
})
