# MITORI Report Mode Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild report mode as a read-only, period-aware view and export surface for each student's 👍 and ✏ observation records.

**Architecture:** Add a pure UMD report model that produces one canonical report from MITORI state, and make the screen, print view, clipboard tables, and XLSX workbook consume that same model. Keep UI orchestration in `index.html`, but isolate print and workbook generation in focused modules so report calculations never mutate saved state.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, UMD/CommonJS-compatible modules, localStorage data already used by MITORI, Node.js built-in test runner, browser print API, self-contained OOXML/ZIP generation.

**Spec:** `docs/superpowers/specs/2026-10-13-report-mode-design.md`

## Global Constraints

- Report mode is read-only; it must not edit or delete observation records.
- Report mode includes only record-mode 👍 and ✏ observations; do not merge PerformanceTest or checklist data.
- Preserve all existing localStorage data and load records that do not have newly added properties.
- Active tiles use the exact `classLayout` order and gaps used by the home screen.
- The roster grid advances vertically in groups of five: 35 students use 5×7 and 40 use 5×8.
- Period choices are all records, a configured term, or an inclusive custom date range.
- Print, XLSX, and clipboard output must use the same selected period and students shown on screen.
- Do not add a new runtime dependency or require a network connection.
- Keep MITORI's current logo, header, footer, palette, mode switching, and unrelated features unchanged.

## Review Focus

- Empty, partial, 35-student, and 40-student rosters must render without misplaced cards or an unnecessary eighth column.
- Legacy records missing `studentName`, `tags`, unit, content, or memo must remain readable and must not crash grouping or export.
- Boundary dates and overlapping configured terms must select/filter deterministically: date bounds are inclusive and the latest-starting matching term wins.
- Archived tiles with missing current class or subject references must remain identifiable through preserved/fallback labels and must not lose records.
- Long names, multiline memo/content, Japanese punctuation, XML characters, and empty optional fields must be escaped and remain usable in print, TSV, and XLSX.

---

### Task 1: Canonical report model

**Files:**
- Create: `report-model.js`
- Test: `tests/report-model.test.cjs`

**Interfaces:**
- Consumes: plain MITORI state fragments (`classes`, `archivedTiles`, `classLayout`, `records`, `sharedClasses`, `sharedClassData`, `subjects`, `termSettings`) and a period request.
- Produces: `MitoriReportModel` / CommonJS exports:
  - `resolveDefaultPeriod(termSettings, anchorDate) -> Period`
  - `resolvePeriod(termSettings, request, anchorDate) -> Period`
  - `reportTileLayout(classes, archivedTiles, classLayout) -> { activeSlots, archivedTiles }`
  - `buildReport({ tile, context, roster, records, period, nameDisplay }) -> ReportModel`
  - `groupStudentRecords(records, mode) -> Array<RecordGroup>`
  - `recordsForStudent(report, studentKey, kind) -> Array<ReportRecord>`
- `Period` is `{ mode: 'all'|'term'|'custom', label, start: string|null, end: string|null, termId: string }`.
- `ReportModel.students` contains `{ key, no, name, kana, legacy, row, column, goodCount, badCount, records }`; `row` is `((no-1)%5)+1` and `column` is `Math.floor((no-1)/5)+1` for current-roster students.

- [ ] **Step 1: Write failing period tests**

Add tests named:

```js
test('default period chooses the latest-starting configured term containing the anchor date', () => { /* overlapping September ranges */ });
test('custom ranges include both boundary dates and reject a reversed range', () => { /* start/end records included */ });
```

Assert exact `mode`, `termId`, `start`, `end`, and the Japanese error message `開始日は終了日以前の日付にしてください` for a reversed range.

- [ ] **Step 2: Run the period tests to verify they fail**

Run: `node --test tests/report-model.test.cjs`

Expected: FAIL because `report-model.js` does not exist.

- [ ] **Step 3: Implement period resolution**

Implement `resolveDefaultPeriod()` and `resolvePeriod()` in `report-model.js`. Accept both trimester and semester arrays, compare `YYYY-MM-DD` keys, include both endpoints, and choose the matching term with the latest `start` when ranges overlap.

