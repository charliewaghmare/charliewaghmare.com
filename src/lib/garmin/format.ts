const ZONE = "America/Vancouver";

export function vancouverToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatDay(iso: string, withYear = true): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    month: "short",
    day: "numeric",
    year: withYear ? "numeric" : undefined,
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function formatRange(start: string, end: string): string {
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${formatDay(start, !sameYear)} – ${formatDay(end)}`;
}

export function formatLocalClock(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/(?:T|\s)(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  if (hour > 23) return null;
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${match[2]} ${suffix}`;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function formatDistance(meters: number): string {
  const km = meters / 1000;
  const digits = km >= 10 ? 1 : 2;
  return `${km.toFixed(digits)} km`;
}

export function formatPace(meters: number, seconds: number): string | null {
  if (!Number.isFinite(meters) || !Number.isFinite(seconds) || meters < 50 || seconds <= 0) return null;
  const pace = seconds / (meters / 1000);
  const rounded = Math.round(pace);
  const minutes = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${minutes}:${String(secs).padStart(2, "0")} /km`;
}

export function phrase(value: string): string {
  const clean = value.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return clean;
  if (/[a-z]/.test(clean) && clean.includes(" ")) return clean;
  return clean.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}
