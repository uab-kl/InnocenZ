import {
	type OrgKind,
	type OrgMember,
	serverMessage,
	useOrgMembers,
} from "@agency-portal/hooks/use-org-members";
import {
	Clock,
	IdCard,
	Mail,
	Phone,
	UserCheck,
	UserRound,
	UserX,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { apiAssetUrl } from "@/components/organization/details-sheet-parts";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { portalRoleLabel } from "@/lib/portal-i18n/portal-role-label";

/**
 * Which titles an owner may APPROVE somebody into, per portal.
 *
 * ⚠️ The same list the panel beside this one offers, and the same list the
 * server enforces. Owner and Guarantor are absent on purpose: the top lane is
 * handed over from the Team screen by somebody who already holds it, never
 * granted while admitting a stranger.
 */
const APPROVABLE: Record<OrgKind, readonly string[]> = {
	agency: ["finance", "director"],
	outlet: ["finance", "director", "operations_head"],
};

/**
 * A membership id that has not been earned yet (migration 0161).
 *
 * The server's `isPendingOrgCode` is the authority; this is the read-only twin
 * that decides whether to PRINT one. Kept as a literal rather than shipped from
 * the API, because it only ever hides a value — being wrong here shows a
 * placeholder, never grants anything.
 */
function isPlaceholderCode(code: string): boolean {
	return code.startsWith("INNPND");
}

/** A date off the wire, in the reader's language — never a raw ISO string. */
function whenApplied(iso: string | null | undefined, locale: string) {
	if (!iso) return null;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return null;
	return d.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-MY", {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function Row({
	icon,
	label,
	value,
}: {
	icon: ReactNode;
	label: string;
	value: ReactNode;
}) {
	return (
		<div className="flex items-start gap-3 py-2.5">
			<span className="mt-0.5 text-muted-foreground">{icon}</span>
			<div className="min-w-0 flex-1">
				<p className="text-muted-foreground text-xs uppercase tracking-wide">
					{label}
				</p>
				{/* `break-all`: an email or an id is READ, not skimmed, and clipping
				    one hides exactly the part that identifies somebody. */}
				<p className="break-all font-medium text-foreground text-sm">{value}</p>
			</div>
		</div>
	);
}

/**
 * ONE PERSON'S REQUEST TO JOIN — the right half of the Approvals screen.
 *
 * This pane exists because the queue used to approve INLINE, inside a card
 * about 400px wide, while the other half of the screen sat empty. The owner
 * making this decision is letting a STRANGER into their roster and their
 * payroll, and a name beside a truncated email is not something anybody can
 * decide on. Here they get the photo the sign-up asked for, the full address,
 * the phone number, when the request was made and the title being asked for —
 * and then the decision.
 *
 * ⚠️ Approving is `changeMember({ status: 'active', subRole })` — the SAME
 * write the Team screen and the inline panel use. A second approve path would
 * be a second place to get the portal-role grant wrong, and that rule has
 * already been got wrong once.
 */
