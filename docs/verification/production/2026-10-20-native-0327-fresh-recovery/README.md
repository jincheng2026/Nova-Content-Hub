2026-10-20 · Installed 0.3.27 native fresh-library / backup / recovery evidence

Overall recovery is **not accepted**: an active-directory-move scenario leaves a live worker's lock blocking reads after the directory returns. New-library creation, persistence, native backup/verify/restore, and offline path recovery passed independently. No product code, installed resources, real user configuration/library, actual user app, or TCC permission was changed.

This uses repository Electron 44.9.0 (`app.isPackaged=false`) with actual installed `/Applications/自媒体工作台.app/Contents/Resources/app` modules: `startDesktop`, renderer, preload, IPC, utility worker and maintenance controller. Windows are `show:false`. Dialog callbacks only return the disposable probe paths. The release reports `productionReady:false`; this evidence does not promote it to production acceptance. This is not Finder/LaunchServices/manual GUI/TCC acceptance.

| Scenario | Evidence | Result |
| --- | --- | --- |
| Empty temporary userData bootstrap | `fresh.json` | ready / reason none / no reset; no current library |
| Native createLibrary and seed initialization | `fresh.json` | 20 templates; 52 nonempty prompt bodies; no initial contents |
| Content + publication plan + manual publication record | `fresh.json` | real IPC/worker writes; no external posting |
| Process exit and re-open | `reopen-recover.json` | same library binding, content/body/plan/publication/events and all original file bytes |
| Move library while app stopped; start with missing path | `fault-moved.json` | ROOT_MISSING; read fails; exact binding and moved business bytes remain |
| Return directory after fault process exits, then native open | `reopen-recover.json` | opens without reset; original data retained |
| Native backupLibrary → verifyLibraryBackup → restoreLibraryBackup | `reopen-recover.json` | 572 files / 97,023,852 bytes; backup and all restored source bytes match |
| Restored identity and provenance | `reopen-recover.json` | same libraryId; independent directory inode; one added restore-provenance file; no live jobs to interrupt |
| Third process re-opens restored library | `restored-reopen.json` | same persisted binding, content/plan/manual record and all 573 file bytes; health healthy |
| Active whole-library move / return | `active-move.json` | **Unresolved**; 7 health checks from 1 ms to 4,860 ms all LOCK_BUSY, same live owner and token; final native read BUSY |

The last scenario was observed in a separate process after the successful restore workflow. The probe started a genuine native health request and moved the bound directory after seeing a real worker lock; a queued background workspace read held that observed lock. By the return event, tracked IPC/worker operations had settled. All seven health samples have empty `activeAfter`, root identity matched, and the same owner PID 76062 alive with token `cc97aa0b-7734-4516-be33-fe41b3d87fb5`. Two intermediate `activeBefore` samples include queued renderer reads (1,258 ms and 4,088 ms). Five samples have empty before/after sets; the final three at 4,344 / 4,603 / 4,860 ms are consecutive idle observations. The final read still returned BUSY, then the tracked set was empty. The loop observed for approximately five seconds; no lock was deleted, no worker was stopped/restarted, and no binding was reset during observations. The probe exited with code 2 only after saving this unresolved result; that normal cleanup is not evidence of recovery.

Business-file fingerprint before and after active movement: 573 files, SHA256 `73db0a79efc3a4508b6ba6c7b633f59445f5dbcbcdb640449df9653247ac6847`. Machine-binding bytes also matched. Temporary root: `/private/var/folders/vl/nhqtk_8s6vl5j679xhv_z3n80000gn/T/nova-native-0327-fresh-R8qJUm`. The exact active target and lock path are in `active-move.json`; do not delete its remaining lock to hide the evidence.

Commands run from repository root:

```sh
node docs/verification/production/2026-10-20-native-0327-fresh-recovery/run.mjs
# exit 0; four isolated child processes each exit 0; core-manifest.json

workbench/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron docs/verification/production/2026-10-20-native-0327-fresh-recovery/active-move.mjs /private/var/folders/vl/nhqtk_8s6vl5j679xhv_z3n80000gn/T/nova-native-0327-fresh-R8qJUm /Users/mac/code/dashboard/Nova-Content-Hub/docs/verification/production/2026-10-20-native-0327-fresh-recovery
# exit 2; unresolved active move; active-move.json

node docs/verification/production/2026-10-20-native-0327-fresh-recovery/summarize.mjs
# exit 0 validates the evidence structure; does not declare recovery passed
```

Historical attempts are retained independently:

- `attempt-1`: harness awaited `startDesktop` at Electron ESM top level and prevented readiness. Only its own PID was terminated; sample and source retained. The final harness follows existing probes by starting without top-level awaiting readiness.
- `attempt-2`: the harness used nonexistent channel `wechat`; native validation rejected it. Final harness chooses an actual active library channel. No product repair was needed.
- `attempt-3`: first real active move returned ROOT_MISSING, then LOCK_BUSY 234 ms later. Its original fixture and lock remain. The then-current harness exited on that failed immediate assertion, so that original attempt has no five-second observation. `active-move.json` supplies a fresh bounded reproduction, without replacing the original failed receipt.

Skipped: full repository suites, Finder launch/TCC/manual GUI, malformed-binding reset, maintenance interruption, host calls, generation, clipboard, reminders/notification permission, and real user-library verification. Only ten relevant installed resource modules were hashed before/after here; the parent task owns the separate full installed-tree receipt. All probe processes were confirmed exited after evidence collection.
