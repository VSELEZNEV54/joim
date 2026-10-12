#!/usr/bin/env node
// Контактный лист: несколько кадров на одной картинке (для общего взгляда на страницу).
//   node sheet.mjs "<итог>.jpg" [--cols 4] [--cw 480] <кадр1.jpg> <кадр2.jpg> ...
import { writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, parseArgs } from './cdp.mjs';

const { pos, opt } = parseArgs(process.argv.slice(2));
const [out, ...frames] = pos;
if (!out || !frames.length) { console.error('Нужно: node sheet.mjs "<итог>.jpg" [--cols 4] [--cw 480] кадры…'); process.exit(2); }
const cols = +(opt.cols || Math.min(4, frames.length));
const cw = +(opt.cw || 480);
const width = cols * cw + (cols + 1) * 8;
const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:8px;background:#444;display:grid;grid-template-columns:repeat(${cols},${cw}px);gap:8px;align-items:start}img{width:100%;display:block}</style>${frames.map((f) => `<img src="${pathToFileURL(path.resolve(f)).href}">`).join('')}`;
const tmp = path.join(path.dirname(path.resolve(out)), `.sheet-${process.pid}.html`);
await writeFile(tmp, html);
const b = await launch({ width, height: 800, dpr: 1, mobile: false });
try {
  await b.goto(pathToFileURL(tmp).href);
  await b.sleep(300);
  const h = Math.ceil(await b.evaluate("document.body.getBoundingClientRect().height"));
  await b.send('Emulation.setDeviceMetricsOverride', { width, height: Math.min(h, 6000), deviceScaleFactor: 1, mobile: false });
  await b.sleep(200);
  await b.screenshot(path.resolve(out), { quality: 80 });
  console.log(path.resolve(out), `${width}x${Math.min(h, 6000)}`);
} finally {
  await b.close();
  await unlink(tmp).catch(() => {});
}
