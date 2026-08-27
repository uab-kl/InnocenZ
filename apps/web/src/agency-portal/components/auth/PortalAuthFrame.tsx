import { InnocenZLogoHorizontal } from "@agency-portal/components/Brand";
import { TitleWithIcon } from "@agency-portal/components/iz/TitleWithIcon";
import { PORTAL_TITLE_ICONS } from "@agency-portal/lib/title-icons";
import { LogIn } from "lucide-react";
import type { ReactNode } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/**
 * The portal's own name and its one-line pitch, as RESOLVER FUNCTIONS of the
 * dictionary rather than strings.
 *
 * This replaces `PORTAL_SIGNIN_LABELS` / `PORTAL_AUTH_TAGLINES` from
 * `lib/portal-signin` on THIS screen only. Those constants are module-scope, so
 * they are built before any hook can run and cannot read `t` — which is exactly
 * why the sign-in hero stayed English in a Chinese session. The record KEY is
 * still the `portal` prop's stored value ("outlet" / "agency"), and nothing here
 * is compared or sent.
 */
const PORTAL_COPY: Record<
	"outlet" | "agency",
	{
		name: (t: PortalTranslations) => string;
		tagline: (t: PortalTranslations) => string;
	}
> = {
	outlet: {
		name: (t) => t.portalUi.portalNameOutlet,
		tagline: (t) => t.portalUi.portalTaglineOutlet,
	},
	agency: {
		name: (t) => t.portalUi.portalNameAgency,
		tagline: (t) => t.portalUi.portalTaglineAgency,
	},
};

export function PortalAuthFrame({
	portal,
	children,
	overlay,
}: {
	portal: "outlet" | "agency";
	children: ReactNode;
	overlay?: ReactNode;
}) {
	const { t } = usePortalLocale();
	const copy = PORTAL_COPY[portal];
	const label = copy.name(t);
	const PortalIcon = PORTAL_TITLE_ICONS[portal];

	return (
		<div className="iz-portal-auth" data-portal={portal}>
			<aside className="iz-portal-auth-brand">
				<div className="iz-portal-auth-brand-inner">
					<InnocenZLogoHorizontal className="iz-portal-auth-brand-logo" />

					<p className="iz-tiny iz-muted mt-3">
						{/* `icon` is passed explicitly, so `iconForTitle` never sees the
						    translated text and the icon survives the locale switch. */}
						<TitleWithIcon icon={PortalIcon}>
							{fill(t.portalUi.portalSuffixed, { portal: label })}
						</TitleWithIcon>
					</p>

					<h1 className="font-sora mt-8 text-[32px] font-extrabold leading-tight text-[var(--iz-txt)]">
						<TitleWithIcon icon={LogIn}>
							{t.portalUi.signInTo}{" "}
							<TitleWithIcon icon={PortalIcon}>{label}</TitleWithIcon>
						</TitleWithIcon>
					</h1>
					<p className="iz-sm iz-muted mt-3 max-w-sm leading-relaxed">
						{copy.tagline(t)}
					</p>
				</div>
			</aside>

			<main className="iz-portal-auth-main">{children}</main>
			{overlay}
		</div>
	);
}
