import { IzCard, IzSectionLabel } from "@agency-portal/components/iz/ui";
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
import { fetchRoles } from "@/services/rbac";

/** Fallback when portal RBAC roles have not been seeded yet. */
const FALLBACK_SUB_ROLES: Record<
	OrgKind,
	Array<{ value: string; label: string }>
> = {
	agency: [
		{ value: "owner", label: "Owner" },
		{ value: "finance", label: "Finance" },
	],
	outlet: [
		{ value: "owner", label: "Owner" },
		{ value: "finance", label: "Finance" },
		{ value: "operations_head", label: "Ops" },
	],
};

function formatRoleName(name: string) {
	return name.replace(/_/g, " ");
}

function inferSubRole(kind: OrgKind, roleName: string): string {
	const n = roleName.trim().toLowerCase().replace(/[_\s]+/g, " ");
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
		queryKey: ["portal-invite-roles", kind],
		queryFn: async () => {
			const res = await fetchRoles({ pageSize: 200, status: "active" }, kickToLogin);
			return (res.data ?? []).filter(
				(r) => r.portalCode === kind && r.status === "active",
			);
		},
		staleTime: 60_000,
	});

	const portalRoles = rolesQuery.data ?? [];

	const inviteOptions = useMemo(() => {
		if (portalRoles.length === 0) {
			return FALLBACK_SUB_ROLES[kind].map((r) => ({
				key: r.value,
				label: r.label,
				roleId: null as string | null,
				subRole: r.value,
			}));
		}
		return portalRoles
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

	const [email, setEmail] = useState("");
	const [selectedKey, setSelectedKey] = useState("");
	const [confirmingId, setConfirmingId] = useState<string | null>(null);

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
			toast(
				result.message?.trim() ||
					`Invitation sent to ${trimmed} — they must accept the email to join`,
				"success",
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

	const onRemove = async (member: OrgMember) => {
		try {
			await removeMember.mutateAsync(member.id);
			setConfirmingId(null);
			toast("Member removed", "success");
		} catch (error) {
			setConfirmingId(null);
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
							className="flex flex-wrap items-center gap-2 border-b border-[var(--iz-line)] py-2.5 last:border-0"
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
								<span className="iz-pill iz-pill-amber !text-[10px]">
									{member.status}
								</span>
							)}

							{canManage && !isSelf ? (
								<select
									className="iz-field-input !w-auto !text-xs"
									value={member.subRole}
									onChange={(e) => void onChangeRole(member, e.target.value)}
									aria-label={`Role for ${member.username || member.email || "member"}`}
								>
									{memberRoleOptions.map((role) => (
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

							{canManage &&
								!isSelf &&
								(confirmingId === member.id ? (
									<span className="flex items-center gap-1">
										<button
											type="button"
											className="iz-btn iz-btn-soft !px-2 !py-1 !text-[11px]"
											onClick={() => void onRemove(member)}
										>
											Confirm
										</button>
										<button
											type="button"
											className="iz-btn iz-btn-soft !px-2 !py-1 !text-[11px]"
											onClick={() => setConfirmingId(null)}
										>
											Cancel
										</button>
									</span>
								) : (
									<button
										type="button"
										className="iz-btn iz-btn-soft !px-2 !py-1"
										aria-label={`Remove ${member.username || member.email || "member"}`}
										onClick={() => setConfirmingId(member.id)}
									>
										<Trash2 className="h-3.5 w-3.5" />
									</button>
								))}
						</div>
					);
				})}
			</IzCard>

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
					</IzCard>
				</>
			)}
		</>
	);
}
