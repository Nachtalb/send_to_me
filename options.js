let state = { telegrams: [], webhooks: [], device: { name: '' } };
let saveTimer = null;

async function init() {
  state = await loadState();
  render();
  renderDevice();
  document.getElementById('add-tg').onclick = () => {
    state.telegrams.push({
      id: uuid(),
      name: '',
      botToken: '',
      chatId: '',
      topicId: '',
      includeScreenshot: true,
      disablePreview: false
    });
    persistAndRender();
  };
  document.getElementById('add-wh').onclick = () => {
    state.webhooks.push({ id: uuid(), name: '', url: '' });
    persistAndRender();
  };
}

function renderDevice() {
  if (!state.device || typeof state.device !== 'object') state.device = { name: '' };
  const input = document.getElementById('device-name');
  const hint = document.getElementById('device-name-hint');
  const detected = detectBrowserName();
  input.value = state.device.name || '';
  input.placeholder = detected;
  updateDeviceHint(hint, input.value, detected);
  input.oninput = () => {
    state.device.name = input.value;
    updateDeviceHint(hint, input.value, detected);
    scheduleSave();
  };
}

function updateDeviceHint(hint, value, detected) {
  const trimmed = (value || '').trim();
  hint.textContent = trimmed
    ? `Using "${trimmed}".`
    : `Empty — will use "${detected}" (auto-detected).`;
}

function render() {
  const tgList = document.getElementById('tg-list');
  tgList.innerHTML = '';
  if (state.telegrams.length === 0) {
    tgList.appendChild(emptyRow('No Telegram targets configured.'));
  } else {
    for (const tg of state.telegrams) tgList.appendChild(renderTgItem(tg));
  }

  const whList = document.getElementById('wh-list');
  whList.innerHTML = '';
  if (state.webhooks.length === 0) {
    whList.appendChild(emptyRow('No webhooks configured.'));
  } else {
    for (const wh of state.webhooks) whList.appendChild(renderWhItem(wh));
  }
}

function emptyRow(text) {
  const div = document.createElement('div');
  div.className = 'empty';
  div.textContent = text;
  return div;
}

function renderTgItem(tg) {
  const tpl = document.getElementById('tg-item');
  const node = tpl.content.firstElementChild.cloneNode(true);
  for (const input of node.querySelectorAll('input[data-k]')) {
    const k = input.dataset.k;
    input.value = tg[k] || '';
    input.oninput = () => {
      tg[k] = input.value;
      scheduleSave();
    };
  }
  const tgDefaults = { includeScreenshot: true, disablePreview: false };
  for (const box of node.querySelectorAll('input[data-kb]')) {
    const k = box.dataset.kb;
    const def = tgDefaults[k];
    box.checked = tg[k] === undefined ? def : !!tg[k];
    box.onchange = () => {
      tg[k] = box.checked;
      scheduleSave();
    };
  }
  const resultEl = node.querySelector('.result');
  node.querySelector('[data-act=remove]').onclick = () => {
    state.telegrams = state.telegrams.filter(x => x.id !== tg.id);
    persistAndRender();
  };
  const testBtn = node.querySelector('[data-act=test]');
  testBtn.onclick = () => runTelegramTest(tg, resultEl, testBtn);
  const connectBtn = node.querySelector('[data-act=connect]');
  connectBtn.onclick = () => startConnectFlow(tg, node);
  return node;
}

function renderWhItem(wh) {
  const tpl = document.getElementById('wh-item');
  const node = tpl.content.firstElementChild.cloneNode(true);
  for (const input of node.querySelectorAll('input')) {
    const k = input.dataset.k;
    input.value = wh[k] || '';
    input.oninput = () => {
      wh[k] = input.value;
      scheduleSave();
    };
  }
  const resultEl = node.querySelector('.result');
  node.querySelector('[data-act=remove]').onclick = () => {
    state.webhooks = state.webhooks.filter(x => x.id !== wh.id);
    persistAndRender();
  };
  const testBtn = node.querySelector('[data-act=test]');
  testBtn.onclick = () => runWebhookTest(wh, resultEl, testBtn);
  return node;
}

