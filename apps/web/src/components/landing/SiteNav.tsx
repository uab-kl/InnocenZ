import { Link } from "@tanstack/react-router";
import { BrandLogo } from "@/components/landing/BrandLogo";

const links = [
	{ href: "#features", label: "Features" },
	{ href: "#how", label: "How it works" },
	{ href: "#pricing", label: "Pricing" },
];

export function SiteNav() {
	return (
		<header className="fixed inset-x-0 top-0 z-50 border-b-2 border-royal-gold/30 bg-black/95 backdrop-blur-md">
			<div className="flex h-32 w-full items-center gap-10 px-8 lg:px-12">
				<a href="#top" className="shrink-0">
					<BrandLogo size="md" />
				</a>
				<nav className="hidden items-center gap-10 lg:flex">
					{links.map((l) => (
						<a
							key={l.href}
							href={l.href}
							className="landing-chrome-copy font-bold uppercase tracking-[0.14em] text-foreground/80 transition-colors hover:text-gold-bright"
						>
							{l.label}
						</a>
					))}
				</nav>
				<div className="ml-auto flex items-center gap-5">
					<Link
						to="/login"
						className="landing-chrome-copy inline-flex px-5 py-2.5 font-bold uppercase tracking-[0.12em] text-foreground/80 transition-colors hover:text-gold-bright"
					>
						Login
					</Link>
					<Link
						to="/signup"
						className="landing-chrome-copy inline-flex border-2 border-gold px-9 py-3.5 font-bold uppercase tracking-[0.12em] text-gold-bright transition-all hover:bg-gold hover:text-gold-foreground"
					>
						Get started
					</Link>
				</div>
			</div>
		</header>
	);
}
