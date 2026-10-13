const test = require('node:test');
const assert = require('node:assert/strict');

const exporter = require('../report-export.js');
const xlsx = require('../report-xlsx.js');

function fixtureReport() {
  return {
    students: [
      {
        key: 'current:1', no: 1, name: '山田花子', goodCount: 1, badCount: 1,
        records: [
          { date: '2026-05-02', type: 'bad', observation: '支援', memo: '1行目\n2行目', lessonUnitName: '', lessonContent: '' },
          { date: '2026-05-01', type: 'good', observation: '発言', memo: 'A\tB "確認"', lessonUnitName: 'Unit 1', lessonContent: '紹介する' },
        ],
      },
      {
        key: 'current:2', no: 2, name: '佐藤太郎', goodCount: 0, badCount: 0, records: [],
      },
    ],
  };
}

const context = {
  school: '○○小学校', className: '5-1', subject: '外国語', periodLabel: '1学期',
};

test('export tables include exact headers and only selected students', () => {
  const report = fixtureReport();
  const summary = exporter.buildSummaryTable(report, ['current:1'], context);
  const detail = exporter.buildDetailTable(report, new Set(['current:1']), context);

  assert.deepEqual(summary[0], ['学校', 'クラス', '教科', '番号', '氏名', '👍件数', '✏件数', '👍内容まとめ', '✏内容まとめ']);
  assert.deepEqual(detail[0], ['学校', 'クラス', '教科', '日付', '番号', '氏名', '👍/✏', '見取り内容', '単元名', '授業内容', 'メモ']);
  assert.equal(summary.length, 2);
  assert.equal(summary[1][4], '山田花子');
  assert.match(summary[1][7], /2026-05-01 👍 発言/);
  assert.equal(detail.length, 3);
  assert.deepEqual(detail.slice(1).map(row => row[3]), ['2026-05-01', '2026-05-02']);
  assert.deepEqual(detail[2].slice(8, 10), ['', '']);
  assert.equal(detail.flat().includes('未入力'), false);
});

test('TSV serialization keeps multiline, tab, and quote content inside one quoted cell', () => {
  const table = [
    ['氏名', 'メモ'],
    ['山田花子', '1行目\n2行目\t"確認"'],
  ];

  const tsv = exporter.tableToTsv(table);

  assert.equal(tsv, '氏名\tメモ\n山田花子\t"1行目\n2行目 ""確認"""');
});

test('copying a table uses an injectable clipboard and reports unavailable clipboard access', async () => {
  const writes = [];
  const result = await exporter.copyTable([['氏名'], ['山田花子']], {
    writeText: async value => writes.push(value),
  });

  assert.equal(result, '氏名\n山田花子');
  assert.deepEqual(writes, ['氏名\n山田花子']);
  await assert.rejects(() => exporter.copyTable([['氏名']], { writeText: null }), {
    message: 'この端末ではコピーできません',
  });
  await assert.rejects(() => exporter.copyTable([['氏名']], {
    writeText: async () => { throw new Error('denied'); },
  }), { message: 'コピーできませんでした' });
});

test('export builders do not mutate the report or selected keys', () => {
  const report = fixtureReport();
  const selected = ['current:1', 'current:2'];
  const before = JSON.stringify({ report, selected });

  exporter.buildSummaryTable(report, selected, context);
  exporter.buildDetailTable(report, selected, context);

  assert.equal(JSON.stringify({ report, selected }), before);
});

function storedZipEntries(bytes) {
  const entries = new Map();
  let offset = 0;
  const decoder = new TextDecoder();
  while (offset + 30 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    if (view.getUint32(0, true) !== 0x04034b50) break;
    const size = view.getUint32(18, true);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    entries.set(name, decoder.decode(bytes.slice(dataStart, dataStart + size)));
    offset = dataStart + size;
  }
  return entries;
}

test('workbook is a two-sheet XLSX with escaped values, frozen headers, and filters', () => {
  const workbook = xlsx.createWorkbook({
    summaryTable: [['氏名', '内容'], ['山田花子', 'A&B <確認>']],
    detailTable: [['日付', 'メモ'], ['2026-05-01', '1行目\n2行目']],
  });

  assert.ok(workbook instanceof Uint8Array);
  assert.deepEqual(Array.from(workbook.slice(0, 2)), [0x50, 0x4b]);
  const entries = storedZipEntries(workbook);
  assert.match(entries.get('xl/workbook.xml'), /name="児童別まとめ"/);
  assert.match(entries.get('xl/workbook.xml'), /name="記録一覧"/);
  assert.match(entries.get('xl/worksheets/sheet1.xml'), /A&amp;B &lt;確認&gt;/);
  assert.match(entries.get('xl/worksheets/sheet1.xml'), /state="frozen"/);
  assert.match(entries.get('xl/worksheets/sheet1.xml'), /<autoFilter /);
});

test('workbook filename removes Windows-forbidden characters', () => {
  const name = xlsx.filename({
    school: '○○小学校', className: '5/1:算数?', subject: 'A*B',
  }, new Date(2026, 4, 3, 4, 5));

  assert.equal(/[<>:"/\\|?*]/.test(name), false);
  assert.match(name, /^MITORI-○○小学校-5_1_算数_-A_B-20260503-0405\.xlsx$/);
});

test('workbook download reports unavailable browser adapters', () => {
  assert.throws(() => xlsx.download({ summaryTable: [], detailTable: [] }, {
    documentRef: {}, urlApi: {}, BlobCtor: null,
  }), { message: 'この端末ではExcelを保存できません' });
});
