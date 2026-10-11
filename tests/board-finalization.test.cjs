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

test('board confirmation finalizes every unique board lesson even when a prior lesson remains selected', () => {
  const date = '2026-10-06';
  const state = {
    date,
    currentClass: 'previously-opened',
    board: { [date]: { 1: 'math', 2: 'english', 3: 'math' } },
  };
  const classes = {
    math: { id: 'math', hours: 2 },
    english: { id: 'english', hours: 4 },
    'previously-opened': { id: 'previously-opened', hours: 8 },
  };
  const metas = {
    math: {},
    english: { confirmed: false, hourCounted: true },
    'previously-opened': {},
  };
  let saveCount = 0;
  let renderCount = 0;
  const context = {
    state,
    cls: id => classes[id] || null,
    getDayMeta: id => metas[id],
    save: () => { saveCount += 1; },
    render: () => { renderCount += 1; },
  };
  const finalizeBoardLessons = vm.runInNewContext(`(${extractFunction('finalizeBoardLessons')})`, context);

  finalizeBoardLessons();

  assert.deepEqual(metas.math, { confirmed: true, hourCounted: true });
  assert.deepEqual(metas.english, { confirmed: true, hourCounted: true });
  assert.deepEqual(metas['previously-opened'], {});
  assert.equal(classes.math.hours, 3, 'duplicate placement counts as one lesson');
  assert.equal(classes.english.hours, 4, 'an already-counted lesson is not counted twice');
  assert.equal(classes['previously-opened'].hours, 8, 'the previously opened lesson is not finalized');
  assert.equal(saveCount, 1);
  assert.equal(renderCount, 1);
});

test('reconfirming a date replaces previously counted lessons that are no longer on the board', () => {
  const date = '2026-10-08';
  const state = {
    date,
    board: { [date]: { 1: 'iwanaridai-5-1', 2: 'iwanaridai-3-2' } },
    classes: [
      { id: 'takamoridai-5-1', hours: 2 },
      { id: 'takamoridai-3-2', hours: 1 },
      { id: 'iwanaridai-5-1', hours: 1 },
      { id: 'iwanaridai-3-2', hours: 1 },
    ],
  };
  const classes = Object.fromEntries(state.classes.map(item => [item.id, item]));
  const classData = {
    'takamoridai-5-1': { dayMeta: { [date]: { confirmed: true, hourCounted: true, memo: '残すメモ' } } },
    'takamoridai-3-2': { dayMeta: { [date]: { confirmed: true, hourCounted: true } } },
    'iwanaridai-5-1': { dayMeta: { [date]: { confirmed: true, hourCounted: true } } },
    'iwanaridai-3-2': { dayMeta: { [date]: { confirmed: true, hourCounted: true } } },
  };
  const context = {
    state,
    cls: id => classes[id] || null,
    tileData: id => classData[id] || null,
    getDayMeta: id => classData[id].dayMeta[date],
    save: () => {},
    render: () => {},
  };
  const finalizeBoardLessons = vm.runInNewContext(`(${extractFunction('finalizeBoardLessons')})`, context);

  finalizeBoardLessons();

  assert.deepEqual(classData['takamoridai-5-1'].dayMeta[date], { memo: '残すメモ' });
  assert.deepEqual(classData['takamoridai-3-2'].dayMeta[date], {});
  assert.deepEqual(classData['iwanaridai-5-1'].dayMeta[date], { confirmed: true, hourCounted: true });
  assert.deepEqual(classData['iwanaridai-3-2'].dayMeta[date], { confirmed: true, hourCounted: true });
  assert.equal(classes['takamoridai-5-1'].hours, 1);
  assert.equal(classes['takamoridai-3-2'].hours, 0);
  assert.equal(classes['iwanaridai-5-1'].hours, 1, 'an already-counted replacement is not counted twice');
  assert.equal(classes['iwanaridai-3-2'].hours, 1, 'an already-counted replacement is not counted twice');
});

