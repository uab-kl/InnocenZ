import {
	keepPreviousData,
	useMutation,
	useQueries,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertCircle,
	Archive,
	CheckCircle2,
	Eye,
	Info,
	Loader2,
	RefreshCw,
	Search,
	Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, PageShell } from "@/components/admin/page-header";
import {
	AgencyDetailsSheet,
	OutletDetailsSheet,
	orgStatusBadgeColors,
} from "@/components/organization";
import { PrDetailsSheet } from "@/components/pr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { getUserTypeByKey } from "@/constants/user-types";
import { useAccountActions } from "@/hooks/use-account-actions";
import { useAuth } from "@/lib/auth-context";
import { orgMemberIdStem } from "@/lib/member-code";
import { toMutationError } from "@/lib/mutation-error";
import {
	adminNavLabel,
	userTypeDescription,
} from "@/lib/portal-i18n/admin-nav-label";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import { formatDate, formatNumber, getErrorMessage } from "@/lib/utils";
import {
	type Agency,
	type AgencyTeamMember,
	approveAgency,
	deactivateAgency,
	fetchAgencies,
	fetchAgencyById,
	fetchAgencyTeamMembers,
} from "@/services/agency";
import {
	approveOutlet,
	deactivateOutlet,
	fetchOutletById,
	fetchOutlets,
	fetchOutletTeamMembers,
	type Outlet,
	type OutletTeamMember,
} from "@/services/outlet";
import { fetchPrUsers, type PrUser } from "@/services/pr";
import {
	type DisabledAccount,
	fetchDisabledAccounts,
	isDeletedAccountTombstone,
} from "@/services/user";

export const Route = createFileRoute("/admin/user-management/legacy-member")({
	component: LegacyMemberPage,
	head: () => ({
		meta: [{ title: "Legacy Member — Innocenz Admin" }],
	}),
});

const PAGE_SIZE = 10;
const FETCH_SIZE = 100;

/**
 * The five kinds this screen collects. The first three are ORGANISATIONS and
 * ACCOUNTS that were switched off; the last two were added 10 Sep 2026 on the
 * owner's ask to also show *people* who are no longer where they were:
 *
 *  * `member`  — an owner removed them from THEIR agency or venue. The
 *                membership row survives as `status: inactive`, which is what
 *                makes them listable at all.
 *  * `account` — an admin switched the whole ACCOUNT off, so they cannot sign
 *                in anywhere.
 *
 * ⚠️ These two must never be conflated on screen. Somebody removed from one
 * agency may still be working at another; somebody whose account is off is
 * out everywhere. Same person, opposite meanings.
 */
type LegacyRoleFilter =
	| "all"
	| "agency"
	| "outlet"
	| "pr"
	| "member"
	| "account";

type LegacyKind = Exclude<LegacyRoleFilter, "all">;
/** The three kinds that have a detail sheet behind them. */
type DetailKind = "agency" | "outlet" | "pr";
type SortBy = "name" | "createdAt" | "updatedAt";
type SortOrder = "asc" | "desc";

type LegacyRow = {
	id: string;
	role: LegacyKind;
	name: string;
	code: string;
	contact: string;
	detail: string;
	statusLabel: string;
	statusClass: string;
	createdAt: string;
	updatedAt: string;
	/**
	 * WHO switched this record off. The "Updated" column has always said WHEN
	 * and never WHO, which is the one question an archive is asked.
	 *
	 * REQUIRED, not optional, and that is the point: five different mappers
	 * build these rows, and an optional field would let four of them stay
	 * silent while still compiling — the exact shape of the `logo` bug that
	 * shipped a feature which never rendered. Every mapper must answer, even
	 * if the answer is "—".
	 */
	deactivatedBy: string;
	/** `member` rows only — where to send an admin who wants to restore them. */
	orgKind?: "agency" | "outlet";
	orgId?: string;
};

/**
 * The role a legacy row belongs to, as the badge and the Role filter render it.
 *
 * The record KEYS are the stored roles — they are what the filter compares and
 * what `LegacyRow.role` switches on — so only the label moves. It holds
 * FUNCTIONS rather than strings because this is module scope, where no hook can
 * run: storing `"adminUsers.roleAgency"` here would type-check and then print
 * the key name into the badge.
 */
const roleLabels: Record<LegacyKind, (t: PortalTranslations) => string> = {
	agency: (t) => t.adminUsers.roleAgency,
	outlet: (t) => t.adminUsers.roleOutlet,
	pr: (t) => t.adminUsers.rolePr,
	member: (t) => t.adminUsers.roleRemovedMember,
	account: (t) => t.adminUsers.roleDisabledAccount,
};

const roleBadgeColors: Record<LegacyKind, string> = {
	agency: "border-(--lavender-soft)/50 bg-(--lavender-soft)/15 text-lavender",
	outlet: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
	pr: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
	member: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
	account:
		"border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300",
};

async function fetchAllAgencies(onRefreshFail: () => void): Promise<Agency[]> {
	const rows: Agency[] = [];
	let page = 1;
	let hasNextPage = true;
	while (hasNextPage) {
		const response = await fetchAgencies(
			{ status: "suspended", page, pageSize: FETCH_SIZE },
			onRefreshFail,
		);
		rows.push(...response.data);
		hasNextPage = response.pagination.hasNextPage;
		page += 1;
	}
	return rows;
}

