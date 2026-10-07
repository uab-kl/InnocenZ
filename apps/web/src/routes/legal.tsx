import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/legal")({
	head: () => ({
		meta: [
			{ title: "Terms & legal — InnocenZ" },
			{
				name: "description",
				content:
					"The terms and declarations outlets, PR agencies and PRs accept when they create an InnocenZ account.",
			},
			{ property: "og:title", content: "Terms & legal — InnocenZ" },
			{
				property: "og:description",
				content: "The terms and declarations accepted at InnocenZ sign-up.",
			},
		],
	}),
	component: LegalPage,
});
