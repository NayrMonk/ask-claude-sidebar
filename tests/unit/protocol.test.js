// tests/unit/protocol.test.js — verifies the shared protocol constants load and are stable.
// Run with: node tests/unit/protocol.test.js
// No build step / framework: shared files publish onto globalThis, so we just require them.

const assert = require('assert');
require('../../src/shared/protocol.js'); // populates globalThis.AskClaude

const { AskClaude } = globalThis;
let passed = 0;

function check(name, fn) { fn(); passed++; console.log(`  ✓ ${name}`); }

check('AskClaude namespace exists', () => {
  assert.ok(AskClaude, 'globalThis.AskClaude should be defined');
});

check('protocol version is a number', () => {
  assert.strictEqual(typeof AskClaude.PROTOCOL_VERSION, 'number');
});

check('CLAUDE_ORIGIN is the claude.ai origin', () => {
  assert.strictEqual(AskClaude.CLAUDE_ORIGIN, 'https://claude.ai');
});

check('runtime MSG constants are self-named strings', () => {
  for (const [k, v] of Object.entries(AskClaude.MSG)) {
    assert.strictEqual(v, k, `MSG.${k} should equal "${k}"`);
  }
  assert.ok(AskClaude.MSG.TAB_CHANGED && AskClaude.MSG.PAGE_CONTENT && AskClaude.MSG.EXTRACT_PAGE);
});

check('frame FRAME_MSG constants are self-named strings', () => {
  for (const [k, v] of Object.entries(AskClaude.FRAME_MSG)) {
    assert.strictEqual(v, k, `FRAME_MSG.${k} should equal "${k}"`);
  }
  assert.ok(
    AskClaude.FRAME_MSG.CLAUDE_URL &&
    AskClaude.FRAME_MSG.CLAUDE_INJECT &&
    AskClaude.FRAME_MSG.CLAUDE_INJECT_RESULT
  );
});

console.log(`\nprotocol.test.js — ${passed} assertions passed\n`);
