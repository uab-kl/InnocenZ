import "@agency-portal/components/portal/todo-panel.css";
import {
	usePortalNavPaths,
	usePortalTodoCounts,
} from "@agency-portal/components/portal/NavAlertBadge";
import { useAgencyCan, useOutletCan } from "@agency-portal/lib/use-portal-can";
import { Link } from "@tanstack/react-router";
import {
	ArrowRight,
	CalendarClock,
	CheckCircle2,
	ClipboardCheck,
	ClipboardList,
	Clock,
	FileText,
	Receipt,
	Scale,
	UserPlus,
} from "lucide-react";
import { type ComponentType, type ReactNode, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

/**
 * THE TODAY PAGE'S "TO DO" PANEL (owner, 16 Nov 2026).
 *
 * Owner's feedback from users: they "dont know where he at, what he can do,
 * where and what he need to decide" — and the direction: "everything at todo
 * and todays page will guide the user where they need todo actions".
 *
 * So the first thing on Today is one list of everything waiting on THIS user,
 * most urgent first, each row saying what it is, why it matters, and the one
 * button that goes straight to it. Three rules keep it honest:
 *
 * - ONE SOURCE. The counts come from the same provider and queries as the
 *   sidebar badges (`PortalNavAlerts`), so a row and its badge cannot disagree.
 * - ONLY WHAT THIS ROLE CAN DO. A row appears only when its destination is in
 *   the role's own menu — a button that leads to a refusal is not guidance.
 * - "ALL CLEAR" ONLY WHEN KNOWN. While a count is loading the panel says it is
 *   checking; the all-clear shows only once nothing is loading and no row drew.
 *   Rows are plain children, so the existing banners (subscription, prices,
 *   daily statement) sit in the same list and hide themselves as before.
 *
 * `loading` is for the reads behind those banners. The provider is mounted on
 * every page of the portal, so it holds only the counts it computes; a page
 * whose banners read more passes their flags here (outlet Today does) rather
 * than making every page fire them.
 *
 * THE "START HERE" RING PLAYS ONCE, AFTER THE COUNTS ARE KNOWN (owner, 18 Nov
 * 2026 — "yes fix the to do panel"). The rows still render while it is
 * checking, each as its count lands; what waits is the ring. `data-iz-settled`
 * goes on the list the first render nothing is loading and never comes off,
 * and portal-motion.css M3 rings only inside a settled list. So every row
 * present at that moment starts its ring together and only the first is gold —
 * one ring — where before a row landing ABOVE one that had already rung became
 * the first child and rang gold a second time. Sticky, so a read that errors
 * and refetches when the window regains focus (loading again, nothing new) can
 * never replay it: DESIGN.md §8, "never a return to the window".
 */
export function TodoPanel({
	children,
	loading: pageLoading = false,
}: {
	children: ReactNode;
	loading?: boolean;
}) {
	const { t } = usePortalLocale();
	const counts = usePortalTodoCounts();
	const loading = counts.loading || pageLoading;
	/*
	 * Adjusted DURING render, the pattern `useNavAlertPop` uses (NavAlertBadge.tsx):
	 * React re-runs this render with the new state before committing, so the
	 * first paint without "Checking…" is already a settled list — an effect
	 * would paint one frame of an unsettled list first.
	 */
	const [settled, setSettled] = useState(!loading);
	if (!loading && !settled) setSettled(true);
	return (
		<section className="iz-todo" aria-labelledby="iz-todo-heading">
			<div className="iz-todo__head">
				<h2 id="iz-todo-heading" className="iz-todo__title">
					<ClipboardList aria-hidden className="iz-todo__title-icon" />
					{t.todo.heading}
				</h2>
				<p className="iz-todo__sub">{t.todo.subhead}</p>
			</div>
			<div
				className="iz-todo__list"
				data-iz-settled={settled ? "true" : undefined}
			>
				{children}
			</div>
			{loading ? (
				<p className="iz-todo__checking" aria-live="polite">
					{t.todo.checking}
				</p>
			) : (
				<p className="iz-todo__clear" aria-live="polite">
					<CheckCircle2 aria-hidden className="iz-todo__clear-icon" />
					<span>
						<strong>{t.todo.allClearTitle}</strong> · {t.todo.allClearBody}
					</span>
				</p>
			)}
		</section>
	);
}

/** The inside of one row — the caller wraps it in a typed `<Link>`. */
function TodoRowBody({
	icon: Icon,
	title,
	count,
	meta,
	cta,
}: {
	icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
	title: string;
	count: number;
	meta: string;
	cta: string;
}) {
	return (
		<>
			<span className="iz-alert__head">
				<Icon className="iz-alert__icon" aria-hidden />
				<span className="iz-alert__title">{title}</span>
			</span>
			<span className="iz-alert__figure iz-nums">{count}</span>
			<span className="iz-alert__meta">{meta}</span>
			<span className="iz-alert__cta">
				{cta}
				<ArrowRight className="h-3 w-3" aria-hidden />
			</span>
		</>
	);
}

/**
 * Show a row only when there is work, this role's menu has its door, AND the
 * role may ACT there. Seeing a page is not deciding on it: a Director's menu
 * opens Payroll read-only, and a row reading "Answer disputes" above a page
 * that will not let them answer is the exact confusion this panel exists to
 * remove ("what he can do, where and what he need to decide").
 */
function useRowGate() {
	const { counts } = usePortalTodoCounts();
	const paths = usePortalNavPaths();
	return (key: string, path: string, mayAct: boolean): number => {
		const count = counts[key] ?? 0;
		if (count <= 0 || !mayAct) return 0;
		if (paths && !paths.has(path)) return 0;
		return count;
	};
}

/**
 * The agency's queues, most urgent first: a PR contesting money (red), then
 * the payroll steps that hold a PR's pay, then the approvals queue.
 */
export function AgencyTodoRows() {
	const { t } = usePortalLocale();
	const gate = useRowGate();
	const can = useAgencyCan();
	// The same keys the pages gate their buttons on: payroll acts on `raisePv`
	// (agency/pv.tsx), approvals decide on `approvePrSignups` (agency/pending.tsx).
	const payroll = can("raisePv");
	const disputes = gate("disputes", "/agency/pv", payroll);
	const vouchers = gate("vouchers", "/agency/pv", payroll);
	const receipts = gate("receipts", "/agency/pv", payroll);
	const overtime = gate("overtime", "/agency/pv", payroll);
	const approvals = gate(
		"approvals",
		"/agency/pending",
		can("approvePrSignups"),
	);
	return (
		<>
			{disputes > 0 && (
				<Link
					to="/agency/pv"
					search={{ tab: "disputes" }}
					className="iz-alert iz-alert--red iz-todo__row"
				>
					<TodoRowBody
						icon={Scale}
						title={t.todo.disputesTitle}
						count={disputes}
						meta={t.todo.disputesMeta}
						cta={t.todo.disputesCta}
					/>
				</Link>
			)}
			{vouchers > 0 && (
				<Link
					to="/agency/pv"
					search={{ tab: "vouchers" }}
					className="iz-alert iz-alert--amber iz-todo__row"
				>
					<TodoRowBody
						icon={FileText}
						title={t.todo.vouchersTitle}
						count={vouchers}
						meta={t.todo.vouchersMeta}
						cta={t.todo.vouchersCta}
					/>
				</Link>
			)}
			{receipts > 0 && (
				<Link
					to="/agency/pv"
					search={{ tab: "receipts" }}
					className="iz-alert iz-alert--amber iz-todo__row"
				>
					<TodoRowBody
						icon={Receipt}
						title={t.todo.receiptsTitle}
						count={receipts}
						meta={t.todo.receiptsMeta}
						cta={t.todo.receiptsCta}
					/>
				</Link>
			)}
			{overtime > 0 && (
				<Link
					to="/agency/pv"
					search={{ tab: "overtime" }}
					className="iz-alert iz-alert--amber iz-todo__row"
				>
					<TodoRowBody
						icon={Clock}
						title={t.todo.overtimeTitle}
						count={overtime}
						meta={t.todo.overtimeMeta}
						cta={t.todo.overtimeCta}
					/>
				</Link>
			)}
			{approvals > 0 && (
				<Link
					to="/agency/pending"
					className="iz-alert iz-alert--amber iz-todo__row"
				>
					<TodoRowBody
						icon={ClipboardCheck}
						title={t.todo.approvalsTitle}
						count={approvals}
						meta={t.todo.approvalsMeta}
						cta={t.todo.approvalsCta}
					/>
				</Link>
			)}
		</>
	);
}

/** The venue's own queues: shifts short of people, then people asking to join. */
export function OutletTodoRows() {
	const { t } = usePortalLocale();
	const gate = useRowGate();
	const can = useOutletCan();
	const shifts = gate(
		"shiftsNeedingStaff",
		"/outlet/calendar",
		can("postJob") || can("manageShiftStaffing"),
	);
	// Deciding a join request is `settings:update` (PendingMemberDetail) —
	// `editSettings` on this side.
	const members = gate(
		"pendingMembers",
		"/outlet/approvals",
		can("editSettings"),
	);
	return (
		<>
			{shifts > 0 && (
				<Link
					to="/outlet/calendar"
					className="iz-alert iz-alert--amber iz-todo__row"
				>
					<TodoRowBody
						icon={CalendarClock}
						title={t.todo.shiftsTitle}
						count={shifts}
						meta={t.todo.shiftsMeta}
						cta={t.todo.shiftsCta}
					/>
				</Link>
			)}
			{members > 0 && (
				<Link
					to="/outlet/approvals"
					className="iz-alert iz-alert--amber iz-todo__row"
				>
					<TodoRowBody
						icon={UserPlus}
						title={t.todo.membersTitle}
						count={members}
						meta={t.todo.membersMeta}
						cta={t.todo.membersCta}
					/>
				</Link>
			)}
		</>
	);
}
