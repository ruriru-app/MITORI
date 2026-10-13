const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(name) {
  const start = html.search(new RegExp(`function\\s+${name}\\s*\\(`));
  assert.notEqual(start, -1, `${name} must be defined in index.html`);
  const bodyStart = html.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < html.length; index += 1) {
    if (html[index] === '{') depth += 1;
    if (html[index] === '}') depth -= 1;
    if (depth === 0) return html.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

test('report mode provides separate tile and student screens backed by the report model', () => {
  [
    'reportTileScreen',
    'reportStudentScreen',
    'reportActiveTileGrid',
    'reportArchivedTileGrid',
    'reportShowArchivedBtn',
    'reportBackToTilesBtn',
    'reportStudentTitle',
  ].forEach(id => assert.match(html, new RegExp(`id="${id}"`), `${id} must exist`));
  assert.match(html, /<script src="report-model\.js"><\/script>/);
  assert.match(html, /MitoriReportModel\.reportTileLayout/);
  assert.doesNotMatch(html, /<h2>レポートモード<\/h2><div class="reportGrid"/);
});

test('report student screen exposes period, roster, output, and read-only detail controls', () => {
  [
    'reportPeriodAllBtn',
    'reportPeriodTermBtn',
    'reportPeriodCustomBtn',
    'reportTermSelect',
    'reportCustomStart',
    'reportCustomEnd',
    'reportPeriodError',
    'reportStudentGrid',
    'reportOutputToolbar',
    'reportDetailModal',
    'reportDetailCloseBtn',
    'reportGroupDateBtn',
    'reportGroupTagBtn',
    'reportDetailContent',
  ].forEach(id => assert.match(html, new RegExp(`id="${id}"`), `${id} must exist`));
  assert.match(html, /開始日・終了日を含みます/);
  const modal = html.match(/<div class="modalBack" id="reportDetailModal"[\s\S]*?<\/div><\/div>/)?.[0] || '';
  assert.doesNotMatch(modal, />\s*(編集|保存|削除)\s*</);
});

test('report output controls cover multi-selection, print, Excel, and spreadsheet copy', () => {
  [
    'reportSelectionModeBtn',
    'reportSelectAllBtn',
    'reportClearSelectionBtn',
    'reportExitSelectionBtn',
    'reportPrintBtn',
    'reportExcelBtn',
    'reportCopyBtn',
    'reportPrintIndividualBtn',
    'reportPrintListBtn',
    'reportCopySummaryBtn',
    'reportCopyDetailBtn',
  ].forEach(id => assert.match(html, new RegExp(`id="${id}"`), `${id} must exist`));
  assert.match(html, />個票形式</);
  assert.match(html, />一覧形式</);
  assert.match(html, />児童別まとめ</);
  assert.match(html, />記録一覧</);
  assert.match(html, /児童生徒の個人情報を含みます/);
});

test('report mode release is labeled MITORI v0.4.0', () => {
  assert.match(html, /<title>MITORI v0\.4\.0<\/title>/);
  assert.match(html, /const APP_VERSION='0\.4\.0'/);
  assert.match(html, /class="footerVersion">v0\.4\.0/);
});

test('invalid custom periods clear stale report data and disable exports', () => {
  const elements = {
    reportPeriodError: { textContent: '' },
    reportStudentGrid: { innerHTML: 'stale cards' },
    reportLegacyGrid: { innerHTML: 'stale legacy cards' },
    reportLegacySection: { hidden: false },
    reportRosterEmpty: { hidden: false },
  };
  const context = {
    reportModel: { recordCount: 1 },
    reportSelection: new Set(['current:1']),
    $: id => elements[id],
    renderReportSelectionControls: () => { context.controlsRendered = true; },
  };
  const invalidate = vm.runInNewContext(`(${extractFunction('invalidateReportPeriod')})`, context);

  invalidate('開始日は終了日以前にしてください');

  assert.equal(context.reportModel, null);
  assert.equal(context.reportSelection.size, 0);
  assert.equal(elements.reportStudentGrid.innerHTML, '');
  assert.equal(elements.reportLegacyGrid.innerHTML, '');
  assert.equal(elements.reportLegacySection.hidden, true);
  assert.equal(elements.reportPeriodError.textContent, '開始日は終了日以前にしてください');
  assert.equal(context.controlsRendered, true);
});

test('report tile grid preserves the six-column home layout at tablet widths', () => {
  assert.doesNotMatch(html, /@media\(max-width:1100px\)\{\.reportTileGrid\{grid-template-columns:repeat\(4/);
});

test('every report output route shows the personal-information notice before export', () => {
  const toolbar = html.match(/<div class="reportOutputToolbar"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/)?.[0] || '';
  assert.match(toolbar, /児童生徒の個人情報を含みます/);
  ['reportCopyBtn', 'reportExcelBtn', 'reportPrintBtn'].forEach(id => assert.match(toolbar, new RegExp(`id="${id}"`)));
});

test('report student screen includes a period-empty explanation', () => {
  assert.match(html, /id="reportPeriodEmpty"/);
  assert.match(html, /対象期間の見取り記録はありません。期間条件を確認してください。/);
});

test('explicit clear selection rerenders student card selection state', () => {
  assert.match(html, /reportClearSelectionBtn'\)\.onclick=\(\)=>\{clearReportSelection\(\);renderReportStudents\(\)\}/);
});
