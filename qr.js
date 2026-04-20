(function () {
  const url = new URLSearchParams(location.search).get('url') || '';
  document.getElementById('url').textContent = url;
  if (!url) return;
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  document.getElementById('qr').innerHTML = qr.createImgTag(6, 10);
})();
