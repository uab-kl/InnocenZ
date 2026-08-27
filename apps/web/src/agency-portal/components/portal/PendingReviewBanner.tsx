import {
	isOrgPendingReview,
	isOrgSuspended,
} from "@/components/organization/org-status";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

/**
 * Notice on profile/settings while the org is limited to that surface.
 * Amber for pending review; red for suspended.
 */
export function PendingReviewBanner({
	orgStatus,
	kind,
}: {
	orgStatus: string | null | undefined;
	kind: "outlet" | "agency";
}) {
	const { t } = usePortalLocale();
	// `kind` is the caller's stored discriminator and stays English; only the
	// noun dropped into the sentence below moves with the locale. Both sentences
	// are whole templates rather than fragments glued round that noun, because
	// Chinese does not put it in the same place English does.
	const label =
		kind === "outlet" ? t.portalShell.outletNoun : t.portalShell.agencyNoun;

	if (isOrgSuspended(orgStatus)) {
		return (
			<output className="mb-4 block rounded-lg border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
				<span className="font-semibold text-red-50">
					{t.portalShell.suspendedTitle}
				</span>{" "}
				{fill(t.portalShell.suspendedBody, { kind: label })}
			</output>
		);
	}

	if (!isOrgPendingReview(orgStatus)) return null;
	return (
		<output className="mb-4 block rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
			<span className="font-semibold text-amber-50">
				{t.portalShell.pendingReviewTitle}
			</span>{" "}
			{fill(t.portalShell.pendingReviewBody, { kind: label })}
		</output>
	);
}
