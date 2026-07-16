import { and, gte, lte, or, SQL } from 'drizzle-orm';
import type { AnyColumn } from 'drizzle-orm';

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse `dates=2026-07-16,2026-07-20` from a list/query filter. */
export function parseDatesQuery(value: unknown): string[] | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const dates = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => ISO_DAY_RE.test(part));
  return dates.length > 0 ? dates : undefined;
}

function dayBounds(isoDay: string): { start: Date; end: Date } | null {
  if (!ISO_DAY_RE.test(isoDay)) return null;
  const start = new Date(`${isoDay}T00:00:00`);
  const end = new Date(`${isoDay}T23:59:59.999`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

/** Match rows whose timestamp falls on any of the given calendar days (inclusive). */
export function buildMultiDayWhere(column: AnyColumn, dates?: string[]): SQL | undefined {
  if (!dates || dates.length === 0) return undefined;
  const dayClauses = dates
    .map((day) => dayBounds(day))
    .filter((bounds): bounds is { start: Date; end: Date } => bounds !== null)
    .map(({ start, end }) => and(gte(column, start), lte(column, end)));
  if (dayClauses.length === 0) return undefined;
  return or(...dayClauses)!;
}

export function parseFilterDate(value: Date | string | null | undefined): Date | undefined {
    if (value == null || value === '') return undefined;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
}

export function startOfDay(date: Date): Date {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
}

export function endOfDay(date: Date): Date {
    const normalized = new Date(date);
    normalized.setHours(23, 59, 59, 999);
    return normalized;
}

/**
 * Build a single createdAt filter from optional start/end dates.
 * - Both dates: within the period (inclusive).
 * - startDate only: on or after the selected date.
 * - endDate only: on or before the selected date.
 * - Neither: undefined (no filter applied).
 */
export function buildPeriodDateWhere(
    column: AnyColumn,
    startDate?: Date | string | null,
    endDate?: Date | string | null,
): SQL | undefined {
    const start = parseFilterDate(startDate);
    const end = parseFilterDate(endDate);

    if (start && end) {
        return and(gte(column, startOfDay(start)), lte(column, endOfDay(end)));
    }

    if (start) {
        return gte(column, startOfDay(start));
    }

    if (end) {
        return lte(column, endOfDay(end));
    }

    return undefined;
}

/** @deprecated Prefer buildPeriodDateWhere — kept for callers that need an array. */
export function applyPeriodDateFilter(
    column: AnyColumn,
    startDate?: Date | string | null,
    endDate?: Date | string | null,
): SQL[] {
    const condition = buildPeriodDateWhere(column, startDate, endDate);
    return condition ? [condition] : [];
}

