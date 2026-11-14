import { restingHrSeries, readinessSeries, sleepScoreSeries, isoFrom, filterSeries } from "./series";
import { addDays, vancouverToday } from "./format";
export type Metric = {
  label: string;
  value: string;
  detail?: string;
};

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as RecordValue;
}

function asNumber(value: unknown, depth = 0): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  if (depth > 1) return null;
  const record = asRecord(value);
  if (!record) return null;
  for (const key of ["value", "amount", "score", "preciseValue"]) {
    const nested = asNumber(record[key], depth + 1);
    if (nested !== null) return nested;
  }
  return null;
}

function findByKey(root: unknown, key: string): unknown {
  const target = key.toLowerCase();
  const queue: { value: unknown; depth: number }[] = [{ value: root, depth: 0 }];
  let seen = 0;

  while (queue.length > 0 && seen < 4000) {
    const current = queue.shift();
    if (!current) break;
    seen += 1;
    const { value, depth } = current;
    if (!value || typeof value !== "object" || depth > 8) continue;

    if (Array.isArray(value)) {
      for (const item of value) queue.push({ value: item, depth: depth + 1 });
      continue;
    }

    for (const [childKey, child] of Object.entries(value as RecordValue)) {
      if (childKey.toLowerCase() === target) return child;
      queue.push({ value: child, depth: depth + 1 });
    }
  }

  return undefined;
}

function findNumber(root: unknown, key: string): number | null {
  return asNumber(findByKey(root, key));
}

