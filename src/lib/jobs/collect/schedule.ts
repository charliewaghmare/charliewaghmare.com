/** GitHub cron is UTC. 13:00 UTC is 6:00 PDT and 14:00 UTC is 6:00 PST. */
export function shouldRunScheduled(now: Date, trigger: string): boolean {
  if (trigger !== "schedule") return true;
  return vancouverHour(now) === 6;
}

export function vancouverHour(now: Date): number {
  return vancouverLocal(now).hour;
}

export function vancouverLocal(now: Date): { hour: number; weekday: number } {
  const year = now.getUTCFullYear();
  const dstStart = utcOnNthSunday(year, 2, 2, 10);
  const dstEnd = utcOnNthSunday(year, 10, 1, 9);
  const offsetHours = now.getTime() >= dstStart && now.getTime() < dstEnd ? 7 : 8;
  const local = new Date(now.getTime() - offsetHours * 60 * 60 * 1000);
  return { hour: local.getUTCHours(), weekday: local.getUTCDay() };
}

/** Scheduled research is off. A run starts only from an explicit search on the jobs page. */
export function shouldRunResearch(_now: Date, trigger: string): boolean {
  return trigger !== "schedule";
}

function utcOnNthSunday(year: number, monthIndex: number, nth: number, utcHour: number): number {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const firstSunday = 1 + ((7 - first.getUTCDay()) % 7);
  return Date.UTC(year, monthIndex, firstSunday + (nth - 1) * 7, utcHour);
}
