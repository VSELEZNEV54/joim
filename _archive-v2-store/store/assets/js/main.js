/* JOIM Store: общий скрипт.
   Справочник товаров · корзина на localStorage · «В корзину» по data-атрибуту · окна (<dialog>) ·
   мобильное меню · аккордеон · формы · активный раздел. Страничные скрипты берут API из window.JOIM. */
(() => {
  'use strict';

  const doc = document;
  const root = doc.documentElement;
  const $ = (sel, ctx = doc) => ctx.querySelector(sel);
  const $$ = (sel, ctx = doc) => Array.from(ctx.querySelectorAll(sel));

  /* ---------- Справочник товаров ----------
     Единственный источник цен, адресов и картинок: его же читает сборка (build.mjs).
     Между метками должен оставаться строгий JSON (двойные кавычки, без комментариев и запятых в конце).
     limitPetrol и limitDiesel у ES-19: предел объёма двигателя в литрах, по нему считает подбор. */
  const CATALOG = /*catalog:start*/{
    "es19": {
      "name": "Пусковое устройство JOIM Easy Start ES-19",
      "short": "Easy Start ES-19",
      "price": 5837,
      "limitPetrol": 8,
      "limitDiesel": 7,
      "url": "/product/joim-easy-start-es19/",
      "img": "https://joim.netlify.app/images/products/joim-es19-card.webp",
      "w": 564,
      "h": 1200,
      "tilt": false
    },
    "es29": {
      "name": "Пусковое устройство JOIM Easy Start ES-29",
      "short": "Easy Start ES-29",
      "price": 7604,
      "url": "/product/joim-easy-start-es29/",
      "img": "https://joim.netlify.app/images/products/joim-es29-card.webp",
      "w": 549,
      "h": 1200,
      "tilt": false
    },
    "pvc1": {
      "name": "Беспроводной автопылесос JOIM PVC-1",
      "short": "Автопылесос PVC-1",
      "price": 7281,
      "url": "/product/joim-pvc1/",
      "img": "https://joim.netlify.app/images/products/joim-pvc1-card.webp",
      "w": 225,
      "h": 1200,
      "tilt": true
    }
  }/*catalog:end*/;
  Object.keys(CATALOG).forEach((id) => { CATALOG[id].id = id; });

  const FREE_DELIVERY_FROM = 15000; // курьер по Москве и СДЭК бесплатно от этой суммы
  const NBSP = ' ';

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
  const icon = (name, cls) => `<svg class="icon${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
  const announce = (text) => {
    const live = $('[data-live]');
    if (!live) return;
    live.textContent = '';
    setTimeout(() => { live.textContent = text; }, 50);
  };

  /* ---------- Корзина: данные ---------- */
  const CART_KEY = 'joim.cart.v1';
  const storage = (() => {
    try { const k = '__joim_test'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; }
    catch (e) { return null; }
  })();
  let memory = [];

  const sanitize = (list) => (Array.isArray(list) ? list : [])
    .filter((it) => it && CATALOG[it.id])
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
    add(id, qty = 1) {
      if (!CATALOG[id]) return false;
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
      <a class="cart-item__media plate plate--auto${it.tilt ? ' plate--tilt' : ''}" href="${it.url}" tabindex="-1" aria-hidden="true">
        <img src="${it.img}" alt="" width="${it.w}" height="${it.h}" loading="lazy" decoding="async">
      </a>
      <div class="cart-item__main">
        <div class="cart-item__top">
          <a class="cart-item__name" href="${it.url}">${escapeHtml(it.name)}<span class="cart-item__unit">${formatPrice(it.price)} за штуку</span></a>
          <button class="icon-btn cart-item__remove" type="button" data-cart-remove data-focus-key="${it.id}:remove" aria-label="Удалить из корзины: ${escapeHtml(it.short)}">${icon('trash')}</button>
        </div>
        <div class="cart-item__row">
          <div class="qty" role="group" aria-label="Количество: ${escapeHtml(it.short)}">
            <button class="qty__btn" type="button" data-cart-dec data-focus-key="${it.id}:dec" aria-label="Уменьшить количество"${it.qty <= 1 ? ' disabled' : ''}>${icon('minus')}</button>
            <span class="qty__val" aria-live="polite">${it.qty}</span>
            <button class="qty__btn" type="button" data-cart-inc data-focus-key="${it.id}:inc" aria-label="Увеличить количество"${it.qty >= 99 ? ' disabled' : ''}>${icon('plus')}</button>
          </div>
          <span class="cart-item__sum">${formatPrice(it.sum)}</span>
        </div>
      </div>
    </li>`;

  function renderCart() {
    const items = cart.items();
    const count = cart.count();
    const total = cart.total();

    $$('[data-cart-count]').forEach((el) => { el.textContent = String(count); el.hidden = count === 0; });
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
        ? `Курьер по${NBSP}Москве и${NBSP}СДЭК бесплатно от${NBSP}${formatPrice(FREE_DELIVERY_FROM)}. Осталось ${formatPrice(left)}`
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

  // корзину изменили в другой вкладке
  window.addEventListener('storage', (e) => { if (e.key === CART_KEY || e.key === null) { renderCart(); emitChange(); } });
  // страница вернулась из bfcache: состояние могло устареть
  window.addEventListener('pageshow', (e) => { if (e.persisted) { renderCart(); emitChange(); } });

  /* ---------- «В корзину»: любая кнопка с data-add-to-cart="id" ---------- */
  // Кнопка на 1,2 с показывает «Добавлено» и при этом не меняет ширину: соседи не прыгают.
  // Если «галочка + слово» шире самой кнопки, остаётся одно слово.
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
  function bumpCount() {
    $$('.cart-btn__count').forEach((el) => {
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
    if (!cart.add(id, Math.max(1, parseInt(btn.getAttribute('data-qty'), 10) || 1))) return;
    flashAdded(btn);
    bumpCount();
    announce(`${CATALOG[id].short}: добавлено в корзину`);
    if (btn.hasAttribute('data-cart-open')) cart.open();
  });

  /* ---------- Окна: корзина, меню, модальные (<dialog>) ----------
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
  const desktopNav = window.matchMedia('(min-width: 1140px)');
  desktopNav.addEventListener('change', (e) => { if (e.matches) { const m = $('#menu'); if (m && m.open) finishClose(m); } });

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
     добавляет форме .is-sent, показывает [data-form-success] и шлёт событие form:sent. Ничего не отправляет. */
  const digits = (v) => v.replace(/\D/g, '');
  function formatPhone(value) {
    let d = digits(value);
    if (!d) return '';
    if (d[0] === '8' || d[0] === '7') d = d.slice(1);
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
    if (value && el.type === 'tel' && digits(value).length !== 11) return 'Введите номер полностью: +7 и 10 цифр';
    if (value && el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return 'Проверьте адрес почты';
    return '';
  }
  function validateField(el) {
    const msg = fieldError(el);
    const field = el.closest('.field') || el.closest('.checkbox') || el.parentElement;
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
      // раздел не задан в мете: берём пункт с самым длинным подходящим адресом
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
  }

  /* ---------- Футер: на телефоне колонки сворачиваются ---------- */
  function initFooter() {
    const cols = $$('details.footer__col');
    if (!cols.length) return;
    const mobile = window.matchMedia('(max-width: 767px)');
    const sync = () => cols.forEach((d) => {
      d.open = !mobile.matches;
      const s = $('summary', d);
      if (s) { if (mobile.matches) s.removeAttribute('tabindex'); else s.setAttribute('tabindex', '-1'); }
    });
    sync();
    mobile.addEventListener('change', sync);
    doc.addEventListener('click', (e) => { if (!mobile.matches && e.target.closest('details.footer__col > summary')) e.preventDefault(); });
  }

  /* ---------- Запуск ---------- */
  function init() {
    renderCart();
    initAccordions();
    markActiveNav();
    initFooter();
    $$('.range').forEach(setRangeFill);
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();

  window.JOIM = {
    catalog: CATALOG,
    cart,
    formatPrice,
    plural,
    icon,
    announce,
    openDialog,
    closeDialog,
    initAccordions,
    toggleAccordion,
    setRangeFill,
  };
})();
