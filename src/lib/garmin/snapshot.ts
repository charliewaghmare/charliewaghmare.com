import { cacheLife } from "next/cache";
import {
  GarminAuthError,
  garminGet,
  readGarminToken,
} from "@/lib/garmin/client";
import {
  buildMetrics,
  displayNameFrom,
  type Metric,
} from "@/lib/garmin/extract";
import {
  addDays,
  formatDay,
  formatDistance,
  formatDuration,
  formatPace,
  formatRange,
  phrase,
  vancouverToday,
} from "@/lib/garmin/format";
import { pointsFromPayloads, type Point } from "@/lib/garmin/polyline";

export type RunCard = {
  name: string;
  dateLabel: string;
  distanceLabel: string;
  timeLabel: string;
  heartRateLabel: string;
  paceLabel: string;
  points: Point[];
};

export type ActivityRow = {
  id: string;
  name: string;
  typeLabel: string;
  dateLabel: string;
  distanceLabel: string;
  timeLabel: string;
  heartRateLabel: string;
  paceLabel: string | null;
  href: string | null;
  run: boolean;
};

export type DayBar = {
  iso: string;
  label: string;
  km: number;
};

export type TrainingSnapshot = {
  source: "garmin" | "sample" | "unavailable";
  note: string | null;
  rangeLabel: string;
  latestRun: RunCard | null;
  totalsLabel: string;
  metrics: Metric[];
  days: DayBar[];
  activities: ActivityRow[];
};

type Activity = {
  id: string;
  name: string;
  typeKey: string;
  date: string;
  distanceMeters: number;
  durationSeconds: number;
  averageHr: number | null;
  averageSpeed: number | null;
  movingSeconds: number | null;
  run: boolean;
};

export async function getTrainingSnapshot(): Promise<TrainingSnapshot> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 });
  return loadTrainingSnapshot();
}

async function loadTrainingSnapshot(): Promise<TrainingSnapshot> {
  const today = vancouverToday();
  const start = addDays(today, -29);
  const configured = readGarminToken();

  if (!configured.ok) {
    if (configured.reason === "missing") return sampleSnapshot(start, today);
    return unavailableSnapshot(
      start,
      today,
      "The Garmin token is not valid JSON.",
    );
  }

  try {
    return await liveSnapshot(start, today);
  } catch (error) {
    const note =
      error instanceof GarminAuthError
        ? "Garmin refused the token. Create a new one and update it in Vercel."
        : "Garmin didn’t respond. Refresh in a few minutes.";
    console.error(note);
    return unavailableSnapshot(start, today, note);
  }
}

async function liveSnapshot(start: string, end: string): Promise<TrainingSnapshot> {
  const [activitiesPayload, profile] = await Promise.all([
    garminGet("/activitylist-service/activities/search/activities", {
      start: 0,
      limit: 100,
    }),
    optional("/userprofile-service/socialProfile"),
  ]);

  const parsed = parseActivities(activitiesPayload);
  const activities = parsed.filter(
    (activity) => activity.date >= start && activity.date <= end,
  );
  const latest = parsed[0] ?? null;
  const points = latest ? await routeFor(latest.id) : [];
  const displayName = displayNameFrom(profile);
  const encodedName = displayName ? encodeURIComponent(displayName) : null;

  const sleepStart = addDays(end, -27);
  const [rhr, hrv, vo2, status, dailyStatus, balance, readiness, sleepA, sleepB] =
    await Promise.all([
      encodedName
        ? optional(`/userstats-service/wellness/daily/${encodedName}`, {
            fromDate: start,
            untilDate: end,
            metricId: 60,
          })
        : Promise.resolve(null),
      optional(`/hrv-service/hrv/daily/${start}/${end}`),
      optional(`/metrics-service/metrics/maxmet/latest/${end}`),
      optional(`/metrics-service/metrics/trainingstatus/aggregated/${end}`),
      optional(`/metrics-service/metrics/trainingstatus/daily/${end}`),
      optional(`/metrics-service/metrics/trainingloadbalance/latest/${end}`),
      optional(`/metrics-service/metrics/trainingreadiness/${start}/${end}`),
      optional(`/sleep-service/stats/sleep/daily/${start}/${addDays(start, 27)}`),
      optional(`/sleep-service/stats/sleep/daily/${sleepStart}/${end}`),
    ]);

  const metrics = buildMetrics({
    rhr,
    hrv,
    vo2,
    status,
    dailyStatus,
    balance,
    readiness,
    sleep: [sleepA, sleepB],
  });

  return {
    source: "garmin",
    note: null,
    rangeLabel: formatRange(start, end),
    latestRun: latest ? toRunCard(latest, points) : null,
    totalsLabel: totalsLabel(activities),
    metrics,
    days: dayBars(start, activities),
    activities: activities.filter((activity) => activity.run).map(toRow),
  };
}

