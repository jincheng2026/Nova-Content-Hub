# Action completion regression evidence

Date: 2026-10-20. Source worktree: `codex/ui-interaction-0333`.

The original hook reproduction failed after one successful mutation with `acting === true` while `readWorkspace` was paused. The fixed hook returns the confirmed result and releases foreground busy before the deferred full-library scan completes.

## Recorded checks

- `tests.log`: 45 tests passed across managed refresh, background refresh, content save outcomes, worker read timeouts, worker BUSY retry, and the operation queue.
- `typecheck.log`: native and renderer type checks passed.
- `electron-probe.log`: `node workbench/scripts/action-completion-ui-probe.mjs` passed using the actual App, React, Semi and Electron with an isolated synthetic IPC bridge.
- `channel-committed-refresh-paused.png`: channel save acknowledged, restore and close controls enabled while the full workspace read is deliberately paused.
- `assistant-popup-refresh-paused.png`: the same paused read remains outstanding while navigation, settings and the assistant selector operate.

The UI probe checks one channel mutation, a visible read error, and a subsequent restore using the new settings CAS token, with no duplicate mutation. Screenshots were captured after a visible compositor frame and inspected.

## Shared caller coverage

The audited foreground entry is `App.nativeAction`; overview/content open and save, template and cover actions, calendar/publication operations, prompts, settings, library management, import/recovery and maintenance panels pass through it directly or through `run`. Their explicit full-library refresh callbacks now defer through the existing background chain. Workspace management mutations and explicit reloads reuse their freshly verified library snapshot. Existing draft, pending-intent and serialization protections remain in place; foreground writes still prevent navigation until their result is known.

The worker deadline covers only existing interactive read operations (`workspace`, `list`, `readContent`, `workspaceLibrary`, `coverAssets`, `readCover`, `raster`, `rasterBatch`) plus import-status `query`. A hung read is rejected only after its worker exits, so the next queued operation cannot overlap its library lock. Writes are neither timed out nor automatically replayed. Heavy backup `inspect` is excluded.

## Limits

This is shared-path regression coverage, not a click-by-click acceptance of every button. The actual Electron test uses a synthetic bridge; native worker timeout/queue behavior is covered separately with deterministic fake workers. No user content library or installed application was mutated. Installer behavior, Windows/Intel Mac, real assistant launch, OS dialogs and permanently hung write operations were not exercised here.
