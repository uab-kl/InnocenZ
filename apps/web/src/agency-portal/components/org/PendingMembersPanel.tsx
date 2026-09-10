import {
	type OrgKind,
	serverMessage,
	useOrgMembers,
} from "@agency-portal/hooks/use-org-members";
import { Clock, Loader2, UserCheck, UserX } from "lucide-react";
import { useState } from "react";
import { apiAssetUrl } from "@/components/organization/details-sheet-parts";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { portalRoleLabel } from "@/lib/portal-i18n/portal-role-label";
import { cn } from "@/lib/utils";

/**
 * Which titles an owner may APPROVE somebody into, per portal.
 *
 * ⚠️ Owner and Guarantor are absent on purpose, and the server refuses them on
 * the invite and sign-up paths for the same reason. The top lane is handed over
 * from the Team screen by somebody who already holds it — never granted while
 * admitting a stranger, where one mis-click on an unfamiliar name would give
 * the organisation away.
 */
const APPROVABLE: Record<OrgKind, readonly string[]> = {
	agency: ["finance", "director"],
	outlet: ["finance", "director", "operations_head"],
};

/** First letter of whatever we can show, for the avatar disc. */
function initial(name: string | undefined, email: string | null | undefined) {
	const source = (name || email || "?").trim();
	return (source[0] ?? "?").toUpperCase();
}

/**
 * PEOPLE ASKING TO JOIN — the queue behind the "New Member" tab.
 *
 * These rows arrive from the member sign-up (`POST /auth/register-member`),
 * which writes a membership at `status: 'pending'` carrying the title the
 * person ASKED FOR. Nothing about that row grants anything: every guard and
 * scope resolver reads a non-active membership as no access at all, so the
 * request sits inert until somebody here decides.
 *
 * ⚠️ THE ROLE PICKER DEFAULTS TO WHAT THEY ASKED FOR AND IS THE OWNER'S TO
 * CHANGE. That is the point of approving rather than auto-admitting — the
 * requested title is a suggestion, and the row says who is suggesting it.
 *
 * ⚠️ Approving is `changeMember({ status: 'active', subRole })` — the SAME
 * endpoint the Team screen edits through, deliberately. A second write path for
 * "approve" would be a second place to get the portal-role grant wrong, and
 * that rule was already got wrong once: reinstating somebody with the title
 * they already held used to skip the grant entirely and leave them active with
 * no role at all.
 *
 * ⚠️ EVERY BREAKPOINT HERE IS A CONTAINER QUERY (`@container/row` plus
 * `@2xl/row:`), NEVER A VIEWPORT ONE. This panel renders in two places of very
 * different widths — the agency Approvals LIST PANE, about 400px, and the
 * full-width outlet Settings page. `sm:flex-row` asks about the WINDOW, so on a
 * 1379px screen it laid the row out horizontally inside the 400px pane: the
 * controls are `shrink-0`, so they took the width they needed, the name column
 * collapsed to a few pixels, its `truncate` clipped the name and the email away
 * to nothing, and "Asked to join as:" wrapped one word per line beside a
 * Decline button hanging off the edge under a scrollbar. The card has to ask
 * about the space IT is in, which is the question a container query answers.
 */
