2026-10-20 · Actual packaged 0.3.28 candidate native verification

Five independent native processes passed (all exit 0). The probe loads all product modules directly from the real 0.3.28 candidate's `Contents/Resources/app`; it does not copy or overlay product code. Runtime is repository Electron 44.9.0 with `app.isPackaged=false`, hidden `startDesktop`, real renderer/preload/IPC/utility worker, and a new disposable library/userData. This is not a Finder/LaunchServices/TCC/manual GUI or real-user-library acceptance result.

Candidate: `/Users/mac/code/dashboard/Nova-Content-Hub/workbench/release/darwin-arm64/preview/.packaged-apps.noindex/build-0328-6b739b3/mac-arm64/自媒体工作台.app`.
Source commit: `6b739b385e01931bd26962f229c853da2317a37c`.
Packaged index SHA256: `04c38d8bf75a47eb3c659a175084a9dcc754a54f28613a8a5dd73b3b351ab3a1`.

| Phase | Native evidence |
| --- | --- |
| fresh | Bootstrap ready with no current library; native createLibrary initializes 20 templates/52 nonempty prompts; save content, publication plan and manual publication record; healthy complete diagnostic |
| fault-moved | Original path moved only while its process was stopped; next native process reports ROOT_MISSING and failed read; exact binding and moved business bytes remain |
| reopen-recover | Original directory returned; native openLibrary succeeds without reset; content/plan/manual record and all original bytes match; native backupLibrary → verifyLibraryBackup → restoreLibraryBackup pass |
| restored-reopen | Restored library opens in another process with identical binding/identity/business projection and bytes; healthy diagnostic |
| active-move | A genuine worker-held lock observed; entire active restored library moved and returned after the in-progress operation settles; first post-return health is healthy at 178 ms; real workspace read succeeds |

Native backup preserves all 572 original files; restoration preserves every original file byte and adds exactly one provenance file (573 total). `libraryId` is preserved and the restored directory inode is independent. The original library remains unchanged. No live generation jobs existed to interrupt.

During the active-move scenario, original lock owner/main utility-worker PID 6600 remains alive, and the main-worker PID is unchanged through the final read. The healthy sample has empty before/after tracked request sets. All 573 business files retain tree fingerprint `c493b2023b60aafa40c1e07c9826d2170699f6664ae28f0b5cdade29b958e6b7`; machine-binding bytes and content/plan/manual-publication projection remain identical. The final lock path is absent, with no manual lock deletion, reset or worker restart. The resource worker was not started, so no resource-process continuity claim is made. Process exit occurred only after successful observations were saved.

The complete candidate `.app` tree contains 1,817 entries. Its before/after SHA256 is `f2bfdd284a08820c448c21f2a4eab0ed0767a2c8b79201720d25c5b4b4dd7fdd`, matching the parent package receipt. `candidate-tree-before.json` retains every entry's hash/mode/link evidence. No candidate resource, source file, version, installed app or cache was changed.

Every native setup read reports the candidate's paired market `available`, while selected Codex assistant is `ready:false`, `reason:skill-missing`. This is consistent with the currently installed 0.3.27 assistant cache being unpaired with candidate 0.3.28. The probe did not update that cache or send any host task. It therefore does not claim assistant execution readiness.

Commands from repository root:

```sh
node docs/verification/production/2026-10-20-library-lock-0328/native/run.mjs
# exit 0; each of fresh / fault-moved / reopen-recover / restored-reopen / active-move exits 0

node docs/verification/production/2026-10-20-library-lock-0328/native/verify.mjs
# exit 0; validates the five original receipts and invariant checks
```

`run.log` contains the runner summary; each phase has its own original JSON and log. `manifest.json` records the actual candidate, temporary root, child PIDs/exit codes, full-tree equality and explicit boundaries. `verification.json` summarizes checked invariants and hashes evidence files.

Skipped: `/Applications` 0.3.27/real user app or library/TCC, installing a new package, Finder/manual GUI, host/cache changes, generation, clipboard, notifications, native foreign-owner/clone protection, and crash-during-maintenance recovery. Source suites and separate package/signature/DMG checks belong to the parent task. The 0.3.27 and source-overlay evidence directories remain unchanged.
