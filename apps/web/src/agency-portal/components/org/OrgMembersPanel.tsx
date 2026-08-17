import { IzCard, IzSectionLabel } from "@agency-portal/components/iz/ui";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@agency-portal/components/ui/alert-dialog";
import {
	type OrgKind,
	type OrgMember,
	serverMessage,
	useOrgMembers,
} from "@agency-portal/hooks/use-org-members";
import { useStore } from "@agency-portal/lib/store";
import { useQuery } from "@tanstack/react-query";
import { Mail, Trash2, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { kickToLogin } from "@/lib/auth/guards";
import { useProfile } from "@/lib/auth/use-profile";
import { fetchAgencyInviteRoles } from "@/services/agency";
import { fetchOutletInviteRoles } from "@/services/outlet";

/**
 * Fallback when portal RBAC roles have not been seeded yet.
 *
 * These are the lanes a member can HOLD. Owner is deliberately not one you can
 * invite into — see `inviteOptions` — but it stays here because the role picker
 * on an existing member still has to offer it.
 */
const FALLBACK_SUB_ROLES: Record<
	OrgKind,
	Array<{ value: string; label: string }>
> = {
	agency: [
		{ value: "owner", label: "Owner" },
		{ value: "finance", label: "Finance" },
		{ value: "director", label: "Director" },
		{ value: "guarantor", label: "Guarantor" },
	],
	outlet: [
		{ value: "owner", label: "Owner" },
		{ value: "finance", label: "Finance" },
		{ value: "operations_head", label: "Ops" },
		{ value: "director", label: "Director" },
		{ value: "guarantor", label: "Guarantor" },
	],
};

function formatRoleName(name: string) {
	return name.replace(/_/g, " ");
}

function inferSubRole(kind: OrgKind, roleName: string): string {
	const n = roleName
		.trim()
		.toLowerCase()
		.replace(/[_\s]+/g, " ");
	// Ahead of the owner test, and of the fallback below — which lands on a WRITE
	// lane on either portal (finance for an agency, ops head for an outlet). A
	// Director falling through here is what made the Team picker label a
	// view-only member "Finance", and picking from that select would have
	// silently promoted them.
	if (n.includes("director")) return "director";
	if (n.includes("guarantor")) return "guarantor";
	if (
		n === "owner" ||
		n.includes("owner") ||
		n === "agency" ||
		n === "outlet"
	) {
		return "owner";
	}
	if (n.includes("finance")) return "finance";
	if (kind === "outlet" && (n.includes("ops") || n.includes("operation"))) {
		return "operations_head";
	}
	return kind === "agency" ? "finance" : "operations_head";
}

/**
 * Staff of one organisation: who is in it, what they may do, and adding or
 * removing them.
 *
 * Invite role options come from RBAC roles for this portal only.
 * Membership still uses owner / finance / ops for org gates; the selected
 * portal role is what gets granted on accept.
 */
export function OrgMembersPanel({
	kind,
	orgId,
	canManage,
}: {
	kind: OrgKind;
	orgId: string | null;
	canManage: boolean;
}) {
	const toast = useStore((s) => s.toast);
	const { data: me } = useProfile();
	const { members, isLoading, addMember, changeMember, removeMember } =
		useOrgMembers(kind, orgId);

	const rolesQuery = useQuery({
		queryKey: ["portal-invite-roles", kind, orgId ?? "none"],
		enabled: Boolean(orgId),
		queryFn: async () => {
			const id = orgId as string;
			const res =
				kind === "agency"
					? await fetchAgencyInviteRoles(id, kickToLogin)
					: await fetchOutletInviteRoles(id, kickToLogin);
			return (res.data ?? []).map((r) => ({
				roleId: r.id,
				roleName: r.roleName,
				portalCode: r.portalCode,
				status: r.status,
			}));
		},
		staleTime: 60_000,
	});

	const portalRoles = rolesQuery.data ?? [];

	/**
	 * Roles you may invite INTO — never Owner.
	 *
	 * An invite goes to an address with no account yet, so offering Owner hands
	 * the organisation to whoever opens that email. Ownership still moves: invite
	 * them into a lower lane, then change their role from the member list once
	 * they have accepted. The server refuses an Owner invite either way; this
	 * filter is what keeps a stale roles response from showing a dead option.
	 */
	const inviteOptions = useMemo(() => {
		// Guarantor is excluded alongside Owner: it holds the owner's matrix, so an
		// emailed invitation into it hands whoever opens the link the top lane.
		// The server refuses both (see addMember) — this only keeps the dropdown
		// from offering something that would 400.
		const invitable = portalRoles.filter((r) => {
			const lane = inferSubRole(kind, r.roleName);
			return lane !== "owner" && lane !== "guarantor";
		});
		if (invitable.length === 0) {
			return FALLBACK_SUB_ROLES[kind]
				.filter((r) => r.value !== "owner")
				.map((r) => ({
					key: r.value,
					label: r.label,
					roleId: null as string | null,
					subRole: r.value,
				}));
		}
		return invitable
			.slice()
			.sort((a, b) =>
				formatRoleName(a.roleName).localeCompare(formatRoleName(b.roleName)),
			)
			.map((r) => ({
				key: r.roleId,
				label: formatRoleName(r.roleName),
				roleId: r.roleId as string,
				subRole: inferSubRole(kind, r.roleName),
			}));
	}, [kind, portalRoles]);

	const memberRoleOptions = useMemo(() => {
		// Membership change still writes sub_role enum — one option per lane,
		// labeled from a matching portal role when available.
		const lanes = FALLBACK_SUB_ROLES[kind];
		return lanes.map((lane) => {
			const match = portalRoles.find(
				(r) => inferSubRole(kind, r.roleName) === lane.value,
			);
			return {
				value: lane.value,
				label: match ? formatRoleName(match.roleName) : lane.label,
			};
		});
	}, [kind, portalRoles]);

	const labelForSubRole = (subRole: string) =>
		memberRoleOptions.find((r) => r.value === subRole)?.label ?? subRole;

	/**
	 * Lanes this picker may move a member INTO — never Owner, matching the invite
	 * box. `memberRoleOptions` keeps every lane because it is also what labels a
	 * row, and an owner still has to read as "Owner".
	 *
	 * Consequence: an owner cannot be demoted from this screen either, which is
	 * why an owner's row renders as text rather than a select — a select whose
	 * options exclude the current value would display the wrong lane and fire a
	 * change on first touch. `PUT /:id/members/:memberId` still accepts owner.
	 */
	const assignableRoleOptions = memberRoleOptions.filter(
		(r) => r.value !== "owner",
	);

	const [email, setEmail] = useState("");
	const [selectedKey, setSelectedKey] = useState("");
	// Only set when the server saved the invite but could not email it. Without
	// this the accept link went to the console and the invite was unreachable.
	const [manualLink, setManualLink] = useState<{
		to: string;
		url: string;
	} | null>(null);
	const [memberToRemove, setMemberToRemove] = useState<OrgMember | null>(null);

	// Keep selection valid when options swap (fallback lanes → portal role ids).
	useEffect(() => {
		if (inviteOptions.length === 0) {
			setSelectedKey("");
			return;
		}
		if (!inviteOptions.some((o) => o.key === selectedKey)) {
			setSelectedKey(inviteOptions[0]!.key);
		}
	}, [inviteOptions, selectedKey]);

	if (!orgId) return null;

	const selected = inviteOptions.find((o) => o.key === selectedKey);

	const onAdd = async () => {
		const trimmed = email.trim();
		if (!trimmed) {
			toast("Enter the person's email", "warn");
			return;
		}
		if (!selected) {
			toast("Pick a role for this invite", "warn");
			return;
		}
		try {
			const result = await addMember.mutateAsync({
				email: trimmed,
				subRole: selected.subRole,
				roleId: selected.roleId ?? undefined,
			});
			setEmail("");
			const acceptUrl = result.acceptUrl;
			toast(
				result.message?.trim() ||
					`Invitation sent to ${trimmed} — they must accept the email to join`,
				"success",
			);
			setManualLink(
				acceptUrl && result.emailed === false
					? { to: trimmed, url: acceptUrl }
					: null,
			);
		} catch (error) {
			toast(serverMessage(error, "Could not invite that person"), "warn");
		}
	};

	const onChangeRole = async (member: OrgMember, subRole: string) => {
		if (subRole === member.subRole) return;
		try {
			await changeMember.mutateAsync({ memberId: member.id, subRole });
			toast(`Role changed to ${labelForSubRole(subRole)}`, "success");
		} catch (error) {
			toast(serverMessage(error, "Could not change that role"), "warn");
		}
	};

	const onRemove = async () => {
		if (!memberToRemove) return;
		const member = memberToRemove;
		try {
			await removeMember.mutateAsync(member.id);
			setMemberToRemove(null);
			toast("Member removed", "success");
		} catch (error) {
			setMemberToRemove(null);
			toast(serverMessage(error, "Could not remove that member"), "warn");
		}
	};

	return (
		<>
			<IzSectionLabel>Team · {members.length} member(s)</IzSectionLabel>
			<IzCard>
				{isLoading && <p className="iz-tiny iz-muted2">Loading team…</p>}

				{!isLoading && members.length === 0 && (
					<p className="iz-tiny iz-muted2">No team members yet.</p>
				)}

				{members.map((member) => {
					const isSelf = Boolean(me?.id && member.userId === me.id);
					return (
						<div
							key={member.id}
							className="flex items-center gap-2 border-b border-[var(--iz-line)] py-2.5 last:border-0"
						>
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm font-semibold text-[var(--iz-txt)]">
									{member.username || member.email || "—"}
									{isSelf && (
										<span className="iz-tiny iz-muted ml-1.5 font-medium">
											(you)
										</span>
									)}
								</div>
								<div className="iz-tiny iz-muted truncate">
									{member.email ?? "no email"}
								</div>
							</div>

							{member.status !== "active" && (
								<span className="iz-pill iz-pill-amber shrink-0 !text-[10px]">
									{member.status}
								</span>
							)}

							<div className="flex shrink-0 items-center gap-1.5">
								{canManage && !isSelf && member.subRole !== "owner" ? (
									<select
										className="iz-field-input !w-auto !text-xs"
										value={member.subRole}
										onChange={(e) => void onChangeRole(member, e.target.value)}
										aria-label={`Role for ${member.username || member.email || "member"}`}
									>
										{assignableRoleOptions.map((role) => (
											<option key={role.value} value={role.value}>
												{role.label}
											</option>
										))}
									</select>
								) : (
									<span className="iz-tiny iz-muted capitalize">
										{labelForSubRole(member.subRole)}
									</span>
								)}

								{canManage && !isSelf && (
									<button
										type="button"
										className="iz-btn iz-btn-sm iz-btn-soft !inline-flex !h-8 !w-8 !items-center !justify-center !p-0"
										aria-label={`Remove ${member.username || member.email || "member"}`}
										onClick={() => setMemberToRemove(member)}
									>
										<Trash2 className="h-3.5 w-3.5" />
									</button>
								)}
							</div>
						</div>
					);
				})}
			</IzCard>

			<AlertDialog
				open={Boolean(memberToRemove)}
				onOpenChange={(open) => {
					if (!open) setMemberToRemove(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove team member?</AlertDialogTitle>
						<AlertDialogDescription>
							{memberToRemove
								? `Remove ${memberToRemove.username || memberToRemove.email || "this member"} from the team? They will lose portal access for this organisation.`
								: "Remove this member from the team?"}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={removeMember.isPending}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={removeMember.isPending}
							onClick={(e) => {
								e.preventDefault();
								void onRemove();
							}}
						>
							{removeMember.isPending ? "Removing…" : "Remove"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{canManage && (
				<>
					<IzSectionLabel>Invite a team member</IzSectionLabel>
					<IzCard>
						<div className="flex flex-wrap items-center gap-2">
							<span className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-[var(--iz-line)] px-2.5">
								<Mail className="h-3.5 w-3.5 shrink-0 iz-muted" />
								<input
									className="w-full bg-transparent py-2 text-sm outline-none"
									placeholder="person@example.com"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									aria-label="Email of the person to invite"
								/>
							</span>
							<select
								className="iz-field-input relative z-10 !w-auto min-w-[7.5rem] shrink-0 !text-xs capitalize"
								value={selectedKey || inviteOptions[0]?.key || ""}
								onChange={(e) => setSelectedKey(e.target.value)}
								aria-label="Role for the new member"
								disabled={inviteOptions.length === 0}
							>
								{inviteOptions.map((role) => (
									<option key={role.key} value={role.key}>
										{role.label}
									</option>
								))}
							</select>
							<button
								type="button"
								className="iz-btn iz-btn-primary !px-3 !py-2 !text-xs"
								disabled={addMember.isPending || !selected}
								onClick={() => void onAdd()}
							>
								<UserPlus className="h-3.5 w-3.5" />
								{addMember.isPending ? "Sending…" : "Invite"}
							</button>
						</div>
						{rolesQuery.isError && (
							<p className="iz-tiny text-[var(--iz-danger)] mt-2">
								Could not load {kind} portal roles — using defaults.
							</p>
						)}
						{manualLink && (
							<p className="iz-tiny iz-muted mt-2 break-all">
								The invitation for {manualLink.to} was saved but no email went
								out. Send them this link — it expires in 7 days:{" "}
								<span className="text-[var(--iz-txt)]">{manualLink.url}</span>
							</p>
						)}
					</IzCard>
				</>
			)}
		</>
	);
}