export function PendingMemberDetail({
	kind,
	orgId,
	memberId,
	onDecided,
}: {
	kind: OrgKind;
	orgId: string | null;
	memberId: string | null;
	onDecided: () => void;
}) {
	const { t, locale } = usePortalLocale();
	const { members, changeMember, removeMember } = useOrgMembers(kind, orgId);
	const member: OrgMember | undefined = members.find((m) => m.id === memberId);

	/*
	 * ⚠️ BOTH BITS OF STATE CARRY THE ID THEY BELONG TO, and are read as
	 * belonging to nobody once the selection moves.
	 *
	 * The picker must follow the SELECTION. Opening a second person while the
	 * first person's title was still picked would show "Director" over somebody
	 * who asked to be Finance, and one click would grant it. Clearing it in an
	 * effect also works, but only AFTER a render — so the wrong title is on
	 * screen, and clickable, for a frame. Deriving it means there is no such
	 * frame. The same reasoning applies to the error: a failure to approve one
	 * person must not sit above a different person's request.
	 */
	const [choice, setChoice] = useState<{ id: string; value: string } | null>(
		null,
	);
	const [error, setError] = useState<{ id: string; message: string } | null>(
		null,
	);

	if (!member) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 px-8 py-20 text-center">
				<span className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-muted/40">
					<UserRound
						className="h-7 w-7 text-muted-foreground"
						strokeWidth={1.5}
					/>
				</span>
				<p className="font-semibold text-base text-foreground">
					{t.portalUi.selectMember}
				</p>
				<p className="max-w-xs text-muted-foreground text-sm">
					{t.portalUi.selectMemberHint}
				</p>
			</div>
		);
	}

	const isWaiting = member.status !== "active";
	// Belongs to THIS person, or it does not count — see the note above.
	const picked = choice?.id === member.id ? choice.value : member.subRole;
	const shownError = error?.id === member.id ? error.message : "";
	const busy = changeMember.isPending || removeMember.isPending;
	const photo = apiAssetUrl(member.profileImage ?? undefined);
	const applied = whenApplied(member.createdAt, locale);

	return (
		<div className="flex flex-col gap-6 p-6">
			<div className="flex flex-col items-center gap-3 text-center">
				{photo ? (
					<img
						src={photo}
						alt=""
						className="h-24 w-24 rounded-full border border-border object-cover"
					/>
				) : (
					<span className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-full border border-border border-dashed bg-muted/40 text-muted-foreground">
						<UserRound className="h-8 w-8" strokeWidth={1.5} />
						<span className="text-[10px]">{t.portalUi.noPhoto}</span>
					</span>
				)}
				<div className="min-w-0">
					<h2 className="break-words font-bold text-foreground text-xl">
						{member.username || "—"}
					</h2>
					{isWaiting ? (
						<span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-amber-200 text-xs">
							<Clock className="h-3 w-3" />
							{t.portalUi.requestedRole}:{" "}
							<span className="font-semibold">
								{portalRoleLabel(member.subRole, t)}
							</span>
						</span>
					) : (
						<span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-emerald-300 text-xs">
							<UserCheck className="h-3 w-3" />
							{t.portalUi.alreadyOnTeam} ·{" "}
							<span className="font-semibold">
								{portalRoleLabel(member.subRole, t)}
							</span>
						</span>
					)}
				</div>
			</div>

			<section>
				<h3 className="mb-1 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
					{t.portalUi.memberContactHeading}
				</h3>
				<div className="divide-y divide-border rounded-xl border border-border px-4">
					<Row
						icon={<Mail className="h-4 w-4" />}
						label={t.portalUi.memberEmail}
						value={member.email || "—"}
					/>
					<Row
						icon={<Phone className="h-4 w-4" />}
						label={t.portalUi.memberPhone}
						value={member.phoneNum || t.portalUi.memberNoPhone}
					/>
				</div>
			</section>

			<section>
				<h3 className="mb-1 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
					{t.portalUi.memberAccountHeading}
				</h3>
				<div className="divide-y divide-border rounded-xl border border-border px-4">
					{applied ? (
						<Row
							icon={<Clock className="h-4 w-4" />}
							label={t.portalUi.appliedOn}
							value={applied}
						/>
					) : null}
					{/* Shown only once it is REAL. A member id is minted on approval
					    (0161), so a waiting row carries an `INNPND` placeholder — and
					    printing that would read as an id somebody could quote back, when
					    it is precisely a statement that no id has been issued. */}
					{member.memberCode && !isPlaceholderCode(member.memberCode) ? (
						<Row
							icon={<IdCard className="h-4 w-4" />}
							label={t.portalUi.accountId}
							value={member.memberCode}
						/>
					) : null}
				</div>
			</section>

			{isWaiting ? (
				<section>
					<h3 className="mb-1 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
						{t.portalUi.decideHeading}
					</h3>
					<div className="rounded-xl border border-border p-4">
						<p className="mb-3 text-muted-foreground text-sm">
							{t.portalUi.decideHint}
						</p>
						<label className="flex flex-col gap-1.5">
							<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
								{t.portalUi.roleToGrant}
							</span>
							<select
								value={picked}
								disabled={busy}
								onChange={(e) =>
									setChoice({ id: member.id, value: e.target.value })
								}
								// The popup is painted by the OS: on a light-themed Windows it
								// opens white with near-white options unless told otherwise.
								style={{ colorScheme: "dark" }}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
							>
								{APPROVABLE[kind].map((r) => (
									<option key={r} value={r}>
										{portalRoleLabel(r, t)}
									</option>
								))}
							</select>
						</label>

						{shownError ? (
							<p className="mt-3 text-red-500 text-sm">{shownError}</p>
						) : null}

						<div className="mt-4 flex flex-wrap gap-2">
							<button
								type="button"
								disabled={busy}
								onClick={() => {
									setError(null);
									changeMember.mutate(
										{ memberId: member.id, status: "active", subRole: picked },
										{
											onSuccess: onDecided,
											onError: (e) =>
												setError({
													id: member.id,
													message: serverMessage(e, t.portalUi.approveFailed),
												}),
										},
									);
								}}
								className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-foreground px-4 py-2.5 font-semibold text-background text-sm disabled:opacity-50"
							>
								<UserCheck className="h-4 w-4 shrink-0" />
								{t.portalUi.approveJoin}
							</button>
							<button
								type="button"
								disabled={busy}
								onClick={() => {
									setError(null);
									removeMember.mutate(member.id, {
										onSuccess: onDecided,
										onError: (e) =>
											setError({
												id: member.id,
												message: serverMessage(e, t.portalUi.declineFailed),
											}),
									});
								}}
								className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-4 py-2.5 text-sm disabled:opacity-50"
							>
								<UserX className="h-4 w-4 shrink-0" />
								{t.portalUi.declineJoin}
							</button>
						</div>
					</div>
				</section>
			) : null}
		</div>
	);
}
