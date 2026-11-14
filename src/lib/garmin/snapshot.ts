import { deriveKilometerSplits, downsampleSamples, samplesFromDetails, splitsFromPayload, type ActivitySample, type ActivitySplit } from "@/lib/garmin/activity-detail";
import { formatDuration, formatLocalClock } from "@/lib/garmin/format";
import { activityWindow, dayBars, toRow, toRunCard, totalsLabel, type Activity } from "@/lib/garmin/activities";
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
  formatRange,
  vancouverToday,
} from "@/lib/garmin/format";
import { pointsFromPayloads, type Point } from "@/lib/garmin/polyline";
import {
  buildDashboardMetrics,
  hrvSeries,
  readinessSeries,
  restingHrSeries,
  sampleHistory,
  sleepScoreSeries,
  trainingLoadSeries,
  trainingStatusCategories,
  vo2Series,
  type DashboardMetric,
} from "@/lib/garmin/series";

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

export type LatestActivity = ActivityRow & {
  whenLabel: string;
  durationLabel: string;
  durationKind: "Elapsed" | "Duration";
  maxHeartRateLabel: string | null;
  elevationLabel: string | null;
  cadenceLabel: string | null;
  powerLabel: string | null;
  movingLabel: string | null;
  caloriesLabel: string | null;
  samples: ActivitySample[];
  splits: ActivitySplit[];
  points: Point[];
  trace: "heart-rate" | "pace" | null;
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
  latestActivity: LatestActivity | null;
  totalsLabel: string;
  metrics: Metric[];
  dashboardMetrics: DashboardMetric[];
  days: DayBar[];
  activities: ActivityRow[];
};

