import assert from "node:assert/strict";
import test from "node:test";
import { parseActivities, dayBars, paceLabelFor, toRow, toRunCard, activityWindow } from "./activities";
import { formatPace, vancouverToday } from "./format";
import { latestRestingHr, latestHrv, latestReadiness, latestSleepScore, latestLactateThreshold, trainingLoads, loadBalance, buildMetrics } from "./extract";
import { buildDashboardMetrics, filterSeries, readinessSeries, sleepScoreSeries, historyPosition, historyGap, isoFrom, vo2Series } from "./series";
import { decodePolyline } from "./polyline";

const run = (id: number, startTimeGMT: string, extra = {}) => ({ activityId: id, startTimeGMT,
  activityType: { typeKey: "running" }, distance: 5000, duration: 1800, movingDuration: 1500, averageHR: 145, ...extra });

test("activities sort by timestamp, deduplicate IDs and identify actual running types", () => {
  const activities = parseActivities([run(1, "2026-11-12 20:00:00"), run(2, "2026-11-13 01:00:00"),
    run(2, "2026-11-13 01:00:00"), run(3, "2026-11-13 02:00:00", { activityType: { typeKey: "cycling" } })]);
  assert.equal(activities.length, 3);
  assert.equal(activities.find((activity) => activity.run)?.id, "2");
  assert.equal(activities[0].run, false);
});

test("Vancouver dates and multiple same-day runs sum once in the exact 30-day window", () => {
  const activities = parseActivities([run(1, "2026-11-13 07:30:00", { startTimeLocal: "2026-11-13 10:30:00" }),
    run(2, "2026-11-12 18:00:00"), run(2, "2026-11-12 18:00:00")]);
  const bars = dayBars("2026-10-15", activities);
  assert.equal(bars.length, 30);
  assert.equal(bars.at(-1)?.iso, "2026-11-13");
  assert.equal(bars.find((bar) => bar.iso === "2026-11-12")?.km, 10);
  assert.equal(bars.at(-1)?.km, 0);
  assert.equal(vancouverToday(new Date("2026-11-13T07:30:00Z")), "2026-11-12");
});

test("missing activity fields remain unknown; pace is consistent across both pages", () => {
  const [missing] = parseActivities([{ activityId: 1, startTimeGMT: "2026-11-13 08:00:00", activityType: { typeKey: "running" } }]);
  assert.equal(missing.distanceMeters, null);
  assert.equal(missing.durationSeconds, null);
  assert.equal(toRow(missing).timeLabel, "—");
  assert.equal(toRunCard(missing, []).distanceLabel, "—");
  const [activity] = parseActivities([run(2, "2026-11-13 18:00:00")]);
  assert.equal(paceLabelFor(activity), "5:00 /km");
  assert.equal(toRow(activity).paceLabel, toRunCard(activity, []).paceLabel);
  assert.equal(toRow(activity).timeLabel, "30:00");
});

test("pace rounds across minute boundaries and rejects non-finite inputs", () => {
  assert.equal(formatPace(1000, 299.9), "5:00 /km");
  assert.equal(formatPace(NaN, 300), null);
  assert.equal(formatPace(1000, Infinity), null);
});

test("elapsed duration stays separate from recorded and moving durations for chart ranges", () => {
  const [activity] = parseActivities([run(2, "2026-11-13 18:00:00", { elapsedDuration: 2100 })]);
  assert.equal(activity.elapsedSeconds, 2100);
  assert.equal(activity.durationSeconds, 1800);
  assert.equal(activity.movingSeconds, 1500);
  const [missing] = parseActivities([run(3, "2026-11-13 18:00:00")]);
  assert.equal(missing.elapsedSeconds, null);
});

test("activity pagination requests more only when the window needs it and rejects malformed data", async () => {
  const offsets: number[] = [];
  const result = await activityWindow("2026-10-15", async (offset) => {
    offsets.push(offset);
    return offset === 0 ? Array.from({ length: 100 }, (_, id) => run(id, "2026-11-12 18:00:00")) : [run(101, "2026-10-14 18:00:00")];
  });
  assert.deepEqual(offsets, [0, 100]);
  assert.equal(result.limited, false);
  await assert.rejects(activityWindow("2026-10-15", async () => ({ unexpected: [] })));
});

