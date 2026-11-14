import { addDays, formatDay, formatDistance, formatDuration, formatPace, phrase } from "./format";
import type { Point } from "./polyline";
import type { ActivityRow, DayBar, RunCard } from "./snapshot";

export type Activity = {
  id: string;
  name: string;
  typeKey: string;
  date: string;
  startedAt: string;
  distanceMeters: number | null;
  durationSeconds: number | null;
  maxHr?: number | null;
  elevationGain?: number | null;
  cadence?: number | null;
  power?: number | null;
  calories?: number | null;
  averageHr: number | null;
  averageSpeed: number | null;
  movingSeconds: number | null;
  startLocal?: string | null;
  run: boolean;
};

export function parseActivities(payload: unknown): Activity[] {
  const list = Array.isArray(payload)
    ? payload
    : asRecord(payload)?.activities;
  if (!Array.isArray(list)) return [];

  const activities: Activity[] = [];
  for (const item of list) {
    const record = asRecord(item);
    if (!record) continue;
    const id = record.activityId;
    if (typeof id !== "number" && typeof id !== "string") continue;
    const typeKey = activityTypeKey(record);
    const date = activityDate(record);
    if (!date) continue;
    activities.push({
      id: String(id),
      name: stringValue(record.activityName) ?? phrase(typeKey || "Activity"),
      typeKey,
      date,
      startedAt: normalizedTime(record.startTimeGMT) ?? stringValue(record.startTimeLocal) ?? date,
      distanceMeters: nonnegative(numberValue(record.distance)),
      durationSeconds: nonnegative(numberValue(record.duration)),
      maxHr: positive(numberValue(record.maxHR)),
      elevationGain: positive(numberValue(record.elevationGain)),
      cadence: positive(numberValue(record.averageRunningCadenceInStepsPerMinute)),
      power: positive(numberValue(record.avgPower)),
      calories: positive(numberValue(record.calories)),
      averageHr: positive(numberValue(record.averageHR)),
      averageSpeed: positive(numberValue(record.averageSpeed)),
      movingSeconds: positive(numberValue(record.movingDuration)),
      startLocal: stringValue(record.startTimeLocal),
      run: /(^|_)(run|running)($|_)/i.test(typeKey),
    });
  }
  return [...new Map(activities.map((activity) => [activity.id, activity])).values()]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function activityTypeKey(record: Record<string, unknown>): string {
  const type = asRecord(record.activityType);
  return stringValue(type?.typeKey) ?? "";
}

function activityDate(record: Record<string, unknown>): string | null {
  const gmt = normalizedTime(record.startTimeGMT);
  if (!gmt) {
    const local = stringValue(record.startTimeLocal);
    return local && /^\d{4}-\d{2}-\d{2}/.test(local) ? local.slice(0, 10) : null;
  }
  const ms = Date.parse(gmt);
  if (Number.isNaN(ms)) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

export function paceLabelFor(activity: Activity): string | null {
  if (activity.averageSpeed && activity.averageSpeed > 0.4) {
    return formatPace(1000, 1000 / activity.averageSpeed) ?? "—";
  }
  const seconds = activity.movingSeconds ?? activity.durationSeconds;
  return activity.distanceMeters === null || seconds === null ? null : formatPace(activity.distanceMeters, seconds);
}

export function toRunCard(activity: Activity, points: Point[]): RunCard {
  return {
    name: activity.name,
    dateLabel: formatDay(activity.date, false),
    distanceLabel: activity.distanceMeters === null ? "—" : formatDistance(activity.distanceMeters),
    timeLabel: activity.durationSeconds === null ? "—" : formatDuration(activity.durationSeconds),
    heartRateLabel: activity.averageHr ? `${Math.round(activity.averageHr)}` : "—",
    paceLabel: paceLabelFor(activity) ?? "—",
    points,
  };
}

export function toRow(activity: Activity): ActivityRow {
  return {
    id: activity.id,
    name: activity.name,
    typeLabel: activity.typeKey ? phrase(activity.typeKey) : "Activity",
    dateLabel: formatDay(activity.date),
    distanceLabel:
      activity.distanceMeters !== null && activity.distanceMeters > 0 ? formatDistance(activity.distanceMeters) : "—",
    timeLabel:
      activity.durationSeconds !== null && activity.durationSeconds > 0 ? formatDuration(activity.durationSeconds) : "—",
    heartRateLabel: activity.averageHr ? `${Math.round(activity.averageHr)} bpm` : "—",
    paceLabel: paceLabelFor(activity),
    href: /^\d+$/.test(activity.id)
      ? `https://connect.garmin.com/modern/activity/${activity.id}`
      : null,
    run: activity.run,
  };
}

export function totalsLabel(activities: Activity[]): string {
  const runs = activities.filter((activity) => activity.run);
  const distance = runs.reduce((sum, activity) => sum + (activity.distanceMeters ?? 0), 0);
  const time = runs.reduce((sum, activity) => sum + (activity.durationSeconds ?? 0), 0);
  const runWord = runs.length === 1 ? "run" : "runs";
  return `${runs.length} ${runWord} · ${formatDistance(distance)} · ${formatDuration(time)}${runs.some((run) => run.distanceMeters === null || run.durationSeconds === null) ? " · incomplete totals" : ""}`;
}

export function dayBars(start: string, activities: Activity[]): DayBar[] {
  const totals = new Map<string, number>();
  for (const activity of activities) {
    if (!activity.run || activity.distanceMeters === null) continue;
    totals.set(activity.date, (totals.get(activity.date) ?? 0) + activity.distanceMeters / 1000);
  }
  return Array.from({ length: 30 }, (_, index) => {
    const iso = addDays(start, index);
    return {
      iso,
      label: formatDay(iso),
      km: totals.get(iso) ?? 0,
    };
  });
}


function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function stringValue(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function numberValue(value: unknown): number | null {
  return (typeof value === "number" || typeof value === "string" && value.trim() !== "") && Number.isFinite(Number(value)) ? Number(value) : null;
}
function positive(value: number | null): number | null { return value !== null && value > 0 ? value : null; }
function nonnegative(value: number | null): number | null { return value !== null && value >= 0 ? value : null; }
function normalizedTime(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;
  const normalized = text.replace(" ", "T");
  const date = new Date(/Z$|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : normalized + "Z");
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/** Bound requests while collecting a complete 30-day window when possible. */
export async function activityWindow(start: string, fetchPage: (offset: number) => Promise<unknown>) {
  const all: Activity[] = [];
  for (let offset = 0; offset < 500; offset += 100) {
    const payload = await fetchPage(offset);
    const rows = Array.isArray(payload) ? payload : asRecord(payload)?.activities;
    if (!Array.isArray(rows)) throw new Error("Invalid activity response");
    const parsed = parseActivities(rows);
    all.push(...parsed);
    if (rows.length < 100 || parsed.some((activity) => activity.date < start)) {
      return { activities: uniqueActivities(all), limited: false };
    }
  }
  return { activities: uniqueActivities(all), limited: true };
}
function uniqueActivities(activities: Activity[]) {
  return [...new Map(activities.map((activity) => [activity.id, activity])).values()]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
