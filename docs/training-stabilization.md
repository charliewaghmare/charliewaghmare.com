# Training dashboard stabilization audit — 2026-11-13

## Executive summary

The dashboard is a small Next.js 16.4.4 / React 19.3 application. Charts are local SVG components; there is no chart library, training database, ingestion worker or persisted metric history. Garmin data is fetched server-side by `client.ts`, transformed by `snapshot.ts`, and passed as a serialized public snapshot to the homepage and training page. `MetricExplorer` is the existing shared metric-card/modal controller. Application dependencies were not changed.

The existing staged personal-bests edit was preserved. This pass does not change public/private data policy, add dashboard features, migrate a database, create a commit, push, or deploy.

## Significant fixes and evidence

### High: latest run selection and duplicated activity totals

The homepage previously used the first API activity, including cycling, while training used its first run in a 30-day subset. API order was trusted and IDs were not deduplicated. `activities.ts` now supplies shared sorting, deduplication, running-type selection, Vancouver grouping, aggregation and formatting. Both pages select the same newest qualifying run, including when it falls outside the chart's 30-day window. Bounded pagination extends the old 100-row limit to at most 500 when necessary; a limit warning prevents incomplete totals appearing complete. Unit tests cover order, duplicate IDs, multiple same-day runs, midnight boundaries, pagination and malformed responses.

### High: missing values and inconsistent pace

Missing distance/duration previously became zero. They now stay nullable; summaries show unknown values and incomplete totals are labeled. Missing source data returns “Running totals unavailable” instead of fabricated zero totals. The homepage used Garmin average speed/moving time while the table used recorded duration. Both now use Garmin average speed (metres/second), with moving duration then recorded duration as fallback. Displayed duration remains Garmin's recorded `duration`; this audit does not relabel it elapsed duration or assume it equals `elapsedDuration`. Pace rounding now carries 4:59.9 to 5:00 rather than 4:60. Tests cover missing/non-finite inputs, units and cross-view consistency.

### High: current metric selection and mislabeled resting-HR average

A year of resting-HR observations was averaged under “30-day avg”. The average now uses the inclusive trailing 30 days and ignores missing readings. HRV, readiness and sleep choose the newest dated observations rather than array position. Legitimate zero sleep/readiness scores remain zero; absent values remain unknown. A generic nested `value` is no longer accepted as proof of a sleep score. Weekly load is no longer substituted when acute load is missing: those fields name different metrics. Acute load, chronic load and ratio remain Garmin-provided values; they are not recomputed. Tests cover reverse ordering, missing readings, zero scores and the 30-day calculation.

### Medium: misleading historical geometry

Modal and sparkline x positions were equally spaced by observation index. They are now proportional to observation dates; missing dates are not interpolated and lines break across missing daily observations. Modal selection follows an observation date when changing range rather than a reused array index. Range-coverage labels now reflect the requested span instead of treating any seven days as adequate for every range. Metric cards and modals retain the same shared metric object. History filtering and date-spacing/gap logic are tested.

### Medium: pointer, keyboard and modal accessibility

Distance tooltip text is derived from the selected day instead of duplicated label state. Touch selection and arrow/Home/End/Escape inspection complement hover; zero-run days remain inactive. The guide remains independently centered on the selected bar, above the SVG. Tooltip width remains three slots with a small-screen minimum and edge clamping. Colors use scoped tokens. The modal retains its existing overlay, close button, Escape handling, scroll lock and responsive layout. Focus is contained if it moves outside, restored after unmount, and labeled with the metric name. Range controls use pressed buttons rather than an incomplete ARIA tab implementation. Historical points have keyboard-focus/touch inspection, and reduced-motion mode also disables training skeleton pulses. These interaction changes passed static checks but could not be exercised in a browser in this environment.

### Medium: token and network handling

Garmin credentials stay in the server module and are not part of the snapshot. Redirects are now rejected before bearer/refresh credentials could be forwarded. Replacing the configured access token clears an obsolete in-memory token. Error messages remain generic and contain no tokens. No real credential was printed or copied during this audit. OAuth refresh state is still process-local; durable rotation is a separate operational decision.

### Low: avoidable work and duplication

GPS lookup previously fetched three large route payloads simultaneously on every snapshot refresh. It now tries fallbacks in order and stops after a usable track, requesting 1,600 rather than 8,000 points for endpoints that accept the size parameter. Invalid polyline chunks fail early. Identical unit-rendering helpers are consolidated in `training-units.tsx`. No dependency or broad rendering architecture was introduced.

