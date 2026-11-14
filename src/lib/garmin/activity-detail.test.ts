import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveKilometerSplits,
  samplesFromDetails,
  splitsFromPayload,
} from "./activity-detail";

test("activity details keep heart rate, pace, and elevation and drop pauses", () => {
  const samples = samplesFromDetails(
    {
      metricDescriptors: [
        { metricsIndex: 0, key: "directTimestamp" },
        { metricsIndex: 1, key: "sumDistance", unit: { factor: 100, unitKey: "centimeter" } },
        { metricsIndex: 2, key: "directHeartRate" },
        { metricsIndex: 3, key: "directSpeed" },
        { metricsIndex: 4, key: "directElevation" },
      ],
      activityDetailMetrics: [
        { metrics: [1_700_000_000_000, 0, 140, 3.2, 50] },
        { metrics: [1_700_000_010_000, 32000, 150, 3.2, 54] },
        { metrics: [1_700_000_020_000, 64000, 0, 0.1, 55] },
      ],
    },
    640,
  );
  assert.equal(samples.length, 3);
  assert.equal(samples[1]?.elapsedSeconds, 10);
  assert.equal(samples[1]?.distanceMeters, 320);
  assert.equal(samples[1]?.heartRate, 150);
  assert.equal(samples[1]?.paceSecondsPerKm, 312.5);
  assert.equal(samples[1]?.elevationMeters, 54);
  assert.equal(samples[2]?.heartRate, null);
  assert.equal(samples[2]?.paceSecondsPerKm, null);
});

test("laps keep Garmin boundaries and exact kilometers stay labeled", () => {
  const splits = splitsFromPayload({
    lapDTOs: [
      { lapIndex: 1, distance: 1002, duration: 300, averageHR: 148, averageSpeed: 3.3 },
      { lapIndex: 2, distance: 640, duration: 210, averageHR: 155 },
    ],
  });
  assert.equal(splits[0]?.label, "1 km");
  assert.equal(splits[0]?.heartRateLabel, "148 bpm");
  assert.equal(splits[1]?.label, "Lap 2");
  assert.match(splits[1]?.distanceLabel ?? "", /0\.64 km/);
});

test("kilometer splits are derived only from a dense distance trace", () => {
  const dense = Array.from({ length: 21 }, (_, index) => ({
    elapsedSeconds: index * 30,
    distanceMeters: index * 100,
    heartRate: 140,
    paceSecondsPerKm: 300,
    elevationMeters: 10,
  }));
  const splits = deriveKilometerSplits(dense);
  assert.equal(splits.length, 2);
  assert.equal(splits[0]?.label, "1 km");
  assert.equal(splits[0]?.timeLabel, "5:00");
  assert.equal(splits[0]?.heartRateLabel, "140 bpm");

  const sparse = dense.filter((_, index) => index % 10 === 0);
  assert.equal(deriveKilometerSplits(sparse).length, 0);
});
