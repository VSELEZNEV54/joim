#!/usr/bin/env node
// Сборка магазина JOIM: src/ → store/. Node без зависимостей.
//   node build.mjs              всё: страницы, категории, товары, заглушки
//   node build.mjs home         одна страница по имени файла src/pages/<имя>.html (можно несколько имён)
//   node build.mjs category     пять страниц категорий из шаблона src/templates/category.html
//   node build.mjs product      восемь страниц товаров из шаблона src/templates/product.html
//   node build.mjs stubs        только заглушки из src/routes.json
//   node build.mjs --list       показать маршруты и выйти
// Единственный источник цен, статусов, картинок и характеристик: src/data/products.json.
// Из него сборка делает страницы и файл store/assets/js/data.js (справочник для корзины, поиска и избранного
// с готовой разметкой карточки товара в трёх вариантах: плитка, «по две в ряд», строка).
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
const FREE_DELIVERY_FROM = 15000;
const TILE_RATIO = 5 / 6; // пропорция тёмной плитки товара (ширина / высота)

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

function formatPrice(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) + NBSP + '₽';
}
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}${NBSP}${MONTHS[m - 1]} ${y}`;
}
function plural(n, forms) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

const escapeHtml = (s) => String(s)
  .replace(/&(?!(?:[a-zA-Z]+|#\d+|#x[\da-fA-F]+);)/g, '&amp;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const decodeEntities = (s) => String(s)
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#(\d+);/g, (_, n) => (n === '8209' ? '-' : String.fromCodePoint(+n)))
  .replace(/&[a-zA-Z]+;/g, '·');
const stripTags = (s) => String(s).replace(/<[^>]*>/g, '');

// Справочник: src/data/products.json → товары (по id и списком в порядке каталога) и категории со своими товарами.
async function loadData() {
  const data = await readJson(path.join(SRC, 'data/products.json'));
  const catById = Object.fromEntries(data.categories.map((c) => [c.id, c]));
  const products = {};
  const productList = [];
  for (const raw of data.products) {
    const p = { ...raw };
    p.inStock = p.status === 'in_stock';
    p.soon = !p.inStock;
    p.priceFmt = p.price != null ? formatPrice(p.price) : 'Скоро в' + NBSP + 'продаже';
    p.priceHtml = p.priceFmt.replaceAll(NBSP, '&nbsp;');
    p.hasRating = p.rating != null && p.reviews != null;
    p.ratingFmt = p.hasRating ? Number(p.rating).toFixed(1).replace('.', ',') : '';
    p.reviewsFmt = p.hasRating ? `${p.reviews}${NBSP}${plural(p.reviews, ['отзыв', 'отзыва', 'отзывов'])}` : '';
    p.reviewsHtml = p.reviewsFmt.replaceAll(NBSP, '&nbsp;');
    p.badgeTone = p.badge ? (p.soon ? 'soft' : 'accent') : '';
    p.fit = p.w / p.h <= TILE_RATIO ? 'tall' : 'wide'; // как рендер вписан в плитку 5:6: по высоте или по ширине
    // Подгонка рендера в плитке (необязательное поле tile): серия снята с разным запасом вокруг товара, поэтому у каждого кадра
    // свой масштаб (scale: доля высоты плитки у tall, доля ширины у wide), сдвиг (x, y в процентах размера кадра), яркость (tone),
    // длина растворения верхнего края (fade), поворот (rot, градусы: лежащий предмет встаёт по диагонали плитки), модификатор маски
    // (mod: corner, float) и предел ширины кадра в узкой высокой плитке карточки «по две в ряд» (duo, проценты ширины плитки;
    // по умолчанию 114: у кадра с узким предметом и широкими полями предел больше). В разметку уходит строкой CSS-переменных.
    const t = raw.tile || {};
    p.tileStyle = [
      t.scale != null ? `--s:${t.scale}` : '', t.x != null ? `--x:${t.x}%` : '', t.y != null ? `--y:${t.y}%` : '',
      t.tone != null ? `--tone:${t.tone}` : '', t.fade != null ? `--ft:${t.fade}%` : '', t.fb != null ? `--fb:${t.fb}%` : '', t.rot != null ? `--r:${t.rot}deg` : '',
      t.duo != null ? `--dw:${t.duo}%` : '',
    ].filter(Boolean).join(';');
    p.tileMod = t.mod || '';
    p.specList = (p.specs || []).filter((s) => s.name);
    p.specs = Object.fromEntries((raw.specs || []).map((s) => [s.key, s.value]));
    // Поля карточки-строки и карточки «по две в ряд»: подпись + значение из характеристик (поле fields: [{ label, spec }]).
    // Значение берётся из specs по ключу, поэтому расходиться с таблицей характеристик не может.
    p.fieldList = (raw.fields || []).map((f) => {
      if (p.specs[f.spec] == null) throw new Error(`products.json: у товара «${p.id}» в fields указана характеристика «${f.spec}», которой нет в specs`);
      return { label: f.label, valueHtml: p.specs[f.spec] };
    });
    // строка «для чего» в карточке: первые три пункта списка usage
    p.usageLine = (raw.usage || []).slice(0, 3).join('&nbsp;· '); // точка-разделитель не уходит в начало строки
    // Кадр серии «товар на тёмной сцене» для карточки-строки (поле stage): cx, cy — центр товара в процентах кадра,
    // s — высота кадра в долях высоты окна, fl/fr/ft/fb — длина растворения краёв в процентах кадра. В разметку уходит строкой CSS-переменных.
    const st = raw.stage || null;
    p.stage = st;
    p.stageStyle = st ? [
      st.cx != null ? `--cx:${st.cx}%` : '', st.cy != null ? `--cy:${st.cy}%` : '', st.s != null ? `--s:${st.s}` : '',
      st.fl != null ? `--fl:${st.fl}%` : '', st.fr != null ? `--fr:${st.fr}%` : '', st.ft != null ? `--ft:${st.ft}%` : '', st.fb != null ? `--fb:${st.fb}%` : '',
      st.tone != null ? `--tone:${st.tone}` : '',
    ].filter(Boolean).join(';') : '';
    // маркетплейсы: адрес обязателен у каждого товара (сейчас это магазин продавца на Ozon и страница бренда на Wildberries)
    for (const k of ['ozonUrl', 'wbUrl']) if (!/^https:\/\//.test(p[k] || '')) throw new Error(`products.json: у товара «${p.id}» нет адреса ${k}`);
    p.cats = p.cats || [];
    p.cat = catById[p.cats[0]] || catById.all;
    p.catName = p.cat.name;
    p.catPath = p.cat.path;
    // название для разметки: короткий предлог не повисает в конце строки («с&nbsp;компрессором»), модель не рвётся по дефису
    const nb = (s) => escapeHtml(s).replace(/ (с|в|к|о|у|и|со|для) /g, ' $1&nbsp;').replace(p.model, `<span class="nowrap">${p.model}</span>`);
    p.nameHtml = nb(p.name);   // name остаётся чистым: он идёт в title, alt и JSON-LD
    p.shortHtml = nb(p.short);
    p.typeName = p.type === 'vacuum' ? 'Автомобильный пылесос' : 'Пусковое устройство';
    p.aboutText = decodeEntities(stripTags(p.about || ''));
    p.reviewItems = (data.reviews || []).filter((r) => r.product === p.id).map((r) => ({ name: r.name, text: r.text, dateIso: r.date, dateFmt: formatDate(r.date) }));
    p.steps = p.type === 'jump' && p.inStock ? (data.jumpSteps || []) : [];
    p.gallery = (p.gallery || []).map((g, i) => ({ ...g, dark: g.bg === 'dark', light: g.bg !== 'dark', isVideo: !!g.video, n: i + 1, first: i === 0 }));
    for (const c of p.cats) if (!catById[c]) throw new Error(`products.json: у товара «${p.id}» неизвестная категория «${c}»`);
    products[p.id] = p;
    productList.push(p);
  }
  // порядок каталога: сначала товары в продаже, потом «скоро»; внутри групп порядок файла
  const ordered = [...productList.filter((p) => p.inStock), ...productList.filter((p) => p.soon)];
  const categories = data.categories.map((c) => {
    const items = c.id === 'all' ? ordered : ordered.filter((p) => p.cats.includes(c.id));
    const count = items.length;
    return {
      ...c,
      items,
      count,
      countFmt: `${count}${NBSP}${plural(count, ['товар', 'товара', 'товаров'])}`,
      modelsHtml: `${count}&nbsp;${plural(count, ['модель', 'модели', 'моделей'])}`,
      inStockCount: items.filter((p) => p.inStock).length,
      allSoon: items.every((p) => p.soon),
      isAll: c.id === 'all',
    };
  });
  const reviewsAll = (data.reviews || []).map((r) => ({ ...r, dateIso: r.date, dateFmt: formatDate(r.date), productName: products[r.product]?.name, productUrl: products[r.product]?.url, productShort: products[r.product]?.short }));
  // сводка по отзывам: сумма счётчиков товаров и средняя оценка, взвешенная по числу отзывов («5,0 по 25 отзывам»)
  const rated = productList.filter((p) => p.hasRating);
  const total = rated.reduce((n, p) => n + p.reviews, 0);
  const avg = total ? rated.reduce((n, p) => n + p.rating * p.reviews, 0) / total : 0;
  const reviewStats = {
    count: total,
    rating: Math.round(avg * 10) / 10,
    ratingFmt: avg.toFixed(1).replace('.', ','),
    countByHtml: `по&nbsp;${total}&nbsp;${plural(total, ['отзыву', 'отзывам', 'отзывам'])}`,
  };
  return { products, productList: ordered, reviewsAll, reviewStats, categories, categoryById: Object.fromEntries(categories.map((c) => [c.id, c])) };
}

/* ---------- шаблонизатор ----------
   {{имя}}            значение с экранированием        {{{имя}}}          значение как есть (HTML)
   {{#if имя}}…{{else}}…{{/if}}   условия: имя · !имя · имя == "строка" · имя != "строка"   (вложенность разрешена)
   {{#each список}}…{{else}}…{{/each}}   внутри: поля элемента, this, index, number, first, last, head (первые четыре), odd, even (вложенность разрешена)
   {{> partial арг ключ=значение}}  вставка src/partials/partial.html; арг = id товара (или переменная с id) → поля товара в области видимости
   {{icon имя класс}} иконка из спрайта    {{price id}} цена товара    {{json имя}} значение как JSON-строка (для JSON-LD) */

const TAG = /\{\{\{\s*([^{}]+?)\s*\}\}\}|\{\{\s*([^{}]+?)\s*\}\}/g;

function parseTemplate(src, where) {
  const rootNode = { type: 'root', body: [] };
  const stack = [rootNode];
  let branch = rootNode.body;
  const branches = [branch];
  let last = 0;
  for (const m of src.matchAll(TAG)) {
    if (m.index > last) branch.push({ type: 'text', value: src.slice(last, m.index) });
    last = m.index + m[0].length;
    if (m[1] != null) { branch.push({ type: 'raw', key: m[1] }); continue; }
    const t = m[2];
    let mm;
    if ((mm = /^#(each|if)\s+(.+)$/.exec(t))) {
      const node = { type: mm[1], expr: mm[2].trim(), body: [], alt: [] };
      branch.push(node);
      stack.push(node);
      branch = node.body;
      branches.push(branch);
    } else if (t === 'else') {
      const node = stack[stack.length - 1];
      if (node.type === 'root') throw new Error(`${where}: {{else}} вне блока`);
      branch = node.alt;
      branches[branches.length - 1] = branch;
    } else if ((mm = /^\/(each|if)$/.exec(t))) {
      const node = stack.pop();
      if (!node || node.type !== mm[1]) throw new Error(`${where}: {{/${mm[1]}}} закрывает не тот блок`);
      branches.pop();
      branch = branches[branches.length - 1];
    } else if ((mm = /^>\s*([\w-]+)(.*)$/.exec(t))) {
      branch.push({ type: 'partial', name: mm[1], args: mm[2].trim().split(/\s+/).filter(Boolean) });
    } else if ((mm = /^icon\s+([\w-]+)((?:\s+[\w-]+)*)$/.exec(t))) {
      branch.push({ type: 'icon', name: mm[1], cls: mm[2].trim() });
    } else if ((mm = /^price\s+([\w.-]+)$/.exec(t))) {
      branch.push({ type: 'price', id: mm[1] });
    } else if ((mm = /^json\s+([\w.]+)$/.exec(t))) {
      branch.push({ type: 'json', key: mm[1] });
    } else if (/^[\w.]+$/.test(t)) {
      branch.push({ type: 'var', key: t });
    } else {
      branch.push({ type: 'text', value: m[0] }); // не наша вставка: оставляем, lint покажет
    }
  }
  if (stack.length > 1) throw new Error(`${where}: не закрыт блок {{#${stack[stack.length - 1].type} ${stack[stack.length - 1].expr}}}`);
  if (last < src.length) rootNode.body.push({ type: 'text', value: src.slice(last) });
  return rootNode.body;
}

const lookup = (ctx, key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), ctx);
const truthy = (v) => (Array.isArray(v) ? v.length > 0 : !!v);
function operand(ctx, s) {
  const q = /^"(.*)"$|^'(.*)'$/.exec(s);
  if (q) return q[1] ?? q[2];
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return lookup(ctx, s);
}
function testExpr(ctx, expr) {
  let m;
  if ((m = /^(.+?)\s*(==|!=)\s*(.+)$/.exec(expr))) {
    const eq = String(operand(ctx, m[1].trim()) ?? '') === String(operand(ctx, m[3].trim()) ?? '');
    return m[2] === '==' ? eq : !eq;
  }
  if (expr.startsWith('!')) return !truthy(lookup(ctx, expr.slice(1).trim()));
  return truthy(lookup(ctx, expr));
}

