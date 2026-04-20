importScripts('lib/shared.js');

const MENU_ROOT = 'send-to-me-root';
const MENU_CONTEXTS = ['page', 'link', 'selection', 'image'];

async function rebuildMenus() {
  await new Promise(resolve => chrome.contextMenus.removeAll(resolve));
  const state = await loadState();
  const targets = listTargets(state);

  if (targets.length === 0) {
    chrome.contextMenus.create({
      id: 'qr',
      title: 'Send to Me: show QR code',
      contexts: MENU_CONTEXTS
    });
    return;
  }

  if (targets.length === 1) {
    const t = targets[0];
    chrome.contextMenus.create({
      id: 'send:' + t.id,
      title: `Send to ${t.name}`,
      contexts: MENU_CONTEXTS
    });
    chrome.contextMenus.create({
      id: 'qr',
      title: 'Show QR code',
      contexts: MENU_CONTEXTS
    });
    return;
  }

  chrome.contextMenus.create({
    id: MENU_ROOT,
    title: 'Send to Me',
    contexts: MENU_CONTEXTS
  });
  chrome.contextMenus.create({
    id: 'send:all',
    parentId: MENU_ROOT,
    title: 'All (' + targets.length + ')',
    contexts: MENU_CONTEXTS
  });
  chrome.contextMenus.create({
    id: 'sep1',
    parentId: MENU_ROOT,
    type: 'separator',
    contexts: MENU_CONTEXTS
  });
  for (const t of targets) {
    chrome.contextMenus.create({
      id: 'send:' + t.id,
      parentId: MENU_ROOT,
      title: t.name,
      contexts: MENU_CONTEXTS
    });
  }
  chrome.contextMenus.create({
    id: 'sep2',
    parentId: MENU_ROOT,
    type: 'separator',
    contexts: MENU_CONTEXTS
  });
  chrome.contextMenus.create({
    id: 'qr',
    parentId: MENU_ROOT,
    title: 'Show QR code',
    contexts: MENU_CONTEXTS
  });
}

chrome.runtime.onInstalled.addListener(rebuildMenus);
chrome.runtime.onStartup.addListener(rebuildMenus);
chrome.storage.onChanged.addListener(rebuildMenus);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.linkUrl || info.srcUrl || info.pageUrl || (tab && tab.url);
  const title = (tab && tab.title) || '';
  if (!url) return;

  if (info.menuItemId === 'qr') {
    openQrWindow(url);
    return;
  }

  const menuId = String(info.menuItemId);
  if (!menuId.startsWith('send:')) return;

  const targetId = menuId.slice(5);
  const state = await loadState();
  const allTargets = listTargets(state);

  const targets = targetId === 'all'
    ? allTargets
    : allTargets.filter(t => t.id === targetId);
  if (targets.length === 0) return;

  const results = await sendToAll(targets, url, title);
  notifyResults(results);
});

function notifyResults(results) {
  const ok = results.filter(r => r.ok).length;
  const total = results.length;
  const fail = total - ok;

  const heading = fail === 0
    ? 'Sent ✓'
    : (ok === 0 ? 'Send failed' : `Sent ${ok}/${total}`);

  const body = results
    .map(r => r.ok ? `✓ ${r.target.name}` : `✗ ${r.target.name}: ${r.error}`)
    .join('\n');

  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: heading,
      message: body.slice(0, 500) || heading
    });
  } catch (_) {}
}

function openQrWindow(url) {
  const qrUrl = chrome.runtime.getURL('qr.html') + '?url=' + encodeURIComponent(url);
  chrome.windows.create({
    url: qrUrl,
    type: 'popup',
    width: 380,
    height: 460
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg && msg.type === 'sendAll') {
        const state = await loadState();
        const targets = listTargets(state);
        const results = await sendToAll(targets, msg.url, msg.title);
        sendResponse({ ok: true, results });
        return;
      }
      sendResponse({ ok: false, error: 'unknown message' });
    } catch (e) {
      sendResponse({ ok: false, error: (e && e.message) || String(e) });
    }
  })();
  return true;
});
