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

function durationLabel(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function displayNameFrom(profile: unknown): string | null {
  const name = findText(profile, "displayName") ?? findText(profile, "userName");
  return name;
}

export function latestRestingHr(payload: unknown): { latest: number; average: number | null } | null {
  const series = findByKey(payload, "WELLNESS_RESTING_HEART_RATE");
  if (!Array.isArray(series)) return null;
  const values = series
    .map((row) => asNumber(asRecord(row)?.value))
    .filter((value): value is number => value !== null && value > 0);
  if (values.length === 0) return null;
  const latest = values[values.length - 1];
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { latest, average };
}

export function latestHrv(payload: unknown): { night: number | null; weekly: number | null } {
  const summaries = findByKey(payload, "hrvSummaries");
  const source = Array.isArray(summaries) ? summaries[summaries.length - 1] : payload;
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
      findNumber(payload, "acuteTrainingLoad") ??
      findNumber(payload, "weeklyTrainingLoad"),
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
  const rows = Array.isArray(payload) ? payload : [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const score =
      findNumber(rows[i], "trainingReadinessScore") ?? findNumber(rows[i], "score");
    if (score !== null) return score;
  }
  return findNumber(payload, "trainingReadinessScore") ?? findNumber(payload, "score");
}

export function latestSleepScore(payloads: unknown[]): number | null {
  let latest: number | null = null;
  for (const payload of payloads) {
    const rows = Array.isArray(payload)
      ? payload
      : (asRecord(payload)?.individualStats as unknown[] | undefined);
    const list = Array.isArray(rows) ? rows : [payload];
    for (const row of list) {
      const score =
        findNumber(row, "sleepScore") ??
        findNumber(row, "overallScore") ??
        findNumber(row, "value");
      if (score !== null && score > 0 && score <= 100) latest = score;
    }
  }
  return latest;
}

export function racePredictions(payload: unknown): {
  fiveK: number | null;
  tenK: number | null;
  half: number | null;
  marathon: number | null;
} {
  return {
    fiveK: findNumber(payload, "time5K") ?? findNumber(payload, "fiveK"),
    tenK: findNumber(payload, "time10K") ?? findNumber(payload, "tenK"),
    half:
      findNumber(payload, "timeHalfMarathon") ?? findNumber(payload, "halfMarathon"),
    marathon: findNumber(payload, "timeMarathon") ?? findNumber(payload, "marathon"),
  };
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
  predictions: unknown;
}): Metric[] {
  const statusText = trainingStatus(input.status) ?? trainingStatus(input.dailyStatus);
  const loads = trainingLoads(input.dailyStatus);
  const balance = loadBalance(input.balance);
  const resting = latestRestingHr(input.rhr);
  const hrv = latestHrv(input.hrv);
  const vo2 = vo2Max(input.vo2);
  const readiness = latestReadiness(input.readiness);
  const sleep = latestSleepScore(input.sleep);
  const races = racePredictions(input.predictions);

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
    {
      label: "Race predictions",
      value: races.fiveK !== null ? `5K ${durationLabel(races.fiveK)}` : "—",
      detail: [
        races.tenK !== null ? `10K ${durationLabel(races.tenK)}` : null,
        races.half !== null ? `Half ${durationLabel(races.half)}` : null,
        races.marathon !== null ? `Marathon ${durationLabel(races.marathon)}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
    },
  ];

  return metrics;
}

function titlePhrase(value: string): string {
  const clean = value.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  if (/[a-z]/.test(clean) && clean.includes(" ")) return clean;
  return clean.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}
