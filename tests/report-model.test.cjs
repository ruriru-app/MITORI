const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../report-model.js');

test('default period chooses the latest-starting configured term containing the anchor date', () => {
  const settings = {
    system: 'semester',
    trimester: [],
    semester: [
      { id: 'first', name: '前期', start: '2026-04-01', end: '2026-09-30' },
      { id: 'second', name: '後期', start: '2026-09-01', end: '2027-03-31' },
    ],
  };

  assert.deepEqual(model.resolveDefaultPeriod(settings, '2026-09-15'), {
    mode: 'term',
    label: '後期',
    start: '2026-09-01',
    end: '2027-03-31',
    termId: 'second',
  });
});

test('custom ranges include both boundary dates and reject a reversed range', () => {
  assert.deepEqual(model.resolvePeriod({}, {
    mode: 'custom',
    start: '2026-05-01',
    end: '2026-05-31',
  }, '2026-05-10'), {
    mode: 'custom',
    label: '2026/05/01～2026/05/31',
    start: '2026-05-01',
    end: '2026-05-31',
    termId: '',
  });

  assert.throws(
    () => model.resolvePeriod({}, {
      mode: 'custom',
      start: '2026-05-31',
      end: '2026-05-01',
    }, '2026-05-10'),
    { message: '開始日は終了日以前の日付にしてください' },
  );
});

test('tile layout preserves active gaps and gives archived tiles a fallback label', () => {
  const classes = [{ id: 'a' }, { id: 'b' }];
  const archived = [
    { tile: { id: 'old-a', name: '保管した外国語' } },
    { tile: { id: 'old-b', name: '' } },
  ];

  const result = model.reportTileLayout(classes, archived, ['a', null, 'b']);

  assert.deepEqual(result.activeSlots, ['a', null, 'b']);
  assert.equal(result.archivedTiles[0].label, '保管した外国語');
  assert.equal(result.archivedTiles[1].label, '保管済み授業');
});

test('report positions current roster vertically in seven columns through 35 and an eighth through 40', () => {
  const roster35 = Object.fromEntries(Array.from({ length: 35 }, (_, index) => [
    String(index + 1),
    { kanji: `児童${index + 1}`, kana: `じどう${index + 1}` },
  ]));
  const report = model.buildReport({
    tile: { id: 'tile-a' },
    context: {},
    roster: roster35,
    records: [],
    period: { mode: 'all', start: null, end: null, label: '全期間', termId: '' },
    nameDisplay: 'kanji',
  });

  assert.deepEqual(
    report.students.filter(student => [1, 5, 6, 35].includes(student.no)).map(student => [student.no, student.row, student.column]),
    [[1, 1, 1], [5, 5, 1], [6, 1, 2], [35, 5, 7]],
  );
  assert.equal(report.columns, 7);

  const roster40 = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [
    String(index + 1),
    { kanji: `児童${index + 1}` },
  ]));
  const report40 = model.buildReport({
    tile: { id: 'tile-a' }, context: {}, roster: roster40, records: [],
    period: { mode: 'all', start: null, end: null, label: '全期間', termId: '' },
  });
  assert.equal(report40.students.at(-1).column, 8);
  assert.equal(report40.columns, 8);
});

test('report keeps empty rosters safe and includes both custom-date boundaries', () => {
  const report = model.buildReport({
    tile: { id: 'tile-a' },
    context: {},
    roster: {},
    records: [
      { classId: 'tile-a', num: 4, date: '2026-05-01', type: 'good', tag: '開始日' },
      { classId: 'tile-a', num: 4, date: '2026-05-31', type: 'bad', tags: ['終了日'] },
      { classId: 'tile-a', num: 4, date: '2026-06-01', type: 'good', tag: '対象外' },
    ],
    period: { mode: 'custom', start: '2026-05-01', end: '2026-05-31', label: '5月', termId: '' },
  });

  assert.equal(report.students.length, 1);
  assert.equal(report.students[0].name, '4番（名簿外）');
  assert.deepEqual(report.students[0].records.map(record => record.observation), ['終了日', '開始日']);
});

test('student record filters return the requested observation kind newest first', () => {
  const report = model.buildReport({
    tile: { id: 'tile-a' },
    context: {},
    roster: { 1: { kanji: '山田花子' } },
    period: { mode: 'all', start: null, end: null, label: '全期間', termId: '' },
    records: [
      { classId: 'tile-a', num: 1, date: '2026-04-01', type: 'good', tag: '発言' },
      { classId: 'tile-a', num: 1, date: '2026-04-03', type: 'bad', tag: '支援' },
      { classId: 'tile-a', num: 1, date: '2026-04-02', type: 'good', tag: '発言' },
    ],
  });

  assert.deepEqual(
    model.recordsForStudent(report, 'current:1', 'all').map(record => [record.date, record.type]),
    [['2026-04-03', 'bad'], ['2026-04-02', 'good'], ['2026-04-01', 'good']],
  );
  assert.deepEqual(
    model.recordsForStudent(report, 'current:1', 'good').map(record => record.date),
    ['2026-04-02', '2026-04-01'],
  );
  assert.deepEqual(
    model.recordsForStudent(report, 'current:1', 'bad').map(record => record.date),
    ['2026-04-03'],
  );
});

test('observation grouping combines identical labels and keeps each group newest first', () => {
  const records = [
    { date: '2026-04-01', time: '09:00', observation: '発言' },
    { date: '2026-04-03', time: '10:00', observation: '発言' },
    { date: '2026-04-02', time: '11:00', observation: '協働' },
  ];

  const groups = model.groupStudentRecords(records, 'tag');

  assert.deepEqual(groups.map(group => group.label), ['発言', '協働']);
  assert.deepEqual(groups[0].records.map(record => record.date), ['2026-04-03', '2026-04-01']);
});

test('a record-time name that differs from the current roster remains a separate legacy student', () => {
  const report = model.buildReport({
    tile: { id: 'tile-a' },
    context: {},
    roster: { 1: { kanji: '山田花子', kana: 'やまだはなこ' } },
    period: { mode: 'all', start: null, end: null, label: '全期間', termId: '' },
    records: [
      { classId: 'tile-a', num: 1, date: '2026-04-01', type: 'good', tag: '現名簿', studentName: '山田花子' },
      { classId: 'tile-a', num: 1, date: '2025-04-01', type: 'good', tag: '旧名簿', studentName: '鈴木花子' },
      { classId: 'tile-a', num: 1, date: '2024-04-01', type: 'bad', tag: '氏名控えなし' },
    ],
  });

  assert.equal(report.students.length, 2);
  assert.deepEqual(report.students.map(student => [student.name, student.legacy, student.records.length]), [
    ['山田花子', false, 2],
    ['鈴木花子', true, 1],
  ]);
});

test('record-time name snapshot reads kanji and kana from the shared roster', () => {
  assert.deepEqual(model.rosterNameSnapshot({
    3: { kanji: '佐藤太郎', kana: 'さとうたろう' },
  }, 3), {
    studentName: '佐藤太郎',
    studentNameKana: 'さとうたろう',
  });
  assert.deepEqual(model.rosterNameSnapshot({}, 9), {
    studentName: '',
    studentNameKana: '',
  });
});