## Metric provenance and limits

- Acute/chronic load and ratio: training-status daily payload fields; missing values remain unavailable. History comes from dated training-load maps/rows.
- Training status: Garmin feedback phrase; dated status maps supply history. Unknown formats are not fabricated.
- Training balance: Garmin aerobic-low/high and anaerobic load fields. No balance history is currently retrieved; its modal correctly has an empty state.
- VO2 max: Garmin latest max-met values; recorded history comes from the max-met history endpoint. Units/metric values are not redefined.
- HRV: nightly average in milliseconds, with Garmin weekly average in the card detail. No separate HRV baseline is displayed or synthesized.
- Readiness: dated Garmin score observations, constrained to the score domain.
- Resting HR: dated wellness resting-heart-rate observations, bpm, with a genuine trailing-30-day average.
- Sleep: score only. Sleep duration is not implemented. Current short-window requests are retained; optional longer history endpoints may return no data. Overlap is deduplicated by date.
- Distance: metres converted to kilometres once; each activity ID counted once, all qualifying runs on a Vancouver date summed.
- The initial audit predated main commit `1802ed4`, which added a Latest Run detail modal, actual activity samples and split charts. That feature was preserved during integration before pushing: both pages share the latest run and its trace, and the new activity-detail tests are included in validation. Race predictions remain absent. The new feature has not received a complete browser audit.
- Personal bests are manually maintained content, not Garmin metrics; the user's edit was not changed.

## Freshness

Both pages use the same Next `use cache` snapshot. Raw Garmin requests use `no-store` and 12-second timeouts; there is no separate training API route or database synchronization. Server revalidation remains 60 seconds and cached client freshness remains 60 seconds. The previous one-hour maximum cached snapshot lifetime is reduced to five minutes, bounding stale fallback behavior while avoiding per-visitor Garmin polling. A successful Garmin device sync is only visible once Garmin exposes the data and the shared snapshot refreshes. Already-open pages do not automatically poll; a reload/navigation is needed. No promise of immediate push synchronization is made.

## Security, privacy and remaining decisions

The site intentionally publishes training summaries and the latest run's precise GPS route. This policy was preserved. Consider owner-approved route endpoint masking if home/work location exposure is undesirable. GPS decoding still supports heuristic precision/dimension fallbacks; validating those against sanitized real payload fixtures is preferable to silently changing the interpretation. Multiple-device training status/load schema selection also needs real response evidence before further changes.

There is no configured Garmin token in this workspace, so live endpoint compatibility, personal metric values, refresh-token persistence across deployment restarts and comparison against Garmin Connect could not be verified. Optional endpoint failures remain gracefully unavailable; exact endpoint coverage is not asserted. Larger historical sleep windows may be unsupported by Garmin. No values are filled to hide missing observations.

Browser access was unavailable (the computer-use service could not start), so desktop/tablet/mobile screenshots, pointer smoothness, touch behavior, focus restoration and visual contrast require a browser regression check. Existing palette, typography and card/modal layout were preserved in code. This cleanup does not replace the newer activity-detail UI added independently on main.

## Validation

- Ten focused training tests pass (`npm run test:training`).
- All 57 existing jobs tests pass (`npm run test:jobs`).
- TypeScript and ESLint pass; whitespace diff reviewed.
- Normal Turbopack production build was attempted, including outside the sandbox, but its CSS compiler worker socket is blocked by the execution environment.
- The supported webpack production build passes (`npm run build -- --webpack`).
- Built homepage and `/training` HTTP smoke checks pass in explicitly labeled sample mode; closed dialogs are absent from the initial markup. No Garmin credential field names were found in the generated public JS or the smoke-test HTML.
- Live Garmin data and browser interactions remain unverified for the reasons above.

## Recommended next checks

1. Compare sanitized actual Garmin responses with Connect for load/status device selection, sleep endpoint support, dates and units; add fixture tests before changing parsers further.
2. Run desktop/mobile browser regression checks on tooltips, metric ranges, modal focus and reduced motion in an environment with working browser access.
3. Decide whether public GPS endpoint masking and durable token rotation are required.
4. Only after measuring production request volume, consider separating long-lived historical/route caching from the short-lived current snapshot.
