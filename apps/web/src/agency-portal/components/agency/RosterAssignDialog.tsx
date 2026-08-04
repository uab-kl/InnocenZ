import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { IzSelect } from "@agency-portal/components/iz/ui";
import { useRosterMutations } from "@agency-portal/hooks/use-roster-mutations";
import { useQuery } from "@tanstack/react-query";
import { UserPlus, X } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchOutlets } from "@/services/outlet/outlet";
import { fetchPrPersonnel } from "@/services/pr-personnel";
import { fetchShifts } from "@/services/shift";

interface RosterAssignDialogProps {
	open: boolean;
	onClose: () => void;
	fromDate: string;
	toDate: string;
}

/**
 * Planning-view dialog to assign a PR to an open backend shift. Reads the same
 * roster queries the page already loads (shifts for the week + PRs + outlets),
 * lets the user pick an open shift (one with remaining capacity) and a PR, then
 * calls the roster `assign` mutation (→ createShiftAssignment). The mutation
 * invalidates the roster queries, so the new assignment shows up as a slot and
 * the shift's filled count updates. Uses real backend ids throughout.
 */
export function RosterAssignDialog({
	open,
	onClose,
	fromDate,
	toDate,
}: RosterAssignDialogProps) {
	const { logout } = useAuth();
	const { assign } = useRosterMutations();

	// Same query keys as useRosterSlots / RosterAddShiftDialog, so this reads
	// from the roster cache the page already populated.
	const shiftsQuery = useQuery({
		queryKey: ["roster", "shifts", fromDate, toDate],
		queryFn: () => fetchShifts({ fromDate, toDate, pageSize: 200 }, logout),
		staleTime: 30_000,
		enabled: open,
	});
	const prsQuery = useQuery({
		queryKey: ["roster", "prs"],
		queryFn: () => fetchPrPersonnel({ pageSize: 500 }, logout),
		staleTime: 60_000,
		enabled: open,
	});
	const outletsQuery = useQuery({
		queryKey: ["roster", "outlets"],
		queryFn: () => fetchOutlets({ pageSize: 500 }, logout),
		staleTime: 60_000,
		enabled: open,
	});

	const outletNameById = useMemo(
		() => new Map((outletsQuery.data?.data ?? []).map((o) => [o.id, o.name])),
		[outletsQuery.data],
	);

	// Only shifts with remaining capacity; sealed shifts are locked.
	const openShifts = useMemo(
		() =>
			(shiftsQuery.data?.data ?? [])
				.filter((s) => s.status !== "sealed" && s.filled < s.quantity)
				.sort((a, b) => a.shiftDate.localeCompare(b.shiftDate)),
		[shiftsQuery.data],
	);
	const prs = prsQuery.data?.data ?? [];

	const [shiftId, setShiftId] = useState("");
	const [prId, setPrId] = useState("");

	// Reset the form each time the dialog opens.
	useEffect(() => {
		if (!open) return;
		setShiftId("");
		setPrId("");
	}, [open]);

	const handleClose = () => {
		assign.reset();
		onClose();
	};

	const isValid = shiftId !== "" && prId !== "";

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		if (!isValid || assign.isPending) return;
		const pr = prs.find((p) => p.id === prId);
		assign.mutate(
			{ shiftId, prId, userId: pr?.userId ?? undefined },
			{ onSuccess: handleClose },
		);
	};

	const shiftsLoading = shiftsQuery.isLoading || outletsQuery.isLoading;

	return (
		<IzSheet open={open} onClose={assign.isPending ? () => {} : handleClose}>
			<form onSubmit={handleSubmit}>
				<div className="iz-sheet-head">
					<div>
						<p className="iz-tiny iz-muted2 uppercase tracking-widest">
							Planning
						</p>
						<h3>Assign PR</h3>
					</div>
					<button
						type="button"
						className="iz-sheet-close"
						onClick={handleClose}
						disabled={assign.isPending}
						aria-label="Close"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div>
					<span className="iz-field-label">Open shift</span>
					<IzSelect
						block
						value={shiftId}
						onChange={(e) => setShiftId(e.target.value)}
						disabled={shiftsLoading}
						aria-label="Open shift"
					>
						<option value="">
							{shiftsLoading
								? "Loading shifts…"
								: openShifts.length === 0
									? "No open shifts this week"
									: "Select shift…"}
						</option>
						{openShifts.map((s) => {
							const outlet = outletNameById.get(s.outletId) ?? s.outletId;
							const label = s.slot || s.eventName || "Shift";
							return (
								<option key={s.id} value={s.id}>
									{outlet} · {s.shiftDate} · {label} · {s.filled}/{s.quantity}
								</option>
							);
						})}
					</IzSelect>
				</div>

				<div className="mt-4">
					<span className="iz-field-label">PR</span>
					<IzSelect
						block
						value={prId}
						onChange={(e) => setPrId(e.target.value)}
						disabled={prsQuery.isLoading}
						aria-label="PR"
					>
						<option value="">
							{prsQuery.isLoading ? "Loading PRs…" : "Select PR…"}
						</option>
						{prs.map((p) => (
							<option key={p.id} value={p.id}>
								{p.nickname ? `${p.name} (${p.nickname})` : p.name}
							</option>
						))}
					</IzSelect>
				</div>

				{assign.isError && (
					<p className="iz-tiny mt-3 text-[var(--iz-danger,#dc2626)]">
						Couldn't assign the PR. Please try again.
					</p>
				)}

				<button
					type="submit"
					className="iz-btn iz-btn-primary mt-5 w-full"
					disabled={!isValid || assign.isPending}
				>
					{assign.isPending ? "Assigning…" : "Assign PR"}
				</button>

				<p className="iz-tiny iz-muted mt-3 flex items-center gap-1">
					<UserPlus className="h-3 w-3" />
					Schedules the PR onto the shift and adds a roster slot.
				</p>
			</form>
		</IzSheet>
	);
}
