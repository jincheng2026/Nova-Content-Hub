# Completed-dialog integration into 0.3.32

Integrated the authorized completed chats “简化跳转提示词” and “优化帮助与排查页面排版” onto isolated release HEAD `da3c709a2685d2a84621d301df67e513c402b7e4`. The original 15-file patch is preserved as `source.patch`, SHA256 `a621ea3ce4ba6182cb24ec8c0726d5c153afd147e2937570872c25981d73f00e`; `git apply --check` and apply both exited 0. The original qoder/review checkout and the user's library were not modified.

The 15 files carry cover-refinement selected materials and extra requirements, reset the cover prompt on content changes, show selected handoff requirements while retaining full context reads in the execution Skills, and separate help actions from collapsed guides while preserving settings operations and draft guards. No dependency, release version, signing or production gate was changed. A-group's four renderer files and the native import-probe correction remain unchanged.

## Necessary integration fix

Review identified that the browser handoff's new summary directly interpolated unvalidated `options.count` and pixel values outside the JSON data block. A malicious count or pixel string could therefore create a new instruction line. A behavior regression first failed with the actual injected `$other-skill` line (`logs/browser-summary-security-red.log`). The minimal correction summarizes only a positive safe-integer count and exactly two positive safe-integer pixels; other inputs display “未指定” while the full original JSON remains data. The canonical bridge was synced into both generated mirrors. Native legitimate summaries are unchanged. The regression now passes for both hosts and the long-link attachment fallback.

## Verification

All final checks exited 0; `verification-result.json` records the exact commands and scope.

- Browser summary security tests: 8/8, including malicious counts/pixels, invalid tuples, unchanged full JSON and bounded fallback links.
- Handoff/native bundled CLI checks: 40/40, including both hosts, exact/ratio-minimum requests, all selected photo/material bytes and roles, retry/host change, missing-input claim rejection, long-path URL bounds, auth/stale-binding refusal and execution Skill instructions.
- Contract, cover, settings-location and A-group regression checks: 114/114. Final native and renderer typechecks and bridge mirror checks passed.
- Real React/Semi/Electron cover gallery passed both the updated repository probe and the checkout-relative evidence copy. It verifies selected materials and extra requirements in candidate refinement, failed-generation preservation, original-reference material, reset of the prompt/material selection when changing content, trusted annotation coordinates, gallery selection/export, layout and current-assistant continuation. Its synthetic IPC does not launch an external assistant or generate images.
- Real help UI passed 1440/1100/900/580/390 widths without dialog overflow, collapsed guides, keyboard Enter, notification/diagnostic feedback, plugin actions, healthy-state recovery disabled, explicit reset confirmation, retained profile drafts across tabs and dirty-close blocking. Wide and narrow screenshots were visually inspected.
- The actual production App renderer probe passed A5/A6/A7 again: collapsed learning notes block navigation/close, confirmed save survives list-read failure without duplicate create, input during final refresh prevents close and retains draft, and explicit conflict save-as preserves the external version.

The execution Skills now require actual complete reads and a visible requirements checklist. The CLI tests prove the fixed context and input bytes survive the handoff; they do not prove that an external assistant actually read them or produced compliant images.

## Reproduce the UI checks

From the repository root after the locked dependencies are installed:

```sh
node docs/verification/production/2026-10-20-parallel-integration-0332/probe-source/help-layout-ui-probe.mjs
node docs/verification/production/2026-10-20-parallel-integration-0332/probe-source/cover-gallery-ui-probe.mjs
NOVA_PROBE_EVIDENCE_DIR="$PWD/docs/verification/production/2026-10-20-parallel-integration-0332/ui/a-regression" node docs/verification/production/2026-10-20-a-group-0332/probe-source/app-draft-ui-probe.mjs
```

Both new evidence probes locate the checkout relative to their own files and write independently under this evidence directory. The help probe was copied from the completed chat's original probe and its source/dependency/evidence paths were corrected to this isolated checkout. Its version fixture reads this checkout's package version. All Electron userData and data fixtures are temporary and synthetic; actual OS settings, user content, assistant accounts and production services are untouched.

Final complete verification, a new frozen source revision and rebuilt installation artifacts belong to the release owner. No final installed-app, Intel Mac/Windows hardware or real-provider acceptance is claimed here.
