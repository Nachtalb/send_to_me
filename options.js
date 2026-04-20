let state = { telegrams: [], webhooks: [] };
let saveTimer = null;

async function init() {
  state = await loadState();
  render();
  document.getElementById('add-tg').onclick = () => {
    state.telegrams.push({ id: uuid(), name: '', botToken: '', chatId: '', topicId: '' });
    persistAndRender();
  };
  document.getElementById('add-wh').onclick = () => {
    state.webhooks.push({ id: uuid(), name: '', url: '' });
    persistAndRender();
  };
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
  for (const input of node.querySelectorAll('input')) {
    const k = input.dataset.k;
    input.value = tg[k] || '';
    input.oninput = () => {
      tg[k] = input.value;
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
