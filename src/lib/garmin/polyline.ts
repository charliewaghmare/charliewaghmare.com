export type Point = { lat: number; lon: number };

export function decodePolyline(encoded: string, precision = 5): Point[] {
  const factor = 10 ** precision;
  let index = 0;
  let lat = 0;
  let lon = 0;
  const points: Point[] = [];

  while (index < encoded.length) {
    const dLat = readChunk(encoded, index);
    if (!dLat) return [];
    index = dLat.index;
    lat += dLat.value;
    const dLon = readChunk(encoded, index);
    if (!dLon) return [];
    index = dLon.index;
    lon += dLon.value;
    points.push({ lat: lat / factor, lon: lon / factor });
  }

  return points;
}

function readChunk(
  encoded: string,
  start: number,
): { value: number; index: number } | null {
  let result = 0;
  let shift = 0;
  let index = start;
  let byte = 0;

  do {
    if (index >= encoded.length) return null;
    byte = encoded.charCodeAt(index) - 63;
    index += 1;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20);

  const value = result & 1 ? ~(result >> 1) : result >> 1;
  return { value, index };
}

function plausible(points: Point[]): boolean {
  return (
    points.length > 1 &&
    points.every(
      (point) =>
        point.lat >= -90 &&
        point.lat <= 90 &&
        point.lon >= -180 &&
        point.lon <= 180,
    )
  );
}

export function decodeFlexible(encoded: string): Point[] {
  const five = decodePolyline(encoded, 5);
  if (plausible(five)) return five;
  const six = decodePolyline(encoded, 6);
  if (plausible(six)) return six;
  return [];
}

export function downsample(points: Point[], max: number): Point[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const sampled: Point[] = [];
  for (let i = 0; i < max; i += 1) {
    sampled.push(points[Math.round(i * step)]);
  }
  return sampled;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asCoord(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function pointFrom(value: unknown): Point | null {
  const record = asRecord(value);
  if (!record) return null;
  const lat = asCoord(record.lat ?? record.latitude);
  const lon = asCoord(record.lon ?? record.lng ?? record.longitude);
  if (lat === null || lon === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function longestPointList(root: unknown): Point[] {
  let best: Point[] = [];
  const queue: { value: unknown; depth: number }[] = [{ value: root, depth: 0 }];
  let seen = 0;

  while (queue.length > 0 && seen < 4000) {
    const current = queue.shift();
    if (!current) break;
    seen += 1;
    const { value, depth } = current;
    if (value == null || depth > 8) continue;

    if (Array.isArray(value)) {
      const points = value
        .map(pointFrom)
        .filter((point): point is Point => point !== null);
      if (points.length > best.length) best = points;
      for (const item of value) queue.push({ value: item, depth: depth + 1 });
      continue;
    }

    const record = asRecord(value);
    if (!record) continue;
    for (const child of Object.values(record)) {
      queue.push({ value: child, depth: depth + 1 });
    }
  }

  return best;
}

function longestEncoded(root: unknown): string | null {
  const keys = new Set([
    "gpolyline",
    "encodedpolyline",
    "encodedsamplepolyline",
    "polyline",
  ]);
  let best: string | null = null;
  const queue: { value: unknown; depth: number }[] = [{ value: root, depth: 0 }];
  let seen = 0;

  while (queue.length > 0 && seen < 4000) {
    const current = queue.shift();
    if (!current) break;
    seen += 1;
    const { value, depth } = current;
    if (value == null || depth > 8) continue;

    if (Array.isArray(value)) {
      for (const item of value) queue.push({ value: item, depth: depth + 1 });
      continue;
    }

    const record = asRecord(value);
    if (!record) continue;
    for (const [key, child] of Object.entries(record)) {
      if (
        keys.has(key.toLowerCase()) &&
        typeof child === "string" &&
        child.length > 8 &&
        (!best || child.length > best.length)
      ) {
        best = child;
      }
      queue.push({ value: child, depth: depth + 1 });
    }
  }

  return best;
}

export function pointsFromPayload(payload: unknown): Point[] {
  const encoded = longestEncoded(payload);
  if (encoded) {
    const decoded = decodeFlexible(encoded);
    if (decoded.length > 1) return downsample(decoded, 400);
  }
  return downsample(longestPointList(payload), 400);
}