- [ ] **Step 4: Run the period tests to verify they pass**

Run: `node --test tests/report-model.test.cjs`

Expected: PASS.

- [ ] **Step 5: Write failing tile and roster-model tests**

Add tests that assert:

```js
assert.deepEqual(model.reportTileLayout(classes, archived, ['a', null, 'b']).activeSlots, ['a', null, 'b']);
assert.deepEqual(report.students.map(s => [s.no, s.row, s.column]), [
  [1, 1, 1], [5, 5, 1], [6, 1, 2], [35, 5, 7]
]);
assert.equal(report40.students.at(-1).column, 8);
```

Cover empty/partial rosters, `classLayout` gaps, archived-tile fallback labels, and a 40-student roster.

- [ ] **Step 6: Run the tile and roster tests to verify they fail**

Run: `node --test tests/report-model.test.cjs`

Expected: FAIL on missing report construction functions.

- [ ] **Step 7: Implement tile layout and report construction**

Implement `reportTileLayout()` and `buildReport()`. Filter records by `tile.id` and inclusive period bounds. Normalize legacy `tag`/`tags`, missing optional fields, and `type` values. Resolve current-roster names first; keep unmatched snapshot-name records as separate legacy students and anonymous unmatched records as `N番（名簿外）`.

- [ ] **Step 8: Write and pass record grouping tests**

Test that `recordsForStudent()` returns both kinds for `all`, only `good` for 👍, only `bad` for ✏, newest date first, and that `groupStudentRecords(records, 'tag')` groups identical observation labels while sorting records within each group newest first.

Run: `node --test tests/report-model.test.cjs`

Expected: PASS.

- [ ] **Step 9: Commit the canonical report model**

```bash
git add report-model.js tests/report-model.test.cjs
git commit -m "feat: add report mode data model"
```

### Task 2: Export tables and two-sheet XLSX workbook

**Files:**
- Create: `report-export.js`
- Create: `report-xlsx.js`
- Test: `tests/report-export.test.cjs`

**Interfaces:**
- Consumes: `ReportModel` from Task 1, selected student keys, and `{ school, className, subject, periodLabel }` context.
- Produces from `report-export.js`:
  - `buildSummaryTable(report, selectedKeys, context) -> Array<Array<string|number>>`
  - `buildDetailTable(report, selectedKeys, context) -> Array<Array<string|number>>`
  - `tableToTsv(table) -> string`
- Produces from `report-xlsx.js`:
  - `createWorkbook({ summaryTable, detailTable }) -> Uint8Array`
  - `filename(context, now) -> string`
  - `download(bundle, browserAdapters?) -> string`
- Workbook sheet names are exactly `児童別まとめ` and `記録一覧`.

- [ ] **Step 1: Write failing export-table tests**

Test exact headers:

```js
['学校','クラス','教科','番号','氏名','👍件数','✏件数','👍内容まとめ','✏内容まとめ']
['学校','クラス','教科','日付','番号','氏名','👍/✏','見取り内容','単元名','授業内容','メモ']
```

Assert that only selected keys appear, multiline memo text stays in one TSV cell, tabs/newlines/quotes are normalized without shifting columns, and empty optional values become empty strings rather than `未入力`.

- [ ] **Step 2: Run export-table tests to verify they fail**

Run: `node --test tests/report-export.test.cjs`

Expected: FAIL because `report-export.js` does not exist.

- [ ] **Step 3: Implement export table builders and TSV serialization**

Implement the three `report-export.js` functions. Summary content strings must preserve each record's date, type, observation label, and memo in readable newline-separated text. Detail rows sort by attendance number, then date ascending for spreadsheet analysis.

- [ ] **Step 4: Run export-table tests to verify they pass**

Run: `node --test tests/report-export.test.cjs`

Expected: PASS.

- [ ] **Step 5: Write failing workbook tests**

Assert that `createWorkbook()` returns a ZIP (`PK` signature), contains workbook XML naming both sheets, preserves escaped values such as `A&B <確認>`, and that `filename()` removes Windows-forbidden characters.

- [ ] **Step 6: Run workbook tests to verify they fail**

Run: `node --test tests/report-export.test.cjs`

Expected: FAIL because `report-xlsx.js` does not exist.