function iconHtml(name, cls) {
  return `<svg class="icon${cls ? ' ' + cls.trim() : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
}

const cache = new Map();
function compiled(tpl, where) {
  if (!cache.has(tpl)) cache.set(tpl, parseTemplate(tpl, where));
  return cache.get(tpl);
}

function evalNodes(nodes, ctx, where, stack) {
  let out = '';
  for (const n of nodes) {
    switch (n.type) {
      case 'text': out += n.value; break;
      case 'var': case 'raw': {
        const v = lookup(ctx, n.key);
        if (v == null) { warn(where, `неизвестная переменная {{${n.key}}}`); out += n.type === 'raw' ? `{{{${n.key}}}}` : `{{${n.key}}}`; break; }
        out += n.type === 'raw' ? String(v) : escapeHtml(v);
        break;
      }
      case 'json': {
        const v = lookup(ctx, n.key);
        if (v == null) { warn(where, `неизвестная переменная {{json ${n.key}}}`); out += '""'; break; }
        out += typeof v === 'number' ? String(v) : JSON.stringify(decodeEntities(stripTags(String(v))));
        break;
      }
      case 'if': out += evalNodes(testExpr(ctx, n.expr) ? n.body : n.alt, ctx, where, stack); break;
      case 'each': {
        const list = lookup(ctx, n.expr);
        if (!Array.isArray(list) || !list.length) { out += evalNodes(n.alt, ctx, where, stack); break; }
        list.forEach((item, index) => {
          const scope = { ...ctx, ...(item && typeof item === 'object' ? item : { value: item }), this: item, index, number: index + 1, first: index === 0, last: index === list.length - 1, head: index < 4, odd: index % 2 === 0, even: index % 2 === 1 };
          out += evalNodes(n.body, scope, where, stack);
        });
        break;
      }
      case 'partial': {
        if (!(n.name in ctx.partials)) { warn(where, `нет partial «${n.name}»`); break; }
        if (stack.includes(n.name)) throw new Error(`partial «${n.name}» включает сам себя`);
        const sub = { ...ctx };
        const plain = [];
        for (const a of n.args) {
          const kv = /^([\w-]+)=(.*)$/.exec(a);
          if (kv) sub[kv[1]] = operand(ctx, kv[2]) ?? kv[2];
          else plain.push(a);
        }
        sub.args = plain;
        sub.arg = plain[0] || '';
        if (plain[0]) {
          const viaVar = lookup(ctx, plain[0]);
          const id = ctx.products?.[plain[0]] ? plain[0] : (typeof viaVar === 'string' ? viaVar : '');
          const product = ctx.products?.[id];
          if (product) Object.assign(sub, product, { product });
          else if (n.name === 'product-card') warn(where, `{{> product-card ${plain[0]}}}: нет такого товара`);
        }
        out += evalNodes(compiled(ctx.partials[n.name], `partial ${n.name}`), sub, where, [...stack, n.name]);
        break;
      }
      case 'icon':
        if (ctx.icons && !ctx.icons.has(n.name)) warn(where, `нет иконки «${n.name}» в спрайте`);
        out += iconHtml(n.name, n.cls);
        break;
      case 'price': {
        const viaVar = lookup(ctx, n.id);
        const p = ctx.products?.[n.id] || ctx.products?.[typeof viaVar === 'string' ? viaVar : ''];
        if (!p) { warn(where, `{{price ${n.id}}}: нет такого товара`); break; }
        out += p.priceHtml;
        break;
      }
      default: break;
    }
  }
  return out;
}

function render(tpl, ctx, where, stack = []) {
  return evalNodes(compiled(tpl, where), ctx, where, stack);
}

/* ---------- страницы ---------- */

function parseMeta(raw, kind, required) {
  const m = raw.match(new RegExp(`^\\uFEFF?\\s*<!--\\s*${kind}\\b([\\s\\S]*?)-->`));
  if (!m) throw new Error(`в начале файла нет блока <!--${kind} { … } -->`);
  let meta;
  try { meta = JSON.parse(m[1]); } catch (e) { throw new Error(`мета в <!--${kind} … --> не разбирается как JSON: ${e.message}`); }
  for (const k of required) if (!meta[k]) throw new Error(`в мете нет обязательного поля «${k}»`);
  return { meta, body: raw.slice(m[0].length) };
}

function parsePage(name, raw) {
  const { meta, body } = parseMeta(raw, 'page', ['path', 'title', 'description', 'h1']);
  if (!/^\/([\w-]+\/)*$/.test(meta.path)) throw new Error(`path «${meta.path}» должен начинаться и заканчиваться на «/»`);
  const isEmpty = body.replace(/<!--[\s\S]*?-->/g, '').trim() === '';
  return { name, meta, body, isEmpty };
}

function crumbsFor(meta, site) {
  if (meta.path === '/' || meta.crumbs === false) return { html: '', jsonld: '' };
  const items = [{ name: 'Главная', path: '/' }, ...(meta.parents || []), { name: meta.crumb || meta.h1, path: meta.path }];
  const li = items.map((it, i) => (i === items.length - 1
    ? `<li class="crumbs__item" aria-current="page">${escapeHtml(it.name)}</li>`
    : `<li class="crumbs__item"><a href="${it.path}">${escapeHtml(it.name)}</a></li>`)).join('');
  const html = `<div class="container"><nav class="crumbs" aria-label="Хлебные крошки"><ol class="crumbs__list">${li}</ol></nav></div>`;
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

const absUrl = (site, u) => (/^https?:/.test(u) ? u : site.origin + u);

function assetTags(meta, isStub) {
  const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const css = isStub ? [] : list(meta.css);
  const js = isStub ? [] : list(meta.js);
  const preload = isStub ? [] : list(meta.preloadImage);
  return {
    pageCss: (isStub ? ['pages/stub.css'] : css).map((f) => `<link rel="stylesheet" href="/assets/css/${f}">`).join('\n'),
    pageJs: js.map((f) => `<script src="/assets/js/${f}" defer></script>`).join('\n'),
    // строка (адрес) или объект { href, srcset, sizes } для картинки с набором размеров
    preload: preload.map((u) => (typeof u === 'string'
      ? `<link rel="preload" as="image" href="${escapeHtml(u)}" fetchpriority="high">`
      : `<link rel="preload" as="image" href="${escapeHtml(u.href)}"${u.srcset ? ` imagesrcset="${escapeHtml(u.srcset)}"` : ''}${u.sizes ? ` imagesizes="${escapeHtml(u.sizes)}"` : ''} fetchpriority="high">`)).join('\n'),
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
  // маркетплейсы: только адреса магазина и бренда из справочника, поисковых ссылок-заглушек быть не должно
  const mpStub = html.match(/ozon\.ru\/search|wildberries\.ru\/catalog\/0\/search|href="https:\/\/www\.(?:ozon|wildberries)\.ru\/"/g);
  if (mpStub) warn(where, `ссылки-заглушки на маркетплейсы: ${[...new Set(mpStub)].join(', ')} (нужны адреса из products.json: ozonUrl, wbUrl)`);
  for (const a of markup.match(/<a\b[^>]*\starget="_blank"[^>]*>/g) || []) {
    if (!/\srel="[^"]*noopener/.test(a)) warn(where, `у ссылки с target="_blank" нет rel="noopener": ${a.slice(0, 90)}…`);
  }
  const left = markup.match(/\{\{[^{}]*\}\}/g);
  if (left) warn(where, `остались нераскрытые вставки: ${[...new Set(left)].slice(0, 5).join(' ')}`);
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

// Заглушка: заголовок, три ссылки (свои из поля links или общие из stubLinks) и ряд из четырёх карточек товаров.
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
  const { products, productList, partials } = shared;
  const first = meta.product || '';
  if (first && !products[first]) warn(where, `product «${first}»: нет такого товара`);
  const order = [first, ...productList.map((p) => p.id)].filter((id, i, a) => products[id] && a.indexOf(id) === i).slice(0, 4);
  return render(partials.stub, {
    ...shared,
    h1: meta.h1,
    lead: meta.lead || [meta.note, 'Раздел готовится. Пока можно посмотреть:'].filter(Boolean).join(' '),
    links: stubLinks(meta, shared, where),
    cards: order.map((id) => products[id]),
  }, where);
}

function renderDocument({ meta, content, isStub, where }, shared) {
  const { site, layout } = shared;
  const crumbs = crumbsFor(meta, site);
  const assets = assetTags(meta, isStub);
  const pageName = meta._name || 'stub';
  const ctx = {
    ...shared,
    title: meta.title,
    description: meta.description,
    canonical: meta.canonical === false ? '' : site.origin + meta.path,
    robots: isStub ? 'noindex, follow' : (meta.robots || 'index, follow'),
    ogType: meta.ogType || 'website',
    ogImage: absUrl(site, meta.ogImage || site.ogImage),
    nav: meta.nav || '',
    // has-dark-top: страница начинается с экрана-сцены во всю ширину, шапка над ним прозрачная до первой прокрутки (см. main.css, раздел «Шапка»).
    // Сама шапка тёмная на всех страницах.
    bodyClass: [`page-${isStub ? 'stub' : pageName}`, !isStub && meta.darkTop ? 'has-dark-top' : '', meta.bodyClass].filter(Boolean).join(' '),
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
const all = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/* ---------- справочник для браузера: store/assets/js/data.js ---------- */

function dataJs(shared) {
  const { productList, categories, partials } = shared;
  const products = {};
  // готовая разметка карточки товара в трёх вариантах: плитка (cards), «по две в ряд» (cardsDuo), строка (cardsRow).
  // Один источник — src/partials/product-card.html: карточка, вставленная скриптом, не отличается от собранной в странице.
  const cards = {};
  const cardsDuo = {};
  const cardsRow = {};
  const cardHtml = (p, view) => render(partials['product-card'], { ...shared, ...p, product: p, ...(view ? { view } : {}) }, 'partial product-card', ['product-card']).replace(/\s*\n\s*/g, '');
  for (const p of productList) {
    products[p.id] = {
      id: p.id, name: p.name, short: p.short, model: p.model, type: p.type, typeName: p.typeName,
      cats: p.cats, status: p.status, price: p.price, url: p.url, ozonUrl: p.ozonUrl, wbUrl: p.wbUrl,
      img: p.img, w: p.w, h: p.h, fit: p.fit,
      rating: p.rating, reviews: p.reviews, badge: p.badge || '', specsHtml: p.specsHtml || '',
      ...(p.cutImg ? { cutImg: p.cutImg, cutW: p.cutW, cutH: p.cutH } : {}),
      ...(p.limitPetrol ? { limitPetrol: p.limitPetrol, limitDiesel: p.limitDiesel } : {}),
    };
    cards[p.id] = cardHtml(p, '');
    cardsDuo[p.id] = cardHtml(p, 'duo');
    cardsRow[p.id] = cardHtml(p, 'row');
  }
  const data = {
    freeDeliveryFrom: FREE_DELIVERY_FROM,
    order: productList.map((p) => p.id),
    products,
    categories: categories.map((c) => ({ id: c.id, name: decodeEntities(c.name), chip: decodeEntities(c.chip), path: c.path, thumb: c.thumb, count: c.count })),
    cards,
    cardsDuo,
    cardsRow,
  };
  return '/* Справочник JOIM для корзины, поиска и избранного. Файл создаёт сборка из src/data/products.json: руками не править. */\n'
    + `window.JOIM_DATA = ${JSON.stringify(data)};\n`;
}

/* ---------- основной ход ---------- */

async function main() {
  const [layout, partials, site, data] = await Promise.all([
    read(path.join(SRC, 'layout.html')),
    loadPartials(),
    readJson(path.join(SRC, 'routes.json')),
    loadData(),
  ]);
  const { products, productList, categories, categoryById, reviewsAll, reviewStats } = data;
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
  const generated = [...categories.map((c) => c.path), ...productList.map((p) => p.url)];
  indexable.push(...generated);
  const known = new Set(['/', ...pagePaths.keys(), ...generated, ...site.stubs.map((s) => s.path)]);
  const shared = { layout, partials, site, products, productList, categories, categoryById, reviewsAll, reviewStats, icons, known, year: 2026 };

  if (flags.has('--list')) {
    for (const n of pageFiles) {
      try { const p = parsePage(n, await read(path.join(pagesDir, `${n}.html`))); console.log(`${p.meta.path.padEnd(52)} src/pages/${n}.html${p.isEmpty ? '  (пока заглушка)' : ''}`); }
      catch (e) { console.log(`${'?'.padEnd(52)} src/pages/${n}.html  ОШИБКА: ${e.message}`); }
    }
    for (const c of categories) console.log(`${c.path.padEnd(52)} src/templates/category.html (категория ${c.id})`);
    for (const p of productList) console.log(`${p.url.padEnd(52)} src/templates/product.html (товар ${p.id})`);
    for (const s of site.stubs) console.log(`${s.path.padEnd(52)} заглушка (src/routes.json)`);
    return;
  }

  const everything = names.length === 0;
  const wantStubs = everything || names.includes('stubs');
  const wantCategories = everything || names.includes('category') || names.includes('categories');
  const wantProducts = everything || names.includes('product') || names.includes('products');
  const special = new Set(['stubs', 'category', 'categories', 'product', 'products']);
  const wantPages = everything ? pageFiles : names.filter((n) => !special.has(n));
  const log = [];

  // справочник для браузера нужен любой странице: обновляем при каждом запуске
  try { await writeIfChanged(path.join(OUT, 'assets/js/data.js'), dataJs(shared)); }
  catch (e) { errors.push(`store/assets/js/data.js: ${e.message}`); }

  for (const name of wantPages) {
    const where = `src/pages/${name}.html`;
    try {
      if (!pageFiles.includes(name)) throw new Error(`нет такого файла. Есть: ${pageFiles.join(', ')}; а также category, product, stubs`);
      const page = parsePage(name, await read(path.join(pagesDir, `${name}.html`)));
      page.meta._name = name;
      if (page.meta.nav && !site.navKeys?.[page.meta.nav]) warn(where, `неизвестный пункт меню nav: «${page.meta.nav}». Есть: ${Object.keys(site.navKeys || {}).join(', ')}`);
      for (const f of all(page.meta.css)) await ensureFile(`assets/css/${f}`, `/* ${name}: стили страницы ${page.meta.path} */\n`);
      for (const f of all(page.meta.js)) await ensureFile(`assets/js/${f}`, `/* ${name}: скрипт страницы ${page.meta.path} */\n`);
      const content = page.isEmpty ? renderStubContent(page.meta, shared, where) : render(page.body, shared, where);
      const { html } = renderDocument({ meta: page.meta, content, isStub: page.isEmpty, where }, shared);
      const state = await writeIfChanged(outFile(page.meta.path), html);
      log.push(`${page.meta.path.padEnd(52)} ${state}${page.isEmpty ? ' (заглушка: исходник пуст)' : ''}`);
    } catch (e) {
      errors.push(`${where}: ${e.message}`);
    }
  }

  // Страницы из шаблонов: один шаблон категории на пять адресов, один шаблон товара на восемь.
  async function buildFromTemplate(kind, list, makeMeta, makeCtx) {
    const file = `src/templates/${kind}.html`;
    let tpl;
    try {
      tpl = parseMeta(await read(path.join(ROOT, file)), 'template', []);
      for (const f of all(tpl.meta.css)) await ensureFile(`assets/css/${f}`, `/* ${kind}: стили шаблона ${file} */\n`);
      for (const f of all(tpl.meta.js)) await ensureFile(`assets/js/${f}`, `/* ${kind}: скрипт шаблона ${file} */\n`);
    } catch (e) { errors.push(`${file}: ${e.message}`); return; }
    for (const item of list) {
      const where = `${file} [${item.id}]`;
      try {
        const meta = { ...tpl.meta, ...makeMeta(item), _name: kind };
        const content = render(tpl.body, { ...shared, ...makeCtx(item) }, where);
        const { html } = renderDocument({ meta, content, isStub: false, where }, shared);
        const state = await writeIfChanged(outFile(meta.path), html);
        log.push(`${meta.path.padEnd(52)} ${state} (${kind} ${item.id})`);
      } catch (e) {
        errors.push(`${where}: ${e.message}`);
      }
    }
  }

  if (wantCategories) {
    await buildFromTemplate('category', categories,
      (c) => ({
        path: c.path, title: c.title, description: c.description, h1: c.h1, crumb: c.crumb, parents: c.parents, nav: c.nav,
        bodyClass: `cat-${c.id}`, ogImage: c.img, preloadImage: c.items[0]?.img,
      }),
      (c) => ({
        cat: c,
        items: c.items,
        chips: categories.map((x) => ({ ...x, active: x.id === c.id })),
      }));
  }

  if (wantProducts) {
    await buildFromTemplate('product', productList,
      (p) => ({
        path: p.url, title: p.title, description: p.description, h1: p.name, crumb: p.short,
        parents: [{ name: 'Каталог', path: '/catalog/' }, ...(p.cat.id !== 'all' ? [{ name: p.cat.name, path: p.cat.path }] : [])],
        nav: 'catalog', bodyClass: `product-${p.id}${p.soon ? ' is-soon' : ''}`, ogType: 'product', ogImage: p.img, preloadImage: p.gallery[0]?.src || p.img,
      }),
      (p) => {
        // «Вам может быть интересно»: сначала товары той же категории, потом остальные; четыре штуки
        const same = productList.filter((x) => x.id !== p.id && x.type === p.type);
        const other = productList.filter((x) => x.id !== p.id && x.type !== p.type);
        return { ...p, p, related: [...same, ...other].slice(0, 4), isJump: p.type === 'jump', isVacuum: p.type === 'vacuum' };
      });
  }

  if (wantStubs) {
    for (const s of site.stubs) {
      const where = `routes.json ${s.path}`;
      try {
        if (pagePaths.has(s.path) || generated.includes(s.path)) { warn(where, 'адрес занят настоящей страницей, заглушка пропущена: удалите запись из src/routes.json'); continue; }
        const content = renderStubContent(s, shared, where);
        const { html } = renderDocument({ meta: s, content, isStub: true, where }, shared);
        const state = await writeIfChanged(outFile(s.path), html);
        log.push(`${s.path.padEnd(52)} ${state} (заглушка)`);
      } catch (e) {
        errors.push(`${where}: ${e.message}`);
      }
    }
  }

  // sitemap.xml: только настоящие страницы (заглушки с noindex в него не попадают); robots.txt статический.
  // Корзина и избранное закрыты от индекса метатегом noindex: в robots.txt их не запрещаем, иначе робот не откроет страницу и не увидит метатег
  try {
    const urls = [...new Set(indexable)].sort().map((p) => `  <url><loc>${site.origin}${p}</loc></url>`).join('\n');
    await writeIfChanged(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
    await writeIfChanged(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${site.origin}/sitemap.xml\n`);
  } catch (e) {
    errors.push(`sitemap.xml / robots.txt: ${e.message}`);
  }

  console.log(log.join('\n'));
  if (warnings.length) console.log('\nЗамечания:\n' + [...new Set(warnings)].map((w) => '  - ' + w).join('\n'));
  if (errors.length) { console.error('\nОшибки:\n' + errors.map((w) => '  ! ' + w).join('\n')); process.exitCode = 1; }
  else console.log(`\nГотово: ${log.length} стр.`);
}

main().catch((e) => { console.error('Сборка остановлена: ' + (e?.message || e)); process.exitCode = 1; });
