# Ask Claude — Chrome Sidebar Extension

> The **"Ask Gemini" experience, but for Claude.** A Chrome extension that puts an **Ask Claude** button in your toolbar. Click it to open a sidebar with the *real* [claude.ai](https://claude.ai) — your login, your history, your Projects — and ask Claude about whatever page you're viewing.

**No API key required.** It rides your existing claude.ai session (works with Free, Pro, or Max).

---

## What it does

- **Real claude.ai in a sidebar** — your actual account, conversations, and Projects, embedded natively in Chrome's side panel.
- **Reads the page you're on** — Google Slides, Docs, Sheets, PDFs, and regular websites. Click **Read this page** → **Send to Claude**, then ask your question.
- **Per-tab memory** — each browser tab keeps its own Claude conversation, restored when you switch back to it.
- **Google Drive via Claude's own connector** — the extension does **not** log into your Google account. Instead, when you're on a Drive/Docs/Slides/Sheets file, it links that file into the chat and lets Claude open it through the **Google Drive connector** you enable in Claude's own settings.

## How it works under the hood

| Piece | Role |
|-------|------|
| **declarativeNetRequest** (`rules.json`) | Strips `X-Frame-Options` / `Content-Security-Policy` from claude.ai so it can be embedded in the side panel iframe. |
| **`background.js`** | Service worker — relays tab changes and page content to the side panel. |
| **`content-page.js`** | Runs on every page; extracts text from Slides, Docs, Sheets, PDFs, and generic websites. |
| **`content-claude.js`** | Runs inside the claude.ai iframe; reports the conversation URL up to the panel and injects extracted text into the chat editor. |
| **`sidepanel.html` / `sidepanel.js`** | The side panel UI: toolbar, Drive card, page-context strip, and the embedded iframe. |

## Install (development / unpacked)

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select this folder
4. Click the **puzzle-piece (🧩)** icon in the toolbar → **pin** "Ask Claude" so it sits in your toolbar
5. Click the **Ask Claude** button to open the sidebar

> **New extensions don't auto-appear in the toolbar** — Chrome hides them in the 🧩 overflow menu until you pin them. If you don't see the button, that's where it is.

### Enabling Google Drive (optional)

This extension relies on **Claude's** Google Drive connector, not its own login:

1. In the sidebar, click the **Drive** icon → **Open Claude settings**
2. In Claude's **Settings → Connectors**, enable **Google Drive**
3. Now when you're on a Drive file and hit **Send to Claude**, Claude can open the full file directly.

## Permissions

| Permission | Why |
|-----------|-----|
| `sidePanel` | Open claude.ai in Chrome's side panel. |
| `storage` | Remember per-tab conversation URLs. |
| `tabs` | Detect when you switch tabs. |
| `activeTab` | Read content from the active tab. |
| `scripting` | Inject the content scripts. |
| `declarativeNetRequest` / `…WithHostAccess` | Strip the headers that block embedding claude.ai. |

## Project structure

```
claude-sidebar/
├── manifest.json       # MV3 manifest
├── background.js       # Service worker: tab + page-content relay
├── sidepanel.html      # Side panel UI
├── sidepanel.js        # Panel logic: tabs, Drive card, read/send
├── content-page.js     # Page extraction (Slides, Docs, Sheets, PDF, web)
├── content-claude.js   # URL reporting + chat injection inside claude.ai
├── rules.json          # declarativeNetRequest header-stripping rules
└── icons/              # 16 / 32 / 48 / 128 px icons
```

## Status / roadmap

- ✅ Embedded claude.ai, page reading, per-tab memory, real send-confirmation, Drive-via-connector
- 🔜 Multi-tab reading (synthesize across several open tabs, like Gemini)
- 🔜 Screenshot + vision reading for pixel-accurate Slides/PDF understanding
- 🔜 Quick-switch between Claude's web surfaces (Chat / Projects)

## Disclaimer

Unofficial, community-built. Not affiliated with or endorsed by Anthropic or Google. "Claude" and "Gemini" are trademarks of their respective owners.
