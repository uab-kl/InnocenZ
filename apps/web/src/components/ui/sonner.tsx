"use client";

import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
	return (
		<Sonner
			// The app is dark only (theme-provider.tsx); a toast must not follow
			// the device into light mode on its own.
			theme="dark"
			className="toaster group"
			// The icon carries the status code (CLAUDE.md): success the settled
			// green, error the disputed red, info lavender — the same as the
			// agency/outlet bar (prototype-theme.css .iz-toast-ic). No call site
			// uses toast.warning today; in these portals a warning tone has meant a
			// failure, so it reads red too, never amber ("waiting").
			icons={{
				success: <CircleCheckIcon className="size-4 text-signal-live" />,
				info: <InfoIcon className="size-4 text-lavender" />,
				warning: <TriangleAlertIcon className="size-4 text-destructive" />,
				error: <OctagonXIcon className="size-4 text-destructive" />,
				loading: <Loader2Icon className="size-4 animate-spin" />,
			}}
			// Flat, like the agency/outlet bar: one surface step above the cards
			// (--ink-elevated over --card), the strong hairline (--input, the same
			// value as the portals' --iz-line2), ink text.
			style={
				{
					"--normal-bg": "var(--ink-elevated)",
					"--normal-text": "var(--foreground)",
					"--normal-border": "var(--input)",
					"--border-radius": "var(--radius)",
				} as React.CSSProperties
			}
			// Inline, because sonner's own stylesheet is unlayered and sets 13px
			// and a near-invisible shadow at (0,2,0): any Tailwind utility loses
			// to it. Text on the 16px step; ONE floating shadow, the same as the
			// agency/outlet bar's. Position, duration and motion stay sonner's.
			toastOptions={{
				style: {
					fontSize: "var(--iz-fs-body, 1rem)",
					boxShadow: "0 20px 50px -10px rgba(0, 0, 0, 0.8)",
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };
