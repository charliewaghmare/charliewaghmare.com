import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveKilometerSplits,
  downsampleSamples,
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

test("nullable warmup metrics do not discard the first six minutes or shorten the run", () => {
  const samples = samplesFromDetails({
    metricDescriptors: [
      { metricsIndex: 0, key: "directTimestamp" },
      { metricsIndex: 1, key: "sumDistance" },
      { metricsIndex: 2, key: "directHeartRate" },
      { metricsIndex: 3, key: "directSpeed" },
      { metricsIndex: 4, key: "directElevation" },
      { metricsIndex: 5, key: "directPerformanceCondition" },
    ],
    activityDetailMetrics: Array.from({ length: 11 }, (_, index) => ({
      metrics: [1_700_000_000_000 + index * 60_000, index * 200, 130 + index, 3.2, 50 + index, index < 6 ? null : 4],
    })),
  }, 2000);
  assert.equal(samples.length, 11);
  assert.equal(samples[0].heartRate, 130);
  assert.equal(samples[0].elapsedSeconds, 0);
  assert.equal(samples.at(-1)?.elapsedSeconds, 600);
  assert.equal(samples.at(-1)?.distanceMeters, 2000);
  assert.deepEqual(deriveKilometerSplits(samples).map((split) => split.timeLabel), ["5:00", "5:00"]);
});

test("missing sensors leave independent gaps while valid readings keep their timestamps", () => {
  const samples = samplesFromDetails({
    metricDescriptors: [
      { metricsIndex: 0, key: "directTimestamp" },
      { metricsIndex: 1, key: "sumDistance" },
      { metricsIndex: 2, key: "directHeartRate" },
      { metricsIndex: 3, key: "directSpeed" },
      { metricsIndex: 4, key: "directElevation" },
    ],
    activityDetailMetrics: [
      { metrics: [1_700_000_000_000, 0, 140, 3.2, null] },
      { metrics: [1_700_000_010_000, 32, null, 3.2, 50] },
      { metrics: [1_700_000_020_000, 64, 150, null, 51] },
      { metrics: [null, 80, 152, 3.2, 52] },
      { metrics: [1_700_000_030_000] },
      { metrics: [1_700_000_040_000, 128, 155, 3.2, 53, "not recorded"] },
    ],
  }, 128);
  assert.deepEqual(samples.map((sample) => sample.elapsedSeconds), [0, 10, 20, 30, 40]);
  assert.equal(samples[0].elevationMeters, null);
  assert.equal(samples[1].heartRate, null);
  assert.equal(samples[1].paceSecondsPerKm, 312.5);
  assert.equal(samples[1].elevationMeters, 50);
  assert.equal(samples[2].heartRate, 150);
  assert.equal(samples[2].paceSecondsPerKm, null);
  assert.deepEqual(samples[3], {
    elapsedSeconds: 30, distanceMeters: null, heartRate: null, paceSecondsPerKm: null, elevationMeters: null,
  });
  assert.equal(samples[4].heartRate, 155);
});

test("downsampling preserves each sensor's recorded endpoints within the sample budget", () => {
  const samples = Array.from({ length: 501 }, (_, index) => ({
    elapsedSeconds: index,
    distanceMeters: index * 3,
    heartRate: index >= 5 && index <= 497 ? 140 : null,
    paceSecondsPerKm: index <= 495 ? 300 : null,
    elevationMeters: index >= 2 ? 10 : null,
  }));
  const reduced = downsampleSamples(samples, 32);
  assert.ok(reduced.length <= 32);
  assert.equal(reduced[0], samples[0]);
  assert.equal(reduced.at(-1), samples.at(-1));
  for (const index of [5, 497, 495, 2]) assert.ok(reduced.includes(samples[index]), `endpoint ${index}`);
  assert.ok(reduced.every((sample, index) => index === 0 || sample.elapsedSeconds > reduced[index - 1].elapsedSeconds));
  assert.ok(reduced.every((sample) => samples.includes(sample)), "never manufacture sensor readings");
});

test("laps keep Garmin boundaries, lap numbers, and short intervals", () => {
  const splits = splitsFromPayload({
    lapDTOs: [
      { lapIndex: 1, distance: 1002, duration: 300, averageHR: 148, averageSpeed: 3.3 },
      { lapIndex: 2, distance: 640, duration: 210, averageHR: 155 },
      { lapIndex: 3, distance: 20, duration: 10 },
    ],
  });
  assert.equal(splits[0]?.label, "Lap 1");
  assert.equal(splits[0]?.heartRateLabel, "148 bpm");
  assert.equal(splits[1]?.label, "Lap 2");
  assert.match(splits[1]?.distanceLabel ?? "", /0\.64 km/);
  assert.equal(splits[2]?.label, "Lap 3");
  assert.equal(splits[2]?.distanceLabel, "0.02 km");
  assert.equal(splits[2]?.timeLabel, "0:10");
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
