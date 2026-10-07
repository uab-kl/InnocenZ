import { createFileRoute } from "@tanstack/react-router";
import { AboutPage } from "@/components/legal/AboutPage";

export const Route = createFileRoute("/about")({
	head: () => ({
		meta: [
			{ title: "About — InnocenZ" },
			{
				name: "description",
				content:
					"InnocenZ is the AI-powered operating platform for Outlet, PR Agency and PR — from the first check-in to the final signed payout.",
			},
			{ property: "og:title", content: "About — InnocenZ" },
			{
				property: "og:description",
				content:
					"The AI-powered operating platform for Outlet, PR Agency and PR.",
			},
		],
	}),
	component: AboutPage,
});
