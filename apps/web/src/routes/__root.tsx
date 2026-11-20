import type { ApolloClientIntegration } from "@apollo/client-integration-tanstack-start";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
} from "@tanstack/react-router";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WhatsAppContactButton } from "@/components/whatsapp-contact-button";
import { AuthProvider } from "@/lib/auth-context";
import { getLocale } from "@/paraglide/runtime";
import appCss from "../styles.css?url";
import { NotFoundPage, notFoundHead } from "./not-found";

interface MyRouterContext extends ApolloClientIntegration.RouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	beforeLoad: async () => {
		if (typeof document !== "undefined") {
			document.documentElement.setAttribute("lang", getLocale());
		}
	},

	notFoundComponent: NotFoundPage,

	head: ({ matches }) => {
		const isNotFound = matches.some(
			(match) => match.status === "notFound" || match._notFound,
		);

		return {
			meta: [
				{ charSet: "utf-8" },
				{ name: "viewport", content: "width=device-width, initial-scale=1" },
				...(isNotFound ? (notFoundHead().meta ?? []) : [{ title: "Innocenz" }]),
			],
			links: [
				{ rel: "stylesheet", href: appCss },
				// The portals' Afterglow faces (owner, 20 Nov 2026): Sora for text,
				// Newsreader for page titles. Its own link, so the broken @import at
				// the top of styles.css (left as is: "leave the fonts") cannot take
				// these down with it.
				{
					rel: "stylesheet",
					href: "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,500;6..72,600&display=swap",
				},
				{ rel: "icon", href: "/assets/innocenz-logo.png", type: "image/png" },
				{ rel: "apple-touch-icon", href: "/assets/innocenz-logo.png" },
			],
		};
	},

	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang={getLocale()} className="dark" suppressHydrationWarning>
			<body>
				<HeadContent />
				<ThemeProvider>
					<TooltipProvider>
						<AuthProvider>
							<SidebarProvider defaultOpen={true}>{children}</SidebarProvider>
						</AuthProvider>
					</TooltipProvider>
					<WhatsAppContactButton />
					<Toaster />
				</ThemeProvider>
				<Scripts />
			</body>
		</html>
	);
}
