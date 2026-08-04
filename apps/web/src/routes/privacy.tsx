import { createFileRoute } from "@tanstack/react-router"
import { PrivacyPolicyPage } from "@/components/legal/PrivacyPolicyPage"

export const Route = createFileRoute("/privacy")({
	head: () => ({
		meta: [
			{ title: "Privacy Policy — InnocenZ" },
			{
				name: "description",
				content:
					"How InnocenZ collects, uses, and protects personal data across the web portals and PR mobile app.",
			},
			{ property: "og:title", content: "Privacy Policy — InnocenZ" },
			{
				property: "og:description",
				content:
					"How InnocenZ collects, uses, and protects personal data across the web portals and PR mobile app.",
			},
		],
	}),
	component: PrivacyPolicyPage,
})