test("resting HR sorts observations and calculates only a 30-day average", () => {
  const payload = { WELLNESS_RESTING_HEART_RATE: [
    { calendarDate: "2026-11-12", value: 50 }, { calendarDate: "2026-01-01", value: 90 },
    { calendarDate: "2026-11-11", value: 48 }, { calendarDate: "2026-11-10", value: null } ] };
  assert.deepEqual(latestRestingHr(payload, "2026-11-13"), { latest: 50, average: 49 });
});

test("HRV, readiness and sleep use latest dated observations, not array order", () => {
  assert.equal(latestHrv({ hrvSummaries: [{ calendarDate: "2026-11-13", lastNightAvg: 60 }, { calendarDate: "2026-11-12", lastNightAvg: 70 }] }).night, 60);
  const readiness = [{ calendarDate: "2026-11-13", score: 0 }, { calendarDate: "2026-11-12", score: 80 }];
  assert.equal(latestReadiness(readiness), 0);
  assert.equal(readinessSeries(readiness).at(-1)?.value, 0);
  const sleep = [[{ calendarDate: "2026-11-13", sleepScore: 0 }, { calendarDate: "2026-11-12", sleepScore: 80 }]];
  assert.equal(latestSleepScore(sleep), 0);
  assert.equal(sleepScoreSeries(sleep).at(-1)?.value, 0);
  assert.equal(latestSleepScore([[{ calendarDate: "2026-11-13", value: 72 }]]), null);
});

test("missing metrics are not zero and weekly load is not substituted for acute load", () => {
  assert.deepEqual(trainingLoads({ weeklyTrainingLoad: 123 }), { acute: null, chronic: null, ratio: null });
  const metrics = buildMetrics({ rhr: null, hrv: null, vo2: null, status: null, dailyStatus: null, balance: null, readiness: null, sleep: [] });
  assert.ok(metrics.every((metric) => metric.value === "—"));
});

test("lactate threshold uses the latest running readings and converts Garmin speed to pace", () => {
  const payload = [
    { calendarDate: "2026-10-01", sport: "RUNNING", hearRate: 180, speed: 0.35 },
    { calendarDate: "2026-11-21", sport: "RUNNING", hearRate: "176" },
    { calendarDate: "2026-11-22", sport: "RUNNING", speed: "0.4" },
    { calendarDate: "2026-11-23", sport: "CYCLING", hearRate: 190, speed: 0.8 },
  ];
  const threshold = latestLactateThreshold(payload);
  assert.deepEqual(threshold, { heartRate: 176, paceSecondsPerKm: 250 });
  assert.equal(formatPace(1000, threshold.paceSecondsPerKm!), "4:10 /km");
  const metrics = buildMetrics({ rhr: null, hrv: null, vo2: null, status: null, dailyStatus: null, balance: null, readiness: null, sleep: [], lactateThreshold: payload });
  const dashboard = buildDashboardMetrics({ end: "2026-11-23", windowLabel: "30 days", metrics,
    series: { rhr: [], hrv: [], vo2: [], readiness: [], sleep: [], load: [], status: [] } });
  assert.deepEqual(dashboard.find((metric) => metric.id === "status")?.lactateThreshold, threshold);
});

test("latest-threshold raw speed is converted from cm/ms and remains dynamic", () => {
  const payload = [
    { speed: 0.48888752, hearRate: null },
    { speed: null, hearRate: 184 },
  ];
  const threshold = latestLactateThreshold(payload);
  assert.equal(formatPace(1000, threshold.paceSecondsPerKm!), "3:25 /km");
  assert.equal(threshold.heartRate, 184);
  const updated = latestLactateThreshold([{ speed: 0.5, hearRate: 182 }]);
  assert.equal(formatPace(1000, updated.paceSecondsPerKm!), "3:20 /km");
  assert.equal(updated.heartRate, 182);
  const activitySummary = latestLactateThreshold({ lactateThresholdSpeed: 4, lactateThresholdHeartRate: 175 });
  assert.equal(formatPace(1000, activitySummary.paceSecondsPerKm!), "4:10 /km");
});

test("missing or invalid lactate threshold readings remain unavailable", () => {
  assert.deepEqual(latestLactateThreshold(null), { heartRate: null, paceSecondsPerKm: null });
  assert.deepEqual(latestLactateThreshold([{ hearRate: 0, speed: -1 }, { heartRate: "NaN", speed: Infinity }]), { heartRate: null, paceSecondsPerKm: null });
  assert.deepEqual(latestLactateThreshold({ heartRate: 175 }), { heartRate: 175, paceSecondsPerKm: null });
});

