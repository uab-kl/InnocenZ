import { ChevronDown } from "lucide-react";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { type LandingLocale, useLandingLocale } from "@/lib/landing-i18n";

const MENU_MIN_WIDTH = 148;

export function HandoffLanguageSwitcher() {
	const { locale, t, setLocale } = useLandingLocale();
	const [open, setOpen] = useState(false);
	const [menuStyle, setMenuStyle] = useState<{ top: number; left: number }>({
		top: 0,
		left: 0,
	});
	const rootRef = useRef<HTMLDivElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);

	const updateMenuPosition = useCallback(() => {
		const trigger = triggerRef.current;
		if (!trigger) return;
		const rect = trigger.getBoundingClientRect();
		setMenuStyle({
			top: rect.bottom + 12,
			left: Math.max(8, rect.right - MENU_MIN_WIDTH),
		});
	}, []);

	useLayoutEffect(() => {
		if (!open) return;
		updateMenuPosition();
	}, [open, updateMenuPosition]);

	useEffect(() => {
		if (!open) return;

		const onPointerDown = (e: PointerEvent) => {
			const target = e.target as Node;
			if (
				rootRef.current?.contains(target) ||
				menuRef.current?.contains(target)
			) {
				return;
			}
			setOpen(false);
		};

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};

		const onScrollOrResize = () => updateMenuPosition();

		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		window.addEventListener("resize", onScrollOrResize);
		window.addEventListener("scroll", onScrollOrResize, true);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("resize", onScrollOrResize);
			window.removeEventListener("scroll", onScrollOrResize, true);
		};
	}, [open, updateMenuPosition]);

	const options: { id: LandingLocale; label: string }[] = [
		{ id: "en", label: t.nav.english },
		{ id: "zh", label: t.nav.chinese },
	];

	const pick = (next: LandingLocale) => {
		setLocale(next);
		setOpen(false);
	};

	const menu =
		open &&
		createPortal(
			<div
				ref={menuRef}
				className="hz-nav-lang-menu"
				style={{
					position: "fixed",
					top: menuStyle.top,
					left: menuStyle.left,
					zIndex: 9999,
				}}
				role="listbox"
				aria-label={t.nav.language}
			>
				{options.map((opt) => {
					const active = locale === opt.id;
					return (
						<button
							key={opt.id}
							type="button"
							role="option"
							aria-selected={active}
							className="hz-nav-lang-option"
							onClick={() => pick(opt.id)}
						>
							{opt.label}
						</button>
					);
				})}
			</div>,
			document.body,
		);

	return (
		<div ref={rootRef} className="hz-nav-lang">
			<button
				ref={triggerRef}
				type="button"
				className="hz-nav-lang-trigger"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				aria-haspopup="listbox"
			>
				{t.nav.language}
				<ChevronDown
					size={14}
					strokeWidth={2}
					aria-hidden
					style={{
						opacity: 0.75,
						transform: open ? "rotate(180deg)" : undefined,
						transition: "transform 0.2s",
					}}
				/>
			</button>
			{menu}
		</div>
	);
}
