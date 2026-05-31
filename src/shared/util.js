// shared/util.js — small pure helpers shared across contexts.
// Classic script (see protocol.js for why); publishes onto globalThis.AskClaude.util.
(function (g) {
  const AskClaude = (g.AskClaude = g.AskClaude || {});

  AskClaude.util = {
    // Escape text for safe insertion into innerHTML.
    escHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    },

    // Normalize whitespace from scraped page text.
    cleanText(t) {
      return String(t)
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
    },

    sleep(ms) {
      return new Promise((r) => setTimeout(r, ms));
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
