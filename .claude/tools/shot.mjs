#!/usr/bin/env node
// Скриншоты страницы по экранам.
//   node shot.mjs "<url>" "<папка кадров>" --name <имя> [--max 14] [--mobile] [--w 1920 --h 1080] [--reduced] [--from <px>] [--only <n>]
// Печатает JSON: высота страницы, битые картинки, ошибки консоли и сети, загруженные шрифты, переполнение по горизонтали, список кадров.
import path from 'node:path';
import { launch, parseArgs, viewportFrom, pageFacts } from './cdp.mjs';

const { pos, opt } = parseArgs(process.argv.slice(2));
const [url, outDir] = pos;
if (!url || !outDir) { console.error('Нужно: node shot.mjs "<url>" "<папка>" --name <имя> [--max 14] [--mobile] [--w --h] [--reduced]'); process.exit(2); }
const vp = viewportFrom(opt);
const name = opt.name || 'page';
const max = +(opt.max || 14);
const suffix = vp.mobile ? `m${vp.width}` : `${vp.width}`;

const b = await launch({ ...vp, reduced: !!opt.reduced });
try {
  await b.goto(url);
  await b.warm();
  await b.sleep(+(opt.wait || 1200)); // печать заголовка и появление блоков
  const facts = await b.evaluate(pageFacts);
  const frames = [];
  const total = Math.max(1, Math.ceil(facts.height / vp.height));
  const count = opt.only ? 1 : Math.min(max, total);
  const start = +(opt.from || 0);
  for (let i = 0; i < count; i += 1) {
    const y = Math.min(start + i * vp.height, Math.max(0, facts.height - vp.height));
    await b.evaluate(`scrollTo(0, ${y}); new Promise((r) => requestAnimationFrame(() => setTimeout(() => r(true), 320)))`);
    const file = path.join(outDir, `${name}-${suffix}-${String(i + 1).padStart(2, '0')}.jpg`);
    await b.screenshot(file);
    frames.push(file);
    if (y >= facts.height - vp.height) break;
  }
  console.log(JSON.stringify({ url, viewport: `${vp.width}x${vp.height}${vp.mobile ? ' mobile' : ''}`, pageHeight: facts.height, screens: total, brokenImages: facts.brokenImages, consoleErrors: b.log.console, networkErrors: b.log.network, fonts: facts.fonts, overflowX: facts.overflowX, frames }, null, 1));
} catch (e) {
  console.error('ОШИБКА: ' + e.message);
  process.exitCode = 1;
} finally {
  await b.close();
}
