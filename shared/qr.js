// shared/qr.js
// Draws QR codes ourselves, with no call to any outside service.
//
// Why: the QR codes used to come from api.qrserver.com. If that service were hacked it could
// return a QR with another wallet address, and people scanning it would pay the attacker (a
// crypto payment cannot be undone). Now the QR is built from the same address we show as text.
//
// Used by: api/bio.js and shared/landing-blocks.js (on the server, as an SVG), and by pay.html,
// pay2.html, pay5.html, tx.html and checkout.html in the browser (SVG, or PNG for receipts).
//
// The QR math is the MIT licensed "qrcode-generator" library (Kazuhiko Arase), copied
// unchanged to shared/vendor/qrcode-generator.js (version 2.0.4).

import qrcode from './vendor/qrcode-generator.js';

function build(text) {
  const qr = qrcode(0, 'M'); // size picked automatically, medium error correction
  qr.addData(String(text));
  qr.make();
  return qr;
}

// QR as an SVG string. `margin` is the white border in modules (4 is the official minimum;
// 2 is enough for modern phone cameras and keeps the code large inside small frames).
export function qrSvg(text, opts) {
  const o = opts || {};
  const margin = o.margin == null ? 2 : o.margin;
  const dark = o.dark || '#000000';
  const light = o.light || '#ffffff';
  const qr = build(text);
  const n = qr.getModuleCount();
  const size = n + margin * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!qr.isDark(r, c)) { c++; continue; }
      let run = 0;
      while (c + run < n && qr.isDark(r, c + run)) run++;
      d += 'M' + (c + margin) + ' ' + (r + margin) + 'h' + run + 'v1h-' + run + 'z';
      c += run;
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + size + ' ' + size + '" shape-rendering="crispEdges">' +
    '<rect width="' + size + '" height="' + size + '" fill="' + light + '"/>' +
    '<path d="' + d + '" fill="' + dark + '"/></svg>';
}

// Same QR as a data: URI, ready for <img src="...">.
export function qrSvgDataUri(text, opts) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qrSvg(text, opts));
}

// Browser only: QR as a PNG data URI. Receipts are saved as an image or PDF with html2canvas,
// and a plain PNG is the most reliable thing for it to capture.
export function qrPngDataUri(text, opts) {
  const o = opts || {};
  const margin = o.margin == null ? 2 : o.margin;
  const px = o.size || 600;
  const qr = build(text);
  const n = qr.getModuleCount();
  const total = n + margin * 2;
  const cell = Math.max(1, Math.floor(px / total));
  const side = cell * total;
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = o.light || '#ffffff';
  ctx.fillRect(0, 0, side, side);
  ctx.fillStyle = o.dark || '#000000';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
    }
  }
  return canvas.toDataURL('image/png');
}