export function PendingMembersPanel({
	kind,
	orgId,
	selectedId,
	onSelect,
}: {
	kind: OrgKind;
	orgId: string | null;
	/** Highlighted row, in master-detail mode. */
	selectedId?: string | null;
	/**
	 * Provided → MASTER-DETAIL: rows become buttons and the inline controls
	 * go away, because the pane beside the list owns the decision. Omitted →
	 * INLINE, which is what a single-column page needs, since there is no
	 * second half of the screen to put the decision in.
	 *
	 * One component rather than two, so the row, the filter and the approve
	 * write cannot drift apart between the two portals.
	 */
	onSelect?: (id: string) => void;
}) {
	const { t } = usePortalLocale();
	const { members, isLoading, changeMember, removeMember } = useOrgMembers(
		kind,
		orgId,
	);
	/** Per-row, because two rows can be open at once and must not share a pick. */
	const [picked, setPicked] = useState<Record<string, string>>({});
	const [error, setError] = useState("");
	/*
	 * Opens on WAITING — the queue exists to answer requests, and a list that
	 * opens on "All" buries the two unanswered rows among forty settled ones.
	 * The other two are the record, reachable in one click.
	 */
	const [filter, setFilter] = useState<"waiting" | "active" | "all">("waiting");

	/*
	 * `status !== "active"` rather than `=== "pending"`: the column is a free
	 * varchar(50), so a row written with any other word is still somebody who is
	 * not working here, and would vanish from a list that matched one literal.
	 * The same reasoning the admin archive screen already applies.
	 */
	const pending = members.filter((m) => m.status !== "active");
	const active = members.filter((m) => m.status === "active");
	const waiting =
		filter === "waiting" ? pending : filter === "active" ? active : members;

	if (isLoading) {
		return (
			<div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
				<Loader2 className="h-4 w-4 animate-spin" />
				{t.common.loading}
			</div>
		);
	}

	const filters = [
		["waiting", t.portalUi.membersWaiting, pending.length],
		["active", t.portalUi.membersActive, active.length],
		["all", t.portalUi.membersAll, members.length],
	] as const;

	const filterRow = (
		<div className="mb-3 flex flex-wrap gap-2">
			{filters.map(([value, label, count]) => (
				<button
					key={value}
					type="button"
					className={cn("iz-chip iz-tiny", filter === value && "on")}
					onClick={() => setFilter(value)}
				>
					{label} ({count})
				</button>
			))}
		</div>
	);

	if (waiting.length === 0) {
		return (
			<div>
				{filterRow}
				<div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
					{t.portalUi.noPendingMembers}
				</div>
			</div>
		);
	}

	/*
	 * A real <button> in master-detail mode, so the row is reachable by keyboard
	 * and announced as activatable — a clickable <div> is neither.
	 */
	const Wrapper = onSelect ? "button" : "div";

	return (
		<div className="flex flex-col gap-3">
			{filterRow}
			{error ? <p className="text-sm text-red-500">{error}</p> : null}

			{waiting.map((m) => {
				const choice = picked[m.id] ?? m.subRole;
				const busy = changeMember.isPending || removeMember.isPending;
				const isWaiting = m.status !== "active";
				const photo = apiAssetUrl(m.profileImage ?? undefined);
				return (
					<Wrapper
						key={m.id}
						{...(onSelect
							? { type: "button", onClick: () => onSelect(m.id) }
							: {})}
						className={cn(
							"@container/row rounded-xl border bg-card p-4",
							onSelect &&
								"w-full cursor-pointer text-left hover:border-foreground/25",
							onSelect &&
								selectedId === m.id &&
								"ring-2 ring-[var(--iz-title)]",
							/*
							 * Amber edge while waiting, per the standing colour code. It is
							 * what tells the two states apart at a glance under the "All"
							 * filter, where answered and unanswered sit in one list.
							 */
							isWaiting
								? "border-amber-400/35 bg-amber-400/[0.03]"
								: "border-border",
						)}
					>
						<div className="flex flex-col gap-4 @2xl/row:flex-row @2xl/row:items-center @2xl/row:justify-between">
							<div className="flex min-w-0 items-start gap-3">
								{/*
								 * The face, when there is one — the initial is the FALLBACK,
								 * not the design. The detail pane beside this list was already
								 * showing the photo, so a row reading "D" next to a portrait
								 * of the same person read as two different people.
								 *
								 * ⚠️ `object-cover` with matched h/w is what actually fits a
								 * photo inside the circle. `rounded-full` alone clips a
								 * portrait to a circle of its own WIDTH, so a tall photo keeps
								 * its aspect and spills past the border; `object-fill` would
								 * squash the face instead. Cover crops to the short edge,
								 * which is the only one of the three that leaves a face
								 * looking like itself.
								 */}
								{photo ? (
									<img
										src={photo}
										alt=""
										className="mt-0.5 h-10 w-10 shrink-0 rounded-full border border-border object-cover"
									/>
								) : (
									<span
										aria-hidden
										className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted font-semibold text-base text-foreground"
									>
										{initial(m.username, m.email)}
									</span>
								)}
								<div className="min-w-0">
									<p className="truncate font-semibold text-foreground">
										{m.username || "—"}
									</p>
									{/* `break-all`, not `truncate`: the email is the one thing
									    here somebody may need to READ in full to recognise a
									    stranger, and clipping it to "prob…" hides exactly the
									    part that identifies them. */}
									<p className="break-all text-muted-foreground text-sm">
										{[m.email, m.phoneNum].filter(Boolean).join(" · ") || "—"}
									</p>
									{/* What they ASKED for, said plainly — the picker beside it
									    is the answer, and the two must not read as the same
									    thing. A chip rather than a sentence, so it cannot wrap
									    into a column one word wide. */}
									{isWaiting && (
										<span className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-amber-200 text-xs">
											<Clock className="h-3 w-3 shrink-0" />
											<span className="truncate">
												{t.portalUi.requestedRole}:{" "}
												<span className="font-semibold">
													{portalRoleLabel(m.subRole, t)}
												</span>
											</span>
										</span>
									)}
								</div>
							</div>

							{/*
							 * ⚠️ Controls ONLY on rows still waiting. The "On the team"
							 * filter shows people already approved, and offering Approve
							 * beside somebody who is already in would be a button whose only
							 * effect is to re-write the title they already hold — while
							 * Decline beside them is a removal wearing a reviewer's word.
							 * Editing an existing member is the Team screen's job.
							 */}
							{onSelect ? null : !isWaiting ? (
								<span className="shrink-0 text-muted-foreground text-sm @2xl/row:text-right">
									{portalRoleLabel(m.subRole, t)}
								</span>
							) : (
								<div className="flex min-w-0 flex-col gap-2 @2xl/row:flex-row @2xl/row:shrink-0 @2xl/row:items-center">
									{/* The label shows only in the STACKED layout. Wide, the
									    picker sits beside Approve where its meaning is plain;
									    narrow, an unlabelled dropdown reading "Financial Head"
									    is indistinguishable from a statement of fact. */}
									<label className="flex flex-col gap-1 @2xl/row:contents">
										<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide @2xl/row:sr-only">
											{t.portalUi.roleToGrant}
										</span>
										<select
											value={choice}
											disabled={busy}
											onChange={(e) =>
												setPicked((p) => ({ ...p, [m.id]: e.target.value }))
											}
											/*
											 * `color-scheme: dark` for the reason the sign-up picker
											 * needed it: a native popup is painted by the OS, and on
											 * a light-themed Windows it opens white with near-white
											 * options — unreadable one row at a time.
											 */
											style={{ colorScheme: "dark" }}
											className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm @2xl/row:w-auto"
											aria-label={t.portalUi.roleToGrant}
										>
											{APPROVABLE[kind].map((r) => (
												<option key={r} value={r}>
													{portalRoleLabel(r, t)}
												</option>
											))}
										</select>
									</label>

									<div className="flex gap-2">
										<button
											type="button"
											disabled={busy}
											onClick={() => {
												setError("");
												changeMember.mutate(
													{ memberId: m.id, status: "active", subRole: choice },
													{
														onError: (e) =>
															setError(
																serverMessage(e, t.portalUi.approveFailed),
															),
													},
												);
											}}
											className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-foreground px-3 py-2 font-semibold text-background text-sm disabled:opacity-50 @2xl/row:flex-none"
										>
											<UserCheck className="h-4 w-4 shrink-0" />
											{t.portalUi.approveJoin}
										</button>

										<button
											type="button"
											disabled={busy}
											onClick={() => {
												setError("");
												removeMember.mutate(m.id, {
													onError: (e) =>
														setError(
															serverMessage(e, t.portalUi.declineFailed),
														),
												});
											}}
											className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50 @2xl/row:flex-none"
										>
											<UserX className="h-4 w-4 shrink-0" />
											{t.portalUi.declineJoin}
										</button>
									</div>
								</div>
							)}
						</div>
					</Wrapper>
				);
			})}
		</div>
	);
}