test("training balance keeps Garmin target bounds with the primary device's loads through the dashboard", () => {
  const payload = { mostRecentTrainingLoadBalance: { metricsTrainingLoadBalanceDTOMap: {
    secondary: { monthlyLoadAerobicLow: 999, monthlyLoadAerobicLowTargetMin: 800, monthlyLoadAerobicLowTargetMax: 1200 },
    primary: {
      primaryTrainingDevice: true,
      trainingBalanceFeedbackPhrase: "BALANCED",
      monthlyLoadAerobicLow: "140", monthlyLoadAerobicLowTargetMin: 100, monthlyLoadAerobicLowTargetMax: 180,
      monthlyLoadAerobicHigh: 90, monthlyLoadAerobicHighTargetMin: 80, monthlyLoadAerobicHighTargetMax: 140,
      monthlyLoadAnaerobic: 0, monthlyLoadAnaerobicTargetMin: 25, monthlyLoadAnaerobicTargetMax: 55,
    },
  } } };
  const balance = loadBalance(payload);
  assert.equal(balance.low, 140);
  assert.equal(balance.high, 90);
  assert.equal(balance.anaerobic, 0);
  assert.deepEqual(balance.optimal, { low: { min: 100, max: 180 }, high: { min: 80, max: 140 }, anaerobic: { min: 25, max: 55 } });
  // The aggregated status can carry the same block when the separate endpoint is absent.
  const metrics = buildMetrics({ rhr: null, hrv: null, vo2: null, status: payload, dailyStatus: null, balance: null, readiness: null, sleep: [] });
  const dashboard = buildDashboardMetrics({ end: "2026-11-23", windowLabel: "30 days", metrics,
    series: { rhr: [], hrv: [], vo2: [], readiness: [], sleep: [], load: [], status: [] } });
  assert.deepEqual(dashboard.find((metric) => metric.id === "balance")?.balance, balance);
});

test("training balance never invents target bounds for missing or invalid Garmin data", () => {
  const balance = loadBalance({
    monthlyLoadAerobicLow: 0,
    monthlyLoadAerobicLowTargetMin: 100,
    monthlyLoadAerobicHigh: -1,
    monthlyLoadAerobicHighTargetMin: 150, monthlyLoadAerobicHighTargetMax: 100,
    monthlyLoadAnaerobic: 36,
    monthlyLoadAnaerobicTargetMin: -10, monthlyLoadAnaerobicTargetMax: 55,
  });
  assert.equal(balance.low, 0);
  assert.equal(balance.high, null);
  assert.equal(balance.anaerobic, 36);
  assert.deepEqual(balance.optimal, { low: null, high: null, anaerobic: null });
  assert.equal(loadBalance(null).low, null);
});

test("VO2 max history keeps dated readings from the shapes Garmin returns", () => {
  const series = vo2Series([
    { generic: { calendarDate: "2026-10-01", vo2MaxPreciseValue: 51.4 } },
    { userMetrics: [{ calendarDate: "2026-10-08", vo2MaxValue: 51 }] },
    { vo2MaxMap: { "2026-10-15": 52.2, "2026-10-22": { value: 52.8 } } },
    { metricsMap: { VO2_MAX: [{ calendarDate: "2026-11-01", value: 53 }] } },
    { calendarDate: "2026-11-13", restingHeartRate: 48, value: 48 },
  ]);
  assert.deepEqual(series.map((point) => point.iso), [
    "2026-10-01",
    "2026-10-08",
    "2026-10-15",
    "2026-10-22",
    "2026-11-01",
  ]);
  assert.equal(series[0]?.value, 51.4);
  assert.equal(series.at(-1)?.value, 53);
});

test("history ranges are inclusive and irregular observations keep real time spacing and gaps", () => {
  const points = [{ iso: "2026-11-01", value: 1 }, { iso: "2026-11-02", value: 2 }, { iso: "2026-11-11", value: 3 }];
  assert.equal(historyPosition(points, "2026-11-02"), 0.1);
  assert.equal(historyGap(points[1].iso, points[2].iso), true);
  assert.deepEqual(filterSeries(points, "2026-11-02", "2026-11-11"), points.slice(1));
  assert.equal(isoFrom({ timestamp: "2026-11-13T07:00:00Z" }), "2026-11-12");
});

test("malformed GPS polylines fail safely", () => {
  assert.deepEqual(decodePolyline("~~~~~~~~~~~~~~~~~~~~~~"), []);
  assert.deepEqual(decodePolyline("\u0000"), []);
});
