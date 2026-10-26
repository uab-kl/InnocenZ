import {
	ArrowUp,
	CircleHelp,
	Ellipsis,
	Pencil,
	Search,
	Shield,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { usePortalLocale } from "@/lib/portal-i18n/context";

const storageKey = "iz-admin-navigation-sections";

/**
 * The admin's open/closed sidebar groups, remembered per browser.
 *
 * `activeKey` is the group holding the CURRENT page. Every group used to start
 * closed on a first visit and stay closed on navigation, so an admin landed on
 * a page whose own menu entry — and its badge — was folded away. The active
 * group is opened when the admin arrives in it (after the saved state loads,
 * so a stored "closed" cannot fold it back), and the admin can still close it.
 */
export function useAdminNavSections(activeKey?: string) {
	const [sections, setSections] = useState<Record<string, boolean>>({});
	useEffect(() => {
		try {
			const saved: unknown = JSON.parse(
				localStorage.getItem(storageKey) || "{}",
			);
			if (saved && typeof saved === "object" && !Array.isArray(saved)) {
				setSections(
					Object.fromEntries(
						Object.entries(saved).map(([key, value]) => [key, value === true]),
					),
				);
			}
		} catch {
			/* Navigation still works when storage is unavailable. */
		}
	}, []);
	// Declared AFTER the restore: on mount both updates queue in this order, so
	// the active group is opened on top of the stored state, never under it.
	useEffect(() => {
		if (!activeKey) return;
		setSections((previous) =>
			previous[activeKey] ? previous : { ...previous, [activeKey]: true },
		);
	}, [activeKey]);
	return {
		sections,
		toggleSection(key: string) {
			setSections((previous) => {
				const next = { ...previous, [key]: !previous[key] };
				try {
					localStorage.setItem(storageKey, JSON.stringify(next));
				} catch {
					/* Optional persistence. */
				}
				return next;
			});
		},
	};
}

/**
 * The count a CLOSED group header carries: the sum of its visible items'
 * badges, so a folded SERVICE still shows that a Plan Request is waiting.
 */
export function sectionBadgeTotal(
	counts: ReadonlyArray<number | null | undefined>,
): number {
	return counts.reduce<number>(
		(sum, count) => sum + (typeof count === "number" && count > 0 ? count : 0),
		0,
	);
}

export function AdminIconGuide() {
	const { t, locale } = usePortalLocale();
	const entries =
		locale === "zh"
			? [
					{
						icon: Search,
						label: "搜索与筛选",
						detail: "查找记录并缩小结果范围。",
					},
					{
						icon: Ellipsis,
						label: "更多操作",
						detail: "打开该记录可用的操作菜单。",
					},
					{ icon: Pencil, label: "编辑", detail: "查看或更新记录详情。" },
					{
						icon: Shield,
						label: "角色与权限",
						detail: "管理各门户的访问权限。",
					},
					{
						icon: X,
						label: "关闭",
						detail: "返回页面，未保存的更改不会提交。",
					},
				]
			: [
					{
						icon: Search,
						label: "Search and filter",
						detail: "Find records and narrow the results.",
					},
					{
						icon: Ellipsis,
						label: "More actions",
						detail: "Open the available actions for a record.",
					},
					{
						icon: Pencil,
						label: "Edit",
						detail: "Review or update record details.",
					},
					{
						icon: Shield,
						label: "Roles and permissions",
						detail: "Manage access to each portal.",
					},
					{
						icon: X,
						label: "Close",
						detail: "Return to the page without submitting unsaved changes.",
					},
				];
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button
					variant="outline"
					size="icon"
					aria-label={t.common.iconGuide}
					title={t.common.iconGuide}
				>
					<CircleHelp aria-hidden />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t.common.iconGuide}</DialogTitle>
					<DialogDescription>
						{locale === "zh"
							? "管理门户常用图标。"
							: "Common controls in the Admin portal."}
					</DialogDescription>
				</DialogHeader>
				<ul className="space-y-4">
					{entries.map(({ icon: Icon, label, detail }) => (
						<li key={label} className="flex items-start gap-3">
							<Icon aria-hidden className="mt-1 size-5 shrink-0 text-primary" />
							<div>
								<p className="font-semibold">{label}</p>
								<p className="text-muted-foreground">{detail}</p>
							</div>
						</li>
					))}
				</ul>
			</DialogContent>
		</Dialog>
	);
}

export function AdminBackToTop() {
	const [visible, setVisible] = useState(false);
	const { locale } = usePortalLocale();
	useEffect(() => {
		const viewport = document.querySelector<HTMLElement>(".iz-admin-viewport");
		const update = () => setVisible((viewport?.scrollTop ?? 0) > 360);
		update();
		viewport?.addEventListener("scroll", update, { passive: true });
		return () => viewport?.removeEventListener("scroll", update);
	}, []);
	if (!visible) return null;
	return (
		<button
			type="button"
			className="iz-admin-back-to-top"
			aria-label={locale === "zh" ? "返回顶部" : "Back to top"}
			onClick={() =>
				document.querySelector(".iz-admin-viewport")?.scrollTo({
					top: 0,
					behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
						? "instant"
						: "smooth",
				})
			}
		>
			<ArrowUp aria-hidden className="size-5" />
		</button>
	);
}