async function fetchAllOutlets(onRefreshFail: () => void): Promise<Outlet[]> {
	const rows: Outlet[] = [];
	let page = 1;
	let hasNextPage = true;
	while (hasNextPage) {
		const response = await fetchOutlets(
			{ status: "suspended", page, pageSize: FETCH_SIZE },
			onRefreshFail,
		);
		rows.push(...response.data);
		hasNextPage = response.pagination.hasNextPage;
		page += 1;
	}
	return rows;
}

async function fetchAllInactivePrs(
	onRefreshFail: () => void,
): Promise<PrUser[]> {
	const rows: PrUser[] = [];
	let page = 1;
	let hasNextPage = true;
	while (hasNextPage) {
		const response = await fetchPrUsers(
			{ status: "inactive", page, pageSize: FETCH_SIZE },
			onRefreshFail,
		);
		rows.push(...response.data);
		hasNextPage = response.pagination.hasNextPage;
		page += 1;
	}
	return rows;
}

/**
 * EVERY operator membership on the platform, active ones included.
 *
 * `status: "all"` is deliberate and load-bearing. The removed rows alone
 * would answer "who was removed" but not the question that actually matters
 * on this screen — whether that person is still working SOMEWHERE ELSE. Only
 * the full set can answer both, and getting it wrong produces the single most
 * misleading row this page can render: somebody shown as gone from the
 * platform who is in fact running another agency this morning.
 */
async function fetchAllAgencyMemberships(
	onRefreshFail: () => void,
): Promise<AgencyTeamMember[]> {
	const rows: AgencyTeamMember[] = [];
	let page = 1;
	let hasNextPage = true;
	while (hasNextPage) {
		const response = await fetchAgencyTeamMembers(
			{ status: "all", page, pageSize: FETCH_SIZE },
			onRefreshFail,
		);
		rows.push(...response.data);
		hasNextPage = response.pagination.hasNextPage;
		page += 1;
	}
	return rows;
}

async function fetchAllOutletMemberships(
	onRefreshFail: () => void,
): Promise<OutletTeamMember[]> {
	const rows: OutletTeamMember[] = [];
	let page = 1;
	let hasNextPage = true;
	while (hasNextPage) {
		const response = await fetchOutletTeamMembers(
			{ status: "all", page, pageSize: FETCH_SIZE },
			onRefreshFail,
		);
		rows.push(...response.data);
		hasNextPage = response.pagination.hasNextPage;
		page += 1;
	}
	return rows;
}

async function fetchAllDisabledAccounts(
	onRefreshFail: () => void,
): Promise<DisabledAccount[]> {
	const rows: DisabledAccount[] = [];
	let page = 1;
	let hasNextPage = true;
	while (hasNextPage) {
		const response = await fetchDisabledAccounts(
			{ status: "inactive", page, pageSize: FETCH_SIZE },
			onRefreshFail,
		);
		rows.push(...response.data);
		hasNextPage = response.pagination.hasNextPage;
		page += 1;
	}
	return rows;
}

/**
 * WHO switched it off, as a label.
 *
 * `updatedByName` is resolved server-side by a LEFT JOIN from `updated_by` to
 * `user` (see `apps/backend/src/util/actor-name.ts`), so it is null in exactly
 * three cases and they do not mean the same thing:
 *
 *   * the actor was the literal `'system'` — a scheduler or an
 *     unauthenticated path, so there IS no person to name;
 *   * `updated_by` holds an id whose account has since been deleted — there
 *     WAS a person and we can no longer say who;
 *   * the column is empty, which only older rows can be.
 *
 * Printing a raw uuid was the alternative and is refused: this screen is read
 * by an admin deciding whether a removal was legitimate, and a 36-character
 * hex string answers that question no better than a blank does.
 */
/** A `updated_by` that is a real account id, rather than a service token. */
const ACTOR_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function actorLabel(
	row: { updatedBy?: string | null; updatedByName?: string | null },
	t: PortalTranslations,
): string {
	if (row.updatedByName) return row.updatedByName;
	const raw = row.updatedBy?.trim();
	if (!raw) return "—";
	if (raw === "system") return t.adminUsers.actorSystem;
	/*
	 * An id-SHAPED value with no name behind it means the account was deleted:
	 * there was a person and we can no longer say who. Anything else is a
	 * service token, and those are deliberately descriptive — the live data
	 * holds `seed-atlas-agency-role-accounts`, `seed-why-we-met` and the like.
	 * Printing the token beats both alternatives: "Unknown" throws away a true
	 * answer, and "System" invents a single actor where there were several.
	 */
	return ACTOR_UUID.test(raw) ? t.adminUsers.actorUnknown : raw;
}

/*
 * The mappers take `t` for ONE field: `statusLabel`, which is the only
 * piece of a row that is copy rather than stored data. Everything else here is
 * a name, a code or a contact detail the record itself carries, and stays
 * exactly as the API returned it.
 *
 * `orgStatusLabels` is deliberately not used for it any more — that map is a
 * module-scope English record shared with the org tables, so reading it here
 * would have pinned this page's status column to English no matter the locale.
 */
