const API_HOST = "connectapi.garmin.com";
const TOKEN_URL = "https://diauth.garmin.com/di-oauth2-service/oauth/token";

const NATIVE_HEADERS = {
  "User-Agent": "GCM-Android-5.23",
  "X-Garmin-User-Agent":
    "com.garmin.android.apps.connectmobile/5.23; ; Google/sdk_gphone64_arm64/google; Android/33; Dalvik/2.1.0",
  "X-Garmin-Paired-App-Version": "10861",
  "X-Garmin-Client-Platform": "Android",
  "X-App-Ver": "10861",
  "X-Lang": "en",
  "X-GCExperience": "GC5",
  "Accept-Language": "en-US,en;q=0.9",
};

export type GarminToken = {
  di_token: string;
  di_refresh_token?: string;
  di_client_id?: string;
};

export class GarminAuthError extends Error {
  constructor() {
    super("Garmin refused the token");
    this.name = "GarminAuthError";
  }
}

export class GarminRequestError extends Error {
  constructor(status: number) {
    super(`Garmin request failed (${status})`);
    this.name = "GarminRequestError";
  }
}

export type TokenRead =
  | { ok: true; token: GarminToken }
  | { ok: false; reason: "missing" | "invalid" };

export function readGarminToken(): TokenRead {
  const raw = process.env.GARMIN_TOKEN?.trim();
  if (!raw) return { ok: false, reason: "missing" };

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, reason: "invalid" };
    }
    const record = parsed as Record<string, unknown>;
    const diToken = stringField(record, "di_token");
    if (!diToken) return { ok: false, reason: "invalid" };
    return {
      ok: true,
      token: {
        di_token: diToken,
        di_refresh_token: stringField(record, "di_refresh_token"),
        di_client_id: stringField(record, "di_client_id") ?? clientIdFromJwt(diToken),
      },
    };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

function stringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function clientIdFromJwt(token: string): string | undefined {
  const payload = jwtPayload(token);
  if (!payload) return undefined;
  for (const key of ["client_id", "cid", "azp"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function jwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = Buffer.from(part, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function expiresSoon(token: string): boolean {
  const payload = jwtPayload(token);
  const exp = payload?.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return false;
  return exp * 1000 < Date.now() + 15 * 60 * 1000;
}

let memory: GarminToken | null = null;
let configuredAccess: string | null = null;
let refreshInFlight: Promise<GarminToken | null> | null = null;

async function refreshToken(token: GarminToken): Promise<GarminToken | null> {
  if (!token.di_refresh_token || !token.di_client_id) return null;
  if (!refreshInFlight) {
    refreshInFlight = postRefresh(token).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function postRefresh(token: GarminToken): Promise<GarminToken | null> {
  const clientId = token.di_client_id;
  const refresh = token.di_refresh_token;
  if (!clientId || !refresh) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: refresh,
  });

  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        ...NATIVE_HEADERS,
        Authorization: `Basic ${Buffer.from(`${clientId}:`).toString("base64")}`,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    return null;
  }

  if (!response.ok || !allowedHost(response.url, "diauth.garmin.com")) return null;

  try {
    const data = (await response.json()) as Record<string, unknown>;
    const access = stringField(data, "access_token");
    if (!access) return null;
    const next: GarminToken = {
      di_token: access,
      di_refresh_token: stringField(data, "refresh_token") ?? refresh,
      di_client_id: clientIdFromJwt(access) ?? clientId,
    };
    memory = next;
    return next;
  } catch {
    return null;
  }
}

function allowedHost(url: string, host: string): boolean {
  try {
    return new URL(url).hostname === host;
  } catch {
    return false;
  }
}

async function currentToken(forceRefresh = false): Promise<GarminToken | null> {
  const configured = readGarminToken();
  if (!configured.ok) return null;
  if (configuredAccess !== configured.token.di_token) {
    memory = null;
    configuredAccess = configured.token.di_token;
  }
  const token = memory ?? configured.token;
  if (forceRefresh || expiresSoon(token.di_token)) {
    const refreshed = await refreshToken(token);
    if (refreshed) return refreshed;
  }
  memory = token;
  return token;
}

export async function garminGet(
  path: string,
  params?: Record<string, string | number>,
): Promise<unknown> {
  const token = await currentToken();
  if (!token) throw new GarminAuthError();

  const first = await request(path, params, token.di_token);
  if (first.status !== 401) return readBody(first);

  const refreshed = await currentToken(true);
  if (!refreshed) throw new GarminAuthError();
  return readBody(await request(path, params, refreshed.di_token));
}

async function request(
  path: string,
  params: Record<string, string | number> | undefined,
  accessToken: string,
): Promise<Response> {
  const url = new URL(`https://${API_HOST}${path.startsWith("/") ? path : `/${path}`}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        ...NATIVE_HEADERS,
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new GarminRequestError(0);
  }

  if (!allowedHost(response.url, API_HOST)) throw new GarminRequestError(0);
  return response;
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 401) throw new GarminAuthError();
  if (!response.ok) throw new GarminRequestError(response.status);
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch {
    throw new GarminRequestError(response.status);
  }
}
