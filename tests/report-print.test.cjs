const test = require('node:test');
const assert = require('node:assert/strict');

const printer = require('../report-print.js');

function fixtureReport() {
  return {
    period: { label: '1学期' },
    students: [
      {
        key: 'current:1', no: 1, name: '山田 & <花子> "確認"', goodCount: 1, badCount: 1,
        records: [
          { date: '2026-05-01', type: 'good', observation: '発言', memo: '1行目\n2行目', lessonUnitName: '', lessonContent: '' },
          { date: '2026-05-02', type: 'bad', observation: '支援', memo: '', lessonUnitName: '', lessonContent: '' },
        ],
      },
      {
        key: 'current:2', no: 2, name: '非常に長い日本語の児童生徒名', goodCount: 0, badCount: 0, records: [],
      },
      { key: 'current:3', no: 3, name: '未選択', goodCount: 0, badCount: 0, records: [] },
    ],
  };
}

const context = { school: '○○小学校', className: '5-1', subject: '外国語', periodLabel: '1学期' };

test('individual print emits one A4 student section per selection and breaks between students', () => {
  const html = printer.buildPrintDocument({
    report: fixtureReport(), selectedKeys: ['current:1', 'current:2'], context, format: 'individual',
  });

  assert.match(html, /@page\{size:A4 portrait/);
  assert.equal((html.match(/<section class="reportPrintStudent/g) || []).length, 2);
  assert.equal((html.match(/reportPrintBreak/g) || []).length, 1);
  assert.match(html, /break-after:page/);
  assert.match(html, /山田 &amp; &lt;花子&gt; &quot;確認&quot;/);
  assert.match(html, /非常に長い日本語の児童生徒名/);
  assert.match(html, /1行目\n2行目/);
  assert.doesNotMatch(html, /単元名/);
  assert.doesNotMatch(html, /授業内容/);
  assert.doesNotMatch(html, /未入力/);
  assert.doesNotMatch(html, /出力する児童を選択/);
  assert.doesNotMatch(html, />未選択</);
});

test('list print keeps selected student reports continuous without forced breaks', () => {
  const html = printer.buildPrintDocument({
    report: fixtureReport(), selectedKeys: new Set(['current:1', 'current:2']), context, format: 'list',
  });

  assert.equal((html.match(/<section class="reportPrintStudent/g) || []).length, 2);
  assert.doesNotMatch(html, /class="reportPrintStudent reportPrintBreak"/);
});

test('print window is injectable and reports a blocked popup', () => {
  assert.throws(
    () => printer.openPrintWindow('<!doctype html>', { openWindow: () => null }),
    { message: '印刷画面を開けませんでした' },
  );

  const calls = [];
  const fakeWindow = {
    document: {
      open: () => calls.push('open'),
      write: value => calls.push(value),
      close: () => calls.push('close'),
    },
    focus: () => calls.push('focus'),
    print: () => calls.push('print'),
  };
  const result = printer.openPrintWindow('<!doctype html><title>test</title>', {
    openWindow: () => fakeWindow,
    schedule: callback => callback(),
  });

  assert.equal(result, fakeWindow);
  assert.deepEqual(calls, ['open', '<!doctype html><title>test</title>', 'close', 'focus', 'print']);
});
