import { formatDistance, formatDuration, formatPace } from "@/lib/garmin/format";

export type ActivitySample = {
  elapsedSeconds: number;
  distanceMeters: number | null;
  heartRate: number | null;
  paceSecondsPerKm: number | null;
  elevationMeters: number | null;
};

export type ActivitySplit = {
  label: string;
  distanceLabel: string;
  timeLabel: string;
  paceLabel: string | null;
  heartRateLabel: string | null;
};

type Descriptor = { key: string; index: number; scale: number };

export function samplesFromDetails(
  payload: unknown,
  expectedDistanceMeters = 0,
): ActivitySample[] {
  const descriptors = findDescriptors(payload);
  const rows = findMetricRows(payload);
  if (descriptors.length === 0 || rows.length < 2) return [];

  const time = descriptor(descriptors, ["directtimestamp", "sumelapsedduration", "directduration"]);
  const distance = descriptor(descriptors, ["sumdistance", "directdistance"]);
  const heart = descriptor(descriptors, ["directheartrate", "heartrate"]);
  const speed = descriptor(descriptors, ["directspeed"]);
  const elevation = descriptor(descriptors, ["directelevation", "directaltitude", "elevation"]);
  if (!time) return [];

  const raw = rows.flatMap((metrics) => {
    const stamp = scaled(metrics, time);
    if (stamp === null) return [];
    return [
      {
        stamp,
        distance: distance ? scaled(metrics, distance) : null,
        heartRate: heart ? scaled(metrics, heart) : null,
        speed: speed ? scaled(metrics, speed) : null,
        elevation: elevation ? scaled(metrics, elevation) : null,
      },
    ];
  });
  if (raw.length < 2) return [];

  const epoch = raw[0].stamp > 1e11;
  const origin = raw[0].stamp;
  const distanceScale = distanceScaleFor(
    raw.map((row) => row.distance),
    expectedDistanceMeters,
  );

  const samples: ActivitySample[] = [];
  for (const row of raw) {
    const elapsedSeconds = epoch ? (row.stamp - origin) / 1000 : row.stamp - origin;
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds > 60 * 60 * 24) continue;
    const distanceMeters =
      row.distance === null ? null : round(row.distance * distanceScale);
    samples.push({
      elapsedSeconds: round(elapsedSeconds),
      distanceMeters,
      heartRate: plausible(row.heartRate, 35, 230),
      paceSecondsPerKm: paceFromSpeed(row.speed),
      elevationMeters: plausible(row.elevation, -500, 9000),
    });
  }
  return samples.filter((sample, index, all) => index === 0 || sample.elapsedSeconds >= all[index - 1].elapsedSeconds);
}

export function splitsFromPayload(payload: unknown): ActivitySplit[] {
  const laps = findLaps(payload);
  return laps.flatMap((lap, index) => {
    const distance = numberValue(lap.distance);
    const duration =
      numberValue(lap.duration) ??
      numberValue(lap.elapsedDuration) ??
      numberValue(lap.movingDuration);
    if (distance === null || duration === null || distance < 50 || duration <= 0) return [];
    const heart =
      numberValue(lap.averageHR) ??
      numberValue(lap.averageHeartRate) ??
      numberValue(lap.avgHR);
    const lapIndex = numberValue(lap.lapIndex) ?? index + 1;
    return [
      {
        label: Math.abs(distance - 1000) <= 30 ? `${lapIndex} km` : `Lap ${lapIndex}`,
        distanceLabel: formatDistance(distance),
        timeLabel: formatDuration(duration),
        paceLabel: formatPace(distance, duration),
        heartRateLabel: heart && heart > 0 ? `${Math.round(heart)} bpm` : null,
      },
    ];
  });
}

export function deriveKilometerSplits(samples: ActivitySample[]): ActivitySplit[] {
  const points = samples.filter(
    (sample) => sample.distanceMeters !== null && sample.elapsedSeconds >= 0,
  );
  if (points.length < 8) return [];
  const end = points[points.length - 1].distanceMeters ?? 0;
  const kilometers = Math.floor(end / 1000);
  if (kilometers < 1 || kilometers > 80) return [];
  if (end / points.length > 250) return [];

  const splits: ActivitySplit[] = [];
  for (let kilometer = 1; kilometer <= kilometers; kilometer += 1) {
    const mark = kilometer * 1000;
    const crossing = crossingAt(points, mark);
    const previous = kilometer === 1 ? 0 : crossingAt(points, (kilometer - 1) * 1000);
    if (crossing === null || previous === null || crossing <= previous) return [];
    const seconds = crossing - previous;
    splits.push({
      label: `${kilometer} km`,
      distanceLabel: "1.00 km",
      timeLabel: formatDuration(seconds),
      paceLabel: formatPace(1000, seconds),
      heartRateLabel: heartRateBetween(points, (kilometer - 1) * 1000, mark),
    });
  }
  return splits;
}

