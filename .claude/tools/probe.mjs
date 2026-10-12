#!/usr/bin/env node
// Проба состояния страницы: выполняет JS в странице и по желанию снимает экран ПОСЛЕ выполнения.
//   node probe.mjs "<url>" [--mobile] [--w 1024 --h 768] [--scroll "<селектор или px>"] [--js "<выражение JS>"] [--jsfile файл.js] [--shot "<путь>.jpg"] [--reduced] [--wait мс]
// Выражение может быть асинхронным (возвращать Promise). Результат печатается как JSON вместе с ошибками консоли и сети.
import { readFile } from 'node:fs/promises';
import { launch, parseArgs, viewportFrom } from './cdp.mjs';

const { pos, opt } = parseArgs(process.argv.slice(2));
const [url] = pos;
if (!url) { console.error('Нужно: node probe.mjs "<url>" [--js "<выражение>"] [--shot "<путь>.jpg"]'); process.exit(2); }
const vp = viewportFrom(opt);

const b = await launch({ ...vp, reduced: !!opt.reduced });
try {
  await b.goto(url);
  if (!opt.nowarm) await b.warm();
  await b.sleep(+(opt.wait || 600));
  if (opt.scroll != null && opt.scroll !== true) {
    const s = String(opt.scroll);
    if (/^\d+$/.test(s)) await b.evaluate(`scrollTo(0, ${s}); true`);
    else await b.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(s)}); if (!el) return false; const r = el.getBoundingClientRect(); scrollTo(0, Math.max(0, scrollY + r.top - 96)); return true; })()`);
    await b.sleep(450);
  }
  let result;
  const code = opt.jsfile ? await readFile(String(opt.jsfile), 'utf8') : (opt.js && opt.js !== true ? String(opt.js) : '');
  if (code) {
    try { result = await b.evaluate(code); } catch (e) { result = { error: e.message }; }
    await b.sleep(+(opt.after || 500));
  }
  if (opt.shot && opt.shot !== true) await b.screenshot(String(opt.shot));
  console.log(JSON.stringify({ url, viewport: `${vp.width}x${vp.height}${vp.mobile ? ' mobile' : ''}`, result, consoleErrors: b.log.console, networkErrors: b.log.network, shot: opt.shot && opt.shot !== true ? opt.shot : undefined }, null, 1));
} catch (e) {
  console.error('ОШИБКА: ' + e.message);
  process.exitCode = 1;
} finally {
  await b.close();
}
