// shared/protocol.js — message protocol constants shared by the service worker,
// content scripts, and the side panel.
//
// This file is loaded as a CLASSIC script in every context:
//   • service worker → importScripts('../shared/protocol.js')
//   • content scripts → listed in manifest content_scripts[].js (before the agent)
//   • side panel      → <script src="../shared/protocol.js"></script>
// Because it runs in all three, it MUST NOT use ES-module syntax. It publishes onto
// globalThis.AskClaude so every context reads the exact same constant names.
(function (g) {
  const AskClaude = (g.AskClaude = g.AskClaude || {});

  AskClaude.PROTOCOL_VERSION = 1;
  AskClaude.CLAUDE_ORIGIN = 'https://claude.ai';

  // chrome.runtime messages (service worker ↔ panel ↔ content scripts)
  AskClaude.MSG = {
    TAB_CHANGED:  'TAB_CHANGED',   // SW → panel: active tab changed / finished loading
    PAGE_CONTENT: 'PAGE_CONTENT',  // content/SW → panel: extracted page content
    EXTRACT_PAGE: 'EXTRACT_PAGE',  // panel → content: request page extraction
  };

  // window.postMessage messages crossing the claude.ai iframe boundary
  AskClaude.FRAME_MSG = {
    CLAUDE_URL:           'CLAUDE_URL',           // bridge → panel: current claude.ai URL
    CLAUDE_INJECT:        'CLAUDE_INJECT',        // panel → bridge: inject text into composer
    CLAUDE_INJECT_RESULT: 'CLAUDE_INJECT_RESULT', // bridge → panel: did injection land?
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
