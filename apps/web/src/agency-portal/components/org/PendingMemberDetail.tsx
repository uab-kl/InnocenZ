import {
	decidedByLabel,
	memberQueueState,
} from "@agency-portal/components/org/PendingMembersPanel";
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
import {
	canModule,
	grantsForPortal,
} from "@/lib/auth/module-permissions";
import { useProfile } from "@/lib/auth/use-profile";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
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
	const { data: me } = useProfile();
	/*
	 * MAY THIS PERSON DECIDE, OR ONLY LOOK?
	 *
	 * Owner, 12 Sep 2026: "other orgs member cannot … approve the new member".
	 *
	 * The server has always refused them — the member writes behind Approve and
	 * Decline are gated by `agencyOwnerOfParam` / `outletOwnerOfParam` — but
	 * NOTHING here asked, so the buttons rendered for everyone who could reach
	 * the page. An agency Director holds `approvals:read`, so they opened the
	 * queue, pressed Approve and collected a 403: the screen promising something
	 * the database refuses, which is the one thing the matrix must never do.
	 *
	 * `settings:update` is the RIGHT mirror of that server gate: it is held by
	 * exactly owner and guarantor, on BOTH portals — the same rule and the same
	 * reasoning as the payment-method routes. `approvals:update` would match on
	 * the agency side alone; the outlet portal has no `approvals` module, so it
	 * could not gate the twin.
	 *
	 * Scoped by portal AND org: someone may own one venue and merely staff
	 * another, and the flat union from /auth/me cannot tell those apart.
	 */
	const canDecide = canModule(
		grantsForPortal(me?.modulePermissions, kind, orgId),
		"settings",
		"update",
	);
	/*
	 * Two-step, like the Team screen's bin: removal is not a single click.
	 *
	 * ⚠️ HOLDS THE MEMBER ID, not a boolean — the same rule `choice` and `error`
	 * below already follow, and this was the one piece of state that did not.
	 *
	 * This pane is the DETAIL half of a master/detail: picking someone else in
	 * the list re-renders this same component with a new `member` prop and keeps
	 * every `useState` it holds. So arming the confirmation for one person and
	 * then clicking another in the list left the red "Deactivate member" button
	 * standing — re-labelled with the NEW person's name, one click from removing
	 * somebody nobody had decided to remove.
	 */
	const [confirmingId, setConfirmingId] = useState<string | null>(null);
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

	const state = memberQueueState(member);
	const isWaiting = state === "waiting";
	const isDeclined = state === "declined";
	const isDeactivated = state === "deactivated";
	// Never offer to remove YOURSELF — the server refuses it, and a button that
	// always fails is a worse answer than no button.
	const isSelf = Boolean(me?.id && member.userId === me.id);
	// The SAME rule the list beside this pane applies — one answer, not two.
	const decidedBy = decidedByLabel(member, t);
	const decidedOn = whenApplied(member.updatedAt, locale);
	// Belongs to THIS person, or it does not count — see the note above.
	const picked = choice?.id === member.id ? choice.value : member.subRole;
	const shownError = error?.id === member.id ? error.message : "";
	// Armed for THIS person, or armed for nobody — see the note on the state.
	const confirming = confirmingId === member.id;
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
						{/* A ladder step, never an arbitrary px size: the ladder's floor is
						    micro (11px), and off-ladder values are what produced 27 different
						    sizes across the portals. `check:type` catches them, and the rule
						    is to move the value onto the ladder, never to re-baseline.
						    ⚠️ Do not name the offending class here either — that checker
						    scans SOURCE TEXT, so quoting one in a comment re-triggers it. */}
						<span className="text-xs">{t.portalUi.noPhoto}</span>
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
					) : isDeclined ? (
						<span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-muted-foreground text-xs">
							<UserX className="h-3 w-3" />
							{t.portalUi.declinedRole}
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

			{/*
			 * ALREADY ANSWERED — who answered it, and when.
			 *
			 * ⚠️ The name comes from `updated_by`, which is the LAST writer, not a
			 * dedicated approver column — there is none. For somebody admitted
			 * through this queue that IS the person who decided, and it stays true
			 * until the membership is edited afterwards.
			 */}
			{isWaiting ? null : (
				<section>
					<h3 className="mb-1 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
						{t.portalUi.decisionHeading}
					</h3>
					<div className="divide-y divide-border rounded-xl border border-border px-4">
						{/* Only when a HUMAN can be named. `decidedByLabel` returns null
						    for the machine tokens setup code writes into `updated_by`
						    (`seed-…`, `member-signup`), and an absent line is honest where
						    an invented accepter would not be. */}
						{decidedBy ? (
							<Row
								icon={
									isDeclined ? (
										<UserX className="h-4 w-4" />
									) : (
										<UserCheck className="h-4 w-4" />
									)
								}
								label={
									isDeclined ? t.portalUi.declinedBy : t.portalUi.acceptedBy
								}
								value={decidedBy}
							/>
						) : null}
						{decidedOn ? (
							<Row
								icon={<Clock className="h-4 w-4" />}
								// ⚠️ ONE LABEL PER OUTCOME. This printed "Declined on" over every
								// decided row, so the owner's own card read "Already on the team ·
								// Owner" and "DECLINED ON" at the same time. Same column either
								// way — the WORD carries the whole meaning.
								label={
									isDeclined
										? t.portalUi.declinedOn
										: isDeactivated
											? t.portalUi.deactivatedOn
											: t.portalUi.acceptedOn
								}
								value={decidedOn}
							/>
						) : null}
					</div>
				</section>
			)}

			{/*
			 * TAKING AN ACTIVE MEMBER OFF THE TEAM, from the pane already showing
			 * them (owner, 11 Sep 2026: "under the right panel owner can deactivate
			 * the now active account, same works with … setting page dustbin remove
			 * icon").
			 *
			 * ⚠️ It is the SAME write as that bin icon — `removeMember`, which the
			 * server turns into `inactive` through `removalStatusFor` because the row
			 * is active. A second deactivation path would be a second place for the
			 * declined-vs-removed distinction to be got wrong, and 0162 exists
			 * because it was got wrong once already.
			 *
			 * ⚠️ NOT OFFERED FOR YOURSELF. The server refuses self-removal and the
			 * last owner outright, but a button that always fails is a worse answer
			 * than no button — the Team screen hides its bin for the same reason.
			 */}
			{state === "active" && !isSelf ? (
				<section>
					<h3 className="mb-1 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
						{t.portalUi.decideHeading}
					</h3>
					<div className="rounded-xl border border-border p-4">
						{/*
						 * CHANGING AN EXISTING MEMBER'S TITLE, from the pane already showing
						 * them (owner, 11 Sep 2026: "make switch row can be in the approval
						 * page all section").
						 *
						 * ⚠️ The SAME write the Team screen's dropdown uses —
						 * `changeMember({ subRole })` — never a second path. That endpoint is
						 * also where the portal-role grant happens, and a second way to change
						 * a title would be a second place to get that grant wrong; it was got
						 * wrong once already.
						 *
						 * Hidden while the removal confirmation is open: two decisions about
						 * the same person on screen at once is how the wrong one gets clicked.
						 */}
						{!confirming ? (
							<div className="mb-4">
								<label className="flex flex-col gap-1.5">
									<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
										{t.portalUi.changeRole}
									</span>
									<select
										value={picked}
										disabled={busy || !canDecide}
										onChange={(e) =>
											setChoice({ id: member.id, value: e.target.value })
										}
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
								{picked !== member.subRole ? (
									<button
										type="button"
										disabled={busy || !canDecide}
										onClick={() => {
											setError(null);
											changeMember.mutate(
												{ memberId: member.id, subRole: picked },
												{
													onError: (e) =>
														setError({
															id: member.id,
															message: serverMessage(
																e,
																t.portalUi.roleSaveFailed,
															),
														}),
												},
											);
										}}
										className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-foreground px-4 py-2.5 font-semibold text-background text-sm disabled:opacity-50"
									>
										<UserCheck className="h-4 w-4 shrink-0" />
										{t.portalUi.saveRole}
									</button>
								) : null}
								{shownError ? (
									<p className="mt-3 text-red-500 text-sm">{shownError}</p>
								) : null}
							</div>
						) : null}
						{confirming ? (
							<>
								<p className="text-foreground text-sm">
									{fill(t.portalUi.deactivateConfirm, {
										name: member.username || member.email || "",
									})}
								</p>
								{shownError ? (
									<p className="mt-3 text-red-500 text-sm">{shownError}</p>
								) : null}
								<div className="mt-4 flex flex-wrap gap-2">
									<button
										type="button"
										disabled={busy || !canDecide}
										onClick={() => {
											setError(null);
											removeMember.mutate(member.id, {
												onSuccess: onDecided,
												onError: (e) =>
													setError({
														id: member.id,
														message: serverMessage(
															e,
															t.portalUi.deactivateFailed,
														),
													}),
											});
										}}
										className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-sm text-white disabled:opacity-50"
									>
										<UserX className="h-4 w-4 shrink-0" />
										{t.portalUi.deactivateMember}
									</button>
									{/* ⚠️ `busy` ONLY. Cancel used to carry `|| !canDecide` too,
									    so a lane that could not deactivate could not dismiss the
									    panel either — both buttons greyed, no way out but a
									    reload. Backing out is not a write; nobody needs
									    permission to change their mind. */}
									<button
										type="button"
										disabled={busy}
										onClick={() => setConfirmingId(null)}
										className="inline-flex flex-1 items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm disabled:opacity-50"
									>
										{t.portalUi.cancel}
									</button>
								</div>
							</>
						) : (
							/* ⚠️ `canDecide` — this one opener had no gate at all, while the
							   five buttons around it did. So a Director was shown a red
							   "Deactivate member", and pressing it armed a confirmation whose
							   own button was dead. Offering a destructive act to somebody the
							   server refuses is worse than not offering it: it reads as the
							   product being broken rather than as a rule. */
							canDecide && (
								<button
									type="button"
									onClick={() => setConfirmingId(member.id)}
									className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-500/40 px-4 py-2.5 text-red-400 text-sm hover:bg-red-500/10"
								>
									<UserX className="h-4 w-4 shrink-0" />
									{t.portalUi.deactivateMember}
								</button>
							)
						)}
					</div>
				</section>
			) : null}

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
								disabled={busy || !canDecide}
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
								disabled={busy || !canDecide}
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
								disabled={busy || !canDecide}
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
