import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BusinessSection } from "@/constants/business-sections";
import { adminNavLabel } from "@/lib/portal-i18n/admin-nav-label";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

export function BusinessSectionPage({ section }: { section: BusinessSection }) {
	const { t } = usePortalLocale();
	const Icon = section.icon;
	// Same lookup the sidebar uses, keyed on the `businessSections` config's own
	// stable `key`; the config's English title is the fallback, not the source.
	const title = adminNavLabel(
		`sidebar-business-${section.key}`,
		section.title,
		t,
	);
	const description =
		section.key === "history"
			? t.adminBusiness.currentPlanSubtitle
			: t.adminBusiness.planSubtitle;

	return (
		<div className="p-6 space-y-6">
			<div className="flex items-center gap-3">
				<div className="flex h-11 w-11 items-center justify-center rounded-xl border border-(--lavender-muted)/50 bg-(--lavender-soft)/20 text-lavender">
					<Icon className="h-5 w-5" />
				</div>
				<div>
					<h1 className="text-2xl font-semibold tracking-tight text-foreground">
						{title}
					</h1>
					<p className="text-muted-foreground text-sm mt-1">{description}</p>
				</div>
			</div>

			<Card className="border-(--lavender-soft)/40 bg-card">
				<CardHeader>
					<CardTitle>{title}</CardTitle>
				</CardHeader>
				<CardContent className="text-sm text-muted-foreground">
					{fill(t.adminBits.connectApiHint, { name: title })}
				</CardContent>
			</Card>
		</div>
	);
}
