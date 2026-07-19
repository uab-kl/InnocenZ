import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { IzSelect } from "@agency-portal/components/iz/ui";
import { useRosterMutations } from "@agency-portal/hooks/use-roster-mutations";
import { useQuery } from "@tanstack/react-query";
import { MapPin, X } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchOutlets } from "@/services/outlet/outlet";
import type { CreateShiftInput, ShiftEventKind } from "@/services/shift";

interface RosterAddShiftDialogProps {
	open: boolean;
	onClose: () => void;
	defaultDateIso: string;
}

/**
 * Planning-view dialog to create a new (open) shift on the backend. Collects a
 * `CreateShiftInput` and calls the roster `addShift` mutation, which invalidates
 * the roster queries so the new shift is picked up. Outlets are loaded live so
 * the picker uses real backend ids. The shift starts unassigned; assigning PRs
 * to it is a separate step.
 */
export function RosterAddShiftDialog({
	open,
	onClose,
	defaultDateIso,
}: RosterAddShiftDialogProps) {
	const { logout } = useAuth();
	const { addShift } = useRosterMutations();

	const outletsQuery = useQuery({
		queryKey: ["roster", "outlets"],
		queryFn: () => fetchOutlets({ pageSize: 500 }, logout),
		staleTime: 60_000,
		enabled: open,
	});
	const outlets = outletsQuery.data?.data ?? [];

	const [outletId, setOutletId] = useState("");
	const [shiftDate, setShiftDate] = useState(defaultDateIso);
	const [slot, setSlot] = useState("");
	const [eventName, setEventName] = useState("");
	const [eventKind, setEventKind] = useState<ShiftEventKind>("normal");
	const [quantity, setQuantity] = useState("1");
	const [payPerHour, setPayPerHour] = useState("");

	// Reset the form each time the dialog opens (or the planning date changes).
	useEffect(() => {
		if (!open) return;
		setOutletId("");
		setShiftDate(defaultDateIso);
		setSlot("");
		setEventName("");
		setEventKind("normal");
		setQuantity("1");
		setPayPerHour("");
	}, [open, defaultDateIso]);

	const handleClose = () => {
		addShift.reset();
		onClose();
	};

	const isValid = outletId !== "" && shiftDate !== "";

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		if (!isValid || addShift.isPending) return;
		const qty = Number.parseInt(quantity, 10);
		const pay = Number.parseFloat(payPerHour);
		const input: CreateShiftInput = {
			outletId,
			shiftDate,
			slot: slot.trim() || undefined,
			eventName: eventName.trim() || undefined,
			eventKind,
			quantity: Number.isFinite(qty) && qty > 0 ? qty : undefined,
			payPerHour: Number.isFinite(pay) && pay >= 0 ? pay : undefined,
		};
		addShift.mutate(input, { onSuccess: handleClose });
	};

	return (
		<IzSheet open={open} onClose={addShift.isPending ? () => {} : handleClose}>
			<form onSubmit={handleSubmit}>
				<div className="iz-sheet-head">
					<div>
						<p className="iz-tiny iz-muted2 uppercase tracking-widest">
							Planning
						</p>
						<h3>Add shift</h3>
					</div>
					<button
						type="button"
						className="iz-sheet-close"
						onClick={handleClose}
						disabled={addShift.isPending}
						aria-label="Close"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div>
					<span className="iz-field-label">Outlet</span>
					<IzSelect
						block
						value={outletId}
						onChange={(e) => setOutletId(e.target.value)}
						disabled={outletsQuery.isLoading}
						aria-label="Outlet"
					>
						<option value="">
							{outletsQuery.isLoading ? "Loading outlets…" : "Select outlet…"}
						</option>
						{outlets.map((o) => (
							<option key={o.id} value={o.id}>
								{o.name}
							</option>
						))}
					</IzSelect>
				</div>

				<div className="mt-4 grid grid-cols-2 gap-3">
					<div>
						<span className="iz-field-label">Date</span>
						<input
							type="date"
							className="iz-select iz-select-block"
							value={shiftDate}
							onChange={(e) => setShiftDate(e.target.value)}
							aria-label="Shift date"
						/>
					</div>
					<div>
						<span className="iz-field-label">Slot</span>
						<input
							type="text"
							className="iz-select iz-select-block"
							value={slot}
							onChange={(e) => setSlot(e.target.value)}
							placeholder="e.g. 10:00–18:00"
							aria-label="Shift slot"
						/>
					</div>
				</div>

				<div className="mt-4">
					<span className="iz-field-label">Event name (optional)</span>
					<input
						type="text"
						className="iz-select iz-select-block"
						value={eventName}
						onChange={(e) => setEventName(e.target.value)}
						placeholder="e.g. Weekend promo"
						aria-label="Event name"
					/>
				</div>

				<div className="mt-4 grid grid-cols-3 gap-3">
					<div>
						<span className="iz-field-label">Type</span>
						<IzSelect
							block
							value={eventKind}
							onChange={(e) => setEventKind(e.target.value as ShiftEventKind)}
							aria-label="Event type"
						>
							<option value="normal">Normal</option>
							<option value="special">Special</option>
						</IzSelect>
					</div>
					<div>
						<span className="iz-field-label">Quantity</span>
						<input
							type="number"
							min={1}
							className="iz-select iz-select-block"
							value={quantity}
							onChange={(e) => setQuantity(e.target.value)}
							aria-label="Quantity"
						/>
					</div>
					<div>
						<span className="iz-field-label">Pay/hour</span>
						<input
							type="number"
							min={0}
							step="0.01"
							className="iz-select iz-select-block"
							value={payPerHour}
							onChange={(e) => setPayPerHour(e.target.value)}
							placeholder="RM"
							aria-label="Pay per hour"
						/>
					</div>
				</div>

				{addShift.isError && (
					<p className="iz-tiny mt-3 text-[var(--iz-danger,#dc2626)]">
						Couldn't create the shift. Please try again.
					</p>
				)}

				<button
					type="submit"
					className="iz-btn iz-btn-primary mt-5 w-full"
					disabled={!isValid || addShift.isPending}
				>
					{addShift.isPending ? "Creating…" : "Create shift"}
				</button>

				<p className="iz-tiny iz-muted mt-3 flex items-center gap-1">
					<MapPin className="h-3 w-3" />
					Creates an open shift; assign PRs to it afterwards.
				</p>
			</form>
		</IzSheet>
	);
}
