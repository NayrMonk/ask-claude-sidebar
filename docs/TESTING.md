# Testing — Ask Claude

## Unit tests (no build step, no dependencies)

The shared modules publish onto `globalThis.AskClaude`, so Node can load them directly.

```sh
node tests/unit/protocol.test.js
node tests/unit/util.test.js
```

Both should print `… assertions passed` and exit 0.

## Manual validation — load unpacked

1. `chrome://extensions/` → enable **Developer mode** → **Load unpacked** → select the
   `claude-sidebar/` directory. Confirm **no manifest or permission errors**.
2. Pin **Ask Claude** and click it to open the side panel; claude.ai should load in the iframe.

### M0 parity checklist (behavior must match v4.0)
- [ ] **Generic site:** open a normal article → click **Read this page** → context strip shows
      title + `~N words` → **Send to Claude** → text lands in the composer.
- [ ] **Google Doc:** open a Doc → Read → toggle **This page / Full doc** → Send → text + canonical
      Drive link land in the composer.
- [ ] **Google Slides:** open a deck → Read → **This slide / All slides** reflect the current slide.
- [ ] **PDF:** open a PDF (web viewer) → Read → **This page / All pages** → Send.
- [ ] **Per-tab memory:** switch tabs → each tab restores its own claude.ai conversation URL.
- [ ] **New chat / Reload** toolbar buttons work.
- [ ] **Clipboard fallback:** if injection fails, button shows **✓ Copied!** and clipboard holds the text.
- [ ] No errors in the side-panel console or the service-worker console.

> M0 is a pure refactor: if any item above regresses vs. v4.0, that's a bug to fix before M1.