function mapAgencyRow(agency: Agency, t: PortalTranslations): LegacyRow {
	return {
		id: agency.id,
		role: "agency",
		name: agency.name,
		code:
			orgMemberIdStem("agency", agency.memberCodePrefix) || agency.ssmNo || "—",
		contact: agency.contactName || "—",
		detail: [agency.contactEmail, agency.contactPhone]
			.filter(Boolean)
			.join(" · "),
		statusLabel: t.admin.statusSuspended,
		statusClass: orgStatusBadgeColors.suspended,
		createdAt: agency.createdAt,
		updatedAt: agency.updatedAt,
		deactivatedBy: actorLabel(agency, t),
	};
}

function mapOutletRow(outlet: Outlet, t: PortalTranslations): LegacyRow {
	const place = [outlet.state, outlet.country].filter(Boolean).join(", ");
	return {
		id: outlet.id,
		role: "outlet",
		name: outlet.name,
		code: outlet.ssmNo || outlet.businessLicense || "—",
		contact: place || "—",
		detail: [outlet.addressLine1, outlet.postcode].filter(Boolean).join(", "),
		statusLabel: t.admin.statusSuspended,
		statusClass: orgStatusBadgeColors.suspended,
		createdAt: outlet.createdAt,
		updatedAt: outlet.updatedAt,
		deactivatedBy: actorLabel(outlet, t),
	};
}

function mapPrRow(user: PrUser, t: PortalTranslations): LegacyRow {
	return {
		id: user.id,
		role: "pr",
		name: user.legalName || user.displayName || "—",
		code: user.idNo || "—",
		contact: user.displayName || "—",
		detail: [user.email, user.phoneNum].filter(Boolean).join(" · "),
		statusLabel: t.admin.statusInactive,
		statusClass: orgStatusBadgeColors.inactive,
		createdAt: user.createdAt,
		updatedAt: user.updatedAt,
		deactivatedBy: actorLabel(user, t),
	};
}

/**
 * A person an owner removed from ONE organisation.
 *
 * `activeElsewhere` decides the whole meaning of the row, so it is a required
 * argument rather than an optional flourish: red says they are not working
 * anywhere on the platform, amber says they were removed HERE and are still
 * active somewhere else. The organisation is always named in the row, because
 * "removed" without a named organisation is the misreading this guards against.
 *
 * ⚠️ The lane (`subRole`) is deliberately NOT rendered. It is derived per
 * PERSON from a global role row with no organisation on it, and every fallback
 * in that derivation lands on `owner` — so a removed member whose role was
 * revoked reads as an Owner of the agency that just removed them.
 */
function mapRemovedMemberRow(
	member: {
		id: string;
		userId: string;
		status: string;
		memberCode?: string | null;
		username?: string;
		email?: string | null;
		phoneNum?: string | null;
		createdAt: string;
		updatedAt: string;
		updatedBy?: string | null;
		updatedByName?: string | null;
	},
	orgKind: "agency" | "outlet",
	orgId: string,
	orgName: string,
	activeElsewhere: boolean,
	t: PortalTranslations,
): LegacyRow {
	return {
		id: member.id,
		role: "member",
		name: member.username || "—",
		code: member.memberCode || "—",
		contact: orgName,
		detail: [member.email, member.phoneNum].filter(Boolean).join(" · "),
		statusLabel: activeElsewhere
			? t.adminUsers.statusRemovedStillActive
			: t.adminUsers.statusRemoved,
		statusClass: activeElsewhere
			? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
			: orgStatusBadgeColors.inactive,
		createdAt: member.createdAt,
		updatedAt: member.updatedAt,
		// The owner or admin who took them out of THIS organisation — not
		// whoever last edited their account.
		deactivatedBy: actorLabel(member, t),
		orgKind,
		orgId,
	};
}

/** An account an admin switched off — they cannot sign in anywhere. */
function mapDisabledAccountRow(
	account: DisabledAccount,
	t: PortalTranslations,
): LegacyRow {
	return {
		id: account.id,
		role: "account",
		name: account.username || "—",
		code: account.memberCode || "—",
		contact: account.email || account.phoneNum || "—",
		detail: [account.email, account.phoneNum].filter(Boolean).join(" · "),
		// `blocked` and `inactive` both mean cannot sign in, and the column must
		// not print one when the row says the other.
		statusLabel:
			account.status === "blocked"
				? t.adminUsers.statusBlockedAccount
				: t.admin.statusInactive,
		statusClass: orgStatusBadgeColors.inactive,
		createdAt: account.createdAt,
		updatedAt: account.updatedAt,
		deactivatedBy: actorLabel(account, t),
	};
}

