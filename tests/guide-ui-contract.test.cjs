const test=require('node:test');
const assert=require('node:assert/strict');
const View=require('../guide-view.js');
const guide=require('../guide-content.js').getGuide('initial-setup');
test('intro renderer escapes text rather than accepting markup',()=>{
  const html=View.buildIntroMarkup({title:'<img src=x onerror=alert(1)>',paragraphs:['a & b'],bullets:['<script>']});
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('a &amp; b'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script>'));
});
test('todo renderer creates nine independent manual controls and exact destinations',()=>{
  const html=View.buildTodoMarkup(guide);
  assert.equal((html.match(/type="checkbox"/g)||[]).length,9);
  assert.equal((html.match(/<details/g)||[]).length,9);
  assert.ok(html.includes('学年設定へ ↗'));
  assert.ok(html.includes('data-step="roster"'));
  assert.ok(!html.includes('disabled'));
});
