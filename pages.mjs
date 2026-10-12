// Копия сайта для хостинга в подпапке (GitHub Pages): node pages.mjs [--base /joim/docs] [--out docs]
// Сборка в store/ рассчитана на корень домена (пути вида /assets/…, /catalog/…).
// GitHub Pages отдаёт репозиторий по адресу /<имя репозитория>/, поэтому здесь все корневые пути
// получают приставку base. Запускать после node build.mjs.
import { cp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const base = opt('base', '/joim/docs').replace(/\/+$/, '');
const out = path.join(root, opt('out', 'docs'));
const src = path.join(root, 'store');

// разделы сайта: по ним узнаём корневые пути внутри строк JS
const sections = 'assets|catalog|product|cart|compare|podbor|favorites|delivery|reviews|faq|warranty|gifts|zima|corporate|about|contacts|blog|instructions|oplata-chastyami|privacy|offer';

const fixAttrs = (s) => s
  // href="/…", src="/…", data-full="/…" и подобные (но не //cdn и не https://)
  .replace(/(\s(?:href|src|action|poster|content|data-[a-z-]+)=\\?")\/(?!\/)/g, `$1${base}/`)
  // srcset="/a.jpg 1x, /b.jpg 2x"
  .replace(/(\ssrcset=\\?")([^"]*)/g, (m, a, v) => a + v.replace(/(^|,\s*)\/(?!\/)/g, `$1${base}/`))
  // url(/…) в style и в <style>
  .replace(/url\((["']?)\/(?!\/)/g, `url($1${base}/`);

const fixJs = (s) => fixAttrs(s)
  // строки вида "/product/…", '/assets/…', `/cart/`
  .replace(new RegExp(`(["'\`])\\/(?=(?:${sections})(?:[\\/"'\`?#]))`, 'g'), `$1${base}/`);

async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, e.name);
    if (e.isDirectory()) { await walk(file); continue; }
    const ext = path.extname(e.name).toLowerCase();
    if (!['.html', '.css', '.js'].includes(ext)) continue;
    const text = await readFile(file, 'utf8');
    const next = ext === '.js' ? fixJs(text) : fixAttrs(text);
    if (next !== text) await writeFile(file, next);
  }
}

await rm(out, { recursive: true, force: true });
await cp(src, out, { recursive: true });
await walk(out);
console.log(`${path.relative(root, out)}/ готово, приставка путей: ${base}`);
