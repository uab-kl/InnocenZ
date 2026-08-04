import { cn } from "@agency-portal/lib/utils";
import { type ReactNode, useRef } from "react";

type IzHScrollProps = {
	className?: string;
	children: ReactNode;
};

const DRAG_THRESHOLD_PX = 8;

function isInteractiveTarget(target: EventTarget | null) {
	if (!(target instanceof Element)) return false;
	return !!target.closest(
		'button, a, input, select, textarea, label, [role="button"]',
	);
}

export function IzHScroll({ className, children }: IzHScrollProps) {
	const ref = useRef<HTMLDivElement>(null);
	const drag = useRef({
		pointerId: -1,
		startX: 0,
		scrollLeft: 0,
		dragging: false,
	});
	const suppressClick = useRef(false);

	const resetDrag = () => {
		drag.current = { pointerId: -1, startX: 0, scrollLeft: 0, dragging: false };
		ref.current?.classList.remove("iz-hscroll--dragging");
	};

	const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (e.pointerType !== "mouse" || e.button !== 0) return;
		if (isInteractiveTarget(e.target)) return;

		const el = ref.current;
		if (!el) return;

		drag.current = {
			pointerId: e.pointerId,
			startX: e.clientX,
			scrollLeft: el.scrollLeft,
			dragging: false,
		};
	};

	const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		const el = ref.current;
		const d = drag.current;
		if (!el || d.pointerId !== e.pointerId) return;

		const dx = e.clientX - d.startX;
		if (!d.dragging) {
			if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
			d.dragging = true;
			el.classList.add("iz-hscroll--dragging");
			el.setPointerCapture(e.pointerId);
		}

		el.scrollLeft = d.scrollLeft - dx;
	};

	const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
		const d = drag.current;
		if (d.pointerId !== e.pointerId) return;

		if (d.dragging) {
			suppressClick.current = true;
			try {
				ref.current?.releasePointerCapture(e.pointerId);
			} catch {
				/* ignore */
			}
		}

		resetDrag();
	};

	const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
		if (!suppressClick.current) return;
		e.preventDefault();
		e.stopPropagation();
		suppressClick.current = false;
	};

	return (
		<div
			ref={ref}
			className={cn("iz-hscroll", className)}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerUp}
			onClickCapture={onClickCapture}
		>
			{children}
		</div>
	);
}