async function runTelegramTest(tg, resultEl, btn) {
  await persist();
  resultEl.hidden = false;
  resultEl.className = 'result';
  resultEl.textContent = 'Testing…';
  btn.disabled = true;
  try {
    if (!tg.botToken) throw new Error('Bot token is required.');
    if (!tg.chatId) throw new Error('Chat ID is required.');
    const info = await getTelegramBotInfo(tg.botToken);
    resultEl.textContent = `Bot @${info.username} (${info.first_name}). Sending test message…`;
    await sendTelegram(tg, 'Test message from the Send to Me extension.', 'Send to Me');
    resultEl.className = 'result ok';
    resultEl.textContent = `✓ @${info.username} — test message delivered.`;
  } catch (e) {
    resultEl.className = 'result err';
    resultEl.textContent = '✗ ' + (e.message || String(e));
  } finally {
    btn.disabled = false;
  }
}

async function runWebhookTest(wh, resultEl, btn) {
  await persist();
  resultEl.hidden = false;
  resultEl.className = 'result';
  resultEl.textContent = 'Testing…';
  btn.disabled = true;
  try {
    if (!wh.url) throw new Error('URL is required.');
    await sendWebhook(wh, 'https://example.com/test-url', 'Send to Me — test');
    resultEl.className = 'result ok';
    resultEl.textContent = '✓ Test request delivered (HTTP 2xx).';
  } catch (e) {
    resultEl.className = 'result err';
    resultEl.textContent = '✗ ' + (e.message || String(e));
  } finally {
    btn.disabled = false;
  }
}

const CONNECT_TIMEOUT_MS = 5 * 60 * 1000;

function randomCode(len = 6) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) s += alphabet[buf[i] % alphabet.length];
  return s;
}

async function pollForStart(token, code, { signal, botUsername = '', timeoutMs = CONNECT_TIMEOUT_MS } = {}) {
  const started = Date.now();
  let offset = 0;
  const target = code.toLowerCase();
  const botLower = botUsername.toLowerCase();
  while (!signal || !signal.aborted) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('Timed out waiting for connection. Try again.');
    }
    const url = new URL(`https://api.telegram.org/bot${encodeURIComponent(token)}/getUpdates`);
    url.searchParams.set('timeout', '25');
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('allowed_updates', JSON.stringify(['message']));
    let res;
    try {
      res = await fetch(url.toString(), { signal });
    } catch (e) {
      if (e && e.name === 'AbortError') return null;
      throw e;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.ok) {
      throw new Error((data && data.description) || `HTTP ${res.status}`);
    }
    for (const upd of data.result || []) {
      offset = Math.max(offset, upd.update_id + 1);
      const msg = upd.message;
      if (!msg || !msg.text) continue;
      const text = msg.text.trim().toLowerCase();

      // Strip optional "@botname" suffix on the command, then compare.
      // Accepts: /start CODE | /startCODE | /start@bot CODE | /start@botCODE | CODE
      let payload = null;
      if (text === target) {
        payload = target;
      } else {
        const m = text.match(/^\/start(?:@([a-z0-9_]+))?\s*(.+)?$/);
        if (m) {
          const mentioned = m[1];
          const rest = (m[2] || '').trim();
          if (!mentioned || !botLower || mentioned === botLower) {
            if (rest === target) payload = target;
          }
        }
      }
      if (payload === target) {
        return {
          chatId: String(msg.chat.id),
          topicId: msg.message_thread_id ? String(msg.message_thread_id) : '',
          from: msg.from || null
        };
      }
    }
  }
  return null;
}