async function optional(
  path: string,
  params?: Record<string, string | number>,
): Promise<unknown | null> {
  try {
    return await garminGet(path, params);
  } catch (error) {
    if (error instanceof GarminAuthError) throw error;
    return null;
  }
}

async function routeFor(activityId: string): Promise<Point[]> {
  const id = encodeURIComponent(activityId);
  const [details, map, polyline] = await Promise.all([
    optional(`/activity-service/activity/${id}/details`, {
      maxChartSize: 1,
      maxPolylineSize: 8000,
    }),
    optional(`/activity-service/activity/${id}/mapdetails`, {
      maxPolylineSize: 8000,
      maxHeatMapSize: 0,
    }),
    optional(`/activity-service/activity/polyline/${id}`),
  ]);
  return pointsFromPayloads([details, map, polyline]);
}

function parseActivities(payload: unknown): Activity[] {
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
      distanceMeters: numberValue(record.distance) ?? 0,
      durationSeconds: numberValue(record.duration) ?? 0,
      averageHr: positive(numberValue(record.averageHR)),
      averageSpeed: positive(numberValue(record.averageSpeed)),
      movingSeconds: positive(numberValue(record.movingDuration)),
      run: /run/i.test(typeKey),
    });
  }
  return activities;
}

function activityTypeKey(record: Record<string, unknown>): string {
  const type = asRecord(record.activityType);
  return stringValue(type?.typeKey) ?? "";
}

