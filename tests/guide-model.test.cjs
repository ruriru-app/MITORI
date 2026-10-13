const test = require('node:test');
const assert = require('node:assert/strict');
const Content = require('../guide-content.js');
const Model = require('../guide-model.js');
const guide = Content.getGuide('initial-setup');

test('initial guide connects five intro pages to nine correct destinations', () => {
  assert.equal(guide.intro.length, 5);
  assert.match(guide.intro[1].title, /端末/);
  assert.deepEqual(guide.steps.map(x => x.id),
    ['grade','subject','class','roster','lesson_tile','timetable','term_calendar','apply_start','lesson_board']);
  assert.deepEqual(guide.steps.map(x => x.jumpLabel),
    ['学年設定へ ↗','教科設定へ ↗','クラス設定へ ↗','名簿登録へ ↗','授業タイル作成へ ↗','時間割設定へ ↗','学期・休業日設定へ ↗','時間割設定へ ↗','ホームへ ↗']);
  assert.deepEqual(guide.steps[3].target, {kind:'roster'});
  assert.deepEqual(guide.steps[7].target, {kind:'settings',pane:'timetable',focus:'timetableApplyStartInput'});
  assert.deepEqual(guide.steps[8].target, {kind:'board'});
  assert.equal(Content.getGuide('missing'), null);
});

test('manual check closes only its own explanation and opens next', () => {
  const initial = Model.createTodoSession(guide, {});
  assert.deepEqual(initial.expandedIds, ['grade']);
  const manual = Model.setStepExpanded(guide, initial, 'class', true);
  const checked = Model.setStepChecked(guide, manual, 'grade', true);
  assert.equal(initial.checks.grade, false);
  assert.equal(checked.checks.grade, true);
  assert.equal(checked.lastCompletedId, 'grade');
  assert.deepEqual(checked.expandedIds, ['class','subject']);
});

test('later completed steps are skipped and the search wraps', () => {
  let s = Model.createTodoSession(guide, {subject:true});
  s = Model.setStepChecked(guide, s, 'grade', true);
  assert.ok(s.expandedIds.includes('class'));
  s = Model.setStepChecked(guide, s, 'lesson_board', true);
  assert.equal(s.lastCompletedId, 'lesson_board');
  assert.ok(s.expandedIds.includes('class'));
});

test('undo opens unchecked step without clearing other manual expansions', () => {
  let s = Model.createTodoSession(guide, {grade:true});
  s = Model.setStepExpanded(guide, s, 'class', true);
  s = Model.setStepChecked(guide, s, 'grade', false);
  assert.deepEqual(s.expandedIds, ['subject','class','grade']);
  assert.equal(s.lastCompletedId, null);
  assert.equal(Model.countCompleted(guide, s.checks), 0);
});

test('all complete remembers actual last click not final step number', () => {
  let s = Model.createTodoSession(guide, {});
  for (const step of guide.steps.slice().reverse()) s = Model.setStepChecked(guide, s, step.id, true);
  assert.equal(Model.countCompleted(guide, s.checks), 9);
  assert.equal(s.lastCompletedId, 'grade');
  assert.deepEqual(s.expandedIds, []);
  assert.deepEqual(Model.createTodoSession(guide,s.checks).expandedIds, []);
});

test('unknown ids cannot add completion and saved values must be boolean true', () => {
  const s = Model.createTodoSession(guide, {grade:'true',other:true});
  assert.equal(Model.countCompleted(guide,s.checks),0);
  assert.deepEqual(Model.setStepChecked(guide,s,'other',true),s);
  assert.deepEqual(Model.setStepExpanded(guide,s,'other',true),s);
});
