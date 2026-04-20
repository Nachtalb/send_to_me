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

  renderShell(root, url, targets.length);
  renderQrInto(document.getElementById('qr'), url);

  document.getElementById('open-settings').onclick = () => chrome.runtime.openOptionsPage();
  const copyBtn = document.getElementById('copy-url');
  if (copyBtn) {
    copyBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        copyBtn.textContent = 'Copied';
        setTimeout(() => { copyBtn.textContent = 'Copy URL'; }, 1200);
      } catch (_) {}
    };
  }

  if (targets.length === 0) return;

  try {
    const response = await chrome.runtime.sendMessage({ type: 'sendAll', url, title });
    renderResults(document.getElementById('send-section'), response);
  } catch (e) {
    const sec = document.getElementById('send-section');
    sec.innerHTML = `<div class="status err">${escapeHtml(e.message || String(e))}</div>`;
  }
})();

function renderShell(root, url, targetCount) {
  const sendSection = targetCount > 0
    ? `
      <div class="send-section" id="send-section">
        <div class="status">
          <div class="spinner"></div>
          <div>Sending to ${targetCount} target${targetCount > 1 ? 's' : ''}…</div>
        </div>
      </div>
    `
    : `<div class="muted">No backends configured. Scan the QR code above to open on another device.</div>`;

  root.innerHTML = `
    <div class="qr-wrap">
      <div id="qr"></div>
      <div class="url"></div>
      <div class="actions-row">
        <button id="copy-url" class="ghost">Copy URL</button>
        <button id="open-settings" class="ghost">Settings</button>
      </div>
    </div>
    ${sendSection}
  `;
  root.querySelector('.url').textContent = url;
}

function renderQrInto(el, url) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  el.innerHTML = qr.createImgTag(5, 8);
}

function renderResults(section, response) {
  if (!response || !response.ok) {
    const msg = (response && response.error) || 'Background worker unavailable';
    section.innerHTML = `<div class="status err">Error: ${escapeHtml(msg)}</div>`;
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

  section.innerHTML = `
    <div class="results">
      <div class="summary">${summary}</div>
      <div class="list">${rowHtml}</div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