async function startConnectFlow(tg, itemNode) {
  const panel = itemNode.querySelector('[data-panel]');
  const actionBtns = itemNode.querySelectorAll('.actions > button');
  const resultEl = itemNode.querySelector('.result');
  resultEl.hidden = true;

  if (itemNode._connectAbort) {
    itemNode._connectAbort.abort();
    itemNode._connectAbort = null;
  }

  panel.hidden = false;
  panel.innerHTML = '<div class="muted">Checking bot…</div>';
  for (const b of actionBtns) b.disabled = true;

  try {
    if (!tg.botToken) throw new Error('Paste the bot token first, then click Connect.');
    await persist();
    const info = await getTelegramBotInfo(tg.botToken);
    const code = randomCode();
    const deepLink = `https://t.me/${info.username}?start=${code}`;

    panel.innerHTML = `
      <div class="connect-head">Link a chat with @${escapeHtml(info.username)}</div>
      <div class="connect-grid">
        <div class="connect-qr"></div>
        <div class="connect-instr">
          <p>Open the bot on the device that should receive messages:</p>
          <div class="btn-row">
            <a class="button-link" target="_blank" rel="noopener">Open in Telegram</a>
          </div>
          <p class="muted">Or scan the QR code. If the bot opens without the deep link, send this code to it as a message:</p>
          <div class="code-display"></div>
          <div class="waiting">
            <div class="spinner spinner-sm"></div><span>Waiting for connection…</span>
          </div>
        </div>
      </div>
      <div class="actions">
        <button data-act="cancel" class="danger">Cancel</button>
      </div>
    `;

    panel.querySelector('.button-link').href = deepLink;
    panel.querySelector('.code-display').textContent = code;

    const qrEl = panel.querySelector('.connect-qr');
    const qr = qrcode(0, 'M');
    qr.addData(deepLink);
    qr.make();
    qrEl.innerHTML = qr.createImgTag(4, 6);

    const controller = new AbortController();
    itemNode._connectAbort = controller;
    panel.querySelector('[data-act=cancel]').onclick = () => controller.abort();

    const found = await pollForStart(tg.botToken, code, {
      signal: controller.signal,
      botUsername: info.username
    });
    if (!found) {
      panel.hidden = true;
      panel.innerHTML = '';
      return;
    }

    tg.chatId = found.chatId;
    if (found.topicId) tg.topicId = found.topicId;
    if (!tg.name && found.from) {
      tg.name = found.from.first_name || found.from.username || tg.name;
    }
    await persist();

    try { await sendConnectConfirmation(tg, found); }
    catch (e) { console.warn('Confirmation message failed:', e && e.message); }

    for (const input of itemNode.querySelectorAll('input[data-k]')) {
      if (input.dataset.k === 'chatId') input.value = tg.chatId || '';
      if (input.dataset.k === 'topicId') input.value = tg.topicId || '';
      if (input.dataset.k === 'name') input.value = tg.name || '';
    }

    panel.innerHTML = `<div class="result ok">✓ Connected: chat ID <code>${escapeHtml(tg.chatId)}</code>${tg.topicId ? `, topic <code>${escapeHtml(tg.topicId)}</code>` : ''}.</div>`;
    setTimeout(() => { panel.hidden = true; panel.innerHTML = ''; }, 4000);
  } catch (e) {
    panel.innerHTML = `
      <div class="result err">✗ ${escapeHtml(e.message || String(e))}</div>
      <div class="actions"><button data-act="close">Close</button></div>
    `;
    panel.querySelector('[data-act=close]').onclick = () => {
      panel.hidden = true;
      panel.innerHTML = '';
    };
  } finally {
    itemNode._connectAbort = null;
    for (const b of actionBtns) b.disabled = false;
  }
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escapeTgHtml(s) {
  return String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

async function sendConnectConfirmation(tg, found) {
  const sentFrom = await resolveSentFrom();
  const lines = [
    `✅ Connected to <b>${escapeTgHtml(APP_NAME)}</b> on <b>${escapeTgHtml(sentFrom)}</b>.`,
    `Links sent from this browser will arrive here.`,
    '',
    `— via <a href="${REPO_URL}">${escapeTgHtml(APP_NAME)}</a>`
  ];
  const body = {
    chat_id: tg.chatId,
    text: lines.join('\n'),
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };
  if (found.topicId) body.message_thread_id = Number(found.topicId);
  const res = await fetch(
    `https://api.telegram.org/bot${encodeURIComponent(tg.botToken)}/sendMessage`,
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

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 300);
}

async function persist() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  await saveState(state);
}

async function persistAndRender() {
  await persist();
  render();
}

init();
