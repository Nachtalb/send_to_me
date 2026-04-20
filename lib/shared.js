// Shared helpers used by background, popup, and options.
// Exposes functions on globalThis so it works both in service worker and page contexts.

async function loadState() {
  const data = await chrome.storage.sync.get(['telegrams', 'webhooks']);
  return {
    telegrams: Array.isArray(data.telegrams) ? data.telegrams : [],
    webhooks: Array.isArray(data.webhooks) ? data.webhooks : []
  };
}

async function saveState(state) {
  await chrome.storage.sync.set({
    telegrams: state.telegrams || [],
    webhooks: state.webhooks || []
  });
}

function listTargets(state) {
  const targets = [];
  for (const tg of state.telegrams) {
    targets.push({
      id: 'tg:' + tg.id,
      type: 'telegram',
      name: tg.name || 'Telegram',
      config: tg
    });
  }
  for (const wh of state.webhooks) {
    targets.push({
      id: 'wh:' + wh.id,
      type: 'webhook',
      name: wh.name || wh.url || 'Webhook',
      config: wh
    });
  }
  return targets;
}

async function getTelegramBotInfo(botToken) {
  const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/getMe`);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.ok) {
    throw new Error((data && data.description) || `HTTP ${res.status}`);
  }
  return data.result;
}

async function sendTelegram(config, url, title) {
  if (!config.botToken) throw new Error('Missing bot token');
  if (!config.chatId) throw new Error('Missing chat ID');
  const text = title && title !== url ? `${title}\n${url}` : url;
  const body = {
    chat_id: config.chatId,
    text,
    disable_web_page_preview: false
  };
  if (config.topicId) {
    const n = Number(config.topicId);
    if (!Number.isFinite(n)) throw new Error('Topic ID must be a number');
    body.message_thread_id = n;
  }
  const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(config.botToken)}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.ok) {
    throw new Error((data && data.description) || `HTTP ${res.status}`);
  }
  return data;
}

async function sendWebhook(config, url, title) {
  if (!config.url) throw new Error('Missing webhook URL');
  const res = await fetch(config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      title: title || '',
      timestamp: new Date().toISOString()
    })
  });
  if (!res.ok) {
    let extra = '';
    try { extra = ': ' + (await res.text()).slice(0, 200); } catch (_) {}
    throw new Error(`HTTP ${res.status}${extra}`);
  }
  return { ok: true };
}

async function sendTarget(target, url, title) {
  if (target.type === 'telegram') return sendTelegram(target.config, url, title);
  if (target.type === 'webhook') return sendWebhook(target.config, url, title);
  throw new Error('Unknown target type: ' + target.type);
}

async function sendToAll(targets, url, title) {
  const results = await Promise.allSettled(targets.map(t => sendTarget(t, url, title)));
  return results.map((r, i) => ({
    target: { id: targets[i].id, type: targets[i].type, name: targets[i].name },
    ok: r.status === 'fulfilled',
    error: r.status === 'rejected' ? (r.reason && r.reason.message || String(r.reason)) : null
  }));
}

function uuid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const __sendToMe = {
  loadState, saveState, listTargets,
  getTelegramBotInfo, sendTelegram, sendWebhook,
  sendTarget, sendToAll, uuid
};
Object.assign(globalThis, __sendToMe);
