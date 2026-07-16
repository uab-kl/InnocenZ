import { LabelWithIcon } from '@agency-portal/components/iz/TitleWithIcon';
import { cn } from '@agency-portal/lib/utils';

/** Icon + label for live sales earnings rows, table headers, and PR tonight actions. */
export function LiveEarningsLabel({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <LabelWithIcon
      label={label}
      className={cn('iz-live-earnings-label', className)}
      iconClassName="iz-live-earnings-label__icon"
    />
  );
}