function findText(root: unknown, key: string): string | null {
  const value = findByKey(root, key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function round(value: number, digits = 0): string {
  if (digits === 0) return String(Math.round(value));
  const fixed = value.toFixed(digits);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

export function displayNameFrom(profile: unknown): string | null {
  const name = findText(profile, "displayName") ?? findText(profile, "userName");
  return name;
}

export function latestRestingHr(payload: unknown, end = vancouverToday()): { latest: number; average: number | null } | null {
  const points = restingHrSeries(payload).filter((point) => point.iso <= end);
  if (points.length === 0) return null;
  const recent = filterSeries(points, addDays(end, -29), end);
  return { latest: points[points.length - 1].value,
    average: recent.length ? recent.reduce((sum, point) => sum + point.value, 0) / recent.length : null };
}

export function latestHrv(payload: unknown): { night: number | null; weekly: number | null } {
  const summaries = findByKey(payload, "hrvSummaries");
  const source = Array.isArray(summaries)
    ? [...summaries].filter((row) => isoFrom(row)).sort((a, b) => isoFrom(a)!.localeCompare(isoFrom(b)!)).at(-1)
    : payload;
  return {
    night: findNumber(source, "lastNightAvg") ?? findNumber(source, "lastNight"),
    weekly: findNumber(source, "weeklyAvg"),
  };
}

export function vo2Max(payload: unknown): number | null {
  const generic = findByKey(payload, "generic") ?? payload;
  return (
    findNumber(generic, "vo2MaxPreciseValue") ??
    findNumber(generic, "vo2MaxValue") ??
    findNumber(payload, "vo2MaxPreciseValue") ??
    findNumber(payload, "vo2MaxValue")
  );
}

export function trainingStatus(payload: unknown): string | null {
  return (
    findText(payload, "trainingStatusFeedbackPhrase") ??
    findText(payload, "feedbackPhrase") ??
    findText(payload, "trainingStatus")
  );
}

export function trainingLoads(payload: unknown): {
  acute: number | null;
  chronic: number | null;
  ratio: number | null;
} {
  return {
    acute:
      findNumber(payload, "dailyTrainingLoadAcute") ??
      findNumber(payload, "acuteTrainingLoad"),
    chronic:
      findNumber(payload, "dailyTrainingLoadChronic") ??
      findNumber(payload, "chronicTrainingLoad"),
    ratio: findNumber(payload, "dailyAcuteChronicWorkloadRatio"),
  };
}

export function loadBalance(payload: unknown): {
  phrase: string | null;
  low: number | null;
  high: number | null;
  anaerobic: number | null;
} {
  const map = asRecord(findByKey(payload, "metricsTrainingLoadBalanceDTOMap"));
  const sport = map?.RUNNING ?? (map ? Object.values(map)[0] : payload);
  return {
    phrase:
      findText(sport, "trainingBalanceFeedbackPhrase") ??
      findText(payload, "trainingBalanceFeedbackPhrase"),
    low: findNumber(sport, "monthlyLoadAerobicLow"),
    high: findNumber(sport, "monthlyLoadAerobicHigh"),
    anaerobic: findNumber(sport, "monthlyLoadAnaerobic"),
  };
}

export function latestReadiness(payload: unknown): number | null {
  if (Array.isArray(payload)) return readinessSeries(payload).at(-1)?.value ?? null;
  const value = findNumber(payload, "trainingReadinessScore") ?? findNumber(payload, "score");
  return value !== null && value >= 0 && value <= 100 ? value : null;
}

export function latestSleepScore(payloads: unknown[]): number | null {
  return sleepScoreSeries(payloads).at(-1)?.value ?? null;
}

function balanceDetail(low: number | null, high: number | null, anaerobic: number | null): string | undefined {
  const parts = [
    low !== null ? `Low ${round(low)}` : null,
    high !== null ? `High ${round(high)}` : null,
    anaerobic !== null ? `Anaerobic ${round(anaerobic)}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export function buildMetrics(input: {
  rhr: unknown;
  hrv: unknown;
  vo2: unknown;
  status: unknown;
  dailyStatus: unknown;
  balance: unknown;
  readiness: unknown;
  sleep: unknown[];
  end?: string;
}): Metric[] {
  const statusText = trainingStatus(input.status) ?? trainingStatus(input.dailyStatus);
  const loads = trainingLoads(input.dailyStatus);
  const balance = loadBalance(input.balance);
  const resting = latestRestingHr(input.rhr, input.end);
  const hrv = latestHrv(input.hrv);
  const vo2 = vo2Max(input.vo2);
  const readiness = latestReadiness(input.readiness);
  const sleep = latestSleepScore(input.sleep);

  const metrics: Metric[] = [
    {
      label: "Training status",
      value: statusText ? titlePhrase(statusText) : "—",
    },
    {
      label: "Training load",
      value: loads.acute !== null ? round(loads.acute) : "—",
      detail: [
        loads.chronic !== null ? `Chronic ${round(loads.chronic)}` : null,
        loads.ratio !== null ? `Ratio ${round(loads.ratio, 2)}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
    },
    {
      label: "Training balance",
      value: balance.phrase ? titlePhrase(balance.phrase) : balanceDetail(balance.low, balance.high, balance.anaerobic) ?? "—",
      detail: balance.phrase
        ? balanceDetail(balance.low, balance.high, balance.anaerobic)
        : undefined,
    },
    {
      label: "VO2 max",
      value: vo2 !== null ? round(vo2, 1) : "—",
    },
    {
      label: "Resting HR",
      value: resting ? `${round(resting.latest)} bpm` : "—",
      detail:
        resting?.average !== null && resting?.average !== undefined
          ? `30-day avg ${round(resting.average)} bpm`
          : undefined,
    },
    {
      label: "HRV",
      value: hrv.night !== null ? `${round(hrv.night)} ms` : "—",
      detail: hrv.weekly !== null ? `7-day ${round(hrv.weekly)} ms` : undefined,
    },
    {
      label: "Readiness",
      value: readiness !== null ? round(readiness) : "—",
    },
    {
      label: "Sleep",
      value: sleep !== null ? round(sleep) : "—",
    },
  ];

  return metrics;
}

function titlePhrase(value: string): string {
  const clean = value.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  if (/[a-z]/.test(clean) && clean.includes(" ")) return clean;
  return clean.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}
