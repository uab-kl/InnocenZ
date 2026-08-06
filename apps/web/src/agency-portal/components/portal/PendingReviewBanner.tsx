import {
	isOrgPendingReview,
	isOrgSuspended,
} from "@/components/organization/org-status";

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
	const label = kind === "outlet" ? "outlet" : "agency";

	if (isOrgSuspended(orgStatus)) {
		return (
			<div
				role="status"
				className="mb-4 rounded-lg border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100"
			>
				<span className="font-semibold text-red-50">Suspended.</span> Your{" "}
				{label} access is limited to this profile. Contact InnocenZ to restore
				full portal features.
			</div>
		);
	}

	if (!isOrgPendingReview(orgStatus)) return null;
	return (
		<div
			role="status"
			className="mb-4 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
		>
			<span className="font-semibold text-amber-50">Pending review.</span>{" "}
			Your {label} is awaiting InnocenZ admin approval. You can update your
			profile here — other portal features unlock after approval.
		</div>
	);
}
