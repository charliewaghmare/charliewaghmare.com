// Loaded only by the production freshness regression test, never by the app.
import { appendFileSync, readFileSync } from "node:fs";

const originalFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.hostname !== "connectapi.garmin.com") return originalFetch(input, init);
  const state = JSON.parse(readFileSync(process.env.GARMIN_TEST_STATE, "utf8"));
  appendFileSync(process.env.GARMIN_TEST_LOG, `${url.pathname}\n`);
  if (state.offline) throw new Error("Simulated Garmin outage");

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver" }).format(new Date());
  const timestamp = Date.parse(`${today}T18:00:00Z`);
  const run = (id, name) => ({
    activityId: id, activityName: name, activityType: { typeKey: "running" },
    startTimeGMT: `${today} 18:00:00`, startTimeLocal: `${today} 10:00:00`,
    distance: 5000, duration: 1500, elapsedDuration: 1500, movingDuration: 1500,
    averageHR: 145, averageSpeed: 3.33,
  });
  let body = {};
  if (url.pathname.includes("/activities/search/activities")) {
    body = [run(910000001 + state.label.charCodeAt(0) - 65, `Fresh Run ${state.label}`), run(910000000, "Previous Run")];
  } else if (url.pathname.endsWith("/details")) {
    body = {
      metricDescriptors: [
        { metricsIndex: 0, key: "directTimestamp" },
        { metricsIndex: 1, key: "sumDistance" },
        { metricsIndex: 2, key: "directHeartRate" },
        { metricsIndex: 3, key: "directSpeed" },
        { metricsIndex: 4, key: "directElevation" },
      ],
      activityDetailMetrics: Array.from({ length: 11 }, (_, i) => ({
        metrics: [timestamp + i * 150_000, i * 500, state.heartRate, 3.33, 10 + i],
      })),
      geoPolylineDTO: { polyline: [{ lat: 49.26, lon: -123.25 }, { lat: 49.27, lon: -123.24 }] },
    };
  } else if (url.pathname.endsWith("/splits")) {
    body = { lapDTOs: [{ lapIndex: 1, distance: 5000, duration: 1500, averageHR: state.heartRate }] };
  } else if (url.pathname.includes("/socialProfile")) {
    body = { displayName: "freshness-test" };
  } else if (url.pathname.includes("/maxmet/latest/")) {
    body = { generic: { vo2MaxPreciseValue: state.vo2 } };
  }
  const response = Response.json(body);
  Object.defineProperty(response, "url", { value: url.href });
  return response;
};
