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
    if (byte < 0 || byte > 63 || shift >= 35) return null;
    index += 1;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20);

  const value = result & 1 ? ~(result >> 1) : result >> 1;
  return { value, index };
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
  return pairToPoint(lat, lon);
}

function decodeDimension(
  encoded: string,
  precision: number,
  dimensions: 2 | 3,
): Point[] {
  const factor = 10 ** precision;
  let index = 0;
  let lat = 0;
  let lon = 0;
  const points: Point[] = [];

  while (index < encoded.length) {
    const deltas: number[] = [];
    for (let dimension = 0; dimension < dimensions; dimension += 1) {
      const chunk = readChunk(encoded, index);
      if (!chunk) return [];
      index = chunk.index;
      deltas.push(chunk.value);
    }
    lat += deltas[0] ?? 0;
    lon += deltas[1] ?? 0;
    points.push({ lat: lat / factor, lon: lon / factor });
  }

  return points;
}

function plausibleTrack(points: Point[]): Point[] | null {
  if (points.length < 2) return null;
  let minLat = 90;
  let maxLat = -90;
  let minLon = 180;
  let maxLon = -180;
  for (const point of points) {
    if (
      point.lat < -90 ||
      point.lat > 90 ||
      point.lon < -180 ||
      point.lon > 180
    ) {
      return null;
    }
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLon = Math.min(minLon, point.lon);
    maxLon = Math.max(maxLon, point.lon);
  }
  if (maxLat - minLat > 3 || maxLon - minLon > 3) return null;
  if (maxLat === minLat && maxLon === minLon) return null;
  return points;
}

function decodeTrack(encoded: string): Point[] | null {
  if (encoded.length < 8 || encoded.length > 500_000) return null;
  const attempts = [
    decodeDimension(encoded, 5, 2),
    decodeDimension(encoded, 6, 2),
    decodeDimension(encoded, 5, 3),
    decodeDimension(encoded, 6, 3),
  ];
  let best: Point[] | null = null;
  for (const attempt of attempts) {
    const track = plausibleTrack(attempt);
    if (track && (!best || track.length > best.length)) best = track;
  }
  return best;
}

function toDegrees(value: number, axis: "lat" | "lon"): number | null {
  const limit = axis === "lat" ? 90 : 180;
  if (Math.abs(value) <= limit) return value;
  const degrees = (value * 180) / 2 ** 31;
  if (Math.abs(degrees) <= limit) return degrees;
  return null;
}

function pairToPoint(first: number, second: number): Point | null {
  const lat = toDegrees(first, "lat");
  const lon = toDegrees(second, "lon");
  if (lat !== null && lon !== null) return { lat, lon };
  const swappedLat = toDegrees(second, "lat");
  const swappedLon = toDegrees(first, "lon");
  if (swappedLat !== null && swappedLon !== null) {
    return { lat: swappedLat, lon: swappedLon };
  }
  return null;
}

function pointsFromArray(value: unknown[]): Point[] | null {
  const objects = value
    .map(pointFrom)
    .filter((point): point is Point => point !== null);
  if (objects.length >= 2 && objects.length >= value.length * 0.8) {
    return plausibleTrack(objects);
  }

  const pairs: Point[] = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length < 2) return null;
    const first = asCoord(item[0]);
    const second = asCoord(item[1]);
    if (first === null || second === null) return null;
    const point = pairToPoint(first, second);
    if (!point) return null;
    pairs.push(point);
  }
  return plausibleTrack(pairs);
}

function keyRank(key: string): number | null {
  const lower = key.toLowerCase();
  if (lower.includes("heat")) return null;
  if (
    lower.includes("polyline") ||
    lower.includes("latlng") ||
    lower.includes("geopoint") ||
    lower === "track"
  ) {
    return 2;
  }
  return 1;
}

function collectTrack(root: unknown): Point[] {
  let best: Point[] = [];
  const high: { value: unknown; depth: number; rank: number }[] = [];
  const low: { value: unknown; depth: number; rank: number }[] = [
    { value: root, depth: 0, rank: 1 },
  ];
  let seen = 0;

  while ((high.length > 0 || low.length > 0) && seen < 6000) {
    const current = high.shift() ?? low.shift();
    if (!current) break;
    seen += 1;
    const { value, depth, rank } = current;
    if (value == null || depth > 10) continue;

    if (typeof value === "string") {
      if (rank >= 2) {
        const decoded = decodeTrack(value);
        if (decoded && decoded.length > best.length) best = decoded;
      }
      continue;
    }

    if (Array.isArray(value)) {
      const track = rank >= 2 ? pointsFromArray(value) : null;
      if (track && track.length > best.length) best = track;
      if (track) continue;
      const next = rank >= 2 ? high : low;
      for (const item of value) next.push({ value: item, depth: depth + 1, rank });
      continue;
    }

    const record = asRecord(value);
    if (!record) continue;
    for (const [key, child] of Object.entries(record)) {
      const nextRank = keyRank(key);
      if (nextRank === null) continue;
      const item = { value: child, depth: depth + 1, rank: Math.max(rank, nextRank) };
      if (item.rank >= 2) high.push(item);
      else low.push(item);
    }
  }

  return best;
}

function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points;
  const midLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const cosLat = Math.cos((midLat * Math.PI) / 180) || 1;
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];

  while (stack.length > 0) {
    const range = stack.pop();
    if (!range) break;
    const [start, end] = range;
    let maxDistance = 0;
    let index = -1;
    for (let i = start + 1; i < end; i += 1) {
      const distance = perpendicularDistance(points[i], points[start], points[end], cosLat);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }
    if (index !== -1 && maxDistance > epsilon) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }

  return points.filter((_, index) => keep[index]);
}

function perpendicularDistance(
  point: Point,
  start: Point,
  end: Point,
  cosLat: number,
): number {
  const x = (point.lon - start.lon) * cosLat;
  const y = point.lat - start.lat;
  const dx = (end.lon - start.lon) * cosLat;
  const dy = end.lat - start.lat;
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(x, y);
  return Math.abs(dy * x - dx * y) / length;
}

function simplifyTrack(points: Point[]): Point[] {
  if (points.length < 3) return points;
  const first = simplify(points, 0.000012);
  if (first.length <= 1600) return first;
  return simplify(points, 0.00004);
}

export function pointsFromPayload(payload: unknown): Point[] {
  return simplifyTrack(collectTrack(payload));
}

export function pointsFromPayloads(payloads: unknown[]): Point[] {
  let best: Point[] = [];
  for (const payload of payloads) {
    const track = collectTrack(payload);
    if (track.length > best.length) best = track;
  }
  return simplifyTrack(best);
}
