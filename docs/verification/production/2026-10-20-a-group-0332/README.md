# A1–A7 implementation evidence

Product base: `3bedeb8`. This implementation changes four renderer files and adds no dependency. Version freeze, final build, packaging, installation, signing status, tag and merge belong to the release owner. The application was still 0.3.31 while these implementation checks ran.

- A1/A2: `null` is all configured/historical channels including later additions; arrays are explicit selections including zero. One top Semi multi-select filters both views. Calendar always projects non-cancelled entries; daily query/status only filter the selected day. Options remain independent of filtered results, with disabled and missing channel IDs identifiable. Published rows retain snapshot names. Daily total/matching counts and clear/reset actions are explicit; summary clicks clear daily query/status/page while keeping channel selection.
- A3: day/today/month/week changes use one guarded selection path that clears old focus/details only when no managed draft exists. Channel filtering retains mounted editors. External focus resolves from unfiltered entries, adds a hidden target's channel, includes cancelled targets in the daily view, and consumes rejected requests so later refreshes cannot replay stale focus. Existing deep pagination focus protection stays in place. `autoSwitchDate={false}` and `markWeekend={false}` remain unchanged.
- A4: ContentList uses projected schedule facts, also projecting workspace-summary fallback schedules; date-only/local-minute facts retain their original date and instant facts use the display timezone.
- A5: confirmed content save remains successful after a list refresh failure and explains how to refresh. The saved receipt/base is retained; both refresh work and the final `nativeAction` reconciliation must finish before the latest draft is checked for leave/close. The native mutate/query/reread protocol is unchanged.
- A6: conflict preservation prepares an independent new content draft; the button explicitly says saving is still required. A subsequent explicit save creates a new document without overwriting the external version.
- A7: template notes use the existing managed-draft guard. Switching templates is blocked until submission/discard; collapse remains mounted; refresh/failure preserve notes; successful submission establishes the submitted baseline and preserves edits made during submission.

## Checks and reproducibility

Run from the repository root after both lockfile installs:

```sh
npm ci
npm ci --prefix workbench
npm run typecheck --prefix workbench
node --test workbench/test/content-save-outcome.test.mjs workbench/test/background-refresh.test.mjs workbench/test/managed-refresh.test.mjs workbench/test/daily-publication-wiring.test.mjs workbench/test/publication-model.test.mjs workbench/test/schedule-view.test.mjs
NOVA_PROBE_EVIDENCE_DIR="$PWD/docs/verification/production/2026-10-20-a-group-0332/ui" node docs/verification/production/2026-10-20-a-group-0332/probe-source/a-group-ui-probe.mjs
NOVA_PROBE_EVIDENCE_DIR="$PWD/docs/verification/production/2026-10-20-a-group-0332/ui" node docs/verification/production/2026-10-20-a-group-0332/probe-source/app-draft-ui-probe.mjs
NOVA_PROBE_EVIDENCE_DIR="$PWD/docs/verification/production/2026-10-20-a-group-0332/ui" node docs/verification/production/2026-10-20-a-group-0332/probe-source/calendar-pagination-ui-probe.mjs
```

All commands above exited 0. Final targeted checks: 40/40. Baseline relevant checks: 33/33. One existing full desktop suite pass: 314/314; that run began during the first implementation pass, before the new save regression file existed. Final full release verification is separate and belongs to the release owner. Logs and exact scope are in `logs/` and `verification-result.json`.

The three probes resolve this checkout relative to their own source location. They build the actual renderer components/App with Vite and run real React/Semi in native Electron. Synthetic bridge storage, Electron userData and browser files are isolated under a newly created temporary directory; they do not read or modify the user's content library or launch assistants. This verifies real renderer behavior and the App event listeners, not production native IPC or final installed application behavior.

- `ui/result.json`: A1–A4/A7 component behavior, new-channel inclusion in all mode, zero channels, cancelled/hidden external focus, rejected-focus consumption, viewport preservation, dirty publication draft preservation, template submission fault injection, all three schedule precisions with and without library projection. `top-channels-{1440,760,560}.png` show the new top selector. Actual Semi accessibility checks require `aria-labelledby` because Select overwrites `aria-label` internally.
- `ui/app-draft/result.json`: imports the unchanged production `app.tsx`. Actual App navigation, registered `beforeunload` and `nova-save-close` handlers reject collapsed dirty notes; explicit discard releases navigation. A native-close event after confirmed create and injected list failure succeeds; retry refresh does not recreate. Input during final workspace read prevents native close and preserves new text. Actual conflict UI saves a separate content object and leaves the external body/token intact. Screenshots are in that directory.
- `ui/calendar-pagination/result.json`: 121 plans at sizes 20/50/100, 101st plan, 107-plan and 107-history pagination, search/channel/status across the full dataset, zero/single page, busy controls, deep focus consumed once, content/collection identity and 1440/1100/760/560 layouts. This is the previous pagination probe adapted to the top multi-select and made checkout-relative.

No real user-library acceptance, final frozen package acceptance, Intel Mac/Windows hardware acceptance or real assistant/provider launch is claimed here.