- [ ] **Step 7: Implement the two-sheet OOXML workbook**

Follow the existing no-dependency ZIP/OOXML pattern in `checklist/xlsx-export.js`, but keep report formatting and public API in `report-xlsx.js`. Freeze the first row, enable filters, wrap text, and set usable widths for long record columns.

- [ ] **Step 8: Run export tests to verify they pass**

Run: `node --test tests/report-export.test.cjs`

Expected: PASS.

- [ ] **Step 9: Commit export support**

```bash
git add report-export.js report-xlsx.js tests/report-export.test.cjs
git commit -m "feat: add report spreadsheet exports"
```

### Task 3: Print and PDF document builder

**Files:**
- Create: `report-print.js`
- Test: `tests/report-print.test.cjs`

**Interfaces:**
- Consumes: the same `ReportModel`, selected student keys, report context, and `format: 'individual'|'list'`.
- Produces:
  - `buildPrintDocument({ report, selectedKeys, context, format }) -> string`
  - `openPrintWindow(documentHtml, browserAdapters?) -> Window`
- Print HTML is a complete standalone document with A4 portrait `@page` rules.

- [ ] **Step 1: Write failing print-document tests**

Add tests that assert:

- individual format emits one `.reportPrintStudent` section per selected student with `break-after:page`, except the final section;
- list format emits the same records without forced per-student breaks;
- missing unit/content/memo labels are omitted;
- `&`, `<`, `>`, quotes, long Japanese names, and multiline memo text are escaped and preserved;
- control text such as `出力する児童を選択` is absent.

- [ ] **Step 2: Run print tests to verify they fail**

Run: `node --test tests/report-print.test.cjs`

Expected: FAIL because `report-print.js` does not exist.

- [ ] **Step 3: Implement standalone print HTML generation**

Implement `buildPrintDocument()` with shared headers, count summary, readable observation rows, A4 portrait CSS, and natural overflow to a second page when one student's content is too long. Implement `openPrintWindow()` so browser APIs are injectable for tests.

- [ ] **Step 4: Run print tests to verify they pass**

Run: `node --test tests/report-print.test.cjs`

Expected: PASS.

- [ ] **Step 5: Commit print support**

```bash
git add report-print.js tests/report-print.test.cjs
git commit -m "feat: add printable observation reports"
```

### Task 4: Report screen shell and tile selection

**Files:**
- Modify: `index.html:1210` (replace the current one-card report view)
- Modify: `index.html:1540-1560` (load report modules before the inline app script)
- Modify: `index.html:2327` (replace the current `renderReport()` implementation)
- Test: `tests/report-ui-contract.test.cjs`

**Interfaces:**
- Consumes: `MitoriReportModel.reportTileLayout()` from Task 1 and existing tile helpers (`tileSchoolName`, `tileSharedClass`, `subjectName`, `classColorValue`).
- Produces: report screen states `tiles` and `students`, stored only in transient variables; UI IDs required by later tasks:
  - `reportTileScreen`, `reportStudentScreen`, `reportActiveTileGrid`, `reportArchivedTileGrid`
  - `reportShowArchivedBtn`, `reportBackToTilesBtn`, `reportStudentTitle`

- [ ] **Step 1: Write a failing UI contract test**

Read `index.html` and assert that the required screen IDs exist, `report-model.js` is loaded, and the obsolete static `<h2>レポートモード</h2><div class="reportGrid"` shell is gone.

- [ ] **Step 2: Run the UI contract test to verify it fails**

Run: `node --test tests/report-ui-contract.test.cjs`

Expected: FAIL on missing screen IDs.

- [ ] **Step 3: Add the report screen shell and styling**

Add a tile-selection header, active layout grid, archived disclosure, student-screen shell, and responsive styles. Reuse current MITORI panel, button, tile color, border, and typography tokens; do not change global navigation or other modes.

- [ ] **Step 4: Implement tile screen rendering**

Replace `renderReport()` with state-aware rendering that reproduces `classLayout` including `null` slots. Add `openReportTile(tileId, archived)` and `showReportTileScreen()`; archived tiles render in a separate region only after the disclosure is enabled.

