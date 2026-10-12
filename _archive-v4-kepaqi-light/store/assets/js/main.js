/* JOIM Store: общий скрипт.
   Справочник товаров (из data.js) · корзина и избранное на localStorage · поиск · панель каталога ·
   окна (<dialog>): корзина, меню, поиск, «Сообщить о поступлении», просмотр картинки · аккордеон · формы · шапка.
   Страничные скрипты берут API из window.JOIM. */
(() => {
  'use strict';

  const doc = document;
  const root = doc.documentElement;
  const $ = (sel, ctx = doc) => ctx.querySelector(sel);
  const $$ = (sel, ctx = doc) => Array.from(ctx.querySelectorAll(sel));

  /* ---------- Справочник ----------
     store/assets/js/data.js создаёт сборка из src/data/products.json: цены, статусы, адреса, картинки, готовая разметка плиток. */
  const DATA = window.JOIM_DATA || { products: {}, categories: [], cards: {}, order: [], freeDeliveryFrom: 15000 };
  const CATALOG = DATA.products;
  const FREE_DELIVERY_FROM = DATA.freeDeliveryFrom;
  const NBSP = ' ';
  const canBuy = (id) => !!CATALOG[id] && CATALOG[id].status === 'in_stock' && CATALOG[id].price != null;

  /* ---------- Помощники ---------- */
  const formatPrice = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP) + NBSP + '₽';
  const plural = (n, forms) => {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b > 1 && b < 5) return forms[1];
    if (b === 1) return forms[0];
    return forms[2];
  };
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // название товара для вставки в разметку: короткий предлог не повисает в конце строки, модель не рвётся по дефису
  const nameHtml = (p) => escapeHtml(p.name).replace(/ (с|в|к|о|у|и|со|для) /g, ` $1${NBSP}`).replace(p.model, `<span class="nowrap">${p.model}</span>`);
  const icon = (name, cls) => `<svg class="icon${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
  const announce = (text) => {
    const live = $('[data-live]');
    if (!live) return;
    live.textContent = '';
    setTimeout(() => { live.textContent = text; }, 50);
  };
  const storage = (() => {
    try { const k = '__joim_test'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; }
    catch (e) { return null; }
  })();
  const priceLabel = (p) => (p.price != null ? formatPrice(p.price) : `Скоро в${NBSP}продаже`);
  // маленькая тёмная плитка с рендером: корзина, поиск
  const thumbHtml = (p, cls) => `<span class="mini-tile${cls ? ' ' + cls : ''}"><img src="${p.img}" alt="" width="${p.w}" height="${p.h}" loading="lazy" decoding="async"></span>`;

  /* ---------- Корзина: данные ---------- */
  const CART_KEY = 'joim.cart.v1';
  let memory = [];

  const sanitize = (list) => (Array.isArray(list) ? list : [])
    .filter((it) => it && canBuy(it.id))
    .map((it) => ({ id: it.id, qty: Math.min(99, Math.max(1, parseInt(it.qty, 10) || 1)) }));

  const readCart = () => {
    if (!storage) return memory;
    try { return sanitize(JSON.parse(storage.getItem(CART_KEY) || '[]')); } catch (e) { return []; }
  };
  const emitChange = () => {
    doc.dispatchEvent(new CustomEvent('cart:change', { detail: { items: cart.items(), count: cart.count(), total: cart.total() } }));
  };
  const writeCart = (list) => {
    memory = sanitize(list);
    if (storage) { try { storage.setItem(CART_KEY, JSON.stringify(memory)); } catch (e) { /* хранилище переполнено или закрыто */ } }
    renderCart();
    emitChange();
  };
  const toQty = (v) => parseInt(v, 10) || 0;

  const cart = {
    items() { return readCart().map((it) => Object.assign({}, CATALOG[it.id], { qty: it.qty, sum: CATALOG[it.id].price * it.qty })); },
    count() { return readCart().reduce((n, it) => n + it.qty, 0); },
    total() { return readCart().reduce((n, it) => n + CATALOG[it.id].price * it.qty, 0); },
    // товары со статусом «скоро» в корзину не добавляются: add вернёт false
    add(id, qty = 1) {
      if (!canBuy(id)) return false;
      const n = Math.max(1, toQty(qty));
      const list = readCart();
      const found = list.find((it) => it.id === id);
      if (found) found.qty += n; else list.push({ id, qty: n });
      writeCart(list);
      return true;
    },
    // количество меньше единицы удаляет товар
    setQty(id, qty) {
      const n = toQty(qty);
      if (n < 1) { this.remove(id); return; }
      writeCart(readCart().map((it) => (it.id === id ? { id, qty: n } : it)));
    },
    remove(id) { writeCart(readCart().filter((it) => it.id !== id)); },
    clear() { writeCart([]); },
    open() { openDialog($('#cart')); },
    close() { closeDialog($('#cart')); },
  };

  /* ---------- Корзина: отрисовка ---------- */
  const cartItemHtml = (it) => `
    <li class="cart-item" data-id="${it.id}">
      <a class="cart-item__media" href="${it.url}" tabindex="-1" aria-hidden="true">${thumbHtml(it)}</a>
      <div class="cart-item__main">
        <div class="cart-item__top">
          <a class="cart-item__name" href="${it.url}">${nameHtml(it)}</a>
          <button class="cart-item__remove" type="button" data-cart-remove data-focus-key="${it.id}:remove" aria-label="Удалить из корзины: ${escapeHtml(it.short)}">${icon('close')}</button>
        </div>
        <p class="cart-item__unit">${formatPrice(it.price)} за${NBSP}штуку</p>
        <div class="cart-item__row">
          <div class="qty qty--sm" role="group" aria-label="Количество: ${escapeHtml(it.short)}">
            <button class="qty__btn" type="button" data-cart-dec data-focus-key="${it.id}:dec" aria-label="Уменьшить количество"${it.qty <= 1 ? ' disabled' : ''}>${icon('minus')}</button>
            <span class="qty__val" aria-live="polite">${it.qty}</span>
            <button class="qty__btn" type="button" data-cart-inc data-focus-key="${it.id}:inc" aria-label="Увеличить количество"${it.qty >= 99 ? ' disabled' : ''}>${icon('plus')}</button>
          </div>
          <span class="cart-item__sum">${formatPrice(it.sum)}</span>
        </div>
      </div>
    </li>`;

  function setCounter(el, n) {
    el.textContent = String(n);
    el.classList.toggle('is-filled', n > 0);
  }

  function renderCart() {
    const items = cart.items();
    const count = cart.count();
    const total = cart.total();

    $$('[data-cart-count]').forEach((el) => setCounter(el, count));
    $$('[data-cart-total]').forEach((el) => { el.textContent = formatPrice(total); });
    $$('[data-cart-button]').forEach((el) => {
      el.setAttribute('aria-label', count
        ? `Корзина: ${count} ${plural(count, ['товар', 'товара', 'товаров'])} на ${formatPrice(total)}`
        : 'Корзина: пусто');
    });

    const box = $('[data-cart]');
    const list = $('[data-cart-list]');
    if (!box || !list) return;
    const focusKey = doc.activeElement && box.contains(doc.activeElement) ? doc.activeElement.getAttribute('data-focus-key') : null;
    list.innerHTML = items.map(cartItemHtml).join('');
    box.classList.toggle('is-empty', items.length === 0);

    const note = $('[data-cart-delivery]', box);
    if (note) {
      const left = FREE_DELIVERY_FROM - total;
      note.innerHTML = left > 0
        ? `Бесплатная доставка от${NBSP}${formatPrice(FREE_DELIVERY_FROM)}. Осталось ${formatPrice(left)}`
        : `<b>Доставка бесплатно:</b> курьер по${NBSP}Москве или СДЭК`;
    }
    if (focusKey) {
      const target = $(`[data-focus-key="${focusKey}"]:not(:disabled)`, box) || $('[data-dialog-close]', box);
      if (target) target.focus();
    }
  }

  doc.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cart-inc], [data-cart-dec], [data-cart-remove]');
    if (!btn) return;
    const row = btn.closest('[data-id]');
    if (!row) return;
    const id = row.getAttribute('data-id');
    const current = readCart().find((it) => it.id === id);
    if (!current) return;
    if (btn.hasAttribute('data-cart-remove')) { cart.remove(id); announce(`${CATALOG[id].short}: удалено из корзины`); }
    else cart.setQty(id, current.qty + (btn.hasAttribute('data-cart-inc') ? 1 : -1));
  });

  /* ---------- «В корзину»: любая кнопка с data-add-to-cart="id" ---------- */
  // Кнопка на 1,2 с показывает «Добавлено» и при этом не меняет ширину: соседи не прыгают.
  function flashAdded(btn) {
    if (btn._timer) clearTimeout(btn._timer);
    else {
      btn._html = btn.innerHTML;
      const width = btn.getBoundingClientRect().width;
      btn.innerHTML = icon('check') + '<span>Добавлено</span>';
      if (btn.getBoundingClientRect().width > width + 0.5) btn.innerHTML = '<span>Добавлено</span>';
      btn.style.width = width + 'px';
    }
    btn.classList.add('is-added');
    btn._timer = setTimeout(() => {
      btn.classList.remove('is-added');
      btn.innerHTML = btn._html;
      btn.style.width = '';
      btn._timer = null;
    }, 1200);
  }
  function bump(sel) {
    $$(sel).forEach((el) => {
      el.classList.remove('is-bump');
      void el.offsetWidth; // перезапуск анимации
      el.classList.add('is-bump');
    });
  }
  doc.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-add-to-cart]');
    if (!btn || btn.disabled) return;
    e.preventDefault();
    const id = btn.getAttribute('data-add-to-cart');
    if (CATALOG[id] && !canBuy(id)) { openNotify(id); return; } // товар «скоро»: вместо корзины окно «Сообщить о поступлении»
    if (!cart.add(id, Math.max(1, parseInt(btn.getAttribute('data-qty'), 10) || 1))) return;
    flashAdded(btn);
    bump('.round-btn__count[data-cart-count]');
    announce(`${CATALOG[id].short}: добавлено в корзину`);
    if (btn.hasAttribute('data-cart-open')) cart.open();
  });

  /* ---------- Избранное: сердце с data-fav="id", счётчик data-fav-count ---------- */
  const FAV_KEY = 'joim.fav.v1';
  let favMemory = [];
  const readFav = () => {
    if (!storage) return favMemory;
    try { const v = JSON.parse(storage.getItem(FAV_KEY) || '[]'); return (Array.isArray(v) ? v : []).filter((id, i, a) => CATALOG[id] && a.indexOf(id) === i); }
    catch (e) { return []; }
  };
  const writeFav = (list) => {
    favMemory = list.filter((id) => CATALOG[id]);
    if (storage) { try { storage.setItem(FAV_KEY, JSON.stringify(favMemory)); } catch (e) { /* хранилище закрыто */ } }
    fav.sync();
    doc.dispatchEvent(new CustomEvent('fav:change', { detail: { items: fav.items(), count: fav.count() } }));
  };
  const fav = {
    items() { return readFav(); },
    count() { return readFav().length; },
    has(id) { return readFav().includes(id); },
    add(id) { if (CATALOG[id] && !this.has(id)) writeFav([...readFav(), id]); },
    remove(id) { if (this.has(id)) writeFav(readFav().filter((x) => x !== id)); },
    toggle(id) { if (!CATALOG[id]) return false; const on = !this.has(id); if (on) this.add(id); else this.remove(id); return on; },
    clear() { writeFav([]); },
    // расставляет состояние сердец и счётчик; scope: куда только что вставили плитки
    sync(scope = doc) {
      const list = readFav();
      $$('[data-fav]', scope).forEach((btn) => {
        const id = btn.getAttribute('data-fav');
        const on = list.includes(id);
        const name = CATALOG[id] ? CATALOG[id].short : '';
        btn.setAttribute('aria-pressed', String(on));
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-label', `${on ? 'Убрать из избранного' : 'В избранное'}: ${name}`);
      });
      $$('[data-fav-count]').forEach((el) => setCounter(el, list.length));
      $$('[data-fav-link]').forEach((el) => el.setAttribute('aria-label', list.length
        ? `Избранное: ${list.length} ${plural(list.length, ['товар', 'товара', 'товаров'])}` : 'Избранное: пусто'));
    },
  };
  doc.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-fav]');
    if (!btn) return;
    e.preventDefault();
    const id = btn.getAttribute('data-fav');
    const on = fav.toggle(id);
    if (on) bump('.round-btn__count[data-fav-count]');
    if (CATALOG[id]) announce(`${CATALOG[id].short}: ${on ? 'добавлено в избранное' : 'убрано из избранного'}`);
  });

  // корзину или избранное изменили в другой вкладке; страница вернулась из bfcache
  window.addEventListener('storage', (e) => {
    if (e.key === CART_KEY || e.key === null) { renderCart(); emitChange(); }
    if (e.key === FAV_KEY || e.key === null) { fav.sync(); doc.dispatchEvent(new CustomEvent('fav:change', { detail: { items: fav.items(), count: fav.count() } })); }
  });
  window.addEventListener('pageshow', (e) => { if (e.persisted) { renderCart(); emitChange(); fav.sync(); } });

  /* ---------- Окна: корзина, меню, поиск, модальные (<dialog>) ----------
     Открыть: data-dialog-open="id". Закрыть: data-dialog-close внутри окна, Esc или клик по затемнению. */
  function syncOpeners(dlg, open) {
    $$(`[data-dialog-open="${dlg.id}"][aria-expanded]`).forEach((b) => b.setAttribute('aria-expanded', String(open)));
  }
  function finishClose(dlg) {
    dlg.classList.remove('is-closing');
    if (dlg.open) dlg.close();
    syncOpeners(dlg, false);
    if (!$('dialog[open]')) root.classList.remove('is-locked');
  }
  function openDialog(dlg) {
    if (!dlg || typeof dlg.showModal !== 'function') return;
    if (dlg.open && !dlg.classList.contains('is-closing')) return;
    closeCatmenu();
    $$('dialog[open]').forEach((other) => { if (other !== dlg) finishClose(other); });
    if (dlg.open) finishClose(dlg);
    // ширина полосы прокрутки: чтобы страница не дёргалась, пока прокрутка заблокирована
    root.style.setProperty('--scrollbar', Math.max(0, window.innerWidth - root.clientWidth) + 'px');
    dlg.showModal();
    root.classList.add('is-locked');
    syncOpeners(dlg, true);
    dlg.dispatchEvent(new CustomEvent('dialog:open', { bubbles: true }));
  }
  function closeDialog(dlg) {
    if (!dlg || !dlg.open || dlg.classList.contains('is-closing')) return;
    dlg.classList.add('is-closing');
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      dlg.removeEventListener('animationend', onEnd);
      finishClose(dlg);
      dlg.dispatchEvent(new CustomEvent('dialog:close', { bubbles: true }));
    };
    const onEnd = (e) => { if (e.target === dlg) end(); };
    dlg.addEventListener('animationend', onEnd);
    setTimeout(end, 400);
  }

  // затемнение: цель события сам <dialog>, а точка вне его прямоугольника
  const onBackdrop = (e) => {
    if (!(e.target instanceof HTMLDialogElement) || !e.target.open) return false;
    const r = e.target.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  // выделяли текст в поле и отпустили мышь за краем окна: окно остаётся открытым
  let pressedOnBackdrop = false;
  doc.addEventListener('pointerdown', (e) => { pressedOnBackdrop = onBackdrop(e); }, true);
  doc.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-dialog-open]');
    if (opener) { e.preventDefault(); openDialog(doc.getElementById(opener.getAttribute('data-dialog-open'))); return; }
    const closer = e.target.closest('[data-dialog-close]');
    if (closer) { closeDialog(closer.closest('dialog')); return; }
    if (pressedOnBackdrop && onBackdrop(e)) closeDialog(e.target);
    pressedOnBackdrop = false;
  });
  doc.addEventListener('cancel', (e) => {
    if (e.target instanceof HTMLDialogElement) { e.preventDefault(); closeDialog(e.target); }
  }, true);
  // окно закрыл сам браузер (повторный Esc, form method="dialog"): снимаем блокировку прокрутки
  doc.addEventListener('close', (e) => {
    if (!(e.target instanceof HTMLDialogElement)) return;
    e.target.classList.remove('is-closing');
    syncOpeners(e.target, false);
    if (!$('dialog[open]')) root.classList.remove('is-locked');
  }, true);

  // меню закрывается, когда экран становится десктопным
  const desktopNav = window.matchMedia('(min-width: 960px)');
  desktopNav.addEventListener('change', (e) => { if (e.matches) { const m = $('#menu'); if (m && m.open) finishClose(m); } else closeCatmenu(); });

  /* ---------- Панель каталога в шапке: кнопка data-catmenu-toggle, панель data-catmenu ---------- */
  function setCatmenu(open) {
    const panel = $('[data-catmenu]');
    const header = $('[data-header]');
    if (!panel) return;
    if (open === !panel.hidden) return;
    panel.hidden = !open;
    if (header) header.classList.toggle('is-menu-open', open);
    $$('[data-catmenu-toggle]').forEach((b) => b.setAttribute('aria-expanded', String(open)));
  }
  function closeCatmenu() { setCatmenu(false); }
  doc.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-catmenu-toggle]');
    const panel = $('[data-catmenu]');
    if (toggle && panel) { setCatmenu(panel.hidden); return; }
    if (panel && !panel.hidden && !e.target.closest('.catmenu__panel')) closeCatmenu();
  });
  doc.addEventListener('keydown', (e) => {
    const panel = $('[data-catmenu]');
    if (e.key === 'Escape' && panel && !panel.hidden) { closeCatmenu(); const b = $('[data-catmenu-toggle]'); if (b) b.focus(); }
  });

  /* ---------- Поиск по товарам: окно #search ----------
     Ищет по названию, модели, типу и категориям. Слова сравниваются по основам: «дизель» находит «для дизеля»,
     «автопылесосы» находят «автопылесос». «ES-19», «es19» и «ес 19» дают один результат. */
  const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[\s\-–—.,:;!?«»"()]+/g, ' ')
    .replace(/(^| )(ес|еs|eс)(?= ?\d)/g, '$1es').replace(/(^| )(пвс|пвц|пвк)(?= ?\d)/g, '$1pvc').trim();
  const squash = (s) => norm(s).replace(/ /g, '');
  // основа слова: у русских слов от четырёх букв срезается окончание (основа не короче трёх букв)
  const ENDING = /(иями|ями|ами|ого|его|ому|ему|ыми|ими|ией|ия|ие|ию|ов|ев|ей|ам|ям|ах|ях|ом|ем|ой|ый|ий|ая|яя|ое|ее|ые|ых|их|ую|юю|ы|и|а|я|у|ю|е|о|ь)$/;
  const stem = (w) => {
    if (w.length < 4 || !/^[а-я]+$/.test(w)) return w;
    const base = w.replace(ENDING, '');
    return base.length >= 3 ? base : w;
  };
  const stems = (text) => norm(text).split(' ').filter(Boolean).map(stem);
  const TYPE_WORDS = {
    jump: 'пусковое устройство бустер пуско зарядное стартер аккумулятор запуск двигателя автомобиль машина бензин дизель фонарь повербанк jump starter easy start',
    vacuum: 'автопылесос автопылесосы автомобильный пылесос беспроводной уборка салон машина vacuum',
  };
  const CAT_WORDS = {
    kompressor: 'компрессор подкачка колес насос',
    dizel: 'дизельный большой мотор грузовик',
  };
  const catName = (id) => { const c = DATA.categories.find((x) => x.id === id); return c ? c.name : ''; };
  const searchIndex = DATA.order.map((id) => {
    const p = CATALOG[id];
    const text = norm([p.name, p.short, p.model, p.typeName, TYPE_WORDS[p.type] || '', p.cats.map(catName).join(' '), p.cats.map((c) => CAT_WORDS[c] || '').join(' '), p.status === 'soon' ? 'скоро новинка' : 'в наличии в продаже'].join(' '));
    return { id, text, stems: ' ' + stems(text).join(' '), flat: text.replace(/ /g, '') };
  });
  function search(query) {
    const q = norm(query);
    if (!q) return [];
    const words = q.split(' ').filter(Boolean);
    const flatQ = squash(query);
    return searchIndex
      .filter((row) => words.every((w) => row.text.includes(w) || row.stems.includes(stem(w))) || (flatQ.length > 1 && row.flat.includes(flatQ)))
      .map((row) => CATALOG[row.id]);
  }
  const searchRowHtml = (p) => `
    <li>
      <a class="search-row" href="${p.url}">
        ${thumbHtml(p)}
        <span class="search-row__main">
          <span class="search-row__name">${nameHtml(p)}</span>
          <span class="search-row__meta">${escapeHtml(catName(p.cats[0]) || p.typeName)}</span>
        </span>
        <span class="search-row__price${p.price == null ? ' search-row__price--soon' : ''}">${priceLabel(p)}</span>
      </a>
    </li>`;
  function renderSearch() {
    const input = $('[data-search-input]');
    const list = $('[data-search-results]');
    const hint = $('[data-search-hint]');
    const empty = $('[data-search-empty]');
    if (!input || !list) return;
    const q = input.value.trim();
    const found = q ? search(q) : DATA.order.map((id) => CATALOG[id]).filter((p) => p.status === 'in_stock');
    list.innerHTML = found.map(searchRowHtml).join('');
    if (hint) { hint.textContent = q ? `Найдено: ${found.length}` : 'Популярное'; hint.hidden = !!q && !found.length; }
    if (empty) empty.hidden = !(q && !found.length);
    if (q) announce(found.length ? `Найдено товаров: ${found.length}` : 'Ничего не найдено');
  }
  doc.addEventListener('input', (e) => { if (e.target.matches && e.target.matches('[data-search-input]')) renderSearch(); });
  doc.addEventListener('submit', (e) => {
    if (!e.target.matches || !e.target.matches('[data-search-form]')) return;
    e.preventDefault();
    const first = $('[data-search-results] a');
    if (first) location.href = first.getAttribute('href');
  });
  doc.addEventListener('dialog:open', (e) => {
    if (e.target.id !== 'search') return;
    renderSearch();
    const input = $('[data-search-input]');
    if (input) { input.focus(); input.select(); }
  });

  /* ---------- «Сообщить о поступлении»: кнопка data-notify="id", окно #notify ---------- */
  function resetForm(form) {
    form.reset();
    form.classList.remove('is-sent');
    $$('.is-invalid', form).forEach((el) => el.classList.remove('is-invalid'));
    $$('.field__error', form).forEach((el) => { el.hidden = true; });
    $$('[aria-invalid]', form).forEach((el) => el.removeAttribute('aria-invalid'));
    const ok = $('[data-form-success]', form);
    if (ok) ok.hidden = true;
  }
  function openNotify(id) {
    const dlg = $('#notify');
    const p = CATALOG[id];
    if (!dlg || !p) return;
    const form = $('form', dlg);
    if (form) resetForm(form);
    $$('[data-notify-name]', dlg).forEach((el) => { el.textContent = p.short; });
    const hidden = $('[data-notify-id]', dlg);
    if (hidden) hidden.value = id;
    openDialog(dlg);
  }
  doc.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-notify]');
    if (!btn) return;
    e.preventDefault();
    openNotify(btn.getAttribute('data-notify'));
  });

  /* ---------- Просмотр картинки: ссылка data-lightbox (href = картинка, data-caption = подпись), окно #lightbox ---------- */
  doc.addEventListener('click', (e) => {
    const link = e.target.closest('[data-lightbox]');
    const dlg = $('#lightbox');
    if (!link || !dlg) return;
    e.preventDefault();
    const img = $('[data-lightbox-img]', dlg);
    const cap = $('[data-lightbox-caption]', dlg);
    const caption = link.getAttribute('data-caption') || '';
    img.removeAttribute('width');
    img.removeAttribute('height');
    img.src = link.getAttribute('href');
    img.alt = caption;
    if (cap) { cap.textContent = caption; cap.hidden = !caption; }
    openDialog(dlg);
  });

  /* ---------- Аккордеон ----------
     Разметка: .accordion > .accordion__item(.is-open) > .accordion__head > button.accordion__btn + .accordion__panel > .accordion__body
     data-accordion="single" на .accordion: открыт только один пункт. */
  let uid = 0;
  function initAccordions(scope = doc) {
    $$('.accordion__btn', scope).forEach((btn) => {
      const item = btn.closest('.accordion__item');
      const panel = item && $('.accordion__panel', item);
      if (!panel) return;
      if (!panel.id) panel.id = `acc-panel-${++uid}`;
      if (!btn.id) btn.id = `acc-btn-${uid}`;
      btn.setAttribute('aria-controls', panel.id);
      btn.setAttribute('aria-expanded', String(item.classList.contains('is-open')));
      panel.setAttribute('role', 'region');
      panel.setAttribute('aria-labelledby', btn.id);
    });
  }
  function toggleAccordion(btn, force) {
    const item = btn.closest('.accordion__item');
    if (!item) return;
    const open = typeof force === 'boolean' ? force : !item.classList.contains('is-open');
    const group = item.closest('.accordion');
    if (open && group && group.getAttribute('data-accordion') === 'single') {
      $$('.accordion__item.is-open', group).forEach((other) => {
        if (other !== item && other.closest('.accordion') === group) {
          other.classList.remove('is-open');
          const b = $('.accordion__btn', other);
          if (b) b.setAttribute('aria-expanded', 'false');
        }
      });
    }
    item.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
  }
  doc.addEventListener('click', (e) => {
    const btn = e.target.closest('.accordion__btn');
    if (btn) toggleAccordion(btn);
  });

  /* ---------- Формы: form[data-form] novalidate ----------
     Проверяет обязательные поля, телефон и почту, показывает ошибку в .field__error, после успеха
     добавляет форме .is-sent, показывает [data-form-success] и шлёт событие form:sent. Ничего не отправляет.
     Поле с data-contact принимает телефон или e-mail. */
  const digits = (v) => v.replace(/\D/g, '');
  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  function formatPhone(value) {
    let d = digits(value);
    if (!d) return '';
    // Код страны: «+7» или семёрка первой цифрой. Восьмёрка первой цифрой может быть и выходом на межгород («8 916 …»),
    // и началом кода («800 …», «812 …»): срезаем её, только когда цифр набралось больше десяти.
    if (/^\s*\+\s*7/.test(value) || d[0] === '7') d = d.slice(1);
    if (d.length > 10 && d[0] === '8') d = d.slice(1);
    d = d.slice(0, 10);
    let out = '+7';
    if (d.length) out += ' ' + d.slice(0, 3);
    if (d.length > 3) out += ' ' + d.slice(3, 6);
    if (d.length > 6) out += '-' + d.slice(6, 8);
    if (d.length > 8) out += '-' + d.slice(8, 10);
    return out;
  }
  function fieldError(el) {
    const value = el.value.trim();
    if (el.type === 'checkbox') return el.required && !el.checked ? (el.getAttribute('data-error') || 'Нужно согласие') : '';
    if (el.required && !value) return el.getAttribute('data-error') || 'Заполните поле';
    if (value && el.hasAttribute('data-contact') && !isEmail(value) && digits(value).length < 10) return 'Проверьте телефон или e-mail';
    if (value && el.type === 'tel' && digits(value).length !== 11) return 'Введите номер полностью: +7 и 10 цифр';
    if (value && el.type === 'email' && !isEmail(value)) return 'Проверьте адрес почты';
    return '';
  }
  function validateField(el) {
    const msg = fieldError(el);
    const field = el.closest('.field') || el.closest('.check') || el.parentElement;
    let box = $('.field__error', field);
    if (msg && !box) {
      box = doc.createElement('p');
      box.className = 'field__error';
      box.id = `err-${++uid}`;
      field.appendChild(box);
    }
    if (box) { box.textContent = msg; box.hidden = !msg; }
    field.classList.toggle('is-invalid', !!msg);
    if (msg) { el.setAttribute('aria-invalid', 'true'); if (box.id) el.setAttribute('aria-describedby', box.id); }
    else { el.removeAttribute('aria-invalid'); }
    return !msg;
  }
  const formControls = (form) => $$('input, select, textarea', form).filter((el) => el.type !== 'hidden' && !el.disabled);

  doc.addEventListener('input', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement)) return;
    if (el.matches('input[type="tel"]')) {
      const atEnd = el.selectionStart === el.value.length;
      el.value = formatPhone(el.value);
      if (atEnd) el.setSelectionRange(el.value.length, el.value.length);
    }
    if (el.matches('.range')) setRangeFill(el);
    if (el.closest('form[data-form]') && el.getAttribute('aria-invalid') === 'true') validateField(el);
  });
  doc.addEventListener('change', (e) => {
    const el = e.target;
    if (el instanceof HTMLElement && el.closest('form[data-form]') && el.getAttribute('aria-invalid') === 'true') validateField(el);
  });
  doc.addEventListener('submit', (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-form')) return;
    e.preventDefault();
    const bad = formControls(form).filter((el) => !validateField(el));
    if (bad.length) { bad[0].focus(); return; }
    form.classList.add('is-sent');
    const ok = $('[data-form-success]', form);
    if (ok) { ok.hidden = false; ok.setAttribute('tabindex', '-1'); ok.focus(); }
    form.dispatchEvent(new CustomEvent('form:sent', { bubbles: true, detail: Object.fromEntries(new FormData(form)) }));
  });
  // форма в окне с data-form-reset при каждом открытии окна возвращается в исходное состояние
  doc.addEventListener('dialog:open', (e) => {
    $$('form[data-form][data-form-reset]', e.target).forEach(resetForm);
  });

  /* ---------- Ползунок: заполненная часть дорожки ---------- */
  function setRangeFill(el) {
    const min = parseFloat(el.min) || 0;
    const max = parseFloat(el.max) || 100;
    el.style.setProperty('--val', ((parseFloat(el.value) - min) / (max - min)) * 100 + '%');
  }

  /* ---------- Активный раздел в шапке и меню ---------- */
  function markActiveNav() {
    const here = location.pathname.replace(/index\.html$/, '');
    let key = doc.body.getAttribute('data-nav');
    const links = $$('[data-nav-key]');
    if (!key) {
      let best = '';
      links.forEach((a) => {
        const p = a.pathname;
        if (p !== '/' && here.indexOf(p) === 0 && p.length > best.length) { best = p; key = a.getAttribute('data-nav-key'); }
      });
    }
    if (!key) return;
    links.forEach((a) => {
      if (a.getAttribute('data-nav-key') === key) a.setAttribute('aria-current', a.pathname === here ? 'page' : 'true');
    });
    if (key === 'catalog') $$('[data-catmenu-toggle]').forEach((b) => b.classList.add('is-current'));
  }

  /* ---------- Шапка: прозрачная над тёмным первым экраном, белая после прокрутки ----------
     Работает на страницах с body.has-dark-top (класс ставит сборка по "darkTop": true в мете страницы). */
  function initHeader() {
    const header = $('[data-header]');
    if (!header || !doc.body.classList.contains('has-dark-top')) return;
    let solid = null;
    const sync = () => {
      const next = window.scrollY > 8;
      if (next === solid) return;
      solid = next;
      header.classList.toggle('is-solid', next);
    };
    sync();
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('pageshow', sync);
  }

  /* ---------- Лента с горизонтальной прокруткой ----------
     Разметка: [data-slider] > [data-slider-track] (overflow-x, scroll-snap) + кнопки [data-slider-prev] / [data-slider-next] где угодно внутри [data-slider]. */
  function initSliders(scope = doc) {
    $$('[data-slider]', scope).forEach((box) => {
      if (box._slider) return;
      box._slider = true;
      const track = $('[data-slider-track]', box);
      const prev = $('[data-slider-prev]', box);
      const next = $('[data-slider-next]', box);
      if (!track) return;
      const step = () => {
        const first = track.firstElementChild;
        if (!first) return track.clientWidth;
        const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
        return first.getBoundingClientRect().width + gap;
      };
      const sync = () => {
        const max = track.scrollWidth - track.clientWidth - 2;
        if (prev) prev.disabled = track.scrollLeft <= 2;
        if (next) next.disabled = track.scrollLeft >= max;
      };
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
      const go = (dir) => track.scrollBy({ left: dir * step(), behavior: reduce.matches ? 'auto' : 'smooth' });
      if (prev) prev.addEventListener('click', () => go(-1));
      if (next) next.addEventListener('click', () => go(1));
      track.addEventListener('scroll', sync, { passive: true });
      window.addEventListener('resize', sync);
      sync();
    });
  }

  /* ---------- Запуск ---------- */
  function init() {
    initHeader();
    renderCart();
    fav.sync();
    initAccordions();
    initSliders();
    markActiveNav();
    $$('.range').forEach(setRangeFill);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();

  window.JOIM = {
    data: DATA,
    catalog: CATALOG,
    categories: DATA.categories,
    order: DATA.order,
    cardHtml: (id) => DATA.cards[id] || '',
    canBuy,
    cart,
    fav,
    search,
    openNotify,
    formatPrice,
    plural,
    icon,
    announce,
    openDialog,
    closeDialog,
    initAccordions,
    toggleAccordion,
    initSliders,
    setRangeFill,
  };
})();
