import {
	AlertTriangle,
	CheckCircle2,
	Clock,
	MinusCircle,
	Palette,
} from "lucide-react";
import type { ComponentType } from "react";
import { Badge } from "@/components/ui/badge";
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
import {
	STATUS_TONE_CLASS,
	STATUS_TONES,
	type StatusTone,
	statusTone,
} from "@/lib/status-tone";

/**
 * The icon each tone wears. Colour alone cannot carry a meaning — roughly one
 * man in twelve cannot separate the green pill from the red one — so the tone
 * is said twice: once in the tint, once in a shape that differs at any size.
 */
const TONE_ICON: Record<StatusTone, ComponentType<{ className?: string }>> = {
	safe: CheckCircle2,
	caution: Clock,
	warning: AlertTriangle,
	neutral: MinusCircle,
};

/**
 * A record's status, as one pill: tone tint, tone icon, and the LABEL the
 * caller already resolved for the reader's locale.
 *
 * The label is passed in rather than looked up here on purpose — the three
 * status vocabularies (organisation, membership, account) share values without
 * sharing meanings, and their resolvers already live beside the data
 * (`orgStatusLabel`, `memberStatusLabel`, `recordStatusLabel`). This component
 * owns the APPEARANCE of a status and nothing else.
 */
export function StatusPill({
	status,
	label,
	className,
}: {
	/** The RAW stored status code — `active`, `pending_review`, … */
	status: string;
	/** The already-localised word to show. */
	label: string;
	className?: string;
}) {
	const tone = statusTone(status);
	const Icon = TONE_ICON[tone];
	return (
		<Badge
			variant="outline"
			className={`${STATUS_TONE_CLASS[tone]} inline-flex w-fit items-center gap-1.5 font-semibold${
				className ? ` ${className}` : ""
			}`}
		>
			<Icon aria-hidden className="size-3.5 shrink-0" />
			{label}
		</Badge>
	);
}

/** The four tones, in the order a reader should learn them. */
function legendEntries(locale: string): {
	tone: StatusTone;
	label: string;
	detail: string;
}[] {
	const zh = locale === "zh";
	return STATUS_TONES.map((tone) => {
		if (tone === "safe") {
			return {
				tone,
				label: zh ? "绿色 — 正常" : "Green — working",
				detail: zh
					? "一切正常运作，无需处理。"
					: "Running normally. Nothing is being asked of you.",
			};
		}
		if (tone === "caution") {
			return {
				tone,
				label: zh ? "琥珀色 — 等待中" : "Amber — waiting",
				detail: zh
					? "正在等待审批或回复，需要有人处理。"
					: "Waiting on a decision. Someone still has to act on it.",
			};
		}
		if (tone === "warning") {
			return {
				tone,
				label: zh ? "红色 — 已停止" : "Red — stopped",
				detail: zh
					? "已暂停、被拒或被封锁，需要注意。"
					: "Suspended, refused or blocked. Needs your attention.",
			};
		}
		return {
			tone,
			label: zh ? "灰色 — 已关闭" : "Grey — switched off",
			detail: zh
				? "已停用，不再使用，并非出错。"
				: "Not in use any more. Nothing has gone wrong.",
		};
	});
}

/**
 * What the status colours mean, as a dialog the reader can open from the
 * header — the same affordance as `AdminIconGuide` beside it.
 *
 * It exists because the console has used four tones since the organisation
 * tables were built and has never once said what they meant: a reader could
 * see that amber differed from grey without being able to tell that one was
 * waiting on them and the other was finished with.
 */
export function StatusLegend() {
	const { locale } = usePortalLocale();
	const zh = locale === "zh";
	const title = zh ? "状态颜色说明" : "Status colours";
	return (
		<Dialog>
			<DialogTrigger asChild>
				{/*
				  A palette, not a "?". It sat beside the Icon guide's "?" in the top
				  bar, and two identical glyphs opening two different dialogs could be
				  told apart only by hovering for the tooltip (design review, 20 Nov
				  2026). The glyph now says what this one opens: the colours.
				*/}
				<Button variant="outline" size="icon" aria-label={title} title={title}>
					<Palette aria-hidden />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						{zh
							? "每个状态标签的颜色含义。"
							: "What the colour on every status badge is telling you."}
					</DialogDescription>
				</DialogHeader>
				<ul className="space-y-4">
					{legendEntries(locale).map(({ tone, label, detail }) => {
						const Icon = TONE_ICON[tone];
						return (
							<li key={tone} className="flex items-start gap-3">
								<Badge
									variant="outline"
									className={`${STATUS_TONE_CLASS[tone]} mt-0.5 shrink-0 px-2 py-1`}
								>
									<Icon aria-hidden className="size-4" />
								</Badge>
								<div>
									<p className="font-semibold">{label}</p>
									<p className="text-muted-foreground">{detail}</p>
								</div>
							</li>
						);
					})}
				</ul>
			</DialogContent>
		</Dialog>
	);
}
