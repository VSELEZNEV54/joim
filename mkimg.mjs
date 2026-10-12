#!/usr/bin/env node
// Лёгкие копии кадров для галереи карточки товара (src/templates/product.html). Ничего не скачивает: читает исходники
// с локального сервера и кодирует их в headless Chrome (WebP с альфа-каналом). Запускать после добавления кадров в store/assets/img/deck/:
//   node .claude/serve.mjs store 4173   (в соседнем окне)
//   node mkimg.mjs [origin]              по умолчанию http://localhost:4173
// Рядом с каждым исходником es*, pvc*, photo-* появляется:
//   <файл>.thumb.webp  миниатюра для ленты галереи: короткая сторона 144 px (она же служит размытой подложкой тёмного кадра)
//   <файл>.webp        лёгкая копия комплекта на прозрачном фоне (только *-kit.png): ширина до 1200 px, альфа сохранена
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const origin = process.argv[2] || 'http://localhost:4173';
const deck = process.argv[3] || path.join(path.dirname(fileURLToPath(import.meta.url)), 'store/assets/img/deck');
const files = readdirSync(deck).filter((f) => /^(es\d+|pvc\d+|photo-)[\w-]*\.(jpg|png)$/.test(f)).sort();

const profile = mkdtempSync(path.join(tmpdir(), 'mkimg-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--mute-audio', '--disable-gpu', '--window-size=800,600', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const done = (code) => { try { chrome.kill('SIGKILL'); } catch {} setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(code); }, 300); };

const pageFn = `
async function encode(url, mode) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  const blob = await res.blob();
  const full = await createImageBitmap(blob);
  let w = full.width, h = full.height, q = 0.8;
  if (mode === 'thumb') { const k = 144 / Math.min(w, h); w = Math.round(w * k); h = Math.round(h * k); q = 0.78; }
  else { const k = Math.min(1, 1200 / w); w = Math.round(w * k); h = Math.round(h * k); q = 0.78; }
  const bmp = (w === full.width && h === full.height) ? full : await createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0);
  const out = c.toDataURL('image/webp', q);
  if (!out.startsWith('data:image/webp')) throw new Error('webp encoder is not available');
  return JSON.stringify({ w, h, data: out.slice(out.indexOf(',') + 1) });
}`;

try {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  const port = readFileSync(portFile, 'utf8').split('\n')[0].trim();
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: origin + '/404.html' }); await sleep(2500);
  console.log('page:', await ev('location.href'));
  await ev(pageFn + '; window.__encode = encode; 1');
  let total = 0;
  for (const f of files) {
    const jobs = [['thumb', `${f}.thumb.webp`]];
    if (/-kit\.png$/.test(f)) jobs.push(['kit', `${f}.webp`]);
    for (const [mode, name] of jobs) {
      const r = JSON.parse(await ev(`window.__encode(${JSON.stringify(`${origin}/assets/img/deck/${f}`)}, ${JSON.stringify(mode)})`));
      const buf = Buffer.from(r.data, 'base64');
      writeFileSync(path.join(deck, name), buf);
      total += buf.length;
      console.log(`${name.padEnd(34)} ${String(r.w).padStart(4)}×${String(r.h).padEnd(4)} ${(buf.length / 1024).toFixed(1).padStart(7)} КБ   (исходник ${(statSync(path.join(deck, f)).size / 1024).toFixed(0)} КБ)`);
    }
  }
  console.log(`Готово: ${files.length} исходников, записано ${(total / 1024).toFixed(0)} КБ`);
  ws.close(); done(0);
} catch (e) { console.error('mkimg failed:', e?.message || e); done(1); }
