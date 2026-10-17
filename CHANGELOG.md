# Changelog

## 0.6.0 - 2026-10-17

- Show exactly one primary latency line per homepage card, with per-node bindings and ordered task preferences; keep all detail line charts.
- Select deterministically rather than by best latency/health; retain explicit failures, missing samples and full-scope scoring.
- Add offline SAO import preparation for frozen premiums, acquisition metadata, exclusions and original primary task bindings without changing shared node prices.
- Preserve and label SAO acquisition-to-expiry/holding amortization separately from fixed terms; retain acquisition price without double counting.
- Record dated, same-day FX snapshots and preserve imported metadata through native settings editor round trips.

## 0.5.2 - 2026-10-17

- Fix legacy unknown network summaries hiding explicit administrator home/education category tags; mark manual categories distinctly.
- Retain automatic classifications separately in detail evidence, including conflicts and stale summaries.
- Stop treating arbitrary first tags, hypervisors, routes, address families or organization names as network categories.
- Render unconfirmed categories neutrally and explain the legacy hosting/mobile-only classifier without equating hosting=false with residential.

## 0.5.1 - 2026-10-17

- Honor minute-aligned legacy ping history rollups when a task is configured below one minute; keep failed probes and long gaps disconnected.
- Verify real isolated history produces connected line segments rather than only isolated sample dots.

## 0.5.0 - 2026-10-17

- Add sourced CPU specification guidance and qualitative workload ranges, distinguishing architecture-only identification, host specifications and allocated logical CPUs.
- Keep unverified/OEM CPUs unclassified rather than inventing benchmarks, host SKUs or official performance rankings.
- Replace detail latency bars with independent, lazy-loaded multi-series line charts inspired by SAO; retain homepage card bars.
- Add per-series toggles, pointer/keyboard/touch sample inspection, failed-probe markers, gap preservation, statistics and cancellable minute refreshes.
- Preserve protocol/family separation, zero-latency success, reference exclusion, official API compatibility and private-session handling.

## 0.4.0 - 2026-10-17

- Add per-node CNY premiums/discounts, explicit acquisition dates and fixed amortization periods.
- Separate recurring monthly cost, one-time premium and active premium amortization; opt in to an effective monthly estimate.
- Add managed cost settings, excluded-node selectors and an authenticated visual cost editor using the standard theme settings API.
- Normalize currency aliases and annual/multi-year billing; retain explicit unknown and missing-rate warnings.
- Preserve fresh unrelated settings and selector serialization; reject concurrent cost edits and expired sessions.

## 0.3.0 - 2026-10-17

- Support the installed Passkey plugin login mount points and Mint button styling.
- Label AI partial evidence as page reachability, never working conversations.
- Explain daily route observations and independent evidence freshness.
- Retain official Komari compatibility and safe legacy-agent fallbacks.

## 0.2.1 - 2026-10-17

- Handle production private-site HTTP 401/403 envelopes as login-required, not a
  network failure or an empty public dashboard. Preserve the existing JSON-RPC guard.

## 0.2.0 - 2026-10-17

- Add persistent card/list views, default-hidden cost display, colored tags, uptime,
  connections, CPU/speed sorting, and safe public remarks.
- Lazy-load 1/6/24-hour CPU, memory and network history with explicit missing samples.
- Explain absent server extensions, missing agent reports, unconfigured route targets,
  failed requests and expired evidence instead of showing one ambiguous unknown state.
- Keep ChatGPT/Claude region-only evidence neutral; explicitly mark Gemini unsupported.
- Load latency and extension snapshots independently; guard cancelled history requests.
- Preserve Mint's visual design, official Komari compatibility and administration routes.

## 0.1.0 - 2026-10-17

- Initial installable, self-contained Komari/Nekomari theme with real monitoring data,
  optional insights, private-site login, responsive cards and configurable ping targets.
