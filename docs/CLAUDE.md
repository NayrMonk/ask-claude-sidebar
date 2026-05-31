# Ask Claude — Chrome Sidebar Extension

> A Chrome extension that embeds the real **claude.ai** experience in a sidebar panel — just like Google's "Ask Gemini" — with full page-reading capabilities.

## Overview

Ask Claude sits in the Chrome toolbar right next to the Ask Gemini button. Click it to open a sidebar with the real claude.ai interface (your login, your history, your Projects). It can read the page you're currently viewing — Google Slides, Docs, Sheets, PDFs, and regular websites — and send that content directly into the Claude chat.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Chrome Toolbar        [Ask Claude] button           │
├─────────────────────────────────────────────────────┤
│  background.js         Service worker                │
│  ├─ Tab change relay   Notifies sidebar of tab       │
│  ├─ Drive OAuth        Google Drive auth flow        │
│  └─ Message router     Relays page content           │
├─────────────────────────────────────────────────────┤
│  sidepanel.html/js     Side panel UI                 │
│  ├─ Toolbar            Logo, Drive, Read, New, Reload│
│  ├─ Drive card         Connect Google Drive prompt   │
│  ├─ Context strip      Page info + Send to Claude    │
│  └─ <iframe>           Embeds claude.ai              │
├─────────────────────────────────────────────────────┤
│  content-page.js       Runs on every page            │
│  ├─ Google Slides      Extracts current/all slides   │
│  ├─ Google Docs        Extracts current/all pages    │
│  ├─ Google Sheets      Extracts active sheet         │
│  ├─ PDFs               Extracts visible page         │
│  └─ Generic pages      Article/main content          │
├─────────────────────────────────────────────────────┤
│  content-claude.js     Runs inside claude.ai iframe  │
│  └─ Text injection     ProseMirror editor injection  │
├─────────────────────────────────────────────────────┤
│  rules.json            declarativeNetRequest rules   │
│  └─ Strips X-Frame-Options & CSP from claude.ai     │
└─────────────────────────────────────────────────────┘
```

## Key Technique: Embedding claude.ai

`claude.ai` blocks `<iframe>` embedding via `X-Frame-Options` and `Content-Security-Policy` headers. This extension uses Chrome's **declarativeNetRequest** API to strip those headers before the browser processes them, allowing the real claude.ai to load inside the sidebar iframe.

## Features

### Core
- **Real claude.ai** — Your actual login, conversation history, Projects, everything native
- **Per-tab memory** — Each browser tab gets its own Claude conversation URL, restored when you switch tabs
- **Toolbar button** — "Ask Claude" button in Chrome toolbar, opens sidebar on click

### Page Reading
- **Google Slides** — Reads current slide or all slides (slide-by-slide text extraction)
- **Google Docs** — Reads current visible page or full document
- **Google Sheets** — Reads active sheet with cell data
- **PDFs** — Extracts text from Chrome's PDF viewer
- **Any website** — Extracts article/main content, strips nav/footer/ads

### Google Drive Integration
- **OAuth connection** — Connect Google Drive for enhanced file access
- **Drive API fallback** — Fetches file content via API when DOM extraction fails
- **Read-only access** — Only requests read permission, never modifies files

## Permissions

| Permission | Why |
|-----------|-----|
| `sidePanel` | Open claude.ai in Chrome's side panel |
| `storage` | Store per-tab conversation URLs and Drive auth |
| `tabs` | Detect active tab changes |
| `activeTab` | Read content from the active tab |
| `scripting` | Inject content scripts |
| `identity` | Google Drive OAuth authentication |
| `declarativeNetRequest` | Strip iframe-blocking headers from claude.ai |

## Setup (Development)

1. Open `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked** → select the `claude-sidebar` directory
4. Click the **puzzle piece** icon in Chrome toolbar → **pin** "Ask Claude"
5. The "Ask Claude" button should now appear in your toolbar

### Google Drive Setup (Optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable the **Google Drive API**
4. Go to **Credentials** → Create **OAuth 2.0 Client ID**
   - Application type: **Chrome Extension** (or **Web Application** for `launchWebAuthFlow`)
   - For Web Application: Add `https://<extension-id>.chromiumapp.org/` as a redirect URI
5. Copy the Client ID and put it in `background.js` → `GOOGLE_CLIENT_ID`

## File Structure

```
claude-sidebar/
├── manifest.json              # Extension manifest (MV3) — paths point into src/
├── rules.json                 # declarativeNetRequest: strip iframe-blocking headers
├── src/
│   ├── shared/                # Classic scripts; publish onto globalThis.AskClaude
│   │   ├── protocol.js        # MSG / FRAME_MSG constants, CLAUDE_ORIGIN
│   │   ├── util.js            # escHtml, cleanText, sleep
│   │   └── types.js           # JSDoc typedefs (PageContent, ContextObject)
│   ├── background/service-worker.js   # tab relay + page-content routing
│   ├── content/page-agent.js          # page extraction (Slides/Docs/Sheets/PDF)
│   ├── content/claude-bridge.js       # URL report + text injection into claude.ai
│   └── ui/sidepanel.{html,js}         # side panel UI + controller
├── tests/unit/                # node-runnable unit tests (no framework)
├── docs/                      # ARCHITECTURE.md, TESTING.md
└── icons/                     # Extension icons (16, 32, 48, 128px)
```

## Development Conventions

- **No bundler / no ES modules.** Shared code is plain scripts that attach to `globalThis.AskClaude` (`src/shared/*.js`).
- **Service worker is a *classic* worker** (not `type:module`) so it can `importScripts('../shared/protocol.js')`.
- **Load order matters:** content scripts must list `src/shared/*` *before* the agent in `manifest.content_scripts[].js`; `sidepanel.html` loads shared `<script>`s before `sidepanel.js`.
- **Tests:** `node tests/unit/<name>.test.js` — no framework/npm; shared modules load in Node because they attach to `globalThis`.
- Use `MSG`/`FRAME_MSG` constants for all messages; never hardcode message-type strings.

