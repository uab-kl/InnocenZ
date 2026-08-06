/**
 * PR-only topbar identity + bell. Kept in its own module so agency/outlet
 * shells that import `Nav` do not SSR-load `pr-demo` / `pr-features`.
 */
import { PrNotificationBell } from "@agency-portal/components/pr/PrNotificationBell";
import {
	fmtDTopbar,
	getPrProfile,
	getShiftToday,
} from "@agency-portal/lib/pr-demo";
import { publicAssetPath } from "@agency-portal/lib/public-asset";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

function formatTopbarTime(d: Date) {
	return d.toLocaleTimeString("en-MY", {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
}

function PrTopbarDateTime() {
	const [time, setTime] = useState(() => formatTopbarTime(new Date()));
	const today = getShiftToday();
	const dateLine = fmtDTopbar(today[0], today[1], today[2]);

	useEffect(() => {
		const tick = () => setTime(formatTopbarTime(new Date()));
		tick();
		const id = window.setInterval(tick, 30_000);
		return () => window.clearInterval(id);
	}, []);

	return (
		<div className="iz-topbar-datetime" aria-label={`${dateLine}, ${time}`}>
			<span className="iz-topbar-date">{dateLine}</span>
			<span className="iz-topbar-time">{time}</span>
		</div>
	);
}

export function PrPortalTopbar({
	prSubRole,
	fallbackName,
	fallbackLabel,
	fallbackAv,
	fallbackGradient,
	prDisplayName,
	prAvatarPhoto,
}: {
	prSubRole: string | null;
	fallbackName: string;
	fallbackLabel: string;
	fallbackAv: string;
	fallbackGradient: string;
	prDisplayName: string | null;
	prAvatarPhoto: string | null;
}) {
	const prProfile = prSubRole ? getPrProfile(prSubRole) : null;
	const displayName = prDisplayName ?? prProfile?.name ?? fallbackName;
	const displayAv =
		displayName.trim()[0]?.toUpperCase() ?? prProfile?.av ?? fallbackAv;
	const displayGradient = prProfile?.avg ?? fallbackGradient;

	return (
		<>
			<Link
				to="/host/profile"
				className="iz-topbar-identity iz-topbar-identity--link iz-topbar-identity--pr"
				aria-label="Open profile"
				title="Profile"
			>
				<div
					className={`iz-avatar iz-avatar--sm${prAvatarPhoto ? " iz-avatar-photo" : ""}`}
					style={prAvatarPhoto ? undefined : { background: displayGradient }}
				>
					{prAvatarPhoto ? (
						<img src={publicAssetPath(prAvatarPhoto)} alt="" />
					) : (
						displayAv
					)}
				</div>
				<div className="iz-topbar-meta">
					<div className="iz-topbar-name">{displayName}</div>
					<div className="iz-topbar-role">{fallbackLabel}</div>
				</div>
			</Link>
			<div className="iz-topbar-actions iz-topbar-actions--pr">
				<PrTopbarDateTime />
				<PrNotificationBell />
			</div>
		</>
	);
}
