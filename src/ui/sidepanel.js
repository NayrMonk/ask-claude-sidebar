// sidepanel.js — side panel controller.
// M0: same behavior as the original sidepanel.js, reorganized under src/ and using the
// shared protocol constants + util helpers (loaded before this file in sidepanel.html).
// Handles: tab management, Drive UI, page reading with mode toggle, content injection.

const { MSG, FRAME_MSG, CLAUDE_ORIGIN, util } = globalThis.AskClaude;
const { escHtml } = util;

const frame          = document.getElementById('claude-frame');
const loading        = document.getElementById('loading');
const readPageBtn    = document.getElementById('read-page-btn');
const newChatBtn     = document.getElementById('new-chat-btn');
const reloadBtn      = document.getElementById('reload-btn');
const driveBtn       = document.getElementById('drive-btn');
const driveStatusDot = document.getElementById('drive-status-dot');
const driveCard      = document.getElementById('drive-card');
const connectDriveBtn= document.getElementById('connect-drive-btn');
const dismissDriveBtn= document.getElementById('dismiss-drive-btn');
const driveConnStrip = document.getElementById('drive-connected-strip');
const driveEmail     = document.getElementById('drive-email');
const disconnectBtn  = document.getElementById('disconnect-drive-btn');
const ctxStrip       = document.getElementById('ctx-strip');
const ctxIcon        = document.getElementById('ctx-icon');
const ctxTitle       = document.getElementById('ctx-title');
const readModeToggle = document.getElementById('read-mode-toggle');
const sendCtxBtn     = document.getElementById('send-ctx-btn');
const toastEl        = document.getElementById('toast');

// ── State ──────────────────────────────────────────────────────────
const tabConvUrls = new Map();   // tabId -> claude.ai conversation URL
let currentTabId  = null;
let currentTabUrl = '';
let pendingContext = null;        // extracted page content
let readMode       = 'current';  // 'current' or 'all'
let driveConnected = false;

// ── Boot ───────────────────────────────────────────────────────────
async function init() {
  // Restore tab-conversation mapping
  const saved = await chrome.storage.session.get('tabConvUrls').catch(() => ({}));
  if (saved.tabConvUrls) {
    Object.entries(saved.tabConvUrls).forEach(([k,v]) => tabConvUrls.set(Number(k), v));
  }

  // Check Drive status
  await checkDriveConnection();

  // Get current tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) switchToTab(tab.id, tab.title || '', tab.url || '');
}

// ── Google Drive (via Claude's own connector) ──────────────────────
// The extension does NOT log into Google itself. When you're on a Drive
// file, page-agent.js attaches the file's link to the chat; Claude reads
// it through the Google Drive connector you enable in Claude's settings.
const CLAUDE_CONNECTORS_URL = 'https://claude.ai/settings/connectors';

async function checkDriveConnection() {
  // No OAuth state to track — just show the info card once per session.
  const dismissed = await chrome.storage.session.get('driveDismissed').catch(() => ({}));
  if (!dismissed.driveDismissed) driveCard.classList.remove('hidden');
}

// Toolbar Drive button — toggle the info card.
driveBtn.addEventListener('click', () => {
  driveCard.classList.toggle('hidden');
});

// "Open Claude settings" — navigate the iframe to Claude's connector page.
connectDriveBtn.addEventListener('click', () => {
  navigateFrame(CLAUDE_CONNECTORS_URL);
  driveCard.classList.add('hidden');
  showToast('Enable the Google Drive connector here');
});

// Dismiss card
dismissDriveBtn.addEventListener('click', () => {
  driveCard.classList.add('hidden');
  chrome.storage.session.set({ driveDismissed: true });
});

// ── Tab Management ─────────────────────────────────────────────────
function switchToTab(tabId, title, url) {
  currentTabId  = tabId;
  currentTabUrl = url;
  pendingContext = null;
  hideCtxStrip();

  const saved = tabConvUrls.get(tabId);
  navigateFrame(saved || 'https://claude.ai/new');
}

function navigateFrame(url) {
  loading.classList.remove('hidden');
  frame.src = url;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === MSG.TAB_CHANGED) {
    switchToTab(msg.tabId, msg.title, msg.url);
  }
  if (msg.type === MSG.PAGE_CONTENT && msg.tabId === currentTabId) {
    handlePageContent(msg);
  }
});

// ── Messages from inside the claude.ai iframe (claude-bridge.js) ──
// We can't read the iframe URL cross-origin, so the content script posts
// it up to us. Same channel carries injection-result confirmations.
let injectResolve = null;
window.addEventListener('message', (e) => {
  if (e.origin !== CLAUDE_ORIGIN) return;
  const d = e.data || {};

  if (d.type === FRAME_MSG.CLAUDE_URL && currentTabId !== null) {
    if (d.url && d.url.startsWith(CLAUDE_ORIGIN) && tabConvUrls.get(currentTabId) !== d.url) {
      tabConvUrls.set(currentTabId, d.url);
      persistUrls();
    }
  }

  if (d.type === FRAME_MSG.CLAUDE_INJECT_RESULT && injectResolve) {
    injectResolve(!!d.ok);
  }
});

// ── Frame Load Tracking ────────────────────────────────────────────
frame.addEventListener('load', () => {
  loading.classList.add('hidden');
});

function persistUrls() {
  const obj = {};
  tabConvUrls.forEach((v,k) => { obj[k] = v; });
  chrome.storage.session.set({ tabConvUrls: obj }).catch(() => {});
}

