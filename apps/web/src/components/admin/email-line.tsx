import { cn } from "@/lib/utils";

/**
 * An e-mail address on ONE line, WHOLE — never broken mid-word (owner, 20 Nov
 * 2026).
 *
 * The admin tables wrap their cells `anywhere` so a long value cannot burst a
 * column, and that split addresses inside a word: "pr.meiling@innocenz.de" over
 * a lone "mo", "…@gmail.co" over a lone "m". An address is one thing you read
 * (and copy) as a whole, so it does not wrap at all. Its column is sized to hold
 * the usual address; one longer than the column ends in "…", and the full
 * address stays on the element as its `title`.
 */
export function EmailLine({
	email,
	className,
}: {
	email: string | null | undefined;
	className?: string;
}) {
	if (!email) return <div className={className}>—</div>;
	return (
		<div className={cn("truncate", className)} title={email}>
			{email}
		</div>
	);
}
