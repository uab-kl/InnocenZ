import { outletMatches } from "@agency-portal/lib/portal-sync";
import { fmtDateLabelFromIso } from "@agency-portal/lib/pr-demo";
import { DEFAULT_ROSTER_DATE_ISO } from "@agency-portal/lib/roster-availability";
import {
	adminServiceCostForOrder,
	isOthersService,
	type PartyAcceptance,
	recomputeSpecialServiceStatus,
	type SpecialServiceInitiator,
	type SpecialServiceRecord,
	type SpecialServiceStatus,
	specialServiceOffer,
} from "@agency-portal/lib/special-service-demo";

export type SubmitSpecialServiceInput = {
	initiatedBy: SpecialServiceInitiator;
	raisedBy: string;
	prId: string;
	prName: string;
	outlet: string;
	serviceType: string;
	customServiceName?: string;
	description: string;
	amountIn: number;
	amountOut: number;
	time: string;
	dateIso?: string;
};

function stampNow() {
	return new Date().toLocaleString("en-MY", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function isRealOutlet(outlet: string) {
	return outlet.trim().length > 0 && outlet !== "Agency service";
}

function withStatus(record: SpecialServiceRecord): SpecialServiceRecord {
	return { ...record, status: recomputeSpecialServiceStatus(record) };
}

export function buildSpecialServiceOrder(
	input: SubmitSpecialServiceInput,
	id: string,
): SpecialServiceRecord {
	const dateIso = input.dateIso ?? DEFAULT_ROSTER_DATE_ISO;
	const offer = specialServiceOffer(input.serviceType);

	let adminAccepted: PartyAcceptance = "n/a";
	let agencyAccepted: PartyAcceptance = "pending";
	let prAcceptance: PartyAcceptance = "n/a";
	let outletAcceptance: PartyAcceptance = "n/a";

	if (input.initiatedBy === "agency") {
		adminAccepted = "pending";
		agencyAccepted = "accepted";
	} else if (input.initiatedBy === "outlet") {
		// Outlet job postings go to InnocenZ admin (same gate as agency posts).
		adminAccepted = "pending";
		agencyAccepted = "accepted";
		outletAcceptance = "accepted";
		prAcceptance = "n/a";
	} else {
		prAcceptance = "accepted";
		outletAcceptance = "n/a";
	}

	const base: SpecialServiceRecord = {
		id,
		prId: input.prId,
		prName: input.prName,
		outlet: input.outlet,
		date: fmtDateLabelFromIso(dateIso),
		dateIso,
		time: input.time,
		serviceType: input.serviceType,
		customServiceName: isOthersService(input.serviceType)
			? input.customServiceName?.trim() || undefined
			: undefined,
		description:
			input.description.trim() || offer?.summary || input.serviceType,
		amountIn: input.amountIn,
		amountOut: input.amountOut,
		initiatedBy: input.initiatedBy,
		raisedBy: input.raisedBy,
		adminAccepted,
		agencyAccepted,
		prAcceptance,
		outletAcceptance,
		status:
			input.initiatedBy === "agency" || input.initiatedBy === "outlet"
				? "pending_admin"
				: "pending_agency",
	};

	return withStatus(base);
}

function isAdminJobPosting(record: SpecialServiceRecord) {
	return record.initiatedBy === "agency" || record.initiatedBy === "outlet";
}

export function approveSpecialServiceByAdmin(
	record: SpecialServiceRecord,
): SpecialServiceRecord {
	if (!isAdminJobPosting(record) || record.adminAccepted !== "pending")
		return record;
	return withStatus({
		...record,
		adminAccepted: "accepted",
		amountOut: adminServiceCostForOrder(record),
		approvedAt: stampNow(),
	});
}

export function declineSpecialServiceByAdmin(
	record: SpecialServiceRecord,
	reason?: string,
): SpecialServiceRecord {
	if (!isAdminJobPosting(record) || record.adminAccepted !== "pending")
		return record;
	return withStatus({
		...record,
		adminAccepted: "declined",
		declinedBy: "admin",
		declineReason: reason?.trim() || "Rejected by InnocenZ admin",
	});
}

export function approveSpecialServiceByAgency(
	record: SpecialServiceRecord,
): SpecialServiceRecord {
	if (record.agencyAccepted !== "pending") return record;

	const next: SpecialServiceRecord = {
		...record,
		agencyAccepted: "accepted",
		approvedAt: stampNow(),
	};

	// PR self-orders — agency approval confirms (PR already committed).
	if (next.initiatedBy === "pr") {
		return withStatus(next);
	}

	// Outlet orders — outlet committed; assigned PR must accept after agency approval.
	if (next.initiatedBy === "outlet") {
		if (next.prId) {
			next.prAcceptance = "pending";
		}
		return withStatus(next);
	}

	// Agency-initiated — PR and/or outlet must accept.
	if (next.prId && next.prAcceptance === "n/a") {
		next.prAcceptance = "pending";
	}
	if (isRealOutlet(next.outlet) && next.outletAcceptance === "n/a") {
		next.outletAcceptance = "pending";
	}

	return withStatus(next);
}

export function declineSpecialServiceByAgency(
	record: SpecialServiceRecord,
	reason?: string,
): SpecialServiceRecord {
	return withStatus({
		...record,
		agencyAccepted: "declined",
		declinedBy: "agency",
		declineReason: reason?.trim() || "Declined by agency",
	});
}

export function acceptSpecialServiceByPr(
	record: SpecialServiceRecord,
): SpecialServiceRecord {
	if (record.prAcceptance !== "pending") return record;
	return withStatus({ ...record, prAcceptance: "accepted" });
}

export function declineSpecialServiceByPr(
	record: SpecialServiceRecord,
	reason?: string,
): SpecialServiceRecord {
	if (record.prAcceptance !== "pending") return record;
	return withStatus({
		...record,
		prAcceptance: "declined",
		declinedBy: "pr",
		declineReason: reason?.trim() || "Declined by PR",
	});
}

export function acceptSpecialServiceByOutlet(
	record: SpecialServiceRecord,
): SpecialServiceRecord {
	if (record.outletAcceptance !== "pending") return record;
	return withStatus({ ...record, outletAcceptance: "accepted" });
}

export function declineSpecialServiceByOutlet(
	record: SpecialServiceRecord,
	reason?: string,
): SpecialServiceRecord {
	if (record.outletAcceptance !== "pending") return record;
	return withStatus({
		...record,
		outletAcceptance: "declined",
		declinedBy: "outlet",
		declineReason: reason?.trim() || "Declined by outlet",
	});
}

export function specialServicesForOutlet(
	records: SpecialServiceRecord[],
	outletName: string,
): SpecialServiceRecord[] {
	return records.filter((r) => outletMatches(r.outlet, outletName));
}

export function specialServicesForPr(
	records: SpecialServiceRecord[],
	prId: string,
): SpecialServiceRecord[] {
	return records.filter((r) => r.prId === prId);
}

export function pendingSpecialServicesForPr(
	records: SpecialServiceRecord[],
	prId: string,
): SpecialServiceRecord[] {
	return records.filter(
		(r) =>
			r.prId === prId && r.prAcceptance === "pending" && r.initiatedBy !== "pr",
	);
}

export function pendingSpecialServicesForOutlet(
	records: SpecialServiceRecord[],
	outletName: string,
): SpecialServiceRecord[] {
	return records.filter(
		(r) =>
			outletMatches(r.outlet, outletName) &&
			r.outletAcceptance === "pending" &&
			r.initiatedBy !== "outlet",
	);
}

export function pendingSpecialServicesForAgency(
	records: SpecialServiceRecord[],
): SpecialServiceRecord[] {
	return records.filter(
		(r) => r.agencyAccepted === "pending" && r.initiatedBy !== "agency",
	);
}

export function pendingSpecialServicesForAdmin(
	records: SpecialServiceRecord[],
): SpecialServiceRecord[] {
	return records.filter(
		(r) => isAdminJobPosting(r) && r.adminAccepted === "pending",
	);
}

/** Agency- and outlet-submitted jobs that go through InnocenZ admin review. */
export function agencyPostedSpecialServices(
	records: SpecialServiceRecord[],
): SpecialServiceRecord[] {
	return records.filter((r) => isAdminJobPosting(r));
}

export function isSpecialServiceActionable(
	record: SpecialServiceRecord,
	role: "agency" | "outlet" | "pr" | "admin",
): boolean {
	if (
		record.status === "declined" ||
		record.status === "rejected" ||
		record.status === "paid"
	) {
		return false;
	}
	if (role === "admin") {
		return isAdminJobPosting(record) && record.adminAccepted === "pending";
	}
	if (role === "agency")
		return (
			record.agencyAccepted === "pending" && record.initiatedBy !== "agency"
		);
	if (role === "pr") return record.prAcceptance === "pending";
	return record.outletAcceptance === "pending";
}
