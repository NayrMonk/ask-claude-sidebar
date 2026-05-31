// service-worker.js — background entry point.
//
// M0: same responsibilities as the original background.js — side-panel behavior,
// tab-change relay, and page-content routing — reorganized under src/ and using the
// shared protocol constants. Later milestones split browser-state.js / message-router.js
// out of here (see plan Phase 10).
//
// Classic worker (NOT type:module) so importScripts is available. Paths resolve
// relative to this file's URL.
importScripts('../shared/protocol.js');

const { MSG } = self.AskClaude;

// ── Side panel behavior ────────────────────────────────────────────
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);

// ── Tab change relay ───────────────────────────────────────────────
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    notifyPanel({ type: MSG.TAB_CHANGED, tabId: tab.id, title: tab.title || '', url: tab.url || '' });
  });
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete') {
    notifyPanel({ type: MSG.TAB_CHANGED, tabId: tab.id, title: tab.title || '', url: tab.url || '' });
  }
});

// ── Message router ─────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender) => {
  // Page content relay (page-agent.js → panel)
  if (msg && msg.type === MSG.PAGE_CONTENT) {
    notifyPanel({ ...msg, tabId: sender.tab?.id });
  }
});

// ── Helpers ────────────────────────────────────────────────────────
function notifyPanel(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}
