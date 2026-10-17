# Changelog

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
