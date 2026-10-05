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
