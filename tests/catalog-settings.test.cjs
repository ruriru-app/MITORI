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

function loadFunction(name, context = {}) {
  return vm.runInNewContext(`(${extractFunction(name)})`, context);
}

test('preset grade selection can be hidden and restored without deleting the grade object', () => {
  const setCatalogPresetActive = loadFunction('setCatalogPresetActive');
  const items = [{ id: 'existing-grade-5', name: '5年生', active: true }];
  const preset = { id: 'grade_primary_5', name: '5年生' };

  const hidden = setCatalogPresetActive(items, preset, false, true);
  assert.equal(items.length, 1);
  assert.equal(hidden.id, 'existing-grade-5');
  assert.equal(hidden.active, false);

  const restored = setCatalogPresetActive(items, preset, true, true);
  assert.equal(items.length, 1);
  assert.equal(restored.id, 'existing-grade-5');
  assert.equal(restored.active, true);
});

test('inactive catalog entries stay available when they are already selected by saved data', () => {
  const availableCatalogItems = loadFunction('availableCatalogItems');
  const items = [
    { id: 'active', name: '5年生', active: true },
    { id: 'linked', name: '旧学年', active: false },
    { id: 'hidden', name: '非表示', active: false },
  ];

  assert.deepEqual(
    Array.from(availableCatalogItems(items, 'linked'), item => item.id),
    ['active', 'linked'],
  );
});

test('elementary and junior-high subject presets use separate ids for the same subject name', () => {
  const subjectPresetOptions = loadFunction('subjectPresetOptions');
  const elementary = subjectPresetOptions('elementary');
  const junior = subjectPresetOptions('junior');
  const elementaryJapanese = elementary.find(item => item.name === '国語');
  const juniorJapanese = junior.find(item => item.name === '国語');

  assert.ok(elementaryJapanese);
  assert.ok(juniorJapanese);
  assert.notEqual(elementaryJapanese.id, juniorJapanese.id);
  assert.ok(elementary.some(item => item.name === '算数'));
  assert.ok(elementary.some(item => item.name === '外国語活動'));
  assert.ok(junior.some(item => item.name === '数学'));
});

test('activating a preset adopts an explicitly staged same-name subject without changing its id', () => {
  const findSubjectPresetItem = loadFunction('findSubjectPresetItem');
  const setSubjectPresetActive = loadFunction('setSubjectPresetActive', {
    findSubjectPresetItem,
  });
  const items = [{ id: 'custom-japanese', name: '国語', stage: 'elementary', active: true, preset: false }];
  const preset = { id: 'subject_elementary_1', name: '国語', stage: 'elementary', preset: true };

  const activated = setSubjectPresetActive(items, preset, true);

  assert.equal(items.length, 1);
  assert.equal(activated.id, 'custom-japanese');
  assert.equal(activated.presetId, 'subject_elementary_1');
  assert.equal(activated.preset, true);
  assert.equal(activated.active, true);
});

test('subject labels identify elementary, junior-high, and legacy subjects', () => {
  const subjectCatalogLabel = loadFunction('subjectCatalogLabel');

  assert.equal(subjectCatalogLabel({ name: '国語', stage: 'elementary' }), '国語（小学校）');
  assert.equal(subjectCatalogLabel({ name: '国語', stage: 'junior' }), '国語（中学校）');
  assert.equal(subjectCatalogLabel({ name: '国語' }), '国語（既存・その他）');
});

test('the tile palette exposes thirteen grouped colors and resolves every displayed color exactly', () => {
  const classColorOptions = loadFunction('classColorOptions');
  const options = classColorOptions();
  const classColorValue = loadFunction('classColorValue', { classColorOptions });

  assert.equal(options.length, 13);
  assert.deepEqual(
    Array.from(options, item => item.name),
    ['レモン', 'オレンジ', 'コーラル', 'ピンク', 'アップルグリーン', 'ミント', 'ティール', 'ブルー', 'インディゴ', 'パープル', 'モーヴ', 'ブラウン', 'グレー'],
  );
  options.forEach(option => assert.equal(classColorValue(option.id), option.color));
});
