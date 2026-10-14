const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const extract = require('./helpers/extract-function.cjs');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

function node(tagName = 'div') {
  return {
    tagName, children: [], style: {}, dataset: {}, attributes: {}, value: '', markup: '',
    get innerHTML() { return this.markup; },
    set innerHTML(value) { this.markup = value; this.children = []; },
    classList: { toggle() {}, add() {}, remove() {} },
    appendChild(child) { this.children.push(child); },
    append(...children) { this.children.push(...children); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
  };
}

function host(state, overrides = {}) {
  const nodes = Object.fromEntries(['gradeSettingsList','gradePresetGrid','elementaryGradePresetGrid',
    'juniorGradePresetGrid','lessonListGradeFilter','performanceGradeFilter','performanceTestGradeInput',
    'classLessonListInput','timetableGrid','timetableClassPalette','timetableSelectionHint',
    'newGradeNameInput','newElementaryGradeNameInput','newJuniorGradeNameInput',
    'elementaryGradeCustomList','juniorGradeCustomList'].map(id => [id, node()]));
  const context = { state, document: { createElement: node }, $: id => nodes[id] || null,
    save() {}, refreshGradeDependentViews() {}, alert() {}, escapeOptionText: String,
    lessonListGradeFilterId: 'all', performanceGradeFilterId: 'all', selectedTimetableClassId: null,
    TIMETABLE_DAYS: [{ key: 'mon', label: '月' }], classSlotCount: () => state.classLayout?.length || 0,
    tileSchoolLabel: tile => state.sharedClasses?.find(item => item.id === tile.sharedClassId)?.school || '',
    classLessonList: () => null,
    subjectName: id => state.subjects?.find(item => item.id === id)?.name || '教科未設定',
    ...overrides };
  const functions = ['gradePresetOptions','setCatalogPresetActive','gradePresetFor','findGradePresetItem',
    'setGradePresetActive','gradeSchoolStage','gradeCatalogLabel','customGrades','toggleGradePreset','grade','gradeName',
    'addGrade','saveGradeName','moveGrade','reorderById','reorderGrade','renderGradeRows',
    'availableCatalogItems','availableGrades','fillGradeSelect','renderGradeSettings','renderLessonListGradeFilter',
    'renderPerformanceGradeFilter','fillPerformanceGradeSelect','lessonListMatchesGradeFilter',
    'lessonListMatchesSubjectFilter','appendLessonListGroup','renderClassLessonListOptions','lessonList',
    'getChecklistMitoriState','syncTileDerivedFields','tileSharedClass','sharedClass','cls','subject',
    'timetableSlot','renderTimetableSettings'];
  vm.createContext(context);
  vm.runInContext(functions.filter(name => new RegExp('function\\s+' + name + '\\s*\\(').test(html))
    .map(name => extract(name)).join('\n'), context);
  return { context, nodes };
}

test('selecting elementary and junior first year creates independent grades and toggle states', () => {
  const state = { grades: [], sharedClasses: [], lessonLists: [], performanceTests: [] };
  const { context } = host(state);
  context.toggleGradePreset('grade_primary_1', true);
  context.toggleGradePreset('grade_junior_1', true);
  assert.deepEqual(state.grades.map(item => item.id), ['grade_primary_1','grade_junior_1']);
  context.toggleGradePreset('grade_junior_1', false);
  assert.equal(state.grades[0].active, true);
  assert.equal(state.grades[1].active, false);
  context.toggleGradePreset('grade_junior_1', true);
  assert.equal(state.grades.length, 2);
  assert.equal(state.grades[1].active, true);
});

test('an unclassified legacy same-name grade is never adopted or rewritten by a preset', () => {
  const state = { grades: [{ id: 'legacy-one', name: '1年生', active: true }],
    sharedClasses: [{ id: 'legacy-class', gradeId: 'legacy-one' }],
    lessonLists: [{ id: 'legacy-list', gradeId: 'legacy-one' }],
    performanceTests: [{ id: 'legacy-test', gradeId: 'legacy-one' }] };
  const original = JSON.stringify(state);
  const { context } = host(state);
  context.toggleGradePreset('grade_primary_1', true);
  context.toggleGradePreset('grade_junior_1', true);
  assert.deepEqual(state.grades.map(item => item.id), ['legacy-one','grade_primary_1','grade_junior_1']);
  const preserved = { ...state, grades: [state.grades[0]] };
  assert.equal(JSON.stringify(preserved), original);
});

test('conflicting optional metadata cannot adopt a known elementary id as a junior preset', () => {
  const state = { grades: [{ id: 'grade_primary_1', name: '1年生', stage: 'junior' }],
    sharedClasses: [], lessonLists: [], performanceTests: [] };
  const { context } = host(state);
  context.toggleGradePreset('grade_junior_1', true);
  assert.deepEqual(state.grades.map(item => item.id), ['grade_primary_1','grade_junior_1']);
  assert.equal(context.gradeName('grade_primary_1'), '小学1年生');
});

test('a known preset id takes precedence over conflicting imported preset metadata', () => {
  const state = { grades: [{ id: 'grade_junior_1', name: '1年生', presetId: 'grade_primary_1' }] };
  const { context } = host(state);
  assert.equal(context.gradeName('grade_junior_1'), '中学1年生');
});

test('known saved preset ids keep their references when unchecked and selected again', () => {
  const state = { grades: [{ id: 'grade_primary_1', name: '1年生', active: true }],
    sharedClasses: [{ gradeId: 'grade_primary_1' }], lessonLists: [{ gradeId: 'grade_primary_1' }],
    performanceTests: [{ gradeId: 'grade_primary_1' }] };
  const { context } = host(state);
  context.toggleGradePreset('grade_primary_1', false);
  context.toggleGradePreset('grade_primary_1', true);
  assert.equal(state.grades.length, 1);
  assert.equal(state.grades[0].name, '1年生');
  assert.equal(context.gradeName('grade_primary_1'), '小学1年生');
  for (const group of [state.sharedClasses,state.lessonLists,state.performanceTests]) {
    assert.equal(group[0].gradeId, 'grade_primary_1');
  }
});

test('grade settings render six elementary and three junior choices independently', () => {
  const state = { grades: [{ id: 'grade_primary_1', name: '1年生', active: true },
    { id: 'legacy-one', name: '1年生', active: true }], performanceTests: [] };
  const { context, nodes } = host(state);
  const before = JSON.stringify(state);
  context.renderGradeSettings();
  assert.equal(nodes.elementaryGradePresetGrid.children.length, 6);
  assert.equal(nodes.juniorGradePresetGrid.children.length, 3);
  assert.equal(nodes.elementaryGradePresetGrid.children[0].children[0].checked, true);
  assert.equal(nodes.juniorGradePresetGrid.children[0].children[0].checked, false);
  assert.equal(nodes.gradeSettingsList.children.length, 1);
  assert.equal(nodes.gradeSettingsList.children[0].dataset.id, 'legacy-one');
  assert.equal(JSON.stringify(state), before);
});

test('class and unit selectors distinguish both first years and preserve an inactive selected grade', () => {
  const state = { grades: [{ id: 'grade_primary_1', name: '1年生', active: true },
    { id: 'grade_junior_1', name: '1年生', active: false },
    { id: 'legacy-one', name: '1年生', active: true }] };
  const { context } = host(state);
  const select = node('select'), before = JSON.stringify(state);
  context.fillGradeSelect(select, 'grade_junior_1');
  assert.match(select.innerHTML, /value="grade_primary_1">小学1年生</);
  assert.match(select.innerHTML, /value="grade_junior_1">中学1年生</);
  assert.match(select.innerHTML, /value="legacy-one">1年生（既存・その他）</);
  assert.equal(select.value, 'grade_junior_1');
  assert.equal(JSON.stringify(state), before);
});

test('unit and performance grade filters show school-qualified names', () => {
  const state = { grades: [{ id: 'grade_primary_1', name: '1年生', active: true },
    { id: 'grade_junior_1', name: '1年生', active: true }], performanceTests: [] };
  const { context, nodes } = host(state);
  context.renderLessonListGradeFilter();
  context.renderPerformanceGradeFilter();
  context.fillPerformanceGradeSelect('grade_junior_1');
  for (const id of ['lessonListGradeFilter','performanceGradeFilter']) {
    assert.deepEqual(nodes[id].children.map(child => child.textContent).slice(1,3), ['小学1年生','中学1年生']);
  }
  assert.deepEqual(nodes.performanceTestGradeInput.children.map(child => child.textContent).slice(1), ['小学1年生','中学1年生']);
  assert.equal(nodes.performanceTestGradeInput.value, 'grade_junior_1');
});

test('unit priority and filters compare grade and subject ids, not identical first-year names', () => {
  const state = { grades: [{ id: 'grade_primary_1', name: '1年生', active: true },
    { id: 'grade_junior_1', name: '1年生', active: true }],
    subjects: [{ id: 'subject_elementary_1', name: '国語' }, { id: 'subject_junior_1', name: '国語' }],
    lessonLists: [{ id: 'primary-unit', name: '国語単元', gradeId: 'grade_primary_1', subjectId: 'subject_elementary_1' },
      { id: 'junior-unit', name: '国語単元', gradeId: 'grade_junior_1', subjectId: 'subject_junior_1' }] };
  const { context, nodes } = host(state, { lessonListGradeFilterId: 'grade_junior_1', lessonListSubjectFilterId: 'subject_junior_1' });
  const matches = state.lessonLists.filter(context.lessonListMatchesGradeFilter).filter(context.lessonListMatchesSubjectFilter);
  assert.deepEqual(matches.map(item => item.id), ['junior-unit']);
  context.renderClassLessonListOptions('junior-unit','grade_junior_1','subject_junior_1');
  const preferred = nodes.classLessonListInput.children[0];
  assert.equal(preferred.label, '同じ学年・教科（優先）');
  assert.deepEqual(preferred.children.map(item => item.value), ['junior-unit']);
  assert.match(preferred.children[0].textContent, /中学1年生/);
});

test('checklist receives qualified labels without mutating MITORI grades or relationships', () => {
  const state = { grades: [{ id: 'grade_primary_1', name: '1年生' }, { id: 'grade_junior_1', name: '1年生' },
    { id: 'legacy-one', name: '1年生' }], sharedClasses: [{ id: 'class-one', gradeId: 'grade_junior_1' }],
    sharedClassData: {}, classes: [], timetable: {}, board: {} };
  const { context } = host(state);
  assert.equal(typeof context.getChecklistMitoriState, 'function');
  const before = JSON.stringify(state), view = context.getChecklistMitoriState();
  const synced = require('../checklist/bridge.js').syncCatalog({}, view, '2026-10-14T00:00:00Z');
  assert.deepEqual(synced.catalog.grades.map(item => item.name), ['小学1年生','中学1年生','1年生（既存・その他）']);
  assert.equal(synced.catalog.classes[0].gradeId, 'grade_junior_1');
  assert.equal(JSON.stringify(state), before);
});

test('school-qualified grade labels do not add school stages to lesson tile names', () => {
  const state = { grades: [{ id: 'grade_primary_1', name: '1年生' }, { id: 'grade_junior_1', name: '1年生' }],
    sharedClasses: [{ id: 'primary-class', school: '確認用小学校', name: '1年1組', gradeId: 'grade_primary_1', count: 35 },
      { id: 'junior-class', school: '確認用中学校', name: '1年1組', gradeId: 'grade_junior_1', count: 35 }],
    subjects: [{ id: 'subject_elementary_1', name: '国語' }, { id: 'subject_junior_1', name: '国語' }],
    classes: [{ id: 'tile-primary', sharedClassId: 'primary-class', subjectId: 'subject_elementary_1' },
      { id: 'tile-junior', sharedClassId: 'junior-class', subjectId: 'subject_junior_1' }] };
  const { context } = host(state);
  state.classes.forEach(context.syncTileDerivedFields);
  assert.deepEqual(state.classes.map(item => item.name), ['1年1組 国語','1年1組 国語']);
  assert.deepEqual(state.classes.map(item => item.gradeId), ['grade_primary_1','grade_junior_1']);
  assert.deepEqual(state.sharedClasses.map(item => item.school), ['確認用小学校','確認用中学校']);
});

test('placed timetable tiles and palette keep their original in-tile grade text', () => {
  const state = { grades: [{ id: 'grade_primary_1', name: '1年生' }, { id: 'grade_junior_1', name: '1年生' }],
    sharedClasses: [{ id: 'primary-class', school: '確認用小学校' }, { id: 'junior-class', school: '確認用中学校' }],
    classes: [{ id: 'primary-tile', name: '1年1組 国語', gradeId: 'grade_primary_1', sharedClassId: 'primary-class', count: 35 },
      { id: 'junior-tile', name: '1年1組 国語', gradeId: 'grade_junior_1', sharedClassId: 'junior-class', count: 35 }],
    timetable: { mon: { 1: 'primary-tile', 2: 'junior-tile' } }, classLayout: ['primary-tile','junior-tile'] };
  const { context, nodes } = host(state);
  context.renderTimetableSettings();
  const descendants = parent => parent.children.flatMap(child => [child,...descendants(child)]);
  for (const id of ['timetableGrid','timetableClassPalette']) {
    const rendered = descendants(nodes[id]);
    const gradeText = rendered.filter(item => /Meta$/.test(item.className || '') && /人$/.test(item.textContent || ''));
    assert.deepEqual(gradeText.map(item => item.textContent), ['1年生・35人','1年生・35人']);
    assert.deepEqual(rendered.filter(item => /School$/.test(item.className || '')).map(item => item.textContent),
      ['確認用小学校','確認用中学校']);
  }
});

test('both school add controls create scoped grades with different ids even at the same timestamp', () => {
  const state = { grades: [] }, FixedDate = class extends Date { static now() { return 42; } };
  const { context, nodes } = host(state, { Date: FixedDate });
  nodes.newElementaryGradeNameInput.value = '特別支援学級';
  nodes.newJuniorGradeNameInput.value = '特別支援学級';
  context.addGrade('elementary');
  assert.equal(nodes.newElementaryGradeNameInput.value, '');
  assert.equal(nodes.newJuniorGradeNameInput.value, '特別支援学級');
  context.addGrade('junior');
  assert.deepEqual(state.grades.map(item => [item.name,item.stage,item.active]),
    [['特別支援学級','elementary',true],['特別支援学級','junior',true]]);
  assert.notEqual(state.grades[0].id, state.grades[1].id);
  assert.equal(context.gradeName(state.grades[0].id), '特別支援学級（小学校）');
  assert.equal(context.gradeName(state.grades[1].id), '特別支援学級（中学校）');
});

test('duplicate add is blocked only in its own school category without clearing the draft', () => {
  const state = { grades: [{ id: 'saved', name: '特別支援学級', stage: 'elementary', active: true }] };
  const messages = [], { context, nodes } = host(state, { alert: message => messages.push(message) });
  nodes.newElementaryGradeNameInput.value = '特別支援学級';
  context.addGrade('elementary');
  assert.equal(state.grades.length, 1);
  assert.equal(nodes.newElementaryGradeNameInput.value, '特別支援学級');
  assert.equal(messages.length, 1);
  nodes.newJuniorGradeNameInput.value = '特別支援学級';
  context.addGrade('junior');
  assert.equal(state.grades.length, 2);
});

test('adding a standard grade selects its existing preset rather than making a duplicate', () => {
  const state = { grades: [{ id: 'grade_junior_1', name: '1年生', active: false }] };
  const { context, nodes } = host(state);
  nodes.newJuniorGradeNameInput.value = '1年生';
  context.addGrade('junior');
  assert.equal(state.grades.length, 1);
  assert.equal(state.grades[0].id, 'grade_junior_1');
  assert.equal(state.grades[0].active, true);
  assert.equal(nodes.newJuniorGradeNameInput.value, '');
});

test('new school-scoped rows render in their own cards and unknown legacy rows remain separate', () => {
  const state = { grades: [{ id: 'primary-custom', name: '特別支援学級', stage: 'elementary' },
    { id: 'junior-custom', name: '特別支援学級', stage: 'junior' },
    { id: 'legacy', name: '特別支援学級' }] };
  const { context, nodes } = host(state), before = JSON.stringify(state);
  context.renderGradeSettings();
  for (const [list,id] of [['elementaryGradeCustomList','primary-custom'],['juniorGradeCustomList','junior-custom'],['gradeSettingsList','legacy']]) {
    assert.deepEqual(nodes[list].children.map(row => row.dataset.id), [id]);
  }
  assert.equal(JSON.stringify(state), before);
});

test('grade rename duplicate validation is scoped to its own school and preserves saved relationships', () => {
  const state = { grades: [{ id: 'primary', name: '小学校の独自学年', stage: 'elementary' },
    { id: 'junior', name: '同じ名称', stage: 'junior' }], sharedClasses: [{ gradeId: 'primary' }] };
  const messages = [], { context } = host(state, { alert: message => messages.push(message) });
  context.saveGradeName('primary', { value: '同じ名称' });
  assert.equal(state.grades[0].name, '同じ名称');
  assert.equal(state.sharedClasses[0].gradeId, 'primary');
  assert.equal(messages.length, 0);
  state.grades.push({ id: 'another-primary', name: '同区分の既存名', stage: 'elementary' });
  const input = { value: '同区分の既存名' };
  context.saveGradeName('primary', input);
  assert.equal(state.grades[0].name, '同じ名称');
  assert.equal(input.value, '同じ名称');
  assert.equal(messages.length, 1);
});

test('moving a custom grade cannot swap it with another school category', () => {
  const state = { grades: [{ id: 'p1', name: '小学校A', stage: 'elementary' },
    { id: 'j1', name: '中学校A', stage: 'junior' }, { id: 'p2', name: '小学校B', stage: 'elementary' },
    { id: 'legacy', name: '既存学年' }, { id: 'j2', name: '中学校B', stage: 'junior' }] };
  const { context } = host(state);
  context.moveGrade('p1', 1);
  assert.deepEqual(state.grades.filter(item => item.stage === 'elementary').map(item => item.id), ['p2','p1']);
  assert.deepEqual(state.grades.filter(item => item.stage === 'junior').map(item => item.id), ['j1','j2']);
  const before = JSON.stringify(state);
  context.moveGrade('p1', 1);
  assert.equal(JSON.stringify(state), before);
});

test('drag reordering rejects another school category and predefined grades', () => {
  const state = { grades: [{ id: 'p1', name: 'A', stage: 'elementary' }, { id: 'j1', name: 'B', stage: 'junior' },
    { id: 'p2', name: 'C', stage: 'elementary' }, { id: 'grade_primary_1', name: '1年生' }] };
  const { context } = host(state);
  assert.equal(typeof context.reorderGrade, 'function');
  const before = JSON.stringify(state);
  context.reorderGrade('p1','j1');
  context.reorderGrade('p1','grade_primary_1');
  assert.equal(JSON.stringify(state), before);
  context.reorderGrade('p1','p2');
  assert.deepEqual(state.grades.filter(item => item.stage === 'elementary').map(item => item.id), ['p2','p1']);
});
