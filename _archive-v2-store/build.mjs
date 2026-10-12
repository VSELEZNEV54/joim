#!/usr/bin/env node
// Сборка магазина JOIM: src/ → store/. Node без зависимостей.
//   node build.mjs              все страницы и заглушки
//   node build.mjs hub          одна страница по имени файла src/pages/<имя>.html (можно несколько имён)
//   node build.mjs stubs        только заглушки из src/routes.json
//   node build.mjs --list       показать маршруты и выйти
// Сборка идемпотентна: файл переписывается только если изменился, запись атомарная (tmp + rename),
// папка store/ никогда не очищается, поэтому параллельные запуски друг другу не мешают.
// Каждый запуск также обновляет store/sitemap.xml (только настоящие страницы) и store/robots.txt.
import { readFile, writeFile, mkdir, rename, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'store');
const NBSP = ' ';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const names = args.filter((a) => !a.startsWith('--')).map((a) => a.replace(/\.html$/, ''));

const warnings = [];
const errors = [];
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

/* ---------- чтение исходников ---------- */

const read = (p) => readFile(p, 'utf8');
const readJson = async (p) => JSON.parse(await read(p));

async function loadPartials() {
  const dir = path.join(SRC, 'partials');
  const out = {};
  for (const f of (await readdir(dir)).filter((x) => x.endsWith('.html')).sort()) {
    out[f.replace(/\.html$/, '')] = (await read(path.join(dir, f))).replace(/\s+$/, '');
  }
  return out;
}