export async function getTrainingSnapshot(): Promise<TrainingSnapshot> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 60, expire: 300 });
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
    activityWindow(start, (offset) => garminGet("/activitylist-service/activities/search/activities", { start: offset, limit: 100 })),
    optional("/userprofile-service/socialProfile"),
  ]);

  const parsed = activitiesPayload.activities;
  const activities = parsed.filter(
    (activity) => activity.date >= start && activity.date <= end,
  );
  const latest = parsed.find((activity) => activity.run && activity.date <= end) ?? null;
  const trace = latest ? await activityTrace(latest.id, latest.distanceMeters) : emptyTrace();
  const points = trace.points;
  const displayName = displayNameFrom(profile);
  const encodedName = displayName ? encodeURIComponent(displayName) : null;

  const historyStart = addDays(end, -364);
  const sleepStart = addDays(end, -27);
  const sleepHistoryMid = addDays(historyStart, 180);
  const [
    rhr,
    hrv,
    vo2,
    vo2History,
    vo2Daily,
    status,
    dailyStatus,
    statusHistory,
    balance,
    readiness,
    sleepA,
    sleepB,
    sleepHistoryA,
    sleepHistoryB,
  ] = await Promise.all([
    encodedName
      ? optional(`/userstats-service/wellness/daily/${encodedName}`, {
          fromDate: historyStart,
          untilDate: end,
          metricId: 60,
        })
      : Promise.resolve(null),
    optional(`/hrv-service/hrv/daily/${historyStart}/${end}`),
    optional(`/metrics-service/metrics/maxmet/latest/${end}`),
    optional(`/metrics-service/metrics/maxmet/${historyStart}/${end}`),
    optional(`/metrics-service/metrics/maxmet/daily/${historyStart}/${end}`),
    optional(`/metrics-service/metrics/trainingstatus/aggregated/${end}`),
    optional(`/metrics-service/metrics/trainingstatus/daily/${end}`),
    optional(`/metrics-service/metrics/trainingstatus/daily/${historyStart}/${end}`),
    optional(`/metrics-service/metrics/trainingloadbalance/latest/${end}`),
    optional(`/metrics-service/metrics/trainingreadiness/${historyStart}/${end}`),
    optional(`/sleep-service/stats/sleep/daily/${start}/${addDays(start, 27)}`),
    optional(`/sleep-service/stats/sleep/daily/${sleepStart}/${end}`),
    optional(`/sleep-service/stats/sleep/daily/${historyStart}/${sleepHistoryMid}`),
    optional(`/sleep-service/stats/sleep/daily/${addDays(sleepHistoryMid, 1)}/${end}`),
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
    end,
  });

  // Load and status history share Garmin's training-status daily payload when present.
  const loadSeries = trainingLoadSeries(statusHistory ?? dailyStatus);
  const statusSeries = trainingStatusCategories(statusHistory ?? status);

  const dashboardMetrics = buildDashboardMetrics({
    end,
    windowLabel: "90 days",
    metrics,
    series: {
      rhr: restingHrSeries(rhr),
      hrv: hrvSeries(hrv),
      readiness: readinessSeries(readiness),
      sleep: sleepScoreSeries([sleepA, sleepB, sleepHistoryA, sleepHistoryB]),
      load: loadSeries,
      vo2: vo2Series([vo2Daily, vo2History, vo2]),
      status: statusSeries,
    },
  });

  return {
    source: "garmin",
    note: activitiesPayload.limited ? "Activity history reached the retrieval limit; totals may be incomplete." : null,
    rangeLabel: formatRange(start, end),
    latestRun: latest ? toRunCard(latest, points) : null,
    latestActivity: latest ? toLatestActivity(latest, trace) : null,
    totalsLabel: totalsLabel(activities),
    metrics,
    dashboardMetrics,
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

type ActivityTrace = { points: Point[]; samples: ActivitySample[]; splits: ActivitySplit[] };
function emptyTrace(): ActivityTrace { return { points: [], samples: [], splits: [] }; }
async function activityTrace(activityId: string, distanceMeters: number | null): Promise<ActivityTrace> {
  if (!/^\d+$/.test(activityId)) return emptyTrace();
  const id = encodeURIComponent(activityId);
  const [details, splits] = await Promise.all([
    optional(`/activity-service/activity/${id}/details`, { maxChartSize: 2000, maxPolylineSize: 1600 }),
    optional(`/activity-service/activity/${id}/splits`),
  ]);
  let points = pointsFromPayloads([details]);
  if (points.length < 2) points = pointsFromPayloads([await optional(`/activity-service/activity/${id}/mapdetails`, { maxPolylineSize: 1600, maxHeatMapSize: 0 })]);
  if (points.length < 2) points = pointsFromPayloads([await optional(`/activity-service/activity/polyline/${id}`)]);
  const samples = samplesFromDetails(details, distanceMeters ?? 0);
  const recordedSplits = splitsFromPayload(splits);
  return { points, samples: downsampleSamples(samples), splits: recordedSplits.length ? recordedSplits : deriveKilometerSplits(samples) };
}

function toLatestActivity(activity: Activity, trace: ActivityTrace): LatestActivity {
  const row = toRow(activity);
  const heartCount = trace.samples.filter((sample) => sample.heartRate !== null).length;
  const paceCount = trace.samples.filter((sample) => sample.paceSecondsPerKm !== null).length;
  const moving =
    activity.movingSeconds && activity.durationSeconds !== null && Math.abs(activity.movingSeconds - activity.durationSeconds) > 15
      ? activity.movingSeconds
      : null;
  const clock = formatLocalClock(activity.startLocal);
  return {
    ...row,
    whenLabel: clock ? `${row.dateLabel} · ${clock}` : row.dateLabel,
    durationLabel: row.timeLabel,
    durationKind: moving ? "Elapsed" : "Duration",
    maxHeartRateLabel: activity.maxHr ? `${Math.round(activity.maxHr)} bpm` : null,
    elevationLabel: activity.elevationGain ? `${Math.round(activity.elevationGain)} m` : null,
    cadenceLabel: activity.cadence ? `${Math.round(activity.cadence)} spm` : null,
    powerLabel: activity.power ? `${Math.round(activity.power)} W` : null,
    movingLabel: moving ? formatDuration(moving) : null,
    caloriesLabel: activity.calories ? `${Math.round(activity.calories)} kcal` : null,
    samples: trace.samples,
    splits: trace.splits,
    points: trace.points,
    trace: heartCount >= 8 ? "heart-rate" : paceCount >= 8 ? "pace" : null,
  };
}

function unavailableSnapshot(start: string, end: string, note: string): TrainingSnapshot {
  return {
    source: "unavailable",
    note,
    rangeLabel: formatRange(start, end),
    latestRun: null,
    latestActivity: null,
    totalsLabel: "Running totals unavailable",
    metrics: [],
    dashboardMetrics: [],
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

  const metrics = [
    { label: "Training status", value: "Productive" },
    { label: "Training load", value: "412", detail: "Chronic 380 · Ratio 1.08" },
    { label: "Training balance", value: "Balanced", detail: "Low 140 · High 90 · Anaerobic 36" },
    { label: "VO2 max", value: "52" },
    { label: "Resting HR", value: "48 bpm", detail: "30-day avg 49 bpm" },
    { label: "HRV", value: "68 ms", detail: "7-day 64 ms" },
    { label: "Readiness", value: "74" },
    { label: "Sleep", value: "81" },
  ];

  return {
    source: "sample",
    note: "Sample numbers, shown until Garmin is connected.",
    rangeLabel: formatRange(start, end),
    latestRun: toRunCard(latest, sampleLoop()),
    latestActivity: toLatestActivity(latest, emptyTrace()),
    totalsLabel: totalsLabel(samples),
    metrics,
    dashboardMetrics: buildDashboardMetrics({
      end,
      windowLabel: "90 days",
      metrics,
      series: {
        rhr: sampleHistory(end, 120, 3, 49, 2.5),
        hrv: sampleHistory(end, 120, 5, 64, 8),
        readiness: sampleHistory(end, 90, 2, 72, 10),
        sleep: sampleHistory(end, 90, 4, 78, 9),
        load: sampleHistory(end, 90, 7, 400, 40),
        vo2: sampleHistory(end, 24, 1, 51.5, 0.8),
        status: [
          { iso: addDays(end, -20), value: "Productive" },
          { iso: addDays(end, -12), value: "Maintaining" },
          { iso: addDays(end, -5), value: "Productive" },
          { iso: end, value: "Productive" },
        ],
      },
    }),
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
    startedAt: `${date}T12:00:00Z`,
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