// ── Read Page ──────────────────────────────────────────────────────
readPageBtn.addEventListener('click', async () => {
  if (!currentTabId) return;
  readPageBtn.style.opacity = '0.5';
  readPageBtn.disabled = true;

  try {
    const result = await chrome.tabs.sendMessage(currentTabId, {
      type: MSG.EXTRACT_PAGE,
      mode: readMode,                // 'current' or 'all'
      driveConnected: driveConnected // let content script know
    });
    handlePageContent({ ...result, tabId: currentTabId });
  } catch (e) {
    showToast('⚠ Cannot read this page (try a regular website)');
  } finally {
    readPageBtn.style.opacity = '';
    readPageBtn.disabled = false;
  }
});

function handlePageContent(data) {
  pendingContext = data;

  // Icon by type
  const icons = {
    google_slides: '📊',
    google_doc:    '📝',
    google_sheet:  '📈',
    google_drive:  '📁',
    pdf:           '📕',
    webpage:       '🌐'
  };
  ctxIcon.textContent = icons[data.type] || '📄';

  const label = data.title || currentTabUrl || 'Current page';
  const short = label.length > 40 ? label.slice(0,38) + '…' : label;
  ctxTitle.innerHTML = `<strong>${escHtml(short)}</strong>`;

  // Detail hint
  if (data.type === 'google_slides') {
    if (data.currentSlide) {
      ctxTitle.innerHTML += ` <span style="color:var(--dim)">— Slide ${data.currentSlide}${data.slideCount ? '/' + data.slideCount : ''}</span>`;
    } else if (data.slideCount) {
      ctxTitle.innerHTML += ` <span style="color:var(--dim)">(${data.slideCount} slides)</span>`;
    }
  } else if (data.type === 'pdf' && data.currentPage) {
    ctxTitle.innerHTML += ` <span style="color:var(--dim)">— Page ${data.currentPage}${data.totalPages ? '/' + data.totalPages : ''}</span>`;
  } else if (data.wordCount) {
    ctxTitle.innerHTML += ` <span style="color:var(--dim)">(~${data.wordCount} words)</span>`;
  }

  // Show read mode toggle for multi-page content
  const supportsMode = ['google_slides', 'google_doc', 'pdf'].includes(data.type);
  if (supportsMode) {
    readModeToggle.classList.remove('hidden');
    updateModeLabels(data.type);
  } else {
    readModeToggle.classList.add('hidden');
  }

  // Reset send button
  resetSendBtn();
  ctxStrip.classList.remove('hidden');
}

function updateModeLabels(type) {
  const labels = {
    google_slides: ['This slide', 'All slides'],
    google_doc:    ['This page', 'Full doc'],
    pdf:           ['This page', 'All pages']
  };
  const [currentLabel, allLabel] = labels[type] || ['Current', 'All'];
  const buttons = readModeToggle.querySelectorAll('.mode-btn');
  buttons[0].textContent = currentLabel;
  buttons[1].textContent = allLabel;
}

function hideCtxStrip() {
  ctxStrip.classList.add('hidden');
  readModeToggle.classList.add('hidden');
  pendingContext = null;
}

// Read mode toggle buttons
readModeToggle.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const newMode = btn.dataset.mode;
    if (newMode === readMode) return;
    readMode = newMode;

    // Update button states
    readModeToggle.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Re-read the page with new mode
    if (currentTabId) {
      try {
        const result = await chrome.tabs.sendMessage(currentTabId, {
          type: MSG.EXTRACT_PAGE,
          mode: readMode,
          driveConnected: driveConnected
        });
        handlePageContent({ ...result, tabId: currentTabId });
      } catch (_) {}
    }
  });
});

// ── Send Context to Claude ─────────────────────────────────────────
sendCtxBtn.addEventListener('click', async () => {
  if (!pendingContext) return;

  sendCtxBtn.disabled = true;
  sendCtxBtn.textContent = 'Sending…';

  const text = pendingContext.text;
  const injected = await injectIntoClaudeFrame(text);

  if (injected) {
    sendCtxBtn.className = 'sent';
    sendCtxBtn.innerHTML = '✓ Sent!';
    showToast('✓ Page context added — ask your question!');
  } else {
    try {
      await navigator.clipboard.writeText(text);
      sendCtxBtn.className = 'sent';
      sendCtxBtn.innerHTML = '✓ Copied!';
      showToast('Copied to clipboard — paste into Claude (Ctrl+V)');
    } catch (_) {
      showToast('⚠ Could not inject or copy. Try reloading.');
      sendCtxBtn.disabled = false;
    }
  }

  setTimeout(resetSendBtn, 3000);
});

function resetSendBtn() {
  sendCtxBtn.disabled = false;
  sendCtxBtn.className = '';
  sendCtxBtn.innerHTML = `
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg> Send to Claude`;
}

function injectIntoClaudeFrame(text) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      injectResolve = null;
      resolve(ok);
    };

    // The iframe content script replies with CLAUDE_INJECT_RESULT.
    injectResolve = finish;

    try {
      frame.contentWindow.postMessage({ type: FRAME_MSG.CLAUDE_INJECT, text }, CLAUDE_ORIGIN);
    } catch (e) {
      console.warn('[Ask Claude] inject failed:', e);
      finish(false);
      return;
    }

    // No reply in time → treat as failure so we fall back to clipboard.
    setTimeout(() => finish(false), 1500);
  });
}

// ── Toolbar Actions ────────────────────────────────────────────────
newChatBtn.addEventListener('click', () => {
  if (currentTabId !== null) tabConvUrls.delete(currentTabId);
  persistUrls();
  hideCtxStrip();
  navigateFrame('https://claude.ai/new');
});

reloadBtn.addEventListener('click', () => {
  loading.classList.remove('hidden');
  frame.src = frame.src;
});

// ── Toast ──────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
}

init();
