import { AnyColumn, sql, SQL } from 'drizzle-orm';

// Supported time-bucket granularities for sales/revenue summaries.
export const granularityValues = ['day', 'week', 'month', 'year'] as const;
export type Granularity = (typeof granularityValues)[number];

// Fixed map (keyed by a validated Granularity) -> the date_trunc unit and the
// to_char format used to label each bucket. Values are constants, never user
// input, so binding them as SQL parameters is safe.
const PERIOD_FORMAT: Record<Granularity, { unit: string; format: string }> = {
  day: { unit: 'day', format: 'YYYY-MM-DD' },
  week: { unit: 'week', format: 'IYYY-"W"IW' },
  month: { unit: 'month', format: 'YYYY-MM' },
  year: { unit: 'year', format: 'YYYY' },
};

// Coerce an arbitrary query value into a valid Granularity, defaulting to 'month'.
export function parseGranularity(value: unknown): Granularity {
  return granularityValues.includes(value as Granularity) ? (value as Granularity) : 'month';
}

// Build the "period label" SQL expression for a timestamp column at the given
// granularity, e.g. '2026-07', '2026-07-14', '2026-W29', '2026'.
export function periodExpr(column: AnyColumn | SQL, granularity: Granularity): SQL<string> {
  const { unit, format } = PERIOD_FORMAT[granularity];
  return sql<string>`to_char(date_trunc(${unit}, ${column}), ${format})`;
}
