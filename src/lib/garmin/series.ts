export type HistoryPoint = {
  iso: string;
  value: number;
};

export type CategoryPoint = {
  iso: string;
  value: string;
};

export type DashboardMetric = {
  id: string;
  label: string;
  value: string;
  detail?: string;
  unit?: string;
  explanation: string;
  kind: "numeric" | "categorical";
  series: HistoryPoint[];
  categories: CategoryPoint[];
  historyNote: string | null;
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
  while (queue.length > 0 && seen < 5000) {
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

function isoFrom(row: unknown): string | null {
  const record = asRecord(row);
  if (!record) return null;
  for (const key of [
    "calendarDate",
    "date",
    "day",
    "startDate",
    "sleepDate",
    "timestamp",
  ]) {
    const raw = record[key];
    if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
      return raw.slice(0, 10);
    }
    if (typeof raw === "number" && Number.isFinite(raw)) {
      return new Date(raw).toISOString().slice(0, 10);
    }
  }
  return null;
}

function titlePhrase(value: string): string {
  const clean = value.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  if (/[a-z]/.test(clean) && clean.includes(" ")) return clean;
  return clean.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function round(value: number, digits = 0): string {
  if (digits === 0) return String(Math.round(value));
  const fixed = value.toFixed(digits);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

function sortPoints(points: HistoryPoint[]): HistoryPoint[] {
  return [...points].sort((a, b) => a.iso.localeCompare(b.iso));
}

function uniquePoints(points: HistoryPoint[]): HistoryPoint[] {
  const map = new Map<string, number>();
  for (const point of points) map.set(point.iso, point.value);
  return sortPoints(
    [...map.entries()].map(([iso, value]) => ({ iso, value })),
  );
}

export function restingHrSeries(payload: unknown): HistoryPoint[] {
  const series = findByKey(payload, "WELLNESS_RESTING_HEART_RATE");
  if (!Array.isArray(series)) return [];
  const points: HistoryPoint[] = [];
  for (const row of series) {
    const iso = isoFrom(row);
    const value = asNumber(asRecord(row)?.value);
    if (!iso || value === null || value <= 0) continue;
    points.push({ iso, value });
  }
  return uniquePoints(points);
}

export function hrvSeries(payload: unknown): HistoryPoint[] {
  const summaries = findByKey(payload, "hrvSummaries");
  const rows = Array.isArray(summaries)
    ? summaries
    : Array.isArray(payload)
      ? payload
      : [];
  const points: HistoryPoint[] = [];
  for (const row of rows) {
    const iso = isoFrom(row);
    const value =
      findNumber(row, "lastNightAvg") ??
      findNumber(row, "lastNight") ??
      findNumber(row, "hrvValue");
    if (!iso || value === null || value <= 0) continue;
    points.push({ iso, value });
  }
  return uniquePoints(points);
}

export function readinessSeries(payload: unknown): HistoryPoint[] {
  const rows = Array.isArray(payload) ? payload : [];
  const points: HistoryPoint[] = [];
  for (const row of rows) {
    const iso = isoFrom(row);
    const value =
      findNumber(row, "trainingReadinessScore") ?? findNumber(row, "score");
    if (!iso || value === null) continue;
    points.push({ iso, value });
  }
  return uniquePoints(points);
}

export function sleepScoreSeries(payloads: unknown[]): HistoryPoint[] {
  const points: HistoryPoint[] = [];
  for (const payload of payloads) {
    const rows = Array.isArray(payload)
      ? payload
      : (asRecord(payload)?.individualStats as unknown[] | undefined);
    const list = Array.isArray(rows) ? rows : payload ? [payload] : [];
    for (const row of list) {
      const iso = isoFrom(row);
      const value =
        findNumber(row, "sleepScore") ??
        findNumber(row, "overallScore") ??
        findNumber(row, "value");
      if (!iso || value === null || value <= 0 || value > 100) continue;
      points.push({ iso, value });
    }
  }
  return uniquePoints(points);
}

export function trainingLoadSeries(payload: unknown): HistoryPoint[] {
  const map =
    asRecord(findByKey(payload, "dailyTrainingLoadDTOMap")) ??
    asRecord(findByKey(payload, "trainingLoadDTOMap"));
  if (map) {
    const points: HistoryPoint[] = [];
    for (const [key, value] of Object.entries(map)) {
      const iso = /^\d{4}-\d{2}-\d{2}/.test(key) ? key.slice(0, 10) : isoFrom(value);
      const load =
        findNumber(value, "dailyTrainingLoadAcute") ??
        findNumber(value, "acuteTrainingLoad") ??
        asNumber(value);
      if (!iso || load === null) continue;
      points.push({ iso, value: load });
    }
    return uniquePoints(points);
  }

  if (Array.isArray(payload)) {
    const points: HistoryPoint[] = [];
    for (const row of payload) {
      const iso = isoFrom(row);
      const load =
        findNumber(row, "dailyTrainingLoadAcute") ??
        findNumber(row, "acuteTrainingLoad");
      if (!iso || load === null) continue;
      points.push({ iso, value: load });
    }
    return uniquePoints(points);
  }

  return [];
}

export function vo2Series(payload: unknown): HistoryPoint[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(findByKey(payload, "maxMetList"))
      ? (findByKey(payload, "maxMetList") as unknown[])
      : Array.isArray(findByKey(payload, "generic"))
        ? (findByKey(payload, "generic") as unknown[])
        : [];
  const points: HistoryPoint[] = [];
  for (const row of rows) {
    const iso = isoFrom(row);
    const value =
      findNumber(row, "vo2MaxPreciseValue") ??
      findNumber(row, "vo2MaxValue") ??
      findNumber(row, "vo2Max");
    if (!iso || value === null || value <= 0) continue;
    points.push({ iso, value });
  }
  return uniquePoints(points);
}

export function trainingStatusCategories(payload: unknown): CategoryPoint[] {
  const map =
    asRecord(findByKey(payload, "trainingStatusDTOMap")) ??
    asRecord(findByKey(payload, "dailyTrainingStatusDTOMap"));
  if (map) {
    const points: CategoryPoint[] = [];
    for (const [key, value] of Object.entries(map)) {
      const iso = /^\d{4}-\d{2}-\d{2}/.test(key) ? key.slice(0, 10) : isoFrom(value);
      const phrase =
        findText(value, "trainingStatusFeedbackPhrase") ??
        findText(value, "feedbackPhrase") ??
        findText(value, "trainingStatus");
      if (!iso || !phrase) continue;
      points.push({ iso, value: titlePhrase(phrase) });
    }
    return points.sort((a, b) => a.iso.localeCompare(b.iso));
  }
  return [];
}

export function filterSeries(
  points: HistoryPoint[],
  startIso: string,
  endIso: string,
): HistoryPoint[] {
  return points.filter((point) => point.iso >= startIso && point.iso <= endIso);
}

export function filterCategories(
  points: CategoryPoint[],
  startIso: string,
  endIso: string,
): CategoryPoint[] {
  return points.filter((point) => point.iso >= startIso && point.iso <= endIso);
}

export function sparklinePoints(
  points: HistoryPoint[],
  limit = 30,
): HistoryPoint[] {
  if (points.length <= limit) return points;
  return points.slice(points.length - limit);
}

function historyNoteFor(
  label: string,
  count: number,
  windowLabel: string,
): string | null {
  if (count === 0) {
    return `No historical ${label.toLowerCase()} readings are available in the current Garmin window.`;
  }
  if (count < 3) {
    return `Only ${count} reading${count === 1 ? "" : "s"} available in the last ${windowLabel}.`;
  }
  return null;
}

export function buildDashboardMetrics(input: {
  end: string;
  windowLabel: string;
  metrics: {
    label: string;
    value: string;
    detail?: string;
  }[];
  series: {
    rhr: HistoryPoint[];
    hrv: HistoryPoint[];
    readiness: HistoryPoint[];
    sleep: HistoryPoint[];
    load: HistoryPoint[];
    vo2: HistoryPoint[];
    status: CategoryPoint[];
  };
}): DashboardMetric[] {
  const byLabel = new Map(input.metrics.map((metric) => [metric.label, metric]));
  const catalog: {
    id: string;
    label: string;
    unit?: string;
    explanation: string;
    kind: "numeric" | "categorical";
    series: HistoryPoint[];
    categories?: CategoryPoint[];
  }[] = [
    {
      id: "status",
      label: "Training status",
      explanation:
        "Garmin’s summary of how your recent training is landing overall.",
      kind: "categorical",
      series: [],
      categories: input.series.status,
    },
    {
      id: "load",
      label: "Training load",
      explanation: "Acute training load from recent running stress.",
      kind: "numeric",
      series: input.series.load,
    },
    {
      id: "vo2",
      label: "VO2 max",
      explanation: "Estimated maximal oxygen uptake from Garmin.",
      kind: "numeric",
      series: input.series.vo2,
    },
    {
      id: "hrv",
      label: "HRV",
      unit: "ms",
      explanation: "Nightly heart-rate variability average.",
      kind: "numeric",
      series: input.series.hrv,
    },
    {
      id: "readiness",
      label: "Readiness",
      explanation: "Training readiness score for the day.",
      kind: "numeric",
      series: input.series.readiness,
    },
    {
      id: "balance",
      label: "Training balance",
      explanation: "Distribution of aerobic and anaerobic load over recent training.",
      kind: "categorical",
      series: [],
      categories: [],
    },
    {
      id: "rhr",
      label: "Resting HR",
      unit: "bpm",
      explanation: "Resting heart rate from daily wellness readings.",
      kind: "numeric",
      series: input.series.rhr,
    },
    {
      id: "sleep",
      label: "Sleep",
      unit: "score",
      explanation: "Overnight sleep score from Garmin.",
      kind: "numeric",
      series: input.series.sleep,
    },
  ];

  const built: DashboardMetric[] = [];
  for (const entry of catalog) {
    const metric = byLabel.get(entry.label);
    if (!metric) continue;
    const categories = entry.categories ?? [];
    const count =
      entry.kind === "numeric" ? entry.series.length : categories.length;
    built.push({
      id: entry.id,
      label: entry.label,
      value: metric.value,
      detail: metric.detail,
      unit: entry.unit,
      explanation: entry.explanation,
      kind: entry.kind,
      series: entry.series,
      categories,
      historyNote: historyNoteFor(entry.label, count, input.windowLabel),
    });
  }
  return built;
}

export function sampleHistory(
  end: string,
  days: number,
  seed: number,
  base: number,
  amplitude: number,
): HistoryPoint[] {
  const points: HistoryPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const iso = shiftIso(end, -i);
    const wave = Math.sin((i + seed) / 4.2) * amplitude;
    const noise = ((i * seed) % 7) - 3;
    points.push({ iso, value: Math.round((base + wave + noise) * 10) / 10 });
  }
  return points;
}

function shiftIso(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export { round, titlePhrase };
