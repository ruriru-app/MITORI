const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function loadInlineFunction(name) {
  const match = html.match(new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{[^\\n]*\\}`));
  assert.ok(match, `${name} must be defined in index.html`);
  return vm.runInNewContext(`(${match[0]})`);
}

test('board confirmation indicator is shown only for finalized lesson data', () => {
  const indicator = loadInlineFunction('boardConfirmationIndicator');

  assert.equal(indicator(null), '');
  assert.equal(indicator({}), '');
  assert.equal(indicator({ confirmed: false, hourCounted: false }), '');

  const finalized = indicator({ confirmed: true });
  assert.match(finalized, /class="boardConfirmedMark"/);
  assert.match(finalized, /aria-label="授業記録確定済み"/);
  assert.match(finalized, /<svg/);

  const legacyFinalized = indicator({ hourCounted: true });
  assert.match(legacyFinalized, /class="boardConfirmedMark"/);
});