function LegacyMemberPage() {
	const { t } = usePortalLocale();
	const type = getUserTypeByKey("legacy-member")!;
	const { logout } = useAuth();
	const queryClient = useQueryClient();

	const [nameFilter, setNameFilter] = useState("");
	const [codeFilter, setCodeFilter] = useState("");
	const [contactFilter, setContactFilter] = useState("");
	const [roleFilter, setRoleFilter] = useState<LegacyRoleFilter>("all");
	const [sortBy, setSortBy] = useState<SortBy>("updatedAt");
	const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
	const [page, setPage] = useState(1);
	const [actionId, setActionId] = useState<string | null>(null);
	const [selected, setSelected] = useState<{
		role: DetailKind;
		id: string;
	} | null>(null);

	const [debouncedName, setDebouncedName] = useState("");
	const [debouncedCode, setDebouncedCode] = useState("");
	const [debouncedContact, setDebouncedContact] = useState("");

	useEffect(() => {
		const timer = window.setTimeout(() => {
			setDebouncedName(nameFilter.trim());
			setDebouncedCode(codeFilter.trim());
			setDebouncedContact(contactFilter.trim());
			setPage(1);
		}, 300);
		return () => window.clearTimeout(timer);
	}, [nameFilter, codeFilter, contactFilter]);

	// These three are reset TRIGGERS, not values the effect reads: changing the
	// role filter or the sort must send the list back to page 1, or the user
	// keeps the old offset and lands on a blank page of a shorter result set.
	// biome-ignore lint/correctness/useExhaustiveDependencies(roleFilter): reset trigger — see comment above
	// biome-ignore lint/correctness/useExhaustiveDependencies(sortBy): reset trigger — see comment above
	// biome-ignore lint/correctness/useExhaustiveDependencies(sortOrder): reset trigger — see comment above
	useEffect(() => {
		setPage(1);
	}, [roleFilter, sortBy, sortOrder]);

	const needAgency = roleFilter === "all" || roleFilter === "agency";
	const needOutlet = roleFilter === "all" || roleFilter === "outlet";
	const needPr = roleFilter === "all" || roleFilter === "pr";
	const needMember = roleFilter === "all" || roleFilter === "member";
	const needAccount = roleFilter === "all" || roleFilter === "account";
	/*
	 * The PR list is fetched for the ACCOUNT arm too, even when PR rows are not
	 * being rendered. An inactive PR is already on this screen under its own
	 * kind; without their ids the account arm would list the same people a
	 * second time, with a different badge and a second Reactivate button
	 * pointing at the very same endpoint.
	 */
	const fetchPr = needPr || needAccount;

	const legacyQueries = useQueries({
		queries: [
			{
				queryKey: ["legacy-members", "agency", "suspended"],
				queryFn: () => fetchAllAgencies(logout),
				enabled: needAgency,
				placeholderData: keepPreviousData,
				staleTime: 30_000,
			},
			{
				queryKey: ["legacy-members", "outlet", "suspended"],
				queryFn: () => fetchAllOutlets(logout),
				enabled: needOutlet,
				placeholderData: keepPreviousData,
				staleTime: 30_000,
			},
			{
				queryKey: ["legacy-members", "pr", "inactive"],
				queryFn: () => fetchAllInactivePrs(logout),
				enabled: fetchPr,
				placeholderData: keepPreviousData,
				staleTime: 30_000,
			},
			{
				queryKey: ["legacy-members", "agency-memberships", "all"],
				queryFn: () => fetchAllAgencyMemberships(logout),
				enabled: needMember,
				placeholderData: keepPreviousData,
				staleTime: 30_000,
			},
			{
				queryKey: ["legacy-members", "outlet-memberships", "all"],
				queryFn: () => fetchAllOutletMemberships(logout),
				enabled: needMember,
				placeholderData: keepPreviousData,
				staleTime: 30_000,
			},
			{
				queryKey: ["legacy-members", "accounts", "inactive"],
				queryFn: () => fetchAllDisabledAccounts(logout),
				enabled: needAccount,
				placeholderData: keepPreviousData,
				staleTime: 30_000,
			},
		],
	});

	const [
		agencyQuery,
		outletQuery,
		prQuery,
		agencyMemberQuery,
		outletMemberQuery,
		accountQuery,
	] = legacyQueries;
	/*
	 * Every arm belongs in these unions. A query left out of isLoading renders
	 * a confident "No suspended records found." while its data is still in
	 * flight — a false negative on the one screen whose whole job is to prove
	 * that records still exist.
	 */
	const isLoading =
		(needAgency && agencyQuery.isLoading) ||
		(needOutlet && outletQuery.isLoading) ||
		(fetchPr && prQuery.isLoading) ||
		(needMember && agencyMemberQuery.isLoading) ||
		(needMember && outletMemberQuery.isLoading) ||
		(needAccount && accountQuery.isLoading);
	const isFetching =
		(needAgency && agencyQuery.isFetching) ||
		(needOutlet && outletQuery.isFetching) ||
		(fetchPr && prQuery.isFetching) ||
		(needMember && agencyMemberQuery.isFetching) ||
		(needMember && outletMemberQuery.isFetching) ||
		(needAccount && accountQuery.isFetching);
	const isError =
		(needAgency && agencyQuery.isError) ||
		(needOutlet && outletQuery.isError) ||
		(fetchPr && prQuery.isError) ||
		(needMember && agencyMemberQuery.isError) ||
		(needMember && outletMemberQuery.isError) ||
		(needAccount && accountQuery.isError);
	const error =
		(needAgency && agencyQuery.error) ||
		(needOutlet && outletQuery.error) ||
		(fetchPr && prQuery.error) ||
		(needMember && agencyMemberQuery.error) ||
		(needMember && outletMemberQuery.error) ||
		(needAccount && accountQuery.error) ||
		null;

	const list: LegacyRow[] = [];
	if (needAgency) {
		for (const agency of agencyQuery.data ?? []) {
			list.push(mapAgencyRow(agency, t));
		}
	}
	if (needOutlet) {
		for (const outlet of outletQuery.data ?? []) {
			list.push(mapOutletRow(outlet, t));
		}
	}
	if (needPr) {
		for (const user of prQuery.data ?? []) {
			list.push(mapPrRow(user, t));
		}
	}

	/*
	 * REMOVED MEMBERS. Partitioned on status !== "active", never on
	 * === "inactive": the column is a free varchar(50) and the update schema
	 * declares it an optional plain string, so a row written with any other
	 * word is still a person who is not working there — and would vanish from
	 * a list that matched one literal.
	 */
	if (needMember) {
		const agencyMemberships = agencyMemberQuery.data ?? [];
		const outletMemberships = outletMemberQuery.data ?? [];
		const activeSomewhere = new Set<string>();
		for (const m of agencyMemberships) {
			if (m.status === "active") activeSomewhere.add(m.userId);
		}
		for (const m of outletMemberships) {
			if (m.status === "active") activeSomewhere.add(m.userId);
		}
		for (const m of agencyMemberships) {
			if (m.status === "active") continue;
			list.push(
				mapRemovedMemberRow(
					m,
					"agency",
					m.agencyId,
					m.agencyName,
					activeSomewhere.has(m.userId),
					t,
				),
			);
		}
		for (const m of outletMemberships) {
			if (m.status === "active") continue;
			list.push(
				mapRemovedMemberRow(
					m,
					"outlet",
					m.outletId,
					m.outletName,
					activeSomewhere.has(m.userId),
					t,
				),
			);
		}
	}

	/*
	 * SWITCHED-OFF ACCOUNTS, minus two populations that would be wrong here:
	 * the inactive PRs this page already lists under their own kind, and the
	 * self-deleted tombstones, whose photos, email and password the server
	 * destroyed on their own request — offering those a Reactivate button
	 * restores a login nobody can use.
	 */
	if (needAccount) {
		const prIds = new Set((prQuery.data ?? []).map((u) => u.id));
		for (const account of accountQuery.data ?? []) {
			if (prIds.has(account.id)) continue;
			if (isDeletedAccountTombstone(account)) continue;
			list.push(mapDisabledAccountRow(account, t));
		}
	}

	const nameQ = debouncedName.toLowerCase();
	const codeQ = debouncedCode.toLowerCase();
	const contactQ = debouncedContact.toLowerCase();

	const filtered = list.filter((row) => {
		if (nameQ && !row.name.toLowerCase().includes(nameQ)) return false;
		if (
			codeQ &&
			!row.code.toLowerCase().includes(codeQ) &&
			!row.id.toLowerCase().includes(codeQ)
		) {
			return false;
		}
		if (
			contactQ &&
			!row.contact.toLowerCase().includes(contactQ) &&
			!row.detail.toLowerCase().includes(contactQ)
		) {
			return false;
		}
		return true;
	});

	const rows = [...filtered].sort((a, b) => {
		const left =
			sortBy === "name"
				? a.name.toLowerCase()
				: sortBy === "createdAt"
					? a.createdAt
					: a.updatedAt;
		const right =
			sortBy === "name"
				? b.name.toLowerCase()
				: sortBy === "createdAt"
					? b.createdAt
					: b.updatedAt;
		if (left < right) return sortOrder === "asc" ? -1 : 1;
		if (left > right) return sortOrder === "asc" ? 1 : -1;
		return 0;
	});

	const totalCount = rows.length;
	const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
	const currentPage = Math.min(page, totalPages);
	const pageRows = rows.slice(
		(currentPage - 1) * PAGE_SIZE,
		currentPage * PAGE_SIZE,
	);

	const selectedAgencyFromList =
		selected?.role === "agency"
			? (agencyQuery.data?.find((a) => a.id === selected.id) ?? null)
			: null;
	const selectedOutletFromList =
		selected?.role === "outlet"
			? (outletQuery.data?.find((o) => o.id === selected.id) ?? null)
			: null;
	const selectedPrFromList =
		selected?.role === "pr"
			? (prQuery.data?.find((u) => u.id === selected.id) ?? null)
			: null;

	const selectedAgencyQuery = useQuery({
		queryKey: ["agency-by-id", selected?.id],
		queryFn: () => fetchAgencyById(selected!.id, logout),
		enabled: selected?.role === "agency" && !selectedAgencyFromList,
		staleTime: 30_000,
	});
	const selectedOutletQuery = useQuery({
		queryKey: ["outlet-by-id", selected?.id],
		queryFn: () => fetchOutletById(selected!.id, logout),
		enabled: selected?.role === "outlet" && !selectedOutletFromList,
		staleTime: 30_000,
	});

	const selectedAgency =
		selectedAgencyFromList ?? selectedAgencyQuery.data?.data ?? null;
	const selectedOutlet =
		selectedOutletFromList ?? selectedOutletQuery.data?.data ?? null;

	const approveAgencyMutation = useMutation({
		mutationFn: (id: string) => approveAgency(id, logout),
		onMutate: (id) => setActionId(id),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["legacy-members"] });
			queryClient.invalidateQueries({ queryKey: ["agencies"] });
			toast.success(response.message || t.adminUsers.agencyReactivated);
			setSelected(null);
		},
		onError: (err) => {
			toast.error(
				toMutationError(err, t.adminUsers.agencyReactivateFailed)?.message ??
					t.adminUsers.agencyReactivateFailed,
			);
		},
		onSettled: () => setActionId(null),
	});

	const approveOutletMutation = useMutation({
		mutationFn: (id: string) => approveOutlet(id, logout),
		onMutate: (id) => setActionId(id),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["legacy-members"] });
			queryClient.invalidateQueries({ queryKey: ["outlets"] });
			toast.success(response.message || t.adminUsers.outletReactivated);
			setSelected(null);
		},
		onError: (err) => {
			toast.error(
				toMutationError(err, t.adminUsers.outletReactivateFailed)?.message ??
					t.adminUsers.outletReactivateFailed,
			);
		},
		onSettled: () => setActionId(null),
	});

	// A suspended organisation listed here can be taken the rest of the way —
	// `inactive` refuses every login — from the same Approval Status card.
	const deactivateAgencyMutation = useMutation({
		mutationFn: (id: string) => deactivateAgency(id, logout),
		onMutate: (id) => setActionId(id),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["legacy-members"] });
			queryClient.invalidateQueries({ queryKey: ["agencies"] });
			toast.success(response.message || t.adminUsers.agencyDeactivated);
		},
		onError: (err) => {
			toast.error(
				toMutationError(err, t.adminUsers.agencyDeactivateFailed)?.message ??
					t.adminUsers.agencyDeactivateFailed,
			);
		},
		onSettled: () => setActionId(null),
	});

	const deactivateOutletMutation = useMutation({
		mutationFn: (id: string) => deactivateOutlet(id, logout),
		onMutate: (id) => setActionId(id),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["legacy-members"] });
			queryClient.invalidateQueries({ queryKey: ["outlets"] });
			toast.success(response.message || t.admin.outletDeactivated);
		},
		onError: (err) => {
			toast.error(
				toMutationError(err, t.admin.outletDeactivateFailed)?.message ??
					t.admin.outletDeactivateFailed,
			);
		},
		onSettled: () => setActionId(null),
	});

	/**
	 * The PR rows here are ACCOUNTS (`GET /user` filtered to the pr role), while
	 * the agency and outlet rows are ORGANISATIONS. That is why reactivation is
	 * two different calls on one table: an org goes back through `approve`, an
	 * account through `PATCH /user/:id/status`. Sending a PR's user id to the
	 * org endpoint would address a row that is not there.
	 *
	 * This tab is where a disabled PR ends up, so without this it was the one
	 * place an account could arrive and never leave.
	 */
	/**
	 * Open the detail sheet, for the kinds that HAVE one.
	 *
	 * A removed membership and a switched-off account are not records with a
	 * profile behind them — they are states of a person described elsewhere.
	 * Clicking one does nothing rather than opening a sheet built to describe
	 * a different thing.
	 */
	const openDetail = (row: LegacyRow) => {
		if (row.role === "agency" || row.role === "outlet" || row.role === "pr") {
			openDetail(row);
		}
	};

	const accountActions = useAccountActions({
		// `roleName` is the STORED role sent to the revoke endpoint; `roleLabel` is
		// the same fact as a phrase, and the hook drops it mid-sentence, so it has
		// to arrive already translated.
		roleName: "pr",
		roleLabel: t.admin.rolePrAccess,
		queryKeys: ["legacy-members", "pr-users"],
	});

	const showLoading = isLoading && rows.length === 0;

	function refetchAll() {
		for (const q of legacyQueries) void q.refetch();
	}

	return (
		<PageShell>
			<PageHeader
				icon={type.icon}
				title={adminNavLabel(`sidebar-user-${type.key}`, type.title, t)}
				description={userTypeDescription(type.key, type.description, t)}
			/>

			<div className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
				<div className="flex items-start gap-2">
					<Info className="mt-0.5 h-4 w-4 shrink-0" />
					<div>
						<p className="font-medium text-sky-50">
							{t.adminUsers.aboutLegacyMember}
						</p>
						<p className="mt-1 text-sky-100/85">
							{t.adminUsers.aboutLegacyMemberBody}
						</p>
					</div>
				</div>
			</div>

			<Card className="border-(--lavender-soft)/40 bg-card">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						{t.adminUsers.searchFilters}
						{isFetching && !showLoading && (
							<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
						)}
					</CardTitle>
					<CardDescription>{t.adminUsers.searchFiltersHint}</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
						<div className="space-y-1.5">
							<Label htmlFor="legacy-name">{t.admin.colName}</Label>
							<div className="relative">
								<Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									id="legacy-name"
									value={nameFilter}
									onChange={(e) => setNameFilter(e.target.value)}
									placeholder={t.adminUsers.placeholderName}
									className="pl-8"
								/>
							</div>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="legacy-code">{t.adminUsers.colCodeId}</Label>
							<Input
								id="legacy-code"
								value={codeFilter}
								onChange={(e) => setCodeFilter(e.target.value)}
								placeholder={t.adminUsers.placeholderCode}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="legacy-contact">{t.adminUsers.colContact}</Label>
							<Input
								id="legacy-contact"
								value={contactFilter}
								onChange={(e) => setContactFilter(e.target.value)}
								placeholder={t.adminUsers.placeholderContact}
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="legacy-role">{t.adminUsers.role}</Label>
							<Select
								value={roleFilter}
								onValueChange={(value) =>
									setRoleFilter(value as LegacyRoleFilter)
								}
							>
								<SelectTrigger
									id="legacy-role"
									aria-label={t.adminUsers.filterByRole}
								>
									<SelectValue placeholder={t.adminUsers.role} />
								</SelectTrigger>
								{/* Every `value` here is the stored role the filter compares
								    against — only the labels move. */}
								<SelectContent>
									<SelectItem value="all">{t.adminUsers.allRoles}</SelectItem>
									<SelectItem value="agency">
										{t.adminUsers.roleAgency}
									</SelectItem>
									<SelectItem value="outlet">
										{t.adminUsers.roleOutlet}
									</SelectItem>
									<SelectItem value="pr">{t.adminUsers.rolePr}</SelectItem>
									<SelectItem value="member">
										{t.adminUsers.roleRemovedMember}
									</SelectItem>
									<SelectItem value="account">
										{t.adminUsers.roleDisabledAccount}
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="legacy-sort-by">{t.adminUsers.sortBy}</Label>
							<Select
								value={sortBy}
								onValueChange={(value) => setSortBy(value as SortBy)}
							>
								<SelectTrigger
									id="legacy-sort-by"
									aria-label={t.adminUsers.sortBy}
								>
									<SelectValue />
								</SelectTrigger>
								{/* `name` / `createdAt` / `updatedAt` are the sort keys the
								    comparator switches on — labels only. */}
								<SelectContent>
									<SelectItem value="name">{t.admin.colName}</SelectItem>
									<SelectItem value="createdAt">
										{t.admin.colCreated}
									</SelectItem>
									<SelectItem value="updatedAt">
										{t.adminUsers.colUpdated}
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="legacy-sort-order">
								{t.adminUsers.sortOrder}
							</Label>
							<Select
								value={sortOrder}
								onValueChange={(value) => setSortOrder(value as SortOrder)}
							>
								<SelectTrigger
									id="legacy-sort-order"
									aria-label={t.adminUsers.sortOrder}
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="asc">{t.adminUsers.ascending}</SelectItem>
									<SelectItem value="desc">
										{t.adminUsers.descending}
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card className="border-(--lavender-soft)/40 bg-card">
				<CardHeader>
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<CardTitle className="flex items-center gap-2">
								{t.adminUsers.suspendedInactiveRecords}
								{isFetching && !showLoading && (
									<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
								)}
							</CardTitle>
							<CardDescription>
								{t.adminUsers.suspendedInactiveHint}
							</CardDescription>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={refetchAll}
							disabled={isFetching}
						>
							<RefreshCw
								className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
							/>
							{t.adminUsers.refresh}
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto rounded-lg border border-(--lavender-soft)/30">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-10" />
									<TableHead>{t.admin.colName}</TableHead>
									<TableHead>{t.adminUsers.colCodeId}</TableHead>
									<TableHead>{t.adminUsers.role}</TableHead>
									<TableHead>{t.adminUsers.colContact}</TableHead>
									<TableHead className="w-[120px]">
										{t.admin.colStatus}
									</TableHead>
									<TableHead className="w-[150px]">
										{t.adminUsers.colUpdated}
									</TableHead>
									<TableHead className="w-[150px]">
										{t.adminUsers.colDeactivatedBy}
									</TableHead>
									<TableHead className="w-[220px]">
										{t.admin.colActions}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{showLoading && (
									<TableRow>
										<TableCell colSpan={9} className="h-40 text-center">
											<Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
										</TableCell>
									</TableRow>
								)}

								{!showLoading && isError && (
									<TableRow>
										<TableCell colSpan={9} className="h-40 text-center">
											<div className="flex flex-col items-center gap-2">
												<AlertCircle className="h-8 w-8 text-destructive" />
												<p className="text-sm text-muted-foreground">
													{getErrorMessage(error as Error | null) ||
														t.adminUsers.legacyLoadFailed}
												</p>
												<Button
													variant="outline"
													size="sm"
													onClick={refetchAll}
												>
													{t.common.retry}
												</Button>
											</div>
										</TableCell>
									</TableRow>
								)}

								{!showLoading && !isError && pageRows.length === 0 && (
									<TableRow>
										<TableCell colSpan={9} className="h-40 text-center">
											<div className="flex flex-col items-center gap-2 text-muted-foreground">
												<Archive className="h-8 w-8 opacity-50" />
												<p className="text-sm">
													{t.adminUsers.noSuspendedRecords}
												</p>
											</div>
										</TableCell>
									</TableRow>
								)}

								{!showLoading &&
									!isError &&
									pageRows.map((row) => {
										const busy = actionId === row.id;
										return (
											<TableRow
												key={`${row.role}-${row.id}`}
												className={
													row.role === "member" || row.role === "account"
														? undefined
														: "cursor-pointer"
												}
												onClick={() => openDetail(row)}
											>
												<TableCell>
													<Button
														variant="ghost"
														size="icon"
														disabled={
															row.role === "member" || row.role === "account"
														}
														className="h-8 w-8"
														onClick={(e) => {
															e.stopPropagation();
															openDetail(row);
														}}
														aria-label={fill(t.adminUsers.viewNamed, {
															name: row.name,
														})}
													>
														<Eye className="h-4 w-4" />
													</Button>
												</TableCell>
												<TableCell>
													<div className="font-medium">{row.name}</div>
													{row.detail && (
														<div className="text-sm text-muted-foreground">
															{row.detail}
														</div>
													)}
												</TableCell>
												<TableCell className="font-mono text-sm">
													{row.code}
												</TableCell>
												<TableCell>
													<Badge
														variant="outline"
														className={roleBadgeColors[row.role]}
													>
														{roleLabels[row.role](t)}
													</Badge>
												</TableCell>
												<TableCell>{row.contact}</TableCell>
												<TableCell>
													<Badge variant="outline" className={row.statusClass}>
														{row.statusLabel}
													</Badge>
												</TableCell>
												<TableCell className="text-base text-muted-foreground">
													{formatDate(row.updatedAt)}
												</TableCell>
												<TableCell className="text-base text-muted-foreground">
													{row.deactivatedBy}
												</TableCell>
												<TableCell>
													{/* Layout-only wrapper: role="none" because the click
													    handler is purely a propagation guard so the row's
													    own onClick does not fire behind these buttons. */}
													<div
														className="flex flex-wrap gap-2"
														role="none"
														onClick={(e) => e.stopPropagation()}
													>
														{(row.role === "agency" ||
															row.role === "outlet") && (
															<Button
																size="sm"
																variant="outline"
																disabled={busy}
																onClick={() => {
																	if (row.role === "agency") {
																		approveAgencyMutation.mutate(row.id);
																	} else {
																		approveOutletMutation.mutate(row.id);
																	}
																}}
															>
																{busy ? (
																	<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
																) : (
																	<CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
																)}
																{t.adminUsers.reactivate}
															</Button>
														)}
														{/*
														 * A removed membership is NOT restored by a status flip. Removal
														 * hard-deletes the person's portal role when it was their last
														 * membership, so the server refuses (409) unless the caller names a
														 * lane to restore them with. That picker already exists on the
														 * organisation's own members page — send the admin there rather than
														 * growing a second copy of it here, and never offer a one-click that
														 * could only 409. */}
														{row.role === "member" && row.orgId && (
															<Button size="sm" variant="outline" asChild>
																<Link
																	to={
																		row.orgKind === "agency"
																			? "/admin/user-management/agency-team"
																			: "/admin/user-management/outlet-team"
																	}
																>
																	<Users className="mr-1.5 h-3.5 w-3.5" />
																	{t.adminUsers.openTeam}
																</Link>
															</Button>
														)}
														{(row.role === "pr" || row.role === "account") && (
															<Button
																size="sm"
																variant="outline"
																disabled={accountActions.busyUserId === row.id}
																onClick={() =>
																	accountActions.askSetStatus(
																		{
																			id: row.id,
																			name: row.name,
																			status: "inactive",
																		},
																		"active",
																	)
																}
															>
																<CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
																{t.adminUsers.reactivate}
															</Button>
														)}
														<Button
															size="sm"
															variant="ghost"
															disabled={
																row.role === "member" || row.role === "account"
															}
															onClick={() => openDetail(row)}
														>
															<Eye className="mr-1.5 h-3.5 w-3.5" />
															{t.adminUsers.view}
														</Button>
													</div>
												</TableCell>
											</TableRow>
										);
									})}
							</TableBody>
						</Table>
					</div>

					{totalCount > 0 && (
						<div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
							{/* One whole-sentence template, the same shape the admins table
							    and the roles grid already use. The three numbers were bold
							    spans glued between English fragments, which is a sentence
							    that cannot be reordered — Chinese puts the total last and
							    the measure word after the number. `formatNumber` still runs
							    on each value, so the grouping stays locale-correct. */}
							<div>
								{fill(t.adminUsers.showingRecords, {
									from: formatNumber((currentPage - 1) * PAGE_SIZE + 1),
									to: formatNumber(
										Math.min(currentPage * PAGE_SIZE, totalCount),
									),
									total: formatNumber(totalCount),
								})}
							</div>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={currentPage <= 1 || isFetching}
									onClick={() => setPage((value) => value - 1)}
								>
									{t.admin.previous}
								</Button>
								<span>
									{fill(t.admin.pageOf, {
										page: currentPage,
										total: totalPages,
									})}
								</span>
								<Button
									variant="outline"
									size="sm"
									disabled={currentPage >= totalPages || isFetching}
									onClick={() => setPage((value) => value + 1)}
								>
									{t.admin.next}
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			<AgencyDetailsSheet
				agency={selectedAgency}
				open={selected?.role === "agency"}
				onOpenChange={(open) => {
					if (!open) setSelected(null);
				}}
				onApprove={(id) => approveAgencyMutation.mutate(id)}
				onDeactivate={(id) => deactivateAgencyMutation.mutate(id)}
				actionId={actionId}
			/>

			<OutletDetailsSheet
				outlet={selectedOutlet}
				open={selected?.role === "outlet"}
				onOpenChange={(open) => {
					if (!open) setSelected(null);
				}}
				onApprove={(id) => approveOutletMutation.mutate(id)}
				onDeactivate={(id) => deactivateOutletMutation.mutate(id)}
				actionId={actionId}
			/>

			<PrDetailsSheet
				user={selectedPrFromList}
				open={selected?.role === "pr"}
				onOpenChange={(open) => {
					if (!open) setSelected(null);
				}}
			/>

			{accountActions.dialog}
		</PageShell>
	);
}
