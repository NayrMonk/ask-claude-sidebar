# Architecture — Ask Claude

> Full design review (12 phases): see the approved plan referenced from the project root.
> This file tracks the **as-built** structure as milestones land.

## Core constraint
No Anthropic API, no API key, no backend, no custom chat UI. The product wraps the real
**claude.ai** running in the side-panel iframe (the user's own session, conversations,
Projects, Connectors, MCP). Browser awareness is an **illusion produced by the extension**:
it observes the browser, builds/compresses context + memory, and **injects** a structured
block into the claude.ai composer. The "agent tools" (`readCurrentTab()`, …) are *internal
extension modules*, never functions Claude invokes.

## Layout (M0 — foundation)
```
manifest.json            MV3 manifest (paths point into src/)
rules.json               declarativeNetRequest: strip framing headers on claude.ai
src/
  shared/                Classic scripts; publish onto globalThis.AskClaude
    protocol.js          MSG / FRAME_MSG message constants, CLAUDE_ORIGIN, version
    util.js              escHtml, cleanText, sleep
    types.js             JSDoc typedefs (PageContent, ContextObject)
  background/
    service-worker.js    Side-panel behavior, tab-change relay, page-content routing
  content/
    page-agent.js        Per-page extraction (Slides/Docs/Sheets/PDF/Drive/generic)
    claude-bridge.js     Reports claude.ai URL + injects text into the composer
  ui/
    sidepanel.html       Side-panel markup + styles
    sidepanel.js         Panel controller (tabs, read modes, injection, Drive card)
tests/unit/              node-runnable unit tests (no build step)
docs/                    ARCHITECTURE.md, TESTING.md
icons/                   16/32/48/128
```

## Module-sharing approach (no bundler)
A no-build, MV3-native pattern:
- `src/shared/*.js` are **classic scripts** that attach to `globalThis.AskClaude`.
- **Service worker** is a classic worker (not `type: module`) and pulls shared code via
  `importScripts('../shared/protocol.js')`.
- **Content scripts** list shared files first in `manifest.content_scripts[].js`, so they share
  the same isolated-world global before the agent runs.
- **Side panel** loads shared `<script>` tags before `sidepanel.js`.

This avoids a build toolchain while keeping one source of truth for constants/helpers.
Later milestones (M1+) add `background/`, `context-engine/`, `memory/`, `capabilities/` modules
under the same pattern (see plan Phase 10).

## Message protocol (M0)
- `chrome.runtime`: `TAB_CHANGED`, `PAGE_CONTENT`, `EXTRACT_PAGE` (see `MSG`).
- `window.postMessage` across the iframe: `CLAUDE_URL`, `CLAUDE_INJECT`, `CLAUDE_INJECT_RESULT`
  (see `FRAME_MSG`), guarded by `CLAUDE_ORIGIN`.
