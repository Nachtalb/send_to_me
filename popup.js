(async function main() {
  const root = document.getElementById('root');
  root.className = '';

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    root.innerHTML = '<div class="status err">No active tab.</div>';
    return;
  }
  const url = tab.url;
  const title = tab.title || '';

  const state = await loadState();
  const targets = listTargets(state);

  if (targets.length === 0) {
    renderQr(root, url);
    return;
  }

  renderSending(root, url, targets);
  try {
    const response = await chrome.runtime.sendMessage({ type: 'sendAll', url, title });
    renderResults(root, url, response);
  } catch (e) {
    root.innerHTML = `<div class="status err">${escapeHtml(e.message || String(e))}</div>`;
  }
})();

function renderQr(root, url) {
  root.innerHTML = `
    <div class="qr-wrap">
      <div class="muted">No backends configured. Scan to open on another device:</div>
      <div id="qr"></div>
      <div class="url"></div>
      <div class="actions-row">
        <button id="open-settings">Open settings</button>
      </div>
    </div>
  `;
  root.querySelector('.url').textContent = url;
  renderQrInto(document.getElementById('qr'), url);
  document.getElementById('open-settings').onclick = () => chrome.runtime.openOptionsPage();
}

function renderQrInto(el, url) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  el.innerHTML = qr.createImgTag(5, 8);
}

function renderSending(root, url, targets) {
  root.innerHTML = `
    <div class="status">
      <div class="spinner"></div>
      <div>Sending to ${targets.length} target${targets.length > 1 ? 's' : ''}…</div>
      <div class="url"></div>
    </div>
  `;
  root.querySelector('.url').textContent = url;
}

function renderResults(root, url, response) {
  if (!response || !response.ok) {
    const msg = (response && response.error) || 'Background worker unavailable';
    root.innerHTML = `<div class="status err">Error: ${escapeHtml(msg)}</div>`;
    return;
  }
  const results = response.results || [];
  const ok = results.filter(r => r.ok).length;
  const fail = results.length - ok;

  const rowHtml = results.map(r => {
    const cls = r.ok ? 'ok' : 'err';
    const mark = r.ok ? '✓' : '✗';
    const err = r.ok ? '' : `<span class="err-msg">${escapeHtml(r.error || '')}</span>`;
    return `<div class="row ${cls}"><span class="mark">${mark}</span><span class="name">${escapeHtml(r.target.name)}</span>${err}</div>`;
  }).join('');

  const summary = fail === 0
    ? `Sent ✓`
    : (ok === 0 ? 'Send failed' : `Sent ${ok}/${results.length}`);

  root.innerHTML = `
    <div class="results">
      <div class="summary">${summary}</div>
      <div class="url"></div>
      <div class="list">${rowHtml}</div>
      <div class="actions-row">
        <button id="retry" class="ghost">Retry</button>
        <button id="open-settings">Settings</button>
      </div>
    </div>
  `;
  root.querySelector('.url').textContent = url;
  document.getElementById('open-settings').onclick = () => chrome.runtime.openOptionsPage();
  document.getElementById('retry').onclick = () => location.reload();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
