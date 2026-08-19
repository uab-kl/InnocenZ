import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/rbac";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { revokeUserRole, setUserStatus } from "@/services/admin";

/**
 * The two account controls, shared by every user-management tab that lists
 * ACCOUNTS.
 *
 * Both were impossible to perform at all until 30 Jul 2026 — an account, once
 * created, was permanent, and so was its role. The admin tab got them first;
 * this hook exists so the second tab is not a copy of the first, because the
 * parts most worth keeping identical are the confirm copy and the refusal
 * handling, and those are exactly the parts a copy drifts on.
 *
 * ⚠️ Only for tabs whose rows carry a USER id. `agency.tsx` and `outlet.tsx`
 * list organisations — an agency id sent to `PATCH /user/:id/status` addresses
 * a row that is not there. Those two already have their own org-level
 * approve/suspend, which is a different fact about a different table.
 */
export interface AccountTarget {
	id: string;
	name: string;
	status: string;
}

type Pending = {
	target: AccountTarget;
	kind: "status" | "revoke";
	next?: "active" | "inactive";
};

interface UseAccountActionsOptions {
	/** The role a "remove access" takes back, e.g. "admin" or "pr". */
	roleName: string;
	/**
	 * How that role reads mid-sentence: "admin access", "PR access".
	 * ALREADY TRANSLATED by the caller — it is dropped into a sentence this
	 * hook builds, so it has to arrive in the reader's language.
	 */
	roleLabel: string;
	/** List queries invalidated after a successful write. */
	queryKeys: string[];
}

export function useAccountActions({
	roleName,
	roleLabel,
	queryKeys,
}: UseAccountActionsOptions) {
	const { t } = usePortalLocale();
	const { logout } = useAuth();
	const queryClient = useQueryClient();

	const [pending, setPending] = useState<Pending | null>(null);

	/**
	 * The dialog animates OUT after `pending` is cleared, and Radix keeps
	 * rendering its content while it does. Reading `pending` directly there made
	 * the closing dialog flash "undefined will be able to sign in again" — the
	 * same defect this codebase keeps finding, one field short of a fact. So the
	 * copy renders from the last real target, which outlives the close.
	 */
	const [lastTarget, setLastTarget] = useState<Pending | null>(null);
	const ask = (next: Pending) => {
		setLastTarget(next);
		setPending(next);
	};
	const shown = pending ?? lastTarget;

	const settle = (message: string) => {
		for (const key of queryKeys) {
			queryClient.invalidateQueries({ queryKey: [key] });
		}
		setPending(null);
		toast.success(message);
	};
	const refuse = (err: unknown, fallback: string) => {
		setPending(null);
		// The server's sentence, not a generic failure: every refusal here explains
		// itself ("last account holding this role", "cannot change your own"), and
		// that explanation is the only useful part of the response.
		toast.error(toMutationError(err, fallback)?.message ?? fallback);
	};

	const statusMutation = useMutation({
		mutationFn: (vars: { id: string; next: "active" | "inactive" }) =>
			setUserStatus(vars.id, vars.next, logout),
		onSuccess: (r) => settle(r.message || t.admin.accountUpdated),
		onError: (err) => refuse(err, t.admin.accountChangeFailed),
	});

	const revokeMutation = useMutation({
		mutationFn: (id: string) => revokeUserRole(id, roleName, logout),
		onSuccess: (r) => settle(r.message || t.admin.roleRemoved),
		onError: (err) => refuse(err, t.admin.roleRemoveFailed),
	});

	const busyUserId = statusMutation.isPending
		? (statusMutation.variables?.id ?? null)
		: revokeMutation.isPending
			? (revokeMutation.variables ?? null)
			: null;

	const dialog = (
		<ConfirmDialog
			open={pending !== null}
			onOpenChange={(open) => {
				if (!open) setPending(null);
			}}
			title={
				shown?.kind === "revoke"
					? fill(t.admin.removeRoleTitle, { role: roleLabel })
					: shown?.next === "inactive"
						? t.admin.disableAccountTitle
						: t.admin.enableAccountTitle
			}
			description={
				!shown
					? ""
					: shown.kind === "revoke"
						? fill(t.admin.revokeRoleBody, {
								name: shown.target.name,
								role: roleLabel,
							})
						: shown.next === "inactive"
							? fill(t.admin.disableAccountBody, { name: shown.target.name })
							: fill(t.admin.enableAccountBody, { name: shown.target.name })
			}
			confirmLabel={
				shown?.kind === "revoke" ? t.admin.removeAccess : t.admin.confirm
			}
			isPending={statusMutation.isPending || revokeMutation.isPending}
			onConfirm={() => {
				if (!pending) return;
				if (pending.kind === "revoke") {
					revokeMutation.mutate(pending.target.id);
				} else if (pending.next) {
					statusMutation.mutate({ id: pending.target.id, next: pending.next });
				}
			}}
		/>
	);

	return {
		/** The row currently being written, so only its buttons go busy. */
		busyUserId,
		/** Flip an account off (or back on), behind a confirm. */
		askSetStatus: (target: AccountTarget, next: "active" | "inactive") =>
			ask({ target, kind: "status", next }),
		/** Take `roleName` back from an account, behind a confirm. */
		askRevokeRole: (target: AccountTarget) => ask({ target, kind: "revoke" }),
		/** Render this once, anywhere in the page. */
		dialog,
	};
}
