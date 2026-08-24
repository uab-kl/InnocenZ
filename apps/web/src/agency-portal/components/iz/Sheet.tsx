import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

type MountMode = "phone" | "overlay";
export type SheetVariant = "bottom" | "dialog" | "side";

function resolveSheetMount(variant: SheetVariant): {
	el: HTMLElement;
	mode: MountMode;
} {
	if (variant === "side") {
		return { el: document.body, mode: "overlay" };
	}
	const phone = document.querySelector(".iz-phone");
	if (phone instanceof HTMLElement) return { el: phone, mode: "phone" };
	return { el: document.body, mode: "overlay" };
}

function sheetVariantClass(mode: MountMode, variant: SheetVariant) {
	if (mode === "phone" || variant === "bottom") return "";
	if (variant === "side") return " iz-sheet--side";
	return " iz-sheet--dialog";
}

/**
 * How many sheets currently hold the scroll lock, and how to undo the FIRST one.
 *
 * ⚠️ THIS COUNTER IS THE WHOLE FIX. Every sheet used to save and restore the
 * overflow it happened to find, which is only correct while exactly one sheet
 * exists. Two can: the roster keeps `demandDay` and `assignTarget` in separate
 * state, so a day sheet and an assign sheet are open together, and the second
 * one to mount saved "hidden" — the value the FIRST one had just written. Close
 * them in the order that unmounts the outer sheet first and the inner one
 * "restores" hidden onto a page with no sheet left on it. The page is then
 * locked with nothing on screen to explain why, and only a reload clears it.
 *
 * Refcounted, so the state is captured by whoever locks FIRST and restored by
 * whoever unlocks LAST — the order the sheets close in stops mattering.
 */
let scrollLockDepth = 0;
let releaseScrollLock: (() => void) | null = null;

function lockScroll() {
	scrollLockDepth += 1;
	if (scrollLockDepth === 1) {
		const targets: HTMLElement[] = [];
		for (const sel of [".iz-portal-viewport", ".iz-viewport", ".iz-phone"]) {
			const el = document.querySelector(sel);
			if (el instanceof HTMLElement) targets.push(el);
		}
		const saved = targets.map((el) => ({
			el,
			overflow: el.style.overflow,
			top: el.scrollTop,
		}));
		targets.forEach((el) => {
			el.style.overflow = "hidden";
		});
		const bodyOverflow = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		releaseScrollLock = () => {
			saved.forEach(({ el, overflow, top }) => {
				el.style.overflow = overflow;
				el.scrollTop = top;
			});
			document.body.style.overflow = bodyOverflow;
		};
	}
	// Guarded against a second call: React re-invokes an effect's cleanup in
	// StrictMode, and a cleanup that decremented twice would drop the count
	// below the sheets still on screen and unlock the page under them.
	let released = false;
	return () => {
		if (released) return;
		released = true;
		scrollLockDepth = Math.max(0, scrollLockDepth - 1);
		if (scrollLockDepth === 0 && releaseScrollLock) {
			releaseScrollLock();
			releaseScrollLock = null;
		}
	};
}

function SheetContent({
	onClose,
	children,
	mode,
	variant,
	wide,
	rating,
	comcard,
	liveSales,
}: {
	onClose: () => void;
	children: ReactNode;
	mode: MountMode;
	variant: SheetVariant;
	wide?: boolean;
	rating?: boolean;
	comcard?: boolean;
	liveSales?: boolean;
}) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const wrapClass =
		variant === "side"
			? `iz-sheet-wrap open iz-sheet-wrap--${mode} iz-sheet-wrap--side`
			: `iz-sheet-wrap open iz-sheet-wrap--${mode}`;

	return (
		<div className={wrapClass}>
			<button
				type="button"
				className="iz-sheet-bg"
				aria-label="Close"
				onClick={onClose}
			/>
			{/*
			 * biome-ignore lint/a11y/useKeyWithClickEvents: this onClick performs no
			 * action — it is a containment guard. The sheet is rendered through a
			 * portal, and React bubbles events along the REACT tree, so without it a
			 * click on anything inside the sheet also fires the onClick of whatever
			 * row or card opened the sheet. There is nothing for a key press to do
			 * here, and the keyboard path is already covered: Escape closes via the
			 * window listener above, which a matching onKeyDown would in fact BREAK,
			 * since stopping the keydown would stop Escape reaching that listener.
			 */}
			<div
				className={`iz-sheet${sheetVariantClass(mode, variant)}${wide ? " iz-sheet--wide" : ""}${rating ? " iz-sheet--rating" : ""}${comcard ? " iz-sheet--comcard" : ""}${liveSales ? " iz-sheet--live-sales" : ""}`}
				role="dialog"
				aria-modal="true"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="iz-sheet-grab" aria-hidden />
				{children}
			</div>
		</div>
	);
}

export function IzSheet({
	open,
	onClose,
	children,
	variant = "dialog",
	wide = false,
	rating = false,
	/** Wide live sales breakdown — fits full earnings table without scroll. */
	liveSales = false,
	comcard = false,
}: {
	open: boolean;
	onClose: () => void;
	children: ReactNode;
	/** bottom = phone frame; dialog = centered/bottom overlay; side = right panel (portal) */
	variant?: SheetVariant;
	wide?: boolean;
	rating?: boolean;
	liveSales?: boolean;
	/** Compact PR comcard preview — no inner scroll, content sized to fit. */
	comcard?: boolean;
}) {
	useEffect(() => {
		if (!open) return;
		return lockScroll();
	}, [open]);

	if (!open || typeof document === "undefined") return null;

	const mount = resolveSheetMount(variant);
	const sheetVariant = mount.mode === "phone" ? "bottom" : variant;
	const sheet = (
		<SheetContent
			onClose={onClose}
			mode={mount.mode}
			variant={sheetVariant}
			wide={wide}
			rating={rating}
			comcard={comcard}
			liveSales={liveSales}
		>
			{children}
		</SheetContent>
	);

	return createPortal(sheet, mount.el);
}