test('cancelling selected date confirmations includes lessons no longer on the board and preserves records', () => {
  const date = '2026-10-06';
  const state = {
    date,
    board: { [date]: { 1: 'wrong-school', 2: 'correct-school', 3: 'wrong-school' } },
    records: [{ date, classId: 'wrong-school', num: 4, tag: '発言' }],
  };
  const classes = {
    'wrong-school': { id: 'wrong-school', hours: 3 },
    'correct-school': { id: 'correct-school', hours: 5 },
    outside: { id: 'outside', hours: 7 },
  };
  const classData = {
    'wrong-school': { dayMeta: { [date]: { confirmed: true, hourCounted: true, memo: '残すメモ' } } },
    'correct-school': { dayMeta: { [date]: { confirmed: true, hourCounted: true } } },
    outside: { dayMeta: { [date]: { confirmed: true, hourCounted: true } } },
  };
  let saveCount = 0;
  let renderCount = 0;
  const context = {
    state,
    cls: id => classes[id] || null,
    tileData: id => classData[id] || null,
    save: () => { saveCount += 1; },
    render: () => { renderCount += 1; },
  };
  const cancelBoardLessonConfirmations = vm.runInNewContext(
    `(${extractFunction('cancelBoardLessonConfirmations')})`,
    context,
  );

  const cancelled = cancelBoardLessonConfirmations(['wrong-school', 'wrong-school', 'outside']);

  assert.equal(cancelled, 2);
  assert.deepEqual(classData['wrong-school'].dayMeta[date], { memo: '残すメモ' });
  assert.deepEqual(classData['correct-school'].dayMeta[date], { confirmed: true, hourCounted: true });
  assert.deepEqual(classData.outside.dayMeta[date], {});
  assert.equal(classes['wrong-school'].hours, 2, 'duplicate placement rolls back one counted lesson');
  assert.equal(classes['correct-school'].hours, 5);
  assert.equal(classes.outside.hours, 6, 'a previously confirmed lesson outside the board can be corrected');
  assert.deepEqual(state.records, [{ date, classId: 'wrong-school', num: 4, tag: '発言' }]);
  assert.equal(saveCount, 1);
  assert.equal(renderCount, 1);
});

test('the cancellation picker lists confirmed lessons even after they were replaced on the board', () => {
  const date = '2026-10-08';
  const state = {
    date,
    board: { [date]: { 1: 'correct-school' } },
    classes: [
      { id: 'wrong-school', name: '3-2 外国語' },
      { id: 'correct-school', name: '3-2 外国語' },
    ],
    records: [],
  };
  const classData = {
    'wrong-school': { dayMeta: { [date]: { confirmed: true, hourCounted: true } } },
    'correct-school': { dayMeta: { [date]: { confirmed: true, hourCounted: true } } },
  };
  const list = {
    children: [],
    innerHTML: '',
    appendChild(item) { this.children.push(item); },
    querySelector() { return null; },
  };
  const elements = {
    boardHoursCancelList: list,
    confirmBoardHoursCancelBtn: { disabled: false },
    boardHoursCancelDate: { textContent: '' },
    boardHoursCancelModal: { style: {} },
  };
  const context = {
    state,
    cls: id => state.classes.find(item => item.id === id) || null,
    tileData: id => classData[id] || null,
    tileSchoolName: tile => tile.id === 'wrong-school' ? '高森台小学校' : '岩成台西小学校',
    formatHeaderDate: value => value,
    escapeOptionText: value => String(value),
    alert: () => assert.fail('the picker must not report an empty date'),
    $: id => elements[id],
    document: {
      createElement: () => ({
        className: '',
        innerHTML: '',
        querySelector: () => ({ onchange: null }),
      }),
    },
  };
  const openBoardHoursCancelModal = vm.runInNewContext(
    `(${extractFunction('openBoardHoursCancelModal')})`,
    context,
  );

  openBoardHoursCancelModal();

  assert.equal(list.children.length, 2);
  assert.match(list.children[0].innerHTML + list.children[1].innerHTML, /高森台小学校/);
  assert.match(list.children[0].innerHTML + list.children[1].innerHTML, /現在のボード外/);
  assert.equal(elements.boardHoursCancelModal.style.display, 'flex');
});
