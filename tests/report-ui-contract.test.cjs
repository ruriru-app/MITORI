const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

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
