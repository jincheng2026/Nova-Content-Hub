# Production List Alignment Implementation Plan

> **For agentic workers:** Execute sequentially in this assigned owner session; root explicitly retains final review, versioning and commit. No delegation or live UI/user-library operations.

**Goal:** Add independent account avatars and stable summaries/actions with complete details for accounts, reports, tasks, content and radar.
**Architecture:** Extend the existing optional account asset reference, derive report acceptance from exact task/attempt/artifact association, and keep current mutations and task contracts. Reuse a read-only detail dialog and fixed summary/action slots.
**Tech Stack:** Existing React, Semi UI, TypeScript, file-library and Electron probe tools; no dependencies.
**Spec:** Approved in-chat bounded design and docs/design/内容工作台设计标准.md.

## Global Constraints

Keep the installed .56 release and user libraries untouched. Do not edit launcher/service/bridge/version or production-artifacts. Preserve budgets/comments, CAS, focus-only continuation, explicit acceptance and manual publishing. One owner writes all files below; root commits.

### 1. Avatar asset contract
- [x] Add failing domain tests for omitted legacy avatar, roundtrip/update preservation, missing and invalid asset, stale CAS, backup/restore.
- [x] Add optional avatarAssetHash to production account contract/validators/save/read/asset enumeration; include desktop grant and input validation.
- [x] Run focused domain and desktop validation tests.

### 2. Stable list summaries and exact report status
- [x] Add failing receipt-derived report-state tests; reject title-only guesses and submitted/manual-as-accepted mistakes.
- [x] Add read-only detail dialog; account avatar form and fixed identity/media/summary/tags/report/actions slots.
- [x] Keep report/task/content/radar summary actions stable; complete data lives in accessible detail dialogs. Keep existing handlers and unsafe-action protections.
- [x] Validate native and renderer types and related tests.

### 3. Visual and interaction evidence
- [x] Add isolated Electron probe with long/empty/missing image cases, varied reports/tasks, contents and radar at 1280×860 and 960×680.
- [x] Verify aligned action bounds, complete details, Escape/focus return, avatar import/save and manual selections; capture screenshots.
- [x] Record design rule IDs, source diff, passing checks and platform/real-host gaps; hand off to root without bumping version or committing.

### 4. Approved transcript follow-on
- [x] Freeze compact typed reference intents in controller/shared validation and reject stale/missing sources before task creation.
- [x] Per-reference intent controls and frozen async before/after preview with one CAS save; failed CAS retains preview.
- [x] Dedicated controller/domain and isolated Electron evidence, including no partial adoption after external body edit.

Evidence and platform limitations: docs/verification/production/2026-10-27-production-list-alignment/verification.md.
