import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RbacSection } from "@/constants/rbac-sections";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { rbacSectionLabel } from "@/lib/portal-i18n/rbac-label";

export function RbacSectionPage({ section }: { section: RbacSection }) {
	const { t } = usePortalLocale();
	const Icon = section.icon;
	// Title and blurb come from the `rbacSections` CONFIG, keyed on its own
	// stable `key`; the English on the config is the fallback, not the source.
	const title = rbacSectionLabel(section.key, section.title, t);
	const description =
		section.key === "module"
			? t.rbac.sectionModulesHint
			: t.rbac.sectionRbacHint;

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