- [ ] **Step 5: Pass tile order and fallback-label tests**

Extend `tests/report-ui-contract.test.cjs` or add pure fixture assertions through Task 1 so active slots preserve gaps and archived tiles whose shared class/subject is missing still show a nonempty preserved/fallback label.

Run: `node --test tests/report-model.test.cjs tests/report-ui-contract.test.cjs`

Expected: PASS.

- [ ] **Step 6: Commit the report shell**

```bash
git add index.html tests/report-ui-contract.test.cjs
git commit -m "feat: add report tile navigation"
```

### Task 5: Period controls, 5×7/8 roster cards, and detail modal

**Files:**
- Modify: `index.html` (report controls, roster rendering, modal markup/events, observation snapshot fields)
- Modify: `tests/report-ui-contract.test.cjs`
- Modify: `tests/report-model.test.cjs`

**Interfaces:**
- Consumes: `MitoriReportModel.resolveDefaultPeriod()`, `resolvePeriod()`, `buildReport()`, `recordsForStudent()`, and `groupStudentRecords()`.
- Produces transient UI state:
  - `reportTileId`, `reportTileArchived`, `reportPeriodRequest`, `reportModel`
  - `reportModalStudentKey`, `reportModalKind`, `reportModalGrouping`
- Adds `studentName` and `studentNameKana` snapshots to new `state.records` entries without requiring them on old entries.

- [ ] **Step 1: Extend the failing UI contract test**

Assert that the report student screen contains:

- all/term/custom period controls and inclusive date inputs;
- a roster grid and selection/output toolbar;
- a detail modal with fixed close button and date/tag grouping controls;
- no edit, save, or delete control inside the detail modal.

- [ ] **Step 2: Run the UI test to verify it fails**

Run: `node --test tests/report-ui-contract.test.cjs`

Expected: FAIL on missing controls.

- [ ] **Step 3: Implement period-control rendering and validation**

Populate term choices from `state.termSettings`; default from the current header date; fall back to all records when there is no containing term. Rebuild only the report model and report screen when the period changes. Show `開始日は終了日以前の日付にしてください` for reversed custom ranges.

- [ ] **Step 4: Implement roster card rendering**

Render each current-roster student using CSS grid areas for number/name, 👍, and ✏. Assign row/column from the model so numbering advances down each five-person column. Use seven columns through 35 students and eight only for 36–40. Gray only empty cells; gray the whole card when both counts are zero.

- [ ] **Step 5: Implement the read-only detail modal**

Name opens both kinds, 👍 opens good only, and ✏ opens bad only. Render date order or observation-label groups from Task 1. Omit absent optional fields. Close using the fixed × button or Escape; do not expose record mutation actions.

- [ ] **Step 6: Add record-time name snapshots**

Modify both new record objects created by the existing `recordBtn` handler to include the current roster's `kanji` and `kana` values as `studentName` and `studentNameKana`. Leave all old records unchanged. Add a model test where a snapshot name differs from the current roster and assert it becomes a separate legacy student.

- [ ] **Step 7: Run report and existing record tests**

Run: `node --test tests/report-model.test.cjs tests/report-ui-contract.test.cjs tests/board-finalization.test.cjs`

Expected: PASS.

- [ ] **Step 8: Commit report browsing**

```bash
git add index.html tests/report-model.test.cjs tests/report-ui-contract.test.cjs
git commit -m "feat: add student observation report browser"
```

### Task 6: Multi-select, clipboard, XLSX, and print integration

**Files:**
- Modify: `index.html` (selection mode, export dialog, copy/download/print actions)
- Modify: `tests/report-ui-contract.test.cjs`

**Interfaces:**
- Consumes: report model from Task 1, tables/XLSX from Task 2, print builder from Task 3.
- Produces transient `reportSelection: Set<string>` and UI actions:
  - selection mode, select all, clear, exit;
  - print dialog with `individual` and `list`;
  - XLSX download;
  - clipboard choice `summary` or `detail`.

- [ ] **Step 1: Add failing export-control contract tests**

Assert presence of selection-mode, select-all, clear, exit, print, Excel, and spreadsheet-copy controls. Assert the print chooser contains exact labels `個票形式` and `一覧形式`, and the copy chooser contains `児童別まとめ` and `記録一覧`.

