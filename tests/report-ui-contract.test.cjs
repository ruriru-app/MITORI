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