// Справочник товаров живёт в store/assets/js/main.js (единственный источник цен и картинок).
// Сборка читает его между метками /*catalog:start*/ и /*catalog:end*/ и дополняет полями из src/data/products.json.
async function loadProducts() {
  const js = await read(path.join(OUT, 'assets/js/main.js'));
  const m = js.match(/\/\*catalog:start\*\/([\s\S]*?)\/\*catalog:end\*\//);
  if (!m) throw new Error('store/assets/js/main.js: не найден блок /*catalog:start*/ … /*catalog:end*/');
  let catalog;
  try { catalog = JSON.parse(m[1]); } catch (e) { throw new Error(`store/assets/js/main.js: справочник товаров должен быть строгим JSON (${e.message})`); }
  const extra = await readJson(path.join(SRC, 'data/products.json'));
  const products = {};
  for (const [id, base] of Object.entries(catalog)) {
    const p = { id, ...base, ...(extra[id] || {}) };
    p.priceFmt = formatPrice(p.price);
    p.priceHtml = p.priceFmt.replaceAll(NBSP, '&nbsp;');
    p.ratingFmt = p.rating != null ? Number(p.rating).toFixed(1).replace('.', ',') : '';
    p.reviewsFmt = p.reviews != null ? `${p.reviews}${NBSP}${plural(p.reviews, ['отзыв', 'отзыва', 'отзывов'])}` : '';
    p.reviewsHtml = p.reviewsFmt.replaceAll(NBSP, '&nbsp;');
    products[id] = p;
  }
  return products;
}

function formatPrice(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) + NBSP + '₽';
}
function plural(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/* ---------- мини-шаблонизатор ----------
   {{имя}}            значение с экранированием        {{{имя}}}          значение как есть (HTML)
   {{#if имя}}…{{else}}…{{/if}}   {{#if !имя}}…{{/if}}  {{#each список}}…{{/each}}
   {{> partial арг}}  вставка src/partials/partial.html (арг = id товара → поля товара доступны по имени)
   {{icon имя}}       иконка из спрайта                 {{price id}}       цена товара с неразрывными пробелами */

const escapeHtml = (s) => String(s)
  .replace(/&(?!(?:[a-zA-Z]+|#\d+|#x[\da-fA-F]+);)/g, '&amp;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const decodeEntities = (s) => String(s)
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#(\d+);/g, (_, n) => (n === '8209' ? '-' : String.fromCodePoint(+n)))
  .replace(/&[a-zA-Z]+;/g, '·');
const lookup = (ctx, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ctx);

function iconHtml(name, cls) {
  return `<svg class="icon${cls ? ' ' + cls.trim() : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
}

function render(tpl, ctx, where, stack = []) {
  let out = tpl;
  out = out.replace(/\{\{#each\s+([\w.]+)\s*\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, key, inner) => {
    const list = lookup(ctx, key);
    if (!Array.isArray(list)) return '';
    return list.map((item, index) => render(inner, { ...ctx, ...(item && typeof item === 'object' ? item : { value: item }), index }, where, stack)).join('');
  });
  out = out.replace(/\{\{#if\s+(!?)([\w.]+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, neg, key, inner) => {
    const [yes, no = ''] = inner.split('{{else}}');
    const v = lookup(ctx, key);
    const truthy = Array.isArray(v) ? v.length > 0 : !!v;
    return (neg ? !truthy : truthy) ? yes : no;
  });
  out = out.replace(/\{\{>\s*([\w-]+)([^{}]*)\}\}/g, (m, name, rest) => {
    const list = rest.trim().split(/\s+/).filter(Boolean);
    if (!(name in ctx.partials)) { warn(where, `нет partial «${name}»`); return m; }
    if (stack.includes(name)) throw new Error(`partial «${name}» включает сам себя`);
    const sub = { ...ctx, args: list, arg: list[0] || '' };
    const product = ctx.products?.[list[0]];
    if (product) Object.assign(sub, product, { product });
    return render(ctx.partials[name], sub, where, [...stack, name]);
  });
  out = out.replace(/\{\{icon\s+([\w-]+)((?:\s+[\w-]+)*)\s*\}\}/g, (_, name, cls) => {
    if (ctx.icons && !ctx.icons.has(name)) warn(where, `нет иконки «${name}» в спрайте`);
    return iconHtml(name, cls);
  });
  out = out.replace(/\{\{price\s+([\w-]+)\s*\}\}/g, (m, id) => {
    if (!ctx.products?.[id]) { warn(where, `{{price ${id}}}: нет такого товара`); return m; }
    return ctx.products[id].priceHtml;
  });
  // сырые и экранированные значения одним проходом: вставленный HTML повторно не разбирается
  out = out.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{\s*([\w.]+)\s*\}\}/g, (m, rawKey, key) => {
    const v = lookup(ctx, rawKey || key);
    if (v == null) { warn(where, `неизвестная переменная ${m}`); return m; }
    return rawKey ? String(v) : escapeHtml(v);
  });
  return out;
}

/* ---------- страницы ---------- */

function parsePage(name, raw) {
  const m = raw.match(/^﻿?\s*<!--\s*page\b([\s\S]*?)-->/);
  if (!m) throw new Error('в начале файла нет блока <!--page { … } -->');
  let meta;
  try { meta = JSON.parse(m[1]); } catch (e) { throw new Error(`мета в <!--page … --> не разбирается как JSON: ${e.message}`); }
  for (const k of ['path', 'title', 'description', 'h1']) if (!meta[k]) throw new Error(`в мете нет обязательного поля «${k}»`);
  if (!/^\/([\w-]+\/)*$/.test(meta.path)) throw new Error(`path «${meta.path}» должен начинаться и заканчиваться на «/»`);
  const body = raw.slice(m[0].length);
  const isEmpty = body.replace(/<!--[\s\S]*?-->/g, '').trim() === '';
  return { name, meta, body, isEmpty };
}

function crumbsFor(meta, site, isStub) {
  if (meta.path === '/' || meta.crumbs === false) return { html: '', jsonld: '' };
  const items = [{ name: 'Главная', path: '/' }, ...(meta.parents || []), { name: meta.crumb || meta.h1, path: meta.path }];
  const li = items.map((it, i) => (i === items.length - 1
    ? `<li class="crumbs__item" aria-current="page">${escapeHtml(it.name)}</li>`
    : `<li class="crumbs__item"><a href="${it.path}">${escapeHtml(it.name)}</a></li>`)).join('');
  const tone = meta.crumbsTone === 'soft' && !isStub ? ' crumbs-bar--soft' : '';
  const html = `<div class="crumbs-bar${tone}"><div class="container"><nav class="crumbs" aria-label="Хлебные крошки"><ol class="crumbs__list">${li}</ol></nav></div></div>`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: decodeEntities(it.name), item: site.origin + it.path })),
  };
  return { html, jsonld: `<script type="application/ld+json">${JSON.stringify(ld)}</script>` };
}

function markNav(html, meta) {
  if (!meta.nav) return html;
  return html.replace(/<a\b([^>]*?)\sdata-nav-key="([\w-]+)"([^>]*)>/g, (m, a, key, b) => {
    if (key !== meta.nav) return m;
    const href = /href="([^"]*)"/.exec(a + b)?.[1];
    return `<a${a} data-nav-key="${key}"${b} aria-current="${href === meta.path ? 'page' : 'true'}">`;
  });
}

function assetTags(meta, isStub) {
  const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const css = isStub ? [] : list(meta.css);
  const js = isStub ? [] : list(meta.js);
  const preload = isStub ? [] : list(meta.preloadImage);
  return {
    pageCss: css.map((f) => `<link rel="stylesheet" href="/assets/css/${f}">`).join('\n'),
    pageJs: js.map((f) => `<script src="/assets/js/${f}" defer></script>`).join('\n'),
    preload: preload.map((u) => `<link rel="preload" as="image" href="${escapeHtml(u)}" fetchpriority="high">`).join('\n'),
    files: [...css.map((f) => `assets/css/${f}`), ...js.map((f) => `assets/js/${f}`)],
  };
}

// JSON-LD читают разборщики, которые не декодируют HTML: значения справочника приходят с &nbsp; и &#8209;,
// в разметке данных они становятся обычным пробелом и дефисом. Цифры при этом остаются из справочника.
const LD_BLOCK = /(<script\b[^>]*type="application\/ld\+json"[^>]*>)([\s\S]*?)(<\/script>)/g;
function cleanJsonLd(html) {
  return html.replace(LD_BLOCK, (_, open, body, close) => open + body
    .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
    .replace(/&#8209;|&#x2011;/gi, '-')
    .replace(/&amp;/g, '&') + close);
}

function lint(where, html, meta, isStub, known) {
  const tLen = decodeEntities(meta.title).length;
  if (tLen > 65) warn(where, `title ${tLen} зн. (нужно до 65)`);
  if (!isStub) {
    const dLen = decodeEntities(meta.description).length;
    if (dLen < 140 || dLen > 160) warn(where, `description ${dLen} зн. (нужно 140–160)`);
  }
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) warn(where, `на странице ${h1} тегов h1 (нужен ровно один)`);
  for (const img of html.match(/<img\b[^>]*>/g) || []) {
    const miss = ['alt', 'width', 'height'].filter((a) => !new RegExp(`\\s${a}=`).test(img));
    if (miss.length) warn(where, `у картинки нет ${miss.join(', ')}: ${img.slice(0, 90)}…`);
  }
  const left = html.match(/\{\{[^{}]*\}\}/g);
  if (left) warn(where, `остались нераскрытые вставки: ${[...new Set(left)].slice(0, 5).join(' ')}`);

  // JSON-LD обязан разбираться: битая разметка это ошибка сборки, а не замечание
  let n = 0;
  for (const m of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    n += 1;
    try { JSON.parse(m[1]); } catch (e) { errors.push(`${where}: JSON-LD №${n} не разбирается (${e.message}). Начало: ${m[1].trim().slice(0, 70).replace(/\s+/g, ' ')}…`); }
    const ent = m[1].match(/&(?:[a-zA-Z]+|#\d+|#x[\da-fA-F]+);/g);
    if (ent) warn(where, `в JSON-LD №${n} остались HTML-сущности: ${[...new Set(ent)].slice(0, 5).join(' ')}`);
  }

  // дальше проверяем только разметку: скрипты и стили не смотрим
  const markup = html.replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<style\b[\s\S]*?<\/style>/g, '');
  const ids = new Map();
  for (const m of markup.matchAll(/\sid="([^"]*)"/g)) ids.set(m[1], (ids.get(m[1]) || 0) + 1);
  const dup = [...ids].filter(([, c]) => c > 1).map(([id]) => id);
  if (dup.length) warn(where, `повторяются id: ${dup.slice(0, 8).join(', ')}`);

  const bad = new Set();
  for (const m of markup.matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)) {
    const href = m[1];
    if (href === '' || href === '#') { warn(where, `пустая ссылка href="${href}": ${m[0].slice(0, 80)}…`); continue; }
    if (href.startsWith('#')) { if (!ids.has(href.slice(1))) bad.add(`якорь ${href} (нет такого id)`); continue; }
    if (!href.startsWith('/') || href.startsWith('//') || href.startsWith('/assets/')) continue;
    const p = href.split(/[?#]/)[0];
    if (known && !known.has(p)) bad.add(`${href} (нет такого адреса${known.has(p + '/') ? ': не хватает «/» в конце' : ''})`);
  }
  if (bad.size) warn(where, `ссылки в никуда: ${[...bad].slice(0, 8).join('; ')}`);
  for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls', 'for', 'data-dialog-open']) {
    const miss = new Set();
    for (const m of markup.matchAll(new RegExp(`\\s${attr}="([^"]+)"`, 'g'))) for (const id of m[1].split(/\s+/)) if (!ids.has(id)) miss.add(id);
    if (miss.size) warn(where, `${attr} ссылается на id, которых нет на странице: ${[...miss].slice(0, 6).join(', ')}`);
  }
}

// Заглушка: три ссылки (свои из поля links или общие из stubLinks) и три карточки товара.
// Если адрес заглушки это страница товара или в записи есть "product", его карточка идёт первой и стоит выше ссылок.
function stubLinks(meta, shared, where) {
  const { site } = shared;
  const paths = (Array.isArray(meta.links) && meta.links.length ? meta.links : site.stubLinks).filter((p) => p !== meta.path).slice(0, 3);
  return paths.map((p) => {
    const card = site.linkCards?.[p];
    if (!card) { warn(where, `ссылка заглушки «${p}»: нет записи в linkCards (src/routes.json)`); return null; }
    return { path: p, name: card.name, text: render(card.text || '', shared, where) };
  }).filter(Boolean);
}

function renderStubContent(meta, shared, where) {
  const { products, partials } = shared;
  const own = Object.values(products).find((p) => p.url === meta.path);
  const first = meta.product || own?.id || '';
  if (first && !products[first]) warn(where, `product «${first}»: нет такого товара`);
  const order = [first, ...Object.keys(products)].filter((id, i, a) => products[id] && a.indexOf(id) === i);
  const cards = order.map((id) => `      <li>${render(partials['product-card'], { ...shared, ...products[id], product: products[id] }, where, ['product-card'])}</li>`).join('\n');
  const lead = meta.lead
    || [meta.note, own ? 'Страница товара готовится. Купить можно уже сейчас:' : first ? 'Раздел готовится. Купить можно уже сейчас:' : 'Раздел готовится. Пока можно посмотреть:'].filter(Boolean).join(' ');
  return render(partials.stub, {
    ...shared,
    h1: meta.h1,
    lead,
    links: stubLinks(meta, shared, where),
    productFirst: !!first,
    cartAction: meta.action === 'cart',
    grid: `<ul class="product-grid stub__grid">\n${cards}\n    </ul>`,
  }, where);
}

function renderDocument({ meta, content, isStub, where }, shared) {
  const { site, layout } = shared;
  const crumbs = crumbsFor(meta, site, isStub);
  const assets = assetTags(meta, isStub);
  const pageName = meta._name || 'stub';
  const ctx = {
    ...shared,
    title: meta.title,
    description: meta.description,
    canonical: meta.canonical === false ? '' : site.origin + meta.path,
    robots: isStub ? 'noindex, follow' : (meta.robots || 'index, follow'),
    ogType: meta.ogType || 'website',
    ogImage: meta.ogImage || site.ogImage,
    nav: meta.nav || '',
    bodyClass: [`page-${isStub ? 'stub' : pageName}`, meta.bodyClass].filter(Boolean).join(' '),
    crumbs: crumbs.html,
    crumbsJsonLd: crumbs.jsonld,
    pageCss: assets.pageCss,
    pageJs: assets.pageJs,
    preload: assets.preload,
    content,
  };
  let html = render(layout, ctx, where);
  html = markNav(html, meta);
  html = cleanJsonLd(html);
  html = html.replace(/\n[ \t]*\n+/g, '\n');
  lint(where, html, meta, isStub, shared.known);
  return { html, files: assets.files };
}

/* ---------- запись ---------- */

async function writeIfChanged(file, content) {
  try { if ((await read(file)) === content) return 'без изменений'; } catch { /* файла ещё нет */ }
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await writeFile(tmp, content);
    await rename(tmp, file);
  } catch (e) {
    await unlink(tmp).catch(() => {});
    throw e;
  }
  return 'записан';
}

