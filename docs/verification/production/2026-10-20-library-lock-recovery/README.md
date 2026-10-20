2026-10-20 · Native contrast for live library-lock recovery

This probe contrasts the frozen installed 0.3.27 implementation with a development copy containing exactly one source-file overlay: `plugin-src/src/lib/file-library/index.mjs`. Both copies still identify as 0.3.27. This does not claim a new version, built package, installation, Finder launch, TCC acceptance, or real user-library acceptance.

`run.mjs` copies the complete frozen app resource tree (585 entries) from `/Applications/自媒体工作台.app/Contents/Resources/app` into a fresh `os.tmpdir` root and verifies its full bytes/modes/link snapshot. Green changes only the explicit index file and archives those tested overlay bytes. Everything else must match the frozen tree before and after the run. The installed tree must also remain identical. The assistant marketplace is not copied; its installed path is passed as read-only metadata context, with host-launch IPC blocked.

`native-entry.mjs` runs repository Electron 44.9.0 with `app.isPackaged=false`, hidden `startDesktop`, a temporary machine binding, and a brand-new synthetic library. It retains the real renderer, preload, IPC and utility worker. Real native IPC creates the library, reads its 20 templates and 52 prompts, saves synthetic content, adds a plan and records manual publication. It never posts externally.

For the fault, the probe begins a native health request, observes a genuine held worker lock, moves the entire bound library, waits for the in-progress operation to settle, and returns the same folder. It then samples read-only health for at most approximately five seconds and tries a real native workspace read. Samples record original owner liveness, the main utility-worker PID and in-flight IPC/worker operations. The resource worker did not start, so this does not claim a resource-process continuity check. No lock is deleted, no worker is restarted, and no binding is reset during observation. Exit cleanup happens after the receipt is saved and is never treated as recovery. Business-file and machine-binding bytes must remain equal.

Current frozen red result: launcher exits 0 because the expected failure was reproduced; its Electron child exits 2. Twenty health samples from 1 ms through 4,858 ms all return LOCK_BUSY with empty before/after in-flight sets. Original owner/main worker PID 78828 stays alive and unchanged through the final failed read (BUSY). All 572 business files retain fingerprint `e5c1774ff493ef3163afc44bc65efa3bd02768454080ec4161aad1e63dec54ee`; binding bytes remain identical. The frozen installed tree and its disposable app copy remain identical.

Green was run only after the product owner froze the source and independent review confirmed readiness. The launcher enforces overlay SHA256 `04c38d8bf75a47eb3c659a175084a9dcc754a54f28613a8a5dd73b3b351ab3a1`; the exact tested bytes are archived in `green-overlay-index.mjs.txt`.

| Observation | Frozen red | Source overlay green |
| --- | --- | --- |
| Launcher / native child exit | 0 / 2 (expected failure) | 0 / 0 |
| Changed copied app paths | none | only `plugin-src/src/lib/file-library/index.mjs` |
| Post-return health | 20 LOCK_BUSY samples, through 4,858 ms | first sample healthy at 198 ms |
| Tracked requests before/after health | all empty | empty |
| Original owner/main worker | PID 78828 alive, unchanged | PID 83457 alive, unchanged |
| Final native workspace read | BUSY | successful |
| Final lock | same original live-owner lock | absent (ENOENT), no external deletion |
| Business files / binding | 572 files unchanged; binding bytes equal | 572 files unchanged; binding bytes equal |
| Installed tree / copied runtime | unchanged | installed tree unchanged; copy retains only the one declared overlay |

Green business fingerprint before and after is `4cac3ff178f13ffe914004fc03a0ba7bf670227ab3ca8937b18fb4fa59447013`. The content, plan and manual-publication object also matches exactly after recovery. Each group uses its own new library and IDs, so cross-group library fingerprints are not expected to be equal. In both groups the original lock owner is the main utility worker; the resource worker had not been spawned, and the recorded main-worker PID remains unchanged until all evidence is saved.

The complete red/green evidence and full-tree hashes are accepted by `summarize.mjs`. This does not promote the source overlay to an installed release or overwrite the frozen 0.3.27 active-move failure. All probe processes exited only after their receipts were saved.

Commands from repository root:

```sh
node docs/verification/production/2026-10-20-library-lock-recovery/run.mjs red
# launcher 0 / native child 2 is the expected red failure

node docs/verification/production/2026-10-20-library-lock-recovery/run.mjs green
# launcher 0 / native child 0; reviewed source SHA enforced

node docs/verification/production/2026-10-20-library-lock-recovery/summarize.mjs
# exit 0; validates paired receipts, hashes and recovery invariants
```

Skipped: installing a new package, source/unit suites owned by the product agent, real app or user data, Finder/TCC/manual GUI, external host calls, generation, clipboard, notifications, and unrelated library features. Native clone/foreign-owner protection is not proven by this scenario; source tests and independent review own that boundary. The earlier 0.3.27 failure evidence directory remains unchanged.
