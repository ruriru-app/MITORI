const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modelPath = path.join(__dirname, '../pair-model.js');
const Pair = fs.existsSync(modelPath) ? require(modelPath) : {};

test('legacy definitions remain individual and blank role names have defaults', () => {
  assert.equal(typeof Pair.isPair, 'function');
  assert.equal(Pair.isPair({ items: [] }), false);
  assert.equal(Pair.isPair({ kind: 'pair' }), true);
  assert.equal(Pair.roleName({ roleNames: { role1: '  ' } }, 'role1'), '役割１');
  assert.equal(Pair.roleName({ roleNames: { role2: '聞き手' } }, 'role2'), '聞き手');
});

test('role switching keeps independent ratings and a round trip preserves them', () => {
  assert.equal(typeof Pair.roleItems, 'function');
  const result = { items: [
    { id:'a', roleId:'role1', levels:[{ id:'x', score:2 }], selectedLevelId:'x' },
    { id:'b', roleId:'role2', levels:[{ id:'y', score:3 }], selectedLevelId:'' }
  ] };
  assert.equal(Pair.progress(result), '評価途中 1/2');
  Pair.roleItems(result, 'role2')[0].selectedLevelId = 'y';
  const restored = JSON.parse(JSON.stringify(result));
  assert.equal(Pair.roleItems(restored, 'role1')[0].selectedLevelId, 'x');
  assert.equal(Pair.roleItems(restored, 'role2')[0].selectedLevelId, 'y');
  assert.equal(Pair.progress(restored), '評価完了 2/2');
  assert.equal(Pair.progress(null), '未評価');
});

test('stale level IDs do not count as assessed and role labels use the result snapshot', () => {
  assert.equal(typeof Pair.itemLabel, 'function');
  const result = { kind:'pair', roleNames:{role1:'話し手'}, items:[{roleId:'role1',content:'伝える',selectedLevelId:'gone',levels:[]}] };
  assert.equal(Pair.progress(result), '未評価 0/1');
  assert.equal(Pair.itemLabel(result, result.items[0]), '【話し手】伝える');
  assert.equal(Pair.itemLabel({kind:'pair'}, {roleId:'role2',content:'応答する'}), '【役割２】応答する');
  assert.equal(Pair.itemLabel({}, {content:'伝える'}), '伝える');
});

test('a common item is visible in both roles and appears as one item in progress and output', () => {
  const common = {id:'c',roleId:'common',content:'相手に伝わる声で話す',levels:[{id:'yes',score:1}],selectedLevelId:''};
  const result = {kind:'pair',items:[{id:'a',roleId:'role1'}, {id:'b',roleId:'role2'}, common]};
  assert.deepEqual(Pair.roleItems(result,'role1').map(item=>item.id), ['a','c']);
  assert.deepEqual(Pair.roleItems(result,'role2').map(item=>item.id), ['b','c']);
  Pair.roleItems(result,'role1')[1].selectedLevelId='yes';
  assert.equal(Pair.roleItems(result,'role2')[1].selectedLevelId,'yes');
  assert.equal(Pair.progress(result),'評価途中 1/3');
  assert.equal(Pair.itemLabel(result,common),'【共通】相手に伝わる声で話す');
});
