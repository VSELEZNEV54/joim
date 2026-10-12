/* category: каталог и категории (шаблон src/templates/category.html).
   Порядок карточек (по умолчанию, сначала дешевле, сначала дороже: товары без цены всегда в конце), поиск по текущему списку,
   переключатель «В продаже». Всё работает на месте: карточки переставляются в списке, лишние вынимаются из него,
   плитка-ссылка остаётся последней (её ширину считает CSS по порядковому номеру). Состояние хранится в адресе страницы. */
(() => {
  'use strict';

  const J = window.JOIM || {};
  const grid = document.querySelector('[data-cat-grid]');
  if (!grid) return;

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[\s\-–—.,]+/g, ' ').trim();
  const plural = J.plural || ((n, f) => {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return f[2];
    if (b > 1 && b < 5) return f[1];
    return b === 1 ? f[0] : f[2];
  });
  const NBSP = '\u00A0';

  const fill = $('[data-cat-fill]', grid);
  const empty = $('[data-cat-empty]');
  const emptyText = $('[data-cat-empty-text]');
  const countEl = $('[data-cat-count]');
  const form = $('[data-cat-find]');
  const input = $('[data-cat-q]');
  const clearBtn = $('[data-cat-clear]');
  const sortEl = $('[data-cat-sort]');
  const stockBtn = $('[data-cat-stock]');
  const emptyDefault = emptyText ? emptyText.textContent : '';

  // карточки в исходном порядке каталога: цена и статус берутся из разметки плитки
  const items = Array.from(grid.querySelectorAll('[data-cat-item]')).map((li, index) => {
    const card = $('.product-card', li);
    const raw = card ? card.getAttribute('data-price') : '';
    const title = $('.product-card__title', li);
    return {
      li,
      index,
      id: li.getAttribute('data-cat-item'),
      price: raw ? Number(raw) : null,
      text: norm(title ? title.textContent : ''),
    };
  });
  if (!items.length) return;

  const SORTS = ['default', 'asc', 'desc'];
  const state = { sort: 'default', q: '', stock: false };

  /* ---------- Состояние из адреса: ?sort=asc&q=es-19&stock=1 ---------- */
  try {
    const params = new URLSearchParams(location.search);
    if (SORTS.includes(params.get('sort'))) state.sort = params.get('sort');
    state.q = (params.get('q') || '').slice(0, 60);
    state.stock = params.get('stock') === '1' && !!stockBtn;
  } catch (e) { /* адрес без параметров */ }

  function saveState() {
    try {
      const params = new URLSearchParams(location.search);
      if (state.sort !== 'default') params.set('sort', state.sort); else params.delete('sort');
      if (state.q) params.set('q', state.q); else params.delete('q');
      if (state.stock) params.set('stock', '1'); else params.delete('stock');
      const qs = params.toString();
      history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    } catch (e) { /* история недоступна */ }
  }

  /* ---------- Отбор и порядок ---------- */
  // поиск идёт по общему справочнику (название, модель, тип, категория), результат сужается до товаров этой страницы
  function matchIds(q) {
    if (!q) return null;
    if (typeof J.search === 'function') return new Set(J.search(q).map((p) => p.id));
    const words = norm(q).split(' ').filter(Boolean);
    return new Set(items.filter((it) => words.every((w) => it.text.includes(w))).map((it) => it.id));
  }

  function pick() {
    const ids = matchIds(state.q.trim());
    const list = items.filter((it) => (!ids || ids.has(it.id)) && (!state.stock || it.price != null));
    if (state.sort !== 'default') {
      const dir = state.sort === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        if (a.price == null || b.price == null) return (a.price == null) - (b.price == null) || a.index - b.index;
        return (a.price - b.price) * dir || a.index - b.index;
      });
    }
    return list;
  }

  let shownKey = null;
  let swapTimer = 0;

  function render(opts = {}) {
    const list = pick();
    // если состав или порядок изменился, карточки коротко проявляются (длительность гасит prefers-reduced-motion в main.css)
    const key = list.map((it) => it.id).join(' ');
    if (shownKey !== null && key !== shownKey) {
      grid.classList.remove('is-swap');
      void grid.offsetWidth;
      grid.classList.add('is-swap');
      clearTimeout(swapTimer);
      swapTimer = setTimeout(() => grid.classList.remove('is-swap'), 400);
    }
    shownKey = key;
    const shown = new Set(list);
    items.forEach((it) => { if (!shown.has(it) && it.li.parentNode) it.li.remove(); });
    const frag = document.createDocumentFragment();
    list.forEach((it) => frag.appendChild(it.li));
    if (fill) frag.appendChild(fill);
    grid.appendChild(frag);

    const none = list.length === 0;
    grid.hidden = none;
    if (empty) {
      empty.hidden = !none;
      if (none && emptyText) {
        const q = state.q.trim();
        emptyText.textContent = q
          ? `По${NBSP}запросу «${q}» в${NBSP}этом разделе нет товаров${state.stock ? `, которые уже в${NBSP}продаже` : ''}.`
          : emptyDefault;
      }
    }
    if (countEl) countEl.textContent = `${list.length}${NBSP}${plural(list.length, ['товар', 'товара', 'товаров'])}`;
    if (clearBtn) clearBtn.hidden = !state.q;
    if (stockBtn) stockBtn.setAttribute('aria-pressed', String(state.stock));
    if (opts.announce && typeof J.announce === 'function') {
      J.announce(none ? 'Ничего не найдено' : `Показано товаров: ${list.length}`);
    }
    if (opts.save) saveState();
  }

  /* ---------- Управление ---------- */
  if (sortEl) {
    sortEl.value = state.sort;
    sortEl.addEventListener('change', () => {
      state.sort = SORTS.includes(sortEl.value) ? sortEl.value : 'default';
      render({ announce: true, save: true });
    });
  }
  if (input) {
    input.value = state.q;
    input.addEventListener('input', () => {
      state.q = input.value;
      render({ announce: true, save: true });
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value) {
        e.preventDefault();
        setQuery('');
      }
    });
  }
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (input && window.matchMedia('(pointer: coarse)').matches) input.blur(); // убрать клавиатуру с экрана
    });
  }
  function setQuery(q, focus) {
    state.q = q;
    if (input) { input.value = q; if (focus) input.focus(); }
    render({ announce: true, save: true });
  }
  if (clearBtn) clearBtn.addEventListener('click', () => setQuery('', true));
  if (stockBtn) {
    stockBtn.addEventListener('click', () => {
      state.stock = !state.stock;
      render({ announce: true, save: true });
    });
  }
  const resetBtn = $('[data-cat-reset]');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      state.stock = false;
      setQuery('', true);
    });
  }

  render();

  /* ---------- Типографика: модель в абзаце описания не рвётся по дефису (в справочнике она без nowrap) ---------- */
  document.querySelectorAll('.cat-about__lead').forEach((p) => {
    p.innerHTML = p.innerHTML.replace(/(?:ES|PVC)-\d+/g, (model) => `<span class="nowrap">${model}</span>`);
  });

  /* ---------- Чипы категорий: на узком экране это лента, активный чип ставим в поле зрения ---------- */
  const chips = $('[data-cat-chips]');
  const active = chips && $('[aria-current]', chips);
  if (chips && active && chips.scrollWidth > chips.clientWidth + 1) {
    const box = chips.getBoundingClientRect();
    const chip = active.getBoundingClientRect();
    chips.scrollLeft += chip.left - box.left - (box.width - chip.width) / 2;
  }
})();
