# Health work budget diagnosis — 2026-10-19

Scope: local, read-only integrity inspection (the normal coordination lock is allowed). No business writes, transaction pruning, cache bypass, packaging, AI calls, or native UI actions were performed by this probe. The companion JSON omits the library path, library/object IDs, titles, prompts, and image data.

## Reproduction and minimal fixture

Source baseline: `2fb1568e28391ec8167935cf32bf85da6c77e00a`.
The installed app plugin's health module SHA-256 matches this baseline exactly:
`fa6615b1fcb65c39989db073f14c7e74d632a67603cb48141d079d5fe5fea811`.

Directly invoking `inspectLibraryHealth(selectedRoot, {expectedLibraryId, expectedRootIdentity})` on the existing acceptance library repeatedly reports `incomplete`, `LIMIT_REACHED`, and checked counts of 4 objects, 10 assets, 61 transactions, and 2 requests. This is the same symptom observed by the parent through the native app.

The saved fixture is generated in `plugin-src/src/lib/file-library/test/health.test.mjs`, test `health charges each JSON node once while retaining the cumulative work limit`. It needs only a fresh library (one default workspace) and one template with `definition: {steps: Array(9900).fill(null)}` and `resources: {}`. There is one transaction, no asset, and no request. Reducing the array to 9700 makes the baseline healthy. Sixty plain-text updates also remain healthy, ruling out 61 transactions alone as the cause.

Red-capable command, run before the production fix:

```sh
node --test --test-name-pattern='charges each JSON node once' plugin-src/src/lib/file-library/test/health.test.mjs
```

Observed before fix: 0 passed / 1 failed, expected `healthy`, actual `incomplete`.

## Three falsifiable hypotheses and results

1. **JSON nodes consume the work budget twice.** Prediction: charging a node once while retaining all traversals and fixed limits will finish the original library. Confirmed: the baseline stops at work 20001 after only 9111 visited nodes; the single-charge variant completes with work 17989 and 13910 visited nodes.
2. **Duplicate JSON validation through metadata and reader is the decisive cause.** Prediction: removing the metadata-only budget walk will finish the original library. Falsified: this in-memory diagnostic variant still stops at work 20001, after 42 objects and 54 assets. The production fix keeps these validations.
3. **Actual historical volume, cumulative bytes, or elapsed time independently exhaust the fixed limits.** Prediction: the first two changes would still hit another limit. Falsified for this library: completion reads 128588552 cumulative bytes, below 512 MiB, in 155–175 ms in the recorded runs, below 10 seconds. All 61 historical transactions remain inspected.

Instrumentation was injected into modules imported through `data:` URLs in the diagnostic Node process only. It counted work, bytes, JSON calls, popped nodes, and queued edges; it was never written into production source. Recorded baseline and fixed runs use the same library and options. Values and repeat results are in the companion JSON.

## Fix and validation

`guard(cost = 1)` retains all deadline and issue-count checks. JSON's root and every enqueued child consume one work unit each. Every dequeue calls `guard(0)` to check the deadline without charging the same node twice. Node scheduling remains bounded before queue growth. No fixed limit was increased. File/asset byte limits, cumulative bytes, depth, root identity, path safety, checksums, source-change detection, transactions, lock behavior, and validators are unchanged. There is no caching or integrity-check bypass.

```sh
node --test plugin-src/src/lib/file-library/test/health.test.mjs
node --check plugin-src/src/lib/file-library/health.mjs
git diff --check -- plugin-src/src/lib/file-library/health.mjs plugin-src/src/lib/file-library/test/health.test.mjs
```

Observed: 9/9 health tests pass, including the new regression, genuine cumulative work exhaustion across two individually bounded template packages, existing oversized-file bounds, corrupt metadata, pending transactions, root identity, and lock checks. Syntax and whitespace checks pass.

The original acceptance library is `healthy`, complete, and reports 44 objects, 66 distinct referenced assets, 61 transactions, and 2 requests. This was confirmed twice using the instrumented fixed source and once using the uninstrumented public source API. Asset count includes built-in template resources, beyond the six AI candidates.

The business tree before and after the paired original-library comparisons has 392 files, 103531158 bytes, and the same path/content SHA-256 `cbb87b4a3ff638306baef1dd578eda0ff2a335a267eae153ff01cf3c95978c6e`.

The fix changes shared plugin payload. Release version bump, both plugin installations, packaging, and the native app recheck belong to the parent task. This evidence verifies source behavior only; the installed app still contains the baseline until that release work finishes. Larger libraries can still honestly report `incomplete` when a real fixed limit is reached.
