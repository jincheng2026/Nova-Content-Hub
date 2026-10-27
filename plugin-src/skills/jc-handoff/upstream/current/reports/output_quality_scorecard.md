# Output Quality Scorecard

Status: candidate, not provider-evaluated.

## What Improved

- Added evidence-first workflow before summary.
- Added session id and JSONL recovery path support.
- Added confidence labels for key claims.
- Added file-backed and external-model output modes.
- Added debug-chain support for investigations.
- Added redaction script for common secret patterns.

## Required Behaviors

- Handoff includes a recovery index when evidence is available.
- Important decisions and rejections include evidence labels.
- Long or compacted sessions do not claim complete coverage without JSONL/file checks.
- External-model packages do not assume local filesystem access.
- Durable decisions are not silently buried in ephemeral handoff files.

## Missing Evidence

- missing evidence: no provider-backed output eval has been run.
- missing evidence: no blind A/B human review has been run.
- missing evidence: no cross-platform packaged release has been created.

## Acceptance For First Use

- Shell scripts run locally without syntax errors.
- Skill files are readable from Claude, Codex, and NewMax symlinked entries.
- A real handoff generated after this change includes session/JSONL availability and evidence gaps.
