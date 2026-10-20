# Native import probe race diagnosis

The original 0.3.32 `npm run probe:desktop` run passed required/import and failed required/reopen at the strict invalid-binding assertion: expected `INVALID_INPUT`, received `BUSY`. The original log and bounded JSON/PNG are archived here unchanged; `original-sha256.txt` records their hashes. These are synthetic test libraries, not the user's library.

The existing worker busy-contract suite (`node --test workbench/test/worker-client-busy.test.mjs`) passed 5/5 before changing anything. A minimized reproduction preserves a pending `readCover` on the actual `WorkerClient` and invokes the same invalid `list` call. `node docs/verification/production/2026-10-20-a-group-0332/native-probe-fix/minimal-shared-worker-repro.mjs` intentionally exits 1 with the identical strict assertion mismatch. Its fake child never replies, making the pending-slot collision deterministic; the error is raised in `WorkerClient.call` before any filesystem access.

Ranked falsifiable hypotheses:

1. The probe calls the application's shared client while an automatic cover read occupies its single pending slot. Prediction: an independent worker with the correct release pair accepts the boundary call and returns exactly `INVALID_INPUT`.
2. The imported library has a residual lock. Prediction: an independent correctly paired worker still returns `BUSY`.
3. Binding validation regressed. Prediction: an independent worker returns a result/error other than `INVALID_INPUT` after reaching validation.

The binding-isolation fix changes only `workbench/src/main/probe.mts`: the invalid-binding assertion uses its own `WorkerClient`, passes `release.pairId`, and always stops it in `finally`. It keeps the strict `INVALID_INPUT` expectation. The existing wrong-pair assertion still uses a separate worker and expects `RELEASE_MISMATCH`. Product `WorkerClient`, renderer queues and retry behavior are unchanged.

Recheck commands:

```sh
npm run typecheck:native --prefix workbench
node workbench/node_modules/typescript/bin/tsc -p workbench/tsconfig.native.json
npm run probe:desktop
```

The compiler regenerates `.native` test entry files. The original probe command then copies the existing built auth-required/auth-disabled bundles outside the repo and injects only this test entry. This is native Electron/utility-process verification, not final installer or installed-app acceptance. Final packaging recompiles all native sources independently.

## Second, distinct bounded-wait failure

After isolating the strict binding assertion, required/import and required/reopen both passed. The first rerun then failed in disabled/import while waiting the default 10 seconds for the injected lost-status recovery to leave the UI unloaded. The raw second log and JSON/PNG are retained as `second-*`; the intermediate required-mode screenshot is also retained.

The second diagnostic shows the binding already adopted library B, `controllerBusy: true`, and `seedPending: true`, with a committed import. `resumeImport → bindImported → covers.seed` was still running; the renderer correctly remained busy. In that same run opening library A took approximately 16 seconds and importing B took approximately 24 seconds. This supports an insufficient probe wait budget rather than a wrong result or deadlock. The test now gives this recovery wait the same 45-second budget used by neighboring import waits. The runner's import phase allows 180 seconds for open/import/lost-ack recovery; missing-resource and reopen phases retain their 60-second limit. Exact UI conditions, `INVALID_INPUT`, `RELEASE_MISMATCH`, sandbox, CSP, binding identity and text-only assertions are unchanged. No application product code was modified.

## Third finding after recovery completed

With the aligned budget, disabled/import recovery completed after approximately 23.8 seconds. The next assertion exposed a stale test layout assumption: `.content-library-page #new-content?.disabled` was expected to be `true`, but the current App hides the entire content page while status is unavailable. The diagnostic has `loaded: false`, `busy: false`, `status read failed (IO_ERROR)`, no body editor and a `retry-workspace` recovery action. The third raw log/JSON/PNG are retained as `third-*`. This is distinct from both the shared-client collision and the short wait budget; absence of the page is a stricter safety condition than a visible disabled create button.

The stale layout check is now an explicit recovery invariant: `retry-workspace` must exist, and content-list creation, title, body and save controls must all be absent. It does not accept `undefined` as a passing disabled state. The unloaded status and subsequent successful refresh/re-read assertions remain.

## Final result

All recheck commands exited 0. `npm run probe:desktop` passed auth-required/import, auth-required/reopen, auth-disabled/import and auth-disabled/reopen with Electron 44.9.0, real utility process/sharp, strict invalid-input/release-pair checks and no CSP violation. The final disabled recovery took approximately 37 seconds and its complete import scenario approximately 125 seconds, within the explicitly bounded 45/180-second budgets. `result.json` records commands and scope; `native-probe-after.log` is the full successful log; `final-required.png` and `final-disabled.png` are the original successful probe captures. The minimized reproduction intentionally remains red and is diagnostic evidence, not an automated passing test.

No product code or global queue behavior changed. No final installer, installed application, system-dialog or human acceptance is claimed.