export function downsampleSamples(samples: ActivitySample[], max = 220): ActivitySample[] {
  if (samples.length <= max) return samples;
  const picked: ActivitySample[] = [];
  const step = (samples.length - 1) / (max - 1);
  for (let index = 0; index < max; index += 1) {
    picked.push(samples[Math.round(index * step)]);
  }
  return picked;
}

function heartRateBetween(
  points: ActivitySample[],
  startMeters: number,
  endMeters: number,
): string | null {
  const rates = points.flatMap((point) => {
    if (point.distanceMeters === null || point.heartRate === null) return [];
    if (point.distanceMeters < startMeters || point.distanceMeters >= endMeters) return [];
    return [point.heartRate];
  });
  if (rates.length < 2) return null;
  const average = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  return `${Math.round(average)} bpm`;
}

function crossingAt(
  points: { elapsedSeconds: number; distanceMeters: number | null }[],
  distance: number,
): number | null {
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const startDistance = start.distanceMeters ?? 0;
    const endDistance = end.distanceMeters ?? 0;
    if (endDistance < distance || startDistance > distance) continue;
    if (endDistance === startDistance) return end.elapsedSeconds;
    if (endDistance - startDistance > 400) return null;
    const ratio = (distance - startDistance) / (endDistance - startDistance);
    return start.elapsedSeconds + (end.elapsedSeconds - start.elapsedSeconds) * ratio;
  }
  return null;
}

function findDescriptors(payload: unknown): Descriptor[] {
  const found: Descriptor[] = [];
  walk(payload, (value) => {
    if (!Array.isArray(value) || value.length < 2) return;
    const descriptors = value.flatMap((item) => {
      const record = asRecord(item);
      const key = typeof record?.key === "string" ? record.key : null;
      const index = numberValue(record?.metricsIndex);
      if (!record || !key || index === null) return [];
      return [{ key: normalize(key), index, scale: scaleFor(record.unit, key) }];
    });
    if (descriptors.length >= 2 && descriptors.length === value.length) found.push(...descriptors);
  });
  return found;
}

function findMetricRows(payload: unknown): number[][] {
  let best: number[][] = [];
  walk(payload, (value) => {
    if (!Array.isArray(value) || value.length < 2) return;
    const rows = value.flatMap((item) => {
      const record = asRecord(item);
      const metrics = record?.metrics ?? item;
      if (!Array.isArray(metrics) || metrics.length < 2) return [];
      const numbers = metrics.map(numberValue);
      if (numbers.some((entry) => entry === null)) return [];
      return [numbers as number[]];
    });
    if (rows.length > best.length) best = rows;
  });
  return best;
}

function findLaps(payload: unknown): Record<string, unknown>[] {
  const record = asRecord(payload);
  const lists = [
    record?.lapDTOs,
    record?.laps,
    record?.splits,
    record?.splitSummaries,
    Array.isArray(payload) ? payload : null,
  ];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    const laps = list.flatMap((item) => {
      const lap = asRecord(item);
      return lap && (lap.distance != null || lap.duration != null) ? [lap] : [];
    });
    if (laps.length > 0) return laps;
  }
  return [];
}

function descriptor(descriptors: Descriptor[], keys: string[]): Descriptor | null {
  return descriptors.find((item) => keys.includes(item.key)) ?? null;
}

function scaled(metrics: number[], column: Descriptor): number | null {
  const value = metrics[column.index];
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value * column.scale;
}

function scaleFor(unit: unknown, key: string): number {
  const record = asRecord(unit);
  const name = normalize(String(record?.unitKey ?? record?.key ?? key));
  const factor = numberValue(record?.factor);
  if (name.includes("centi") && factor && factor >= 10) return 1 / factor;
  if (name.includes("milli") && factor && factor >= 100) return 1 / factor;
  return 1;
}

function distanceScaleFor(values: Array<number | null>, expectedMeters: number): number {
  const last = [...values].reverse().find((value) => value !== null && value > 0) ?? 0;
  if (expectedMeters < 100 || last <= 0) return 1;
  const ratio = last / expectedMeters;
  if (ratio > 50 && ratio < 200) return 0.01;
  if (ratio > 500 && ratio < 2000) return 0.001;
  return 1;
}

function paceFromSpeed(speed: number | null): number | null {
  if (speed === null || speed < 0.6 || speed > 7.5) return null;
  return round(1000 / speed);
}

function plausible(value: number | null, min: number, max: number): number | null {
  if (value === null || value < min || value > max) return null;
  return round(value);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function walk(value: unknown, visit: (value: unknown) => void, depth = 0): void {
  if (value == null || depth > 6) return;
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit, depth + 1);
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  for (const child of Object.values(record)) walk(child, visit, depth + 1);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}
