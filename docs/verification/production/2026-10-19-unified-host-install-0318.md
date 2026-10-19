# Unified host installation 0.3.18 — 2026-10-19

Status: verified.

Only official host marketplace/install/update CLIs were invoked. The source marketplace is sealed against package-files.json from the installed /Applications 0.3.18 app. Both host caches are compared against its entire payload tree; only the known Codex semver symlink omission is allowed.

- codex: 0.3.18; 641 entries; cover/template metadata readiness passed; unrelated config unchanged; 17 previous cache versions retained.
- workbuddy: 0.3.18; 642 entries; cover/template metadata readiness passed; unrelated config unchanged; 18 previous cache versions retained.

Local protected backup: /Users/mac/code/dashboard/Nova-Content-Hub/.local-probes/unified-host-install-0318/backup-20261019T104953806Z

Old-cache root .in_use/.orphaned_at files are host bookkeeping and are recorded separately from payload comparisons. No plugin runtime, launcher, doctor, hook, chat/session or generation was directly run. Installer-internal subprocesses were not traced; WorkBuddy may require /reload-plugins or a new session, neither was initiated here.
