/* JOIM · вариант A «Техпаспорт». Ванильный JS, без зависимостей. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const IMG = 'https://joim.netlify.app/images/products/';

  const PRODUCTS = {
    es19: { name: 'Easy Start ES-19', short: 'ES-19', price: 5837, url: '/product/joim-easy-start-es19', img: IMG + 'joim-es19-card.webp' },
    es29: { name: 'Easy Start ES-29', short: 'ES-29', price: 7604, url: '/product/joim-easy-start-es29', img: IMG + 'joim-es29-card.webp' },
    pvc1: { name: 'Автопылесос PVC-1', short: 'PVC-1', price: 7281, url: '/product/joim-pvc1', img: IMG + 'joim-pvc1-card.webp' }
  };

  const NBSP = ' ';
  const money = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const plural = (n, forms) => {
    const a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return forms[0];
    if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return forms[1];
    return forms[2];
  };

  /* ---------- Чертёж: линии рисуются один раз после загрузки ---------- */
  const drawing = $('[data-drawing]');
  if (drawing) requestAnimationFrame(() => requestAnimationFrame(() => drawing.classList.add('is-drawn')));

  /* ---------- Шапка: после первого экрана вместо телефона кнопка покупки ---------- */
  const hdr = $('.hdr');
  const heroSpec = $('[data-hero-spec]');
  if (hdr && heroSpec) {
    let queued = false;
    const sync = () => {
      queued = false;
      hdr.classList.toggle('is-past', heroSpec.getBoundingClientRect().bottom < hdr.offsetHeight);
    };
    window.addEventListener('scroll', () => {
      if (!queued) { queued = true; requestAnimationFrame(sync); }
    }, { passive: true });
    sync();
  }

  /* ---------- Появления: маркер и диаграммы, один раз ---------- */
  const revealTargets = $$('.mk, [data-reveal]');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { threshold: 0.3, rootMargin: '0px 0px -6% 0px' });
    revealTargets.forEach(el => io.observe(el));
  } else {
    revealTargets.forEach(el => el.classList.add('is-in'));
  }

  /* ---------- Корзина ---------- */
  const cart = { items: {}, count: 0, sum: 0 };
  const cartEl = $('[data-cart]');
  const cartCount = $('[data-cart-count]');
  const live = $('[data-live]');

  function addToCart(id, btn) {
    const p = PRODUCTS[id];
    if (!p) return;
    cart.items[id] = (cart.items[id] || 0) + 1;
    cart.count += 1;
    cart.sum += p.price;

    const goods = `${cart.count}${NBSP}${plural(cart.count, ['товар', 'товара', 'товаров'])}`;
    if (cartCount) {
      cartCount.textContent = cart.count;
      cartCount.classList.remove('is-bump');
      void cartCount.offsetWidth;          // перезапуск анимации счётчика
      cartCount.classList.add('is-bump');
    }
    if (cartEl) {
      cartEl.classList.add('has-items');
      cartEl.setAttribute('aria-label', `Корзина: ${goods} на ${money(cart.sum)} ₽`);
      cartEl.title = `${goods} на ${money(cart.sum)}${NBSP}₽`;
    }
    if (live) live.textContent = `${p.name} в корзине. Всего ${goods} на ${money(cart.sum)} рублей.`;

    if (btn) {
      if (!btn.dataset.label) {
        btn.dataset.label = btn.innerHTML;
        btn.style.minWidth = btn.offsetWidth + 'px';
      }
      btn.classList.add('is-added');
      btn.textContent = cart.items[id] > 1 ? `В корзине: ${cart.items[id]}` : 'Добавлено';
      clearTimeout(btn._t);
      btn._t = setTimeout(() => {
        btn.classList.remove('is-added');
        btn.innerHTML = btn.dataset.label;
      }, 1500);
    }
  }

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-add]');
    if (!btn) return;
    e.preventDefault();
    addToCart(btn.dataset.add, btn);
  });

  /* ---------- Подбор по мотору ----------
     нужно = объём × (улица ? 1,5 : 1); предел ES-19 = бензин ? 8 : 7; нужно > предел → ES-29 */
  const pb = $('[data-podbor]');
  if (pb) {
    const SCALE_MAX = 12;
    const vol = $('#pb-vol', pb);
    const scale = $('[data-pb-scale]', pb);
    const res = $('.res', pb);
    const el = {
      vol: $('[data-pb-vol]', pb), formula: $('[data-pb-formula]', pb), need: $('[data-pb-need]', pb),
      lim: $('[data-pb-lim]', pb), limRun: $('[data-pb-limrun]', pb), markRun: $('[data-pb-markrun]', pb),
      model: $('[data-pb-model]', pb), price: $('[data-pb-price]', pb), why: $('[data-pb-why]', pb),
      add: $('[data-pb-add]', pb), link: $('[data-pb-link]', pb), img: $('[data-pb-img]', pb)
    };
    const l1 = v => v.toFixed(1).replace('.', ',');
    const lNeed = v => {
      const r = Math.round(v * 100) / 100;
      return (Number.isInteger(r * 10) ? r.toFixed(1) : r.toFixed(2)).replace('.', ',');
    };
    let shown = 'es19';

    function update() {
      const fuel = pb.elements.fuel.value;
      const street = pb.elements.winter.value === 'street';
      const v = parseFloat(vol.value);
      const k = street ? 1.5 : 1;
      const need = Math.round(v * k * 100) / 100;
      const limit = fuel === 'petrol' ? 8 : 7;
      const id = need > limit ? 'es29' : 'es19';
      const p = PRODUCTS[id];
      const fuelName = fuel === 'petrol' ? 'Бензин' : 'Дизель';
      const fuelGen = fuel === 'petrol' ? 'бензина' : 'дизеля';

      el.vol.textContent = `${l1(v)}${NBSP}л`;
      vol.setAttribute('aria-valuetext', `${l1(v)} литра`);
      el.formula.textContent = `${l1(v)}${NBSP}л × ${street ? '1,5' : '1'} = ${lNeed(need)}${NBSP}л`;
      el.need.textContent = `${lNeed(need)}${NBSP}л`;
      el.lim.textContent = `${limit}${NBSP}л`;

      scale.style.setProperty('--lim', limit / SCALE_MAX);
      el.limRun.style.setProperty('--x', (limit / SCALE_MAX * 100) + '%');
      const pos = Math.min(need, SCALE_MAX) / SCALE_MAX;
      el.markRun.style.setProperty('--x', (pos * 100) + '%');
      scale.classList.toggle('is-flip', pos > 0.8);

      const head = street
        ? `${fuelName} ${l1(v)}${NBSP}л, зимует на${NBSP}улице: считаем как ${lNeed(need)}${NBSP}л.`
        : `${fuelName} ${l1(v)}${NBSP}л, зимует в${NBSP}гараже: считаем как есть, ${lNeed(need)}${NBSP}л.`;
      let tail;
      if (id === 'es29') tail = `Это выше предела ES-19 для ${fuelGen} (${limit}${NBSP}л), нужен ES-29.`;
      else if (need <= limit * 0.75) tail = `Предел ES-19 для ${fuelGen} ${limit}${NBSP}л, хватит с${NBSP}запасом.`;
      else tail = `ES-19 хватит, но до${NBSP}предела ${limit}${NBSP}л запас небольшой.`;
      el.why.textContent = `${head} ${tail}`;

      el.model.innerHTML = `Easy Start <span class="nb">${p.short}</span>`;
      el.price.textContent = money(p.price);
      el.add.dataset.add = id;
      el.link.href = p.url;
      el.link.textContent = `Характеристики ${p.short}`;

      if (id !== shown) {
        shown = id;
        res.classList.add('is-swap');
        setTimeout(() => {
          el.img.src = p.img;
          el.img.alt = p.name;
          res.classList.remove('is-swap');
        }, 180);
      }
    }

    pb.addEventListener('input', update);
    pb.addEventListener('change', update);
    update();
  }

  /* ---------- Взрыв-схема: строка таблицы подсвечивает позицию ---------- */
  $$('[data-node]').forEach(row => {
    const pin = $(`[data-pin="${row.dataset.node}"]`);
    if (!pin) return;
    const set = on => { row.classList.toggle('is-hot', on); pin.classList.toggle('is-hot', on); };
    [row, pin].forEach(t => {
      t.addEventListener('mouseenter', () => set(true));
      t.addEventListener('mouseleave', () => set(false));
    });
  });

  /* ---------- Видео: грузится только по клику ---------- */
  $$('[data-player]').forEach(player => {
    const video = $('video', player);
    const btn = $('.player__btn', player);
    if (!video || !btn) return;
    btn.addEventListener('click', () => {
      player.classList.add('is-on');
      video.controls = true;
      const run = video.play();
      if (run && run.catch) run.catch(() => {});
      video.focus();
    });
  });

  /* ---------- Форма: проверка без отправки ---------- */
  const form = $('[data-form]');
  if (form) {
    const okBox = $('[data-form-ok]', form);
    const okText = $('[data-form-ok-text]', form);
    const rules = {
      name: f => f.value.trim().length >= 2 ? '' : 'Напишите имя, хотя бы две буквы',
      tel: f => {
        const d = f.value.replace(/\D/g, '');
        return d.length === 11 ? '' : 'Нужен номер из 11 цифр, начиная с +7';
      },
      topic: f => f.value ? '' : 'Выберите тему: так вопрос сразу попадёт к нужному человеку',
      ok: f => f.checked ? '' : 'Без согласия не сможем вам ответить'
    };

    function check(f) {
      const rule = rules[f.name];
      if (!rule) return true;
      const msg = rule(f);
      const wrap = f.closest('.field');
      const err = wrap && $('.field__err', wrap);
      if (wrap) wrap.classList.toggle('is-err', !!msg);
      if (msg) f.setAttribute('aria-invalid', 'true'); else f.removeAttribute('aria-invalid');
      if (err) { err.textContent = msg; err.hidden = !msg; }
      return !msg;
    }

    function phoneMask(v) {
      let d = v.replace(/\D/g, '');
      if (!d) return '';
      if (d[0] === '8') d = '7' + d.slice(1);
      if (d[0] !== '7') d = '7' + d;
      d = d.slice(0, 11);
      let out = '+7';
      if (d.length > 1) out += ' ' + d.slice(1, 4);
      if (d.length > 4) out += ' ' + d.slice(4, 7);
      if (d.length > 7) out += '-' + d.slice(7, 9);
      if (d.length > 9) out += '-' + d.slice(9, 11);
      return out;
    }

    form.addEventListener('input', e => {
      const f = e.target;
      if (f.name === 'tel' && !(e.inputType || '').startsWith('delete')) f.value = phoneMask(f.value);
      const wrap = f.closest('.field');
      if (wrap && wrap.classList.contains('is-err')) check(f);
    });
    form.addEventListener('change', e => { if (rules[e.target.name]) check(e.target); });
    form.addEventListener('focusout', e => {
      const f = e.target;
      if (rules[f.name] && f.type !== 'checkbox' && f.value) check(f);
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      const fields = Object.keys(rules).map(n => form.elements[n]);
      const bad = fields.filter(f => !check(f));
      if (bad.length) { bad[0].focus(); return; }
      const name = form.elements.name.value.trim();
      okText.textContent = `${name}, свяжемся по${NBSP}номеру ${form.elements.tel.value}. Тема: «${form.elements.topic.value}». В${NBSP}прототипе данные никуда не${NBSP}отправляются.`;
      form.classList.add('is-sent');
      okBox.hidden = false;
      okBox.focus();
    });

    $('[data-form-again]', form).addEventListener('click', () => {
      form.reset();
      form.classList.remove('is-sent');
      okBox.hidden = true;
      form.elements.name.focus();
    });
  }

  /* ---------- Мобильное меню ---------- */
  const burger = $('.burger');
  const mnav = $('#mnav');
  const main = $('main');
  const mbar = $('[data-mbar]');
  let navTimer;

  function setNav(open) {
    if (!burger || !mnav) return;
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    clearTimeout(navTimer);
    if (open) {
      mnav.hidden = false;
      mnav.scrollTop = 0;
      requestAnimationFrame(() => mnav.classList.add('is-open'));
    } else {
      mnav.classList.remove('is-open');
      navTimer = setTimeout(() => { mnav.hidden = true; }, 320);
    }
    document.body.style.overflow = open ? 'hidden' : '';
    if (main) main.inert = open;
    if (mbar) mbar.classList.toggle('is-off', open || mbarHidden);
  }
  if (burger && mnav) {
    burger.addEventListener('click', () => setNav(burger.getAttribute('aria-expanded') !== 'true'));
    mnav.addEventListener('click', e => { if (e.target.closest('a')) setNav(false); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') { setNav(false); burger.focus(); }
    });
    matchMedia('(min-width: 1240px)').addEventListener('change', e => { if (e.matches) setNav(false); });
  }

  /* ---------- Панель покупки на телефоне: прячется у формы и футера ---------- */
  let mbarHidden = false;
  if (mbar && 'IntersectionObserver' in window) {
    const seen = new Set();
    const io2 = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) seen.add(en.target); else seen.delete(en.target); });
      mbarHidden = seen.size > 0;
      mbar.classList.toggle('is-off', mbarHidden || (burger && burger.getAttribute('aria-expanded') === 'true'));
    }, { threshold: 0.05 });
    $$('.ask, .ftr').forEach(s => io2.observe(s));
  }
})();