- [ ] **Step 2: Run the contract tests to verify they fail**

Run: `node --test tests/report-ui-contract.test.cjs`

Expected: FAIL on missing controls.

- [ ] **Step 3: Implement selection mode**

Normal card clicks keep their detail behavior. In selection mode, the whole card toggles its key in `reportSelection`. Implement one, many, all, clear, and exit. Disable all export actions when the set is empty, and clear selection when changing tile or period so hidden records are never exported accidentally.

- [ ] **Step 4: Implement clipboard and XLSX actions**

Build both tables once from the current report model and selected keys. Use `navigator.clipboard.writeText()` with the chosen TSV table. Use `MitoriReportXlsx.download()` for the two-sheet workbook. Report success/failure without mutating state.

- [ ] **Step 5: Implement print/PDF actions**

Open a privacy warning and individual/list format chooser, then pass the current report model and selected keys to `MitoriReportPrint`. Confirm that screen controls and scrollbars are absent from print output.

- [ ] **Step 6: Test error paths and data immutability**

Add tests or injectable-adapter assertions for clipboard rejection, blocked print windows, and download adapter failure. Deep-freeze a fixture state before building tables/print and assert it remains byte-for-byte equal afterward.

Run: `node --test tests/report-*.test.cjs`

Expected: PASS.

- [ ] **Step 7: Commit complete output integration**

```bash
git add index.html tests/report-ui-contract.test.cjs
git commit -m "feat: add report selection and exports"
```

### Task 7: PWA cache, version, regression, and visual verification

**Files:**
- Modify: `sw.js:1-30`
- Modify: `index.html:1-10` and footer version text
- Test: all `tests/*.test.cjs`

**Interfaces:**
- Consumes: all report modules and UI from Tasks 1–6.
- Produces: a deployable next MITORI version whose service worker caches `report-model.js`, `report-export.js`, `report-xlsx.js`, and `report-print.js`.

- [ ] **Step 1: Update app and cache versions**

Increment MITORI from `0.3.86` to the next patch version in the title, `APP_VERSION`, and footer. Increment the service-worker cache name and add all four report modules to `APP_SHELL`.

- [ ] **Step 2: Run the complete automated suite**

Run:

```bash
node --test tests/*.test.cjs
node --check report-model.js
node --check report-export.js
node --check report-xlsx.js
node --check report-print.js
node --check backup.js
node --check sw.js
git diff --check
```

Expected: all tests pass, all syntax checks exit 0, and `git diff --check` is silent.

- [ ] **Step 3: Verify inline script syntax**

Run the repository's existing `new Function()` extraction check against the final inline script in `index.html`.

Expected: `inline script syntax ok`.

- [ ] **Step 4: Perform browser QA with representative fixtures**

Use a local HTTP server and verify:

- active tile order and blank slots match home;
- archived disclosure is initially closed;
- 35 students render 5×7 and 40 render 5×8 with vertical numbering;
- zero-count and one-sided zero cards use the correct color/gray treatment;
- current term, all, and inclusive custom dates update counts and details;
- name/👍/✏ cells open the correct modal content;
- date/tag grouping, Escape, and fixed × work;
- selection mode supports one, multiple, all, and clear;
- print previews for individual/list are readable at A4 portrait;
- XLSX downloads with two sheet names and copied TSV pastes into columns;
- browser console has no error or warning introduced by the feature.

- [ ] **Step 5: Run a fresh whole-feature review**

Request a reviewer to compare the implementation against `docs/superpowers/specs/2026-10-13-report-mode-design.md`, with special attention to existing-data safety, old records, date boundaries, archived tiles, and output consistency. Fix any Critical or Important findings and rerun Step 2.

- [ ] **Step 6: Commit release integration**

```bash
git add index.html sw.js report-model.js report-export.js report-xlsx.js report-print.js tests
git commit -m "feat: redesign report mode"
```

- [ ] **Step 7: Publish only after user-approved execution completes**

Push `main` to the configured GitHub remote, wait for GitHub Pages to deploy, then verify the public cache-busted URL reports the new MITORI version and exposes the report flow without console errors.
