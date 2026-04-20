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

function detectBrowserName() {
  try {
    const uaData = typeof navigator !== 'undefined' ? navigator.userAgentData : null;
    if (uaData && Array.isArray(uaData.brands) && uaData.brands.length) {
      const known = /Edge|Edg|Brave|Opera|OPR|Vivaldi|Chrome/i;
      const skip = /Chromium|Not.*Brand/i;
      const pick = uaData.brands.find(b => known.test(b.brand) && !skip.test(b.brand))
        || uaData.brands.find(b => !skip.test(b.brand));
      if (pick && pick.brand) return pick.brand.replace(/^Microsoft /, '');
    }
  } catch (_) {}
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/OPR\//.test(ua)) return 'Opera';
  if (/Brave/.test(ua)) return 'Brave';
  if (/Vivaldi/.test(ua)) return 'Vivaldi';
  if (/Chrome\//.test(ua)) return 'Chrome';
  return 'Browser';
}

async function getTelegramBotInfo(botToken) {
  const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/getMe`);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.ok) {
    throw new Error((data && data.description) || `HTTP ${res.status}`);
  }
  return data.result;
}

function buildMessageText(url, title, sentFrom) {
  const lines = [];
  if (title && title !== url) lines.push(title);
  lines.push(url);
  if (sentFrom) lines.push('', '— Sent from ' + sentFrom);
  return lines.join('\n');
}

function dataUrlToBlob(dataUrl) {
  const [header, b64] = dataUrl.split(',');
  const mime = (header.match(/:(.*?);/) || [, 'application/octet-stream'])[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function sendTelegram(config, url, title, opts = {}) {
  if (!config.botToken) throw new Error('Missing bot token');
  if (!config.chatId) throw new Error('Missing chat ID');

  const sentFrom = opts.sentFrom || detectBrowserName();
  const screenshot = opts.screenshot || null;
  const includeScreenshot = config.includeScreenshot !== false; // default true
  const disablePreview = !!config.disablePreview;               // default false

  let topicId;
  if (config.topicId) {
    topicId = Number(config.topicId);
    if (!Number.isFinite(topicId)) throw new Error('Topic ID must be a number');
  }

  const text = buildMessageText(url, title, sentFrom);

  if (includeScreenshot && screenshot) {
    const form = new FormData();
    form.append('chat_id', String(config.chatId));
    form.append('photo', dataUrlToBlob(screenshot), 'screenshot.png');
    form.append('caption', text.slice(0, 1024));
    if (topicId !== undefined) form.append('message_thread_id', String(topicId));
    const res = await fetch(
      `https://api.telegram.org/bot${encodeURIComponent(config.botToken)}/sendPhoto`,
      { method: 'POST', body: form }
    );
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.ok) {
      throw new Error((data && data.description) || `HTTP ${res.status}`);
    }
    return data;
  }

  const body = {
    chat_id: config.chatId,
    text,
    disable_web_page_preview: disablePreview
  };
  if (topicId !== undefined) body.message_thread_id = topicId;
  const res = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(config.botToken)}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.ok) {
    throw new Error((data && data.description) || `HTTP ${res.status}`);
  }
  return data;
}

async function sendWebhook(config, url, title, opts = {}) {
  if (!config.url) throw new Error('Missing webhook URL');
  const res = await fetch(config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      title: title || '',
      timestamp: new Date().toISOString(),
      sentFrom: opts.sentFrom || detectBrowserName()
    })
  });
  if (!res.ok) {
    let extra = '';
    try { extra = ': ' + (await res.text()).slice(0, 200); } catch (_) {}
    throw new Error(`HTTP ${res.status}${extra}`);
  }
  return { ok: true };
}

async function sendTarget(target, url, title, opts) {
  if (target.type === 'telegram') return sendTelegram(target.config, url, title, opts);
  if (target.type === 'webhook') return sendWebhook(target.config, url, title, opts);
  throw new Error('Unknown target type: ' + target.type);
}

async function captureVisibleTabForTargets(targets) {
  const wantsShot = targets.some(
    t => t.type === 'telegram' && t.config.includeScreenshot !== false
  );
  if (!wantsShot) return null;
  try {
    return await chrome.tabs.captureVisibleTab(undefined, { format: 'png' });
  } catch (e) {
    console.warn('captureVisibleTab failed:', e && e.message);
    return null;
  }
}

async function sendToAll(targets, url, title) {
  const screenshot = await captureVisibleTabForTargets(targets);
  const sentFrom = detectBrowserName();
  const opts = { screenshot, sentFrom };
  const results = await Promise.allSettled(targets.map(t => sendTarget(t, url, title, opts)));
  return results.map((r, i) => ({
    target: { id: targets[i].id, type: targets[i].type, name: targets[i].name },
    ok: r.status === 'fulfilled',
    error: r.status === 'rejected' ? (r.reason && r.reason.message || String(r.reason)) : null
  }));
}

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const __sendToMe = {
  loadState, saveState, listTargets,
  getTelegramBotInfo, sendTelegram, sendWebhook,
  sendTarget, sendToAll, uuid, detectBrowserName
};
Object.assign(globalThis, __sendToMe);
