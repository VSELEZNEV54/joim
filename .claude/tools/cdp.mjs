// Общая часть shot.mjs и probe.mjs: headless Chrome через DevTools Protocol, без зависимостей (Node 22+: встроенный WebSocket).
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export function parseArgs(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next == null || next.startsWith('--')) opt[key] = true;
    else { opt[key] = next; i += 1; }
  }
  return { pos, opt };
}

export function viewportFrom(opt) {
  if (opt.mobile) return { width: +(opt.w || 390), height: +(opt.h || 844), dpr: 2, mobile: true };
  return { width: +(opt.w || 1440), height: +(opt.h || 900), dpr: +(opt.dpr || 1), mobile: false };
}

export async function launch({ width, height, dpr, mobile, reduced }) {
  const profile = await mkdtemp(path.join(tmpdir(), 'joim-chrome-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
    '--disable-sync', '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb',
    `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('Chrome не отдал адрес DevTools за 20 с')), 20000);
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    proc.on('exit', (code) => { clearTimeout(timer); reject(new Error('Chrome завершился с кодом ' + code + ': ' + buf.slice(0, 400))); });
  });

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', () => rej(new Error('нет соединения с DevTools')), { once: true }); });
  let seq = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message + (msg.error.data ? ': ' + msg.error.data : '')));
      else resolve(msg.result);
    } else if (msg.method) for (const fn of listeners) fn(msg);
  });
  const sendRaw = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  const { targetId } = await sendRaw('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await sendRaw('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => sendRaw(method, params, sessionId);
  const on = (fn) => listeners.push((msg) => { if (msg.sessionId === sessionId) fn(msg.method, msg.params); });

  const log = { console: [], network: [] };
  const requests = new Map();
  on((method, p) => {
    if (method === 'Runtime.consoleAPICalled' && (p.type === 'error' || p.type === 'assert')) log.console.push(p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    if (method === 'Runtime.exceptionThrown') log.console.push('EXCEPTION ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text || '').slice(0, 300));
    if (method === 'Log.entryAdded' && p.entry.level === 'error') log.console.push(`LOG ${p.entry.text} ${p.entry.url || ''}`.slice(0, 300));
    if (method === 'Network.requestWillBeSent') requests.set(p.requestId, p.request.url);
    if (method === 'Network.responseReceived' && p.response.status >= 400) log.network.push(`HTTP ${p.response.status} ${p.response.url}`);
    if (method === 'Network.loadingFailed' && !p.canceled) log.network.push(`NET FAIL ${p.errorText} ${requests.get(p.requestId) || ''}`);
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: !!mobile });
  if (mobile) {
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  }
  if (reduced) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

  const evaluate = async (expression, awaitPromise = true) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function goto(url) {
    const loaded = new Promise((resolve) => { on((m) => { if (m === 'Page.loadEventFired') resolve(); }); });
    const nav = await send('Page.navigate', { url });
    if (nav.errorText) throw new Error(`не открылась ${url}: ${nav.errorText}`);
    await Promise.race([loaded, sleep(25000)]);
    await evaluate('document.fonts ? document.fonts.ready.then(() => true) : true').catch(() => {});
    await sleep(350);
  }
  // прокрутка по всей странице: подгружаются картинки с loading="lazy"; затем ждём их и возвращаемся наверх
  async function warm() {
    await evaluate(`(async () => {
      const h = () => document.documentElement.scrollHeight;
      for (let y = 0; y < h(); y += Math.round(innerHeight * .8)) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 90)); }
      scrollTo(0, h());
      await new Promise((r) => setTimeout(r, 150));
      const imgs = [...document.images].filter((i) => !i.complete);
      await Promise.race([Promise.all(imgs.map((i) => new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }))), new Promise((r) => setTimeout(r, 12000))]);
      scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 250));
      return true;
    })()`);
  }
  async function screenshot(file, { quality = 82 } = {}) {
    const { data } = await send('Page.captureScreenshot', { format: 'jpeg', quality, captureBeyondViewport: false });
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, Buffer.from(data, 'base64'));
    return file;
  }
  async function close() {
    try { ws.close(); } catch { /* уже закрыт */ }
    proc.kill('SIGKILL');
    await sleep(150);
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  }
  return { send, on, evaluate, goto, warm, screenshot, close, sleep, log };
}

export const pageFacts = `(() => ({
  height: document.documentElement.scrollHeight,
  width: innerWidth,
  brokenImages: [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && (i.currentSrc || i.src)).map((i) => i.currentSrc || i.src),
  fonts: document.fonts ? [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '') + ' ' + f.weight))] : [],
  overflowX: [...document.querySelectorAll('body *')].filter((el) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false; if (r.right <= innerWidth + 1 && r.left >= -1) return false; let p = el.parentElement; while (p && p !== document.body) { const s = getComputedStyle(p); if (/(hidden|clip|auto|scroll)/.test(s.overflowX)) return false; p = p.parentElement; } return getComputedStyle(el).position !== 'fixed' || r.right > innerWidth + 1; }).slice(0, 8).map((el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '') + ' right=' + Math.round(el.getBoundingClientRect().right) + ' left=' + Math.round(el.getBoundingClientRect().left)),
}))()`;
