import { and, gte, lte, SQL } from 'drizzle-orm';
import type { AnyColumn } from 'drizzle-orm';

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

