import { IzCard, IzSectionLabel } from "@agency-portal/components/iz/ui";
import {
	type OrgKind,
	type OrgMember,
	serverMessage,
	useOrgMembers,
} from "@agency-portal/hooks/use-org-members";
import { useStore } from "@agency-portal/lib/store";
import { Mail, Trash2, UserPlus } from "lucide-react";
import { useState } from "react";

/** Sub-roles each org actually has, mirroring the backend enums. */
const SUB_ROLES: Record<OrgKind, Array<{ value: string; label: string }>> = {
	agency: [
		{ value: "owner", label: "Owner" },
		{ value: "finance", label: "Finance Head" },
	],
	outlet: [
		{ value: "owner", label: "Owner" },
		{ value: "finance", label: "Finance Head" },
		{ value: "operations_head", label: "Ops Head" },
	],
};

const labelFor = (kind: OrgKind, subRole: string) =>
	SUB_ROLES[kind].find((r) => r.value === subRole)?.label ?? subRole;

/**
 * Staff of one organisation: who is in it, what they may do, and adding or
 * removing them.
 *
 * Every rule lives on the server — a member id from another org 404s, and
 * anything that would leave the org with no active owner 409s. This panel does
 * not pre-empt those checks; it shows what the server said. A client-side copy
 * of a permission rule drifts, and the copy that drifts is the one the user
 * believes.
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
	const { members, isLoading, addMember, changeMember, removeMember } =
		useOrgMembers(kind, orgId);
	const [email, setEmail] = useState("");
	const [newRole, setNewRole] = useState(
		kind === "agency" ? "finance" : "operations_head",
	);
	const [confirmingId, setConfirmingId] = useState<string | null>(null);

	// No real session = no org id = nothing truthful to show. Rendering an empty
	// team list on a demo session would read as "this agency has no staff".
	if (!orgId) return null;

	const onAdd = async () => {
		const trimmed = email.trim();
		if (!trimmed) {
			toast("Enter the person's email", "warn");
			return;
		}
		try {
			await addMember.mutateAsync({ email: trimmed, subRole: newRole });
			setEmail("");
			toast(`${trimmed} added as ${labelFor(kind, newRole)}`, "success");
		} catch (error) {
			toast(serverMessage(error, "Could not add that person"), "warn");
		}
	};

	const onChangeRole = async (member: OrgMember, subRole: string) => {
		if (subRole === member.subRole) return;
		try {
			await changeMember.mutateAsync({ memberId: member.id, subRole });
			toast(`Role changed to ${labelFor(kind, subRole)}`, "success");
		} catch (error) {
			// The 409 text is the only explanation of WHY, e.g. "Cannot change the
			// last active owner". A generic error would hide the rule.
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
				<p className="iz-tiny iz-muted mb-2">
					Who works here and what they may do. Roles decide who can approve
					money.
				</p>

				{isLoading && <p className="iz-tiny iz-muted2">Loading team…</p>}

				{!isLoading && members.length === 0 && (
					<p className="iz-tiny iz-muted2">No team members yet.</p>
				)}

				{members.map((member) => (
					<div
						key={member.id}
						className="flex flex-wrap items-center gap-2 border-b border-[var(--iz-line)] py-2.5 last:border-0"
					>
						<div className="min-w-0 flex-1">
							<div className="truncate text-sm font-semibold text-[var(--iz-txt)]">
								{member.username || member.email || "—"}
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

						{canManage ? (
							<select
								className="iz-field-input !w-auto !text-xs"
								value={member.subRole}
								onChange={(e) => void onChangeRole(member, e.target.value)}
								aria-label={`Role for ${member.username || member.email || "member"}`}
							>
								{SUB_ROLES[kind].map((role) => (
									<option key={role.value} value={role.value}>
										{role.label}
									</option>
								))}
							</select>
						) : (
							<span className="iz-tiny iz-muted">
								{labelFor(kind, member.subRole)}
							</span>
						)}

						{canManage &&
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
				))}
			</IzCard>

			{canManage && (
				<>
					<IzSectionLabel>Add a team member</IzSectionLabel>
					<IzCard>
						{/* No invite is sent: there is no mailer. The person must already
						    have an account, and this attaches it to the organisation. Said
						    plainly here rather than discovered as a failure. */}
						<p className="iz-tiny iz-muted mb-2">
							They must already have an InnocenZ account — no invite email is
							sent.
						</p>
						<div className="flex flex-wrap items-center gap-2">
							<span className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-[var(--iz-line)] px-2.5">
								<Mail className="h-3.5 w-3.5 shrink-0 iz-muted" />
								<input
									className="w-full bg-transparent py-2 text-sm outline-none"
									placeholder="person@example.com"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									aria-label="Email of the person to add"
								/>
							</span>
							<select
								className="iz-field-input !w-auto !text-xs"
								value={newRole}
								onChange={(e) => setNewRole(e.target.value)}
								aria-label="Role for the new member"
							>
								{SUB_ROLES[kind].map((role) => (
									<option key={role.value} value={role.value}>
										{role.label}
									</option>
								))}
							</select>
							<button
								type="button"
								className="iz-btn iz-btn-primary !px-3 !py-2 !text-xs"
								disabled={addMember.isPending}
								onClick={() => void onAdd()}
							>
								<UserPlus className="h-3.5 w-3.5" />
								{addMember.isPending ? "Adding…" : "Add"}
							</button>
						</div>
					</IzCard>
				</>
			)}
		</>
	);
}