function activityDate(record: Record<string, unknown>): string | null {
  const local = stringValue(record.startTimeLocal);
  if (local && /^\d{4}-\d{2}-\d{2}/.test(local)) return local.slice(0, 10);
  const gmt = stringValue(record.startTimeGMT);
  if (!gmt) return null;
  const normalized = gmt.endsWith("Z") ? gmt : `${gmt.replace(" ", "T")}Z`;
  const ms = Date.parse(normalized);
  if (Number.isNaN(ms)) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function paceLabelFor(activity: Activity): string {
  if (activity.averageSpeed && activity.averageSpeed > 0.4) {
    return formatPace(1000, 1000 / activity.averageSpeed) ?? "—";
  }
  const seconds = activity.movingSeconds ?? activity.durationSeconds;
  return formatPace(activity.distanceMeters, seconds) ?? "—";
}

function toRunCard(activity: Activity, points: Point[]): RunCard {
  return {
    name: activity.name,
    dateLabel: formatDay(activity.date, false),
    distanceLabel: formatDistance(activity.distanceMeters),
    timeLabel: formatDuration(activity.durationSeconds),
    heartRateLabel: activity.averageHr ? `${Math.round(activity.averageHr)}` : "—",
    paceLabel: paceLabelFor(activity),
    points,
  };
}

function toRow(activity: Activity): ActivityRow {
  return {
    id: activity.id,
    name: activity.name,
    typeLabel: activity.typeKey ? phrase(activity.typeKey) : "Activity",
    dateLabel: formatDay(activity.date),
    distanceLabel:
      activity.distanceMeters > 0 ? formatDistance(activity.distanceMeters) : "—",
    timeLabel:
      activity.durationSeconds > 0 ? formatDuration(activity.durationSeconds) : "—",
    heartRateLabel: activity.averageHr ? `${Math.round(activity.averageHr)} bpm` : "—",
    paceLabel: formatPace(activity.distanceMeters, activity.durationSeconds),
    href: /^\d+$/.test(activity.id)
      ? `https://connect.garmin.com/modern/activity/${activity.id}`
      : null,
    run: activity.run,
  };
}

function totalsLabel(activities: Activity[]): string {
  const runs = activities.filter((activity) => activity.run);
  const distance = runs.reduce((sum, activity) => sum + activity.distanceMeters, 0);
  const time = runs.reduce((sum, activity) => sum + activity.durationSeconds, 0);
  const runWord = runs.length === 1 ? "run" : "runs";
  return `${runs.length} ${runWord} · ${formatDistance(distance)} · ${formatDuration(time)}`;
}

function dayBars(start: string, activities: Activity[]): DayBar[] {
  const totals = new Map<string, number>();
  for (const activity of activities) {
    if (!activity.run) continue;
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

function unavailableSnapshot(start: string, end: string, note: string): TrainingSnapshot {
  return {
    source: "unavailable",
    note,
    rangeLabel: formatRange(start, end),
    latestRun: null,
    totalsLabel: "0 runs · 0.00 km · 0:00",
    metrics: [],
    days: dayBars(start, []),
    activities: [],
  };
}

function sampleSnapshot(start: string, end: string): TrainingSnapshot {
  const dates = [0, 2, 5, 6, 9, 12].map((offset) => addDays(end, -offset));
  const samples: Activity[] = [
    sampleActivity("sample-1", "Easy", dates[0], 8420, 2472, 148),
    sampleActivity("sample-2", "Intervals", dates[1], 6100, 1680, 162),
    sampleActivity("sample-3", "Long run", dates[2], 16200, 5220, 151),
    sampleActivity("sample-4", "Recovery", dates[3], 5040, 1740, 136),
    sampleActivity("sample-5", "Steady", dates[4], 10050, 3060, 154),
    sampleActivity("sample-6", "Hills", dates[5], 7300, 2340, 158),
  ];
  const latest = samples[0];

  return {
    source: "sample",
    note: "Sample numbers, shown until Garmin is connected.",
    rangeLabel: formatRange(start, end),
    latestRun: toRunCard(latest, sampleLoop()),
    totalsLabel: totalsLabel(samples),
    metrics: [
      { label: "Training status", value: "Productive" },
      { label: "Training load", value: "412", detail: "Chronic 380 · Ratio 1.08" },
      { label: "Training balance", value: "Balanced", detail: "Low 140 · High 90 · Anaerobic 36" },
      { label: "VO2 max", value: "52" },
      { label: "Resting HR", value: "48 bpm", detail: "30-day avg 49 bpm" },
      { label: "HRV", value: "68 ms", detail: "7-day 64 ms" },
      { label: "Readiness", value: "74" },
      { label: "Sleep", value: "81" },
    ],
    days: dayBars(start, samples),
    activities: samples.map(toRow),
  };
}

function sampleActivity(
  id: string,
  name: string,
  date: string,
  distanceMeters: number,
  durationSeconds: number,
  averageHr: number,
): Activity {
  return {
    id,
    name,
    typeKey: "running",
    date,
    distanceMeters,
    durationSeconds,
    averageHr,
    averageSpeed: null,
    movingSeconds: null,
    run: true,
  };
}

function sampleLoop(): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= 64; i += 1) {
    const t = (i / 64) * Math.PI * 2;
    points.push({
      lat: 0.012 * Math.sin(t) + 0.003 * Math.sin(2 * t + 0.4),
      lon: 0.018 * Math.cos(t) + 0.002 * Math.cos(3 * t),
    });
  }
  return points;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function positive(value: number | null): number | null {
  if (value === null || value <= 0) return null;
  return value;
}
