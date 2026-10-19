# 0.3.23 upgrade launch-path incident

The user's report that the workbench still showed 0.3.22 was correct. Replacing the installed files was insufficient acceptance of the upgrade.

The first native process inspection in the diagnosis found PID 53054 executing `/Applications/.nova-content-hub-install-97266b36-93a4-46fd-9def-c6fd2db43c48/previous.app/Contents/MacOS/自媒体工作台`. That preserved application was 0.3.22. The canonical `/Applications/自媒体工作台.app` contained 0.3.23 in both Info.plist and the packaged release metadata. The installation journal was already `complete`, but its previous application remained launchable. Renaming an installed bundle into a backup preserves its filesystem identity; excluding a directory from indexing is insufficient protection against existing launch references.

The old process subsequently exited. A path-based native-control request timed out, yet a fresh process check found PID 54568 executing the canonical application with both versions 0.3.23. A control timeout therefore cannot be treated as proof that launch failed. User-facing GUI acceptance is separate from this process-path check.

The real completed-transaction regression check returned `phase=complete, launchablePreviousApp=true, passed=false` before cleanup. This diagnoses a post-install backup lifecycle defect; it does not require changing prepared/published rollback semantics.

Two specifically identified generated build copies (0.3.21 and 0.3.23) were retired after fresh full-tree equality and signature verification against their retained, read-only DMGs. The recovery artifacts were preserved; see `2026-10-19-retired-build-copies.json`. No user library or host account files were changed by that cleanup.

The prior 0.3.23 installation receipt remains a valid record of the file replacement interval and library hash equality during that interval. It is not evidence of correct real-world launch or completed GUI acceptance. The 0.3.23 colleague package was paused pending the launch fix.

The follow-up patch must retire a completed previous application into a verified, recoverable archive, preserve in-progress rollback, protect running backups, and verify the executable path and displayed version after launch. Code tests, archive round-trip checks, actual installed-process evidence and user GUI confirmation must be reported separately. Apple Developer ID signing and notarization remain deferred by user instruction.
