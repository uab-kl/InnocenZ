import { Link } from "@tanstack/react-router";
import {
	ArrowRight,
	Building2,
	CheckCircle2,
	ClipboardList,
	FileQuestion,
	Repeat2,
	Store,
	Wrench,
} from "lucide-react";
import type { ComponentType } from "react";
import {
	type AdminTodoCounts,
	useAdminTodoCounts,
} from "@/hooks/use-sidebar-badges";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/**
 * THE ADMIN DASHBOARD'S "TO DO" (owner, 16 Nov 2026).
 *
 * "for the website agency, outlet owner and the admin that everything at todo
 * and todays page will show all and guide the user where they need todo
 * actions." Agency and outlet Today got their To do list earlier the same day;
 * admin was the one portal still opening on a row of KPI tiles — most of them
 * 0 — that said how much there was without saying what to DO about any of it.
 *
 * Same rules as the portals' panel:
 *  - ONE SOURCE: the counts are the sidebar badges' own queries
 *    (`useAdminTodoCounts`), so a row and its badge cannot disagree.
 *  - MOST URGENT FIRST: an organisation waiting for approval can sign in but
 *    cannot use the product, so those lead; money (plan changes) next.
 *  - "ALL CLEAR" ONLY WHEN KNOWN: never while a count is loading or errored.
 *
 * Every route here is a real admin page (checked against `routes/admin/`).
 */
type Row = {
	key: keyof AdminTodoCounts;
	to:
		| "/admin/user-management/agency"
		| "/admin/user-management/outlet"
		| "/admin/service/plan-changes"
		| "/admin/service/requests"
		| "/admin/service/other";
	icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
	title: (t: PortalTranslations) => string;
	meta: (t: PortalTranslations) => string;
	cta: (t: PortalTranslations) => string;
};

/** In order of urgency — the first row drawn owns the one filled button. */
const ROWS: Row[] = [
	{
		key: "agencies",
		to: "/admin/user-management/agency",
		icon: Building2,
		title: (t) => t.todo.adminAgenciesTitle,
		meta: (t) => t.todo.adminOrgsMeta,
		cta: (t) => t.todo.adminAgenciesCta,
	},
	{
		key: "outlets",
		to: "/admin/user-management/outlet",
		icon: Store,
		title: (t) => t.todo.adminOutletsTitle,
		meta: (t) => t.todo.adminOrgsMeta,
		cta: (t) => t.todo.adminOutletsCta,
	},
	{
		key: "planChanges",
		to: "/admin/service/plan-changes",
		icon: Repeat2,
		title: (t) => t.todo.adminPlanChangesTitle,
		meta: (t) => t.todo.adminPlanChangesMeta,
		cta: (t) => t.todo.adminPlanChangesCta,
	},
	{
		key: "planRequests",
		to: "/admin/service/requests",
		icon: FileQuestion,
		title: (t) => t.todo.adminPlanRequestsTitle,
		meta: (t) => t.todo.adminPlanRequestsMeta,
		cta: (t) => t.todo.adminPlanRequestsCta,
	},
	{
		key: "jobs",
		to: "/admin/service/other",
		icon: Wrench,
		title: (t) => t.todo.adminJobsTitle,
		meta: (t) => t.todo.adminJobsMeta,
		cta: (t) => t.todo.adminJobsCta,
	},
];

export function AdminTodoPanel() {
	const { t } = usePortalLocale();
	const { counts, loading } = useAdminTodoCounts();
	const live = ROWS.filter((row) => counts[row.key] > 0);

	return (
		<section className="admin-todo" aria-labelledby="admin-todo-heading">
			<div className="admin-todo__head">
				<h2 id="admin-todo-heading" className="admin-todo__title">
					<ClipboardList aria-hidden className="admin-todo__title-icon" />
					{t.todo.heading}
				</h2>
				{live.length > 0 && <p className="admin-todo__sub">{t.todo.subhead}</p>}
			</div>

			{live.length > 0 && (
				<ul className="admin-todo__list">
					{live.map((row, index) => {
						const Icon = row.icon;
						return (
							<li key={row.key}>
								<Link
									to={row.to}
									className={`admin-todo__row${index === 0 ? " admin-todo__row--first" : ""}`}
								>
									<Icon aria-hidden className="admin-todo__icon" />
									<span className="admin-todo__what">
										<span className="admin-todo__row-title">
											{row.title(t)}
										</span>
										<span className="admin-todo__count tabular-nums">
											{counts[row.key]}
										</span>
										<span className="admin-todo__meta">{row.meta(t)}</span>
									</span>
									<span className="admin-todo__cta">
										{row.cta(t)}
										<ArrowRight aria-hidden className="h-3.5 w-3.5" />
									</span>
								</Link>
							</li>
						);
					})}
				</ul>
			)}

			{live.length === 0 &&
				(loading ? (
					<p className="admin-todo__checking" aria-live="polite">
						{t.todo.checking}
					</p>
				) : (
					<p className="admin-todo__clear" aria-live="polite">
						<CheckCircle2 aria-hidden className="admin-todo__clear-icon" />
						<span>
							<strong>{t.todo.allClearTitle}</strong> · {t.todo.allClearBody}
						</span>
					</p>
				))}
		</section>
	);
}
