const enc = new TextEncoder();
const badge = (t, c) => { chrome.action.setBadgeText({ text: t }); if (c) chrome.action.setBadgeBackgroundColor({ color: c }); };

// Runs inside the Etsy page
function extractListing() {
  const h1 = document.querySelector('h1[data-buy-box-listing-title], h1');
  const title = (h1 ? h1.textContent : document.title).replace(/\s+/g, ' ').trim();
  const seen = new Set(), urls = [];
  document.querySelectorAll('[data-carousel-pane] img, img[data-src-zoom-image]').forEach(img => {
    let u = img.getAttribute('data-src-zoom-image') || img.getAttribute('src') || '';
    if (!u || !u.includes('etsystatic.com')) return;
    u = u.replace(/il_\d+x[\dN]+\./, 'il_fullxfull.');
    const key = (u.match(/il_fullxfull\.(\d+)/) || [])[1] || u;
    if (seen.has(key)) return; seen.add(key); urls.push(u);
  });
  return { title, urls };
}

function jpegInfo(b) {
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xC0 && m <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(m))
      return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], comps: b[i + 9] };
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}

async function toJpeg(buf) {
  let b = new Uint8Array(buf);
  if (b[0] === 0xFF && b[1] === 0xD8) { const info = jpegInfo(b); if (info) return { bytes: b, ...info }; }
  const bmp = await createImageBitmap(new Blob([buf]));
  const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0);
  b = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.95 })).arrayBuffer());
  return { bytes: b, ...jpegInfo(b) };
}

async function titleImage(title) {
  const W = 1600, pad = 40, font = 'bold 76px Georgia, "Times New Roman", serif';
  const m = new OffscreenCanvas(10, 10).getContext('2d'); m.font = font;
  const lines = []; let line = '';
  for (const w of title.split(' ')) {
    const t = line ? line + ' ' + w : w;
    if (m.measureText(t).width > W - pad * 2 && line) { lines.push(line); line = w; } else line = t;
  }
  lines.push(line);
  const lh = 100, H = pad * 2 + lines.length * lh + 30;
  const c = new OffscreenCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#1a1a1a'; g.font = font; g.textBaseline = 'top';
  lines.forEach((l, i) => g.fillText(l, pad, pad + i * lh));
  g.fillStyle = '#b08d57'; g.fillRect(pad, H - 24, W - pad * 2, 4);
  const bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.95 })).arrayBuffer());
  return { bytes, w: W, h: H, comps: 3 };
}

function buildPdf(pages) {
  const objs = [null, null]; // 1 catalog, 2 pages
  const add = c => { objs.push(c); return objs.length; };
  const pageIds = [];
  for (const p of pages) {
    const xo = [];
    let content = '';
    p.items.forEach((it, k) => {
      const id = add([`<< /Type /XObject /Subtype /Image /Width ${it.img.w} /Height ${it.img.h} /ColorSpace ${it.img.comps === 1 ? '/DeviceGray' : '/DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${it.img.bytes.length} >>\nstream\n`, it.img.bytes, '\nendstream']);
      xo.push(`/Im${k} ${id} 0 R`);
      content += `q ${it.w.toFixed(2)} 0 0 ${it.h.toFixed(2)} ${it.x.toFixed(2)} ${it.y.toFixed(2)} cm /Im${k} Do Q\n`;
    });
    const cid = add([`<< /Length ${content.length} >>\nstream\n${content}endstream`]);
    pageIds.push(add([`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << ${xo.join(' ')} >> >> /Contents ${cid} 0 R >>`]));
  }
  objs[0] = ['<< /Type /Catalog /Pages 2 0 R >>'];
  objs[1] = [`<< /Type /Pages /Kids [${pageIds.map(i => i + ' 0 R').join(' ')}] /Count ${pageIds.length} >>`];
  const out = []; let len = 0; const offs = [];
  const push = d => { const u = typeof d === 'string' ? enc.encode(d) : d; out.push(u); len += u.length; };
  push('%PDF-1.4\n');
  objs.forEach((o, i) => { offs.push(len); push(`${i + 1} 0 obj\n`); o.forEach(push); push('\nendobj\n'); });
  const xr = len;
  push(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
  push(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`);
  return new Blob(out, { type: 'application/pdf' });
}

function layout(title, imgs) {
  const PW = 595.28, PH = 841.89, M = 36, pages = [];
  let cur = { items: [] }, y = PH - M;
  const t = title;
  const tw = PW - M * 2, th = tw * t.h / t.w;
  cur.items.push({ img: t, x: M, y: y - th, w: tw, h: th }); y -= th + 12;
  for (const im of imgs) {
    const maxW = PW - M * 2;
    let avail = y - M, w = maxW, h = w * im.h / im.w;
    if (cur.items.length && avail < 220) { pages.push(cur); cur = { items: [] }; y = PH - M; avail = y - M; }
    if (h > avail) { h = avail; w = h * im.w / im.h; }
    cur.items.push({ img: im, x: (PW - w) / 2, y: y - h, w, h });
    pages.push(cur); cur = { items: [] }; y = PH - M;
  }
  if (cur.items.length) pages.push(cur);
  return pages;
}

chrome.action.onClicked.addListener(async tab => {
  try {
    badge('...', '#555');
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractListing });
    if (!result.urls.length) throw new Error('No images found');
    const imgs = await Promise.all(result.urls.map(async u => {
      const r = await fetch(u); if (!r.ok) throw new Error('Image fetch failed');
      return toJpeg(await r.arrayBuffer());
    }));
    const tImg = await titleImage(result.title);
    const blob = buildPdf(layout(tImg, imgs));
    const dataUrl = await new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = rej; f.readAsDataURL(blob); });
    const name = result.title.replace(/[\\/:*?"<>|]+/g, '').slice(0, 100).trim() || 'etsy-listing';
    await chrome.downloads.download({ url: dataUrl, filename: name + '.pdf' });
    badge('OK', '#2e7d32'); setTimeout(() => badge(''), 3000);
  } catch (e) { console.error(e); badge('ERR', '#c62828'); setTimeout(() => badge(''), 4000); }
});
