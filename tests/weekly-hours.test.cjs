const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const extract = require('./helpers/extract-function.cjs');

function element() {
  return {
    children: [], dataset: {}, textContent: '',
    set innerHTML(value) { this.children = []; },
    appendChild(child) { this.children.push(child); },
    append(...children) { this.children.push(...children); },
  };
}

test('weekly plan and print count confirmed lessons only through the selected week and within the term', () => {
  const state = {
    weeklyPlan: { selectedWeek: '2026-10-05' },
    termSettings: { system: 'trimester', trimester: [{name: '2学期', start: '2026-10-07', end: '2026-10-16'}] },
  };
  const groups = [
    {key: 'math', classKey: 'a', school: 'サンプル小学校', tileIds: ['math']},
    {key: 'english', classKey: 'b', school: 'サンプル小学校', tileIds: ['english']},
  ];
  const confirmed = {confirmed: true};
  const counted = {hourCounted: true};
  const dates = {
    math: {'2026-10-05': confirmed, '2026-10-07': counted, '2026-10-11': confirmed, '2026-10-12': confirmed, '2026-10-17': confirmed},
    english: {'2026-10-08': {confirmed: false}, '2026-10-09': confirmed, '2026-10-16': confirmed},
  };
  const summary = element();
  const rows = () => summary.children[0].children[0].children[0].children[1].children
    .map(row => row.children.map(cell => cell.textContent));
  let printedRows;
  const context = vm.createContext({
    state, $: () => summary, weeklyTeachingGroups: () => groups,
    tileData: id => ({dayMeta: dates[id]}),
    document: { createElement: element, body: {classList: {add() {}, remove() {}}} },
    window: {matchMedia: () => ({}), addEventListener() {}, print() { printedRows = rows(); }},
    requestAnimationFrame: callback => callback(),
  });
  for (const name of ['dateAtNoon', 'mondayStart', 'dateKeyLocal', 'dateInsideRange', 'weeklyCurrentTerm',
    'weeklySchoolNameParts', 'weeklyHoursBands', 'countConfirmedLessons', 'renderWeeklyHoursSummary', 'printWeeklyPlan']) {
    vm.runInContext(extract(name), context);
  }

  context.renderWeeklyHoursSummary();
  assert.deepEqual(rows(), [['今週', '3', '1', '4'], ['2学期', '2', '1', '3']]);
  context.printWeeklyPlan();
  assert.deepEqual(printedRows, [['今週', '3', '1', '4'], ['2学期', '2', '1', '3']]);

  state.weeklyPlan.selectedWeek = '2026-10-12';
  context.renderWeeklyHoursSummary();
  assert.deepEqual(rows(), [['今週', '2', '1', '3'], ['2学期', '3', '2', '5']]);

  state.weeklyPlan.selectedWeek = '2026-10-19';
  context.renderWeeklyHoursSummary();
  assert.deepEqual(rows(), [['今週', '0', '0', '0'], ['学期', '0', '0', '0']]);
});
