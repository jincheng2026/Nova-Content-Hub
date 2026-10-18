# Unified host installation 0.3.6 — 2026-10-19

Status: verified.

Only official host marketplace/install/update CLIs were invoked. The source marketplace is sealed against package-files.json from the installed /Applications 0.3.6 app. Both host caches are compared against its entire payload tree; only the known Codex semver symlink omission is allowed.

- codex: 0.3.6; 450 entries; cover/template metadata readiness passed; unrelated config unchanged; 6 previous cache versions retained.
- workbuddy: 0.3.6; 451 entries; cover/template metadata readiness passed; unrelated config unchanged; 7 previous cache versions retained.

Local protected backup: /Users/mac/code/dashboard/Nova-Content-Hub/.local-probes/unified-host-install-036/backup-20261018T215030645Z

Old-cache root .in_use/.orphaned_at files are host bookkeeping and are recorded separately from payload comparisons. No plugin runtime, launcher, doctor, hook, chat/session or generation was directly run. Installer-internal subprocesses were not traced; WorkBuddy may require /reload-plugins or a new session, neither was initiated here.
