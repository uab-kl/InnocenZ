import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { userTypes } from "@/constants/user-types";
import {
	adminNavLabel,
	userTypeDescription,
} from "@/lib/portal-i18n/admin-nav-label";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

type UserType = (typeof userTypes)[number];

export function UserTypePage({ type }: { type: UserType }) {
	const { t } = usePortalLocale();
	const Icon = type.icon;
	// Both lookups are keyed on the `userTypes` config's own stable `key` — the
	// same pair the sidebar and the real user-management pages use.
	const title = adminNavLabel(`sidebar-user-${type.key}`, type.title, t);
	const description = userTypeDescription(type.key, type.description, t);

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
					<CardTitle>{fill(t.adminBits.namedUsers, { name: title })}</CardTitle>
				</CardHeader>
				<CardContent className="text-sm text-muted-foreground">
					{fill(t.adminBits.connectUserApiHint, { name: title })}
				</CardContent>
			</Card>
		</div>
	);
}