// Страничные css/js создаются пустыми, если их ещё нет; существующие никогда не перезаписываются.
async function ensureFile(rel, comment) {
  const file = path.join(OUT, rel);
  await mkdir(path.dirname(file), { recursive: true });
  try { await writeFile(file, comment, { flag: 'wx' }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
}

const outFile = (p) => path.join(OUT, p.endsWith('/') ? p + 'index.html' : p);

/* ---------- основной ход ---------- */

async function main() {
  const [layout, partials, site] = await Promise.all([
    read(path.join(SRC, 'layout.html')),
    loadPartials(),
    readJson(path.join(SRC, 'routes.json')),
  ]);
  const products = await loadProducts();
  const icons = new Set([...partials.icons.matchAll(/<symbol id="i-([\w-]+)"/g)].map((m) => m[1]));
  const pagesDir = path.join(SRC, 'pages');
  const pageFiles = (await readdir(pagesDir)).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort();

  // все адреса сайта: по ним проверяются внутренние ссылки и собирается sitemap.xml
  const pagePaths = new Map();
  const indexable = [];
  for (const n of pageFiles) {
    try {
      const p = parsePage(n, await read(path.join(pagesDir, `${n}.html`)));
      pagePaths.set(p.meta.path, n);
      if (!p.isEmpty && !/noindex/.test(p.meta.robots || '')) indexable.push(p.meta.path);
    } catch { /* ошибка появится при сборке самой страницы */ }
  }
  const known = new Set(['/', ...Object.values(site.pages || {}), ...pagePaths.keys(), ...site.stubs.map((s) => s.path)]);
  const shared = { layout, partials, site, products, icons, known };

  if (flags.has('--list')) {
    for (const n of pageFiles) {
      try { const p = parsePage(n, await read(path.join(pagesDir, `${n}.html`))); console.log(`${p.meta.path.padEnd(48)} src/pages/${n}.html${p.isEmpty ? '  (пока заглушка)' : ''}`); }
      catch (e) { console.log(`${'?'.padEnd(48)} src/pages/${n}.html  ОШИБКА: ${e.message}`); }
    }
    for (const s of site.stubs) console.log(`${s.path.padEnd(48)} заглушка (src/routes.json)`);
    return;
  }

  const wantStubs = names.length === 0 || names.includes('stubs');
  const wantPages = names.length === 0 ? pageFiles : names.filter((n) => n !== 'stubs');
  const log = [];

  for (const name of wantPages) {
    const where = `src/pages/${name}.html`;
    try {
      if (!pageFiles.includes(name)) throw new Error(`нет такого файла. Есть: ${pageFiles.join(', ')}`);
      const page = parsePage(name, await read(path.join(pagesDir, `${name}.html`)));
      page.meta._name = name;
      if (site.pages?.[name] && site.pages[name] !== page.meta.path) warn(where, `path «${page.meta.path}» не совпадает с адресом в src/routes.json («${site.pages[name]}»)`);
      if (page.meta.nav && !site.navKeys?.[page.meta.nav]) warn(where, `неизвестный пункт меню nav: «${page.meta.nav}». Есть: ${Object.keys(site.navKeys || {}).join(', ')}`);
      const all = (v) => (Array.isArray(v) ? v : v ? [v] : []);
      for (const f of all(page.meta.css)) await ensureFile(`assets/css/${f}`, `/* ${name}: стили страницы ${page.meta.path} */\n`);
      for (const f of all(page.meta.js)) await ensureFile(`assets/js/${f}`, `/* ${name}: скрипт страницы ${page.meta.path} */\n`);
      const content = page.isEmpty ? renderStubContent(page.meta, shared, where) : render(page.body, shared, where);
      const { html } = renderDocument({ meta: page.meta, content, isStub: page.isEmpty, where }, shared);
      const state = await writeIfChanged(outFile(page.meta.path), html);
      log.push(`${page.meta.path.padEnd(48)} ${state}${page.isEmpty ? ' (заглушка: исходник пуст)' : ''}`);
    } catch (e) {
      errors.push(`${where}: ${e.message}`);
    }
  }

  if (wantStubs) {
    for (const s of site.stubs) {
      const where = `routes.json ${s.path}`;
      try {
        if (pagePaths.has(s.path)) { warn(where, `адрес занят страницей src/pages/${pagePaths.get(s.path)}.html, заглушка пропущена`); continue; }
        const content = renderStubContent(s, shared, where);
        const { html } = renderDocument({ meta: s, content, isStub: true, where }, shared);
        const state = await writeIfChanged(outFile(s.path), html);
        log.push(`${s.path.padEnd(48)} ${state} (заглушка)`);
      } catch (e) {
        errors.push(`${where}: ${e.message}`);
      }
    }
  }

  // sitemap.xml: только настоящие страницы (заглушки с noindex в него не попадают); robots.txt статический
  try {
    const urls = indexable.sort().map((p) => `  <url><loc>${site.origin}${p}</loc></url>`).join('\n');
    await writeIfChanged(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
    await writeIfChanged(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /cart/\n\nSitemap: ${site.origin}/sitemap.xml\n`);
  } catch (e) {
    errors.push(`sitemap.xml / robots.txt: ${e.message}`);
  }

  console.log(log.join('\n'));
  if (warnings.length) console.log('\nЗамечания:\n' + [...new Set(warnings)].map((w) => '  - ' + w).join('\n'));
  if (errors.length) { console.error('\nОшибки:\n' + errors.map((w) => '  ! ' + w).join('\n')); process.exitCode = 1; }
  else console.log(`\nГотово: ${log.length} стр.`);
}

main().catch((e) => { console.error('Сборка остановлена: ' + (e?.message || e)); process.exitCode = 1; });
