// claude-bridge.js — runs inside claude.ai pages (including our sidebar iframe).
// (Was content-claude.js.) M0: identical behavior, reorganized under src/ and using the
// shared FRAME_MSG constants (protocol.js loads before this file via manifest).
// Two jobs:
//   1. Report the current claude.ai URL up to the panel (per-tab memory). The panel can't
//      read frame.contentWindow.location cross-origin, so we push it from here (same-origin).
//   2. Inject extracted page text into the Claude chat editor on request, and report back
//      whether the injection actually landed.

(function () {
  const { FRAME_MSG } = globalThis.AskClaude;

  // ── 1. Report our URL to the parent (panel) ──────────────────────
  let lastUrl = '';
  function reportUrl() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      try { window.parent.postMessage({ type: FRAME_MSG.CLAUDE_URL, url: location.href }, '*'); } catch (_) {}
    }
  }
  reportUrl();
  // claude.ai is a SPA — the content script doesn't re-run on in-app navigation,
  // so poll location (same-origin, cheap) to catch conversation changes.
  setInterval(reportUrl, 1000);

  // ── 2a. Injection requests via postMessage (from panel) ──────────
  window.addEventListener('message', (e) => {
    if (!e.data || e.data.type !== FRAME_MSG.CLAUDE_INJECT) return;
    const ok = injectText(e.data.text);
    try { window.parent.postMessage({ type: FRAME_MSG.CLAUDE_INJECT_RESULT, ok }, '*'); } catch (_) {}
  });

  // ── 2b. Injection requests via runtime (scripting fallback) ──────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === FRAME_MSG.CLAUDE_INJECT) injectText(msg.text);
  });

  function injectText(text) {
    const editor = findEditor();
    if (!editor) {
      console.warn('[Ask Claude] Could not find chat input editor.');
      return false;
    }

    editor.focus();

    // Truncate very long content so we don't overwhelm the editor.
    const maxLen = 15000;
    if (text.length > maxLen) {
      text = text.slice(0, maxLen) + '\n\n[...content truncated for length]';
    }

    // Append after any existing draft instead of clobbering it.
    const existing = editor.innerText.trim();
    const toInsert = existing ? `\n\n---\n${text}` : text;
    const beforeLen = editor.innerText.length;

    // Strategy 1: execCommand insertText — most reliable for ProseMirror.
    try { document.execCommand('insertText', false, toInsert); } catch (_) {}

    // Strategy 2: simulate a paste if nothing changed.
    if (editor.innerText.length <= beforeLen) {
      try {
        const dt = new DataTransfer();
        dt.setData('text/plain', toInsert);
        editor.dispatchEvent(new ClipboardEvent('paste', {
          clipboardData: dt, bubbles: true, cancelable: true
        }));
      } catch (_) {}
    }

    // Strategy 3: direct node append as a last resort.
    if (editor.innerText.length <= beforeLen) {
      try {
        const p = document.createElement('p');
        p.textContent = toInsert;
        editor.appendChild(p);
        editor.dispatchEvent(new InputEvent('input', {
          bubbles: true, inputType: 'insertText', data: toInsert
        }));
      } catch (_) {}
    }

    // Nudge React/ProseMirror to sync its state.
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    requestAnimationFrame(() => { editor.scrollTop = editor.scrollHeight; });

    // Report success based on whether the editor actually grew.
    return editor.innerText.length > beforeLen;
  }

  function findEditor() {
    return (
      document.querySelector('[contenteditable="true"].ProseMirror') ||
      document.querySelector('[data-testid="composer-editor"] [contenteditable]') ||
      document.querySelector('[role="textbox"][contenteditable]') ||
      document.querySelector('.chat-input [contenteditable="true"]') ||
      document.querySelector('div[contenteditable="true"]')
    );
  }
})();
