import { InnocenZLogoHorizontal } from "@agency-portal/components/Brand";
import { TitleWithIcon } from "@agency-portal/components/iz/TitleWithIcon";
import {
	PORTAL_AUTH_TAGLINES,
	PORTAL_SIGNIN_LABELS,
	type SignInPortal,
} from "@agency-portal/lib/portal-signin";
import { PORTAL_TITLE_ICONS } from "@agency-portal/lib/title-icons";
import { LogIn } from "lucide-react";
import type { ReactNode } from "react";

export function PortalAuthFrame({
	portal,
	children,
	overlay,
}: {
	portal: "outlet" | "agency";
	children: ReactNode;
	overlay?: ReactNode;
}) {
	const label = PORTAL_SIGNIN_LABELS[portal];
	const PortalIcon = PORTAL_TITLE_ICONS[portal];

	return (
		<div className="iz-portal-auth" data-portal={portal}>
			<aside className="iz-portal-auth-brand">
				<div className="iz-portal-auth-brand-inner">
					<InnocenZLogoHorizontal className="iz-portal-auth-brand-logo" />

					<p className="iz-tiny iz-muted mt-3">
						<TitleWithIcon icon={PortalIcon}>{label} portal</TitleWithIcon>
					</p>

					<h1 className="font-sora mt-8 text-[32px] font-extrabold leading-tight text-[var(--iz-txt)]">
						<TitleWithIcon icon={LogIn}>
							Sign in to{" "}
							<TitleWithIcon icon={PortalIcon}>{label}</TitleWithIcon>
						</TitleWithIcon>
					</h1>
					<p className="iz-sm iz-muted mt-3 max-w-sm leading-relaxed">
						{PORTAL_AUTH_TAGLINES[portal]}
					</p>
				</div>
			</aside>

			<main className="iz-portal-auth-main">{children}</main>
			{overlay}
		</div>
	);
}
