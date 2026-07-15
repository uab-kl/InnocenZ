export type ZonedDateParts = {
    year: number;
    month: number; // 1-12
    day: number; // 1-31
  };
  
  function getZonedYmdParts(date: Date, timeZone: string): ZonedDateParts {
    const dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  
    const parts = dtf.formatToParts(date);
    const year = Number(parts.find((p) => p.type === "year")?.value);
    const month = Number(parts.find((p) => p.type === "month")?.value);
    const day = Number(parts.find((p) => p.type === "day")?.value);
  
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      throw new Error(`[date.getZonedYmdParts] Failed to derive Y/M/D for timezone "${timeZone}"`);
    }
  
    return { year, month, day };
  }
  
  /**
   * Returns true if `date` (interpreted in `timeZone`) falls within the month-end window:
   * last day of month, or within N days before it (inclusive).
   *
   * Example for N=2: 29/3/2026, 30/3/2026, 31/3/2026 are eligible.
   */
  export function isWithinMonthEndWindow(
    date: Date,
    opts?: { timeZone?: string; daysFromEndInclusive?: number }
  ): boolean {
    const timeZone = opts?.timeZone ?? "Asia/Kuala_Lumpur";
    const daysFromEndInclusive = opts?.daysFromEndInclusive ?? 2;
  
    if (!Number.isInteger(daysFromEndInclusive) || daysFromEndInclusive < 0 || daysFromEndInclusive > 31) {
      throw new Error(`[date.isWithinMonthEndWindow] Invalid daysFromEndInclusive=${String(daysFromEndInclusive)}`);
    }
  
    const { year, month, day } = getZonedYmdParts(date, timeZone);
  
    // Use UTC math to avoid host timezone affecting the computed day count.
    const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1-12 here
    return lastDayOfMonth - day <= daysFromEndInclusive;
  }
  