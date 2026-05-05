export const DEFAULT_YNAB_IMPORT_HISTORY_DAYS = 30;

export function getMaxYnabImportHistoryDays(): number {
  const override = Number.parseInt(process.env.YNAB_MAX_IMPORT_HISTORY_DAYS || "", 10);
  const overrideAllowed =
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_EXTENDED_YNAB_LOOKBACK === "true";

  if (overrideAllowed && Number.isFinite(override) && override > 0) {
    return override;
  }

  return DEFAULT_YNAB_IMPORT_HISTORY_DAYS;
}

export function isoDateDaysAgo(days: number, now = new Date()): string {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  return date.toISOString().split("T")[0];
}

export function clampSinceDateToMaxHistory(
  sinceDate?: string,
  now = new Date()
): { sinceDate: string; wasCapped: boolean; maxDays: number } {
  const maxDays = getMaxYnabImportHistoryDays();
  const earliestAllowed = isoDateDaysAgo(maxDays, now);
  if (!sinceDate || sinceDate < earliestAllowed) {
    return {
      sinceDate: earliestAllowed,
      wasCapped: Boolean(sinceDate),
      maxDays,
    };
  }

  return {
    sinceDate,
    wasCapped: false,
    maxDays,
  };
}
