# Calendar date selection verification — 2026-10-20

Execution-agent scope (subsequent main-thread package and installation are recorded in implementation note 65). Product diff: `workbench/src/renderer/workspace-pages.tsx` only: DatePicker `autoSwitchDate={false}` and Calendar `markWeekend={false}`. No CSS, custom picker, parser, business-data change, version change, package, install, or Git commit.

## Red → green

Before fix, `node workbench/scripts/semi-calendar-ui-probe.mjs` exited 1: clicking the actual Semi `Next month` changed the day-list heading from `2026-10-19 3 条安排` to `2026-11-19 0 条安排`. Red fixture: `/private/var/folders/vl/nhqtk_8s6vl5j679xhv_z3n80000gn/T/nova-semi-calendar-check-MK3yQM`.

Installed Semi 2.104.0 `datePicker/datePicker.js` defaults `autoSwitchDate` to true. `semi-foundation/datePicker/monthsGridFoundation.js` `handleYearOrMonthChange` calls `updateDateAfterChangeYM` and notifies selected-change when that prop is true. `syncSwitchMonth` only coordinates range panels; `needConfirm` would change selection workflow unnecessarily.

Final `node workbench/scripts/semi-calendar-ui-probe.mjs` exited 0; see `calendar-ui.log`. The actual React/Semi/Electron test uses isolated temporary userData and synthetic schedules. Native mouse input covers opening, next/previous month twice, next/previous year twice, opening/returning from year/month panel, outside dismissal, cross-month day selection, reopen, cross-week day selection, and restoring day-list rows. It asserts the main heading, selected-day button, input, and day-list remain unchanged while browsing. Month/week computed background colors match for weekday and weekend headers/cells, with no weekend marker classes. Existing calendar regression covers minute placement, date-only lane, 1440/1100/900 month time/title slots, filtering, collection ownership, new-plan default date, updates, busy guard, unchanged synthetic data and no native writes.

`cd workbench && npm run typecheck:renderer` exited 0.

## Limits observed

Two attempts to select a specific year through an assumed `[role=option]` year/month selector returned no element; this extra test was removed, no product behavior changed. Opening/returning from that panel is covered, selecting individual scroll-list years/months is not covered. Native Escape did not dismiss this default Semi date popup in an extra probe; selected date remained unchanged. No Escape-close assertion or product behavior was added. Empty/invalid text input was not validated. Production installed-app validation and dynamic-pagination rerun belong to the parent integration run.
