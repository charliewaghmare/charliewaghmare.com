export function vancouverDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Monday of the current calendar week in America/Vancouver, as YYYY-MM-DD. */
export function vancouverWeekStart(now = new Date()): string {
  const [year, month, day] = vancouverDate(now).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const mondayOffset = weekday === 0 ? 6 : weekday - 1;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

export function appliedThisWeek(appliedOn: string | null, now = new Date()): boolean {
  if (!appliedOn) return false;
  return appliedOn >= vancouverWeekStart(now) && appliedOn <= vancouverDate(now);
}

export function pageOf<T>(items: T[], shown: number): { visible: T[]; total: number; hasMore: boolean } {
  const count = Math.max(0, shown);
  return {
    visible: items.slice(0, count),
    total: items.length,
    hasMore: items.length > count,
  };
}
