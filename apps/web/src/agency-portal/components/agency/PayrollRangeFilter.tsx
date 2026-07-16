import type { ReactNode } from 'react';
import {
  EMPTY_PAYROLL_RANGE,
  payrollRangeActive,
  type PayrollRangeFilter,
} from '@agency-portal/lib/payroll-filters';
import { Calendar, Clock } from 'lucide-react';

export function PayrollRangeFilterCard({
  range,
  onChange,
  onClear,
  hint = 'Filters by issue date on PVs & invoices · receipt scans use scan time when set.',
  clearLabel = 'Clear range',
  clearActive = false,
  children,
}: {
  range: PayrollRangeFilter;
  onChange: (next: PayrollRangeFilter) => void;
  onClear: () => void;
  hint?: string;
  clearLabel?: string;
  /** Show clear when non-range filters are also active */
  clearActive?: boolean;
  children?: ReactNode;
}) {
  const showClear = payrollRangeActive(range) || clearActive;

  return (
    <div className="mt-3 rounded-xl border border-[var(--iz-line)] bg-[var(--iz-bg2)]/60 p-2.5">
      <div className="flex items-center gap-2 iz-tiny iz-muted">
        <Calendar className="h-3.5 w-3.5 shrink-0" />
        {children ? 'Filters' : 'Date & time range'}
        {showClear && (
          <button
            type="button"
            className="ml-auto text-[var(--iz-gold-l)]"
            onClick={onClear}
          >
            {clearLabel}
          </button>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="iz-tiny iz-muted2">
          From date
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-[var(--iz-line)] bg-[var(--iz-bg2)] px-2 py-1.5 text-xs"
            value={range.fromDate}
            onChange={(e) => onChange({ ...range, fromDate: e.target.value })}
          />
        </label>
        <label className="iz-tiny iz-muted2">
          To date
          <input
            type="date"
            className="mt-1 w-full rounded-lg border border-[var(--iz-line)] bg-[var(--iz-bg2)] px-2 py-1.5 text-xs"
            value={range.toDate}
            onChange={(e) => onChange({ ...range, toDate: e.target.value })}
          />
        </label>
        <label className="iz-tiny iz-muted2">
          <Clock className="mr-1 inline h-3 w-3" />
          From time
          <input
            type="time"
            className="mt-1 w-full rounded-lg border border-[var(--iz-line)] bg-[var(--iz-bg2)] px-2 py-1.5 text-xs"
            value={range.fromTime}
            onChange={(e) => onChange({ ...range, fromTime: e.target.value })}
          />
        </label>
        <label className="iz-tiny iz-muted2">
          <Clock className="mr-1 inline h-3 w-3" />
          To time
          <input
            type="time"
            className="mt-1 w-full rounded-lg border border-[var(--iz-line)] bg-[var(--iz-bg2)] px-2 py-1.5 text-xs"
            value={range.toTime}
            onChange={(e) => onChange({ ...range, toTime: e.target.value })}
          />
        </label>
      </div>
      {children ? (
        <div className="mt-2 grid grid-cols-1 gap-2 border-t border-[var(--iz-line)] pt-2 sm:grid-cols-3">
          {children}
        </div>
      ) : null}
      <p className="iz-tiny iz-muted2 mt-2">{hint}</p>
    </div>
  );
}

export { EMPTY_PAYROLL_RANGE };
