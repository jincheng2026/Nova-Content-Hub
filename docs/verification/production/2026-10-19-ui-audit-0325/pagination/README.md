# Shared pagination verification — 2026-10-20

Actual React 19 / Semi UI 2.104.0 / Electron 44.9.0, synthetic data, isolated temporary userData; no native bridge calls, no user-library or installed-app writes.

## Reproduction and fix

Before the edit, a 380px grid/form container had a 130.5px-tall pager: the app added an 8px gap on top of Semi list-item margins, and the quick jumper landed in the middle of a second line. Zero results also displayed an unusable quick jumper. Baseline screenshots are preserved separately. At 1440px the current source did not reproduce a full-width jump input, so this report does not attribute the user's original screenshot to an unverified cause.

The shared pager now explicitly bounds Semi's actual ul, removes duplicate list-item margins, wraps inside the container with right-aligned controls, protects the nested jump input against global form-input rules, and shows only the range count for zero or one page. All existing page sizes and multi-page controls remain.

Real Electron keyboard input exposed a separate existing bug: Semi inserts numeric li items after the parent's mount effect, so they had neither role nor tabindex. A child-list observer now reapplies the existing keyboard/accessibility behavior when Semi inserts/replaces items. Enter on the quick jumper continues to reach Semi's keypress handler and never submits the containing form.

DataTable also sets expandIcon=false when hideExpandedColumn is requested; Semi otherwise inserts its default unlabelled icon into the first cell. Controlled expandedRowKeys/details continue to render.

## Verification

- `node workbench/scripts/pagination-ui-probe.mjs`: PASS. Actual ContentList at 1440/1100/900/560; shared DataTable inside 1000/560/380/280px containers; actual MembersEditor in a 380px modal and Enter navigation to page 2.
- Zero/one/single/multiple/100 pages; page sizes 12 and 20; upper/lower current-page clamps; disabled controls/tab order; native Enter/Space page selection; native jump-to-52; previous/next; no containing-form submit; no bridge call or fixture data mutation.
- Hidden default expansion icon absent while controlled detail content renders. `daily-publication-ui-probe.mjs`: PASS, including actual plan details, edits and history snapshots, focus and 10,000-plan bounded DOM, 1280/560 layouts.
- `npm run typecheck:renderer`: PASS. Scoped `git diff --check`: PASS.

Screenshots show both the actual list bottom and actual member dialog after scrolling to its pagination. At very narrow widths the preserved full numeric controls use more than one row; tables retain their existing horizontal table scroller.

## Shared callers inspected

- ContentList: collections (12), contents and in-collection contents (20).
- App template-content picker (20).
- LibraryPanels: collection members (20/50/100), channels/collections/photos; content channel metadata and material attachments.
- Workspace pages: daily schedule (20), prompts (20), templates/template management (12).
- PublicationPanel: plans and actual publication history (10).
- Covers: reference materials, generation attempts/history (20), candidates (12).

The source hashes cover only the five pagination-owned files at this verification point. This is source/UI probe evidence, not an installed-package or production release acceptance.
