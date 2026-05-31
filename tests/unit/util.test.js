// tests/unit/util.test.js — verifies the shared util helpers.
// Run with: node tests/unit/util.test.js

const assert = require('assert');
require('../../src/shared/util.js'); // populates globalThis.AskClaude.util

const { escHtml, cleanText, sleep } = globalThis.AskClaude.util;
let passed = 0;

function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

check('escHtml escapes &, <, >', () => {
  assert.strictEqual(escHtml('a & b <c> "d"'), 'a &amp; b &lt;c&gt; "d"');
});

check('escHtml coerces non-strings', () => {
  assert.strictEqual(escHtml(42), '42');
});

check('cleanText collapses blank lines and runs of spaces/tabs', () => {
  assert.strictEqual(cleanText('a\r\n\n\n\nb   c\t\td'), 'a\n\nb c d');
});

check('cleanText trims surrounding whitespace', () => {
  assert.strictEqual(cleanText('   hello   '), 'hello');
});

check('sleep resolves a promise', async () => {
  const r = sleep(0);
  assert.ok(r instanceof Promise);
  await r;
});

console.log(`\nutil.test.js — ${passed} assertions passed\n`);
