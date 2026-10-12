/* JOIM · вариант C «Выручалка». Ванильный JS, без зависимостей. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NB = String.fromCharCode(160); // неразрывный пробел
  const rub = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NB) + NB + '₽';
  const num = (n) => n.toFixed(2).replace(/0$/, '').replace('.', ',');

  const IMG = 'https://joim.netlify.app/images/products/';
  const PRODUCTS = {
    es19: { short: 'ES-19', line: 'JOIM Easy Start', name: 'JOIM Easy Start ES-19', price: 5837, url: '/product/joim-easy-start-es19', img: IMG + 'joim-es19-card.webp', w: 564, alt: 'Пусковое устройство JOIM Easy Start ES-19' },
    es29: { short: 'ES-29', line: 'JOIM Easy Start', name: 'JOIM Easy Start ES-29', price: 7604, url: '/product/joim-easy-start-es29', img: IMG + 'joim-es29-card.webp', w: 549, alt: 'Пусковое устройство JOIM Easy Start ES-29' },
    pvc1: { short: 'PVC-1', line: 'Автопылесос JOIM', name: 'Автопылесос JOIM PVC-1', price: 7281, url: '/product/joim-pvc1', img: IMG + 'joim-pvc1-card.webp', w: 225, alt: 'Автопылесос JOIM PVC-1' }
  };
  const FREE_FROM = 15000; // бесплатная доставка курьером и СДЭК

  const live = $('[data-live]');
  const say = (text) => { if (live) { live.textContent = ''; setTimeout(() => { live.textContent = text; }, 30); } };

  /* ── Вход первого экрана: один раз, после загрузки шрифтов ── */
  const start = () => requestAnimationFrame(() => {
    root.classList.add('is-ready');
    setTimeout(() => root.classList.add('is-settled'), 1700);
  });
  if (document.fonts && document.fonts.ready) {
    Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]).then(start);
  } else start();

  /* ── Шапка, знак и липкая панель: один обработчик прокрутки ── */
  const head = $('[data-head]');
  const hero = $('.hero');
  const foot = $('.foot');
  const buybar = $('[data-buybar]');
  const spins = $$('[data-spin]');
  const wide = matchMedia('(min-width: 900px)');
  let ticking = false;

  function onFrame() {
    ticking = false;
    const vh = innerHeight;
    head.classList.toggle('is-stuck', scrollY > 8);

    if (buybar && hero && foot) {
      const show = hero.getBoundingClientRect().bottom < 0 && foot.getBoundingClientRect().top > vh;
      buybar.classList.toggle('is-on', show);
    }

    // большой знак доворачивается на 90° за время прохода секции, только десктоп
    if (!reduce && wide.matches) {
      for (const el of spins) {
        const host = el.closest('.plate, section, footer') || el;
        const r = host.getBoundingClientRect();
        if (r.bottom < -80 || r.top > vh + 80) continue;
        const p = (vh - r.top) / (vh + r.height);
        el.style.setProperty('--spin', (p * 90).toFixed(1) + 'deg');
      }
    }
  }
  const requestFrame = () => { if (!ticking) { ticking = true; requestAnimationFrame(onFrame); } };
  addEventListener('scroll', requestFrame, { passive: true });
  addEventListener('resize', requestFrame);
  onFrame();

  /* ── Мобильное меню ── */
  const burger = $('[data-burger]');
  const menu = $('[data-menu]');
  const behind = [$('#main'), foot, buybar].filter(Boolean);

  function setMenu(open) {
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Меню');
    head.classList.toggle('is-menu', open);
    document.body.style.overflow = open ? 'hidden' : '';
    behind.forEach((el) => { el.inert = open; });
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(() => menu.classList.add('is-open'));
    } else {
      menu.classList.remove('is-open');
      setTimeout(() => { if (burger.getAttribute('aria-expanded') === 'false') menu.hidden = true; }, 330);
    }
  }
  if (burger && menu) {
    burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') { setMenu(false); burger.focus(); }
    });
    matchMedia('(min-width: 1100px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });
  }

  /* ── Корзина ── */
  const KEY = 'joim-c-cart';
  let cart = {};
  try { cart = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { cart = {}; }
  Object.keys(cart).forEach((id) => { if (!PRODUCTS[id] || !(cart[id] > 0)) delete cart[id]; });

  const dlg = $('[data-cart]');
  const countEl = $('[data-cart-count]');
  const countSr = $('[data-cart-sr]');
  const listEl = $('[data-cart-list]');
  const emptyEl = $('[data-cart-empty]');
  const footEl = $('[data-cart-foot]');
  const totalEl = $('[data-cart-total]');
  const shipEl = $('[data-cart-ship]');

  const plural = (n, f) => f[(n % 10 === 1 && n % 100 !== 11) ? 0 : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 1 : 2];
  const cartCount = () => Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotal = () => Object.entries(cart).reduce((a, [id, q]) => a + PRODUCTS[id].price * q, 0);

  function saveCart() { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) { /* приватный режим */ } }

  function renderCart(bump) {
    const count = cartCount();
    const total = cartTotal();
    countEl.textContent = count;
    countSr.textContent = count ? `${count} ${plural(count, ['товар', 'товара', 'товаров'])} на ${rub(total)}` : 'пусто';
    if (bump && !reduce) {
      countEl.classList.remove('is-bump');
      void countEl.offsetWidth;
      countEl.classList.add('is-bump');
    }

    emptyEl.hidden = count > 0;
    listEl.hidden = footEl.hidden = count === 0;
    listEl.innerHTML = Object.entries(cart).map(([id, q]) => {
      const p = PRODUCTS[id];
      return `<li class="cart-item">
        <span class="cart-item-pic"><img src="${p.img}" width="${p.w}" height="1200" alt=""></span>
        <div><p class="cart-item-name">${p.line} <span class="nowrap">${p.short}</span></p><p class="cart-item-price">${rub(p.price)}${q > 1 ? ` × ${q} = ${rub(p.price * q)}` : ''}</p></div>
        <div class="qty">
          <button type="button" data-qty="-1" data-id="${id}" aria-label="Убрать одну штуку: ${p.short}">−</button>
          <output aria-label="Количество">${q}</output>
          <button type="button" data-qty="1" data-id="${id}" aria-label="Добавить ещё одну: ${p.short}">+</button>
        </div>
      </li>`;
    }).join('');
    totalEl.textContent = rub(total);
    shipEl.textContent = total >= FREE_FROM
      ? 'Курьер по Москве и СДЭК по России: бесплатно.'
      : `До бесплатной доставки курьером и СДЭК: ${rub(FREE_FROM - total)}.`;
  }

  function addToCart(id, btn) {
    if (!PRODUCTS[id]) return;
    cart[id] = (cart[id] || 0) + 1;
    saveCart();
    renderCart(true);
    say(`${PRODUCTS[id].short} в корзине. Всего: ${cartCount()} шт. на ${rub(cartTotal())}.`);

    // короткий ответ прямо на кнопке
    if (btn && !btn.closest('[data-cart]')) {
      if (!btn.dataset.label) btn.dataset.label = btn.innerHTML;
      btn.textContent = `В${NB}корзине`;
      btn.classList.add('is-added');
      clearTimeout(btn._t);
      btn._t = setTimeout(() => { btn.innerHTML = btn.dataset.label; btn.classList.remove('is-added'); }, 1400);
    }
  }

  document.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) { addToCart(add.dataset.add, add); return; }

    const qty = e.target.closest('[data-qty]');
    if (qty) {
      const id = qty.dataset.id;
      const next = (cart[id] || 0) + Number(qty.dataset.qty);
      if (next > 0) cart[id] = next; else delete cart[id];
      saveCart();
      renderCart(false);
      const again = $(`[data-qty="${qty.dataset.qty}"][data-id="${id}"]`, listEl) || $('[data-cart-close]');
      if (again) again.focus();
      return;
    }

    if (e.target.closest('[data-cart-open]') && dlg) {
      if (burger && burger.getAttribute('aria-expanded') === 'true') setMenu(false);
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      return;
    }
    if (e.target.closest('[data-cart-close]') && dlg) dlg.close();
  });
  // клик по затемнению закрывает корзину
  if (dlg) dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  renderCart(false);

  /* ── Подбор по машине ──
     нужно = объём × (улица ? 1,5 : 1); предел ES-19 = бензин ? 8 : 7; нужно > предел → ES-29 */
  const picker = $('[data-picker]');
  if (picker) {
    const range = picker.elements.vol;
    const out = $('[data-vol-out]');
    const box = $('[data-pick-result]');
    const el = {
      name: $('[data-pick-name]'), img: $('[data-pick-img]'), price: $('[data-pick-price]'),
      why: $('[data-pick-why]'), add: $('[data-pick-add]'), link: $('[data-pick-link]')
    };
    let current = 'es19';

    const update = () => {
      const fuel = picker.elements.fuel.value;
      const street = picker.elements.park.value === 'street';
      const vol = parseFloat(range.value);
      const need = Math.round(vol * (street ? 1.5 : 1) * 100) / 100;
      const limit = fuel === 'petrol' ? 8 : 7;
      const id = need > limit ? 'es29' : 'es19';
      const p = PRODUCTS[id];

      const volText = vol.toFixed(1).replace('.', ',');
      out.textContent = volText;
      range.setAttribute('aria-valuetext', `${volText} литра`);
      range.style.setProperty('--p', ((vol - range.min) / (range.max - range.min) * 100).toFixed(2) + '%');

      const fuelName = fuel === 'petrol' ? 'Бензин' : 'Дизель';
      const fuelGen = fuel === 'petrol' ? 'бензина' : 'дизеля';
      const first = street
        ? `${fuelName} ${volText}${NB}л, зимует на${NB}улице: считаем как ${num(need)}${NB}л.`
        : `${fuelName} ${volText}${NB}л, зимует в${NB}гараже: запас не${NB}нужен.`;
      let second;
      if (id === 'es29') second = `Это больше предела ES-19 (${limit}${NB}л для${NB}${fuelGen}), нужен ES-29.`;
      else if (need <= limit * 0.75) second = `Предел ES-19 для${NB}${fuelGen} ${limit}${NB}л: хватит с${NB}запасом.`;
      else second = `Предел ES-19 для${NB}${fuelGen} ${limit}${NB}л: подходит, но запас небольшой.`;
      el.why.textContent = `${first} ${second}`;

      if (id !== current) {
        current = id;
        el.name.textContent = p.short;
        el.img.src = p.img; el.img.width = p.w; el.img.alt = p.alt;
        el.price.textContent = rub(p.price);
        el.add.dataset.add = id;
        el.link.href = p.url; el.link.textContent = `Характеристики ${p.short}`;
        if (!reduce) {
          box.classList.remove('is-swap');
          void box.offsetWidth;
          box.classList.add('is-swap');
        }
      }
    };
    picker.addEventListener('input', update);
    picker.addEventListener('change', update);
    picker.addEventListener('submit', (e) => e.preventDefault());
    update();
  }

  /* ── Сравнение: только отличия ── */
  const diff = $('[data-cmp-diff]');
  if (diff) {
    const same = $$('.cmp-table [data-same]');
    const apply = () => same.forEach((tr) => { tr.hidden = diff.checked; });
    diff.addEventListener('change', apply);
    apply();
  }

  /* ── Видео: файл не запрашивается до клика ── */
  $$('[data-video]').forEach((frame) => {
    const video = $('video', frame);
    const btn = $('.video-play', frame);
    if (!video || !btn) return;
    video.controls = false; // свои кнопки вместо панели браузера, пока ролик не запущен
    btn.addEventListener('click', () => {
      $$('[data-video] video').forEach((v) => { if (v !== video) v.pause(); });
      frame.classList.add('is-playing');
      video.controls = true;
      const run = video.play();
      if (run && run.catch) run.catch(() => {});
      video.focus();
    });
  });

  /* ── Бегущая строка: дубль для бесшовной петли ── */
  const marquee = $('[data-marquee]');
  if (marquee && !reduce) {
    const track = $('.marquee-track', marquee);
    const copy = track.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    marquee.append(copy);
    marquee.classList.add('is-running');
  }

  /* ── Редкие появления и рост столбиков: один раз ── */
  const revealables = $$('[data-reveal], [data-bars]');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.1 });
    revealables.forEach((t) => io.observe(t));
  } else {
    revealables.forEach((t) => t.classList.add('is-in'));
  }

  /* ── Форма «Поможем выбрать модель»: проверка без отправки ── */
  const ask = $('[data-ask]');
  if (ask) {
    const ok = $('[data-ask-ok]');
    const okText = $('[data-ask-ok-text]');
    const f = ask.elements;

    const digits = (v) => {
      let d = v.replace(/\D/g, '');
      if (d.length === 10) d = '7' + d;
      if (d[0] === '8') d = '7' + d.slice(1);
      return d;
    };
    const formatPhone = (v) => {
      let d = v.replace(/\D/g, '');
      if (!d) return '';
      if (d[0] === '8') d = '7' + d.slice(1);
      if (d[0] !== '7') d = '7' + d;
      d = d.slice(0, 11);
      let s = '+7';
      if (d.length > 1) s += ' (' + d.slice(1, 4);
      if (d.length >= 5) s += ') ' + d.slice(4, 7);
      if (d.length >= 8) s += '-' + d.slice(7, 9);
      if (d.length >= 10) s += '-' + d.slice(9, 11);
      return s;
    };

    const rules = {
      name: () => /[A-Za-zА-Яа-яЁё]{2,}/.test(f.name.value.trim()),
      phone: () => { const d = digits(f.phone.value); return d.length === 11 && d[0] === '7'; },
      topic: () => f.topic.value !== '',
      message: () => f.message.value.trim().length >= 5,
      agree: () => f.agree.checked
    };

    const check = (key) => {
      const row = $(`[data-field="${key}"]`, ask);
      const valid = rules[key]();
      row.classList.toggle('is-error', !valid);
      const input = f[key];
      input.setAttribute('aria-invalid', String(!valid));
      const label = $('.check', row);
      if (label) label.classList.toggle('is-error', !valid);
      return valid;
    };

    f.phone.addEventListener('input', (e) => {
      if (e.inputType && e.inputType.startsWith('delete')) return;
      f.phone.value = formatPhone(f.phone.value);
    });
    f.phone.addEventListener('blur', () => { if (f.phone.value) f.phone.value = formatPhone(f.phone.value); });

    // после первой ошибки поле перепроверяется на лету
    ['input', 'change'].forEach((type) => ask.addEventListener(type, (e) => {
      const row = e.target.closest('[data-field]');
      if (row && row.classList.contains('is-error')) check(row.dataset.field);
    }));

    ask.addEventListener('submit', (e) => {
      e.preventDefault();
      const bad = Object.keys(rules).filter((key) => !check(key));
      if (bad.length) {
        f[bad[0]].focus();
        say(`Проверьте форму: ${bad.length} ${plural(bad.length, ['поле', 'поля', 'полей'])} с ошибкой.`);
        return;
      }
      const name = f.name.value.trim().replace(/\s+/g, ' ');
      okText.textContent = `${name}, ответим по${NB}номеру ${formatPhone(f.phone.value)} или в${NB}Telegram. Тема: «${f.topic.value}».`;
      ask.hidden = true;
      ok.hidden = false;
      ok.focus();
    });

    $('[data-ask-again]').addEventListener('click', () => {
      ask.reset();
      $$('[aria-invalid]', ask).forEach((i) => i.removeAttribute('aria-invalid'));
      ok.hidden = true;
      ask.hidden = false;
      f.message.focus();
    });
  }
})();
